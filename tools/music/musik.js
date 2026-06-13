'use strict';

const DB_NAME = 'WhoopMusicDB';
const DB_VER = 1;
const TIKTOK_API = 'https://api.siputzx.my.id/api/d/tiktok/v2';
const MUSIC_STORAGE_MODE = 'local-indexeddb';
let db = null;

function $(id){ return document.getElementById(id); }


function icon(name, extraClass = 'ui-icon') {
  return `<svg class="${extraClass} is-${name}" aria-hidden="true" focusable="false"><use href="#i-${name}"></use></svg>`;
}

function iconNode(name, extraClass = 'ui-icon') {
  const span = document.createElement('span');
  span.className = 'svg-icon-wrap';
  span.innerHTML = icon(name, extraClass);
  return span.firstElementChild;
}

function setButtonIcon(id, name, label = '') {
  const el = $(id);
  if (!el) return;
  el.innerHTML = icon(name) + (label ? `<span>${label}</span>` : '');
}

function closeFromGameDex(){
  try{
    if(window.parent && window.parent !== window){
      window.parent.postMessage({ type: 'gamedex:music:close' }, '*');
      return;
    }
  }catch{}
  window.location.href = '../../aula/home.html';
}

window.closeFromGameDex = closeFromGameDex;

// Semua lagu, playlist, dan posisi player disimpan lokal di IndexedDB.
// Music Hub tidak membaca/menulis Firebase, Firestore, atau Supabase.
function openDB() {
  return new Promise((res, rej) => {
    if (db) return res(db);
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = e => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains('songs')) d.createObjectStore('songs', { keyPath:'id' });
      if (!d.objectStoreNames.contains('playlists')) d.createObjectStore('playlists', { keyPath:'id' });
      if (!d.objectStoreNames.contains('state')) d.createObjectStore('state', { keyPath:'key' });
    };
    req.onsuccess = e => { db = e.target.result; res(db); };
    req.onerror = e => rej(e);
  });
}

function dbGet(store, key) {
  return openDB().then(d => new Promise((res, rej) => {
    const req = d.transaction(store,'readonly').objectStore(store).get(key);
    req.onsuccess = () => res(req.result);
    req.onerror = e => rej(e);
  }));
}

function dbGetAll(store) {
  return openDB().then(d => new Promise((res, rej) => {
    const req = d.transaction(store,'readonly').objectStore(store).getAll();
    req.onsuccess = () => res(req.result);
    req.onerror = e => rej(e);
  }));
}

function dbPut(store, value) {
  return openDB().then(d => new Promise((res, rej) => {
    const req = d.transaction(store,'readwrite').objectStore(store).put(value);
    req.onsuccess = () => res();
    req.onerror = e => rej(e);
  }));
}

function dbDelete(store, key) {
  return openDB().then(d => new Promise((res, rej) => {
    const req = d.transaction(store,'readwrite').objectStore(store).delete(key);
    req.onsuccess = () => res();
    req.onerror = e => rej(e);
  }));
}

let allSongs = [];
let playlists = [];
let currentPl = 'all';
let currentIndex = null;
let currentAudio = null;
let currentObjectUrl = null;
let desiredPlaying = false;
let autoResumeTries = 0;
let isShuffled = false;
let repeatMode = 'none';
let addTargetId = null;
let viewMode = localStorage.getItem('whoop:viewMode') || 'whoop';
let currentPage = localStorage.getItem('whoop:page') || viewMode || 'whoop';
let lastTikTokMedia = null;
let audioPlayToken = 0;
let lastAudioErrorAt = 0;
let audioWatchdog = null;
let lastManualActionAt = 0;
let pendingRestoreTime = 0;
let internalAudioChange = false;
let softResumeTries = 0;

async function loadData() {
  try {
    allSongs = await dbGetAll('songs');
    playlists = await dbGetAll('playlists');
    playlists.sort((a,b) => (a.order||0) - (b.order||0));
  } catch(e) {
    console.warn('IndexedDB load error:', e);
    allSongs = [];
    playlists = [];
  }
  showPage(currentPage === 'downloader' ? 'downloader' : viewMode, false);
  renderPlaylistTabs();
  renderList();
  loadPlayState();
}

async function saveSong(song) {
  try { await dbPut('songs', song); }
  catch(e) { console.warn('Save song error:', e); }
}
async function savePlaylist(pl) {
  try { await dbPut('playlists', pl); }
  catch(e) { console.warn('Save playlist error:', e); }
}


function savePlayState() {
  if (currentIndex === null) return;
  const pos = {
    key: 'playstate',
    idx: currentIndex,
    time: currentAudio?.currentTime || 0,
    paused: currentAudio?.paused ?? true,
  };
  dbPut('state', pos).catch(()=>{});
}

async function loadPlayState() {
  try {
    const pos = await dbGet('state','playstate');
    if (!pos || pos.idx >= allSongs.length) return;
    const savedSong = allSongs[pos.idx];
    if (!savedSong) return;
    if ((viewMode === 'tiktok') !== !!isTikTokSong(savedSong)) return;

    // Penting untuk Android/Acode: jangan auto-play saat iframe baru dimuat.
    // Iframe music sudah hidup sejak Home dibuka, jadi autoplay awal sering ditolak
    // dan bisa terlihat seperti lagu nyala-mati sendiri.
    currentIndex = pos.idx;
    pendingRestoreTime = Number(pos.time || 0) || 0;
    desiredPlaying = false;
    updatePlayerUI(savedSong, false);
    $('timeNow').textContent = fmtTime(pendingRestoreTime);
    setButtonIcon('playPauseBtn', 'play');
    markPlayingUI(false);
    renderList();
  } catch {}
}

function resetPlayerUI() {
  $('nowPlaying').textContent = 'Tidak ada musik';
  $('playerPlaylist').textContent = '—';
  $('playerArt').innerHTML = icon(viewMode === 'tiktok' ? 'tiktok' : 'music');
  setButtonIcon('playPauseBtn', 'play');
  $('timeNow').textContent = '0:00';
  $('timeTotal').textContent = '0:00';
  $('progressBar').value = 0;
  $('miniPlayer')?.classList.remove('playing');
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'none';
}

function getAudioElement() {
  let audio = $('gamedexAudio');
  if (!audio) {
    audio = document.createElement('audio');
    audio.id = 'gamedexAudio';
    audio.preload = 'metadata';
    audio.setAttribute('playsinline', '');
    audio.style.display = 'none';
    document.body.appendChild(audio);
  }
  audio.controls = false;
  audio.preload = 'metadata';
  audio.setAttribute('playsinline', '');
  try { audio.disableRemotePlayback = true; } catch {}
  return audio;
}

