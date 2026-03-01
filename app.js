const STORAGE_KEYS = {
  bank: "psy_bank_v1",
  progress: "psy_progress_v1",
  wrongBook: "psy_wrong_v1",
  seedVersion: "psy_seed_version_v1",
};
const PRELOADED_SEED_VERSION = "psych-seed-2026-02-28-v2";
const PRELOADED_SEED_FILE = "./seed_bank.json";

function createDefaultSession() {
  return {
    active: false,
    queue: [],
    pointer: 0,
    currentQuestion: null,
    selected: new Set(),
    submitted: false,
    startWrongCount: 0,
    practiceType: "practice",
    examTotal: 0,
    examAnswered: 0,
    examCorrect: 0,
    examDurationSec: 0,
    examEndAt: 0,
    examTimerId: null,
    examRecords: {},
    answerCardFilter: "all",
  };
}

const state = {
  bank: [],
  progress: { answered: 0, correct: 0, wrong: 0 },
  wrongBook: {},
  session: createDefaultSession(),
  examResult: null,
  examResultFilter: "all",
};

const els = {};

document.addEventListener("DOMContentLoaded", () => {
  init().catch(() => {
    setStatus("初始化失败，请刷新重试。", true);
  });
});

async function init() {
  bindElements();
  bindEvents();
  loadState();
  await maybeLoadSeedBank();
  refreshStats();
  renderWrongList();
}

function bindElements() {
  els.fileInput = document.getElementById("fileInput");
  els.importBtn = document.getElementById("importBtn");
  els.clearBankBtn = document.getElementById("clearBankBtn");
  els.importStatus = document.getElementById("importStatus");
  els.modeSelect = document.getElementById("modeSelect");
  els.chapterSelect = document.getElementById("chapterSelect");
  els.scopeSelect = document.getElementById("scopeSelect");
  els.practiceTypeSelect = document.getElementById("practiceTypeSelect");
  els.examCountWrap = document.getElementById("examCountWrap");
  els.examCountInput = document.getElementById("examCountInput");
  els.examDurationWrap = document.getElementById("examDurationWrap");
  els.examDurationInput = document.getElementById("examDurationInput");
  els.startBtn = document.getElementById("startBtn");
  els.resetProgressBtn = document.getElementById("resetProgressBtn");
  els.stats = document.getElementById("stats");
  els.quizPanel = document.getElementById("quizPanel");
  els.quizMeta = document.getElementById("quizMeta");
  els.examTimer = document.getElementById("examTimer");
  els.questionBox = document.getElementById("questionBox");
  els.optionBox = document.getElementById("optionBox");
  els.feedbackBox = document.getElementById("feedbackBox");
  els.prevBtn = document.getElementById("prevBtn");
  els.clearAnswerBtn = document.getElementById("clearAnswerBtn");
  els.submitBtn = document.getElementById("submitBtn");
  els.submitExamBtn = document.getElementById("submitExamBtn");
  els.nextBtn = document.getElementById("nextBtn");
  els.answerCardPanel = document.getElementById("answerCardPanel");
  els.answerCardStats = document.getElementById("answerCardStats");
  els.answerCardFilterSelect = document.getElementById("answerCardFilterSelect");
  els.answerCardGrid = document.getElementById("answerCardGrid");
  els.examResultPanel = document.getElementById("examResultPanel");
  els.examSummary = document.getElementById("examSummary");
  els.examResultFilterSelect = document.getElementById("examResultFilterSelect");
  els.examResultList = document.getElementById("examResultList");
  els.exportWrongTxtBtn = document.getElementById("exportWrongTxtBtn");
  els.exportWrongWordBtn = document.getElementById("exportWrongWordBtn");
  els.clearWrongBtn = document.getElementById("clearWrongBtn");
  els.wrongList = document.getElementById("wrongList");
}

function bindEvents() {
  els.importBtn.addEventListener("click", onImport);
  els.clearBankBtn.addEventListener("click", clearBank);
  els.startBtn.addEventListener("click", startPractice);
  els.practiceTypeSelect.addEventListener("change", updatePracticeTypeUI);
  els.submitBtn.addEventListener("click", submitAnswer);
  els.submitExamBtn.addEventListener("click", requestSubmitExam);
  els.prevBtn.addEventListener("click", prevQuestion);
  els.clearAnswerBtn.addEventListener("click", clearCurrentAnswer);
  els.nextBtn.addEventListener("click", nextQuestion);
  els.answerCardGrid.addEventListener("click", onAnswerCardClick);
  els.answerCardFilterSelect.addEventListener("change", onAnswerCardFilterChange);
  els.examResultFilterSelect.addEventListener("change", onExamResultFilterChange);
  els.resetProgressBtn.addEventListener("click", resetProgress);
  els.exportWrongTxtBtn.addEventListener("click", exportWrongBookTxt);
  els.exportWrongWordBtn.addEventListener("click", exportWrongBookWord);
  els.clearWrongBtn.addEventListener("click", clearWrongBook);
}

function loadState() {
  state.bank = readStorage(STORAGE_KEYS.bank, []);
  state.progress = readStorage(STORAGE_KEYS.progress, {
    answered: 0,
    correct: 0,
    wrong: 0,
  });
  state.wrongBook = readStorage(STORAGE_KEYS.wrongBook, {});
  renderChapterOptions();
  updatePracticeTypeUI();
  if (state.bank.length > 0) {
    els.importStatus.textContent = `已加载本地题库：${state.bank.length} 题`;
  }
}

async function maybeLoadSeedBank() {
  const seedVersion = localStorage.getItem(STORAGE_KEYS.seedVersion);
  if (seedVersion === "custom") {
    return;
  }
  if (seedVersion === PRELOADED_SEED_VERSION) {
    return;
  }

  try {
    const resp = await fetch(PRELOADED_SEED_FILE, { cache: "no-store" });
    if (!resp.ok) {
      return;
    }
    const payload = await resp.json();
    if (!payload || !Array.isArray(payload.questions) || payload.questions.length === 0) {
      return;
    }

    state.bank = payload.questions
      .map((q, idx) => normalizeSeedQuestion(q, idx + 1))
      .filter(Boolean);
    if (state.bank.length === 0) {
      return;
    }

    state.progress = { answered: 0, correct: 0, wrong: 0 };
    state.wrongBook = {};
    stopExamTimer();
    state.session = createDefaultSession();
    localStorage.setItem(STORAGE_KEYS.seedVersion, PRELOADED_SEED_VERSION);
    saveState();
    renderChapterOptions();
    resetExamResultPanel();
    els.quizPanel.classList.add("hidden");
    setStatus(`已导入项目题库：${state.bank.length} 题`);
  } catch {
    // Silent fallback: app still works with manual import.
  }
}

