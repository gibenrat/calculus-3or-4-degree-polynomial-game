<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>미적분 다항함수 찾기 게임</title>
  <link rel="stylesheet" href="./style.css">
  <script defer src="./app.js"></script>
</head>
<body>
  <header>
    <strong>미적분 3·4차 다항함수 찾기 게임</strong>
    <span style="opacity:.7">1단계(세션/채점) 구현</span>
    <span id="hud" style="margin-left:auto; display:flex; gap:12px; align-items:center;">
      <span id="hudProgress">진행: -/-</span>
      <span id="hudScore">누적점수: 0</span>
    </span>
  </header>

  <main>
    <section class="panel">
      <h2>그래프 영역(2단계에서 canvas)</h2>
      <p style="opacity:.8">1단계에서는 그래프를 그리지 않습니다.</p>
      <div id="equationBox" style="margin-top:12px; font-size:22px; font-weight:700;"></div>
      <div id="roundMsg" style="margin-top:12px;"></div>
    </section>

    <section class="panel">
      <h2>시작</h2>
      <label for="studentId">이름 또는 학번</label><br>
      <input id="studentId" placeholder="예: 2-3 김OO 또는 20260101" style="width:100%; margin:8px 0;">
      <button id="startBtn" style="width:100%;">게임 시작</button>

      <hr style="margin:16px 0;">

      <h3>계수 입력</h3>
      <div id="coeffForm" style="display:grid; gap:10px;"></div>
      <button id="submitBtn" style="width:100%; margin-top:12px;" disabled>정답 제출</button>

      <div style="margin-top:16px;">
        <h3>상태</h3>
        <div id="statusBox">대기 중</div>
      </div>
    </section>
  </main>
</body>
</html>
