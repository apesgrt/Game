'use strict';

const DB_NAME = 'WhoopMusicDB';
const DB_VER = 1;
const TIKTOK_API = 'https://api.siputzx.my.id/api/d/tiktok/v2';
let db = null;

function $(id){ return document.getElementById(id); }

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
let isShuffled = false;
let repeatMode = 'none';
let addTargetId = null;
let viewMode = localStorage.getItem('whoop:viewMode') || 'whoop';

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
  setViewMode(viewMode, false);
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
    playByGlobalIndex(pos.idx, pos.time, pos.paused);
  } catch {}
}

function setViewMode(mode, rerender = true) {
  viewMode = mode === 'tiktok' ? 'tiktok' : 'whoop';
  localStorage.setItem('whoop:viewMode', viewMode);
  document.body.classList.toggle('theme-tiktok', viewMode === 'tiktok');
  document.body.classList.toggle('theme-whoop', viewMode !== 'tiktok');
  $('btnModeWhoop')?.classList.toggle('active', viewMode === 'whoop');
  $('btnModeTiktok')?.classList.toggle('active', viewMode === 'tiktok');

  if (viewMode === 'tiktok') {
    $('appTitle').innerHTML = '<span class="title-icon">♪</span> TikTok Music';
    $('appSubtitle').textContent = 'Mode khusus sound TikTok hasil download dari Siputzx API.';
    $('modeEyebrow').textContent = 'TIKTOK SOUNDS';
    $('searchInput').placeholder = 'Cari sound TikTok...';
  } else {
    $('appTitle').innerHTML = '<span class="title-icon">🎵</span> Whoop Music';
    $('appSubtitle').textContent = 'Upload lagu lokal, buat playlist, dan musik tetap hidup di iframe.';
    $('modeEyebrow').textContent = 'LOCAL LIBRARY';
    $('searchInput').placeholder = 'Cari lagu...';
  }

  if (rerender) {
    renderPlaylistTabs();
    renderList();
  }
}

function openDownloader() {
  $('tiktokDownloader')?.classList.remove('hidden');
  setTimeout(() => $('tiktokUrl')?.focus(), 80);
}
function closeDownloader() { $('tiktokDownloader')?.classList.add('hidden'); }
function openMenu() { $('menuOverlay')?.classList.remove('hidden'); }
function closeMenu() { $('menuOverlay')?.classList.add('hidden'); }

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
    item.innerHTML = `<span>📁</span><span>${escapeHtml(pl.name)}</span>`;
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
  all.textContent = viewMode === 'tiktok' ? '♪ TikTok Sound' : '🎵 Semua';
  all.onclick = () => switchPlaylist('all');
  tabs.appendChild(all);

  playlists.forEach(pl => {
    const tab = document.createElement('div');
    tab.className = 'pl-tab' + (currentPl === pl.id ? ' active' : '');
    const del = document.createElement('button');
    del.className = 'pl-tab-del';
    del.textContent = '×';
    del.onclick = e => { e.stopPropagation(); deletePlaylist(pl.id); };
    tab.append(document.createTextNode(`📁 ${pl.name}`), del);
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
    list.innerHTML = `<div class="empty-state edge-card"><div class="icon">${isTik ? '♪' : '🎵'}</div>${isTik ? 'Belum ada sound TikTok.<br>Tekan <b>TikTok DL</b> untuk ambil sound.' : 'Belum ada musik lokal.<br>Tekan <b>+ Upload</b> untuk tambah lagu.'}</div>`;
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
    else artDiv.textContent = sourceTik ? '♪' : '🎵';

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
    const mkBtn = (cls, icon, fn, title = '') => {
      const b = document.createElement('button');
      b.className = `card-btn ${cls}`;
      b.textContent = icon;
      b.title = title;
      b.onclick = e => { e.stopPropagation(); fn(); };
      return b;
    };

    if (sourceTik && song.tiktokUrl) actions.append(mkBtn('card-btn-add', '↗', () => window.open(song.tiktokUrl, '_blank'), 'Buka TikTok'));
    actions.append(
      mkBtn('card-btn-add', '📁', () => openAddToPlaylist(song.id), 'Tambah ke playlist'),
      mkBtn('card-btn-play', isPlaying ? '⏸' : '▶', () => playByGlobalIndex(gIdx), 'Putar'),
      mkBtn('card-btn-del', '🗑', () => deleteSong(song.id), 'Hapus')
    );

    card.append(artDiv, info, dot, actions);
    card.onclick = () => playByGlobalIndex(gIdx);
    list.appendChild(card);
  });
}