function clearAudioHandlers(audio) {
  if (!audio) return;
  audio.onloadedmetadata = null;
  audio.ontimeupdate = null;
  audio.onended = null;
  audio.onerror = null;
  audio.onstalled = null;
  audio.onwaiting = null;
  audio.onplaying = null;
  audio.onplay = null;
  audio.onpause = null;
}

function requestAudioPlay(token) {
  if (!currentAudio || token !== audioPlayToken) return;
  desiredPlaying = true;
  const playPromise = currentAudio.play();
  if (playPromise && typeof playPromise.then === 'function') {
    playPromise
      .then(() => {
        if (token !== audioPlayToken) return;
        markPlayingUI(true);
        renderList();
      })
      .catch(err => {
        if (token !== audioPlayToken) return;
        showAudioPlayError(err);
      });
  }
}

function revokeCurrentObjectUrl() {
  if (currentObjectUrl) {
    try { URL.revokeObjectURL(currentObjectUrl); } catch {}
    currentObjectUrl = null;
  }
}

function dataUrlToBlob(dataUrl) {
  try {
    const [meta, data] = String(dataUrl).split(',');
    const mime = /data:([^;]+)/.exec(meta)?.[1] || 'audio/mpeg';
    const bin = atob(data || '');
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  } catch (err) {
    console.warn('Gagal ubah dataURL ke Blob:', err);
    return null;
  }
}

function getPlayableSrc(song) {
  revokeCurrentObjectUrl();
  const blob = song?.audioBlob || song?.blob || null;
  if (blob instanceof Blob) {
    currentObjectUrl = URL.createObjectURL(blob);
    return currentObjectUrl;
  }

  if (typeof song?.url === 'string' && song.url.startsWith('data:audio')) {
    const converted = dataUrlToBlob(song.url);
    if (converted) {
      currentObjectUrl = URL.createObjectURL(converted);
      return currentObjectUrl;
    }
  }

  return song?.url || song?.remoteUrl || '';
}

function markPlayingUI(isPlaying) {
  if ($('playPauseBtn')) $('playPauseBtn').innerHTML = icon(isPlaying ? 'pause' : 'play');
  $('miniPlayer')?.classList.toggle('playing', !!isPlaying);
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
}

function stopOnVisualChange(nextMode) {
  if (!currentAudio || currentIndex === null) return;
  const song = allSongs[currentIndex];
  const shouldBeTikTok = nextMode === 'tiktok';
  if (!!isTikTokSong(song) !== shouldBeTikTok) {
    stopCurrent();
    currentIndex = null;
    resetPlayerUI();
    showStatus('Lagu sebelumnya distop karena pindah tampilan player.', 'ok');
  }
}

function setViewMode(mode, rerender = true) {
  const nextMode = mode === 'tiktok' ? 'tiktok' : 'whoop';
  // Mode Whoop dan TikTok dipisah. Kalau pindah mode, audio mode sebelumnya distop.
  stopOnVisualChange(nextMode);
  viewMode = nextMode;
  localStorage.setItem('whoop:viewMode', viewMode);
  document.body.classList.toggle('theme-tiktok', viewMode === 'tiktok');
  document.body.classList.toggle('theme-whoop', viewMode !== 'tiktok');
  document.body.classList.toggle('theme-downloader', currentPage === 'downloader');
  $('pageWhoopBtn')?.classList.toggle('active', currentPage === 'whoop');
  $('pageTiktokBtn')?.classList.toggle('active', currentPage === 'tiktok');
  $('pageDownloaderBtn')?.classList.toggle('active', currentPage === 'downloader');

  if (viewMode === 'tiktok') {
    $('appTitle').innerHTML = `<span class="title-icon">${icon('tiktok')}</span><span>TikTok Music</span>`;
    $('appSubtitle').textContent = 'Mode khusus sound TikTok hasil download. Pindah dari Whoop akan menghentikan lagu biasa.';
    $('modeEyebrow').textContent = 'TIKTOK SOUNDS';
    $('searchInput').placeholder = 'Cari sound TikTok...';
    $('uploadLabel')?.classList.add('hidden');
  } else {
    $('appTitle').innerHTML = `<span class="title-icon">${icon('music')}</span><span>Whoop Music</span>`;
    $('appSubtitle').textContent = 'Upload lagu lokal dan buat playlist. Pindah ke TikTok akan menghentikan musik biasa.';
    $('modeEyebrow').textContent = 'LOCAL LIBRARY';
    $('searchInput').placeholder = 'Cari lagu...';
    $('uploadLabel')?.classList.remove('hidden');
  }

  if (rerender) {
    renderPlaylistTabs();
    renderList();
  }
}

function showPage(page, rerender = true) {
  const nextPage = ['whoop','tiktok','downloader'].includes(page) ? page : 'whoop';
  currentPage = nextPage;
  localStorage.setItem('whoop:page', currentPage);
  document.body.classList.toggle('theme-downloader', currentPage === 'downloader');
  $('libraryPage')?.classList.toggle('active', currentPage !== 'downloader');
  $('downloaderPage')?.classList.toggle('active', currentPage === 'downloader');
  $('pageWhoopBtn')?.classList.toggle('active', currentPage === 'whoop');
  $('pageTiktokBtn')?.classList.toggle('active', currentPage === 'tiktok');
  $('pageDownloaderBtn')?.classList.toggle('active', currentPage === 'downloader');

  if (currentPage === 'tiktok') setViewMode('tiktok', rerender);
  else if (currentPage === 'whoop') setViewMode('whoop', rerender);
  else {
    document.body.classList.remove('theme-whoop','theme-tiktok');
    document.body.classList.add('theme-downloader');
    setTimeout(() => $('tiktokUrl')?.focus(), 80);
  }
}

function openDownloader() { showPage('downloader'); }
function closeDownloader() { showPage(viewMode === 'tiktok' ? 'tiktok' : 'whoop'); }
function openMenu() {
  $('menuOverlay')?.classList.remove('hidden');
  $('btnMenu')?.classList.add('active');
  $('btnMenu')?.setAttribute('aria-expanded', 'true');
}
function closeMenu() {
  $('menuOverlay')?.classList.add('hidden');
  $('btnMenu')?.classList.remove('active');
  $('btnMenu')?.setAttribute('aria-expanded', 'false');
}

