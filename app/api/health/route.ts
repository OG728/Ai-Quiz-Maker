import { NextResponse } from "next/server"
import { OLLAMA_BASE_URL } from "@/lib/quiz-engine"

export const runtime = "nodejs"

export async function GET() {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`)
    if (!response.ok) {
      return NextResponse.json({ ok: false, ollama: "unreachable" })
    }

    const data = await response.json()
    return NextResponse.json({ ok: true, ollama: "ready", models: data.models || [] })
  } catch (_error) {
    return NextResponse.json({ ok: false, ollama: "unreachable" })
  }
}
