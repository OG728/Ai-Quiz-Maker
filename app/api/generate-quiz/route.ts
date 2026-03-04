import { NextResponse } from "next/server"
import {
  DEFAULT_MODEL,
  UploadInput,
  buildFallbackQuestions,
  extractFileContext,
  generateQuizWithOllama,
  parseManualTopics,
} from "@/lib/quiz-engine"

export const runtime = "nodejs"

export async function POST(req: Request) {
  try {
    const formData = await req.formData()

    const questionCount = Math.max(3, Math.min(50, Number(formData.get("questionCount")) || 10))
    const attemptsAllowed = Math.max(1, Math.min(5, Number(formData.get("attemptsAllowed")) || 3))
    const model = String(formData.get("model") || DEFAULT_MODEL).trim()
    const manualTopics = parseManualTopics(String(formData.get("manualTopics") || ""))

    const rawFiles = formData.getAll("files")
    const files: UploadInput[] = []

    for (const entry of rawFiles) {
      if (entry instanceof File) {
        const buffer = Buffer.from(await entry.arrayBuffer())
        files.push({ name: entry.name, type: entry.type, buffer })
      }
    }

    const context = await extractFileContext(files, model)
    const topics = [...new Set([...manualTopics, ...context.topicsFromFiles])]

    if (topics.length === 0 && context.snippets.length === 0) {
      return NextResponse.json({ error: "Provide at least one file or manual topic." }, { status: 400 })
    }

    let questions
    try {
      questions = await generateQuizWithOllama({
        model,
        topics,
        sourceSnippets: context.snippets,
        questionCount,
        attemptsAllowed,
      })
    } catch (_error) {
      questions = buildFallbackQuestions({ topics, questionCount, attemptsAllowed })
    }

    return NextResponse.json({ modelUsed: model, questions })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate quiz." },
      { status: 500 },
    )
  }
}
