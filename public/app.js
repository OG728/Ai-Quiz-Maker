const state = {
  questions: [],
  currentIndex: -1,
  mistakes: {},
};

const els = {
  files: document.getElementById("study-files"),
  manualTopics: document.getElementById("manual-topics"),
  questionCount: document.getElementById("question-count"),
  attemptCount: document.getElementById("attempt-count"),
  model: document.getElementById("ollama-model"),
  generateBtn: document.getElementById("generate-btn"),
  setupMessage: document.getElementById("setup-message"),
  fileList: document.getElementById("file-list"),
  missedTopics: document.getElementById("missed-topics"),
  missedCount: document.getElementById("missed-count"),
  progressText: document.getElementById("progress-text"),
  questionTopic: document.getElementById("question-topic"),
  questionText: document.getElementById("question-text"),
  answerInput: document.getElementById("answer-input"),
  submitAnswer: document.getElementById("submit-answer"),
  nextQuestion: document.getElementById("next-question"),
  attemptsLeft: document.getElementById("attempts-left"),
  feedback: document.getElementById("feedback"),
};

function renderFiles() {
  const files = [...els.files.files];
  els.fileList.innerHTML = "";

  if (files.length === 0) {
    const li = document.createElement("li");
    li.textContent = "No files selected yet.";
    els.fileList.appendChild(li);
    return;
  }

  files.forEach((file) => {
    const li = document.createElement("li");
    li.textContent = `${file.name} (${Math.max(1, Math.round(file.size / 1024))} KB)`;
    els.fileList.appendChild(li);
  });
}

function clearFeedback() {
  els.feedback.className = "message";
  els.feedback.textContent = "";
}

function setFeedback(text, isGood) {
  els.feedback.className = `message ${isGood ? "good" : "bad"}`;
  els.feedback.textContent = text;
}

function setSetupMessage(text, isGood) {
  els.setupMessage.className = `message ${isGood ? "good" : "bad"}`;
  els.setupMessage.textContent = text;
}

function formatNetworkError(prefix, error) {
  const msg = String(error?.message || "");
  if (msg.toLowerCase().includes("failed to fetch")) {
    return `${prefix}: Cannot reach local server. Make sure Node app is running and reload the page.`;
  }
  return `${prefix}: ${msg}`;
}

function setBusy(isBusy) {
  els.generateBtn.disabled = isBusy;
  els.submitAnswer.disabled = isBusy;
  els.nextQuestion.disabled = isBusy;
}

function updateProgress() {
  const completed = state.questions.filter((q) => q.solved || q.failed).length;
  els.progressText.textContent = `${completed} / ${state.questions.length}`;
}

function showQuestion(index) {
  if (index < 0 || index >= state.questions.length) {
    els.questionTopic.textContent = "";
    els.questionText.textContent = "No active question right now.";
    els.attemptsLeft.textContent = "";
    state.currentIndex = -1;
    return;
  }

  state.currentIndex = index;
  const question = state.questions[index];
  els.questionTopic.textContent = `Topic: ${question.topic}`;
  els.questionText.textContent = question.prompt;
  els.attemptsLeft.textContent = `Chances left: ${question.attemptsLeft} / ${question.attemptsAllowed}`;
  els.answerInput.value = "";
  clearFeedback();
  updateProgress();
}

function findNextOpenQuestion(startIndex = 0) {
  return state.questions.findIndex(
    (q, index) => index >= startIndex && !q.solved && !q.failed
  );
}

function finishQuiz() {
  const solved = state.questions.filter((q) => q.solved).length;
  const failed = state.questions.filter((q) => q.failed).length;
  els.questionTopic.textContent = "Quiz Complete";
  els.questionText.textContent = `Correct: ${solved}. Missed: ${failed}. Use Missed Topics to generate focused practice.`;
  els.attemptsLeft.textContent = "";
  state.currentIndex = -1;
  clearFeedback();
  updateProgress();
}

function addMissedQuestion(question) {
  if (!state.mistakes[question.topic]) {
    state.mistakes[question.topic] = { topic: question.topic, count: 0 };
  }
  state.mistakes[question.topic].count += 1;
  renderMistakes();
}