async function createPlaylist() {
  const input = $('newPlaylistName');
  const name = input.value.trim();
  if (!name) return;
  const pl = { id: 'pl_' + Date.now(), name, order: playlists.length };
  playlists.push(pl);
  await savePlaylist(pl);
  closeModal();
  renderPlaylistTabs();
  switchPlaylist(pl.id);
}

async function deletePlaylist(id) {
  if (!confirm('Hapus playlist ini?')) return;
  playlists = playlists.filter(p => p.id !== id);
  await dbDelete('playlists', id);
  for (const s of allSongs) {
    if (s.playlistId === id) { s.playlistId = null; await saveSong(s); }
  }
  if (currentPl === id) switchPlaylist('all');
  else { renderPlaylistTabs(); renderList(); }
}

function switchPlaylist(id) {
  currentPl = id;
  renderPlaylistTabs();
  renderList();
}

function openAddToPlaylist(songId) {
  addTargetId = songId;
  const list = $('addPlList');
  list.innerHTML = '';
  if (!playlists.length) {
    list.innerHTML = '<div style="color:rgba(255,255,255,.55);font-size:13px;padding:8px">Belum ada playlist. Buat dulu!</div>';
  }
  playlists.forEach(pl => {
    const item = document.createElement('div');
    item.className = 'add-pl-item';
    item.innerHTML = `${icon('folder')}<span>${escapeHtml(pl.name)}</span>`;
    item.onclick = async () => {
      const s = allSongs.find(s => s.id === addTargetId);
      if (s) { s.playlistId = pl.id; await saveSong(s); }
      $('modalAddPl').classList.add('hidden');
      renderList();
    };
    list.appendChild(item);
  });
  $('modalAddPl').classList.remove('hidden');
}

function isTikTokSong(song) { return song.source === 'tiktok' || song.type === 'tiktok'; }

function getSongs() {
  const q = ($('searchInput')?.value || '').toLowerCase();
  let list = currentPl === 'all' ? allSongs : allSongs.filter(s => s.playlistId === currentPl);
  if (viewMode === 'tiktok') list = list.filter(isTikTokSong);
  if (viewMode === 'whoop') list = list.filter(s => !isTikTokSong(s));
  if (q) list = list.filter(s => (s.name || '').toLowerCase().includes(q));
  return list;
}

function renderPlaylistTabs() {
  const tabs = $('playlistTabs');
  tabs.innerHTML = '';
  const all = document.createElement('div');
  all.className = 'pl-tab' + (currentPl === 'all' ? ' active' : '');
  all.innerHTML = `${icon(viewMode === 'tiktok' ? 'tiktok' : 'music')}<span>${viewMode === 'tiktok' ? 'TikTok Sound' : 'Semua'}</span>`;
  all.onclick = () => switchPlaylist('all');
  tabs.appendChild(all);

  playlists.forEach(pl => {
    const tab = document.createElement('div');
    tab.className = 'pl-tab' + (currentPl === pl.id ? ' active' : '');
    const del = document.createElement('button');
    del.className = 'pl-tab-del';
    del.innerHTML = icon('x');
    del.onclick = e => { e.stopPropagation(); deletePlaylist(pl.id); };
    const nameSpan = document.createElement('span');
    nameSpan.textContent = pl.name;
    tab.append(iconNode('folder'), nameSpan, del);
    tab.onclick = () => switchPlaylist(pl.id);
    tabs.appendChild(tab);
  });
}

function renderList() {
  const list = $('musicList');
  const songs = getSongs();
  list.innerHTML = '';

  if (!songs.length) {
    const isTik = viewMode === 'tiktok';
    list.innerHTML = `<div class="empty-state edge-card"><div class="icon">${icon(isTik ? 'tiktok' : 'music', 'ui-icon empty-icon')}</div>${isTik ? 'Belum ada sound TikTok.<br>Tekan <b>TikTok DL</b> untuk ambil sound.' : 'Belum ada musik lokal.<br>Tekan <b>Upload</b> untuk tambah lagu.'}</div>`;
    return;
  }

  songs.forEach(song => {
    const gIdx = allSongs.findIndex(s => s.id === song.id);
    const isPlaying = currentIndex === gIdx && currentAudio && !currentAudio.paused;
    const sourceTik = isTikTokSong(song);

    const card = document.createElement('div');
    card.className = 'music-card edge-card' + (isPlaying ? ' playing' : '');

    const artDiv = document.createElement('div');
    artDiv.className = song.artUrl ? 'card-art' : 'card-art-default';
    if (song.artUrl) artDiv.innerHTML = `<img src="${escapeAttr(song.artUrl)}" alt="art">`;
    else artDiv.innerHTML = icon(sourceTik ? 'tiktok' : 'music', 'ui-icon art-icon');

    const plName = playlists.find(p => p.id === song.playlistId)?.name || (sourceTik ? 'TikTok Sound' : 'Semua Lagu');
    const info = document.createElement('div');
    info.className = 'card-info';
    info.innerHTML = `
      <div class="card-title">${escapeHtml(song.name || 'Tanpa Judul')}</div>
      <div class="card-sub">${escapeHtml(plName)}</div>
      ${sourceTik ? '<div class="card-source">SIPUTZX · TIKTOK V2</div>' : ''}
    `;

    const dot = document.createElement('div');
    if (isPlaying) dot.className = 'card-playing-dot';

    const actions = document.createElement('div');
    actions.className = 'card-actions';
    const mkBtn = (cls, iconName, fn, title = '') => {
      const b = document.createElement('button');
      b.className = `card-btn ${cls}`;
      b.innerHTML = icon(iconName);
      b.title = title;
      b.setAttribute('aria-label', title || iconName);
      b.onclick = e => { e.stopPropagation(); fn(); };
      return b;
    };

    if (sourceTik && song.tiktokUrl) actions.append(mkBtn('card-btn-add', 'external', () => window.open(song.tiktokUrl, '_blank'), 'Buka TikTok'));
    actions.append(
      mkBtn('card-btn-add', 'folder-plus', () => openAddToPlaylist(song.id), 'Tambah ke playlist'),
      mkBtn('card-btn-play', isPlaying ? 'pause' : 'play', () => playByGlobalIndex(gIdx), 'Putar'),
      mkBtn('card-btn-del', 'trash', () => deleteSong(song.id), 'Hapus')
    );

    card.append(artDiv, info, dot, actions);
    card.onclick = () => playByGlobalIndex(gIdx);
    list.appendChild(card);
  });
}


