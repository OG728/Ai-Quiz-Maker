import pdfParse from "pdf-parse"

export const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434"
export const DEFAULT_MODEL = process.env.OLLAMA_MODEL || "llama3.1:8b"

export interface QuizQuestion {
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

export interface UploadInput {
  name: string
  type: string
  buffer: Buffer
}

function normalize(text: string) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function safeJsonParse(raw: string) {
  if (!raw || typeof raw !== "string") {
    return null
  }

  try {
    return JSON.parse(raw)
  } catch (_error) {
    const firstBrace = raw.indexOf("{")
    const lastBrace = raw.lastIndexOf("}")
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      try {
        return JSON.parse(raw.slice(firstBrace, lastBrace + 1))
      } catch (__error) {
        return null
      }
    }
    return null
  }
}

function extractTopicsFromFileNames(files: UploadInput[]) {
  const ignored = new Set(["final", "copy", "notes", "scan", "image", "photo"])
  const words: string[] = []

  files.forEach((file) => {
    const base = file.name.replace(/\.[^.]+$/, "")
    base
      .split(/[^a-zA-Z0-9]+/)
      .map((part) => part.trim().toLowerCase())
      .filter((part) => part.length >= 3 && !ignored.has(part))
      .forEach((part) => words.push(part))
  })

  return [...new Set(words)].map((w) => w.charAt(0).toUpperCase() + w.slice(1))
}

export function parseManualTopics(input: string) {
  return String(input || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
}

function makeQuestion(topic: string, prompt: string, answerGuide: string, keywords: string[], attemptsAllowed: number, index: number): QuizQuestion {
  return {
    id: `${Date.now()}-${index}-${Math.random().toString(16).slice(2)}`,
    topic,
    prompt,
    answerGuide,
    keywords,
    attemptsAllowed,
    attemptsLeft: attemptsAllowed,
    solved: false,
    failed: false,
    userAnswer: "",
  }
}

export function buildFallbackQuestions({
  topics,
  questionCount,
  attemptsAllowed,
}: {
  topics: string[]
  questionCount: number
  attemptsAllowed: number
}) {
  const defaults = [
    "Explain the core idea of {topic} in your own words.",
    "What are the most important facts about {topic}?",
    "Give one real-world example related to {topic}.",
    "How would you teach {topic} to someone new?",
    "What mistakes should students avoid with {topic}?",
  ]

  const safeTopics = topics.length > 0 ? topics : ["General Study Topic"]
  const questions: QuizQuestion[] = []

  for (let i = 0; i < questionCount; i += 1) {
    const topic = safeTopics[i % safeTopics.length]
    questions.push(
      makeQuestion(
        topic,
        defaults[i % defaults.length].replace("{topic}", topic),
        `A correct answer should clearly explain ${topic} with relevant detail.`,
        normalize(topic).split(" ").filter((w) => w.length > 2),
        attemptsAllowed,
        i,
      ),
    )
  }

  return questions
}

async function callOllama({
  model,
  system,
  prompt,
  images,
}: {
  model: string
  system: string
  prompt: string
  images?: string[]
}) {
  const body = {
    model,
    stream: false,
    format: "json",
    messages: [{ role: "system", content: system }, { role: "user", content: prompt, images }],
  }

  const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    throw new Error(`Ollama request failed (${response.status})`)
  }

  const data = await response.json()
  return (data?.message?.content as string) || ""
}

async function summarizeImageWithOllama(model: string, buffer: Buffer, fileName: string) {
  try {
    const base64 = buffer.toString("base64")
    const system = "You extract concise study notes from images. Return JSON only."
    const prompt = `File name: ${fileName}. Return JSON with keys: topic (string), summary (string).`
    const raw = await callOllama({ model, system, prompt, images: [base64] })
    const parsed = safeJsonParse(raw)

    if (parsed && typeof parsed.summary === "string") {
      return {
        topic: String(parsed.topic || "Image Topic").trim(),
        summary: parsed.summary.trim(),
      }
    }
  } catch (_error) {
    return null
  }
  return null
}