function normalizeSeedQuestion(question, number) {
  if (!question || !question.stem) {
    return null;
  }
  const type = ["single", "multiple", "judge", "short"].includes(question.type)
    ? question.type
    : "single";
  const options = Array.isArray(question.options)
    ? question.options
        .filter((opt) => opt && opt.key && opt.text)
        .map((opt) => ({ key: String(opt.key), text: String(opt.text) }))
    : [];
  const answer = Array.isArray(question.answer)
    ? question.answer.map((x) => String(x).toUpperCase())
    : [];
  return {
    id: question.id || `seed_q_${number}`,
    number: question.number || number,
    chapter: question.chapter || "未分章",
    type,
    stem: String(question.stem).trim(),
    options,
    answer,
    answerText: String(question.answerText || "").trim(),
    explanation: String(question.explanation || "").trim(),
  };
}

function saveState() {
  localStorage.setItem(STORAGE_KEYS.bank, JSON.stringify(state.bank));
  localStorage.setItem(STORAGE_KEYS.progress, JSON.stringify(state.progress));
  localStorage.setItem(STORAGE_KEYS.wrongBook, JSON.stringify(state.wrongBook));
}

function readStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

async function onImport() {
  const file = els.fileInput.files[0];
  if (!file) {
    setStatus("请先选择 Word 或 txt 文件。", true);
    return;
  }

  setStatus("正在解析文件，请稍候...");
  try {
    const rawText = await extractTextFromFile(file);
    const result = parseQuestionBank(rawText);
    if (result.questions.length === 0) {
      setStatus("未识别到题目。请检查格式后重试。", true);
      return;
    }

    state.bank = result.questions;
    state.progress = { answered: 0, correct: 0, wrong: 0 };
    state.wrongBook = {};
    stopExamTimer();
    state.session = createDefaultSession();
    localStorage.setItem(STORAGE_KEYS.seedVersion, "custom");
    saveState();
    renderChapterOptions();
    resetExamResultPanel();
    refreshStats();
    renderWrongList();
    els.quizPanel.classList.add("hidden");
    setStatus(
      `导入成功：${result.questions.length} 题，跳过 ${result.skipped} 题。`
    );
  } catch (error) {
    setStatus(`导入失败：${error.message}`, true);
  }
}

async function extractTextFromFile(file) {
  const lowerName = file.name.toLowerCase();
  if (lowerName.endsWith(".txt")) {
    return await file.text();
  }

  if (lowerName.endsWith(".docx")) {
    if (!window.mammoth) {
      throw new Error("Word 解析库加载失败，请检查网络后刷新页面。");
    }
    const buffer = await file.arrayBuffer();
    const { value } = await window.mammoth.extractRawText({ arrayBuffer: buffer });
    return value;
  }

  throw new Error("仅支持 .docx 和 .txt");
}

function parseQuestionBank(text) {
  const lines = normalizeText(text).split("\n");
  const rawQuestions = [];
  let sectionType = "";
  let chapter = "未分章";
  let current = null;
  let lastField = "";

  const pushCurrent = () => {
    if (current) rawQuestions.push(current);
    current = null;
    lastField = "";
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    if (/^(单选题|单项选择题|一、单选题)/.test(line)) {
      sectionType = "single";
      continue;
    }
    if (/^(多选题|多项选择题|二、多选题)/.test(line)) {
      sectionType = "multiple";
      continue;
    }
    if (/^(判断题|是非题|三、判断题)/.test(line)) {
      sectionType = "judge";
      continue;
    }
    if (/^(简答题|论述题|问答题|四、简答题)/.test(line)) {
      sectionType = "short";
      continue;
    }

    const chapterHeading = parseChapterHeading(line);
    if (chapterHeading) {
      pushCurrent();
      chapter = chapterHeading;
      continue;
    }

    const qMatch = line.match(/^(?:第\s*)?(\d+)\s*(?:题|[\.、\)]|[-：:])\s*(.+)$/);
    if (qMatch) {
      pushCurrent();
      current = {
        stem: qMatch[2].trim(),
        options: [],
        answerRaw: "",
        explanation: "",
        sectionType,
        chapter,
      };
      lastField = "stem";
      continue;
    }

    if (!current) {
      continue;
    }

    const optionMatch = line.match(/^([A-HＡ-Ｈ])[\.、\)）．:：]?\s*(.+)$/);
    if (optionMatch) {
      current.options.push({
        key: toHalfWidthLetter(optionMatch[1]),
        text: optionMatch[2].trim(),
      });
      lastField = "option";
      continue;
    }

    const answerMatch = line.match(/^(?:【)?(答案|参考答案|正确答案)(?:】)?\s*[:：]?\s*(.+)$/);
    if (answerMatch) {
      current.answerRaw = answerMatch[2].trim();
      lastField = "answer";
      continue;
    }

    const explanationMatch = line.match(/^(?:【)?(解析|答案解析|说明)(?:】)?\s*[:：]?\s*(.*)$/);
    if (explanationMatch) {
      current.explanation = explanationMatch[2].trim();
      lastField = "explanation";
      continue;
    }

    // 容错：题干、选项和解析可能出现换行
    if (lastField === "stem") {
      current.stem += ` ${line}`;
    } else if (lastField === "option" && current.options.length > 0) {
      const lastOption = current.options[current.options.length - 1];
      lastOption.text += ` ${line}`;
    } else if (lastField === "explanation") {
      current.explanation += ` ${line}`;
    } else if (lastField === "answer" && !current.explanation) {
      current.explanation = line;
      lastField = "explanation";
    } else {
      current.stem += ` ${line}`;
    }
  }
  pushCurrent();

  const questions = [];
  let skipped = 0;
  rawQuestions.forEach((q, idx) => {
    const normalized = normalizeQuestion(q, idx + 1);
    if (normalized) {
      questions.push(normalized);
    } else {
      skipped += 1;
    }
  });
  return { questions, skipped };
}