function playByGlobalIndex(idx, startTime = 0, startPaused = false) {
  if (idx < 0 || idx >= allSongs.length) return;
  if (currentIndex === idx && currentAudio && startTime === 0) { toggleCurrentMusic(); return; }

  stopCurrent();
  currentIndex = idx;
  const song = allSongs[idx];
  currentAudio = new Audio(song.url);
  currentAudio.preload = 'metadata';
  currentAudio.currentTime = startTime || 0;
  if (!startPaused) currentAudio.play().catch(err => showStatus('Audio gagal diputar. Link mungkin expired / diblokir CORS.', 'err'));

  currentAudio.addEventListener('timeupdate', updateProgress);
  currentAudio.addEventListener('loadedmetadata', () => { $('timeTotal').textContent = fmtTime(currentAudio.duration); });
  currentAudio.addEventListener('ended', onEnded);
  currentAudio.addEventListener('play', () => { $('miniPlayer').classList.add('playing'); renderList(); });
  currentAudio.addEventListener('pause', () => { $('miniPlayer').classList.remove('playing'); renderList(); });

  updatePlayerUI(song, !startPaused);
  updateMediaSession(song);
  renderList();
}

function stopCurrent() {
  if (!currentAudio) return;
  currentAudio.pause();
  currentAudio.removeEventListener('timeupdate', updateProgress);
  currentAudio.removeEventListener('ended', onEnded);
  currentAudio = null;
  $('miniPlayer')?.classList.remove('playing');
}

function toggleCurrentMusic() {
  if (!currentAudio) return;
  if (currentAudio.paused) {
    currentAudio.play().catch(()=>{});
    $('playPauseBtn').textContent = '⏸';
    $('miniPlayer').classList.add('playing');
  } else {
    currentAudio.pause();
    $('playPauseBtn').textContent = '▶';
    $('miniPlayer').classList.remove('playing');
  }
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = currentAudio.paused ? 'paused' : 'playing';
  renderList();
}

function onEnded() {
  if (repeatMode === 'one') { currentAudio.currentTime = 0; currentAudio.play(); return; }
  nextMusic();
}

function nextMusic() {
  const songs = getSongs();
  if (!songs.length) return;
  if (isShuffled) {
    const idxs = songs.map(s => allSongs.findIndex(a => a.id === s.id));
    playByGlobalIndex(idxs[Math.floor(Math.random() * idxs.length)]);
  } else {
    const cur = songs.findIndex(s => s.id === allSongs[currentIndex]?.id);
    const next = (cur + 1) % songs.length;
    playByGlobalIndex(allSongs.findIndex(a => a.id === songs[next].id));
  }
}

function prevMusic() {
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
  const icons = ['🔁','🔁','🔂'];
  const titles = ['Repeat Off','Repeat All','Repeat One'];
  repeatMode = modes[(modes.indexOf(repeatMode) + 1) % 3];
  const btn = $('btnRepeat');
  btn.textContent = icons[modes.indexOf(repeatMode)];
  btn.classList.toggle('active', repeatMode !== 'none');
  btn.title = titles[modes.indexOf(repeatMode)];
}

function updateProgress() {
  if (!currentAudio) return;
  const pct = (currentAudio.currentTime / currentAudio.duration) * 100 || 0;
  $('progressBar').value = pct;
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
  $('playPauseBtn').textContent = playing ? '⏸' : '▶';
  const plName = playlists.find(p => p.id === song.playlistId)?.name || (isTikTokSong(song) ? 'TikTok Sound' : 'Semua Lagu');
  $('playerPlaylist').textContent = isTikTokSong(song) ? `TikTok Music • ${plName}` : plName;
  const artEl = $('playerArt');
  if (song.artUrl) artEl.innerHTML = `<img src="${escapeAttr(song.artUrl)}" alt="art">`;
  else artEl.textContent = isTikTokSong(song) ? '♪' : '🎵';
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
  navigator.mediaSession.playbackState = 'playing';
  navigator.mediaSession.setActionHandler('play', () => { currentAudio?.play(); $('playPauseBtn').textContent='⏸'; });
  navigator.mediaSession.setActionHandler('pause', () => { currentAudio?.pause(); $('playPauseBtn').textContent='▶'; });
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
  if (viewMode === 'tiktok') setViewMode('whoop');
  const list = $('musicList');
  const loading = document.createElement('div');
  loading.className = 'empty-state edge-card';
  loading.innerHTML = `<div class="icon">⏳</div>Mengupload ${files.length} lagu...`;
  list.prepend(loading);

  let loaded = 0;
  for (const file of files) {
    const reader = new FileReader();
    reader.onload = async e => {
      const artUrl = await extractArt(file);
      const clean = file.name.replace(/\.[^.]+$/, '').replace(/[_-]/g,' ');
      const song = {
        id: 'song_' + Date.now() + '_' + Math.random().toString(36).slice(2),
        name: clean,
        url: e.target.result,
        artUrl: artUrl || null,
        playlistId: currentPl !== 'all' ? currentPl : null,
        source: 'local',
      };
      allSongs.push(song);
      await saveSong(song);
      loaded++;
      if (loaded === files.length) { loading.remove(); renderList(); }
    };
    reader.readAsDataURL(file);
  }
}