export async function extractFileContext(files: UploadInput[], model: string) {
  const snippets: string[] = []
  const topicsFromFiles = extractTopicsFromFileNames(files)

  for (const file of files) {
    const lowerName = file.name.toLowerCase()
    const mime = (file.type || "").toLowerCase()

    if (mime.includes("pdf") || lowerName.endsWith(".pdf")) {
      try {
        const parsed = await pdfParse(file.buffer)
        const text = String(parsed.text || "").replace(/\s+/g, " ").trim()
        if (text) {
          snippets.push(`PDF ${file.name}: ${text.slice(0, 2500)}`)
        }
      } catch (_error) {
        snippets.push(`PDF ${file.name}: Could not parse text.`)
      }
      continue
    }

    if (mime.startsWith("image/") || /\.(png|jpg|jpeg|webp|gif|bmp)$/i.test(lowerName)) {
      const imageSummary = await summarizeImageWithOllama(model, file.buffer, file.name)
      if (imageSummary) {
        snippets.push(`Image ${file.name}: ${imageSummary.summary}`)
        if (imageSummary.topic) {
          topicsFromFiles.push(imageSummary.topic)
        }
      } else {
        snippets.push(`Image ${file.name}: No image summary available.`)
      }
    }
  }

  return {
    snippets,
    topicsFromFiles: [...new Set(topicsFromFiles.map((t) => t.trim()).filter(Boolean))],
  }
}

export async function generateQuizWithOllama({
  model,
  topics,
  sourceSnippets,
  questionCount,
  attemptsAllowed,
}: {
  model: string
  topics: string[]
  sourceSnippets: string[]
  questionCount: number
  attemptsAllowed: number
}) {
  const safeTopics = topics.length > 0 ? topics : ["General Study Topic"]
  const sourceText = sourceSnippets.join("\n\n").slice(0, 12000)
  const system = "You create study quiz questions. Return strict JSON only, no markdown, no prose."

  const prompt = [
    `Create ${questionCount} short-answer study questions.`,
    "Use provided topics and source content.",
    `Topics: ${safeTopics.join(", ")}`,
    `Source content:\n${sourceText || "No source text provided."}`,
    "Return JSON object with key 'questions' where value is an array.",
    "Each question item must include keys: topic, prompt, answerGuide, keywords.",
    "keywords must be an array of short strings.",
  ].join("\n\n")

  const raw = await callOllama({ model, system, prompt })
  const parsed = safeJsonParse(raw)

  if (!parsed || !Array.isArray(parsed.questions) || parsed.questions.length === 0) {
    throw new Error("Model did not return valid questions JSON.")
  }

  const questions = parsed.questions.slice(0, questionCount).map((item: Record<string, unknown>, index: number) => {
    const topic = String(item.topic || safeTopics[index % safeTopics.length] || "General Topic").trim()
    const promptText = String(item.prompt || `Explain ${topic} in your own words.`).trim()
    const answerGuide = String(item.answerGuide || `Explain ${topic} accurately.`).trim()
    const keywords = Array.isArray(item.keywords)
      ? item.keywords.map((k) => String(k).trim()).filter(Boolean).slice(0, 10)
      : normalize(topic).split(" ").filter((w) => w.length > 2)

    return makeQuestion(topic, promptText, answerGuide, keywords, attemptsAllowed, index)
  })

  if (questions.length < questionCount) {
    const fallback = buildFallbackQuestions({
      topics: safeTopics,
      questionCount: questionCount - questions.length,
      attemptsAllowed,
    })
    questions.push(...fallback)
  }

  return questions
}

export async function gradeWithOllama({
  model,
  question,
  answer,
}: {
  model: string
  question: Partial<QuizQuestion>
  answer: string
}) {
  const system =
    "You grade short-answer responses. Return strict JSON only with keys: correct (boolean), feedback (string)."

  const prompt = [
    `Question topic: ${question.topic}`,
    `Question: ${question.prompt}`,
    `Expected guide: ${question.answerGuide || "N/A"}`,
    `Keywords: ${(question.keywords || []).join(", ")}`,
    `Student answer: ${answer}`,
    "Mark correct only if answer addresses the question clearly and accurately.",
  ].join("\n\n")

  const raw = await callOllama({ model, system, prompt })
  const parsed = safeJsonParse(raw)

  if (!parsed || typeof parsed.correct !== "boolean") {
    throw new Error("Model returned invalid grading format.")
  }

  return {
    correct: parsed.correct as boolean,
    feedback: String(parsed.feedback || "No feedback provided.").trim(),
  }
}

export function fallbackGrade(question: Partial<QuizQuestion>, answer: string) {
  const normalizedAnswer = normalize(answer)
  if (normalizedAnswer.length < 12) {
    return { correct: false, feedback: "Answer is too short. Add more detail." }
  }

  const keywords = Array.isArray(question.keywords)
    ? question.keywords.map((k) => normalize(k)).filter(Boolean)
    : []

  const hitCount = keywords.filter((k) => normalizedAnswer.includes(k)).length
  if (hitCount >= Math.min(2, keywords.length || 1)) {
    return { correct: true, feedback: "Correct based on key concepts in your answer." }
  }

  return {
    correct: false,
    feedback: "Not correct yet. Include more topic-specific details and key terms.",
  }
}