async function requestMoreQuestions(topic) {
  const model = (els.model.value || "llama3.1:8b").trim();
  const attemptsAllowed = Math.max(1, Math.min(5, Number(els.attemptCount.value) || 3));

  setBusy(true);
  setFeedback(`Generating more questions for ${topic}...`, true);

  try {
    const formData = new FormData();
    formData.append("manualTopics", topic);
    formData.append("questionCount", "3");
    formData.append("attemptsAllowed", String(attemptsAllowed));
    formData.append("model", model);

    const response = await fetch("/api/generate-quiz", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Request failed (${response.status})`);
    }

    const data = await response.json();
    if (!Array.isArray(data.questions) || data.questions.length === 0) {
      throw new Error("No questions returned.");
    }

    state.questions.push(...data.questions);
    setFeedback(`Added ${data.questions.length} more questions for ${topic}.`, true);
    updateProgress();

    if (state.currentIndex === -1) {
      const next = findNextOpenQuestion(0);
      if (next !== -1) {
        showQuestion(next);
      }
    }
  } catch (error) {
    setFeedback(formatNetworkError("Could not generate more questions", error), false);
  } finally {
    setBusy(false);
  }
}

function renderMistakes() {
  const entries = Object.values(state.mistakes);
  els.missedTopics.innerHTML = "";
  els.missedCount.textContent = String(entries.length);

  if (entries.length === 0) {
    const p = document.createElement("p");
    p.className = "hint";
    p.textContent = "No missed topics yet.";
    els.missedTopics.appendChild(p);
    return;
  }

  entries.forEach((entry) => {
    const card = document.createElement("div");
    card.className = "topic-card";

    const heading = document.createElement("h3");
    heading.textContent = entry.topic;

    const body = document.createElement("p");
    body.textContent = `Missed ${entry.count} question(s).`;

    const btn = document.createElement("button");
    btn.className = "btn small";
    btn.textContent = "Generate 3 more";
    btn.addEventListener("click", () => requestMoreQuestions(entry.topic));

    card.appendChild(heading);
    card.appendChild(body);
    card.appendChild(btn);
    els.missedTopics.appendChild(card);
  });
}

async function startQuiz() {
  const files = [...els.files.files];
  const manualTopics = els.manualTopics.value.trim();
  const questionCount = Math.max(3, Math.min(50, Number(els.questionCount.value) || 10));
  const attemptsAllowed = Math.max(1, Math.min(5, Number(els.attemptCount.value) || 3));
  const model = (els.model.value || "llama3.1:8b").trim();

  if (files.length === 0 && !manualTopics) {
    setSetupMessage("Add at least one file or manual topic first.", false);
    return;
  }

  clearFeedback();
  setSetupMessage("Generating quiz with local Ollama model...", true);
  setBusy(true);

  try {
    const formData = new FormData();
    files.forEach((file) => formData.append("files", file));
    formData.append("manualTopics", manualTopics);
    formData.append("questionCount", String(questionCount));
    formData.append("attemptsAllowed", String(attemptsAllowed));
    formData.append("model", model);

    const response = await fetch("/api/generate-quiz", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Request failed (${response.status})`);
    }

    const data = await response.json();
    if (!Array.isArray(data.questions) || data.questions.length === 0) {
      throw new Error("No questions returned from model.");
    }

    state.questions = data.questions;
    state.currentIndex = -1;
    state.mistakes = {};
    renderMistakes();

    setSetupMessage(
      `Generated ${data.questions.length} question(s) with model ${data.modelUsed}.`,
      true
    );

    const first = findNextOpenQuestion(0);
    showQuestion(first);
  } catch (error) {
    setSetupMessage(formatNetworkError("Failed to generate quiz", error), false);
  } finally {
    setBusy(false);
  }
}

async function submitAnswer() {
  if (state.currentIndex < 0 || state.currentIndex >= state.questions.length) {
    setFeedback("Generate a quiz first.", false);
    return;
  }

  const question = state.questions[state.currentIndex];
  if (question.solved || question.failed) {
    setFeedback("Move to the next open question.", false);
    return;
  }

  const answer = els.answerInput.value.trim();
  if (!answer) {
    setFeedback("Enter an answer first.", false);
    return;
  }

  setBusy(true);
  setFeedback("Checking answer with local model...", true);

  try {
    const response = await fetch("/api/grade-answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: (els.model.value || "llama3.1:8b").trim(),
        question,
        answer,
      }),
    });

    if (!response.ok) {
      throw new Error(`Request failed (${response.status})`);
    }

    const data = await response.json();

    if (data.correct) {
      question.solved = true;
      question.userAnswer = answer;
      setFeedback(data.feedback || "Correct answer.", true);
      updateProgress();
      return;
    }

    question.attemptsLeft -= 1;
    question.userAnswer = answer;

    if (question.attemptsLeft <= 0) {
      question.failed = true;
      addMissedQuestion(question);
      setFeedback(
        data.feedback || "Out of chances. Added to missed topics for follow-up practice.",
        false
      );
      updateProgress();
      return;
    }

    els.attemptsLeft.textContent = `Chances left: ${question.attemptsLeft} / ${question.attemptsAllowed}`;
    setFeedback(data.feedback || "Not correct yet. Try again.", false);
  } catch (error) {
    setFeedback(formatNetworkError("Grading failed", error), false);
  } finally {
    setBusy(false);
  }
}

function goToNextQuestion() {
  if (state.questions.length === 0) {
    setFeedback("Generate a quiz first.", false);
    return;
  }

  const start = state.currentIndex >= 0 ? state.currentIndex + 1 : 0;
  let next = findNextOpenQuestion(start);
  if (next === -1) {
    next = findNextOpenQuestion(0);
  }

  if (next === -1) {
    finishQuiz();
    return;
  }

  showQuestion(next);
}

els.files.addEventListener("change", renderFiles);
els.generateBtn.addEventListener("click", startQuiz);
els.submitAnswer.addEventListener("click", submitAnswer);
els.nextQuestion.addEventListener("click", goToNextQuestion);

renderFiles();
renderMistakes();
updateProgress();