function parseChapterHeading(line) {
  if (/^第[一二三四五六七八九十百千万0-9]+章/.test(line)) {
    return line.replace(/\s+/g, " ").trim();
  }
  const kv = line.match(/^(章节|章名|chapter)\s*[:：]\s*(.+)$/i);
  if (kv) {
    return kv[2].trim();
  }
  const boxed = line.match(/^【(.+章.*)】$/);
  if (boxed) {
    return boxed[1].trim();
  }
  return "";
}

function normalizeText(text) {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'");
}

function normalizeQuestion(raw, number) {
  const stem = raw.stem.trim();
  if (!stem || !raw.answerRaw) {
    return null;
  }

  let type = raw.sectionType;
  let options = raw.options.map((opt) => ({
    key: opt.key,
    text: opt.text.trim(),
  }));
  let answer = parseLetterAnswer(raw.answerRaw);

  if (isJudgeAnswer(raw.answerRaw)) {
    type = "judge";
    options = ensureJudgeOptions(options);
    answer = [toJudgeLetter(raw.answerRaw)];
  }

  if (!type) {
    if (answer.length > 1) {
      type = "multiple";
    } else {
      type = "single";
    }
    if (isJudgeOptions(options)) {
      type = "judge";
    }
    if (options.length === 0 && answer.length === 0) {
      type = "short";
    }
  }

  if (type === "judge") {
    options = ensureJudgeOptions(options);
    if (answer.length === 0) {
      const judgeLetter = toJudgeLetter(raw.answerRaw);
      if (!judgeLetter) return null;
      answer = [judgeLetter];
    }
  }

  if (type === "short") {
    return {
      id: `q_${Date.now()}_${number}`,
      number,
      chapter: raw.chapter || "未分章",
      type: "short",
      stem,
      options: [],
      answer: [],
      answerText: raw.answerRaw.trim(),
      explanation: raw.explanation.trim(),
    };
  }

  if ((type === "single" || type === "multiple") && options.length < 2) {
    return null;
  }

  if (!answer || answer.length === 0) {
    return null;
  }

  const uniqAnswer = [...new Set(answer)].sort();
  if (type === "single" && uniqAnswer.length > 1) {
    type = "multiple";
  }

  return {
    id: `q_${Date.now()}_${number}`,
    number,
    chapter: raw.chapter || "未分章",
    type,
    stem,
    options,
    answer: uniqAnswer,
    answerText: "",
    explanation: raw.explanation.trim(),
  };
}

function parseLetterAnswer(answerRaw) {
  const matched = answerRaw
    .toUpperCase()
    .replace(/[，、\s]/g, "")
    .match(/[A-H]/g);
  return matched || [];
}

function isJudgeAnswer(answerRaw) {
  return /(对|错|正确|错误|√|×|T|F|Y|N)/i.test(answerRaw.trim());
}

function toJudgeLetter(answerRaw) {
  const value = answerRaw.trim().toUpperCase();
  if (
    value.includes("对") ||
    value.includes("正确") ||
    value.includes("√") ||
    value === "T" ||
    value === "Y"
  ) {
    return "A";
  }
  if (
    value.includes("错") ||
    value.includes("错误") ||
    value.includes("×") ||
    value === "F" ||
    value === "N"
  ) {
    return "B";
  }
  return "";
}

function isJudgeOptions(options) {
  if (options.length !== 2) return false;
  const texts = options.map((o) => o.text);
  return texts.some((t) => /对|正确/.test(t)) && texts.some((t) => /错|错误/.test(t));
}

function ensureJudgeOptions(options) {
  if (isJudgeOptions(options)) {
    return options;
  }
  return [
    { key: "A", text: "对 / 正确" },
    { key: "B", text: "错 / 错误" },
  ];
}

function toHalfWidthLetter(char) {
  const code = char.charCodeAt(0);
  if (code >= 65313 && code <= 65320) {
    return String.fromCharCode(code - 65248);
  }
  return char.toUpperCase();
}

function setStatus(message, isError = false) {
  els.importStatus.textContent = message;
  els.importStatus.style.color = isError ? "var(--danger)" : "var(--ok)";
}

function renderChapterOptions() {
  const prev = els.chapterSelect.value || "all";
  const chapterSet = new Set();
  state.bank.forEach((q) => chapterSet.add(q.chapter || "未分章"));

  const options = ['<option value="all">全部章节</option>'];
  [...chapterSet].forEach((chapter) => {
    options.push(
      `<option value="${escapeAttr(chapter)}">${escapeHtml(chapter)}</option>`
    );
  });
  els.chapterSelect.innerHTML = options.join("");

  if (prev !== "all" && chapterSet.has(prev)) {
    els.chapterSelect.value = prev;
  }
}

function updatePracticeTypeUI() {
  const isExam = els.practiceTypeSelect.value === "exam";
  els.examCountWrap.classList.toggle("hidden", !isExam);
  els.examDurationWrap.classList.toggle("hidden", !isExam);
  els.startBtn.textContent = isExam ? "开始模拟考试" : "开始练习";
}

function refreshStats() {
  const total = state.bank.length;
  const wrongCount = Object.keys(state.wrongBook).length;
  const rate =
    state.progress.answered === 0
      ? "0.0%"
      : `${((state.progress.correct / state.progress.answered) * 100).toFixed(1)}%`;

  els.stats.textContent = `总题数：${total} | 已答：${state.progress.answered} | 正确：${state.progress.correct} | 错误：${state.progress.wrong} | 正确率：${rate} | 错题：${wrongCount}`;
}

