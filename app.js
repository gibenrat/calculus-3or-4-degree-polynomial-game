(() => {
  // 🔧 hotfix: updateHud가 없을 때를 대비한 안전장치
  function updateHud() {
    try {
      if (typeof updateHudInternal === "function") return updateHudInternal();
      if (typeof updateHUD === "function") return updateHUD();
      // 기본 HUD만 갱신(있으면)
      const hudPlayer = document.getElementById("hudPlayer");
      const hudProgress = document.getElementById("hudProgress");
      const hudScore = document.getElementById("hudScore");
      const hudRoundScore = document.getElementById("hudRoundScore");
      if (hudPlayer && window.__state?.studentId) hudPlayer.textContent = `참가자: ${window.__state.studentId || "-"}`;
      if (hudProgress && window.__state?.roundIndex != null) hudProgress.textContent = `진행: ${window.__state.started ? (window.__state.roundIndex + 1) : "-"} / 5`;
      if (hudScore && window.__state?.totalScore != null) hudScore.textContent = `누적점수: ${window.__state.totalScore}`;
    } catch (_) {}
  }

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

  // Right panel
  const studentIdInput = $("studentId");
  const startBtn = $("startBtn");
  const coeffForm = $("coeffForm");
  const submitBtn = $("submitBtn");
  const statusBox = $("statusBox");

  // Hint buttons
  const hintBtns = {
    1: $("hint1"), 2: $("hint2"), 3: $("hint3"),
    4: $("hint4"), 5: $("hint5"), 6: $("hint6"),
    7: $("hint7"), 8: $("hint8"), 9: $("hint9"),
  };

  // Hint inputs
  const hint4x = $("hint4x");
  const hint4go = $("hint4go");
  const hint9k = $("hint9k");
  const hint9go = $("hint9go");

  // Ranking (local)
  const rankList = $("rankList");
  const adminPin = $("adminPin");
  const resetRankBtn = $("resetRankBtn");

  const TOTAL_ROUNDS = 5;
  const ADMIN_PIN = "3141";
  const RANK_KEY = "calc_poly_rank_v1";

const state = {
  started: false,
  studentId: "",
  roundIndex: 0,
  totalScore: 0,

  current: null,
  wrongAttempts: 0,

  hintUsed: null,
  hint4Count: 0,
  usedHintsOrder: [],
  hint4Queries: [],
  hint9Queries: [],

  roundScores: [],
};

window.__state = state;


  // ---------- utils ----------
  const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
  const choice = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const isIntString = (s) => /^-?\d+$/.test(String(s).trim());

  function setStatus(msg) { statusBox.textContent = msg; }

  function clearHintLog() { hintLogEl.textContent = ""; }
  function appendHintLog(line) {
    if (!hintLogEl.textContent.trim()) hintLogEl.textContent = line;
    else hintLogEl.textContent += "\n" + line;
  }

  function renderHintOrder() {
    hintOrderEl.textContent = state.usedHintsOrder.length ? state.usedHintsOrder.join(" → ") : "-";
  }
  function renderWrong() { wrongCountEl.textContent = String(state.wrongAttempts); }

  function disableHint(n) {
    const btn = hintBtns[n];
    if (!btn) return;
    btn.disabled = true;
    btn.classList.add("used");
  }
  function enableHint(n) {
    const btn = hintBtns[n];
    if (!btn) return;
    btn.disabled = false;
    btn.classList.remove("used");
  }
  function resetHintButtons() {
    for (let i = 1; i <= 9; i++) enableHint(i);
  }

  // ---------- poly ----------
  // problem: {labels, powers, coeffs, degree}
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
function getXRangeForNiceExtrema(problem) {
  const ex = extremaPoints(problem);
  if (ex.length >= 1) {
    const xs = ex.map(p => p.x);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const pad = 2.5;
    return { xMin: minX - pad, xMax: maxX + pad, ex };
  }
  return { xMin: -5, xMax: 5, ex: [] };
}

function sampleYRange(problem, xMin, xMax) {
  let yMin = Infinity, yMax = -Infinity;
  const N = 600;
  for (let i = 0; i <= N; i++) {
    const x = xMin + (xMax - xMin) * (i / N);
    const y = polyEval(problem, x);
    if (y < yMin) yMin = y;
    if (y > yMax) yMax = y;
  }
  const pad = 0.12 * Math.max(1, yMax - yMin);
  return { yMin: yMin - pad, yMax: yMax + pad };
}

function drawGraph(problem) {
  if (!ctx || !plot) return;

  const cssW = plot.clientWidth || 900;
  const cssH = 480;
  const dpr = window.devicePixelRatio || 1;
  plot.width = Math.floor(cssW * dpr);
  plot.height = Math.floor(cssH * dpr);
  plot.style.height = cssH + "px";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const { xMin, xMax, ex } = getXRangeForNiceExtrema(problem);
  const { yMin, yMax } = sampleYRange(problem, xMin, xMax);

  const W = cssW, H = cssH;
  const toX = (x) => (x - xMin) / (xMax - xMin) * W;
  const toY = (y) => H - (y - yMin) / (yMax - yMin) * H;

  ctx.clearRect(0, 0, W, H);

  // axes
  ctx.lineWidth = 1;
  ctx.strokeStyle = "#ddd";
  ctx.beginPath();
  if (0 >= xMin && 0 <= xMax) { const X0 = toX(0); ctx.moveTo(X0, 0); ctx.lineTo(X0, H); }
  if (0 >= yMin && 0 <= yMax) { const Y0 = toY(0); ctx.moveTo(0, Y0); ctx.lineTo(W, Y0); }
  ctx.stroke();

  // ticks (x, y)
  ctx.strokeStyle = "#e6e6e6";
  ctx.fillStyle = "#777";
  ctx.lineWidth = 1;

  function niceStep(range) {
    const rough = range / 8;
    const pow = Math.pow(10, Math.floor(Math.log10(Math.max(rough, 1e-9))));
    const n = rough / pow;
    const step = (n < 1.5) ? 1 : (n < 3) ? 2 : (n < 7) ? 5 : 10;
    return step * pow;
  }

  const xStep = niceStep(xMax - xMin);
  const yStep = niceStep(yMax - yMin);

  // vertical grid + x labels on x-axis (if visible), else at bottom
  const yAxisY = (0 >= yMin && 0 <= yMax) ? toY(0) : (H - 16);

  for (let xv = Math.ceil(xMin / xStep) * xStep; xv <= xMax; xv += xStep) {
    const X = toX(xv);
    ctx.beginPath();
    ctx.moveTo(X, 0); ctx.lineTo(X, H);
    ctx.stroke();

    ctx.fillText(String(Math.round(xv * 100) / 100), X + 4, yAxisY - 4);
  }

  // horizontal grid + y labels on y-axis (if visible), else at left
  const xAxisX = (0 >= xMin && 0 <= xMax) ? toX(0) : 6;

  for (let yv = Math.ceil(yMin / yStep) * yStep; yv <= yMax; yv += yStep) {
    const Y = toY(yv);
    ctx.beginPath();
    ctx.moveTo(0, Y); ctx.lineTo(W, Y);
    ctx.stroke();

    ctx.fillText(String(Math.round(yv * 100) / 100), xAxisX + 6, Y - 4);
  }






  // curve
  ctx.strokeStyle = "#111";
  ctx.lineWidth = 2;
  ctx.beginPath();
  const N = 700;
  for (let i = 0; i <= N; i++) {
    const x = xMin + (xMax - xMin) * (i / N);
    const y = polyEval(problem, x);
    const X = toX(x), Y = toY(y);
    if (i === 0) ctx.moveTo(X, Y);
    else ctx.lineTo(X, Y);
  }
  ctx.stroke();

  // extrema dots
   ctx.fillStyle = "#b00020";
  ctx.strokeStyle = "#b00020";
  ctx.lineWidth = 1;

  ctx.font = "12px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  ctx.fillStyle = "#b00020";

  for (const p of ex) {
    const X = toX(p.x), Y = toY(p.y);

    // dot
    ctx.beginPath();
    ctx.arc(X, Y, 5, 0, Math.PI * 2);
    ctx.fill();

    // label text (rounded)
    const rx = Math.round(p.x * 100) / 100;
    const ry = Math.round(p.y * 100) / 100;
    const label = `(${rx}, ${ry})`;

    // offset so it doesn't overlap the dot
    const tx = X + 8;
    const ty = Y - 10;

    // light background for readability
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    const w = ctx.measureText(label).width + 8;
    ctx.fillRect(tx - 4, ty - 12, w, 16);

    ctx.fillStyle = "#b00020";
    ctx.fillText(label, tx, ty);
  }

}



  // Cauchy bound: 1 + max |a_i/a_n|
  function cauchyBound(powers, coeffs) {
    let maxPow = -Infinity;
    let lead = 0;
    for (let i = 0; i < powers.length; i++) {
      if (coeffs[i] !== 0 && powers[i] > maxPow) {
        maxPow = powers[i];
        lead = coeffs[i];
      }
    }
    if (maxPow === -Infinity) return 10;
    let m = 0;
    for (let i = 0; i < powers.length; i++) {
      if (powers[i] === maxPow) continue;
      m = Math.max(m, Math.abs(coeffs[i] / lead));
    }
    const b = 1 + m;
    return Math.max(6, Math.min(60, b));
  }

  // scan + bisection for real roots
  function findRealRootsNumeric(func, bound, samples = 3500) {
    const a = -bound, b = bound;
    const dx = (b - a) / samples;
    const roots = [];
    let px = a;
    let py = func(px);

    const epsZero = 1e-7;

    function bisect(l, r, fl, fr) {
      let L = l, R = r, fL = fl, fR = fr;
      for (let it = 0; it < 90; it++) {
        const M = (L + R) / 2;
        const fM = func(M);
        if (Math.abs(fM) < 1e-12) return M;
        if (fL * fM <= 0) { R = M; fR = fM; }
        else { L = M; fL = fM; }
      }
      return (L + R) / 2;
    }

    for (let i = 1; i <= samples; i++) {
      const x = a + i * dx;
      const y = func(x);

      if (py === 0) roots.push(px);
      else if (py * y < 0) roots.push(bisect(px, x, py, y));
      else if (Math.abs(y) < epsZero && Math.abs(py) < 1e-3) roots.push(x);

      px = x;
      py = y;
    }

    // merge close
    roots.sort((u, v) => u - v);
    const merged = [];
    const tol = 1e-3 * Math.max(1, bound);
    for (const r of roots) {
      if (!merged.length || Math.abs(r - merged[merged.length - 1]) > tol) merged.push(r);
    }
    return merged;
  }

  function extremaPoints(problem) {
    const d = polyDeriv(problem);
    const dFunc = (x) => polyEvalGeneric(d, x);
    const bound = cauchyBound(d.powers, d.coeffs);
    const roots = findRealRootsNumeric(dFunc, bound, 3500);

    const eps = 1e-3;
    const ex = [];
    for (const x0 of roots) {
      const left = dFunc(x0 - eps);
      const right = dFunc(x0 + eps);
      if (left * right < 0) {
        ex.push({ x: x0, y: polyEval(problem, x0) });
      }
    }
    return ex;
  }

  function increasingIntervalOne(problem) {
    const d = polyDeriv(problem);
    const dFunc = (x) => polyEvalGeneric(d, x);
    const bound = cauchyBound(d.powers, d.coeffs);
    const roots = findRealRootsNumeric(dFunc, bound, 3500);

    const pts = [-Infinity, ...roots, Infinity];
    const eps = 1e-3;
    const intervals = [];

    for (let i = 0; i < pts.length - 1; i++) {
      const L = pts[i], R = pts[i + 1];
      let testX;
      if (!Number.isFinite(L)) testX = R - 1;
      else if (!Number.isFinite(R)) testX = L + 1;
      else testX = (L + R) / 2;

      const v = dFunc(testX);
      if (v >= 0) intervals.push({ L, R });
    }

    if (!intervals.length) return null;
    const inf = intervals.find(iv => !Number.isFinite(iv.L) || !Number.isFinite(iv.R));
    if (inf) return inf;

    intervals.sort((a, b) => (b.R - b.L) - (a.R - a.L));
    return intervals[0];
  }

  function fmt2(x) {
    if (!Number.isFinite(x)) return (x < 0 ? "-∞" : "∞");
    const v = Math.round(x * 100) / 100;
    return String(v);
  }

  function formatInterval(iv) {
    return `(${fmt2(iv.L)}, ${fmt2(iv.R)})`;
  }

  // ---------- problem generation ----------
  function genProblem() {
    const isCubic = Math.random() < 0.5; // 50:50
    if (isCubic) {
      const A = choice([-2, -1, 1, 2]);
      const B = randInt(-4, 4);
      const C = randInt(-4, 4);
      return { degree: 3, form: "Ax3+Bx+C", labels: ["A","B","C"], powers:[3,1,0], coeffs:[A,B,C] };
    }

    const form = Math.random() < 0.5 ? "Ax4+Bx2+Cx+D" : "Ax4+Bx3+Cx+D";
    const A = choice([-2, -1, 1, 2]);
    const B = randInt(-4, 4);
    const C = randInt(-4, 4);
    const D = randInt(-4, 4);
    if (form === "Ax4+Bx2+Cx+D") return { degree: 4, form, labels:["A","B","C","D"], powers:[4,2,1,0], coeffs:[A,B,C,D] };
    return { degree: 4, form, labels:["A","B","C","D"], powers:[4,3,1,0], coeffs:[A,B,C,D] };
  }

  function renderEquation(problem) {
    if (problem.degree === 3) {
      equationBox.textContent = `f(x) = A x³ + B x + C  (A ∈ {-2,-1,1,2}, |B|,|C| ≤ 4)`;
    } else {
      if (problem.form === "Ax4+Bx2+Cx+D") {
        equationBox.textContent = `f(x) = A x⁴ + B x² + C x + D  (A ∈ {-2,-1,1,2}, |B|,|C|,|D| ≤ 4)`;
      } else {
        equationBox.textContent = `f(x) = A x⁴ + B x³ + C x + D  (A ∈ {-2,-1,1,2}, |B|,|C|,|D| ≤ 4)`;
      }
    }
  }

  function renderCoeffInputs(problem) {
    coeffForm.innerHTML = "";
    problem.labels.forEach((L) => {
      const row = document.createElement("div");
      row.className = "coeffRow";

      const lab = document.createElement("div");
      lab.className = "coeffLabel";
      lab.textContent = L;

      const input = document.createElement("input");
      input.type = "number";
      input.step = "1";
      input.inputMode = "numeric";
      input.pattern = "[-0-9]*";
      input.id = `coef_${L}`;
      input.placeholder = "정수 입력";

      row.appendChild(lab);
      row.appendChild(input);
      coeffForm.appendChild(row);
    });
  }

  function readCoeffInputs(problem) {
    const values = [];
    for (const L of problem.labels) {
      const el = $(`coef_${L}`);
      const raw = (el.value || "").trim();
      if (raw === "") return { ok: false, msg: `${L} 값을 입력하세요.` };
      if (!isIntString(raw)) return { ok: false, msg: `${L}는 정수만 가능합니다.` };
      values.push(parseInt(raw, 10));
    }
    return { ok: true, values };
  }

  function arraysEqual(a,b) {
    if (a.length !== b.length) return false;
    for (let i=0;i<a.length;i++) if (a[i] !== b[i]) return false;
    return true;
  }

  // ---------- scoring ----------
  function hintScoreFromCount(h) {
    if (h <= 4) return h;
    return 8 - h; // 5->3, 6->2, ...
  }
  function calcRoundScorePreview() {
    if (!state.started || !state.current) return 0;
    const h = state.usedHintsOrder.length;
    return 5 + hintScoreFromCount(h) - 2 * state.wrongAttempts;
  }

  // ---------- ranking ----------
  function loadRank() {
    try {
      const raw = localStorage.getItem(RANK_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch { return []; }
  }
  function saveRank(arr) { localStorage.setItem(RANK_KEY, JSON.stringify(arr)); }

  function renderRank() {
    const rank = loadRank();
    rankList.innerHTML = "";
    if (!rank.length) {
      const li = document.createElement("li");
      li.textContent = "랭킹 데이터가 없습니다.";
      rankList.appendChild(li);
      return;
    }
    rank.forEach(r => {
      const li = document.createElement("li");
      li.textContent = `${r.id} — ${r.bestScore}점`;
      rankList.appendChild(li);
    });
  }

  function upsertBestScore(id, total) {
    const now = Date.now();
    let rank = loadRank();
    const idx = rank.findIndex(r => r.id === id);
    if (idx >= 0) {
      if (total > rank[idx].bestScore) { rank[idx].bestScore = total; rank[idx].ts = now; }
    } else {
      rank.push({ id, bestScore: total, ts: now });
    }
    rank.sort((a,b) => (b.bestScore - a.bestScore) || (a.ts - b.ts));
    rank = rank.slice(0,10);
    saveRank(rank);
    renderRank();
  }

  function resetRank() {
    if ((adminPin.value || "").trim() !== ADMIN_PIN) {
      setStatus("관리자 PIN이 올바르지 않습니다.");
      return;
    }
    localStorage.removeItem(RANK_KEY);
    renderRank();
    setStatus("랭킹이 초기화되었습니다.");
  }

  // ---------- relations hints (6,7) ----------
  function buildTwoCoeffRelation(problem) {
    const L = problem.labels;
    const C = problem.coeffs;

    // prefer simple equalities if hold
    const cand = [];
    for (let i=0;i<C.length;i++) {
      for (let j=0;j<C.length;j++) if (i!==j) {
        if (C[i] === C[j]) cand.push(`${L[i]} = ${L[j]}`);
        if (C[i] === -C[j]) cand.push(`${L[i]} = -${L[j]}`);
      }
    }
    // A=2B when possible
    const iA = L.indexOf("A"), iB = L.indexOf("B");
    if (iA>=0 && iB>=0) {
      if (C[iA] === 2*C[iB]) cand.push("A = 2B");
      if (C[iA] === -2*C[iB]) cand.push("A = -2B");
    }
    if (cand.length) return choice(cand);

    // fallback: sum equals constant
    const i = randInt(0,C.length-1);
    let j = randInt(0,C.length-1);
    while (j===i) j = randInt(0,C.length-1);
    return `${L[i]} + ${L[j]} = ${C[i] + C[j]}`;
  }

  function buildThreeCoeffRelation(problem) {
    const L = problem.labels;
    const C = problem.coeffs;
    if (C.length === 3) return `${L[0]} + ${L[1]} + ${L[2]} = ${C[0]+C[1]+C[2]}`;

    // 4 coeffs: try simple
    const simple = [];
    if (C[0]+C[1] === C[2]) simple.push(`${L[0]} + ${L[1]} = ${L[2]}`);
    if (C[0]+C[1] === -C[2]) simple.push(`${L[0]} + ${L[1]} = -${L[2]}`);
    if (C[1]+C[2] === C[3]) simple.push(`${L[1]} + ${L[2]} = ${L[3]}`);
    if (C[1]+C[2] === -C[3]) simple.push(`${L[1]} + ${L[2]} = -${L[3]}`);
    if (simple.length) return choice(simple);

    return `${L[0]} + ${L[1]} + ${L[2]} = ${C[0]+C[1]+C[2]}`;
  }

  // ---------- hints ----------
  function markHintUsed(n) {
    if (n === 4) return; // handled separately
    state.hintUsed[n] = true;
    state.usedHintsOrder.push(n);
    renderHintOrder();
    disableHint(n);
    updateHud();
  }

  function ensureUsable(n) {
    if (!state.started || !state.current) { setStatus("먼저 게임을 시작하세요."); return false; }
    if (n !== 4 && state.hintUsed[n]) { setStatus("이미 사용한 힌트입니다."); return false; }
    return true;
  }

  function doHint1() {
    if (!ensureUsable(1)) return;
    const ex = extremaPoints(state.current);
    markHintUsed(1);
    appendHintLog(`[힌트1] 극값 개수: ${ex.length}`);
    setStatus("힌트1 제공 완료");
  }

  function doHint2() {
    if (!ensureUsable(2)) return;
    const A = state.current.coeffs[0];
    const lim = A > 0 ? "+∞" : "-∞";
    markHintUsed(2);
    appendHintLog(`[힌트2] x→+∞에서 f(x) → ${lim}`);
    setStatus("힌트2 제공 완료");
  }

  function doHint3() {
    if (!ensureUsable(3)) return;
    const deg = state.current.degree;
    const A = state.current.coeffs[0];
    let lim;
    if (deg % 2 === 0) lim = (A > 0 ? "+∞" : "-∞");
    else lim = (A > 0 ? "-∞" : "+∞");
    markHintUsed(3);
    appendHintLog(`[힌트3] x→-∞에서 f(x) → ${lim}`);
    setStatus("힌트3 제공 완료");
  }

  function doHint4() {
    if (!state.started || !state.current) { setStatus("먼저 게임을 시작하세요."); return; }
    if (state.hint4Count >= 2) { setStatus("힌트4는 최대 2회입니다."); return; }
    const raw = (hint4x.value || "").trim();
    if (!isIntString(raw)) { setStatus("x는 정수만 가능합니다."); return; }
    const x = parseInt(raw, 10);
    const fx = polyEval(state.current, x);
    state.hint4Count += 1;
    state.usedHintsOrder.push(4);
    state.hint4Queries.push({ x, fx });
    renderHintOrder();
    appendHintLog(`[힌트4-${state.hint4Count}] f(${x}) = ${fx}`);
    setStatus("힌트4 제공 완료");
    if (state.hint4Count >= 2) disableHint(4);
    updateHud();
  }

  function doHint5() {
    if (!ensureUsable(5)) return;
    const ex = extremaPoints(state.current);
    markHintUsed(5);
    if (ex.length === 0) {
      appendHintLog(`[힌트5] 극값이 없어 곱을 정의할 수 없음 → 0개`);
      setStatus("힌트5 제공 완료");
      return;
    }
    let sign = 1;
    for (const p of ex) {
      if (Math.abs(p.y) < 1e-12) { sign = 0; break; }
      sign *= (p.y > 0 ? 1 : -1);
    }
    const out = sign === 0 ? "0" : (sign > 0 ? "+" : "-");
    appendHintLog(`[힌트5] 모든 극값 y의 곱 부호: ${out}`);
    setStatus("힌트5 제공 완료");
  }

  function doHint6() {
    if (!ensureUsable(6)) return;
    const rel = buildTwoCoeffRelation(state.current);
    markHintUsed(6);
    appendHintLog(`[힌트6] 두 계수 관계: ${rel}`);
    setStatus("힌트6 제공 완료");
  }

  function doHint7() {
    if (!ensureUsable(7)) return;
    const rel = buildThreeCoeffRelation(state.current);
    markHintUsed(7);
    appendHintLog(`[힌트7] 세 계수 관계: ${rel}`);
    setStatus("힌트7 제공 완료");
  }

  function doHint8() {
    if (!ensureUsable(8)) return;
    const iv = increasingIntervalOne(state.current);
    markHintUsed(8);
    if (!iv) {
      appendHintLog(`[힌트8] 증가구간: 없음`);
    } else {
      appendHintLog(`[힌트8] f'(x) ≥ 0 인 구간(한 구간): ${formatInterval(iv)}`);
    }
    setStatus("힌트8 제공 완료");
  }

  function doHint9() {
    if (!state.started || !state.current) { setStatus("먼저 게임을 시작하세요."); return; }
    if (state.hintUsed[9]) { setStatus("이미 사용한 힌트입니다."); return; }

    const raw = (hint9k.value || "").trim();
    if (!isIntString(raw)) { setStatus("k는 정수만 가능합니다."); return; }
    const k = parseInt(raw, 10);

    // count intersections by real roots of f(x)-k
    const func = (x) => polyEval(state.current, x) - k;
    const bound = 30; // 충분히 넓게(계수 제한 작음)
    const roots = findRealRootsNumeric(func, bound, 4500);
    const count = roots.length;

    state.hintUsed[9] = true;
    state.usedHintsOrder.push(9);
    state.hint9Queries.push({ k, count });
    renderHintOrder();
    disableHint(9);
    appendHintLog(`[힌트9] y=${k} 와의 교점 개수(서로 다른 교점): ${count}`);
    setStatus("힌트9 제공 완료");
    updateHud();
  }

  // ---------- flow ----------
  function beginRound() {
    state.current = genProblem();
    state.wrongAttempts = 0;
    state.hintUsed = { 1:false,2:false,3:false,4:false,5:false,6:false,7:false,8:false,9:false };
    state.hint4Count = 0;
    state.usedHintsOrder = [];
    state.hint4Queries = [];
    state.hint9Queries = [];
    state.roundScores[state.roundIndex] = 0;

    resetHintButtons();
    clearHintLog();
    renderHintOrder();
    renderWrong();

    renderEquation(state.current);
    renderCoeffInputs(state.current);

    roundMsgEl.textContent = `문제 ${state.roundIndex + 1} / ${TOTAL_ROUNDS}`;
    submitBtn.disabled = false;
    setStatus("계수를 입력하고 ‘정답 제출’을 누르세요.");
    updateHud();
  }

  function startGame() {
    const id = studentIdInput.value.trim();
    if (!id) { setStatus("이름 또는 학번을 입력하세요."); return; }
    state.started = true;
    state.studentId = id;
    state.roundIndex = 0;
    state.totalScore = 0;
    state.roundScores = [];

    updateHud();
    beginRound();
  }

  function finishRound({ revealed }) {
  drawGraph(state.current);   // ✅ 이 줄을 맨 위에 추가

    const h = state.usedHintsOrder.length;
    const roundScore = 5 + hintScoreFromCount(h) - 2 * state.wrongAttempts;
    state.roundScores[state.roundIndex] = roundScore;
    state.totalScore += roundScore;

    const ans = state.current.labels.map((L,i)=>`${L}=${state.current.coeffs[i]}`).join(", ");
    roundMsgEl.innerHTML =
      `<div style="font-weight:800; font-size:18px;">${revealed ? "정답 공개" : "정답!"}</div>
       <div style="margin-top:6px;">정답: ${ans}</div>
       <div style="margin-top:6px;">이번 문제 점수: <b>${roundScore}</b> (기본5 + 힌트(${h}) + 오답(${state.wrongAttempts}×-2))</div>
       <button id="nextBtn" style="margin-top:10px; width:100%;">다음 문제</button>`;

    submitBtn.disabled = true;
    updateHud();

    const nextBtn = document.getElementById("nextBtn");
    nextBtn.onclick = () => {
      state.roundIndex += 1;
      if (state.roundIndex >= TOTAL_ROUNDS) endSession();
      else beginRound();
    };
  }

  function submitAnswer() {
    if (!state.started || !state.current) return;

    const { ok, values, msg } = readCoeffInputs(state.current);
    if (!ok) { setStatus(msg); return; }

    if (arraysEqual(values, state.current.coeffs)) {
      setStatus("정답입니다!");
      finishRound({ revealed:false });
      return;
    }

    state.wrongAttempts += 1;
    renderWrong();
    updateHud();

    if (state.wrongAttempts >= 2) {
      setStatus("오답 2회: 정답을 공개합니다.");
      finishRound({ revealed:true });
    } else {
      setStatus(`오답입니다. 남은 기회: ${2 - state.wrongAttempts}회`);
    }
  }

  function endSession() {
    setStatus("세션 종료");
    equationBox.textContent = "세션 종료";
    const total = state.totalScore;
    const per = state.roundScores.map((s,i)=>`문제${i+1}:${s}`).join(" / ");
    roundMsgEl.innerHTML =
      `<div style="font-weight:900; font-size:20px;">${state.studentId} 님 총점: ${total}</div>
       <div style="margin-top:8px;" class="muted">${per}</div>
       <button id="restartBtn" style="margin-top:10px; width:100%;">다시 하기</button>`;

    upsertBestScore(state.studentId, total);

    submitBtn.disabled = true;
    for (let i=1;i<=9;i++) disableHint(i);

    document.getElementById("restartBtn").onclick = () => {
      state.started = false;
      state.studentId = "";
      studentIdInput.value = "";
      state.totalScore = 0;
      state.roundIndex = 0;
      state.current = null;
      equationBox.textContent = "";
      coeffForm.innerHTML = "";
      roundMsgEl.textContent = "";
      clearHintLog();
      renderRank();
      updateHud();
      setStatus("대기 중");
      for (let i=1;i<=9;i++) enableHint(i);
      submitBtn.disabled = true;
    };
  }

  // ---------- wire events ----------
  startBtn.addEventListener("click", startGame);
  submitBtn.addEventListener("click", submitAnswer);

  hintBtns[1].addEventListener("click", doHint1);
  hintBtns[2].addEventListener("click", doHint2);
  hintBtns[3].addEventListener("click", doHint3);
  hintBtns[4].addEventListener("click", () => setStatus("힌트4는 아래 입력창에서 x를 넣고 ‘실행’하세요."));
  hintBtns[5].addEventListener("click", doHint5);
  hintBtns[6].addEventListener("click", doHint6);
  hintBtns[7].addEventListener("click", doHint7);
  hintBtns[8].addEventListener("click", doHint8);
  hintBtns[9].addEventListener("click", () => setStatus("힌트9는 아래 입력창에서 k를 넣고 ‘실행’하세요."));

  hint4go.addEventListener("click", doHint4);
  hint9go.addEventListener("click", doHint9);

  resetRankBtn.addEventListener("click", resetRank);

let plot = null;
let ctx = null;

function bindCanvas() {
  plot = document.getElementById("plot");
  ctx = plot ? plot.getContext("2d") : null;
}

  // init
 bindCanvas(); 
  renderRank();
  updateHud();
  setStatus("대기 중");
})();