function clearAudioWatchdog() {
  // v5: watchdog dimatikan.
  // Di Android Chrome, auto-resume interval bisa bikin audio nyala-mati-nyala-mati.
  if (audioWatchdog) {
    clearInterval(audioWatchdog);
    audioWatchdog = null;
  }
}

function startAudioWatchdog() {
  // Sengaja kosong. Play/pause sekarang hanya dikontrol dari tombol user, ended, next/prev.
  clearAudioWatchdog();
}

function playByGlobalIndex(idx, startTime = 0, startPaused = false) {
  if (idx < 0 || idx >= allSongs.length) return;

  // Kalau lagu yang sama sudah siap, cukup toggle.
  // Ini mencegah src di-reset dan mencegah audio putus sendiri.
  if (currentIndex === idx && currentAudio && currentAudio.src && startTime === 0) {
    if (currentAudio.ended || (Number.isFinite(currentAudio.duration) && currentAudio.currentTime >= currentAudio.duration - 0.25)) {
      try { currentAudio.currentTime = 0; } catch {}
      requestAudioPlay(audioPlayToken);
      return;
    }
    toggleCurrentMusic();
    return;
  }

  const song = allSongs[idx];
  const token = ++audioPlayToken;
  const shouldPlay = !startPaused;
  pendingRestoreTime = 0;
  desiredPlaying = shouldPlay;
  currentIndex = idx;
  autoResumeTries = 0;
  softResumeTries = 0;

  const audio = getAudioElement();
  internalAudioChange = true;

  try { audio.pause(); } catch {}
  clearAudioHandlers(audio);

  // Ganti sumber hanya saat benar-benar pindah lagu.
  const src = getPlayableSrc(song);
  if (!src) {
    internalAudioChange = false;
    desiredPlaying = false;
    showStatus('File audio tidak ditemukan. Hapus lagu ini lalu upload ulang.', 'err');
    markPlayingUI(false);
    return;
  }

  currentAudio = audio;
  audio.src = src;

  audio.onloadedmetadata = () => {
    if (token !== audioPlayToken || currentAudio !== audio) return;
    $('timeTotal').textContent = fmtTime(audio.duration);
    const restoreTime = Number(startTime || 0) || 0;
    if (restoreTime > 0 && Number.isFinite(audio.duration)) {
      try { audio.currentTime = Math.min(restoreTime, Math.max(0, audio.duration - 0.5)); } catch {}
    }
  };

  audio.ontimeupdate = () => {
    if (token !== audioPlayToken || currentAudio !== audio) return;
    updateProgress();
  };

  audio.onended = () => {
    if (token !== audioPlayToken || currentAudio !== audio) return;
    onEnded();
  };

  audio.onerror = () => {
    if (token !== audioPlayToken || currentAudio !== audio) return;
    handleAudioError(song, token);
  };

  audio.onwaiting = () => {
    if (token === audioPlayToken && desiredPlaying) showStatus('Audio sedang buffering...', '');
  };

  audio.onstalled = () => {
    if (token === audioPlayToken && desiredPlaying) showStatus('Audio tersendat. Kalau sering terjadi, hapus lalu upload ulang lagunya.', 'err');
  };

  audio.onplaying = () => {
    if (token !== audioPlayToken || currentAudio !== audio) return;
    internalAudioChange = false;
    desiredPlaying = true;
    softResumeTries = 0;
    markPlayingUI(true);
    renderList();
  };

  audio.onplay = () => {
    if (token !== audioPlayToken || currentAudio !== audio) return;
    desiredPlaying = true;
    markPlayingUI(true);
    renderList();
  };

  audio.onpause = () => {
    if (token !== audioPlayToken || currentAudio !== audio) return;
    if (internalAudioChange) return;

    // Kalau Android/browser mem-pause sendiri saat buffering/focus hilang sebentar,
    // coba resume pelan maksimal 2x. Tidak pakai interval/watchdog agar tidak nyala-mati terus.
    if (desiredPlaying && !audio.ended && softResumeTries < 2) {
      softResumeTries++;
      markPlayingUI(false);
      renderList();
      setTimeout(() => {
        if (token !== audioPlayToken || currentAudio !== audio) return;
        if (desiredPlaying && audio.paused && !audio.ended) requestAudioPlay(token);
      }, 900);
      return;
    }

    desiredPlaying = false;
    markPlayingUI(false);
    renderList();
  };

  try { audio.load(); } catch {}
  setTimeout(() => {
    if (token === audioPlayToken) internalAudioChange = false;
  }, 180);

  updatePlayerUI(song, false);
  updateMediaSession(song);
  renderList();

  if (shouldPlay) requestAudioPlay(token);
}

function showAudioPlayError(err) {
  console.warn('Audio play error:', err);
  desiredPlaying = false;
  showStatus('Audio gagal diputar. Coba pencet play sekali lagi. Kalau tetap mati sendiri, upload ulang lagunya.', 'err');
  markPlayingUI(false);
}

function handleAudioError(song, token) {
  if (token !== audioPlayToken) return;
  const now = Date.now();
  if (now - lastAudioErrorAt < 1200) return;
  lastAudioErrorAt = now;

  // Kalau versi offline/dataURL gagal, coba fallback ke link asli.
  if (song && song.remoteUrl && currentAudio && (song.audioBlob || song.blob || song.url !== song.remoteUrl)) {
    showStatus('Audio offline error, mencoba link asli...', 'err');
    const t = currentAudio.currentTime || 0;
    try {
      revokeCurrentObjectUrl();
      currentAudio.src = song.remoteUrl;
      try { currentAudio.load(); } catch {}
      try { currentAudio.currentTime = t; } catch {}
      requestAudioPlay(token);
      return;
    } catch {}
  }

  showStatus('Sound berhenti karena link audio error/expired. Coba download ulang sound-nya.', 'err');
  desiredPlaying = false;
  markPlayingUI(false);
}

function stopCurrent(keepToken = false) {
  clearAudioWatchdog();
  if (!keepToken) audioPlayToken++;
  desiredPlaying = false;
  autoResumeTries = 0;
  softResumeTries = 0;
  pendingRestoreTime = 0;
  const audio = currentAudio;
  internalAudioChange = true;
  if (audio) {
    try { audio.pause(); } catch {}
    clearAudioHandlers(audio);
    try { audio.removeAttribute('src'); audio.load(); } catch {}
  }
  currentAudio = null;
  revokeCurrentObjectUrl();
  internalAudioChange = false;
  markPlayingUI(false);
}

