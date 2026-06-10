'use strict';

// ── Sound Effects (Web Audio API) ─────────────────────────────────────────────
const SFX = (() => {
  let _ac;
  function ac() {
    if (!_ac) _ac = new (window.AudioContext || window.webkitAudioContext)();
    if (_ac.state === 'suspended') _ac.resume();
    return _ac;
  }
  function tone(freq, type, vol, dur, delay = 0) {
    try {
      const c = ac(), now = c.currentTime;
      const o = c.createOscillator(), g = c.createGain();
      o.type = type; o.frequency.value = freq;
      g.gain.setValueAtTime(vol, now + delay);
      g.gain.exponentialRampToValueAtTime(0.001, now + delay + dur);
      o.connect(g); g.connect(c.destination);
      o.start(now + delay); o.stop(now + delay + dur + 0.05);
    } catch(e) {}
  }
  return {
    // Taruh X — nada tinggi, tegas
    placeX() { tone(600, 'square', 0.14, 0.06); tone(750, 'square', 0.07, 0.05, 0.04); },
    // Taruh O — nada bulat, lembut
    placeO() { tone(360, 'sine', 0.18, 0.08); tone(480, 'sine', 0.08, 0.06, 0.05); },
    // Menang — fanfare naik
    win() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 'sine', 0.22, 0.2, i * 0.09)); },
    // Seri — nada netral turun
    draw() { [400, 370, 340].forEach((f, i) => tone(f, 'sine', 0.14, 0.2, i * 0.1)); },
  };
})();

const WIN_LINES = [
  [0,1,2],[3,4,5],[6,7,8],
  [0,3,6],[1,4,7],[2,5,8],
  [0,4,8],[2,4,6],
];

let board    = Array(9).fill(null);
let isX      = true;
let gameOver = false;
let scores   = { X: 0, O: 0 };

function checkWinner(b) {
  for (const [a, c, d] of WIN_LINES) {
    if (b[a] && b[a] === b[c] && b[a] === b[d])
      return { winner: b[a], line: [a, c, d] };
  }
  return null;
}

function render(result, isDraw) {
  const cells = document.querySelectorAll('.cell');
  const statusEl = document.getElementById('status');
  const winLine = result ? result.line : [];

  cells.forEach((cell, i) => {
    const val = board[i];
    cell.textContent = val || '';
    cell.className = 'cell';
    if (val) cell.classList.add(val.toLowerCase());
    if (winLine.includes(i)) cell.classList.add('win');
  });

  // Score boxes active state
  document.getElementById('score-x').className = 'score-box' + (!gameOver && isX ? ' active-x' : '');
  document.getElementById('score-o').className = 'score-box' + (!gameOver && !isX ? ' active-o' : '');

  // Score values
  document.getElementById('score-x-val').textContent = scores.X;
  document.getElementById('score-o-val').textContent = scores.O;

  // Status
  statusEl.className = 'status';
  if (result) {
    statusEl.textContent = `🏆 ${result.winner} Menang!`;
    statusEl.classList.add(result.winner === 'X' ? 'win-x' : 'win-o');
  } else if (isDraw) {
    statusEl.textContent = '🤝 Seri!';
    statusEl.classList.add('draw');
  } else {
    statusEl.textContent = `Giliran ${isX ? 'X' : 'O'}`;
  }
}

function buildBoard() {
  const boardEl = document.getElementById('board');
  boardEl.innerHTML = '';
  for (let i = 0; i < 9; i++) {
    const cell = document.createElement('div');
    cell.className = 'cell';
    cell.addEventListener('click', () => handleClick(i));
    boardEl.appendChild(cell);
  }
}

function handleClick(i) {
  if (board[i] || gameOver) return;
  board[i] = isX ? 'X' : 'O';
  isX ? SFX.placeX() : SFX.placeO();

  const result = checkWinner(board);
  if (result) {
    scores[result.winner]++;
    gameOver = true;
    setTimeout(() => SFX.win(), 80);
    render(result, false);
    return;
  }
  if (board.every(Boolean)) {
    gameOver = true;
    setTimeout(() => SFX.draw(), 80);
    render(null, true);
    return;
  }
  isX = !isX;
  render(null, false);
}

function resetRound() {
  board    = Array(9).fill(null);
  isX      = true;
  gameOver = false;
  render(null, false);
}

function resetScore() {
  scores = { X: 0, O: 0 };
  resetRound();
}

document.addEventListener('DOMContentLoaded', () => {
  buildBoard();
  render(null, false);
  document.getElementById('btn-reset-round').addEventListener('click', resetRound);
  document.getElementById('btn-reset-score').addEventListener('click', resetScore);
});
