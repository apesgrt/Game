(() => {
  'use strict';

  const doc = document;

  const preventZoom = () => {
    doc.addEventListener('gesturestart', e => e.preventDefault(), { passive: false });
    doc.addEventListener('gesturechange', e => e.preventDefault(), { passive: false });
    doc.addEventListener('wheel', e => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });
    let lastTouchEnd = 0;
    doc.addEventListener('touchend', e => {
      const now = Date.now();
      if (now - lastTouchEnd <= 320) e.preventDefault();
      lastTouchEnd = now;
    }, { passive: false });
  };

  preventZoom();

  const ICON_BACK_MESSAGE = 'gamedex:game:close';
  const TILE_TYPES = [
    { face: '一萬', color: 'blue' }, { face: '二萬', color: 'red' }, { face: '三萬', color: 'red' },
    { face: '四萬', color: 'blue' }, { face: '五萬', color: 'red' }, { face: '六萬', color: 'blue' },
    { face: '七萬', color: 'green' }, { face: '八萬', color: 'red' }, { face: '九萬', color: 'blue' },
    { face: '一筒', color: 'blue' }, { face: '二筒', color: 'green' }, { face: '三筒', color: 'red' },
    { face: '四筒', color: 'blue' }, { face: '五筒', color: 'green' }, { face: '六筒', color: 'red' },
    { face: '東', color: 'blue' }, { face: '南', color: 'blue' }, { face: '西', color: 'green' }, { face: '北', color: 'green' },
    { face: '中', color: 'red' }, { face: '發', color: 'green' }, { face: '白', color: 'gold' },
    { face: '春', color: 'red' }, { face: '夏', color: 'green' }, { face: '秋', color: 'gold' }, { face: '冬', color: 'blue' },
    { face: '梅', color: 'red' }, { face: '蘭', color: 'green' }, { face: '竹', color: 'green' }, { face: '菊', color: 'gold' }
  ];

  const $ = id => doc.getElementById(id);
  const els = {
    scene: $('scene'),
    board: $('board'),
    levels: $('levels'),
    levelName: $('levelName'),
    levelText: $('levelText'),
    pairsText: $('pairsText'),
    movesText: $('movesText'),
    timeText: $('timeText'),
    message: $('message'),
    matchPop: $('matchPop'),
    bigA: $('bigA'),
    bigB: $('bigB'),
    backBtn: $('backBtn'),
    newBtn: $('newBtn'),
    hintBtn: $('hintBtn'),
    shuffleBtn: $('shuffleBtn'),
    nextBtn: $('nextBtn')
  };

  function rect(x1, y1, x2, y2, z = 0) {
    const out = [];
    for (let y = y1; y <= y2; y += 1) {
      for (let x = x1; x <= x2; x += 1) out.push({ x, y, z });
    }
    return out;
  }

  function pts(list, z = 0) {
    return list.map(([x, y]) => ({ x, y, z }));
  }

  function centerLayout(list) {
    if (!list.length) return list;
    const xs = list.map(p => p.x);
    const ys = list.map(p => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const dx = (10 - (minX + maxX)) / 2;
    const dy = (11 - (minY + maxY)) / 2;
    return list.map(p => ({ x: +(p.x + dx).toFixed(2), y: +(p.y + dy).toFixed(2), z: p.z }));
  }

  function uniqueEven(list) {
    const map = new Map();
    list.forEach(p => map.set(`${p.x},${p.y},${p.z}`, p));
    const arr = [...map.values()].sort((a, b) => a.z - b.z || a.y - b.y || a.x - b.x);
    if (arr.length % 2) arr.pop();
    return centerLayout(arr);
  }

  const LEVELS = [
    { name: 'Ramah Mata', build: () => uniqueEven([
      ...pts([[5,0],[4,1],[5,1],[6,1],[3,2],[4,2],[5,2],[6,2],[7,2],[2,3],[3,3],[4,3],[5,3],[6,3],[7,3],[8,3],[1,4],[2,4],[3,4],[4,4],[5,4],[6,4],[7,4],[8,4],[9,4],[2,5],[3,5],[4,5],[5,5],[6,5],[7,5],[8,5],[3,6],[4,6],[5,6],[6,6],[7,6],[4,7],[5,7],[6,7],[5,8]], 0),
      ...pts([[3,2],[4,2],[6,2],[7,2],[2,3],[3,3],[7,3],[8,3],[2,5],[3,5],[7,5],[8,5],[3,6],[4,6],[6,6],[7,6]], 1),
      ...rect(4,3,6,5,2), ...pts([[5,4]], 3)
    ]) },
    { name: 'Ubin Besar', build: () => uniqueEven([
      ...rect(1,0,8,1,0), ...rect(0,4,9,5,0), ...rect(1,9,8,10,0), ...rect(3,2,6,7,0),
      ...rect(2,3,7,5,1), ...rect(3,7,6,8,1), ...rect(3,4,6,5,2), ...rect(4,4,5,5,3)
    ]) },
    { name: 'Latih Otak', build: () => uniqueEven([
      ...pts([[0,3],[1,2],[1,3],[1,4],[2,1],[2,2],[2,3],[2,4],[2,5],[3,2],[3,3],[3,4],[4,3],[10,3],[9,2],[9,3],[9,4],[8,1],[8,2],[8,3],[8,4],[8,5],[7,2],[7,3],[7,4],[6,3]], 0),
      ...rect(3,5,7,8,0), ...pts([[4,9],[5,9],[6,9],[5,10]], 0),
      ...pts([[2,2],[2,3],[3,3],[8,2],[8,3],[7,3],[4,5],[5,5],[6,5],[3,6],[7,6],[4,8],[5,8],[6,8]], 1),
      ...rect(4,6,6,7,2), ...pts([[5,6],[5,7]], 3)
    ]) },
    { name: 'Tantangan Harian', build: () => uniqueEven([
      ...rect(0,1,2,6,0), ...rect(8,1,10,6,0), ...rect(3,4,7,7,0), ...rect(4,8,6,10,0),
      ...pts([[1,0],[9,0],[1,7],[9,7],[3,8],[7,8]], 0),
      ...rect(1,2,2,5,1), ...rect(8,2,9,5,1), ...rect(4,4,6,6,1), ...rect(4,7,6,8,1),
      ...pts([[1,3],[9,3],[5,5],[5,6]], 2), ...pts([[5,5]], 3)
    ]) },
    { name: 'Bulan Sabit', build: () => uniqueEven([
      ...pts([[2,1],[3,0],[4,0],[5,0],[6,1],[1,2],[2,2],[6,2],[7,2],[0,3],[1,3],[6,3],[7,3],[8,3],[0,4],[1,4],[5,4],[6,4],[7,4],[0,5],[1,5],[5,5],[6,5],[7,5],[1,6],[2,6],[6,6],[7,6],[2,7],[3,8],[4,8],[5,8],[6,7]], 0),
      ...pts([[2,2],[3,1],[4,1],[5,1],[1,3],[2,3],[6,3],[1,4],[6,4],[1,5],[2,5],[6,5],[2,6],[3,7],[4,7],[5,7]], 1),
      ...pts([[3,2],[4,2],[5,2],[2,4],[5,4],[3,6],[4,6],[5,6]], 2), ...pts([[4,4],[5,4]], 3)
    ]) },
    { name: 'Piramida Emas', build: () => uniqueEven([
      ...rect(1,9,9,10,0), ...rect(2,7,8,8,0), ...rect(3,5,7,6,0), ...rect(4,3,6,4,0), ...rect(5,1,5,2,0),
      ...rect(2,8,8,9,1), ...rect(3,6,7,7,1), ...rect(4,4,6,5,1), ...rect(5,2,5,3,1),
      ...rect(3,7,7,8,2), ...rect(4,5,6,6,2), ...rect(5,4,5,4,3)
    ]) },
    { name: 'Gerbang Emas', build: () => uniqueEven([
      ...rect(0,2,2,9,0), ...rect(8,2,10,9,0), ...rect(2,0,8,2,0), ...rect(3,6,7,10,0),
      ...pts([[4,3],[5,3],[6,3],[3,4],[7,4],[3,5],[7,5]], 0),
      ...rect(1,3,2,8,1), ...rect(8,3,9,8,1), ...rect(3,1,7,2,1), ...rect(4,6,6,8,1),
      ...rect(4,2,6,3,2), ...pts([[2,5],[8,5],[5,7]], 2), ...pts([[5,2],[5,3]], 3)
    ]) },
    { name: 'Kupu-Kupu', build: () => uniqueEven([
      ...pts([[1,1],[2,1],[1,2],[2,2],[3,2],[1,3],[2,3],[3,3],[0,4],[1,4],[2,4],[3,4],[4,4],[1,5],[2,5],[3,5],[1,6],[2,6],[9,1],[8,1],[9,2],[8,2],[7,2],[9,3],[8,3],[7,3],[10,4],[9,4],[8,4],[7,4],[6,4],[9,5],[8,5],[7,5],[9,6],[8,6]], 0),
      ...rect(4,3,6,6,0), ...pts([[2,2],[2,3],[2,4],[8,2],[8,3],[8,4],[4,4],[5,4],[6,4],[5,5]], 1),
      ...pts([[3,3],[7,3],[4,4],[5,4],[6,4],[3,5],[7,5]], 2), ...pts([[5,4],[5,5]], 3)
    ]) },
    { name: 'Menara Kembar', build: () => uniqueEven([
      ...rect(1,0,3,8,0), ...rect(7,0,9,8,0), ...rect(3,5,7,8,0), ...pts([[0,2],[10,2],[0,6],[10,6]], 0),
      ...rect(2,1,3,7,1), ...rect(7,1,8,7,1), ...rect(4,5,6,7,1),
      ...pts([[2,2],[3,2],[7,2],[8,2],[4,6],[5,6],[6,6]], 2), ...pts([[2,3],[8,3],[5,6]], 3)
    ]) },
    { name: 'Bintang Timur', build: () => uniqueEven([
      ...pts([[5,0],[4,1],[5,1],[6,1],[3,2],[4,2],[5,2],[6,2],[7,2],[0,5],[1,5],[2,5],[3,5],[4,5],[5,5],[6,5],[7,5],[8,5],[9,5],[10,5],[3,8],[4,8],[5,8],[6,8],[7,8],[4,9],[5,9],[6,9],[5,10],[2,3],[8,3],[1,4],[9,4],[2,7],[8,7],[1,6],[9,6]], 0),
      ...pts([[5,2],[4,3],[5,3],[6,3],[3,4],[4,4],[5,4],[6,4],[7,4],[3,6],[4,6],[5,6],[6,6],[7,6],[4,7],[5,7],[6,7],[5,8]], 1),
      ...rect(4,4,6,6,2), ...pts([[5,5]], 3)
    ]) }
  ];

  const state = {
    levelIndex: 0,
    tiles: [],
    layout: [],
    selectedId: null,
    moves: 0,
    seconds: 0,
    timer: null,
    gameStarted: false,
    busy: false,
    renderQueued: false,
    boardMetrics: null
  };

  function goBack() {
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: ICON_BACK_MESSAGE }, '*');
        window.parent.postMessage({ type: 'gamedex:closeGameFrame' }, '*');
        window.parent.postMessage({ type: 'gamedex:game:close' }, '*');
        return;
      }
    } catch (err) {}
    if (history.length > 1) history.back();
    else window.location.href = '../../aula/home.html';
  }

  function shuffle(list) {
    const copy = [...list];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function setMessage(html) {
    els.message.innerHTML = html;
  }

  function updateTime() {
    const m = String(Math.floor(state.seconds / 60)).padStart(2, '0');
    const s = String(state.seconds % 60).padStart(2, '0');
    els.timeText.textContent = `${m}:${s}`;
  }

  function startTimer() {
    if (state.timer) return;
    state.timer = setInterval(() => {
      state.seconds += 1;
      updateTime();
    }, 1000);
  }

  function stopTimer() {
    if (!state.timer) return;
    clearInterval(state.timer);
    state.timer = null;
  }

  function makeDeck(tileCount) {
    const pairs = Math.floor(tileCount / 2);
    const chosen = [];
    for (let i = 0; i < pairs; i += 1) chosen.push(TILE_TYPES[i % TILE_TYPES.length]);
    return shuffle([...chosen, ...chosen]).map(t => ({ ...t, matchKey: t.face }));
  }

  function makeLevelButtons() {
    const fragment = doc.createDocumentFragment();
    LEVELS.forEach((level, index) => {
      const button = doc.createElement('button');
      button.className = `level-btn${index === state.levelIndex ? ' active' : ''}`;
      button.type = 'button';
      button.textContent = index + 1;
      button.setAttribute('aria-label', `Bentuk ${index + 1}: ${level.name}`);
      button.addEventListener('click', () => setLevel(index));
      fragment.appendChild(button);
    });
    els.levels.replaceChildren(fragment);
  }

  function getBounds(layout) {
    const xs = layout.map(p => p.x);
    const ys = layout.map(p => p.y);
    const zs = layout.map(p => p.z);
    return {
      minX: Math.min(...xs), maxX: Math.max(...xs),
      minY: Math.min(...ys), maxY: Math.max(...ys),
      maxZ: Math.max(...zs)
    };
  }

  function fitBoard() {
    if (!state.layout.length) return null;
    const scene = els.scene.getBoundingClientRect();
    const bounds = getBounds(state.layout);
    const ratios = { h: 1.28, sx: 0.92, sy: 0.96, lx: 0.13, ly: -0.15 };
    const unitW = ((bounds.maxX - bounds.minX) * ratios.sx) + 1 + (bounds.maxZ * ratios.lx);
    const unitH = ((bounds.maxY - bounds.minY) * ratios.sy) + ratios.h + (bounds.maxZ * Math.abs(ratios.ly));
    const maxW = Math.max(220, scene.width * 0.94);
    const maxH = Math.max(170, scene.height * 0.78);
    const maxTile = scene.width < 390 ? 43 : scene.width < 520 ? 52 : 60;
    const tileW = Math.max(26, Math.min(maxTile, maxW / unitW, maxH / unitH));
    const metrics = {
      tileW,
      tileH: tileW * ratios.h,
      stepX: tileW * ratios.sx,
      stepY: tileW * ratios.sy,
      liftX: tileW * ratios.lx,
      liftY: tileW * ratios.ly,
      topOffset: bounds.maxZ * Math.abs(tileW * ratios.ly),
      minX: bounds.minX,
      minY: bounds.minY,
      width: unitW * tileW,
      height: unitH * tileW
    };
    state.boardMetrics = metrics;
    els.board.style.width = `${metrics.width}px`;
    els.board.style.height = `${metrics.height}px`;
    els.board.style.setProperty('--tile-w', `${metrics.tileW}px`);
    els.board.style.setProperty('--tile-h', `${metrics.tileH}px`);
    return metrics;
  }

  function tilePosition(tile, metrics) {
    return {
      left: ((tile.x - metrics.minX) * metrics.stepX) + (tile.z * metrics.liftX),
      top: metrics.topOffset + ((tile.y - metrics.minY) * metrics.stepY) + (tile.z * metrics.liftY)
    };
  }

  function overlaps(a, b) {
    return Math.abs(a.x - b.x) < 0.9 && Math.abs(a.y - b.y) < 0.9;
  }

  function hasAbove(tile) {
    return state.tiles.some(other => !other.removed && other.z > tile.z && overlaps(tile, other));
  }

  function sideBlocked(tile, dir) {
    const sideX = tile.x + dir;
    return state.tiles.some(other => (
      !other.removed &&
      other.id !== tile.id &&
      other.z === tile.z &&
      Math.abs(other.x - sideX) < 0.65 &&
      Math.abs(other.y - tile.y) < 0.65
    ));
  }

  function isFree(tile) {
    return !!tile && !tile.removed && !hasAbove(tile) && (!sideBlocked(tile, -1) || !sideBlocked(tile, 1));
  }

  function render() {
    state.renderQueued = false;
    const metrics = fitBoard();
    if (!metrics) return;

    const fragment = doc.createDocumentFragment();
    state.tiles.forEach(tile => {
      const el = doc.createElement('button');
      const free = isFree(tile);
      const pos = tilePosition(tile, metrics);
      el.type = 'button';
      el.className = `tile ${tile.color || ''}${tile.removed ? ' removed' : ''}${free ? ' free' : ' locked'}${state.selectedId === tile.id ? ' selected' : ''}`;
      el.dataset.id = String(tile.id);
      el.style.left = `${pos.left}px`;
      el.style.top = `${pos.top}px`;
      el.style.zIndex = String((tile.z * 1000) + Math.round(tile.y * 24) + Math.round(tile.x));
      el.disabled = tile.removed;
      el.setAttribute('aria-label', `Ubin ${tile.face}${free ? ', bebas' : ', terkunci'}`);
      el.innerHTML = `<span>${tile.face}</span>`;
      fragment.appendChild(el);
    });
    els.board.replaceChildren(fragment);
    els.pairsText.textContent = String(state.tiles.filter(t => !t.removed).length / 2);
  }

  function requestRender() {
    if (state.renderQueued) return;
    state.renderQueued = true;
    requestAnimationFrame(render);
  }

  function setLevel(index) {
    state.levelIndex = index;
    newGame();
  }

  function nextLevel() {
    state.levelIndex = (state.levelIndex + 1) % LEVELS.length;
    newGame();
  }

  function newGame() {
    stopTimer();
    state.moves = 0;
    state.seconds = 0;
    state.selectedId = null;
    state.gameStarted = false;
    state.busy = false;
    state.layout = LEVELS[state.levelIndex].build();
    const deck = makeDeck(state.layout.length);
    state.tiles = state.layout.map((point, index) => ({
      id: index,
      x: point.x,
      y: point.y,
      z: point.z,
      face: deck[index].face,
      color: deck[index].color,
      matchKey: deck[index].matchKey,
      removed: false
    }));
    els.levelText.textContent = String(state.levelIndex + 1);
    els.levelName.textContent = LEVELS[state.levelIndex].name;
    els.movesText.textContent = '0';
    updateTime();
    makeLevelButtons();
    setMessage(`Bentuk ${state.levelIndex + 1}: <strong>${LEVELS[state.levelIndex].name}</strong>. Pilih ubin terang yang sama.`);
    requestRender();
  }

  function clearHints() {
    doc.querySelectorAll('.tile.hint').forEach(el => el.classList.remove('hint'));
  }

  function freeTiles() {
    return state.tiles.filter(tile => !tile.removed && isFree(tile));
  }

  function findHint() {
    const free = freeTiles();
    for (let i = 0; i < free.length; i += 1) {
      for (let j = i + 1; j < free.length; j += 1) {
        if (free[i].matchKey === free[j].matchKey) return [free[i].id, free[j].id];
      }
    }
    return null;
  }

  function showHint() {
    clearHints();
    const hint = findHint();
    if (!hint) {
      setMessage('Tidak ada pasangan bebas. Tekan Shuffle supaya bisa lanjut.');
      return;
    }
    hint.forEach(id => {
      const el = doc.querySelector(`.tile[data-id="${id}"]`);
      if (el) el.classList.add('hint');
    });
    setMessage('Pasangan yang bercahaya bisa dipilih.');
    setTimeout(clearHints, 1400);
  }

  function showMatch(a, b) {
    els.bigA.textContent = a.face;
    els.bigB.textContent = b.face;
    els.bigA.className = `big-tile ${a.color || ''}`;
    els.bigB.className = `big-tile ${b.color || ''}`;
    els.matchPop.classList.remove('show');
    void els.matchPop.offsetWidth;
    els.matchPop.classList.add('show');
    setTimeout(() => els.matchPop.classList.remove('show'), 530);
  }

  function shakeTiles(aId, bId) {
    [aId, bId].forEach(id => {
      const el = doc.querySelector(`.tile[data-id="${id}"]`);
      if (!el) return;
      el.classList.add('shake');
      setTimeout(() => el.classList.remove('shake'), 230);
    });
  }

  function checkState() {
    const remaining = state.tiles.filter(t => !t.removed).length;
    if (remaining === 0) {
      stopTimer();
      setMessage(`<strong class="win">Menang!</strong> Bentuk ${state.levelIndex + 1} selesai dalam ${state.moves} langkah. Tekan Next untuk lanjut.`);
      return;
    }
    if (!findHint()) setMessage('Tidak ada pasangan bebas. Tekan Shuffle supaya bisa lanjut.');
  }

  function selectTile(id) {
    if (state.busy) return;
    const tile = state.tiles.find(item => item.id === id);
    if (!tile || tile.removed) return;
    if (!isFree(tile)) {
      setMessage('Ubin itu masih terkunci. Pilih ubin yang tidak tertutup dan sisi kiri atau kanannya kosong.');
      return;
    }
    if (!state.gameStarted) {
      state.gameStarted = true;
      startTimer();
    }
    clearHints();
    if (state.selectedId === null) {
      state.selectedId = id;
      setMessage('Pilih pasangan ubin yang sama.');
      requestRender();
      return;
    }
    if (state.selectedId === id) {
      state.selectedId = null;
      requestRender();
      return;
    }

    const first = state.tiles.find(item => item.id === state.selectedId);
    const second = tile;
    state.moves += 1;
    els.movesText.textContent = String(state.moves);

    if (first && first.matchKey === second.matchKey) {
      state.busy = true;
      showMatch(first, second);
      setTimeout(() => {
        first.removed = true;
        second.removed = true;
        state.selectedId = null;
        state.busy = false;
        setMessage('Cocok! Ubin berhasil dihapus.');
        requestRender();
        requestAnimationFrame(checkState);
      }, 430);
      return;
    }

    const old = state.selectedId;
    state.selectedId = null;
    requestRender();
    shakeTiles(old, id);
    setMessage('Belum cocok. Coba pasangan lain.');
  }

  function shuffleBoard() {
    const active = state.tiles.filter(tile => !tile.removed);
    if (active.length < 4) {
      setMessage('Ubin tersisa terlalu sedikit untuk diacak.');
      return;
    }
    const deck = shuffle(active.map(tile => ({ face: tile.face, color: tile.color, matchKey: tile.matchKey })));
    active.forEach((tile, index) => {
      tile.face = deck[index].face;
      tile.color = deck[index].color;
      tile.matchKey = deck[index].matchKey;
    });
    state.selectedId = null;
    state.moves += 1;
    els.movesText.textContent = String(state.moves);
    setMessage('Ubin tersisa sudah diacak ulang.');
    requestRender();
  }

  function onBoardClick(event) {
    const tileEl = event.target.closest('.tile');
    if (!tileEl || !els.board.contains(tileEl)) return;
    const id = Number(tileEl.dataset.id);
    selectTile(id);
  }

  function bindEvents() {
    els.backBtn.addEventListener('click', goBack);
    els.newBtn.addEventListener('click', newGame);
    els.hintBtn.addEventListener('click', showHint);
    els.shuffleBtn.addEventListener('click', shuffleBoard);
    els.nextBtn.addEventListener('click', nextLevel);
    els.board.addEventListener('click', onBoardClick);

    let resizeTick = 0;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTick);
      resizeTick = setTimeout(requestRender, 120);
    });
    window.addEventListener('orientationchange', () => setTimeout(requestRender, 250));
    window.addEventListener('message', event => {
      if (event.data && event.data.type === 'gamedex:game:launch') requestRender();
    });
  }

  bindEvents();
  newGame();
})();
