// 초6 영단어 이미지 퀴즈 (GitHub Pages용 정적 웹앱)
//
// UX 포함:
// - 정답: 👏 칭찬 + 다음 버튼 활성화 + (옵션) 1.1초 후 자동 다음
// - 오답 1회: "비슷해요! 다시!" 같은 부드러운 메시지
// - 오답 2회: 예문 1개 공개
// - 오답 3회 이상: 예문 2개(이상) 공개 + (옵션) 글자수 힌트
// - 오답노트: 틀린 단어만 다시 풀기 (localStorage 저장)
//
// 데이터는 data/words.json 에서 불러옵니다.
// { answer, image, sentences[], category }

const screens = {
  home: document.getElementById("screenHome"),
  quiz: document.getElementById("screenQuiz"),
  finish: document.getElementById("screenFinish"),
};

const el = {
  btnHome: document.getElementById("btnHome"),
  btnStart: document.getElementById("btnStart"),
  btnBackHome: document.getElementById("btnBackHome"),
  btnStartReview: document.getElementById("btnStartReview"),
  submitBtn: document.getElementById("submitBtn"),
  nextBtn: document.getElementById("nextBtn"),
  finishBtn: document.getElementById("finishBtn"),

  categorySelect: document.getElementById("categorySelect"),
  chkAutoNext: document.getElementById("chkAutoNext"),
  chkShowLen: document.getElementById("chkShowLen"),
  chkShuffleEach: document.getElementById("chkShuffleEach"),
  chkCaseStrict: document.getElementById("chkCaseStrict"),

  img: document.getElementById("quizImage"),
  input: document.getElementById("answerInput"),
  result: document.getElementById("result"),
  hintList: document.getElementById("hintList"),
  lenHint: document.getElementById("lenHint"),
  speakBtn: document.getElementById("speakBtn"),
  scoreText: document.getElementById("scoreText"),
  progressText: document.getElementById("progressText"),
  summaryBox: document.getElementById("summaryBox"),
  wrongList: document.getElementById("wrongList"),
};

let allWords = [];
let sessionWords = [];
let qIndex = 0;

let stats = {
  correct: 0,
  attempts: 0,
  wrongThisQ: 0, // current question wrong attempts
};

let autoNextTimer = null;

const PRAISE = [
  "👏 Great! 정답!",
  "🎉 Awesome! 맞았어요!",
  "🌟 Perfect! 정답!",
  "✅ Correct! 아주 좋아요!",
];

const SOFT_WRONG_1 = [
  "거의 다 왔어요! 다시 한 번!",
  "비슷해요! 한 번 더 도전!",
  "괜찮아요! 다시 생각해볼까요?",
  "조금만 더! 다시 입력해봐요!",
];

// localStorage keys
const LS_WRONG = "wordquiz_wrong_v1";

function showScreen(which) {
  Object.values(screens).forEach(s => s.classList.remove("active"));
  screens[which].classList.add("active");
}

function randPick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function speakWord(word) {
  // Uses the browser's built-in Text-to-Speech (Web Speech API).
  // Works on most modern browsers. On iOS Safari, user gesture is required (button click OK).
  if (!("speechSynthesis" in window)) {
    alert("이 브라우저는 발음 기능을 지원하지 않아요.");
    return;
  }
  const text = (word || "").trim();
  if (!text) return;

  // Stop any ongoing speech
  window.speechSynthesis.cancel();

  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-US";
  u.rate = 0.9;   // slightly slower for learners
  u.pitch = 1.0;
  u.volume = 1.0;

  // Try to pick an English voice if available
  const voices = window.speechSynthesis.getVoices ? window.speechSynthesis.getVoices() : [];
  const enVoice = voices.find(v => /en(-|_)?(US|GB)?/i.test(v.lang)) || voices.find(v => /English/i.test(v.name));
  if (enVoice) u.voice = enVoice;

  window.speechSynthesis.speak(u);
}

function speakCurrent() {
  const q = sessionWords[qIndex];
  if (!q) return;
  speakWord(q.answer);
}


