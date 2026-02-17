(() => {
  const $ = (id) => document.getElementById(id);

  // HUD
  const hudPlayer = $("hudPlayer");
  const hudProgress = $("hudProgress");
  const hudScore = $("hudScore");
  const hudRoundScore = $("hudRoundScore");

  // Left panel
  const equationBox = $("equationBox");
  const hintOrderEl = $("hintOrder");
  const wrongCountEl = $("wrongCount");
  const hintLogEl = $("hintLog");
  const roundMsgEl = $("roundMsg");

  // Right panel start / inputs
  const studentIdInput = $("studentId");
  const startBtn = $("startBtn");
  const coeffForm = $("coeffForm");
  const submitBtn = $("submitBtn");
  const statusBox = $("statusBox");

  // Hint buttons
  const hintBtns = {
    1: $("hint1"),
    2: $("hint2"),
    3: $("hint3"),
    4: $("hint4"),
    5: $("hint5"),
    6: $("hint6"),
    7: $("hint7"),
    8: $("hint8"),
    9: $("hint9"),
  };

  // Hint inputs
  const hint4x = $("hint4x");
  const hint4go = $("hint4go");
  const hint9k = $("hint9k");
  const hint9go = $("hint9go");

  // Ranking
  const rankList = $("rankList");
  const adminPin = $("adminPin");
  const resetRankBtn = $("resetRankBtn");

  // ---- constants ----
  const TOTAL_ROUNDS = 5;
  const ADMIN_PIN = "3141"; // 원하는 값으로 바꿔도 됨
  const RANK_KEY = "calc_poly_rank_v1";

  // ---- state ----
  const state = {
    started: false,
    studentId: "",
    roundIndex: 0,
    totalScore: 0,

    current: null,        // problem object
    wrongAttempts: 0,

    hintUsed: null,       // {1:true,...,9:true} except 4 uses count separately
    hint4Count: 0,
    usedHintsOrder: [],   // [1,4,9,...] with repeats for hint4 if used twice

    // logs per round
    roundLogs: [],        // {degree, form, coeffs, usedHintsOrder, hint4Queries, hint9Queries, wrongAttempts, roundScore, revealed}
    hint4Queries: [],     // [{x, fx}]
    hint9Queries: [],     // [{k, count}]
  };

  // -------------------- utilities --------------------
  const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
  const choice = (arr) => arr[Math.floor(Math.random() * arr.length)];

  const isIntString = (s) => /^-?\d+$/.test(String(s).trim());

  function setStatus(msg) {
    statusBox.textContent = msg;
  }

  function setHintLog(text, append = true) {
    if (!append || !hintLogEl.textContent.trim()) {
      hintLogEl.textContent = text;
      return;
    }
    hintLogEl.textContent += "\n" + text;
  }

  function clearHintLog() {
    hintLogEl.textContent = "";
  }

  function updateHud() {
    hudPlayer.textContent = `참가자: ${state.started ? state.studentId : "-"}`;
    hudProgress.textContent = `진행: ${state.started ? (state.roundIndex + 1) : "-"} / ${TOTAL_ROUNDS}`;
    hudScore.textContent = `누적점수: ${state.totalScore}`;
    hudRoundScore.textContent = `이번문제 예상점수: ${calcRoundScorePreview()}`;
  }

  function renderHintOrder() {
    if (state.usedHintsOrder.length === 0) hintOrderEl.textContent = "-";
    else hintOrderEl.textContent = state.usedHintsOrder.join(" → ");
  }

  function renderWrong() {
    wrongCountEl.textContent = String(state.wrongAttempts);
  }

  function disableHintButton(n, usedClass = true) {
    const btn = hintBtns[n];
    if (!btn) return;
    btn.disabled = true;
    if (usedClass) btn.classList.add("used");
  }

  function enableHintButton(n) {
    const btn = hintBtns[n];
    if (!btn) return;
    btn.disabled = false;
    btn.classList.remove("used");
  }

  function resetHintButtons() {
    for (let i = 1; i <= 9; i++) enableHintButton(i);
  }

  // -------------------- polynomial representation --------------------
  // problem: { degree, form, labels, powers, coeffs }
  // powers align with labels/coeffs
  function polyEval(problem, x) {
    let s = 0;
    for (let i = 0; i < problem.powers.length; i++) {
      s += problem.coeffs[i] * Math.pow(x, problem.powers[i]);
    }
    return s;
  }

  function polyDeriv(problem) {
    const pows = [];
    const coefs = [];
    for (let i = 0; i < problem.powers.length; i++) {
      const p = problem.powers[i];
      const a = problem.coeffs[i];
      if (p === 0) continue;
      pows.push(p - 1);
      coefs.push(a * p);
    }
    return { powers: pows, coeffs: coefs };
  }

  function polyEvalGeneric(poly, x) {
    let s = 0;
    for (let i = 0; i < poly.powers.length; i++) {
      s += poly.coeffs[i] * Math.pow(x, poly.powers[i]);
    }
    return s;
  }

  // Cauchy root bound for polynomial h(x) = a_n x^n + ... + a0 (a_n != 0)
  // bound <= 1 + max_i |a_i/a_n|
  function cauchyBound(powers, coeffs) {
    // find leading (max power)
    let maxPow = -Infinity;
    let leadCoef = 0;
    for (let i = 0; i < powers.length; i++) {
      if (powers[i] > maxPow && coeffs[i] !== 0) {
        maxPow = powers[i];
        leadCoef = coeffs[i];
      }
    }
    if (maxPow === -Infinity) return 10;
    let m = 0;
    for (let i = 0; i < powers.length; i++) {
      if (powers[i] === maxPow) continue;
      m = Math.max(m, Math.abs(coeffs[i] / leadCoef));
    }
    const b = 1 + m;
    return Math.max(5, Math.min(50, b)); // clamp
  }

  // -------------------- numeric root finding (real roots) --------------------
  // Scan + bisection, plus detect near-zero touches
  function findRealRootsNumeric(func, bound, samples = 4000) {
    const a = -bound, b = bound;
    const dx = (b - a) / samples;

    const roots = [];
    let prevX = a;
    let prevY = func(prevX);

    const epsZero = 1e-6;

    // helper: bisect on [l,r] with sign change
    function bisect(l, r, fl, fr) {
      let L = l, R = r, fL = fl, fR = fr;
      for (let it = 0; it < 80; it++) {
        const M = (L + R) / 2;
        const fM = func(M);
        if (Math.abs(fM) < 1e-10) return M;
        if (fL * fM <= 0) { R = M; fR = fM; }
        else { L = M; fL = fM; }
      }
      return (L + R) / 2;
    }

    for (let i = 1; i <= samples; i++) {
      const x = a + i * dx;
      const y = func(x);

      // sign change => root
      if (prevY === 0) {
        roots.push(prevX);
      } else if (prevY * y < 0) {
        const r = bisect(prevX, x, prevY, y);
        roots.push(r);
      } else {
        // touch root (even multiplicity) might not change sign
        // detect near-zero local minimum by checking |y| small with neighborhood
        if (Math.abs(y) < epsZero && Math.abs(prevY) < 1e-3) {
          roots.push(x);
        }
      }

      prevX = x;
      prevY = y;
    }

    // merge close roots
    roots.sort((u, v) => u - v);
    const merged = [];
    const tol = 1e-3 * Math.max(1, bound);
    for (const r of roots) {
      if (merged.length === 0) merged.push(r);
      else if (Math.abs(r - merged[merged.length - 1]) > tol) merged.push(r);
    }
    return merged;
  }

  // -------------------- extrema and increasing intervals --------------------
  function extremaPoints(problem) {
    const d = polyDeriv(problem);

    // build func for derivative
    const dFunc = (x) => polyEvalGeneric(d, x);

    // root bound for derivative
    const bound = cauchyBound(d.powers, d.coeffs);

    // find derivative roots
    const roots = findRealRootsNumeric(dFunc, bound, 3000);

    // classify extrema by sign change in derivative
    const eps = 1e-3;
    const extrema = [];
    for (const x0 of roots) {
      const left = dFunc(x0 - eps);
      const right = dFunc(x0 + eps);
      if (left * right < 0) {
        extrema.push({ x: x0, y: polyEval(problem, x0) });
      }
      // if not sign-changing => horizontal inflection/flat; exclude
    }
    return extrema;
  }

  function increasingIntervals(problem) {
    const d = polyDeriv(problem);
    const dFunc = (x) => polyEvalGeneric(d, x);
    const bound = cauchyBound(d.powers, d.coeffs);
    const roots = findRealRootsNumeric(dFunc, bound, 3000).filter((x) => Number.isFinite(x));

    // sort unique breakpoints
    const pts = [-Infinity, ...roots, Infinity];

    const intervals = [];
    const eps = 1e-3;

    for (let i = 0; i < pts.length - 1; i++) {
      const L = pts[i], R = pts[i + 1];
      let testX;
      if (!Number.isFinite(L)) testX = R - 1;
      else if (!Number.isFinite(R)) testX = L + 1;
      else testX = (L + R) / 2;

      const v = dFunc(testX);
      if (v >= 0) {
        intervals.push({ L, R });
      }
    }

    // choose one interval (rule: longest finite length; if infinite exists, prefer it)
    if (intervals.length === 0) return null;

    const hasInfinite = intervals.find(iv => !Number.isFinite(iv.L) || !Number.isFinite(iv.R));
    if (hasInfinite) return hasInfinite;

    intervals.sort((a, b) => (b.R - b.L) - (a.R - a.L));
    return intervals[0];
  }

  function formatInterval(iv) {
    // Using interval notation, allow ±∞
    const fmt = (x) => {
      if (!Number.isFinite(x)) return (x < 0 ? "-∞" : "∞");
      const v = Math.round(x * 100) / 100;
      return String(v);
    };

    // we are providing a >=0 interval from derivative sign test:
    // endpoints are critical points, usually open/closed ambiguous; accept parentheses
    const L = fmt(iv.L);
    const R = fmt(iv.R);
    return `(${L}, ${R})`;
  }

  // -------------------- problem generation --------------------
  function genProblem() {
    const isCubic = Math.random() < 0.5; // 50:50
    if (isCubic) {
      // Ax^3 + Bx + C
      const A = choice([-2, -1, 1, 2]);
      const B = randInt(-4, 4);
      const C = randInt(-4, 4);
      return {
        degree: 3,
        form: "Ax3_Bx_C",
        labels: ["A", "B", "C"],
        powers: [3, 1, 0],
        coeffs: [A, B, C],
        display: () => `f(x) = A x³ + B x + C`
      };
    }

    // quartic form 50:50
    const form = Math.random() < 0.5 ? "Ax4_Bx2_Cx_D" : "Ax4_Bx3_Cx_D";
    const A = choice([-2, -1, 1, 2]);
    const B = randInt(-4, 4);
    const C = randInt(-4, 4);
    const D = randInt(-4, 4);

    if (form === "Ax4_Bx2_Cx_D") {
      return {
        degree: 4,
        form,
        labels: ["A", "B", "C", "D"],
        powers: [4, 2, 1, 0],
        coeffs: [A, B, C, D],
        display: () => `f(x) = A x⁴ + B x² + C x + D`
      };
    }

    return {
      degree: 4,
      form,
      labels: ["A", "B", "C", "D"],
      powers: [4, 3, 1, 0],
      coeffs: [A, B, C, D],
      display: () => `f(x) = A x⁴ + B x³ + C x + D`
    };
  }

  function renderCoeffInputs(problem) {
    coeffForm.innerHTML = "";
    problem.labels.forEach((label) => {
      const row = document.createElement("div");
      row.className = "coeffRow";

      const lab = document.createElement("div");
      lab.className = "coeffLabel";
      lab.textContent = label;

      const input = document.createElement("input");
      input.type = "number";
      input.step = "1";
      input.inputMode = "numeric";
      input.pattern = "[-0-9]*";
      input.id = `coef_${label}`;
      input.placeholder = "정수 입력";

      row.appendChild(lab);
      row.appendChild(input);
      coeffForm.appendChild(row);
    });
  }

  function readCoeffInputs(problem) {
    const values = [];
    for (const label of problem.labels) {
      const el = $(`coef_${label}`);
      const raw = (el.value ?? "").trim();
      if (raw === "") return { ok: false, msg: `${label} 값을 입력하세요.` };
      if (!isIntString(raw)) return { ok: false, msg: `${label}는 정수만 가능합니다.` };
      values.push(parseInt(raw, 10));
    }
    return { ok: true, values };
  }

  function arraysEqual(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }

  // -------------------- scoring --------------------
  // h = hint usage count (hint4 counts as number of uses)
  function hintScoreFromCount(h) {
    if (h <= 4) return h;
    return 8 - h; // 5->3, 6->2, ... i.e., 4 - (h-4)
  }

  function calcRoundScore(hCount, wrongAttempts) {
    return 5 + hintScoreFromCount(hCount) - 2 * wrongAttempts;
  }

  function calcRoundScorePreview() {
    if (!state.started || !state.current) return 0;
    const h = state.usedHintsOrder.length; // hint4 repeats included
    return calcRoundScore(h, state.wrongAttempts);
  }

  // -------------------- ranking (localStorage) --------------------
  function loadRank() {
    try {
      const raw = localStorage.getItem(RANK_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  function saveRank(arr) {
    localStorage.setItem(RANK_KEY, JSON.stringify(arr));
  }

  function upsertBestScore(studentId, totalScore) {
    const now = Date.now();
    let rank = loadRank();

    const idx = rank.findIndex(r => r.id === studentId);
    if (idx >= 0) {
      if (totalScore > rank[idx].bestScore) {
        rank[idx].bestScore = totalScore;
        rank[idx].ts = now;
      }
    } else {
      rank.push({ id: studentId, bestScore: totalScore, ts: now });
    }

    // sort: bestScore desc, tie -> earlier timestamp
    rank.sort((a, b) => {
      if (b.bestScore !== a.bestScore) return b.bestScore - a.bestScore;
      return a.ts - b.ts;
    });

    rank = rank.slice(0, 10);
    saveRank(rank);
    renderRank();
  }

  function renderRank() {
    const rank = loadRank();
    rankList.innerHTML = "";
    if (rank.length === 0) {
      const li = document.createElement("li");
      li.textContent = "랭킹 데이터가 없습니다.";
      rankList.appendChild(li);
      return;
    }
    rank.forEach((r) => {
      const li = document.createElement("li");
      li.textContent = `${r.id} — ${r.bestScore}점`;
      rankList.appendChild(li);
    });
  }

  function resetRank() {
    const pin = (adminPin.value || "").trim();
    if (pin !== ADMIN_PIN) {
      setStatus("관리자 PIN이 올바르지 않습니다.");
      return;
    }
    localStorage.removeItem(RANK_KEY);
    renderRank();
    setStatus("랭킹이 초기화되었습니다.");
  }

  // -------------------- hint relations (6 & 7) --------------------
  // Keep them simple and always true: two-coeff relation with constant, and three-coeff relation with constant.
  function buildTwoCoeffRelation(problem) {
    const L = problem.labels;
    const C = problem.coeffs;

    // prefer simple equalities if happen to hold
    const candidates = [];

    function addEq(i, j, mult = 1) {
      // label_i = mult * label_j
      const lhs = C[i];
      const rhs = mult * C[j];
      if (lhs === rhs) {
        const multStr = (mult === 1 ? "" : (mult === -1 ? "-" : String(mult)));
        candidates.push(`${L[i]} = ${multStr}${L[j]}`.replace("=-", "= -"));
      }
    }

    for (let i = 0; i < C.length; i++) {
      for (let j = 0; j < C.length; j++) {
        if (i === j) continue;
        addEq(i, j, 1);
        addEq(i, j, -1);
      }
    }

    // special: A=2B when possible
    if (L.includes("A") && L.includes("B")) {
      const i = L.indexOf("A");
      const j = L.indexOf("B");
      if (C[i] === 2 * C[j]) candidates.push("A = 2B");
      if (C[i] === -2 * C[j]) candidates.push("A = -2B");
    }

    if (candidates.length > 0) return choice(candidates);

    // fallback always-valid: pick two different coeffs and give sum relation with constant
    const i = randInt(0, C.length - 1);
    let j = randInt(0, C.length - 1);
    while (j === i) j = randInt(0, C.length - 1);

    const k = C[i] + C[j];
    return `${L[i]} + ${L[j]} = ${k}`;
  }

  function buildThreeCoeffRelation(problem) {
    const L = problem.labels;
    const C = problem.coeffs;

    // If only 3 labels -> A+B+C=k
    if (C.length === 3) {
      const k = C[0] + C[1] + C[2];
      return `${L[0]} + ${L[1]} + ${L[2]} = ${k}`;
    }

    // 4 labels: choose 3 of them
    const idxs = [0, 1, 2, 3];
    // simple form: A+B=C? if holds
    const iA = idxs[0], iB = idxs[1], iC = idxs[2], iD = idxs[3];

    const simple = [];
    if (C[iA] + C[iB] === C[iC]) simple.push(`${L[iA]} + ${L[iB]} = ${L[iC]}`);
    if (C[iA] + C[iB] === -C[iC]) simple.push(`${L[iA]} + ${L[iB]} = -${L[iC]}`);
    if (C[iB] + C[iC] === C[iD]) simple.push(`${L[iB]} + ${L[iC]} = ${L[iD]}`);
    if (C[iB] + C[iC] === -C[iD]) simple.push(`${L[iB]} + ${L[iC]} = -${L[iD]}`);

    if (simple.length > 0) return choice(simple);

    // fallback: pick 3 labels and constant
    // Prefer A+B+C=k
    const k = C[0] + C[1] + C[2];
    return `${L[0]} + ${L[1]} + ${L[2]} = ${k}`;
  }

  // -------------------- hints implementation --------------------
  function markHintUsed(n) {
    if (n === 4) {
      // handled by hint4go, but button itself should be disabled after 2 uses
      return;
    }
    state.hintUsed[n] = true;
    state.usedHintsOrder.push(n);
    renderHintOrder();
    disableHintButton(n);
    updateHud();
  }

  function hint1() {
    const ex = extremaPoints(state.current);
    markHintUsed(1);
    setHintLog(`[힌트1] 극값 개수: ${ex.length}`);
    setStatus("힌트1 제공 완료");
  }

  function hint2() {
    const deg = state.current.degree;
    const A = state.current.coeffs[0]; // leading
    const lim = (A > 0) ? "+∞" : "-∞"; // x->+∞ always matches sign of leading
    markHintUsed(2);
    setHintLog(`[힌트2] x→+∞에서 f(x) → ${lim}`);
    setStatus("힌트2 제공 완료");
  }

  function hint3() {
    const deg = state.current.degree;
    const A = state.current.coeffs[0];
    let lim;
    if (deg % 2 === 0) lim = (A > 0) ? "+∞" : "-∞";
    else lim = (A > 0) ? "-∞" : "+∞";
    markHintUsed(3);
    setHintLog(`[힌트3] x→-∞에서 f(x) → ${lim}`);
    setStatus("힌트3 제공 완료");
  }

  function hint4_do() {
    // hint4 is controlled by hint4go button
    if (state.hint4Count >= 2) {
      setStatus("힌트4는 최대 2회입니다.");
      return;
    }
    const raw = (hint4x.value || "").trim();
    if (!isIntString(raw)) {
      setStatus("x는 정수만 가능합니다.");
      return;
    }
    const x = parseInt(raw, 10);
    const fx = polyEval(state.current, x);
    state.hint4Count += 1;
    state.usedHintsOrder.push(4);
    state.hint4Queries.push({ x, fx });
    renderHintOrder();

    setHintLog(`[힌트4-${state.hint4Count}] f(${x}) = ${fx}`);
    setStatus("힌트4 제공 완료");

    if (state.hint4Count >= 2) {
      disableHintButton(4);
      hintBtns[4].classList.add("used");
      hintBtns[4].disabled = true;
    }

    updateHud();
  }

  function hint5() {
    const ex = extremaPoints(state.current);
    markHintUsed(5);

    if (ex.length === 
