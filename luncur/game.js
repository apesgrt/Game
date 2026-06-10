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
    // Pilih buah
    select()  { tone(580, 'sine', 0.12, 0.06); },
    // Geser buah
    slide()   { tone(320, 'sine', 0.18, 0.08); tone(420, 'sine', 0.1, 0.06, 0.05); },
    // Menang — fanfare naik
    win()     { [523, 659, 784, 1047].forEach((f, i) => tone(f, 'sine', 0.22, 0.2, i * 0.09)); },
    // Lawan tidak bisa gerak
    blocked() { [300, 260, 220].forEach((f, i) => tone(f, 'sawtooth', 0.14, 0.15, i * 0.08)); },
    // Klik invalid
    invalid() { tone(200, 'square', 0.1, 0.05); },
  };
})();

/*
  Posisi awal:
  0─1─2  ← Biru
  │╲│╱│
  3─4─5  ← Kosong
  │╱│╲│
  6─7─8  ← Merah

  Menang HANYA:
  [3,4,5] baris tengah
  [0,4,8] diagonal ╲
  [2,4,6] diagonal ╱
*/

const WIN_LINES = [ [3,4,5], [0,4,8], [2,4,6] ];

const ADJACENT = {
  0:[1,3,4], 1:[0,2,4], 2:[1,5,4],
  3:[0,4,6], 4:[0,1,2,3,5,6,7,8], 5:[2,4,8],
  6:[3,4,7], 7:[4,6,8], 8:[4,5,7],
};

const BOARD_LINES = [
  [0,1],[1,2],[3,4],[4,5],[6,7],[7,8],
  [0,3],[3,6],[1,4],[4,7],[2,5],[5,8],
  [0,4],[4,8],[2,4],[4,6],
];

const PX = [50,150,250, 50,150,250, 50,150,250];
const PY = [50,50,50, 150,150,150, 250,250,250];

const COLORS = {
  R: { fill:'#ff4d4d', shine:'#ffaaaa', glow:'rgba(255,77,77,0.45)', dim:'rgba(255,77,77,0.12)', label:'Merah' },
  B: { fill:'#4d9fff', shine:'#aad4ff', glow:'rgba(77,159,255,0.45)', dim:'rgba(77,159,255,0.12)', label:'Biru' },
};

const INIT_BOARD = ['B','B','B', null,null,null, 'R','R','R'];

let board    = [...INIT_BOARD];
let turn     = 'R';
let sel      = null;
let result   = null;
let scores   = { R:0, B:0 };

function checkWinner(b) {
  for (const [a,c,d] of WIN_LINES)
    if (b[a] && b[a]===b[c] && b[a]===b[d]) return { winner:b[a], line:[a,c,d] };
  return null;
}

function canMove(b, color) {
  for (let i=0;i<9;i++)
    if (b[i]===color && ADJACENT[i].some(j=>!b[j])) return true;
  return false;
}

function svgEl(tag, attrs) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k,v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