function startPractice() {
  if (state.bank.length === 0) {
    setStatus("请先导入题库再开始刷题。", true);
    return;
  }

  const practiceType = els.practiceTypeSelect.value;
  const scope = els.scopeSelect.value;
  const mode = els.modeSelect.value;
  const chapter = els.chapterSelect.value;

  let source = [...state.bank];
  if (chapter !== "all") {
    source = source.filter((q) => q.chapter === chapter);
  }

  let queue = [];
  if (scope === "wrong") {
    queue = source
      .filter((q) => state.wrongBook[q.id])
      .map((q) => q.id);
  } else {
    queue = source.map((q) => q.id);
  }

  if (queue.length === 0) {
    setStatus("当前范围没有可练习题目。", true);
    return;
  }

  if (mode === "random") {
    queue = shuffle(queue);
  }

  const examCount = Math.max(
    1,
    Math.min(200, Number.parseInt(els.examCountInput.value, 10) || 50)
  );
  if (practiceType === "exam" && queue.length > examCount) {
    queue = queue.slice(0, examCount);
  }

  stopExamTimer();
  state.session = createDefaultSession();
  state.session.active = true;
  state.session.queue = queue;
  state.session.pointer = 0;
  state.session.startWrongCount = Object.keys(state.wrongBook).length;
  state.session.submitted = false;
  state.session.selected = new Set();
  state.session.practiceType = practiceType;
  state.session.examTotal = practiceType === "exam" ? queue.length : 0;
  state.session.answerCardFilter = "all";
  state.session.examDurationSec = Math.max(
    60,
    Math.min(300 * 60, (Number.parseInt(els.examDurationInput.value, 10) || 60) * 60)
  );

  els.quizPanel.classList.remove("hidden");
  resetExamResultPanel();
  els.submitExamBtn.classList.toggle("hidden", practiceType !== "exam");
  if (practiceType === "exam") {
    els.answerCardFilterSelect.value = "all";
    startExamTimer();
  } else {
    els.examTimer.classList.add("hidden");
  }
  setStatus(
    practiceType === "exam"
      ? `模拟考试已开始，共 ${queue.length} 题。`
      : `练习已开始，共 ${queue.length} 题。`
  );
  renderCurrentQuestion();
}

function renderCurrentQuestion() {
  const id = state.session.queue[state.session.pointer];
  const question = state.bank.find((q) => q.id === id);
  if (!question) {
    finishSession("题目不存在，已结束练习。");
    return;
  }

  state.session.currentQuestion = question;
  if (state.session.practiceType === "exam") {
    const record = state.session.examRecords[question.id];
    state.session.selected = new Set(record?.selected || []);
    state.session.submitted = false;
  } else {
    state.session.selected = new Set();
    state.session.submitted = false;
  }

  setQuizMeta(question);
  els.questionBox.textContent = question.stem;
  els.optionBox.innerHTML = "";
  els.feedbackBox.className = "feedback-box";
  els.feedbackBox.innerHTML = "";

  if (question.type === "short") {
    const textarea = document.createElement("textarea");
    textarea.id = "shortAnswerInput";
    textarea.rows = 6;
    textarea.placeholder = "请输入你的作答内容（用于自测记录）";
    textarea.style.width = "100%";
    textarea.style.border = "1px solid #d6d0c8";
    textarea.style.borderRadius = "10px";
    textarea.style.padding = "10px";
    textarea.style.fontFamily = 'inherit';
    textarea.style.fontSize = "0.95rem";
    if (state.session.practiceType === "exam") {
      textarea.value = String(state.session.examRecords[question.id]?.selectedText || "");
    }
    els.optionBox.appendChild(textarea);
  } else {
    question.options.forEach((opt) => {
      const div = document.createElement("div");
      div.className = "option-item";
      div.dataset.key = opt.key;
      div.innerHTML = `<strong>${opt.key}.</strong> ${escapeHtml(opt.text)}`;
      div.addEventListener("click", () => onSelectOption(opt.key));
      els.optionBox.appendChild(div);
    });
    updateOptionSelectionUI();
  }

  if (state.session.practiceType === "exam") {
    els.prevBtn.classList.remove("hidden");
    els.nextBtn.classList.remove("hidden");
    els.clearAnswerBtn.classList.remove("hidden");
    els.answerCardPanel.classList.remove("hidden");
    if (question.type === "multiple") {
      els.submitBtn.textContent = "保存答案";
      els.submitBtn.classList.remove("hidden");
    } else if (question.type === "short") {
      els.submitBtn.textContent = "保存作答";
      els.submitBtn.classList.remove("hidden");
    } else {
      els.submitBtn.classList.add("hidden");
    }
    renderExamRecordHint(question.id);
    renderAnswerCard();
  } else {
    if (question.type === "multiple") {
      els.submitBtn.textContent = "提交答案";
      els.submitBtn.classList.remove("hidden");
    } else if (question.type === "short") {
      els.submitBtn.textContent = "查看参考答案";
      els.submitBtn.classList.remove("hidden");
    } else {
      els.submitBtn.classList.add("hidden");
    }
    els.prevBtn.classList.add("hidden");
    els.clearAnswerBtn.classList.add("hidden");
    els.nextBtn.classList.add("hidden");
    els.answerCardPanel.classList.add("hidden");
  }
}

function onSelectOption(key) {
  if (state.session.submitted) return;
  const question = state.session.currentQuestion;
  if (!question) return;

  if (question.type === "multiple") {
    if (state.session.selected.has(key)) {
      state.session.selected.delete(key);
    } else {
      state.session.selected.add(key);
    }
  } else {
    state.session.selected = new Set([key]);
  }

  updateOptionSelectionUI();

  if (question.type !== "multiple") {
    submitAnswer();
  }
}

function updateOptionSelectionUI() {
  if (state.session.currentQuestion?.type === "short") {
    return;
  }
  const items = els.optionBox.querySelectorAll(".option-item");
  items.forEach((item) => {
    item.classList.toggle("selected", state.session.selected.has(item.dataset.key));
  });
}

