'use strict';

// ── IndexedDB (lebih besar dari localStorage, cocok untuk audio base64) ────────
const DB_NAME = 'WhoopMusicDB', DB_VER = 1;
let db = null;

function openDB() {
  return new Promise((res, rej) => {
    if (db) { res(db); return; }
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = e => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains('songs'))     d.createObjectStore('songs',     { keyPath:'id' });
      if (!d.objectStoreNames.contains('playlists')) d.createObjectStore('playlists', { keyPath:'id' });
      if (!d.objectStoreNames.contains('state'))     d.createObjectStore('state',     { keyPath:'key' });
    };
    req.onsuccess  = e => { db = e.target.result; res(db); };
    req.onerror    = e => rej(e);
  });
}

function dbGet(store, key) {
  return openDB().then(d => new Promise((res, rej) => {
    const req = d.transaction(store,'readonly').objectStore(store).get(key);
    req.onsuccess = () => res(req.result);
    req.onerror   = e => rej(e);
  }));
}

function dbGetAll(store) {
  return openDB().then(d => new Promise((res, rej) => {
    const req = d.transaction(store,'readonly').objectStore(store).getAll();
    req.onsuccess = () => res(req.result);
    req.onerror   = e => rej(e);
  }));
}

function dbPut(store, value) {
  return openDB().then(d => new Promise((res, rej) => {
    const req = d.transaction(store,'readwrite').objectStore(store).put(value);
    req.onsuccess = () => res();
    req.onerror   = e => rej(e);
  }));
}

function dbDelete(store, key) {
  return openDB().then(d => new Promise((res, rej) => {
    const req = d.transaction(store,'readwrite').objectStore(store).delete(key);
    req.onsuccess = () => res();
    req.onerror   = e => rej(e);
  }));
}

// ── State ─────────────────────────────────────────────────────────────────────
let allSongs     = [];
let playlists    = [];
let currentPl    = 'all';
let currentIndex = null;
let currentAudio = null;
let isShuffled   = false;
let repeatMode   = 'none';
let addTargetId  = null;

