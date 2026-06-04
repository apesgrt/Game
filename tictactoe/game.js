'use strict';

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

  const result = checkWinner(board);
  if (result) {
    scores[result.winner]++;
    gameOver = true;
    render(result, false);
    return;
  }
  if (board.every(Boolean)) {
    gameOver = true;
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