function submitAnswer() {
  if (state.session.submitted) return;
  const question = state.session.currentQuestion;
  if (!question) return;

  if (question.type === "short") {
    const shortInput = document.getElementById("shortAnswerInput");
    const userText = shortInput ? shortInput.value.trim() : "";
    if (state.session.practiceType === "exam") {
      persistCurrentExamSelection();
      showFeedback(userText ? "主观题作答已保存" : "当前主观题未作答", true, question);
      return;
    }
    showFeedback(userText ? "已记录你的作答，参考答案如下。" : "参考答案如下。", true, question);
    state.session.submitted = true;
    els.nextBtn.classList.remove("hidden");
    els.submitBtn.classList.add("hidden");
    return;
  }

  const selected = [...state.session.selected].sort();
  if (selected.length === 0) {
    showFeedback("请先选择答案。", false, question);
    return;
  }

  const answer = [...question.answer].sort();
  const isCorrect = selected.join(",") === answer.join(",");

  if (state.session.practiceType === "exam") {
    persistCurrentExamSelection();
    showFeedback("答案已保存", true, question);
    return;
  }

  state.progress.answered += 1;
  if (isCorrect) {
    state.progress.correct += 1;
    delete state.wrongBook[question.id];
  } else {
    state.progress.wrong += 1;
    state.wrongBook[question.id] = {
      count: (state.wrongBook[question.id]?.count || 0) + 1,
      lastAnswer: selected.join(","),
      lastAt: new Date().toISOString(),
    };
  }
  saveState();
  refreshStats();
  renderWrongList();

  markOptionResult(question, selected);
  showFeedback(isCorrect ? "回答正确" : "回答错误", isCorrect, question);
  state.session.submitted = true;
  els.prevBtn.classList.add("hidden");
  els.nextBtn.classList.remove("hidden");
  els.submitBtn.classList.add("hidden");
}

function markOptionResult(question, selected) {
  if (state.session.practiceType === "exam") {
    return;
  }
  const items = els.optionBox.querySelectorAll(".option-item");
  items.forEach((item) => {
    const key = item.dataset.key;
    if (question.answer.includes(key)) {
      item.classList.add("correct");
    }
    if (selected.includes(key) && !question.answer.includes(key)) {
      item.classList.add("wrong");
    }
  });
}

function renderExamRecordHint(questionId) {
  const record = state.session.examRecords[questionId];
  const question = state.bank.find((q) => q.id === questionId);
  if (question?.type === "short") {
    const preview = String(record?.selectedText || "").trim();
    if (!preview) {
      els.feedbackBox.className = "feedback-box";
      els.feedbackBox.innerHTML = "";
      return;
    }
    els.feedbackBox.classList.add("show");
    els.feedbackBox.innerHTML = `
      <p class="feedback-ok">已保存主观题作答</p>
      <p>${escapeHtml(preview.slice(0, 120))}${preview.length > 120 ? "..." : ""}</p>
    `;
    return;
  }
  if (!record || !record.selected || record.selected.length === 0) {
    els.feedbackBox.className = "feedback-box";
    els.feedbackBox.innerHTML = "";
    return;
  }
  els.feedbackBox.classList.add("show");
  els.feedbackBox.innerHTML = `
    <p class="feedback-ok">已保存答案：${record.selected.join("、")}</p>
    <p>可继续修改，交卷前可反复保存。</p>
  `;
}

function renderAnswerCard() {
  if (!state.session.active || state.session.practiceType !== "exam") {
    els.answerCardPanel.classList.add("hidden");
    return;
  }

  const filter = state.session.answerCardFilter || "all";
  els.answerCardFilterSelect.value = filter;

  const total = state.session.queue.length;
  const answered = state.session.queue.filter((id) => {
    const record = state.session.examRecords[id];
    return isExamRecordAnswered(record);
  }).length;
  els.answerCardStats.textContent = `已答 ${answered}/${total}`;

  const cards = state.session.queue
    .map((id, index) => {
      const record = state.session.examRecords[id];
      const isAnswered = isExamRecordAnswered(record);
      if (
        (filter === "answered" && !isAnswered) ||
        (filter === "unanswered" && isAnswered)
      ) {
        return "";
      }
      const cls = [
        "answer-card-item",
        isAnswered ? "answered" : "unanswered",
        index === state.session.pointer ? "current" : "",
      ]
        .filter(Boolean)
        .join(" ");
      return `<button type="button" class="${cls}" data-index="${index}">${
        index + 1
      }</button>`;
    })
    .filter(Boolean)
    .join("");

  els.answerCardGrid.innerHTML = cards || '<span class="answer-card-empty">当前筛选无题目</span>';
}

function onAnswerCardClick(event) {
  const target = event.target.closest("button[data-index]");
  if (!target) {
    return;
  }
  if (!state.session.active || state.session.practiceType !== "exam") {
    return;
  }
  persistCurrentExamSelection();
  const idx = Number.parseInt(target.dataset.index, 10);
  if (Number.isNaN(idx) || idx < 0 || idx >= state.session.queue.length) {
    return;
  }
  state.session.pointer = idx;
  renderCurrentQuestion();
}

function onAnswerCardFilterChange() {
  if (!state.session.active || state.session.practiceType !== "exam") {
    return;
  }
  state.session.answerCardFilter = els.answerCardFilterSelect.value || "all";
  renderAnswerCard();
}

function clearCurrentAnswer() {
  if (!state.session.active || state.session.practiceType !== "exam") {
    return;
  }
  const question = state.session.currentQuestion;
  if (!question) {
    return;
  }

  if (question.type === "short") {
    const input = document.getElementById("shortAnswerInput");
    if (input) {
      input.value = "";
    }
  }
  state.session.selected = new Set();
  updateOptionSelectionUI();
  delete state.session.examRecords[question.id];
  persistCurrentExamSelection();
  renderExamRecordHint(question.id);
  showFeedback("已清空本题答案", true, question);
}