function toggleCurrentMusic() {
  const now = Date.now();
  if (now - lastManualActionAt < 180) return;
  lastManualActionAt = now;

  if (!currentAudio) {
    if (currentIndex !== null) {
      playByGlobalIndex(currentIndex, pendingRestoreTime || 0, false);
    }
    return;
  }

  if (currentAudio.paused || currentAudio.ended) {
    if (currentAudio.ended) {
      try { currentAudio.currentTime = 0; } catch {}
    }
    requestAudioPlay(audioPlayToken);
  } else {
    desiredPlaying = false;
    try { currentAudio.pause(); } catch {}
    markPlayingUI(false);
  }
  renderList();
}

function onEnded() {
  if (!currentAudio) return;
  if (repeatMode === 'one') {
    currentAudio.currentTime = 0;
    requestAudioPlay(audioPlayToken);
    return;
  }

  const songs = getSongs();
  if (!songs.length) return finishCurrentTrack();
  const cur = songs.findIndex(s => s.id === allSongs[currentIndex]?.id);

  // Mode none: berhenti rapi di lagu terakhir. Mode all: muter terus.
  if (repeatMode === 'none' && cur >= songs.length - 1) {
    finishCurrentTrack();
    return;
  }

  nextMusic(true);
}

function finishCurrentTrack() {
  if (!currentAudio) return;
  desiredPlaying = false;
  try { currentAudio.currentTime = 0; } catch {}
  markPlayingUI(false);
  renderList();
}


function nextMusic(fromEnded = false) {
  if (!fromEnded) lastManualActionAt = Date.now();
  const songs = getSongs();
  if (!songs.length) return;
  if (isShuffled) {
    const idxs = songs.map(s => allSongs.findIndex(a => a.id === s.id));
    const target = idxs[Math.floor(Math.random() * idxs.length)];
    if (fromEnded && target === currentIndex && currentAudio) { try { currentAudio.currentTime = 0; } catch {}; requestAudioPlay(audioPlayToken); return; }
    playByGlobalIndex(target);
  } else {
    const cur = songs.findIndex(s => s.id === allSongs[currentIndex]?.id);
    const next = (cur + 1) % songs.length;
    const target = allSongs.findIndex(a => a.id === songs[next].id);
    if (fromEnded && target === currentIndex && currentAudio) { try { currentAudio.currentTime = 0; } catch {}; requestAudioPlay(audioPlayToken); return; }
    playByGlobalIndex(target);
  }
}

function prevMusic() {
  lastManualActionAt = Date.now();
  if (currentAudio && currentAudio.currentTime > 3) { currentAudio.currentTime = 0; return; }
  const songs = getSongs();
  if (!songs.length) return;
  const cur = songs.findIndex(s => s.id === allSongs[currentIndex]?.id);
  const prev = (cur - 1 + songs.length) % songs.length;
  playByGlobalIndex(allSongs.findIndex(a => a.id === songs[prev].id));
}

function toggleShuffle() {
  isShuffled = !isShuffled;
  $('btnShuffle').classList.toggle('active', isShuffled);
}

function toggleRepeat() {
  const modes = ['none','all','one'];
  const icons = ['repeat','repeat','repeat-one'];
  const titles = ['Repeat Off','Repeat All','Repeat One'];
  repeatMode = modes[(modes.indexOf(repeatMode) + 1) % 3];
  const btn = $('btnRepeat');
  btn.innerHTML = icon(icons[modes.indexOf(repeatMode)]);
  btn.classList.toggle('active', repeatMode !== 'none');
  btn.title = titles[modes.indexOf(repeatMode)];
}

function updateProgress() {
  if (!currentAudio) return;
  const pct = (currentAudio.currentTime / currentAudio.duration) * 100 || 0;
  const pb = $('progressBar');
  pb.value = pct;
  pb.style.setProperty('--pct', pct.toFixed(2) + '%');
  $('timeNow').textContent = fmtTime(currentAudio.currentTime);
  if ('mediaSession' in navigator && navigator.mediaSession.setPositionState && currentAudio.duration) {
    try { navigator.mediaSession.setPositionState({ duration: currentAudio.duration, playbackRate:1, position: currentAudio.currentTime }); } catch {}
  }
}

function fmtTime(s) {
  if (!isFinite(s)) return '0:00';
  return `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`;
}

function updatePlayerUI(song, playing = true) {
  $('nowPlaying').textContent = song.name || 'Tanpa Judul';
  $('playPauseBtn').innerHTML = icon(playing ? 'pause' : 'play');
  const plName = playlists.find(p => p.id === song.playlistId)?.name || (isTikTokSong(song) ? 'TikTok Sound' : 'Semua Lagu');
  $('playerPlaylist').textContent = isTikTokSong(song) ? `TikTok Music • ${plName}` : plName;
  const artEl = $('playerArt');
  if (song.artUrl) artEl.innerHTML = `<img src="${escapeAttr(song.artUrl)}" alt="art">`;
  else artEl.innerHTML = icon(isTikTokSong(song) ? 'tiktok' : 'music');
  $('miniPlayer').classList.toggle('playing', playing);
}

function updateMediaSession(song) {
  if (!('mediaSession' in navigator)) return;
  const artwork = song.artUrl ? [{ src: song.artUrl, sizes:'512x512', type:'image/jpeg' }] : [];
  navigator.mediaSession.metadata = new MediaMetadata({
    title: song.name,
    artist: isTikTokSong(song) ? 'TikTok Music' : 'Whoop Music',
    album: playlists.find(p => p.id === song.playlistId)?.name || (isTikTokSong(song) ? 'TikTok Sound' : 'Semua Lagu'),
    artwork,
  });
  navigator.mediaSession.playbackState = currentAudio && !currentAudio.paused ? 'playing' : 'paused';
  navigator.mediaSession.setActionHandler('play', () => { if (currentAudio) requestAudioPlay(audioPlayToken); });
  navigator.mediaSession.setActionHandler('pause', () => { desiredPlaying = false; try { currentAudio?.pause(); } catch {}; markPlayingUI(false); });
  navigator.mediaSession.setActionHandler('nexttrack', () => nextMusic());
  navigator.mediaSession.setActionHandler('previoustrack', () => prevMusic());
  navigator.mediaSession.setActionHandler('seekto', d => { if (currentAudio && d.seekTime != null) currentAudio.currentTime = d.seekTime; });
}

