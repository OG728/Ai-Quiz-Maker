import { NextResponse } from "next/server"
import { DEFAULT_MODEL, QuizQuestion, fallbackGrade, gradeWithOllama } from "@/lib/quiz-engine"

export const runtime = "nodejs"

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      model?: string
      question?: Partial<QuizQuestion>
      answer?: string
    }

    const model = String(body.model || DEFAULT_MODEL).trim()
    const question = body.question || {}
    const answer = String(body.answer || "").trim()

    if (!question.prompt) {
      return NextResponse.json({ error: "Missing question payload." }, { status: 400 })
    }

    if (!answer) {
      return NextResponse.json({ correct: false, feedback: "Please enter an answer." })
    }

    try {
      const result = await gradeWithOllama({ model, question, answer })
      return NextResponse.json(result)
    } catch (_error) {
      const result = fallbackGrade(question, answer)
      return NextResponse.json(result)
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to grade answer." },
      { status: 500 },
    )
  }
}
