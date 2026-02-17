(() => {
  const $ = (id) => document.getElementById(id);

  // UI
  const hudProgress = $("hudProgress");
  const hudScore = $("hudScore");
  const equationBox = $("equationBox");
  const roundMsg = $("roundMsg");
  const studentIdInput = $("studentId");
  const startBtn = $("startBtn");
  const coeffForm = $("coeffForm");
  const submitBtn = $("submitBtn");
  const statusBox = $("statusBox");

  // Game state
  const TOTAL_ROUNDS = 5;

  const state = {
    started: false,
    studentId: "",
    roundIndex: 0,     // 0..4
    totalScore: 0,
    current: null,     // current problem
    attempts: 0,       // wrong attempts in current round
    roundScores: [],   // per round score
  };

  // ---------- utilities ----------
  const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
  const choice = (arr) => arr[Math.floor(Math.random() * arr.length)];

  function setStatus(msg) {
    statusBox.textContent = msg;
  }

  function updateHud() {
    hudProgress.textContent = `진행: ${state.started ? (state.roundIndex + 1) : "-"} / ${TOTAL_ROUNDS}`;
    hudScore.textContent = `누적점수: ${state.totalScore}`;
  }

  // ---------- polynomial generation ----------
  function genProblem() {
    const isCubic = Math.random() < 0.5; // 50:50
    if (isCubic) {
      // Ax^3 + Bx + C
      const A = choice([-2, -1, 1, 2]);
      const B = randInt(-4, 4);
      const C = randInt(-4, 4);
      return {
        degree: 3,
        form: "cubic_ABxC",
        labels: ["A", "B", "C"],
        powers: [3, 1, 0],
        coeffs: [A, B, C],
        display: () => `f(x) = A x³ + B x + C (A ∈ {-2,-1,1,2}, |B|,|C| ≤ 4)`
      };
    }

    // quartic: 50:50 between two forms
    const form = Math.random() < 0.5 ? "quartic_Bx2" : "quartic_Bx3";
    const A = choice([-2, -1, 1, 2]);
    const B = randInt(-4, 4);
    const C = randInt(-4, 4);
    const D = randInt(-4, 4);

    if (form === "quartic_Bx2") {
      // Ax^4 + Bx^2 + Cx + D
      return {
        degree: 4,
        form,
        labels: ["A", "B", "C", "D"],
        powers: [4, 2, 1, 0],
        coeffs: [A, B, C, D],
        display: () => `f(x) = A x⁴ + B x² + C x + D (A ∈ {-2,-1,1,2}, |B|,|C|,|D| ≤ 4)`
      };
    }

    // Ax^4 + Bx^3 + Cx + D
    return {
      degree: 4,
      form,
      labels: ["A", "B", "C", "D"],
      powers: [4, 3, 1, 0],
      coeffs: [A, B, C, D],
      display: () => `f(x) = A x⁴ + B x³ + C x + D (A ∈ {-2,-1,1,2}, |B|,|C|,|D| ≤ 4)`
    };
  }

  function renderCoeffInputs(problem) {
    coeffForm.innerHTML = "";
    problem.labels.forEach((label, i) => {
      const wrap = document.createElement("div");
      wrap.style.display = "grid";
      wrap.style.gridTemplateColumns = "64px 1fr";
      wrap.style.alignItems = "center";
      wrap.style.gap = "10px";

      const lab = document.createElement("div");
      lab.textContent = label;
      lab.style.fontWeight = "700";
      lab.style.fontSize = "18px";

      const input = document.createElement("input");
      input.type = "number";
      input.step = "1";
      input.inputMode = "numeric";
      input.pattern = "[-0-9]*";
      input.id = `coef_${label}`;
      input.placeholder = "정수 입력";
      input.style.width = "100%";

      wrap.appendChild(lab);
      wrap.appendChild(input);
      coeffForm.appendChild(wrap);
    });
  }

  function readCoeffInputs(problem) {
    const values = [];
    for (const label of problem.labels) {
      const el = $(`coef_${label}`);
      const raw = (el.value ?? "").trim();
      // 빈칸 방지
      if (raw === "") return { ok: false, msg: `${label} 값을 입력하세요.` };
      // 정수 체크
      if (!/^-?\d+$/.test(raw)) return { ok: false, msg: `${label}는 정수만 가능합니다.` };
      values.push(parseInt(raw, 10));
    }
    return { ok: true, values };
  }

  function arraysEqual(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }

  // ---------- scoring ----------
  // 1단계에서는 힌트 없음(h=0). 라운드 기본 5점, 오답 1회당 -2점.
  function calcRoundScore(wrongAttempts) {
    return 5 - 2 * wrongAttempts;
  }

  // ---------- flow ----------
  function startGame() {
    const id = studentIdInput.value.trim();
    if (!id) {
      setStatus("이름 또는 학번을 입력하세요.");
      return;
    }
    state.started = true;
    state.studentId = id;
    state.roundIndex = 0;
    state.totalScore = 0;
    state.roundScores = [];
    beginRound();
  }

  function beginRound() {
    state.attempts = 0;
    state.current = genProblem();
    equationBox.textContent = state.current.display();
    roundMsg.innerHTML = `<div style="opacity:.9">문제 ${state.roundIndex + 1} / ${TOTAL_ROUNDS}</div>`;
    renderCoeffInputs(state.current);
    submitBtn.disabled = false;
    setStatus("계수를 입력하고 ‘정답 제출’을 누르세요.");
    updateHud();
  }

  function endRoundRevealAndNext({ correct }) {
    const wrong = state.attempts;
    const roundScore = calcRoundScore(wrong);
    state.roundScores.push(roundScore);
    state.totalScore += roundScore;

    const ans = state.current.labels
      .map((L, i) => `${L}=${state.current.coeffs[i]}`)
      .join(", ");

    roundMsg.innerHTML =
      `<div style="font-weight:700; font-size:18px; margin-top:6px;">${correct ? "정답!" : "정답 공개"}</div>` +
      `<div style="margin-top:6px;">정답: ${ans}</div>` +
      `<div style="margin-top:6px;">이번 문제 점수: <b>${roundScore}</b> (기본 5점, 오답 ${wrong}회 × -2)</div>` +
      `<button id="nextBtn" style="margin-top:12px; width:100%;">다음 문제</button>`;

    submitBtn.disabled = true;
    updateHud();

    // Next button handler
    setTimeout(() => {
      const nextBtn = document.getElementById("nextBtn");
      if (nextBtn) {
        nextBtn.onclick = () => {
          state.roundIndex += 1;
          if (state.roundIndex >= TOTAL_ROUNDS) {
            endSession();
          } else {
            beginRound();
          }
        };
      }
    }, 0);
  }

  function endSession() {
    equationBox.textContent = "세션 종료";
    const total = state.totalScore;
    const per = state.roundScores.map((s, i) => `문제${i + 1}: ${s}`).join(" / ");

    roundMsg.innerHTML =
      `<div style="font-weight:800; font-size:20px;">${state.studentId} 님 결과</div>` +
      `<div style="margin-top:8px;">총점(5문제 누적): <b>${total}</b></div>` +
      `<div style="margin-top:8px; opacity:.85;">${per}</div>` +
      `<button id="restartBtn" style="margin-top:12px; width:100%;">다시 하기</button>`;

    submitBtn.disabled = true;
    coeffForm.innerHTML = "";
    setStatus("2단계에서 힌트/그래프/랭킹을 붙입니다.");
    updateHud();

    setTimeout(() => {
      const r = document.getElementById("restartBtn");
      if (r) {
        r.onclick = () => {
          state.started = false;
          state.current = null;
          equationBox.textContent = "";
          roundMsg.textContent = "";
          setStatus("대기 중");
          updateHud();
        };
      }
    }, 0);
  }

  function submitAnswer() {
    if (!state.started || !state.current) return;

    const { ok, values, msg } = readCoeffInputs(state.current);
    if (!ok) {
      setStatus(msg);
      return;
    }

    if (arraysEqual(values, state.current.coeffs)) {
      setStatus("정답 처리 중...");
      endRoundRevealAndNext({ correct: true });
      return;
    }

    // wrong
    state.attempts += 1;
    state.totalScore -= 2; // 즉시 반영(누적점수)
    updateHud();

    if (state.attempts >= 2) {
      setStatus("오답 2회: 정답을 공개합니다.");
      endRoundRevealAndNext({ correct: false });
    } else {
      setStatus(`오답입니다. (-2점) 남은 기회: ${2 - state.attempts}회`);
    }
  }

  // ---------- wire ----------
  startBtn.addEventListener("click", startGame);
  submitBtn.addEventListener("click", submitAnswer);

  // init
  updateHud();
  setStatus("대기 중");
})();
