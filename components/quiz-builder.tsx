"use client"

import { useMemo, useState } from "react"

interface QuizQuestion {
  id: string
  topic: string
  prompt: string
  answerGuide: string
  keywords: string[]
  attemptsAllowed: number
  attemptsLeft: number
  solved: boolean
  failed: boolean
  userAnswer: string
}

type MistakeMap = Record<string, { topic: string; count: number }>

function messageForNetwork(prefix: string, error: unknown) {
  const text = error instanceof Error ? error.message : "Unknown error"
  if (text.toLowerCase().includes("failed to fetch")) {
    return `${prefix}: Could not reach local API. Make sure Ollama is running and reload.`
  }
  return `${prefix}: ${text}`
}

export function QuizBuilder() {
  const [files, setFiles] = useState<File[]>([])
  const [manualTopics, setManualTopics] = useState("")
  const [model, setModel] = useState("llama3.1:8b")
  const [questionCount, setQuestionCount] = useState(10)
  const [attemptsAllowed, setAttemptsAllowed] = useState(3)

  const [questions, setQuestions] = useState<QuizQuestion[]>([])
  const [mistakes, setMistakes] = useState<MistakeMap>({})
  const [currentIndex, setCurrentIndex] = useState(-1)
  const [answer, setAnswer] = useState("")
  const [setupMessage, setSetupMessage] = useState("")
  const [feedback, setFeedback] = useState("")
  const [busy, setBusy] = useState(false)

  const completed = useMemo(
    () => questions.filter((question) => question.solved || question.failed).length,
    [questions],
  )

  const current = currentIndex >= 0 && currentIndex < questions.length ? questions[currentIndex] : null

  const setFeedbackState = (text: string) => {
    setFeedback(text)
  }

  const moveToNextOpen = () => {
    if (questions.length === 0) {
      setFeedbackState("Generate a quiz first.")
      return
    }

    const start = currentIndex >= 0 ? currentIndex + 1 : 0
    let next = questions.findIndex((question, index) => index >= start && !question.solved && !question.failed)
    if (next === -1) {
      next = questions.findIndex((question) => !question.solved && !question.failed)
    }

    if (next === -1) {
      setCurrentIndex(-1)
      setFeedbackState("")
      return
    }

    setCurrentIndex(next)
    setAnswer("")
    setFeedbackState("")
  }

  const createQuiz = async () => {
    if (files.length === 0 && !manualTopics.trim()) {
      setSetupMessage("Add at least one file or manual topic first.")
      return
    }

    setBusy(true)
    setSetupMessage("Generating quiz with local model...")
    setFeedbackState("")

    try {
      const data = new FormData()
      files.forEach((file) => data.append("files", file))
      data.append("manualTopics", manualTopics)
      data.append("questionCount", String(Math.max(3, Math.min(50, questionCount))))
      data.append("attemptsAllowed", String(Math.max(1, Math.min(5, attemptsAllowed))))
      data.append("model", model.trim() || "llama3.1:8b")

      const response = await fetch("/api/generate-quiz", {
        method: "POST",
        body: data,
      })

      if (!response.ok) {
        throw new Error(`Request failed (${response.status})`)
      }

      const payload = await response.json()
      const nextQuestions = (payload.questions || []) as QuizQuestion[]

      if (!Array.isArray(nextQuestions) || nextQuestions.length === 0) {
        throw new Error("No questions returned")
      }

      setQuestions(nextQuestions)
      setMistakes({})
      setCurrentIndex(0)
      setAnswer("")
      setSetupMessage(`Generated ${nextQuestions.length} question(s) with ${payload.modelUsed}.`)
    } catch (error) {
      setSetupMessage(messageForNetwork("Failed to generate quiz", error))
    } finally {
      setBusy(false)
    }
  }

  const gradeAnswer = async () => {
    if (!current) {
      setFeedbackState("Generate a quiz first.")
      return
    }
    if (!answer.trim()) {
      setFeedbackState("Enter an answer first.")
      return
    }

    setBusy(true)
    setFeedbackState("Checking answer...")

    try {
      const response = await fetch("/api/grade-answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: model.trim() || "llama3.1:8b",
          question: current,
          answer,
        }),
      })

      if (!response.ok) {
        throw new Error(`Request failed (${response.status})`)
      }

      const result = await response.json()

      setQuestions((prev) => {
        const clone = [...prev]
        const target = { ...clone[currentIndex] }

        if (result.correct) {
          target.solved = true
          target.userAnswer = answer
          clone[currentIndex] = target
          setFeedbackState(result.feedback || "Correct.")
          return clone
        }

        target.attemptsLeft -= 1
        target.userAnswer = answer

        if (target.attemptsLeft <= 0) {
          target.failed = true
          setMistakes((prevMistakes) => {
            const next = { ...prevMistakes }
            if (!next[target.topic]) {
              next[target.topic] = { topic: target.topic, count: 0 }
            }
            next[target.topic].count += 1
            return next
          })
          setFeedbackState(result.feedback || "Out of chances. Added to missed topics.")
        } else {
          setFeedbackState(result.feedback || "Not correct yet. Try again.")
        }

        clone[currentIndex] = target
        return clone
      })
    } catch (error) {
      setFeedbackState(messageForNetwork("Grading failed", error))
    } finally {
      setBusy(false)
    }
  }

  const addMoreFromTopic = async (topic: string) => {
    setBusy(true)
    setFeedbackState(`Generating more questions for ${topic}...`)

    try {
      const data = new FormData()
      data.append("manualTopics", topic)
      data.append("questionCount", "3")
      data.append("attemptsAllowed", String(Math.max(1, Math.min(5, attemptsAllowed))))
      data.append("model", model.trim() || "llama3.1:8b")

      const response = await fetch("/api/generate-quiz", {
        method: "POST",
        body: data,
      })
      if (!response.ok) {
        throw new Error(`Request failed (${response.status})`)
      }

      const payload = await response.json()
      const more = (payload.questions || []) as QuizQuestion[]
      setQuestions((prev) => [...prev, ...more])
      setFeedbackState(`Added ${more.length} question(s) for ${topic}.`)
      if (currentIndex === -1) {
        setCurrentIndex(0)
      }
    } catch (error) {
      setFeedbackState(messageForNetwork("Could not generate more questions", error))
    } finally {
      setBusy(false)
    }
  }

  const fileNames = files.map((file) => `${file.name} (${Math.max(1, Math.round(file.size / 1024))} KB)`)
  const mistakeEntries = Object.values(mistakes)

  return (
    <main className="min-h-screen bg-slate-950 px-6 pb-24 pt-28 text-slate-100 md:px-12">
      <div className="mx-auto grid max-w-6xl gap-4 lg:grid-cols-[1.5fr_1fr]">
        <section className="space-y-4">
          <article className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            <h1 className="text-xl font-bold">Create Quiz</h1>
            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-sm font-semibold">PDF and Image Files</label>
                <input
                  type="file"
                  multiple
                  accept=".pdf,image/*"
                  onChange={(event) => setFiles(Array.from(event.target.files || []))}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 p-2 text-sm"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-semibold">Extra Topics (optional)</label>
                <input
                  value={manualTopics}
                  onChange={(event) => setManualTopics(event.target.value)}
                  placeholder="algebra, osmosis, history"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 p-2 text-sm"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-semibold">Ollama Model</label>
                <input
                  value={model}
                  onChange={(event) => setModel(event.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 p-2 text-sm"
                />
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-semibold">Questions</label>
                  <input
                    type="number"
                    min={3}
                    max={50}
                    value={questionCount}
                    onChange={(event) => setQuestionCount(Number(event.target.value) || 10)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 p-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-semibold">Chances Per Question</label>
                  <input
                    type="number"
                    min={1}
                    max={5}
                    value={attemptsAllowed}
                    onChange={(event) => setAttemptsAllowed(Number(event.target.value) || 3)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 p-2 text-sm"
                  />
                </div>
              </div>

              <button
                onClick={createQuiz}
                disabled={busy}
                className="rounded-full bg-sky-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-sky-400 disabled:opacity-60"
              >
                Generate Quiz
              </button>

              <p className="text-sm text-slate-300">{setupMessage}</p>
            </div>
          </article>

          <article className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold">Current Question</h2>
              <span className="rounded-full bg-slate-800 px-3 py-1 text-xs font-semibold">
                {completed} / {questions.length}
              </span>
            </div>

            {current ? (
              <>
                <p className="mt-2 text-sm font-semibold text-sky-300">Topic: {current.topic}</p>
                <p className="mt-2 text-base">{current.prompt}</p>
                <p className="mt-2 text-sm text-slate-400">
                  Chances left: {current.attemptsLeft} / {current.attemptsAllowed}
                </p>
              </>
            ) : (
              <p className="mt-3 text-sm text-slate-300">
                {questions.length === 0 ? "Generate a quiz to begin." : "Quiz complete. Generate more from missed topics."}
              </p>
            )}

            <label className="mb-1 mt-4 block text-sm font-semibold">Your Answer</label>
            <textarea
              rows={5}
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm"
              placeholder="Type your answer..."
            />

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={gradeAnswer}
                disabled={busy || !current}
                className="rounded-full bg-sky-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-sky-400 disabled:opacity-60"
              >
                Check Answer
              </button>
              <button
                onClick={moveToNextOpen}
                disabled={busy || questions.length === 0}
                className="rounded-full border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-slate-800 disabled:opacity-60"
              >
                Next Question
              </button>
            </div>
            <p className="mt-3 text-sm text-slate-300">{feedback}</p>
          </article>
        </section>

        <aside className="space-y-4">
          <article className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            <h2 className="text-lg font-bold">Uploaded Files</h2>
            {fileNames.length === 0 ? (
              <p className="mt-2 text-sm text-slate-400">No files selected yet.</p>
            ) : (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-300">
                {fileNames.map((name) => (
                  <li key={name}>{name}</li>
                ))}
              </ul>
            )}
          </article>

          <article className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold">Missed Topics</h2>
              <span className="rounded-full bg-slate-800 px-3 py-1 text-xs font-semibold">
                {mistakeEntries.length}
              </span>
            </div>

            {mistakeEntries.length === 0 ? (
              <p className="mt-2 text-sm text-slate-400">No missed topics yet.</p>
            ) : (
              <div className="mt-3 space-y-2">
                {mistakeEntries.map((entry) => (
                  <div key={entry.topic} className="rounded-xl border border-slate-700 bg-slate-950 p-3">
                    <p className="text-sm font-semibold">{entry.topic}</p>
                    <p className="text-xs text-slate-400">Missed {entry.count} question(s).</p>
                    <button
                      onClick={() => addMoreFromTopic(entry.topic)}
                      disabled={busy}
                      className="mt-2 rounded-full border border-slate-600 px-3 py-1 text-xs font-semibold text-slate-200 transition hover:bg-slate-800 disabled:opacity-60"
                    >
                      Generate 3 More
                    </button>
                  </div>
                ))}
              </div>
            )}
          </article>
        </aside>
      </div>
    </main>
  )
}