async function deleteSong(id) {
  const idx = allSongs.findIndex(s => s.id === id);
  if (idx === -1) return;
  if (currentIndex === idx) { stopCurrent(); currentIndex = null; }
  else if (currentIndex !== null && currentIndex > idx) currentIndex--;
  allSongs.splice(idx, 1);
  await dbDelete('songs', id);
  renderList();
}

async function clearTikTokSounds() {
  const tiktokSongs = allSongs.filter(isTikTokSong);
  if (!tiktokSongs.length) return showStatus('Belum ada sound TikTok yang tersimpan.', 'err');
  if (!confirm(`Hapus ${tiktokSongs.length} sound TikTok? Lagu lokal tidak ikut terhapus.`)) return;
  for (const song of tiktokSongs) {
    if (allSongs[currentIndex]?.id === song.id) { stopCurrent(); currentIndex = null; }
    await dbDelete('songs', song.id);
  }
  allSongs = allSongs.filter(s => !isTikTokSong(s));
  renderList();
  showStatus('Sound TikTok sudah dibersihkan.', 'ok');
}

async function handleUpload(files) {
  if (!files.length) return;
  if (viewMode === 'tiktok' || currentPage === 'tiktok') showPage('whoop');
  const list = $('musicList');
  const loading = document.createElement('div');
  loading.className = 'empty-state edge-card';
  loading.innerHTML = `<div class="icon">${icon('upload', 'ui-icon empty-icon')}</div>Mengupload ${files.length} lagu...`;
  list.prepend(loading);

  let loaded = 0;
  for (const file of files) {
    try {
      const artUrl = await extractArt(file);
      const clean = file.name.replace(/\.[^.]+$/, '').replace(/[_-]/g,' ');
      const audioBlob = file.slice(0, file.size, file.type || 'audio/mpeg');
      const song = {
        id: 'song_' + Date.now() + '_' + Math.random().toString(36).slice(2),
        name: clean,
        url: '',
        audioBlob,
        blobType: audioBlob.type || file.type || 'audio/mpeg',
        size: file.size,
        artUrl: artUrl || null,
        playlistId: currentPl !== 'all' ? currentPl : null,
        source: 'local',
      };
      allSongs.push(song);
      await saveSong(song);
    } catch (err) {
      console.warn('Upload lagu gagal:', file?.name, err);
      showStatus(`Gagal upload ${file?.name || 'lagu'}. Coba file lain.`, 'err');
    } finally {
      loaded++;
      if (loaded === files.length) { loading.remove(); renderList(); }
    }
  }
}

async function getTikTokMedia() {
  const input = $('tiktokUrl');
  const tiktokUrl = input.value.trim();
  if (!tiktokUrl) throw new Error('Masukkan link TikTok dulu.');
  if (!/^https?:\/\//i.test(tiktokUrl) || !/tiktok\.com|vt\.tiktok\.com|vm\.tiktok\.com/i.test(tiktokUrl)) {
    throw new Error('Link TikTok-nya belum valid.');
  }

  showStatus('Mengambil data dari Siputzx TikTok V2...', '');
  const apiUrl = `${TIKTOK_API}?url=${encodeURIComponent(tiktokUrl)}`;
  const response = await fetch(apiUrl, { method:'GET', cache:'no-store' });
  let json;
  try { json = await response.json(); }
  catch { throw new Error('Response API bukan JSON.'); }
  if (!response.ok || json.status === false) throw new Error(json.error || json.message || `HTTP ${response.status}`);

  const data = json.data || json.result || json;
  const meta = data.metadata || data.meta || data.author || {};
  const title = cleanTitle(meta.title || meta.description || data.title || data.description || data.caption || 'TikTok Download');
  const audioUrl = pickAudioUrl(data) || pickAudioUrl(json);
  const videoUrl = pickVideoUrl(data) || pickVideoUrl(json);
  const cover = pickCoverUrl(data) || pickCoverUrl(json) || null;

  if (!audioUrl && !videoUrl) throw new Error('Media MP3/MP4 tidak ditemukan di response API.');
  lastTikTokMedia = { tiktokUrl, title, audioUrl, videoUrl, cover, raw: json };
  renderTikTokResult(lastTikTokMedia);
  return lastTikTokMedia;
}

async function cacheAudioForOffline(url) {
  if (!isUrl(url)) return { url, audioBlob: null, cachedOffline: false };
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    if (!blob || !blob.size) throw new Error('Blob kosong');

    // Biar IndexedDB tidak berat di HP. Kalau terlalu besar, pakai link asli saja.
    if (blob.size > 45 * 1024 * 1024) return { url, audioBlob: null, cachedOffline: false };

    const type = blob.type && blob.type !== 'application/octet-stream' ? blob.type : 'audio/mpeg';
    const fixedBlob = blob.type === type ? blob : new Blob([blob], { type });
    return { url: '', audioBlob: fixedBlob, cachedOffline: true };
  } catch (err) {
    console.warn('Cache audio gagal, pakai link remote:', err);
    return { url, audioBlob: null, cachedOffline: false };
  }
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('Gagal baca blob'));
    reader.readAsDataURL(blob);
  });
}

async function downloadTikTokSound() {
  const btn = $('btnDownloadTikTok');
  btn.disabled = true;
  btn.textContent = 'Menyimpan...';
  try {
    const media = await getTikTokMedia();
    if (!media.audioUrl) throw new Error('MP3/audio tidak ditemukan. Coba tombol MP4 atau link TikTok lain.');
    showStatus('Menyimpan MP3 ke penyimpanan lokal HP/browser...', '');
    const cached = await cacheAudioForOffline(media.audioUrl);
    const song = {
      id: 'tt_' + Date.now() + '_' + Math.random().toString(36).slice(2),
      name: media.title,
      url: cached.url || media.audioUrl,
      audioBlob: cached.audioBlob || null,
      remoteUrl: media.audioUrl,
      cachedOffline: !!cached.cachedOffline,
      artUrl: media.cover,
      playlistId: null,
      source: 'tiktok',
      tiktokUrl: media.tiktokUrl,
      videoUrl: media.videoUrl || null,
      meta: { downloadedAt: new Date().toISOString() }
    };

    allSongs.unshift(song);
    await saveSong(song);
    showPage('tiktok');
    showStatus(song.cachedOffline ? 'Berhasil! MP3 masuk ke TikTok Music lokal dan tersimpan offline.' : 'Berhasil! MP3 masuk ke TikTok Music lokal. Link remote dipakai karena CDN tidak bisa dicache.', 'ok');
    renderList();
    playByGlobalIndex(allSongs.findIndex(s => s.id === song.id));
  } catch (err) {
    console.error(err);
    showStatus('Gagal simpan MP3: ' + (err.message || err), 'err');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Simpan MP3 ke TikTok Music';
  }
}