function showFeedback(message, isCorrect, question) {
  if (state.session.practiceType === "exam") {
    const className = isCorrect ? "feedback-ok" : "feedback-bad";
    els.feedbackBox.classList.add("show");
    els.feedbackBox.innerHTML = `
      <p class="${className}">${escapeHtml(message)}</p>
      <p>当前已作答：${state.session.examAnswered}/${state.session.queue.length}</p>
      <p>可继续修改答案，最终以交卷时答案为准。</p>
    `;
    return;
  }

  if (question.type === "short") {
    const input = document.getElementById("shortAnswerInput");
    const userText = input ? input.value.trim() : "";
    const answerText = question.answerText || question.explanation || "暂无参考答案";
    els.feedbackBox.classList.add("show");
    els.feedbackBox.innerHTML = `
      <p class="feedback-ok">${escapeHtml(message)}</p>
      <p>你的作答：${escapeHtml(userText || "未作答")}</p>
      <p>参考答案：${escapeHtml(answerText)}</p>
    `;
    return;
  }

  const answerText = question.answer.join("、");
  const explanation = question.explanation
    ? `<p>解析：${escapeHtml(question.explanation)}</p>`
    : "<p>解析：暂无</p>";
  els.feedbackBox.classList.add("show");
  els.feedbackBox.innerHTML = `
    <p class="${isCorrect ? "feedback-ok" : "feedback-bad"}">${message}</p>
    <p>正确答案：${answerText}</p>
    ${explanation}
  `;
}

function setQuizMeta(question) {
  const typeTextMap = {
    single: "单选",
    multiple: "多选",
    judge: "判断",
    short: "简答",
  };
  const metaBits = [
    `${state.session.pointer + 1}/${state.session.queue.length}`,
    typeTextMap[question.type],
    question.chapter || "未分章",
  ];
  if (state.session.practiceType === "exam") {
    metaBits.push(
      `已答 ${state.session.examAnswered}/${state.session.queue.length}`,
      "模拟考试"
    );
  }
  els.quizMeta.textContent = metaBits.join(" · ");
}

function isExamRecordAnswered(record) {
  if (!record) return false;
  if (Array.isArray(record.selected) && record.selected.length > 0) {
    return true;
  }
  if (typeof record.selectedText === "string" && record.selectedText.trim()) {
    return true;
  }
  return false;
}

function persistCurrentExamSelection() {
  if (!state.session.active || state.session.practiceType !== "exam") {
    return;
  }
  const question = state.session.currentQuestion;
  if (!question) {
    return;
  }

  if (question.type === "short") {
    const input = document.getElementById("shortAnswerInput");
    const text = input ? input.value.trim() : "";
    if (!text) {
      delete state.session.examRecords[question.id];
    } else {
      state.session.examRecords[question.id] = { selectedText: text };
    }
    const report = buildExamReport();
    state.session.examAnswered = report.answered;
    state.session.examCorrect = report.correct;
    setQuizMeta(question);
    renderAnswerCard();
    return;
  }

  const selected = [...state.session.selected].sort();
  if (selected.length === 0) {
    delete state.session.examRecords[question.id];
    const report = buildExamReport();
    state.session.examAnswered = report.answered;
    state.session.examCorrect = report.correct;
    setQuizMeta(question);
    renderAnswerCard();
    return;
  }
  state.session.examRecords[question.id] = { selected };
  const report = buildExamReport();
  state.session.examAnswered = report.answered;
  state.session.examCorrect = report.correct;
  setQuizMeta(question);
  renderAnswerCard();
}

function nextQuestion() {
  if (!state.session.active) return;
  if (state.session.practiceType === "exam") {
    persistCurrentExamSelection();
    if (state.session.pointer >= state.session.queue.length - 1) {
      setStatus("已是最后一题，可点击“交卷”或返回上一题检查。");
      return;
    }
    state.session.pointer += 1;
    renderCurrentQuestion();
    return;
  }

  state.session.pointer += 1;
  if (state.session.pointer >= state.session.queue.length) {
    const nowWrong = Object.keys(state.wrongBook).length;
    const reduced = Math.max(0, state.session.startWrongCount - nowWrong);
    finishSession(
      `练习完成：共 ${state.session.queue.length} 题，本次消灭错题 ${reduced} 题。`
    );
    return;
  }
  renderCurrentQuestion();
}

function prevQuestion() {
  if (!state.session.active || state.session.practiceType !== "exam") {
    return;
  }
  persistCurrentExamSelection();
  if (state.session.pointer <= 0) {
    setStatus("已是第一题。");
    return;
  }
  state.session.pointer -= 1;
  renderCurrentQuestion();
}

function requestSubmitExam() {
  if (!state.session.active || state.session.practiceType !== "exam") {
    return;
  }
  persistCurrentExamSelection();
  const report = buildExamReport();
  const remaining = Math.max(0, report.total - report.answered);
  const prompt =
    remaining > 0
      ? `还有 ${remaining} 题未作答，确定现在交卷吗？`
      : "确定现在交卷吗？";
  if (!window.confirm(prompt)) {
    return;
  }
  finalizeExam("manual");
}

function finalizeExam(reason) {
  if (!state.session.active || state.session.practiceType !== "exam") {
    return;
  }
  persistCurrentExamSelection();
  const report = buildExamReport();
  applyExamReportToStats(report);
  state.session.examTotal = report.total;
  state.session.examAnswered = report.answered;
  state.session.examCorrect = report.correct;

  finishSession(
    `考试完成：共 ${report.total} 题，答对 ${report.correct} 题，正确率 ${report.accuracyText}。`
  );
  renderExamResult(report);

  if (reason === "timeout") {
    setStatus(`考试时间到，已自动交卷。成绩：${report.correct}/${report.total}`);
  } else if (reason === "manual") {
    setStatus(`已交卷。成绩：${report.correct}/${report.total}`);
  } else {
    setStatus(`考试结束。成绩：${report.correct}/${report.total}`);
  }
}

function applyExamReportToStats(report) {
  report.details.forEach((item) => {
    const question = state.bank.find((q) => q.id === item.id);
    if (!question) return;
    if (!["pass", "fail"].includes(item.status)) return;

    state.progress.answered += 1;
    if (item.status === "pass") {
      state.progress.correct += 1;
      delete state.wrongBook[question.id];
      return;
    }

    state.progress.wrong += 1;
    state.wrongBook[question.id] = {
      count: (state.wrongBook[question.id]?.count || 0) + 1,
      lastAnswer: item.selected.join(","),
      lastAt: new Date().toISOString(),
    };
  });
  saveState();
  refreshStats();
  renderWrongList();
}

