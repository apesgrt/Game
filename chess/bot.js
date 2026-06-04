// ============================
// CHESS BOT — EASY/MEDIUM/HARD
// ============================

let aiEnabled   = false;
let gameStarted = false;
let botLevel    = null;
let botThinking = false;

// ── Piece values ──────────────────────────────────────────────────────────────
const PIECE_VAL = { p:100, n:320, b:330, r:500, q:900, k:20000 };

// Piece-Square Tables (bot prefers good squares)
const PST = {
  p: [ // pawn — maju ke depan
    [0,0,0,0,0,0,0,0],
    [50,50,50,50,50,50,50,50],
    [10,10,20,30,30,20,10,10],
    [5,5,10,25,25,10,5,5],
    [0,0,0,20,20,0,0,0],
    [5,-5,-10,0,0,-10,-5,5],
    [5,10,10,-20,-20,10,10,5],
    [0,0,0,0,0,0,0,0],
  ],
  n: [ // kuda — bagus di tengah
    [-50,-40,-30,-30,-30,-30,-40,-50],
    [-40,-20,0,0,0,0,-20,-40],
    [-30,0,10,15,15,10,0,-30],
    [-30,5,15,20,20,15,5,-30],
    [-30,0,15,20,20,15,0,-30],
    [-30,5,10,15,15,10,5,-30],
    [-40,-20,0,5,5,0,-20,-40],
    [-50,-40,-30,-30,-30,-30,-40,-50],
  ],
  b: [ // gajah
    [-20,-10,-10,-10,-10,-10,-10,-20],
    [-10,0,0,0,0,0,0,-10],
    [-10,0,5,10,10,5,0,-10],
    [-10,5,5,10,10,5,5,-10],
    [-10,0,10,10,10,10,0,-10],
    [-10,10,10,10,10,10,10,-10],
    [-10,5,0,0,0,0,5,-10],
    [-20,-10,-10,-10,-10,-10,-10,-20],
  ],
  r: [ // benteng
    [0,0,0,0,0,0,0,0],
    [5,10,10,10,10,10,10,5],
    [-5,0,0,0,0,0,0,-5],
    [-5,0,0,0,0,0,0,-5],
    [-5,0,0,0,0,0,0,-5],
    [-5,0,0,0,0,0,0,-5],
    [-5,0,0,0,0,0,0,-5],
    [0,0,0,5,5,0,0,0],
  ],
  q: [ // ratu
    [-20,-10,-10,-5,-5,-10,-10,-20],
    [-10,0,0,0,0,0,0,-10],
    [-10,0,5,5,5,5,0,-10],
    [-5,0,5,5,5,5,0,-5],
    [0,0,5,5,5,5,0,-5],
    [-10,5,5,5,5,5,0,-10],
    [-10,0,5,0,0,0,0,-10],
    [-20,-10,-10,-5,-5,-10,-10,-20],
  ],
  k: [ // raja — aman di pojok
    [-30,-40,-40,-50,-50,-40,-40,-30],
    [-30,-40,-40,-50,-50,-40,-40,-30],
    [-30,-40,-40,-50,-50,-40,-40,-30],
    [-30,-40,-40,-50,-50,-40,-40,-30],
    [-20,-30,-30,-40,-40,-30,-30,-20],
    [-10,-20,-20,-20,-20,-20,-20,-10],
    [20,20,0,0,0,0,20,20],
    [20,30,10,0,0,10,30,20],
  ],
};

function getPST(type, r, c, color) {
  const table = PST[type];
  if (!table) return 0;
  // Black uses table as-is (rows 0=back rank), white mirrors
  return color === 'b' ? table[r][c] : table[7-r][c];
}

// ── Board evaluation ──────────────────────────────────────────────────────────
function evaluate(board) {
  let score = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (!p) continue;
      const val = PIECE_VAL[p.type] + getPST(p.type, r, c, p.color);
      score += p.color === 'b' ? val : -val;
    }
  }
  return score;
}

// ── Get all moves for a color ─────────────────────────────────────────────────
function getMovesFor(board, color, ep, cr) {
  const moves = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (p && p.color === color) {
        const legal = legalMoves(board, r, c, ep, cr);
        legal.forEach(mv => {
          moves.push({
            from: [r, c],
            to: mv,
            capture: board[mv[0]][mv[1]],
          });
        });
      }
    }
  }
  return moves;
}

// ── Move ordering (captures & checks first = faster pruning) ──────────────────
function orderMoves(moves, board) {
  return moves.sort((a, b) => {
    const scoreA = a.capture ? (PIECE_VAL[a.capture.type] || 0) : 0;
    const scoreB = b.capture ? (PIECE_VAL[b.capture.type] || 0) : 0;
    return scoreB - scoreA;
  });
}