async function downloadTikTokDirect(type) {
  const mp3 = type === 'mp3';
  const btn = mp3 ? $('btnDownloadMp3') : $('btnDownloadMp4');
  btn.disabled = true;
  btn.textContent = mp3 ? 'Loading MP3...' : 'Loading MP4...';
  try {
    const media = await getTikTokMedia();
    const url = mp3 ? media.audioUrl : media.videoUrl;
    if (!url) throw new Error(mp3 ? 'MP3/audio tidak ditemukan dari API.' : 'MP4/video tidak ditemukan dari API.');
    const safe = media.title.replace(/[^a-z0-9_ -]/gi, '').trim().slice(0, 45) || 'tiktok';
    await forceDownloadUrl(url, `${safe}.${mp3 ? 'mp3' : 'mp4'}`);
    showStatus(`${mp3 ? 'MP3' : 'MP4'} dikirim ke browser. Cek folder Download HP kamu.`, 'ok');
  } catch (err) {
    console.error(err);
    showStatus('Gagal download: ' + (err.message || err), 'err');
  } finally {
    btn.disabled = false;
    btn.textContent = mp3 ? 'MP3' : 'MP4';
  }
}

function renderTikTokResult(media) {
  $('downloadResult')?.classList.remove('hidden');
  $('resultTitle').textContent = media.title || 'TikTok Download';
  $('resultMeta').textContent = `${media.audioUrl ? 'MP3 tersedia' : 'MP3 tidak ada'} · ${media.videoUrl ? 'MP4 tersedia' : 'MP4 tidak ada'}`;
  const cover = $('resultCover');
  if (cover) {
    if (media.cover) cover.innerHTML = `<img src="${escapeAttr(media.cover)}" alt="cover">`;
    else cover.innerHTML = '<span class="dl-result-placeholder">No Cover</span>';
  }
}

async function forceDownloadUrl(url, filename) {
  try {
    const res = await fetch(url, { cache:'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    triggerDownload(blobUrl, filename);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);
  } catch (err) {
    // Beberapa CDN TikTok menolak CORS. Fallback: buka link langsung agar browser Android tetap bisa mengunduh.
    triggerDownload(url, filename, true);
  }
}

function triggerDownload(url, filename, openNew = false) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  if (openNew) a.target = '_blank';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function showStatus(text, type) {
  const el = $('downloadStatus');
  if (!el) return;
  el.textContent = text;
  el.classList.remove('ok','err');
  if (type) el.classList.add(type);
}

function pickAudioUrl(obj) {
  if (!obj || typeof obj !== 'object') return null;
  const directKeys = ['audio','mp3','sound','audioUrl','audio_url','music','musicUrl','music_url','play_url','playUrl'];
  for (const key of directKeys) {
    if (isUrl(obj[key]) && !/cover|thumb|image|avatar|video|mp4|nowm|wm/i.test(key)) return obj[key];
  }
  const direct = obj.music;
  if (isUrl(direct)) return direct;
  if (obj.download && isUrl(obj.download.audio)) return obj.download.audio;
  if (obj.download && isUrl(obj.download.music)) return obj.download.music;
  if (obj.data) {
    const fromData = pickAudioUrl(obj.data);
    if (fromData) return fromData;
  }
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (typeof val === 'string' && /audio|music|mp3|sound|play_url|playUrl/i.test(key) && !/cover|thumb|image|avatar|video|mp4|nowm|wm/i.test(key) && isUrl(val)) return val;
    if (Array.isArray(val) && /audio|music|mp3|sound/i.test(key)) {
      const hit = val.find(isUrl);
      if (hit) return hit;
    }
    if (val && typeof val === 'object') {
      const found = pickAudioUrl(val);
      if (found) return found;
    }
  }
  return null;
}

function pickVideoUrl(obj) {
  if (!obj || typeof obj !== 'object') return null;
  const direct = obj.video || obj.mp4 || obj.videoUrl || obj.play || obj.nowm || obj.noWatermark || obj.no_watermark || obj.hdplay || obj.wmplay;
  if (Array.isArray(direct)) {
    const hit = direct.find(isUrl);
    if (hit) return hit;
  }
  if (isUrl(direct)) return direct;
  if (obj.download) {
    const d = obj.download;
    const candidates = [d.video, d.mp4, d.nowm, d.noWatermark, d.no_watermark, d.hd, d.hdplay, d.play];
    for (const c of candidates) {
      if (Array.isArray(c)) { const hit = c.find(isUrl); if (hit) return hit; }
      if (isUrl(c)) return c;
    }
  }
  if (obj.data) {
    const fromData = pickVideoUrl(obj.data);
    if (fromData) return fromData;
  }
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (typeof val === 'string' && /video|mp4|play|nowm|wm/i.test(key) && isUrl(val)) return val;
    if (Array.isArray(val)) {
      const hit = val.find(isUrl);
      if (hit && /video|mp4|play|nowm|wm|download/i.test(key)) return hit;
    }
    if (val && typeof val === 'object') {
      const found = pickVideoUrl(val);
      if (found) return found;
    }
  }
  return null;
}

function pickCoverUrl(obj) {
  if (!obj || typeof obj !== 'object') return null;
  const candidates = ['cover','thumbnail','thumb','image','avatar','origin_cover','dynamic_cover'];
  for (const key of candidates) if (isUrl(obj[key])) return obj[key];
  if (obj.data) {
    const fromData = pickCoverUrl(obj.data);
    if (fromData) return fromData;
  }
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (val && typeof val === 'object') {
      const found = pickCoverUrl(val);
      if (found) return found;
    }
  }
  return null;
}