// ── Load data ─────────────────────────────────────────────────────────────────
async function loadData() {
  try {
    allSongs  = await dbGetAll('songs');
    playlists = await dbGetAll('playlists');
    // urutkan playlist by created order
    playlists.sort((a,b) => (a.order||0) - (b.order||0));
  } catch(e) {
    console.warn('IndexedDB load error:', e);
    allSongs = []; playlists = [];
  }
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

async function saveAllPlaylists() {
  for (const pl of playlists) await savePlaylist(pl);
}

// ── Play state persistence ────────────────────────────────────────────────────
function savePlayState() {
  if (currentIndex === null) return;
  const pos = {
    key: 'playstate',
    idx:  currentIndex,
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

// ── Back button — simpan state dulu ──────────────────────────────────────────
document.getElementById('backBtn').addEventListener('click', function(e) {
  e.preventDefault();
  savePlayState();
  // Kirim pesan ke parent (home.html) untuk tutup music bar
  window.parent.postMessage('music:close', '*');
});

window.addEventListener('pagehide',     savePlayState);
window.addEventListener('beforeunload', savePlayState);

// ── Playlist ──────────────────────────────────────────────────────────────────
async function createPlaylist() {
  const name = document.getElementById('newPlaylistName').value.trim();
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
  // songs in this playlist → back to "all"
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
  const list = document.getElementById('addPlList');
  list.innerHTML = '';
  if (!playlists.length) {
    list.innerHTML = '<div style="color:#888;font-size:13px;padding:8px">Belum ada playlist. Buat dulu!</div>';
  }
  playlists.forEach(pl => {
    const item = document.createElement('div');
    item.className = 'add-pl-item';
    item.innerHTML = `<span>📁</span><span>${pl.name}</span>`;
    item.onclick = async () => {
      const s = allSongs.find(s => s.id === addTargetId);
      if (s) { s.playlistId = pl.id; await saveSong(s); }
      document.getElementById('modalAddPl').classList.add('hidden');
      renderList();
    };
    list.appendChild(item);
  });
  document.getElementById('modalAddPl').classList.remove('hidden');
}

// ── Song list ─────────────────────────────────────────────────────────────────
function getSongs() {
  const q = (document.getElementById('searchInput')?.value || '').toLowerCase();
  let list = currentPl === 'all' ? allSongs : allSongs.filter(s => s.playlistId === currentPl);
  if (q) list = list.filter(s => s.name.toLowerCase().includes(q));
  return list;
}

// ── Render tabs ───────────────────────────────────────────────────────────────
function renderPlaylistTabs() {
  const tabs = document.getElementById('playlistTabs');
  tabs.innerHTML = '';

  const all = document.createElement('div');
  all.className = 'pl-tab' + (currentPl==='all'?' active':'');
  all.textContent = '🎵 Semua';
  all.onclick = () => switchPlaylist('all');
  tabs.appendChild(all);

  playlists.forEach(pl => {
    const tab = document.createElement('div');
    tab.className = 'pl-tab' + (currentPl===pl.id?' active':'');
    const del = document.createElement('button');
    del.className = 'pl-tab-del'; del.textContent = '×';
    del.onclick = e => { e.stopPropagation(); deletePlaylist(pl.id); };
    tab.append(document.createTextNode(`📁 ${pl.name}`), del);
    tab.onclick = () => switchPlaylist(pl.id);
    tabs.appendChild(tab);
  });
}

// ── Render list ───────────────────────────────────────────────────────────────
function renderList() {
  const list  = document.getElementById('musicList');
  const songs = getSongs();
  list.innerHTML = '';

  if (!songs.length) {
    list.innerHTML = `<div class="empty-state"><div class="icon">${currentPl==='all'?'🎵':'📁'}</div>${currentPl==='all'?'Belum ada musik.<br>Tekan <b>+ Upload</b> untuk tambah lagu.':'Playlist kosong.<br>Tambah lagu dari tab <b>Semua</b>.'}</div>`;
    return;
  }

  songs.forEach(song => {
    const gIdx     = allSongs.findIndex(s => s.id === song.id);
    const isPlaying = currentIndex === gIdx && currentAudio && !currentAudio.paused;

    const card = document.createElement('div');
    card.className = 'music-card' + (isPlaying?' playing':'');

    const artDiv = song.artUrl
      ? Object.assign(document.createElement('div'), { className:'card-art', innerHTML:`<img src="${song.artUrl}" alt="art">` })
      : Object.assign(document.createElement('div'), { className:'card-art-default', textContent:'🎵' });

    const info = document.createElement('div');
    info.className = 'card-info';
    const plName = playlists.find(p => p.id === song.playlistId)?.name || 'Semua Lagu';
    info.innerHTML = `<div class="card-title">${song.name}</div><div class="card-sub">${plName}</div>`;

    const dot = document.createElement('div');
    if (isPlaying) dot.className = 'card-playing-dot';

    const actions = document.createElement('div');
    actions.className = 'card-actions';

    const mkBtn = (cls, icon, fn) => {
      const b = document.createElement('button');
      b.className = `card-btn ${cls}`; b.textContent = icon;
      b.onclick = e => { e.stopPropagation(); fn(); };
      return b;
    };

    actions.append(
      mkBtn('card-btn-add',  '📁',                   () => openAddToPlaylist(song.id)),
      mkBtn('card-btn-play', isPlaying ? '⏸' : '▶',  () => playByGlobalIndex(gIdx)),
      mkBtn('card-btn-del',  '🗑',                    () => deleteSong(song.id)),
    );

    card.append(artDiv, info, dot, actions);
    card.onclick = () => playByGlobalIndex(gIdx);
    list.appendChild(card);
  });
}

// ── Playback ──────────────────────────────────────────────────────────────────
function playByGlobalIndex(idx, startTime = 0, startPaused = false) {
  if (idx < 0 || idx >= allSongs.length) return;

  if (currentIndex === idx && currentAudio && startTime === 0) {
    toggleCurrentMusic(); return;
  }

  stopCurrent();
  currentIndex = idx;
  const song = allSongs[idx];

  currentAudio = new Audio(song.url);
  currentAudio.currentTime = startTime;
  if (!startPaused) currentAudio.play().catch(()=>{});

  currentAudio.addEventListener('timeupdate',     updateProgress);
  currentAudio.addEventListener('loadedmetadata', () => {
    document.getElementById('timeTotal').textContent = fmtTime(currentAudio.duration);
  });
  currentAudio.addEventListener('ended', onEnded);

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
}

function toggleCurrentMusic() {
  if (!currentAudio) return;
  if (currentAudio.paused) {
    currentAudio.play();
    document.getElementById('playPauseBtn').textContent = '⏸';
  } else {
    currentAudio.pause();
    document.getElementById('playPauseBtn').textContent = '▶';
  }
  if ('mediaSession' in navigator)
    navigator.mediaSession.playbackState = currentAudio.paused ? 'paused' : 'playing';
}

function onEnded() {
  if (repeatMode === 'one') { currentAudio.currentTime = 0; currentAudio.play(); return; }
  nextMusic();
}

function nextMusic() {
  const songs = getSongs(); if (!songs.length) return;
  if (isShuffled) {
    const idxs = songs.map(s => allSongs.findIndex(a => a.id === s.id));
    playByGlobalIndex(idxs[Math.floor(Math.random() * idxs.length)]);
  } else {
    const cur  = songs.findIndex(s => s.id === allSongs[currentIndex]?.id);
    const next = (cur + 1) % songs.length;
    playByGlobalIndex(allSongs.findIndex(a => a.id === songs[next].id));
  }
}

function prevMusic() {
  if (currentAudio && currentAudio.currentTime > 3) { currentAudio.currentTime = 0; return; }
  const songs = getSongs(); if (!songs.length) return;
  const cur  = songs.findIndex(s => s.id === allSongs[currentIndex]?.id);
  const prev = (cur - 1 + songs.length) % songs.length;
  playByGlobalIndex(allSongs.findIndex(a => a.id === songs[prev].id));
}

// ── Shuffle / Repeat ──────────────────────────────────────────────────────────
function toggleShuffle() {
  isShuffled = !isShuffled;
  document.getElementById('btnShuffle').classList.toggle('active', isShuffled);
}

function toggleRepeat() {
  const modes  = ['none','all','one'];
  const icons  = ['🔁','🔁','🔂'];
  const titles = ['Repeat Off','Repeat All','Repeat One'];
  repeatMode = modes[(modes.indexOf(repeatMode) + 1) % 3];
  const btn = document.getElementById('btnRepeat');
  btn.textContent = icons[modes.indexOf(repeatMode)];
  btn.classList.toggle('active', repeatMode !== 'none');
  btn.title = titles[modes.indexOf(repeatMode)];
}

// ── Progress ──────────────────────────────────────────────────────────────────
function updateProgress() {
  if (!currentAudio) return;
  const pct = (currentAudio.currentTime / currentAudio.duration) * 100 || 0;
  document.getElementById('progressBar').value = pct;
  document.getElementById('timeNow').textContent = fmtTime(currentAudio.currentTime);
  if ('mediaSession' in navigator && navigator.mediaSession.setPositionState && currentAudio.duration) {
    try { navigator.mediaSession.setPositionState({ duration: currentAudio.duration, playbackRate:1, position: currentAudio.currentTime }); } catch {}
  }
}

function fmtTime(s) {
  if (!isFinite(s)) return '0:00';
  return `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`;
}

document.getElementById('progressBar')?.addEventListener('input', function() {
  if (currentAudio?.duration) currentAudio.currentTime = (this.value/100) * currentAudio.duration;
});

// ── Player UI ─────────────────────────────────────────────────────────────────
function updatePlayerUI(song, playing = true) {
  document.getElementById('nowPlaying').textContent   = song.name;
  document.getElementById('playPauseBtn').textContent = playing ? '⏸' : '▶';
  const plName = playlists.find(p => p.id === song.playlistId)?.name || 'Semua Lagu';
  document.getElementById('playerPlaylist').textContent = plName;
  const artEl = document.getElementById('playerArt');
  if (song.artUrl) artEl.innerHTML = `<img src="${song.artUrl}" alt="art">`;
  else artEl.textContent = '🎵';
}

// ── Media Session ─────────────────────────────────────────────────────────────
function updateMediaSession(song) {
  if (!('mediaSession' in navigator)) return;
  const artwork = song.artUrl ? [{ src: song.artUrl, sizes:'512x512', type:'image/jpeg' }] : [];
  navigator.mediaSession.metadata = new MediaMetadata({
    title:  song.name,
    artist: 'Whoop Music',
    album:  playlists.find(p => p.id === song.playlistId)?.name || 'Semua Lagu',
    artwork,
  });
  navigator.mediaSession.playbackState = 'playing';
  navigator.mediaSession.setActionHandler('play',          () => { currentAudio?.play(); document.getElementById('playPauseBtn').textContent='⏸'; navigator.mediaSession.playbackState='playing'; });
  navigator.mediaSession.setActionHandler('pause',         () => { currentAudio?.pause(); document.getElementById('playPauseBtn').textContent='▶'; navigator.mediaSession.playbackState='paused'; });
  navigator.mediaSession.setActionHandler('nexttrack',     () => nextMusic());
  navigator.mediaSession.setActionHandler('previoustrack', () => prevMusic());
  navigator.mediaSession.setActionHandler('seekto',        d  => { if (currentAudio) currentAudio.currentTime = d.seekTime; });
}

// ── Delete ────────────────────────────────────────────────────────────────────
async function deleteSong(id) {
  const idx = allSongs.findIndex(s => s.id === id);
  if (idx === -1) return;
  if (currentIndex === idx) { stopCurrent(); currentIndex = null; }
  else if (currentIndex !== null && currentIndex > idx) currentIndex--;
  allSongs.splice(idx, 1);
  await dbDelete('songs', id);
  renderList();
}

// ── Upload ────────────────────────────────────────────────────────────────────
document.getElementById('musicInput').addEventListener('change', function() {
  const files = [...this.files];
  if (!files.length) return;

  // Tampilkan loading
  const list = document.getElementById('musicList');
  const loading = document.createElement('div');
  loading.className = 'empty-state';
  loading.innerHTML = `<div class="icon">⏳</div>Mengupload ${files.length} lagu...`;
  list.prepend(loading);

  let loaded = 0;
  files.forEach(file => {
    const reader = new FileReader();
    reader.onload = async e => {
      const artUrl = await extractArt(file);
      const clean  = file.name.replace(/\.[^.]+$/, '').replace(/[_-]/g,' ');
      const song = {
        id: 'song_' + Date.now() + '_' + Math.random().toString(36).slice(2),
        name: clean,
        url:  e.target.result,
        artUrl: artUrl || null,
        playlistId: currentPl !== 'all' ? currentPl : null,
      };
      allSongs.push(song);
      await saveSong(song);
      loaded++;
      if (loaded === files.length) {
        loading.remove();
        renderList();
      }
    };
    reader.readAsDataURL(file);
  });
  this.value = '';
});

// Extract album art dari ID3 — robust parser
async function extractArt(file) {
  try {
    const buf   = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    if (bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) return null;

    const ver    = bytes[3];
    const flags  = bytes[5];
    const tagSize = ((bytes[6]&0x7f)<<21)|((bytes[7]&0x7f)<<14)|((bytes[8]&0x7f)<<7)|(bytes[9]&0x7f);
    let i = 10;
    if (flags & 0x40) { const extSize=(bytes[10]<<24)|(bytes[11]<<16)|(bytes[12]<<8)|bytes[13]; i+=extSize; }
    const end = Math.min(10 + tagSize, bytes.length);

    while (i < end - 10) {
      const fid = String.fromCharCode(bytes[i],bytes[i+1],bytes[i+2],bytes[i+3]);
      if (fid === '\x00\x00\x00\x00') break;
      let fsz;
      if (ver >= 4) { fsz=((bytes[i+4]&0x7f)<<21)|((bytes[i+5]&0x7f)<<14)|((bytes[i+6]&0x7f)<<7)|(bytes[i+7]&0x7f); }
      else { fsz=(bytes[i+4]<<24)|(bytes[i+5]<<16)|(bytes[i+6]<<8)|bytes[i+7]; }
      if (fsz<=0||i+10+fsz>end) break;

      if (fid === 'APIC') {
        let j = i + 10;
        const enc = bytes[j]; j++;
        // Skip MIME string
        while (j < end && bytes[j] !== 0x00) j++; j++;
        // Skip picture type
        j++;
        // Skip description (encoding-aware)
        if (enc===0x01||enc===0x02) { while(j<end-1&&!(bytes[j]===0&&bytes[j+1]===0))j+=2; j+=2; }
        else { while(j<end&&bytes[j]!==0x00)j++; j++; }

        const imgData = bytes.slice(j, i + 10 + fsz);
        if (imgData.length < 10) { i+=10+fsz; continue; }

        // Detect MIME from magic bytes
        let actualMime = 'image/jpeg';
        if (imgData[0]===0x89&&imgData[1]===0x50) actualMime='image/png';
        else if (imgData[0]===0x47&&imgData[1]===0x49) actualMime='image/gif';

        // Convert to base64 (permanent, works on Vercel & after refresh)
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

// ── Search ────────────────────────────────────────────────────────────────────
document.getElementById('searchInput')?.addEventListener('input', renderList);

// ── Modal ─────────────────────────────────────────────────────────────────────
document.getElementById('btnNewPlaylist').onclick = () => {
  document.getElementById('newPlaylistName').value = '';
  document.getElementById('modalPlaylist').classList.remove('hidden');
  setTimeout(() => document.getElementById('newPlaylistName').focus(), 100);
};
document.getElementById('newPlaylistName')?.addEventListener('keydown', e => { if (e.key==='Enter') createPlaylist(); });
function closeModal() { document.getElementById('modalPlaylist').classList.add('hidden'); }
['modalPlaylist','modalAddPl'].forEach(id =>
  document.getElementById(id)?.addEventListener('click', function(e) {
    if (e.target === this) this.classList.add('hidden');
  })
);

// ── Init ──────────────────────────────────────────────────────────────────────
loadData();
