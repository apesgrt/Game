// ============================
// CHESS BOT SYSTEM
// PvP + AI EASY/MEDIUM/HARD
// ============================

let aiEnabled   = false;
let gameStarted = false;
let botLevel    = null;
let botThinking = false;

// ── Mode selector ─────────────────────────────────────────────────────────────

function toggleMenu() {
  document.getElementById('mode-menu').classList.toggle('hidden');
}

function startPVP() {
  if (gameStarted) return;
  aiEnabled   = false;
  gameStarted = true;
  document.getElementById('mode-menu').classList.add('hidden');
  render();
}

function startAI(level) {
  if (gameStarted) return;
  aiEnabled   = true;
  botLevel    = level;
  gameStarted = true;
  document.getElementById('mode-menu').classList.add('hidden');
  render();
}

// ── Get all bot moves ─────────────────────────────────────────────────────────

function getAllBotMoves() {
  const allMoves = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = S.board[r][c];           // FIX: S.board bukan S.turn
      if (piece && piece.color === 'b') {
        const moves = legalMoves(S.board, r, c, S.ep, S.cr);  // FIX: pakai legalMoves dengan argumen lengkap
        moves.forEach(mv => {
          allMoves.push({
            from: [r, c],
            to:   mv,
            capture: S.board[mv[0]][mv[1]],  // FIX: S.board bukan S.turn
          });
        });
      }
    }
  }
  return allMoves;
}

// ── Pick move by level ────────────────────────────────────────────────────────

function pickMove(allMoves) {
  if (!allMoves.length) return null;

  // EASY: random
  if (botLevel === 'easy') {
    return allMoves[Math.floor(Math.random() * allMoves.length)];
  }

  // MEDIUM: ambil capture kalau ada, kalau tidak random
  if (botLevel === 'medium') {
    const captures = allMoves.filter(m => m.capture);
    const pool = captures.length ? captures : allMoves;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  // HARD: skor berdasarkan nilai buah + kontrol tengah
  if (botLevel === 'hard') {
    const values = { p:1, n:3, b:3, r:5, q:9, k:100 };
    let best = null, bestScore = -Infinity;
    allMoves.forEach(mv => {
      let score = 0;
      if (mv.capture) score += (values[mv.capture.type] || 0) * 10;
      const [tr, tc] = mv.to;
      if (tr >= 2 && tr <= 5 && tc >= 2 && tc <= 5) score += 3;
      score += Math.random() * 2; // sedikit variasi
      if (score > bestScore) { bestScore = score; best = mv; }
    });
    return best;
  }

  return allMoves[0];
}

// ── Execute bot move ──────────────────────────────────────────────────────────

function botMove() {
  if (S.turn !== 'b' || !aiEnabled || botThinking) return;
  if (S.status === 'checkmate' || S.status === 'stalemate') return;

  botThinking = true;
  const thinking = document.getElementById('thinking');
  if (thinking) thinking.classList.remove('hidden');

  setTimeout(() => {
    const allMoves = getAllBotMoves();
    const mv = pickMove(allMoves);

    if (mv) {
      S.sel = mv.from;   // set sel dulu supaya executeMove tahu dari mana
      executeMove(mv.to);
    }

    botThinking = false;
    if (thinking) thinking.classList.add('hidden');
  }, 800);
}

// ── Init (jalankan setelah DOM ready) ────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  gameStarted = false;
  aiEnabled   = false;
  botLevel    = null;
  botThinking = false;
});
