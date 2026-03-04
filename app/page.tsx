import Link from "next/link"
import { Brain, FileCheck2, Image as ImageIcon, Rocket } from "lucide-react"
import { NavBarDemo } from "@/components/demo"

const cards = [
  {
    title: "Upload PDFs",
    text: "Drop lecture notes or study guides and let your local model generate questions.",
    icon: FileCheck2,
  },
  {
    title: "Add Images",
    text: "Use screenshots, diagrams, or whiteboard photos to create targeted practice.",
    icon: ImageIcon,
  },
  {
    title: "AI Grading",
    text: "Answer short-response questions and receive feedback with limited attempts.",
    icon: Brain,
  },
]

export default function Page() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <NavBarDemo />

      <section id="intro" className="relative overflow-hidden px-6 pt-28 pb-16 md:px-12 lg:px-20">
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1800&q=80')] bg-cover bg-center opacity-20" />
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950/30 via-slate-950/70 to-slate-950" />

        <div className="relative mx-auto max-w-5xl">
          <p className="inline-flex rounded-full border border-sky-400/40 bg-sky-500/10 px-3 py-1 text-xs font-semibold text-sky-300">
            Local AI Study App
          </p>
          <h1 className="mt-4 text-4xl font-black tracking-tight md:text-6xl">
            Turn Study Files Into Practice Tests
          </h1>
          <p className="mt-4 max-w-2xl text-slate-300">
            This interface is built for your Ollama-powered quiz backend. Upload files, generate
            custom questions, and train on missed topics with repeat drills.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/quiz"
              className="inline-flex items-center gap-2 rounded-full bg-sky-500 px-5 py-2.5 font-semibold text-slate-950 transition hover:bg-sky-400"
            >
              <Rocket className="h-4 w-4" />
              Go To Quiz Builder
            </Link>
            <Link
              href="#quick"
              className="rounded-full border border-slate-600 px-5 py-2.5 font-semibold text-slate-200 transition hover:bg-slate-800"
            >
              Start Quick Flow
            </Link>
          </div>
        </div>
      </section>

      <section id="about" className="mx-auto grid max-w-5xl gap-4 px-6 py-12 md:grid-cols-3 md:px-12 lg:px-0">
        {cards.map((card) => (
          <article key={card.title} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            <card.icon className="h-5 w-5 text-sky-300" />
            <h2 className="mt-3 text-lg font-bold">{card.title}</h2>
            <p className="mt-2 text-sm text-slate-300">{card.text}</p>
          </article>
        ))}
      </section>

      <section id="quick" className="mx-auto max-w-5xl px-6 pb-16 md:px-12 lg:px-0">
        <div className="rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-900 to-slate-950 p-8">
          <h2 className="text-2xl font-extrabold">Quick Part</h2>
          <p className="mt-2 text-slate-300">
            Use this path when you want to jump straight into practice.
          </p>
          <ol className="mt-4 list-decimal space-y-2 pl-5 text-slate-200">
            <li>Start Ollama and make sure your model is installed.</li>
            <li>Open the Quiz page and upload files.</li>
            <li>Set question count and attempts, then generate.</li>
            <li>Review missed topics and generate more focused questions.</li>
          </ol>
        </div>
      </section>

      <section id="docs" className="mx-auto max-w-5xl px-6 pb-24 text-sm text-slate-400 md:px-12 lg:px-0">
        Need setup details? See README for Ollama install and run commands.
      </section>
    </main>
  )
}