// ── Minimax + Alpha-Beta ──────────────────────────────────────────────────────
function minimax(board, depth, alpha, beta, maximizing, ep, cr) {
  if (depth === 0) return evaluate(board);

  const color  = maximizing ? 'b' : 'w';
  const moves  = orderMoves(getMovesFor(board, color, ep, cr), board);

  if (!moves.length) {
    // Checkmate or stalemate
    if (inCheck(board, color)) return maximizing ? -99999 : 99999;
    return 0;
  }

  if (maximizing) {
    let maxEval = -Infinity;
    for (const mv of moves) {
      const result = applyMove(board, mv.from, mv.to, ep, cr);
      const evalScore = minimax(result.board, depth-1, alpha, beta, false, result.ep, result.cr);
      maxEval = Math.max(maxEval, evalScore);
      alpha   = Math.max(alpha, evalScore);
      if (beta <= alpha) break; // prune
    }
    return maxEval;
  } else {
    let minEval = Infinity;
    for (const mv of moves) {
      const result = applyMove(board, mv.from, mv.to, ep, cr);
      const evalScore = minimax(result.board, depth-1, alpha, beta, true, result.ep, result.cr);
      minEval = Math.min(minEval, evalScore);
      beta    = Math.min(beta, evalScore);
      if (beta <= alpha) break; // prune
    }
    return minEval;
  }
}

// ── Mode selector ─────────────────────────────────────────────────────────────
function toggleMenu() {
  document.getElementById('mode-menu').classList.toggle('hidden');
}

function startPVP() {
  if (gameStarted) return;
  aiEnabled = false; gameStarted = true;
  document.getElementById('mode-menu').classList.add('hidden');
  render();
}

function startAI(level) {
  if (gameStarted) return;
  aiEnabled = true; botLevel = level; gameStarted = true;
  document.getElementById('mode-menu').classList.add('hidden');
  render();
}

// ── Pick move ─────────────────────────────────────────────────────────────────
function pickMove(allMoves) {
  if (!allMoves.length) return null;

  // ── EASY: random tapi SELALU capture kalau bisa ──────────────────────────
  if (botLevel === 'easy') {
    const captures = allMoves.filter(m => m.capture);
    if (captures.length) {
      // Pilih capture paling berharga
      captures.sort((a,b) => (PIECE_VAL[b.capture.type]||0) - (PIECE_VAL[a.capture.type]||0));
      // 80% ambil yang paling berharga, 20% random dari captures
      if (Math.random() < 0.8) return captures[0];
      return captures[Math.floor(Math.random()*captures.length)];
    }
    // Tidak ada capture → random murni
    return allMoves[Math.floor(Math.random()*allMoves.length)];
  }

  // ── MEDIUM: minimax depth 2 + sedikit random ─────────────────────────────
  if (botLevel === 'medium') {
    const ordered = orderMoves(allMoves, S.board);
    let best = null, bestScore = -Infinity;
    for (const mv of ordered) {
      const result = applyMove(S.board, mv.from, mv.to, S.ep, S.cr);
      let score = minimax(result.board, 2, -Infinity, Infinity, false, result.ep, result.cr);
      score += (Math.random() - 0.5) * 30; // sedikit variasi biar ga robot banget
      if (score > bestScore) { bestScore = score; best = mv; }
    }
    return best;
  }

  // ── HARD: minimax depth 4 + alpha-beta (susah!) ──────────────────────────
  if (botLevel === 'hard') {
    const ordered = orderMoves(allMoves, S.board);
    let best = null, bestScore = -Infinity;
    for (const mv of ordered) {
      const result = applyMove(S.board, mv.from, mv.to, S.ep, S.cr);
      const score = minimax(result.board, 4, -Infinity, Infinity, false, result.ep, result.cr);
      if (score > bestScore) { bestScore = score; best = mv; }
    }
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

  // Hard level butuh waktu lebih — tunjukkan "thinking" lebih lama
  const delay = botLevel === 'hard' ? 100 : botLevel === 'medium' ? 200 : 400;

  setTimeout(() => {
    const allMoves = getMovesFor(S.board, 'b', S.ep, S.cr);
    const mv = pickMove(allMoves);
    if (mv) {
      S.sel = mv.from;
      executeMove(mv.to);
    }
    botThinking = false;
    if (thinking) thinking.classList.add('hidden');
  }, delay);
}

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  gameStarted = false; aiEnabled = false; botLevel = null; botThinking = false;
});