function isUrl(value) { return typeof value === 'string' && /^https?:\/\//i.test(value); }
function cleanTitle(text) {
  return String(text || 'TikTok Sound').replace(/\s+/g, ' ').trim().slice(0, 90) || 'TikTok Sound';
}

async function extractArt(file) {
  try {
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    if (bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) return null;

    const ver = bytes[3];
    const flags = bytes[5];
    const tagSize = ((bytes[6]&0x7f)<<21)|((bytes[7]&0x7f)<<14)|((bytes[8]&0x7f)<<7)|(bytes[9]&0x7f);
    let i = 10;
    if (flags & 0x40) { const extSize=(bytes[10]<<24)|(bytes[11]<<16)|(bytes[12]<<8)|bytes[13]; i += extSize; }
    const end = Math.min(10 + tagSize, bytes.length);

    while (i < end - 10) {
      const fid = String.fromCharCode(bytes[i],bytes[i+1],bytes[i+2],bytes[i+3]);
      if (fid === '\x00\x00\x00\x00') break;
      let fsz;
      if (ver >= 4) fsz=((bytes[i+4]&0x7f)<<21)|((bytes[i+5]&0x7f)<<14)|((bytes[i+6]&0x7f)<<7)|(bytes[i+7]&0x7f);
      else fsz=(bytes[i+4]<<24)|(bytes[i+5]<<16)|(bytes[i+6]<<8)|bytes[i+7];
      if (fsz <= 0 || i + 10 + fsz > end) break;

      if (fid === 'APIC') {
        let j = i + 10;
        const enc = bytes[j]; j++;
        while (j < end && bytes[j] !== 0x00) j++; j++;
        j++;
        if (enc === 0x01 || enc === 0x02) { while (j < end-1 && !(bytes[j]===0 && bytes[j+1]===0)) j += 2; j += 2; }
        else { while (j < end && bytes[j] !== 0x00) j++; j++; }

        const imgData = bytes.slice(j, i + 10 + fsz);
        if (imgData.length < 10) { i += 10 + fsz; continue; }
        let actualMime = 'image/jpeg';
        if (imgData[0]===0x89 && imgData[1]===0x50) actualMime = 'image/png';
        else if (imgData[0]===0x47 && imgData[1]===0x49) actualMime = 'image/gif';
        const base64 = await new Promise(res => {
          const blob = new Blob([imgData], { type: actualMime });
          const reader = new FileReader();
          reader.onload = e => res(e.target.result);
          reader.onerror = () => res(null);
          reader.readAsDataURL(blob);
        });
        if (base64) return base64;
      }
      i += 10 + fsz;
    }
  } catch(e) { console.warn('extractArt error:', e); }
  return null;
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
}
function escapeAttr(str) { return escapeHtml(str); }
function closeModal() { $('modalPlaylist').classList.add('hidden'); }

function bindEvents() {
  $('backBtn')?.addEventListener('click', e => {
    e.preventDefault();
    savePlayState();

    const homeUrl = '../../aula/home.html';
    const isInsideFrame = window.parent && window.parent !== window;

    if (isInsideFrame) {
      window.parent.postMessage({ type: 'gamedex:music:close' }, '*');
      window.parent.postMessage('music:close', '*');
      return;
    }

    window.location.href = homeUrl;
  });
  $('btnMenu')?.addEventListener('click', () => {
    if ($('menuOverlay')?.classList.contains('hidden')) openMenu();
    else closeMenu();
  });
  $('btnCloseMenu')?.addEventListener('click', closeMenu);
  $('menuOverlay')?.addEventListener('click', e => { if (e.target === $('menuOverlay')) closeMenu(); });
  $('pageWhoopBtn')?.addEventListener('click', () => showPage('whoop'));
  $('pageTiktokBtn')?.addEventListener('click', () => showPage('tiktok'));
  $('pageDownloaderBtn')?.addEventListener('click', () => showPage('downloader'));
  $('btnModeWhoop')?.addEventListener('click', () => showPage('whoop'));
  $('btnModeTiktok')?.addEventListener('click', () => showPage('tiktok'));
  $('btnToggleDownloader')?.addEventListener('click', () => showPage('downloader'));
  $('btnCloseDownloader')?.addEventListener('click', closeDownloader);
  $('btnDownloadTikTok')?.addEventListener('click', downloadTikTokSound);
  $('btnDownloadMp3')?.addEventListener('click', () => downloadTikTokDirect('mp3'));
  $('btnDownloadMp4')?.addEventListener('click', () => downloadTikTokDirect('mp4'));
  $('tiktokUrl')?.addEventListener('keydown', e => { if (e.key === 'Enter') downloadTikTokDirect('mp3'); });
  $('btnShuffle')?.addEventListener('click', toggleShuffle);
  $('btnRepeat')?.addEventListener('click', toggleRepeat);
  $('btnPrev')?.addEventListener('click', prevMusic);
  $('btnNext')?.addEventListener('click', nextMusic);
  $('playPauseBtn')?.addEventListener('click', toggleCurrentMusic);
  $('progressBar')?.addEventListener('input', function(){ if (currentAudio?.duration) currentAudio.currentTime = (this.value/100) * currentAudio.duration; });
  $('searchInput')?.addEventListener('input', renderList);
  $('musicInput')?.addEventListener('change', function(){ handleUpload([...this.files]); this.value = ''; });
  $('btnNewPlaylist')?.addEventListener('click', () => { $('newPlaylistName').value = ''; $('modalPlaylist').classList.remove('hidden'); setTimeout(() => $('newPlaylistName').focus(), 100); });
  $('btnCancelPlaylist')?.addEventListener('click', closeModal);
  $('btnCreatePlaylist')?.addEventListener('click', createPlaylist);
  $('newPlaylistName')?.addEventListener('keydown', e => { if (e.key === 'Enter') createPlaylist(); });
  $('btnCloseAddPl')?.addEventListener('click', () => $('modalAddPl').classList.add('hidden'));
  ['modalPlaylist','modalAddPl'].forEach(id => $(id)?.addEventListener('click', function(e){ if (e.target === this) this.classList.add('hidden'); }));

  document.querySelectorAll('.menu-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      if (action === 'whoop') { showPage('whoop'); closeMenu(); }
      if (action === 'tiktok') { showPage('tiktok'); closeMenu(); }
      if (action === 'downloader') { showPage('downloader'); closeMenu(); }
      if (action === 'upload') { $('musicInput')?.click(); closeMenu(); }
      if (action === 'clearTiktok') { closeMenu(); clearTikTokSounds(); }
    });
  });

  window.addEventListener('pagehide', savePlayState);
  window.addEventListener('beforeunload', savePlayState);
}

bindEvents();
loadData();

window.createPlaylist = createPlaylist;
window.closeModal = closeModal;
window.toggleCurrentMusic = toggleCurrentMusic;
window.nextMusic = nextMusic;
window.prevMusic = prevMusic;
window.toggleShuffle = toggleShuffle;
window.toggleRepeat = toggleRepeat;
