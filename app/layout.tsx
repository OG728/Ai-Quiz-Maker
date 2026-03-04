import "./globals.css"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "AI Quiz Maker",
  description: "Intro and quick-start page for the local Ollama quiz app",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
