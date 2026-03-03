const express = require("express");
const multer = require("multer");
const path = require("path");
const pdfParse = require("pdf-parse");

const PORT = process.env.PORT || 3000;
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434";
const DEFAULT_MODEL = process.env.OLLAMA_MODEL || "llama3.1:8b";

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public")));

function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function safeJsonParse(raw) {
  if (!raw || typeof raw !== "string") {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch (_error) {
    const firstBrace = raw.indexOf("{");
    const lastBrace = raw.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      try {
        return JSON.parse(raw.slice(firstBrace, lastBrace + 1));
      } catch (__error) {
        return null;
      }
    }
    return null;
  }
}

function extractTopicsFromFileNames(files) {
  const ignored = new Set(["final", "copy", "notes", "scan", "image", "photo"]);
  const words = [];

  files.forEach((file) => {
    const base = file.originalname.replace(/\.[^.]+$/, "");
    base
      .split(/[^a-zA-Z0-9]+/)
      .map((part) => part.trim().toLowerCase())
      .filter((part) => part.length >= 3 && !ignored.has(part))
      .forEach((part) => words.push(part));
  });

  return [...new Set(words)].map((w) => w.charAt(0).toUpperCase() + w.slice(1));
}

function parseManualTopics(input) {
  return String(input || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildFallbackQuestions({ topics, questionCount, attemptsAllowed }) {
  const defaults = [
    "Explain the core idea of {topic} in your own words.",
    "What are the most important facts about {topic}?",
    "Give one real-world example related to {topic}.",
    "How would you teach {topic} to someone new?",
    "What mistakes should students avoid with {topic}?",
  ];

  const safeTopics = topics.length > 0 ? topics : ["General Study Topic"];
  const questions = [];

  for (let i = 0; i < questionCount; i += 1) {
    const topic = safeTopics[i % safeTopics.length];
    questions.push({
      id: `${Date.now()}-${i}-${Math.random().toString(16).slice(2)}`,
      topic,
      prompt: defaults[i % defaults.length].replace("{topic}", topic),
      answerGuide: `A correct answer should clearly explain ${topic} with relevant detail.`,
      keywords: normalize(topic).split(" ").filter((w) => w.length > 2),
      attemptsAllowed,
      attemptsLeft: attemptsAllowed,
      solved: false,
      failed: false,
      userAnswer: "",
    });
  }

  return questions;
}

async function callOllama({ model, system, prompt, images }) {
  const body = {
    model,
    stream: false,
    format: "json",
    messages: [
      { role: "system", content: system },
      { role: "user", content: prompt, images: images || undefined },
    ],
  };

  const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Ollama request failed (${response.status})`);
  }

  const data = await response.json();
  return data?.message?.content || "";
}

async function summarizeImageWithOllama(model, buffer, fileName) {
  try {
    const base64 = buffer.toString("base64");
    const system = "You extract concise study notes from images. Return JSON only.";
    const prompt = `File name: ${fileName}. Return JSON with keys: topic (string), summary (string).`;
    const raw = await callOllama({ model, system, prompt, images: [base64] });
    const parsed = safeJsonParse(raw);
    if (parsed && typeof parsed.summary === "string") {
      return {
        topic: String(parsed.topic || "Image Topic").trim(),
        summary: parsed.summary.trim(),
      };
    }
  } catch (_error) {
    return null;
  }

  return null;
}

async function extractFileContext(files, model) {
  const snippets = [];
  const topicsFromFiles = extractTopicsFromFileNames(files);

  for (const file of files) {
    const lowerName = file.originalname.toLowerCase();
    const mimetype = (file.mimetype || "").toLowerCase();

    if (mimetype.includes("pdf") || lowerName.endsWith(".pdf")) {
      try {
        const parsed = await pdfParse(file.buffer);
        const text = String(parsed.text || "").replace(/\s+/g, " ").trim();
        if (text) {
          snippets.push(`PDF ${file.originalname}: ${text.slice(0, 2500)}`);
        }
      } catch (_error) {
        snippets.push(`PDF ${file.originalname}: Could not parse text.`);
      }
      continue;
    }

    if (mimetype.startsWith("image/") || /\.(png|jpg|jpeg|webp|gif|bmp)$/i.test(lowerName)) {
      const imageSummary = await summarizeImageWithOllama(model, file.buffer, file.originalname);
      if (imageSummary) {
        snippets.push(`Image ${file.originalname}: ${imageSummary.summary}`);
        if (imageSummary.topic) {
          topicsFromFiles.push(imageSummary.topic);
        }
      } else {
        snippets.push(`Image ${file.originalname}: No image summary available.`);
      }
    }
  }

  return {
    snippets,
    topicsFromFiles: [...new Set(topicsFromFiles.map((t) => t.trim()).filter(Boolean))],
  };
}

async function generateQuizWithOllama({
  model,
  topics,
  sourceSnippets,
  questionCount,
  attemptsAllowed,
}) {
  const safeTopics = topics.length > 0 ? topics : ["General Study Topic"];
  const sourceText = sourceSnippets.join("\n\n").slice(0, 12000);

  const system =
    "You create study quiz questions. Return strict JSON only, no markdown, no prose.";

  const prompt = [
    `Create ${questionCount} short-answer study questions.`,
    "Use provided topics and source content.",
    `Topics: ${safeTopics.join(", ")}`,
    `Source content:\n${sourceText || "No source text provided."}`,
    "Return JSON object with key 'questions' where value is an array.",
    "Each question item must include keys: topic, prompt, answerGuide, keywords.",
    "keywords must be an array of short strings.",
  ].join("\n\n");

  const raw = await callOllama({ model, system, prompt });
  const parsed = safeJsonParse(raw);

  if (!parsed || !Array.isArray(parsed.questions) || parsed.questions.length === 0) {
    throw new Error("Model did not return valid questions JSON.");
  }

  const questions = parsed.questions.slice(0, questionCount).map((item, index) => {
    const topic = String(item.topic || safeTopics[index % safeTopics.length] || "General Topic").trim();
    const promptText = String(item.prompt || `Explain ${topic} in your own words.`).trim();
    const answerGuide = String(item.answerGuide || `Explain ${topic} accurately.`).trim();
    const keywords = Array.isArray(item.keywords)
      ? item.keywords.map((k) => String(k).trim()).filter(Boolean).slice(0, 10)
      : normalize(topic).split(" ").filter((w) => w.length > 2);

    return {
      id: `${Date.now()}-${index}-${Math.random().toString(16).slice(2)}`,
      topic,
      prompt: promptText,
      answerGuide,
      keywords,
      attemptsAllowed,
      attemptsLeft: attemptsAllowed,
      solved: false,
      failed: false,
      userAnswer: "",
    };
  });

  if (questions.length < questionCount) {
    const fallback = buildFallbackQuestions({
      topics: safeTopics,
      questionCount: questionCount - questions.length,
      attemptsAllowed,
    });
    questions.push(...fallback);
  }

  return questions;
}

async function gradeWithOllama({ model, question, answer }) {
  const system =
    "You grade short-answer responses. Return strict JSON only with keys: correct (boolean), feedback (string).";

  const prompt = [
    `Question topic: ${question.topic}`,
    `Question: ${question.prompt}`,
    `Expected guide: ${question.answerGuide || "N/A"}`,
    `Keywords: ${(question.keywords || []).join(", ")}`,
    `Student answer: ${answer}`,
    "Mark correct only if answer addresses the question clearly and accurately.",
  ].join("\n\n");

  const raw = await callOllama({ model, system, prompt });
  const parsed = safeJsonParse(raw);

  if (!parsed || typeof parsed.correct !== "boolean") {
    throw new Error("Model returned invalid grading format.");
  }

  return {
    correct: parsed.correct,
    feedback: String(parsed.feedback || "No feedback provided.").trim(),
  };
}

function fallbackGrade(question, answer) {
  const normalizedAnswer = normalize(answer);
  if (normalizedAnswer.length < 12) {
    return { correct: false, feedback: "Answer is too short. Add more detail." };
  }

  const keywords = Array.isArray(question.keywords)
    ? question.keywords.map((k) => normalize(k)).filter(Boolean)
    : [];

  const hitCount = keywords.filter((k) => normalizedAnswer.includes(k)).length;
  if (hitCount >= Math.min(2, keywords.length || 1)) {
    return { correct: true, feedback: "Correct based on key concepts in your answer." };
  }

  return {
    correct: false,
    feedback: "Not correct yet. Include more topic-specific details and key terms.",
  };
}

app.get("/api/health", async (_req, res) => {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
    if (!response.ok) {
      return res.status(200).json({ ok: false, ollama: "unreachable" });
    }
    const data = await response.json();
    return res.status(200).json({ ok: true, ollama: "ready", models: data.models || [] });
  } catch (_error) {
    return res.status(200).json({ ok: false, ollama: "unreachable" });
  }
});

app.post("/api/generate-quiz", upload.array("files", 20), async (req, res) => {
  const questionCount = Math.max(3, Math.min(50, Number(req.body.questionCount) || 10));
  const attemptsAllowed = Math.max(1, Math.min(5, Number(req.body.attemptsAllowed) || 3));
  const model = String(req.body.model || DEFAULT_MODEL).trim();

  const files = Array.isArray(req.files) ? req.files : [];
  const manualTopics = parseManualTopics(req.body.manualTopics);

  try {
    const context = await extractFileContext(files, model);
    const topics = [...new Set([...manualTopics, ...context.topicsFromFiles])];

    if (topics.length === 0 && context.snippets.length === 0) {
      return res.status(400).json({ error: "Provide at least one file or manual topic." });
    }

    let questions;
    try {
      questions = await generateQuizWithOllama({
        model,
        topics,
        sourceSnippets: context.snippets,
        questionCount,
        attemptsAllowed,
      });
    } catch (_error) {
      questions = buildFallbackQuestions({
        topics,
        questionCount,
        attemptsAllowed,
      });
    }

    return res.status(200).json({
      modelUsed: model,
      questions,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Failed to generate quiz." });
  }
});

app.post("/api/grade-answer", async (req, res) => {
  const model = String(req.body.model || DEFAULT_MODEL).trim();
  const question = req.body.question || {};
  const answer = String(req.body.answer || "").trim();

  if (!question.prompt) {
    return res.status(400).json({ error: "Missing question payload." });
  }

  if (!answer) {
    return res.status(200).json({ correct: false, feedback: "Please enter an answer." });
  }

  try {
    try {
      const result = await gradeWithOllama({ model, question, answer });
      return res.status(200).json(result);
    } catch (_error) {
      const result = fallbackGrade(question, answer);
      return res.status(200).json(result);
    }
  } catch (error) {
    return res.status(500).json({ error: error.message || "Failed to grade answer." });
  }
});

const server = app.listen(PORT, () => {
  console.log(`Quiz app running at http://localhost:${PORT}`);
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(
      `Port ${PORT} is already in use. In PowerShell try: $env:PORT=3010; npm start`
    );
    return;
  }

  console.error("Server failed to start:", error.message);
});