function buildExamReport() {
  const details = state.session.queue
    .map((id, index) => {
      const question = state.bank.find((q) => q.id === id);
      if (!question) return null;
      const record = state.session.examRecords[id];
      if (question.type === "short") {
        const selectedText = String(record?.selectedText || "").trim();
        return {
          id,
          index: index + 1,
          type: "short",
          status: selectedText ? "subjective_answered" : "subjective_unanswered",
          chapter: question.chapter || "未分章",
          stem: question.stem,
          selected: selectedText ? [selectedText] : [],
          selectedText,
          answer: [],
          answerText: question.answerText || question.explanation || "",
          explanation: question.explanation || "",
        };
      }
      const selected = record?.selected ? [...record.selected] : [];
      const correct = selected.length > 0 && isSameAnswer(selected, question.answer);
      const status =
        selected.length === 0 ? "unanswered" : correct ? "pass" : "fail";
      return {
        id,
        index: index + 1,
        type: question.type || "single",
        status,
        chapter: question.chapter || "未分章",
        stem: question.stem,
        selected,
        answer: [...question.answer],
        answerText: question.answerText || "",
        explanation: question.explanation || "",
      };
    })
    .filter(Boolean);

  const total = details.length;
  const answered = details.filter(
    (item) => !["unanswered", "subjective_unanswered"].includes(item.status)
  ).length;
  const correct = details.filter((item) => item.status === "pass").length;
  const wrong = details.filter((item) => item.status === "fail").length;
  const unanswered = total - answered;
  const objectiveTotal = details.filter((item) => item.type !== "short").length;
  const subjectiveTotal = details.filter((item) => item.type === "short").length;
  const accuracy = objectiveTotal === 0 ? 0 : (correct / objectiveTotal) * 100;

  return {
    total,
    answered,
    correct,
    wrong,
    unanswered,
    objectiveTotal,
    subjectiveTotal,
    accuracyText: `${accuracy.toFixed(1)}%`,
    details,
  };
}

function renderExamResult(report) {
  state.examResult = report;
  state.examResultFilter = "all";
  els.examResultPanel.classList.remove("hidden");
  els.examResultFilterSelect.value = "all";
  els.examSummary.innerHTML = `
    <p>总题数：${report.total}</p>
    <p>客观题：${report.objectiveTotal}｜主观题：${report.subjectiveTotal}</p>
    <p>已作答：${report.answered}</p>
    <p>答对：${report.correct}</p>
    <p>答错：${report.wrong}</p>
    <p>未作答：${report.unanswered}</p>
    <p>客观题正确率：${report.accuracyText}</p>
  `;
  renderExamResultList();
}

function renderExamResultList() {
  if (!state.examResult) {
    els.examResultList.innerHTML = "<p>暂无作答记录。</p>";
    return;
  }
  const statusLabel = {
    pass: "正确",
    fail: "错误",
    unanswered: "未作答",
    subjective_answered: "主观题已作答",
    subjective_unanswered: "主观题未作答",
  };
  const filter = state.examResultFilter || "all";
  const details = state.examResult.details.filter((item) => {
    if (filter === "all") return true;
    return item.status === filter;
  });

  const cards = details
    .map((item) => {
      if (item.type === "short") {
        return `
          <article class="exam-item ${item.status}">
            <h3>${item.index}. ${escapeHtml(item.stem)}</h3>
            <p>章节：${escapeHtml(item.chapter)}</p>
            <p>结果：${statusLabel[item.status]}</p>
            <p>你的作答：${escapeHtml(item.selectedText || "未作答")}</p>
            <p>参考答案：${escapeHtml(item.answerText || item.explanation || "暂无")}</p>
          </article>
        `;
      }
      return `
        <article class="exam-item ${item.status}">
          <h3>${item.index}. ${escapeHtml(item.stem)}</h3>
          <p>章节：${escapeHtml(item.chapter)}</p>
          <p>结果：${statusLabel[item.status]}</p>
          <p>你的答案：${item.selected.length ? item.selected.join("、") : "未作答"}</p>
          <p>正确答案：${item.answer.join("、")}</p>
          <p>解析：${escapeHtml(item.explanation || "暂无")}</p>
        </article>
      `;
    })
    .join("");

  els.examResultList.innerHTML = cards || "<p>当前筛选无题目。</p>";
}

function onExamResultFilterChange() {
  if (!state.examResult) {
    return;
  }
  state.examResultFilter = els.examResultFilterSelect.value || "all";
  renderExamResultList();
}

function resetExamResultPanel() {
  els.examResultPanel.classList.add("hidden");
  state.examResult = null;
  state.examResultFilter = "all";
  els.examSummary.innerHTML = "";
  els.examResultFilterSelect.value = "all";
  els.examResultList.innerHTML = "";
}

function startExamTimer() {
  if (state.session.practiceType !== "exam") {
    return;
  }
  stopExamTimer();
  state.session.examEndAt = Date.now() + state.session.examDurationSec * 1000;
  els.examTimer.classList.remove("hidden");
  updateExamTimerUI();

  state.session.examTimerId = window.setInterval(() => {
    if (!state.session.active || state.session.practiceType !== "exam") {
      stopExamTimer();
      return;
    }
    updateExamTimerUI();
    const left = Math.max(
      0,
      Math.ceil((state.session.examEndAt - Date.now()) / 1000)
    );
    if (left <= 0) {
      finalizeExam("timeout");
    }
  }, 1000);
}

function stopExamTimer() {
  if (state.session.examTimerId) {
    clearInterval(state.session.examTimerId);
    state.session.examTimerId = null;
  }
}

function updateExamTimerUI() {
  if (state.session.practiceType !== "exam") {
    return;
  }
  const left = Math.max(0, Math.ceil((state.session.examEndAt - Date.now()) / 1000));
  els.examTimer.textContent = formatDuration(left);
}

