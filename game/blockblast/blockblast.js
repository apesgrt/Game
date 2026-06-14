/* ═══════════════════════════════════════════════════════
   BLOCK BLAST — Game Engine v2.0
   Separated file — usable inside any game hub
   ═══════════════════════════════════════════════════════ */

(function () {
  'use strict';

  // ── DOM Refs ────────────────────────────────────────────
  const wrap       = document.getElementById('bb-wrap');
  const canvas     = document.getElementById('bb-canvas');
  const ctx        = canvas.getContext('2d');
  const hudScore   = document.getElementById('hud-score');
  const hudBest    = document.getElementById('hud-best');
  const comboEl    = document.getElementById('bb-combo');
  const overlay    = document.getElementById('bb-overlay');
  const screenStart= document.getElementById('screen-start');
  const screenOver = document.getElementById('screen-over');
  const finalScoreEl= document.getElementById('final-score');
  const newRecordEl = document.getElementById('new-record');
  const prevBestEl  = document.getElementById('prev-best');
  const levelFlash  = document.getElementById('bb-levelflash');

  document.getElementById('btn-start').addEventListener('click', startGame);
  document.getElementById('btn-restart').addEventListener('click', startGame);

  // ── Sound Effects (Web Audio API) ───────────────────────
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
    function noise(vol, dur, freq = 300) {
      try {
        const c = ac(), now = c.currentTime;
        const buf = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
        s.buffer = buf; f.type = 'bandpass'; f.frequency.value = freq;
        g.gain.setValueAtTime(vol, now); g.gain.exponentialRampToValueAtTime(0.001, now + dur);
        s.connect(f); f.connect(g); g.connect(c.destination);
        s.start(); s.stop(now + dur + 0.05);
      } catch(e) {}
    }
    return {
      // Piece placed on grid
      place() {
        tone(180, 'sine', 0.18, 0.07);
        tone(260, 'sine', 0.08, 0.05, 0.03);
      },
      // Lines/cols cleared — arpeggio scales with count
      clear(count) {
        const notes = [523, 659, 784, 988, 1175];
        for (let i = 0; i < Math.min(count + 1, 5); i++)
          tone(notes[i], 'sine', 0.22, 0.18, i * 0.06);
        noise(0.08, 0.15, 400);
      },
      // Combo hit
      combo(n) {
        const base = 350 + n * 70;
        tone(base,        'triangle', 0.2, 0.1);
        tone(base * 1.26, 'triangle', 0.15, 0.1, 0.08);
        tone(base * 1.5,  'triangle', 0.12, 0.12, 0.16);
      },
      // Game over
      gameOver() {
        [350, 310, 270, 180].forEach((f, i) => tone(f, 'sawtooth', 0.15, 0.28, i * 0.14));
        noise(0.12, 0.5, 120);
      },
    };
  })();

  // Helper: daftarkan click + touchend agar tombol tembus di atas canvas
  function addBtn(id, fn) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('click', fn);
    el.addEventListener('touchend', e => { e.stopPropagation(); e.preventDefault(); fn(); }, { passive: false });
  }

  addBtn('btn-back',      goToMenu);
  addBtn('btn-back-menu', goToMenu);
  addBtn('btn-back-over', goToMenu);

  // ── Constants ───────────────────────────────────────────
  const GRID    = 8;
  const LIFT    = 90;   // px piece rises above finger
  const MAX_LVL = 8;    // pip count in HUD

  // ── Jewel Color Palette ─────────────────────────────────
  const COLORS = [
    { bg: '#FF6B6B', dk: '#9A1A1A', glow: 'rgba(255,107,107,0.85)' },
    { bg: '#FF9A3C', dk: '#994400', glow: 'rgba(255,154,60,0.85)'  },
    { bg: '#FFD93D', dk: '#998800', glow: 'rgba(255,217,61,0.85)'  },
    { bg: '#6BCB77', dk: '#1A7728', glow: 'rgba(107,203,119,0.85)' },
    { bg: '#4ECDC4', dk: '#0D7070', glow: 'rgba(78,205,196,0.85)'  },
    { bg: '#4D96FF', dk: '#0A3399', glow: 'rgba(77,150,255,0.85)'  },
    { bg: '#C77DFF', dk: '#5E0099', glow: 'rgba(199,125,255,0.85)' },
    { bg: '#FF79C6', dk: '#99006E', glow: 'rgba(255,121,198,0.85)' },
  ];

  // ── Shape Library ───────────────────────────────────────
  const SHAPES_EASY = [
    [[0,0]],
    [[0,0],[0,1]],             [[0,0],[1,0]],
    [[0,0],[0,1],[0,2]],       [[0,0],[1,0],[2,0]],
    [[0,0],[0,1],[1,0]],       [[0,0],[0,1],[1,1]],
    [[0,0],[1,0],[1,1]],       [[0,1],[1,0],[1,1]],
    [[0,0],[0,1],[1,0],[1,1]], // 2×2
  ];

  const SHAPES_MED = [
    [[0,0],[0,1],[0,2],[0,3]],         [[0,0],[1,0],[2,0],[3,0]],
    [[0,0],[1,0],[2,0],[2,1]],         [[0,0],[0,1],[1,0],[2,0]],
    [[0,0],[0,1],[1,1],[2,1]],         [[0,2],[1,0],[1,1],[1,2]],
    [[0,0],[1,0],[1,1],[1,2]],         [[0,0],[0,1],[0,2],[1,2]],
    [[0,1],[1,1],[2,0],[2,1]],         [[0,0],[0,1],[0,2],[1,0]],
    [[0,0],[0,1],[0,2],[1,1]],         [[0,1],[1,0],[1,1],[2,1]],
    [[0,1],[1,0],[1,1],[1,2]],         [[0,0],[1,0],[1,1],[2,0]],
    [[0,1],[0,2],[1,0],[1,1]],         [[0,0],[1,0],[1,1],[2,1]],
    [[0,0],[0,1],[1,1],[1,2]],         [[0,1],[1,0],[1,1],[2,0]],
    [[0,0],[0,1],[0,2],[0,3],[0,4]],   [[0,0],[1,0],[2,0],[3,0],[4,0]],
  ];

  const SHAPE_3X3 = [[0,0],[0,1],[0,2],[1,0],[1,1],[1,2],[2,0],[2,1],[2,2]];

  const SHAPES_HARD = [
    [[0,0],[0,1],[0,2],[1,0],[1,1],[1,2]],
    [[0,0],[0,1],[1,0],[1,1],[2,0],[2,1]],
    SHAPE_3X3, // block 3×3 baru
    [[0,0],[0,1],[0,2],[0,3],[1,0],[1,1],[1,2],[1,3]],
  ];

  function pickShape(lvl) {
    // Dibikin lebih santai: easy lebih sering, 3×3 tetap muncul tapi tidak terlalu sering.
    let pool;
    if (lvl <= 2) {
      pool = [...SHAPES_EASY, ...SHAPES_EASY, ...SHAPES_EASY, ...SHAPES_MED];
      if (Math.random() < 0.08) pool.push(SHAPE_3X3);
    } else if (lvl <= 5) {
      pool = [...SHAPES_EASY, ...SHAPES_EASY, ...SHAPES_MED, ...SHAPES_MED];
      if (Math.random() < 0.12) pool.push(SHAPE_3X3);
    } else {
      pool = [...SHAPES_EASY, ...SHAPES_MED, ...SHAPES_MED, ...SHAPES_HARD];
    }
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function fitsAnywhere(shape) {
    if (!board) return true;
    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        if (canPlace(shape, r, c)) return true;
      }
    }
    return false;
  }

  function pickPlayableShape() {
    for (let i = 0; i < 80; i++) {
      const shape = pickShape(level);
      if (fitsAnywhere(shape)) return shape;
    }
    // Fallback supaya game tidak terlalu cepat mentok.
    const fallback = [
      [[0,0]], [[0,0],[0,1]], [[0,0],[1,0]],
      [[0,0],[0,1],[1,0]], [[0,0],[0,1],[1,1]],
    ];
    return fallback.find(fitsAnywhere) || [[0,0]];
  }

  function pickColor() {
    return COLORS[Math.floor(Math.random() * COLORS.length)];
  }

  // ── Layout ──────────────────────────────────────────────
  let W, H, CELL, GRID_X, GRID_Y, TRAY_Y;

  function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

  function calcLayout() {
    const vv = window.visualViewport;
    const vw = Math.floor(vv?.width || window.innerWidth || 360);
    const vh = Math.floor(vv?.height || window.innerHeight || 640);

    W = Math.min(vw, 480);
    H = vh;

    canvas.width = W;
    canvas.height = H;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';

    const hudEl = document.getElementById('bb-hud');
    const HUD_H = clamp(hudEl?.offsetHeight || 76, 62, 80);
    const TRAY_H = clamp(Math.floor(H * 0.22), 118, 160);
    const avail = Math.max(170, H - HUD_H - TRAY_H - 22);

    CELL = clamp(
      Math.floor(Math.min(avail / GRID, (W - 22) / GRID)),
      W < 360 || H < 610 ? 23 : 26,
      46
    );

    GRID_X = Math.floor((W - CELL * GRID) / 2);
    GRID_Y = HUD_H + clamp(Math.floor((avail - CELL * GRID) / 3), 4, 14);
    TRAY_Y = Math.min(H - TRAY_H + 2, GRID_Y + CELL * GRID + 12);

    if (gameRunning) requestFrame();
    else drawInitialCanvas();
  }

  // ── Drawing Utilities ───────────────────────────────────
  function rrect(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);       ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);   ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);       ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);           ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }

  function hexLighten(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.min(255, (n >> 16) + amt);
    const g = Math.min(255, ((n >> 8) & 0xFF) + amt);
    const b = Math.min(255, (n & 0xFF) + amt);
    return `rgb(${r},${g},${b})`;
  }

  function shapeBounds(shape) {
    return {
      rows: Math.max(...shape.map(([r]) => r)) + 1,
      cols: Math.max(...shape.map(([, c]) => c)) + 1,
    };
  }

  // ── Premium Block Renderer ──────────────────────────────
  // Renders a 3D jewel-like block with:
  //   radial gradient core · bevel edges · specular glint · outer glow
  function drawBlock(bx, by, size, col, alpha = 1, isGhost = false) {
    if (alpha <= 0) return;
    const r   = Math.max(4, size * 0.18);
    const pad = 1.5;
    const s   = size - pad * 2;

    ctx.globalAlpha = alpha;

    if (isGhost) {
      ctx.setLineDash([Math.max(3, size * 0.1), Math.max(2, size * 0.07)]);
      ctx.strokeStyle = col.bg;
      ctx.lineWidth   = 1.8;
      rrect(bx + pad, by + pad, s, s, r);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = col.bg + '28';
      ctx.fill();
      ctx.globalAlpha = 1;
      return;
    }

    // — Flat base color with subtle top-to-bottom gradient —
    const baseG = ctx.createLinearGradient(bx, by + pad, bx, by + size - pad);
    baseG.addColorStop(0,   hexLighten(col.bg, 30));
    baseG.addColorStop(1,   hexLighten(col.bg, -10));
    ctx.fillStyle = baseG;
    rrect(bx + pad, by + pad, s, s, r);
    ctx.fill();

    // — Subtle top highlight strip —
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    rrect(bx + pad + 2, by + pad + 1.5, s - 4, Math.max(2, s * 0.10), 1.5);
    ctx.fill();

    // — Subtle bottom shadow strip —
    ctx.fillStyle = 'rgba(0,0,0,0.14)';
    const bh = Math.max(2, s * 0.10);
    rrect(bx + pad + 2, by + size - pad - bh - 1.5, s - 4, bh, 1.5);
    ctx.fill();

    // — Thin border for definition —
    ctx.strokeStyle = hexLighten(col.bg, -20);
    ctx.lineWidth   = 0.8;
    rrect(bx + pad, by + pad, s, s, r);
    ctx.stroke();

    ctx.globalAlpha = 1;
  }

  // ── Game State ──────────────────────────────────────────
  let board, tray, score, best, level, combo;
  let particles, scoreAnims, clearFlash, clearTimer;
  let gameRunning = false;
  let drag = null;
  let rafId = null;
  let idleTimer = null;
  let shakeTimer = null;

  function initState() {
    board      = Array.from({ length: GRID }, () => Array(GRID).fill(null));
    score      = 0;
    level      = 1;
    combo      = 0;
    particles  = [];
    scoreAnims = [];
    clearFlash = new Set();
    drag       = null;
    best       = parseInt(localStorage.getItem('bbBest') || '0');
    spawnTray();
    renderHUD();
  }

  function spawnTray() {
    tray = [0, 1, 2].map(() => ({
      shape: pickPlayableShape(),
      color: pickColor(),
    }));

    // Safety: minimal 1 piece harus bisa dipasang biar game tidak terlalu hard.
    if (!tray.some(p => p && fitsAnywhere(p.shape))) {
      tray[0] = { shape: [[0,0]], color: pickColor() };
    }
  }

  function canPlace(shape, row, col) {
    for (const [dr, dc] of shape) {
      const r = row + dr, c = col + dc;
      if (r < 0 || r >= GRID || c < 0 || c >= GRID || board[r][c]) return false;
    }
    return true;
  }

  function placePiece(idx, row, col) {
    const p = tray[idx];
    if (!p || !canPlace(p.shape, row, col)) return false;

    for (const [dr, dc] of p.shape)
      board[row + dr][col + dc] = p.color;

    score += p.shape.length;

    SFX.place();
    tray[idx] = null;
    checkClear(p.shape, row, col);
    if (tray.every(t => t === null)) spawnTray();
    renderHUD();
    setTimeout(checkGameOver, 80);
    return true;
  }

  function checkClear(shape, pr, pc) {
    const rows = [...new Set(shape.map(([dr]) => pr + dr))];
    const cols = [...new Set(shape.map(([, dc]) => pc + dc))];
    const fullRows = rows.filter(r => r >= 0 && r < GRID && board[r].every(c => c !== null));
    const fullCols = cols.filter(c => c >= 0 && c < GRID && board.every(row => row[c] !== null));
    const count = fullRows.length + fullCols.length;

    if (count === 0) { combo = 0; return; }

    combo++;
    const pts = count * GRID * 10 + (combo > 1 ? (combo - 1) * 35 : 0);
    score += pts;
    if (score > best) { best = score; localStorage.setItem('bbBest', best); }

    // Collect cells
    const toClear = new Set();
    fullRows.forEach(r => { for (let c = 0; c < GRID; c++) toClear.add(`${r},${c}`); });
    fullCols.forEach(c => { for (let r = 0; r < GRID; r++) toClear.add(`${r},${c}`); });

    // Particles burst
    toClear.forEach(key => {
      const [r, c] = key.split(',').map(Number);
      burstParticles(r, c, board[r][c]);
    });

    // Screen shake on multi-line
    if (count >= 2) doShake();

    // Sound: clear arpeggio + combo tone
    SFX.clear(count);
    if (combo > 1) SFX.combo(combo);

    // Combo toast
    showCombo(count, combo, pts);

    // Floating +pts on canvas
    scoreAnims.push({
      x: GRID_X + CELL * GRID / 2,
      y: GRID_Y + CELL * GRID / 2,
      text: `+${pts}`,
      life: 1,
    });

    clearFlash = toClear;
    clearTimeout(clearTimer);
    clearTimer = setTimeout(() => {
      toClear.forEach(key => {
        const [r, c] = key.split(',').map(Number);
        board[r][c] = null;
      });
      clearFlash = new Set();
    }, 240);

    renderHUD();
  }

  function burstParticles(row, col, color) {
    if (!color) return;
    const px = GRID_X + (col + 0.5) * CELL;
    const py = GRID_Y + (row + 0.5) * CELL;
    const n  = CELL > 36 ? 7 : 4;
    if (particles.length > 90) particles.splice(0, particles.length - 90);
    for (let i = 0; i < n; i++) {
      const a   = (Math.PI * 2 * i / n) + (Math.random() - 0.5) * 0.8;
      const spd = 1.8 + Math.random() * 4.5;
      particles.push({
        x: px, y: py,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd - 1.2,
        life: 1,
        decay: 0.02 + Math.random() * 0.018,
        size: 3 + Math.random() * 5,
        col: color,
        spin: (Math.random() - 0.5) * 0.3,
        r: Math.random() * Math.PI * 2,
      });
    }
  }

  function checkGameOver() {
    const rem = tray.filter(Boolean);
    if (!rem.length) return;
    for (const p of rem)
      for (let r = 0; r < GRID; r++)
        for (let c = 0; c < GRID; c++)
          if (canPlace(p.shape, r, c)) return;
    gameRunning = false;
    setTimeout(doGameOver, 450);
  }

  // ── HUD Updates ─────────────────────────────────────────
  function renderHUD() {
    hudScore.textContent = score.toLocaleString();
    hudBest.textContent  = best.toLocaleString();
    hudScore.classList.remove('pop');
    void hudScore.offsetWidth;
    hudScore.classList.add('pop');
  }

  function showCombo(count, combo, pts) {
    const labels = ['', 'SINGLE', 'DOUBLE!', 'TRIPLE!!', 'QUAD!'];
    const line1  = count >= 2 ? (labels[count] || `×${count} BLAST!`) : `+${pts}`;
    const line2  = combo > 1 ? `COMBO ×${combo}` : '';
    const colors = ['', '#ffffff', '#FFD93D', '#FF9A3C', '#FF6B6B'];
    const glow   = combo > 2 ? '#FF79C6' : combo > 1 ? '#FFD93D' : '#fff';

    comboEl.innerHTML =
      `<span class="combo-main" style="color:${colors[Math.min(count,4)]||'#fff'};text-shadow:0 0 20px ${glow}">${line1}</span>` +
      (line2 ? `<span class="combo-sub" style="color:${glow}">${line2}</span>` : '');

    comboEl.classList.remove('show');
    void comboEl.offsetWidth;
    comboEl.classList.add('show');
  }

  function doShake() {
    wrap.classList.remove('shake');
    clearTimeout(shakeTimer);
    void wrap.offsetWidth;
    wrap.classList.add('shake');
    shakeTimer = setTimeout(() => wrap.classList.remove('shake'), 420);
  }

  function doLevelUp() {
    levelFlash.classList.remove('flash');
    void levelFlash.offsetWidth;
    levelFlash.classList.add('flash');
    setTimeout(() => levelFlash.classList.remove('flash'), 600);
  }

  // ── Screens ─────────────────────────────────────────────
  function goToMenu() {
    gameRunning = false;
    cancelAnimationFrame(rafId);
    clearTimeout(idleTimer);
    drag = null;

    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: 'gamedex:game:close' }, '*');
      window.parent.postMessage('game:close', '*');
      return;
    }

    window.location.href = '../../aula/home.html';
  }

  function startGame() {
    overlay.style.display = 'none';
    initState();
    gameRunning = true;
    cancelAnimationFrame(rafId);
    clearTimeout(idleTimer);
    requestFrame();
  }

  function doGameOver() {
    SFX.gameOver();
    finalScoreEl.textContent = score.toLocaleString();
    if (score >= best && score > 0) {
      newRecordEl.classList.remove('hidden');
      prevBestEl.textContent = '';
    } else {
      newRecordEl.classList.add('hidden');
      prevBestEl.textContent = `TERBAIK SEBELUMNYA: ${best.toLocaleString()}`;
    }
    overlay.style.display = 'flex';
    screenStart.classList.add('hidden');
    screenOver.classList.remove('hidden');
  }

  // ── Tray Helpers ─────────────────────────────────────────
  const TC = 0.60; // tray cell scale ratio

  function trayCenter(i) {
    return {
      x: (W / 3) * i + W / 6,
      y: TRAY_Y + (H - TRAY_Y) / 2,
    };
  }

  function hitTray(tx, ty) {
    if (ty < TRAY_Y - 14) return -1;
    const i = Math.min(2, Math.max(0, Math.floor(tx / (W / 3))));
    return tray[i] ? i : -1;
  }

  function ghostPos(shape, tx, ty) {
    const bb = shapeBounds(shape);
    const pw = bb.cols * CELL, ph = bb.rows * CELL;
    return {
      row: Math.round((ty - ph - LIFT - GRID_Y) / CELL),
      col: Math.round((tx - pw / 2 - GRID_X) / CELL),
    };
  }

  // ── Input ────────────────────────────────────────────────
  function toCanvas(e) {
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.width / rect.width;
    const sy = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * sx,
      y: (e.clientY - rect.top)  * sy,
    };
  }

  function onDown(x, y) {
    if (!gameRunning) return;
    const i = hitTray(x, y);
    if (i < 0 || !tray[i]) return;
    const { row, col } = ghostPos(tray[i].shape, x, y);
    drag = {
      idx: i, shape: tray[i].shape, color: tray[i].color,
      tx: x, ty: y, gr: row, gc: col,
      valid: canPlace(tray[i].shape, row, col),
    };
  }

  function onMove(x, y) {
    if (!drag) return;
    drag.tx = x; drag.ty = y;
    const { row, col } = ghostPos(drag.shape, x, y);
    drag.gr = row; drag.gc = col;
    drag.valid = canPlace(drag.shape, row, col);
  }

  function onUp() {
    if (!drag) return;
    if (drag.valid) placePiece(drag.idx, drag.gr, drag.gc);
    drag = null;
  }

  canvas.addEventListener('touchstart', e => {
    e.preventDefault();
    const p = toCanvas(e.touches[0]);
    onDown(p.x, p.y);
  }, { passive: false });

  canvas.addEventListener('touchmove', e => {
    e.preventDefault();
    const p = toCanvas(e.touches[0]);
    onMove(p.x, p.y);
  }, { passive: false });

  canvas.addEventListener('touchend', e => {
    e.preventDefault();
    onUp();
  }, { passive: false });

  canvas.addEventListener('mousedown',  e => { const p = toCanvas(e); onDown(p.x, p.y); });
  canvas.addEventListener('mousemove',  e => { const p = toCanvas(e); onMove(p.x, p.y); });
  canvas.addEventListener('mouseup',    () => onUp());
  canvas.addEventListener('mouseleave', () => { if (drag && !drag.valid) drag = null; });

  // ── Render ───────────────────────────────────────────────
  function drawBackground() {
    // Bright navy base
    ctx.fillStyle = '#1a1c2e';
    ctx.fillRect(0, 0, W, H);
  }

  function drawGrid() {
    const gx = GRID_X, gy = GRID_Y;
    const gw = CELL * GRID, gh = CELL * GRID;

    // Plate shadow
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur  = 20;
    ctx.fillStyle   = 'rgba(0,0,0,0.2)';
    rrect(gx - 2, gy - 2, gw + 4, gh + 4, 10);
    ctx.fill();
    ctx.shadowBlur  = 0;

    // Plate background — lebih terang
    ctx.fillStyle = 'rgba(255,255,255,0.09)';
    rrect(gx, gy, gw, gh, 8);
    ctx.fill();

    // Empty cell — warna cerah subtle
    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        if (board[r][c]) continue;
        const cx = gx + c * CELL, cy = gy + r * CELL;
        const cr = Math.max(2, CELL * 0.12);
        ctx.fillStyle = 'rgba(0,0,0,0.14)';
        rrect(cx + 2, cy + 2, CELL - 4, CELL - 4, cr);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        rrect(cx + 2, cy + 2, CELL - 4, 2, 1);
        ctx.fill();
      }
    }

    // Grid lines — lebih terlihat
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth   = 0.5;
    for (let r = 0; r <= GRID; r++) {
      ctx.beginPath(); ctx.moveTo(gx, gy + r * CELL); ctx.lineTo(gx + gw, gy + r * CELL); ctx.stroke();
    }
    for (let c = 0; c <= GRID; c++) {
      ctx.beginPath(); ctx.moveTo(gx + c * CELL, gy); ctx.lineTo(gx + c * CELL, gy + gh); ctx.stroke();
    }

    // Plate border
    ctx.strokeStyle = 'rgba(120,160,255,0.28)';
    ctx.lineWidth   = 1.5;
    rrect(gx, gy, gw, gh, 8);
    ctx.stroke();

    // ── Ghost + row/col completion preview ──
    if (drag) {
      // Build test board to detect would-be full lines
      if (drag.valid) {
        const testBoard = board.map(r => [...r]);
        for (const [dr, dc] of drag.shape) {
          const rr = drag.gr + dr, cc = drag.gc + dc;
          if (rr >= 0 && rr < GRID && cc >= 0 && cc < GRID)
            testBoard[rr][cc] = drag.color;
        }
        // Highlight rows/cols that would be cleared
        const affRows = [...new Set(drag.shape.map(([dr]) => drag.gr + dr))].filter(r => r >= 0 && r < GRID);
        const affCols = [...new Set(drag.shape.map(([, dc]) => drag.gc + dc))].filter(c => c >= 0 && c < GRID);
        affRows.forEach(r => {
          if (testBoard[r].every(c => c !== null)) {
            ctx.fillStyle = 'rgba(255,255,255,0.07)';
            ctx.fillRect(gx, gy + r * CELL, gw, CELL);
            ctx.strokeStyle = 'rgba(255,255,255,0.18)';
            ctx.lineWidth   = 1;
            ctx.strokeRect(gx, gy + r * CELL, gw, CELL);
          }
        });
        affCols.forEach(c => {
          if (testBoard.every(row => row[c] !== null)) {
            ctx.fillStyle = 'rgba(255,255,255,0.07)';
            ctx.fillRect(gx + c * CELL, gy, CELL, gh);
            ctx.strokeStyle = 'rgba(255,255,255,0.18)';
            ctx.lineWidth   = 1;
            ctx.strokeRect(gx + c * CELL, gy, CELL, gh);
          }
        });
      }

      // Ghost cells
      const ghostCol = drag.valid
        ? drag.color
        : { bg: '#FF4444', dk: '#880000', glow: 'rgba(255,68,68,0.5)' };
      for (const [dr, dc] of drag.shape) {
        const rr = drag.gr + dr, cc = drag.gc + dc;
        if (rr < 0 || rr >= GRID || cc < 0 || cc >= GRID) continue;
        drawBlock(gx + cc * CELL, gy + rr * CELL, CELL, ghostCol, drag.valid ? 0.42 : 0.2, true);
      }
    }

    // ── Board cells ──
    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        if (!board[r][c]) continue;
        if (clearFlash.has(`${r},${c}`)) {
          // White flash on clear
          ctx.globalAlpha = 0.92;
          ctx.fillStyle   = '#ffffff';
          ctx.shadowColor = '#ffffff';
          ctx.shadowBlur  = 26;
          rrect(gx + c * CELL + 1, gy + r * CELL + 1, CELL - 2, CELL - 2, Math.max(3, CELL * 0.15));
          ctx.fill();
          ctx.shadowBlur  = 0;
          ctx.globalAlpha = 1;
        } else {
          drawBlock(gx + c * CELL, gy + r * CELL, CELL, board[r][c]);
        }
      }
    }
  }

  function drawTray() {
    const tc = Math.round(CELL * TC);
    const tH = H - TRAY_Y;

    // Tray card
    ctx.fillStyle   = 'rgba(255,255,255,0.08)';
    rrect(10, TRAY_Y + 6, W - 20, tH - 14, 16);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth   = 1;
    ctx.stroke();

    // Gloss strip on top of card
    const gloss = ctx.createLinearGradient(0, TRAY_Y + 6, 0, TRAY_Y + 22);
    gloss.addColorStop(0, 'rgba(255,255,255,0.06)');
    gloss.addColorStop(1, 'transparent');
    ctx.fillStyle = gloss;
    rrect(11, TRAY_Y + 7, W - 22, 16, 14);
    ctx.fill();

    for (let i = 0; i < 3; i++) {
      const ctr = trayCenter(i);

      if (!tray[i]) {
        // Empty slot — check icon drawn manually, no emoji/text.
        ctx.save();
        ctx.strokeStyle = 'rgba(107,203,119,0.7)';
        ctx.lineWidth = Math.max(3, tc * 0.12);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(ctr.x - tc * 0.32, ctr.y);
        ctx.lineTo(ctr.x - tc * 0.08, ctr.y + tc * 0.24);
        ctx.lineTo(ctr.x + tc * 0.36, ctr.y - tc * 0.28);
        ctx.stroke();
        ctx.restore();
        continue;
      }
      if (drag && drag.idx === i) continue; // lifted away

      const p  = tray[i];
      const bb = shapeBounds(p.shape);
      const ox = ctr.x - (bb.cols * tc) / 2;
      const oy = ctr.y - (bb.rows * tc) / 2;

      for (const [dr, dc] of p.shape)
        drawBlock(ox + dc * tc, oy + dr * tc, tc, p.color);
    }
  }

  function drawDragPiece() {
    if (!drag) return;
    const { shape, color, tx, ty } = drag;
    const bb = shapeBounds(shape);
    const pw = bb.cols * CELL, ph = bb.rows * CELL;
    const ox = tx - pw / 2;
    const oy = ty - ph - LIFT;
    const sc = 1.07;
    const ax = ox - pw * (sc - 1) / 2;
    const ay = oy - ph * (sc - 1) / 2;
    const ac = CELL * sc;

    // Drop shadow (piece casting shadow onto grid)
    ctx.globalAlpha = 0.18;
    for (const [dr, dc] of shape) {
      ctx.fillStyle = '#000';
      rrect(ax + dc * ac + 5, ay + dr * ac + 8, ac - 3, ac - 3, Math.max(3, ac * 0.15));
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Piece itself
    for (const [dr, dc] of shape)
      drawBlock(ax + dc * ac, ay + dr * ac, ac, color, 0.97);
  }

  function drawParticles() {
    particles = particles.filter(p => p.life > 0);
    for (const p of particles) {
      ctx.save();
      ctx.globalAlpha = p.life * p.life;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.r);
      ctx.fillStyle   = p.col.bg;
      ctx.shadowBlur  = 0;
      const s = p.size * (0.3 + p.life * 0.7);
      rrect(-s / 2, -s / 2, s, s, s * 0.25);
      ctx.fill();
      ctx.restore();

      p.x   += p.vx;  p.y   += p.vy;
      p.vy  += 0.22;  p.vx  *= 0.965;
      p.r   += p.spin;
      p.life -= p.decay;
    }
    ctx.shadowBlur  = 0;
    ctx.globalAlpha = 1;
  }

  function drawScoreAnims() {
    scoreAnims = scoreAnims.filter(a => a.life > 0);
    for (const a of scoreAnims) {
      const rise = (1 - a.life) * 55;
      ctx.globalAlpha = Math.min(1, a.life * 2.2);
      ctx.textAlign   = 'center';
      ctx.font        = '900 24px "Bebas Neue",sans-serif';
      ctx.fillStyle   = '#FFD93D';
      ctx.fillText(a.text, a.x, a.y - rise);
      a.life -= 0.013;
    }
    ctx.shadowBlur  = 0;
    ctx.globalAlpha = 1;
    ctx.textAlign   = 'left';
  }

  // ── Game Loop ────────────────────────────────────────────
  function drawInitialCanvas() {
    if (!ctx || !W || !H) return;
    drawBackground();
  }

  function requestFrame() {
    cancelAnimationFrame(rafId);
    clearTimeout(idleTimer);
    rafId = requestAnimationFrame(loop);
  }

  function loop() {
    if (!gameRunning) return;
    drawBackground();
    drawGrid();
    drawTray();
    drawParticles();
    drawScoreAnims();
    drawDragPiece(); // must be last (on top)

    // Tetap smooth saat drag/animasi, tapi lebih ringan saat idle.
    const hasAnimation = drag || particles.length || scoreAnims.length || clearFlash.size;
    if (hasAnimation) {
      rafId = requestAnimationFrame(loop);
    } else {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => { rafId = requestAnimationFrame(loop); }, 90);
    }
  }

  // ── Bootstrap ────────────────────────────────────────────
  calcLayout();
  window.addEventListener('resize', calcLayout);
  window.visualViewport?.addEventListener('resize', calcLayout);
  window.addEventListener('orientationchange', () => setTimeout(calcLayout, 180));

  drawInitialCanvas();

})(); // end IIFE