function render() {
  const svg = document.getElementById('board-svg');
  svg.innerHTML = '';

  const validTargets = sel !== null ? ADJACENT[sel].filter(i => !board[i]) : [];
  const winLine = result?.line ?? [];
  const cur = COLORS[turn];

  // Board lines
  for (const [a,b] of BOARD_LINES) {
    svg.appendChild(svgEl('line', {
      x1:PX[a],y1:PY[a],x2:PX[b],y2:PY[b],
      stroke:'#282838',
      'stroke-width':'2.5',
      'stroke-linecap':'round',
    }));
  }

  // Win line highlight
  if (result && winLine.length===3) {
    const wc = COLORS[result.winner].fill;
    for (let i=0;i<2;i++) {
      const a = winLine[i], b = winLine[i+1];
      svg.appendChild(svgEl('line',{
        x1:PX[a],y1:PY[a],x2:PX[b],y2:PY[b],
        stroke:wc,'stroke-width':'6','stroke-linecap':'round',opacity:'0.65',
      }));
    }
  }

  // Valid move targets ring
  for (const i of validTargets) {
    svg.appendChild(svgEl('circle',{
      cx:PX[i],cy:PY[i],r:'22',
      fill:cur.dim,
      stroke:cur.fill,
      'stroke-width':'1.5',
      'stroke-dasharray':'5 3',
    }));
  }

  // Nodes and pieces
  for (let i=0;i<9;i++) {
    const x=PX[i], y=PY[i];
    const piece = board[i];
    const isSel = sel===i;
    const isWin = winLine.includes(i);
    const isTarget = validTargets.includes(i);

    const g = svgEl('g', {});
    g.style.cursor = (!result && (piece===turn || isTarget)) ? 'pointer' : 'default';
    g.addEventListener('click', () => tap(i));

    if (!piece) {
      // Empty node
      g.appendChild(svgEl('circle',{
        cx:x,cy:y,r:'9',
        fill: isTarget ? cur.dim : '#18181e',
        stroke: isTarget ? cur.fill : '#2a2a38',
        'stroke-width': isTarget ? '1.5' : '1',
      }));
    } else {
      const pc = COLORS[piece];
      // Win glow
      if (isWin) g.appendChild(svgEl('circle',{cx:x,cy:y,r:'26',fill:pc.glow}));
      // Selection ring
      if (isSel) g.appendChild(svgEl('circle',{cx:x,cy:y,r:'25',fill:'none',stroke:pc.fill,'stroke-width':'2',opacity:'0.55'}));
      // Shadow
      g.appendChild(svgEl('circle',{cx:x+2,cy:y+3,r:'19',fill:'rgba(0,0,0,0.55)'}));
      // Body
      g.appendChild(svgEl('circle',{
        cx:x,cy:y,r:'19',
        fill:(isSel||isWin)?pc.shine:pc.fill,
        stroke:isSel?'#fff':'rgba(255,255,255,0.12)',
        'stroke-width':isSel?'2':'1',
      }));
      // Inner ring
      g.appendChild(svgEl('circle',{cx:x,cy:y,r:'12',fill:'none',stroke:'rgba(255,255,255,0.12)','stroke-width':'1.2'}));
      // Shine
      g.appendChild(svgEl('ellipse',{cx:x-5,cy:y-6,rx:'5',ry:'3.5',fill:'rgba(255,255,255,0.3)'}));
    }
    svg.appendChild(g);
  }

  // Update scores
  document.getElementById('score-r-val').textContent = scores.R;
  document.getElementById('score-b-val').textContent = scores.B;
  document.getElementById('score-r').className = 'score-box' + (!result && turn==='R' ? ' active-r' : '');
  document.getElementById('score-b').className = 'score-box' + (!result && turn==='B' ? ' active-b' : '');

  // Status
  const statusEl = document.getElementById('status');
  statusEl.className = 'status';
  if (result) {
    statusEl.textContent = `🏆 ${COLORS[result.winner].label} Menang!` +
      (result.reason === 'blocked' ? '\nLawan tidak bisa bergerak' : '\n3 buah berhasil sejajar');
    statusEl.classList.add(result.winner==='R' ? 'win-r' : 'win-b');
  } else {
    const selMsg = sel !== null
      ? 'Pilih titik yang terhubung untuk geser'
      : `Ketuk buah ${COLORS[turn].label.toLowerCase()} untuk memilih`;
    statusEl.innerHTML = `<span style="color:${COLORS[turn].fill}">● ${COLORS[turn].label}</span><br><span style="font-size:11px;color:#444;font-weight:400">${selMsg}</span>`;
  }
}

function tap(i) {
  if (result) return;

  if (board[i] === turn) {
    sel = (sel === i) ? null : i;
    SFX.select();
    render();
    return;
  }

  if (sel !== null && !board[i] && ADJACENT[sel].includes(i)) {
    const next = [...board];
    next[i] = next[sel];
    next[sel] = null;

    const win = checkWinner(next);
    const opp = turn === 'R' ? 'B' : 'R';

    board = next;
    sel   = null;

    if (win) {
      result = win;
      scores[win.winner]++;
      setTimeout(() => SFX.win(), 60);
      render();
      return;
    }
    if (!canMove(next, opp)) {
      result = { winner:turn, line:[], reason:'blocked' };
      scores[turn]++;
      setTimeout(() => SFX.blocked(), 60);
      render();
      return;
    }
    SFX.slide();
    turn = opp;
    render();
    return;
  }

  SFX.invalid();
  sel = null;
  render();
}

function resetRound() {
  board  = [...INIT_BOARD];
  turn   = 'R';
  sel    = null;
  result = null;
  render();
}

function resetScore() {
  scores = { R:0, B:0 };
  resetRound();
}

document.addEventListener('DOMContentLoaded', () => {
  render();
  document.getElementById('btn-reset-round').addEventListener('click', resetRound);
  document.getElementById('btn-reset-score').addEventListener('click', resetScore);
});