function normalize(s, caseStrict) {
  const t = (s || "").trim();
  return caseStrict ? t : t.toLowerCase();
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function loadWrongSet() {
  try {
    const raw = localStorage.getItem(LS_WRONG);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(arr);
  } catch {
    return new Set();
  }
}

function saveWrongSet(setObj) {
  localStorage.setItem(LS_WRONG, JSON.stringify(Array.from(setObj)));
}

function clearAutoNext() {
  if (autoNextTimer) {
    clearTimeout(autoNextTimer);
    autoNextTimer = null;
  }
}

function setResult(text, kind) {
  el.result.textContent = text;
  el.result.className = "result" + (kind ? ` ${kind}` : "");
}

function setHints(sentences = []) {
  el.hintList.innerHTML = "";
  sentences.forEach(s => {
    const li = document.createElement("li");
    li.textContent = s;
    el.hintList.appendChild(li);
  });
}

function setLenHint(text = "") {
  el.lenHint.textContent = text;
}

function updateScore() {
  el.scoreText.textContent = `정답 ${stats.correct} / 시도 ${stats.attempts}`;
  el.progressText.textContent = `${qIndex + 1} / ${sessionWords.length}`;
}

function getSelectedMode() {
  const r = document.querySelector('input[name="mode"]:checked');
  return r ? r.value : "all";
}

function getSelectedCategory() {
  return el.categorySelect.value || "ALL";
}

function buildSessionWords() {
  const mode = getSelectedMode();
  const category = getSelectedCategory();
  const wrongSet = loadWrongSet();

  let base = allWords.slice();

  if (category !== "ALL") {
    base = base.filter(w => (w.category || "Other") === category);
  }

  if (mode === "review") {
    base = base.filter(w => wrongSet.has((w.answer || "").toLowerCase()));
  }

  if (el.chkShuffleEach.checked) shuffle(base);
  sessionWords = base;

  return { mode, category, wrongCount: wrongSet.size, sessionCount: sessionWords.length };
}

function startQuiz({ forceMode = null } = {}) {
  clearAutoNext();
  stats = { correct: 0, attempts: 0, wrongThisQ: 0 };
  qIndex = 0;

  if (forceMode) {
    document.querySelectorAll('input[name="mode"]').forEach(i => {
      if (i.value === forceMode) i.checked = true;
    });
  }

  const info = buildSessionWords();
  if (info.sessionCount === 0) {
    if (info.mode === "review") {
      alert("오답노트에 아직 단어가 없어요! 먼저 전체 퀴즈를 풀어주세요.");
      showScreen("home");
      return;
    }
    alert("선택한 카테고리에 문제가 없어요. data/words.json을 확인해주세요.");
    showScreen("home");
    return;
  }

  showScreen("quiz");
  loadQuestion();
}

function loadQuestion() {
  clearAutoNext();
  el.nextBtn.disabled = true;
  el.input.value = "";
  el.input.focus();

  stats.wrongThisQ = 0;
  setResult("", "");
  setHints([]);
  setLenHint("");

  const q = sessionWords[qIndex];
  el.img.src = q.image;
  updateScore();
}

function revealHints(q) {
  // 2번 이상 오답이면 예문 단계 공개: 2번째=1개, 3번째=2개...
  if (stats.wrongThisQ < 2) {
    setHints([]);
    return;
  }
  const showCount = Math.min(stats.wrongThisQ - 1, (q.sentences || []).length);
  setHints((q.sentences || []).slice(0, showCount));

  // 3번째 오답부터 글자수 힌트(옵션)
  if (el.chkShowLen.checked && stats.wrongThisQ >= 3) {
    const ans = (q.answer || "");
    setLenHint(`🔎 글자수 힌트: ${ans.length} letters`);
  }
}

function markWrong(answerLower) {
  const wrongSet = loadWrongSet();
  wrongSet.add(answerLower);
  saveWrongSet(wrongSet);
}

function unmarkWrong(answerLower) {
  const wrongSet = loadWrongSet();
  if (wrongSet.has(answerLower)) {
    wrongSet.delete(answerLower);
    saveWrongSet(wrongSet);
  }
}

function checkAnswer() {
  const q = sessionWords[qIndex];
  const caseStrict = el.chkCaseStrict.checked;

  const user = normalize(el.input.value, caseStrict);
  if (!user) return;

  const ans = normalize(q.answer, caseStrict);

  stats.attempts += 1;

  if (user === ans) {
    stats.correct += 1;
    // 맞히면 오답노트에서 제거
    unmarkWrong((q.answer || "").toLowerCase());

    setResult(randPick(PRAISE), "ok");
    el.nextBtn.disabled = false;
    setHints([]);
    setLenHint("");

    // 자동 다음(옵션)
    if (el.chkAutoNext.checked) {
      clearAutoNext();
      autoNextTimer = setTimeout(() => nextQuestion(), 1100);
    }
  } else {
    stats.wrongThisQ += 1;
    // 오답노트에 추가
    markWrong((q.answer || "").toLowerCase());

    if (stats.wrongThisQ === 1) {
      setResult("❌ " + randPick(SOFT_WRONG_1), "no");
    } else {
      setResult("❌ 오답! 힌트를 확인하고 다시 해봐요.", "no");
    }
    revealHints(q);
  }

  updateScore();
}

function nextQuestion() {
  clearAutoNext();
  if (qIndex < sessionWords.length - 1) {
    qIndex += 1;
    loadQuestion();
  } else {
    finishQuiz();
  }
}

function finishQuiz() {
  clearAutoNext();
  showScreen("finish");

  const mode = getSelectedMode();
  const category = getSelectedCategory();
  const pct = stats.attempts ? Math.round((stats.correct / stats.attempts) * 100) : 0;

  el.summaryBox.innerHTML = `
    <b>결과</b><br/>
    모드: <b>${mode === "review" ? "오답노트" : "전체 퀴즈"}</b> / 카테고리: <b>${category}</b><br/>
    정답: <b>${stats.correct}</b> / 시도: <b>${stats.attempts}</b> (정답률: <b>${pct}%</b>)
  `;

  renderWrongList();
}

function renderWrongList() {
  const wrongSet = loadWrongSet();
  el.wrongList.innerHTML = "";

  if (wrongSet.size === 0) {
    el.wrongList.innerHTML = `<span class="tag">오답노트가 비어 있어요 ✅</span>`;
    return;
  }

  // 표시용으로 answer만 나열
  [...wrongSet].sort().forEach(w => {
    const span = document.createElement("span");
    span.className = "tag";
    span.textContent = w;
    el.wrongList.appendChild(span);
  });
}

function populateCategories() {
  const cats = new Set(["ALL"]);
  allWords.forEach(w => cats.add(w.category || "Other"));

  // reset options
  el.categorySelect.innerHTML = "";
  [...cats].forEach(c => {
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = c === "ALL" ? "전체" : c;
    el.categorySelect.appendChild(opt);
  });
}

function wireUI() {
  el.btnHome.addEventListener("click", () => {
    clearAutoNext();
    showScreen("home");
  });

  el.btnStart.addEventListener("click", () => startQuiz());
  el.btnBackHome.addEventListener("click", () => showScreen("home"));
  el.btnStartReview.addEventListener("click", () => startQuiz({ forceMode: "review" }));

  el.submitBtn.addEventListener("click", checkAnswer);
  el.speakBtn.addEventListener("click", speakCurrent);
  el.nextBtn.addEventListener("click", nextQuestion);
  el.finishBtn.addEventListener("click", finishQuiz);

  el.input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") checkAnswer();
  });
}

async function init() {
  wireUI();

  const res = await fetch("data/words.json");
  allWords = await res.json();

  // 기본 검증: sentences 2개 이상 권장
  allWords = allWords.filter(w => w && w.answer && w.image && Array.isArray(w.sentences));

  populateCategories();
  showScreen("home");
}

init();