async function downloadTikTokSound() {
  const input = $('tiktokUrl');
  const tiktokUrl = input.value.trim();
  if (!tiktokUrl) return showStatus('Masukkan link TikTok dulu.', 'err');
  if (!/^https?:\/\//i.test(tiktokUrl) || !/tiktok\.com|vt\.tiktok\.com|vm\.tiktok\.com/i.test(tiktokUrl)) {
    return showStatus('Link TikTok-nya belum valid.', 'err');
  }

  showStatus('Mengambil data dari Siputzx TikTok V2...', '');
  $('btnDownloadTikTok').disabled = true;
  $('btnDownloadTikTok').textContent = 'Loading...';

  try {
    const apiUrl = `${TIKTOK_API}?url=${encodeURIComponent(tiktokUrl)}`;
    const response = await fetch(apiUrl, { method:'GET', cache:'no-store' });
    const json = await response.json();
    if (!response.ok || json.status === false) throw new Error(json.error || `HTTP ${response.status}`);

    const data = json.data || json.result || json;
    const audioUrl = pickAudioUrl(data) || pickAudioUrl(json);
    if (!audioUrl) throw new Error('Audio/sound tidak ditemukan di response API.');

    const meta = data.metadata || data.meta || {};
    const download = data.download || {};
    const title = cleanTitle(meta.title || meta.description || data.title || data.description || 'TikTok Sound');
    const cover = pickCoverUrl(data) || pickCoverUrl(json) || null;
    const song = {
      id: 'tt_' + Date.now() + '_' + Math.random().toString(36).slice(2),
      name: title,
      url: audioUrl,
      artUrl: cover,
      playlistId: null,
      source: 'tiktok',
      tiktokUrl,
      videoUrl: Array.isArray(download.video) ? download.video[0] : (download.video || null),
      meta: {
        downloadedAt: new Date().toISOString(),
        stats: meta.stats || null,
        hashtags: meta.hashtags || [],
      }
    };

    allSongs.unshift(song);
    await saveSong(song);
    input.value = '';
    setViewMode('tiktok');
    closeMenu();
    showStatus('Berhasil! Sound masuk ke TikTok Music.', 'ok');
    renderList();
    playByGlobalIndex(allSongs.findIndex(s => s.id === song.id));
  } catch (err) {
    console.error(err);
    showStatus('Gagal mengambil sound. Cek link/API/CORS: ' + (err.message || err), 'err');
  } finally {
    $('btnDownloadTikTok').disabled = false;
    $('btnDownloadTikTok').textContent = 'Ambil Sound';
  }
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
  const direct = obj.audio || obj.music || obj.mp3 || obj.sound || obj.audioUrl || obj.musicUrl;
  if (isUrl(direct)) return direct;
  if (obj.download && isUrl(obj.download.audio)) return obj.download.audio;
  if (obj.download && isUrl(obj.download.music)) return obj.download.music;
  if (obj.data) {
    const fromData = pickAudioUrl(obj.data);
    if (fromData) return fromData;
  }
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (typeof val === 'string' && /audio|music|mp3|sound/i.test(key) && isUrl(val)) return val;
    if (val && typeof val === 'object') {
      const found = pickAudioUrl(val);
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
  $('backBtn')?.addEventListener('click', e => { e.preventDefault(); savePlayState(); window.parent.postMessage('music:close', '*'); });
  $('btnMenu')?.addEventListener('click', openMenu);
  $('btnCloseMenu')?.addEventListener('click', closeMenu);
  $('menuOverlay')?.addEventListener('click', e => { if (e.target === $('menuOverlay')) closeMenu(); });
  $('btnModeWhoop')?.addEventListener('click', () => setViewMode('whoop'));
  $('btnModeTiktok')?.addEventListener('click', () => { setViewMode('tiktok'); openDownloader(); });
  $('btnToggleDownloader')?.addEventListener('click', () => { openDownloader(); setViewMode('tiktok'); });
  $('btnCloseDownloader')?.addEventListener('click', closeDownloader);
  $('btnDownloadTikTok')?.addEventListener('click', downloadTikTokSound);
  $('tiktokUrl')?.addEventListener('keydown', e => { if (e.key === 'Enter') downloadTikTokSound(); });
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
      if (action === 'whoop') { setViewMode('whoop'); closeMenu(); }
      if (action === 'tiktok') { setViewMode('tiktok'); openDownloader(); closeMenu(); }
      if (action === 'downloader') { setViewMode('tiktok'); openDownloader(); closeMenu(); }
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
