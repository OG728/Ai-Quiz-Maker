# AI PDF/Image Quiz Builder (Local Node.js + Ollama)

This project is a local web app that:
- accepts PDF and image files
- generates short-answer quiz questions
- checks answers with an AI model
- gives multiple attempts per question
- tracks missed topics and lets you generate more questions on those topics

Everything runs locally on your machine.

## Requirements

- Node.js 18+ (recommended: latest LTS)
- Ollama installed on your machine

## 1. Install Ollama

Windows:
- Download: https://ollama.com/download/windows
- Install normally

After install, verify:

```powershell
ollama --version
```

## 2. Pull a model

At least one text model is required:

```powershell
ollama pull llama3.1:8b
```

Optional for better image understanding (vision model):

```powershell
ollama pull llava
```

## 3. Install project dependencies

From project root:

```powershell
npm install
```

## 4. Start Ollama (if not already running)

Usually Ollama runs in background automatically.  
If needed, start it manually:

```powershell
ollama serve
```

## 5. Start the app

```powershell
npm start
```

If port `3000` is busy:

```powershell
$env:PORT=3010; npm start
```

Open in browser:
- `http://localhost:3000`
- or `http://localhost:3010` if you used custom port

## How to use

1. Upload PDF/image files.
2. (Optional) Add manual topics.
3. Set question count and chances per question.
4. Enter model name (example: `llama3.1:8b`).
5. Click `Generate Quiz`.
6. Answer questions and click `Check Answer`.
7. Use `Missed Topics` to generate focused follow-up questions.

## API endpoints (local)

- `GET /api/health`  
  Checks if Ollama is reachable.

- `POST /api/generate-quiz`  
  Multipart form with:
  - `files` (0..many)
  - `manualTopics` (comma-separated string)
  - `questionCount` (number)
  - `attemptsAllowed` (number)
  - `model` (string)

- `POST /api/grade-answer`  
  JSON body:
  - `model`
  - `question`
  - `answer`

## Troubleshooting

- `listen tcp 127.0.0.1:11434 ... only one usage ...`
  - Ollama is already running; do not start `ollama serve` again.

- `models: []` from `/api/health`
  - You must pull at least one model:
    `ollama pull llama3.1:8b`

- Port already in use for app
  - Start on another port:
    `$env:PORT=3010; npm start`

- `ollama` command not found
  - Restart terminal (or PC) after installation and try again.