function formatDuration(totalSec) {
  const sec = Math.max(0, totalSec);
  const hour = Math.floor(sec / 3600);
  const min = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (hour > 0) {
    return `${String(hour).padStart(2, "0")}:${String(min).padStart(
      2,
      "0"
    )}:${String(s).padStart(2, "0")}`;
  }
  return `${String(min).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function finishSession(summary) {
  stopExamTimer();
  state.session.active = false;
  els.questionBox.textContent = summary;
  els.optionBox.innerHTML = "";
  els.feedbackBox.className = "feedback-box";
  els.feedbackBox.innerHTML = "";
  els.prevBtn.classList.add("hidden");
  els.clearAnswerBtn.classList.add("hidden");
  els.submitBtn.classList.add("hidden");
  els.submitExamBtn.classList.add("hidden");
  els.nextBtn.classList.add("hidden");
  els.examTimer.classList.add("hidden");
  els.answerCardPanel.classList.add("hidden");
  els.answerCardStats.textContent = "";
  els.answerCardFilterSelect.value = "all";
  els.answerCardGrid.innerHTML = "";
}

function renderWrongList() {
  const wrongIds = Object.keys(state.wrongBook);
  if (wrongIds.length === 0) {
    els.wrongList.innerHTML = "<p>当前没有错题。</p>";
    return;
  }

  const cards = wrongIds
    .map((id) => {
      const question = state.bank.find((q) => q.id === id);
      if (!question) return "";
      const record = state.wrongBook[id];
      return `
        <article class="wrong-item">
          <h3>${escapeHtml(question.stem)}</h3>
          <p>章节：${escapeHtml(question.chapter || "未分章")}</p>
          <p>正确答案：${question.answer.join("、") || question.answerText || "暂无"}</p>
          <p>错误次数：${record.count}</p>
          <p>最近错误作答：${record.lastAnswer || "-"}</p>
        </article>
      `;
    })
    .filter(Boolean)
    .join("");

  els.wrongList.innerHTML = cards || "<p>当前没有错题。</p>";
}

function resetProgress() {
  state.progress = { answered: 0, correct: 0, wrong: 0 };
  saveState();
  refreshStats();
  setStatus("已重置做题进度（保留题库与错题本）。");
}

function clearWrongBook() {
  state.wrongBook = {};
  saveState();
  refreshStats();
  renderWrongList();
  setStatus("已清空错题本。");
}

function exportWrongBookTxt() {
  const report = buildWrongBookReport();
  if (report.items.length === 0) {
    setStatus("当前没有错题可导出。", true);
    return;
  }
  const now = new Date();
  const filename = `心理学错题本_${formatDateKey(now)}.txt`;
  const lines = [
    `心理学错题本`,
    `导出时间：${now.toLocaleString()}`,
    `错题数量：${report.items.length}`,
    "",
  ];
  report.items.forEach((item, index) => {
    lines.push(
      `${index + 1}. ${item.stem}`,
      `章节：${item.chapter}`,
      `你的答案：${item.lastAnswer || "未记录"}`,
      `正确答案：${item.answer}`,
      `错误次数：${item.count}`,
      `解析：${item.explanation || "暂无"}`,
      ""
    );
  });

  downloadBlob(filename, new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" }));
  setStatus(`已导出 TXT：${filename}`);
}

function exportWrongBookWord() {
  const report = buildWrongBookReport();
  if (report.items.length === 0) {
    setStatus("当前没有错题可导出。", true);
    return;
  }
  const now = new Date();
  const filename = `心理学错题本_${formatDateKey(now)}.doc`;
  const rows = report.items
    .map((item, index) => {
      return `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(item.chapter)}</td>
          <td>${escapeHtml(item.stem)}</td>
          <td>${escapeHtml(item.lastAnswer || "未记录")}</td>
          <td>${escapeHtml(item.answer)}</td>
          <td>${item.count}</td>
          <td>${escapeHtml(item.explanation || "暂无")}</td>
        </tr>
      `;
    })
    .join("");

  const html = `
    <html>
      <head>
        <meta charset="utf-8" />
        <title>心理学错题本</title>
        <style>
          body { font-family: "SimSun", "Songti SC", serif; padding: 16px; }
          h1 { margin: 0 0 8px; }
          p { margin: 4px 0 10px; }
          table { border-collapse: collapse; width: 100%; }
          th, td { border: 1px solid #999; padding: 6px; vertical-align: top; font-size: 12pt; }
          th { background: #f2f2f2; }
        </style>
      </head>
      <body>
        <h1>心理学错题本</h1>
        <p>导出时间：${escapeHtml(now.toLocaleString())}</p>
        <p>错题数量：${report.items.length}</p>
        <table>
          <thead>
            <tr>
              <th>序号</th>
              <th>章节</th>
              <th>题目</th>
              <th>你的答案</th>
              <th>正确答案</th>
              <th>错误次数</th>
              <th>解析</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </body>
    </html>
  `;

  downloadBlob(
    filename,
    new Blob(["\ufeff", html], { type: "application/msword;charset=utf-8" })
  );
  setStatus(`已导出 Word：${filename}`);
}

function buildWrongBookReport() {
  const wrongIds = Object.keys(state.wrongBook);
  const items = wrongIds
    .map((id) => {
      const question = state.bank.find((q) => q.id === id);
      const record = state.wrongBook[id];
      if (!question || !record) return null;
      return {
        stem: question.stem,
        chapter: question.chapter || "未分章",
        answer: question.answer.join("、") || question.answerText || "暂无",
        explanation: question.explanation || "",
        lastAnswer: record.lastAnswer || "",
        count: record.count || 0,
      };
    })
    .filter(Boolean);
  return { items };
}

function clearBank() {
  stopExamTimer();
  state.bank = [];
  state.progress = { answered: 0, correct: 0, wrong: 0 };
  state.wrongBook = {};
  state.session = createDefaultSession();
  localStorage.setItem(STORAGE_KEYS.seedVersion, "custom");
  saveState();
  els.quizPanel.classList.add("hidden");
  resetExamResultPanel();
  renderChapterOptions();
  refreshStats();
  renderWrongList();
  setStatus("题库已清空。");
}

function shuffle(list) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function isSameAnswer(input, target) {
  return [...input].sort().join(",") === [...target].sort().join(",");
}

function formatDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${y}${m}${d}_${h}${min}`;
}

function downloadBlob(filename, blob) {
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(text) {
  return escapeHtml(text).replace(/"/g, "&quot;");
}
