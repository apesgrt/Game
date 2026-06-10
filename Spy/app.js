import { firebaseConfig } from "./firebase-config.js";

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getDatabase,
  ref,
  set,
  update,
  get,
  child,
  onValue,
  remove,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

/* =========================
   KUMPULAN KATA
   Tambah sendiri boleh.
========================= */
const WORD_PAIRS = [
  { category: "Hewan", normal: "Kucing", spy: "Harimau" },
  { category: "Hewan", normal: "Ayam", spy: "Bebek" },
  { category: "Buah", normal: "Apel", spy: "Jeruk" },
  { category: "Buah", normal: "Semangka", spy: "Melon" },
  { category: "Makanan", normal: "Bakso", spy: "Mie Ayam" },
  { category: "Makanan", normal: "Nasi Goreng", spy: "Mie Goreng" },
  { category: "Minuman", normal: "Es Teh", spy: "Es Jeruk" },
  { category: "Tempat", normal: "Sekolah", spy: "Kampus" },
  { category: "Tempat", normal: "Pantai", spy: "Kolam Renang" },
  { category: "Benda", normal: "Laptop", spy: "Komputer" },
  { category: "Benda", normal: "Motor", spy: "Mobil" },
  { category: "Game", normal: "Minecraft", spy: "Roblox" },
  { category: "Game", normal: "Free Fire", spy: "PUBG" },
  { category: "Aplikasi", normal: "YouTube", spy: "TikTok" },
  { category: "Olahraga", normal: "Sepak Bola", spy: "Futsal" },
  { category: "Sekolah", normal: "Buku", spy: "Novel" },
  { category: "Teknologi", normal: "Keyboard", spy: "Mouse" },
  { category: "Kendaraan", normal: "Kereta", spy: "Bus" },
  { category: "Alam", normal: "Gunung", spy: "Bukit" },
  { category: "Ruang", normal: "Dapur", spy: "Restoran" },
  { category: "Hiburan", normal: "Bioskop", spy: "Teater" },
  { category: "Musik", normal: "Gitar", spy: "Bass" },
  { category: "Cuaca", normal: "Hujan", spy: "Gerimis" },
  { category: "Profesi", normal: "Dokter", spy: "Perawat" }
];

/* =========================
   ELEMENT
========================= */
const namePage = document.getElementById("namePage");
const menuPage = document.getElementById("menuPage");
const roomPage = document.getElementById("roomPage");

const nameInput = document.getElementById("nameInput");
const saveNameBtn = document.getElementById("saveNameBtn");
const changeNameBtn = document.getElementById("changeNameBtn");
const playerNameText = document.getElementById("playerNameText");

const createRoomBtn = document.getElementById("createRoomBtn");
const joinRoomBtn = document.getElementById("joinRoomBtn");
const roomCodeInput = document.getElementById("roomCodeInput");

const roomCodeText = document.getElementById("roomCodeText");
const roomStatusText = document.getElementById("roomStatusText");
const playersList = document.getElementById("playersList");
const gameArea = document.getElementById("gameArea");

const copyCodeBtn = document.getElementById("copyCodeBtn");
const leaveRoomBtn = document.getElementById("leaveRoomBtn");
const toast = document.getElementById("toast");

/* =========================
   STATE
========================= */
let playerId = localStorage.getItem("spy_player_id");
let playerName = localStorage.getItem("spy_player_name") || "Guest";
let currentRoomCode = null;
let currentRoomUnsubscribe = null;
let latestRoom = null;
let resolvingVote = false;

function syncPlayerFromHomeMenu() {
  try {
    const auth = JSON.parse(localStorage.getItem("gameArchiveAuthProfile_v1") || "{}");
    const profile = JSON.parse(localStorage.getItem("gameArchiveProfile_v3") || "{}");
    if (auth && auth.uid) {
      playerId = "uid_" + auth.uid;
      localStorage.setItem("spy_player_id", playerId);
    }
    const syncedName = auth.name || profile.name || localStorage.getItem("spy_player_name") || playerName || "Guest";
    playerName = cleanName(syncedName);
    localStorage.setItem("spy_player_name", playerName);
  } catch (e) {
    console.warn("Gagal sync profil menu", e);
  }
}

syncPlayerFromHomeMenu();

if (!playerId) {
  playerId = "p_" + makeId();
  localStorage.setItem("spy_player_id", playerId);
}

/* =========================
   UTIL
========================= */
function makeId() {
  if (crypto && crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function showPage(page) {
  namePage.classList.add("hidden");
  menuPage.classList.add("hidden");
  roomPage.classList.add("hidden");
  page.classList.remove("hidden");
}

function cleanName(name) {
  const finalName = String(name || "").trim();
  return finalName.length > 0 ? finalName : "Guest";
}

function updateNameUI() {
  playerNameText.textContent = playerName;
}

function toastMsg(message) {
  toast.textContent = message;
  toast.classList.remove("hidden");
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.add("hidden"), 1800);
}

function escapeHTML(text) {
  return String(text ?? "").replace(/[&<>"']/g, (char) => {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[char];
  });
}

function normalizeWord(text) {
  return String(text || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function generateRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 5; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

async function generateUniqueRoomCode() {
  let code;
  let exists = true;

  while (exists) {
    code = generateRoomCode();
    const snap = await get(child(ref(db), `rooms/${code}`));
    exists = snap.exists();
  }

  return code;
}

function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function randomItem(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function getPlayersArray(room) {
  return Object.values(room?.players || {})
    .filter(Boolean)
    .filter(p => p.id)
    .sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0));
}

function getTurnOrder(room) {
  const raw = room?.turnOrder || [];
  const ids = Array.isArray(raw) ? raw : Object.values(raw);
  return ids.filter(id => room?.players?.[id]);
}

function getPlayerName(room, id) {
  return room?.players?.[id]?.name || "Unknown";
}

function isHost(room) {
  return room?.hostId === playerId;
}

/* =========================
   ROOM FLOW
========================= */
async function createRoom() {
  try {
    createRoomBtn.disabled = true;
    createRoomBtn.textContent = "Membuat room...";

    const code = await generateUniqueRoomCode();

    const roomData = {
      code,
      hostId: playerId,
      status: "waiting",
      createdAt: serverTimestamp(),
      players: {
        [playerId]: {
          id: playerId,
          name: playerName,
          isHost: true,
          joinedAt: serverTimestamp()
        }
      }
    };

    await set(ref(db, `rooms/${code}`), roomData);
    enterRoom(code);
  } catch (err) {
    alert("Gagal membuat room: " + err.message);
  } finally {
    createRoomBtn.disabled = false;
    createRoomBtn.textContent = "Buat Room";
  }
}

async function joinRoom() {
  const code = roomCodeInput.value.trim().toUpperCase();

  if (!code) {
    alert("Masukkan kode room dulu.");
    return;
  }

  try {
    joinRoomBtn.disabled = true;
    joinRoomBtn.textContent = "Masuk...";

    const roomSnap = await get(child(ref(db), `rooms/${code}`));

    if (!roomSnap.exists()) {
      alert("Room tidak ditemukan.");
      return;
    }

    const room = roomSnap.val();

    if (room.status !== "waiting") {
      alert("Game sudah dimulai, tidak bisa masuk.");
      return;
    }

    const players = getPlayersArray(room);
    if (players.length >= 10 && !room.players?.[playerId]) {
      alert("Room penuh. Maksimal 10 player.");
      return;
    }

    await update(ref(db, `rooms/${code}/players/${playerId}`), {
      id: playerId,
      name: playerName,
      isHost: false,
      joinedAt: serverTimestamp()
    });

    enterRoom(code);
  } catch (err) {
    alert("Gagal masuk room: " + err.message);
  } finally {
    joinRoomBtn.disabled = false;
    joinRoomBtn.textContent = "Gabung Room";
  }
}

function enterRoom(code) {
  currentRoomCode = code;
  roomCodeText.textContent = code;
  resolvingVote = false;
  showPage(roomPage);
  listenRoom(code);
}

function listenRoom(code) {
  if (currentRoomUnsubscribe) {
    currentRoomUnsubscribe();
  }

  const roomRef = ref(db, `rooms/${code}`);

  currentRoomUnsubscribe = onValue(roomRef, (snapshot) => {
    if (!snapshot.exists()) {
      alert("Room sudah dihapus host.");
      goMenu();
      return;
    }

    latestRoom = snapshot.val();
    renderRoom(latestRoom);

    if (latestRoom.status === "voting" && isHost(latestRoom)) {
      maybeResolveVoting(latestRoom);
    }
  });
}

function renderRoom(room) {
  const players = getPlayersArray(room);

  roomCodeText.textContent = room.code || currentRoomCode || "-----";
  roomStatusText.textContent = statusLabel(room.status);

  playersList.innerHTML = players.map(player => {
    const badges = [];

    if (player.id === playerId) {
      badges.push(`<span class="badge me">Kamu</span>`);
    }

    if (player.isHost) {
      badges.push(`<span class="badge">HOST</span>`);
    }

    return `
      <div class="player">
        <span class="player-name">${escapeHTML(player.name)}</span>
        <span class="badges">${badges.join("")}</span>
      </div>
    `;
  }).join("");

  renderGameArea(room);
}

function statusLabel(status) {
  return {
    waiting: "Menunggu Player",
    playing: "Giliran Deskripsi",
    voting: "Voting",
    resolving: "Menghitung Voting",
    spy_guess: "Spy Menebak",
    finished: "Selesai"
  }[status] || status || "waiting";
}

function renderGameArea(room) {
  if (room.status === "waiting") return renderWaiting(room);
  if (room.status === "playing") return renderPlaying(room);
  if (room.status === "voting") return renderVoting(room);
  if (room.status === "resolving") return renderResolving();
  if (room.status === "spy_guess") return renderSpyGuess(room);
  if (room.status === "finished") return renderFinished(room);

  gameArea.innerHTML = "";
}

function renderWaiting(room) {
  const players = getPlayersArray(room);
  const host = isHost(room);

  gameArea.innerHTML = `
    <div class="panel">
      <h3>Lobby</h3>
      <p class="sub">
        Minimal 3 player. Sistem akan otomatis menentukan kata, spy, dan urutan giliran.
      </p>

      <div class="kv">
        <div>
          <span>Jumlah Player</span>
          <strong>${players.length}/10</strong>
        </div>
        <div>
          <span>Minimal</span>
          <strong>3 Player</strong>
        </div>
      </div>

      ${
        host
          ? `<button id="startGameBtn" ${players.length < 3 ? "disabled" : ""}>Mulai Otomatis</button>`
          : `<button class="ghost" disabled>Menunggu host mulai...</button>`
      }
    </div>
  `;
}

function renderPlaying(room) {
  const own = room.players?.[playerId];
  const turnOrder = getTurnOrder(room);
  const currentTurnIndex = Number(room.currentTurn || 0);
  const currentId = turnOrder[currentTurnIndex];
  const currentName = getPlayerName(room, currentId);
  const clues = room.clues || {};
  const clueList = Object.values(clues)
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  if (!own) {
    gameArea.innerHTML = `<div class="panel"><p>Kamu tidak ada di room ini.</p></div>`;
    return;
  }

  const isMyTurn = currentId === playerId;

  gameArea.innerHTML = `
    <div class="word-card">
      <p class="label">Kategori: ${escapeHTML(room.category || "-")}</p>
      <p class="sub">Kata kamu adalah</p>
      <div class="word">${escapeHTML(own.word || "???")}</div>
    </div>

    <div class="panel">
      <p>Giliran sekarang:</p>
      <h2 class="turn">${escapeHTML(currentName)}</h2>
      <p class="sub">
        Kasih deskripsi singkat. Jangan terlalu jelas, nanti kata kamu ketebak spy.
      </p>

      ${
        isMyTurn
          ? `
            <textarea id="clueInput" maxlength="80" placeholder="Contoh: biasanya ada di rumah..."></textarea>
            <button id="submitClueBtn">Kirim Deskripsi</button>
          `
          : `<button class="ghost" disabled>Menunggu ${escapeHTML(currentName)}...</button>`
      }
    </div>

    <div class="panel">
      <h3>Deskripsi Player</h3>
      <div class="clue-list">
        ${
          clueList.length
            ? clueList.map(c => `
              <div class="clue">
                <strong>${escapeHTML(c.name)}</strong>
                ${escapeHTML(c.text)}
              </div>
            `).join("")
            : `<p class="sub">Belum ada deskripsi.</p>`
        }
      </div>
    </div>
  `;
}

function renderVoting(room) {
  const players = getPlayersArray(room);
  const votes = room.votes || {};
  const ownVote = votes[playerId];

  gameArea.innerHTML = `
    <div class="panel">
      <h2>Voting</h2>
      <p class="sub">Pilih siapa yang paling mencurigakan sebagai spy.</p>

      ${
        ownVote
          ? `
            <div class="panel good">
              Kamu sudah vote: <strong>${escapeHTML(getPlayerName(room, ownVote))}</strong>
            </div>
            <button class="ghost" disabled>Menunggu player lain...</button>
          `
          : `
            <div id="voteOptions">
              ${players
                .filter(p => p.id !== playerId)
                .map(p => `
                  <label class="vote-option">
                    <input type="radio" name="voteTarget" value="${escapeHTML(p.id)}">
                    <span>${escapeHTML(p.name)}</span>
                  </label>
                `).join("")}
            </div>
            <button id="submitVoteBtn">Kirim Vote</button>
          `
      }

      <p class="sub" style="margin-top:12px">
        Vote masuk: ${Object.keys(votes).length}/${players.length}
      </p>
    </div>

    <div class="panel">
      <h3>Deskripsi tadi</h3>
      <div class="clue-list">
        ${Object.values(room.clues || {})
          .sort((a, b) => (a.order || 0) - (b.order || 0))
          .map(c => `
            <div class="clue">
              <strong>${escapeHTML(c.name)}</strong>
              ${escapeHTML(c.text)}
            </div>
          `).join("")}
      </div>
    </div>
  `;
}

function renderResolving() {
  gameArea.innerHTML = `
    <div class="panel">
      <h2>Menghitung hasil voting...</h2>
      <p class="sub">Tunggu sebentar.</p>
    </div>
  `;
}

function renderSpyGuess(room) {
  const spyName = getPlayerName(room, room.spyId);
  const isSpy = playerId === room.spyId;

  gameArea.innerHTML = `
    <div class="panel warn">
      <h2>Spy Ketahuan!</h2>
      <p>
        Player mencurigakan adalah <strong>${escapeHTML(spyName)}</strong>.
        Sekarang spy punya kesempatan terakhir menebak kata asli.
      </p>
    </div>

    ${
      isSpy
        ? `
          <div class="panel">
            <h3>Tebak kata asli player lain</h3>
            <input id="spyGuessInput" type="text" placeholder="Masukkan tebakan..." maxlength="40">
            <button id="submitSpyGuessBtn">Kirim Tebakan</button>
          </div>
        `
        : `
          <div class="panel">
            <p class="sub">Menunggu spy menebak kata asli...</p>
            <button class="ghost" disabled>Menunggu ${escapeHTML(spyName)}...</button>
          </div>
        `
    }
  `;
}

function renderFinished(room) {
  const spyName = getPlayerName(room, room.spyId);
  const winnerText = room.winner === "spy" ? "Spy Menang" : "Player Menang";
  const resultClass = room.winner === "spy" ? "danger" : "good";
  const host = isHost(room);
  const eliminatedName = room.eliminatedId ? getPlayerName(room, room.eliminatedId) : "-";

  gameArea.innerHTML = `
    <div class="panel result-box ${resultClass}">
      <div class="result-title">${escapeHTML(winnerText)}</div>
      <p>${escapeHTML(room.resultText || "Game selesai.")}</p>
    </div>

    <div class="panel">
      <h3>Hasil Game</h3>

      <div class="kv">
        <div>
          <span>Spy</span>
          <strong>${escapeHTML(spyName)}</strong>
        </div>
        <div>
          <span>Yang Divote</span>
          <strong>${escapeHTML(eliminatedName)}</strong>
        </div>
        <div>
          <span>Kata Asli</span>
          <strong>${escapeHTML(room.normalWord || "-")}</strong>
        </div>
        <div>
          <span>Kata Spy</span>
          <strong>${escapeHTML(room.spyWord || "-")}</strong>
        </div>
      </div>

      ${
        room.spyGuess
          ? `<p class="sub" style="margin-top:12px">Tebakan spy: <strong>${escapeHTML(room.spyGuess)}</strong></p>`
          : ""
      }
    </div>

    ${
      host
        ? `<button id="playAgainBtn">Main Lagi</button>`
        : `<button class="ghost" disabled>Menunggu host main lagi...</button>`
    }
  `;
}

/* =========================
   GAME ACTIONS
========================= */
async function startGame() {
  if (!currentRoomCode) return;

  const roomSnap = await get(child(ref(db), `rooms/${currentRoomCode}`));
  if (!roomSnap.exists()) return;

  const room = roomSnap.val();
  const players = getPlayersArray(room);

  if (room.hostId !== playerId) {
    alert("Hanya host yang bisa mulai game.");
    return;
  }

  if (players.length < 3) {
    alert("Minimal 3 player biar game seru.");
    return;
  }

  const pair = randomItem(WORD_PAIRS);
  const turnOrder = shuffle(players.map(p => p.id));
  const spyId = randomItem(turnOrder);

  const updates = {
    [`rooms/${currentRoomCode}/status`]: "playing",
    [`rooms/${currentRoomCode}/category`]: pair.category,
    [`rooms/${currentRoomCode}/normalWord`]: pair.normal,
    [`rooms/${currentRoomCode}/spyWord`]: pair.spy,
    [`rooms/${currentRoomCode}/spyId`]: spyId,
    [`rooms/${currentRoomCode}/turnOrder`]: turnOrder,
    [`rooms/${currentRoomCode}/currentTurn`]: 0,
    [`rooms/${currentRoomCode}/clues`]: null,
    [`rooms/${currentRoomCode}/votes`]: null,
    [`rooms/${currentRoomCode}/eliminatedId`]: null,
    [`rooms/${currentRoomCode}/winner`]: null,
    [`rooms/${currentRoomCode}/resultText`]: null,
    [`rooms/${currentRoomCode}/spyGuess`]: null,
    [`rooms/${currentRoomCode}/startedAt`]: serverTimestamp()
  };

  players.forEach(player => {
    const isSpyPlayer = player.id === spyId;
    updates[`rooms/${currentRoomCode}/players/${player.id}/role`] = isSpyPlayer ? "spy" : "player";
    updates[`rooms/${currentRoomCode}/players/${player.id}/word`] = isSpyPlayer ? pair.spy : pair.normal;
  });

  await update(ref(db), updates);
}

async function submitClue() {
  if (!latestRoom || !currentRoomCode) return;

  const turnOrder = getTurnOrder(latestRoom);
  const currentId = turnOrder[Number(latestRoom.currentTurn || 0)];

  if (currentId !== playerId) {
    alert("Belum giliran kamu.");
    return;
  }

  const input = document.getElementById("clueInput");
  const text = String(input?.value || "").trim();

  if (!text) {
    alert("Isi deskripsi dulu.");
    return;
  }

  if (text.length > 80) {
    alert("Deskripsi maksimal 80 karakter.");
    return;
  }

  const currentIndex = Number(latestRoom.currentTurn || 0);
  const nextIndex = currentIndex + 1;

  const updates = {
    [`rooms/${currentRoomCode}/clues/${playerId}`]: {
      id: playerId,
      name: playerName,
      text,
      order: currentIndex,
      at: serverTimestamp()
    }
  };

  if (nextIndex < turnOrder.length) {
    updates[`rooms/${currentRoomCode}/currentTurn`] = nextIndex;
  } else {
    updates[`rooms/${currentRoomCode}/status`] = "voting";
    updates[`rooms/${currentRoomCode}/currentTurn`] = null;
    updates[`rooms/${currentRoomCode}/votes`] = null;
  }

  await update(ref(db), updates);
}

async function submitVote() {
  if (!latestRoom || !currentRoomCode) return;

  const selected = document.querySelector('input[name="voteTarget"]:checked');

  if (!selected) {
    alert("Pilih player dulu.");
    return;
  }

  const targetId = selected.value;

  if (targetId === playerId) {
    alert("Tidak bisa vote diri sendiri.");
    return;
  }

  await set(ref(db, `rooms/${currentRoomCode}/votes/${playerId}`), targetId);
}

async function maybeResolveVoting(room) {
  if (resolvingVote) return;

  const players = getPlayersArray(room);
  const votes = room.votes || {};
  const voteCount = Object.keys(votes).filter(voterId => room.players?.[voterId]).length;

  if (voteCount < players.length) return;

  resolvingVote = true;

  try {
    await update(ref(db, `rooms/${currentRoomCode}`), {
      status: "resolving"
    });

    await resolveVoting();
  } catch (err) {
    console.error(err);
    resolvingVote = false;
  }
}

async function resolveVoting() {
  const roomSnap = await get(child(ref(db), `rooms/${currentRoomCode}`));
  if (!roomSnap.exists()) return;

  const room = roomSnap.val();
  const players = getPlayersArray(room);
  const validPlayerIds = new Set(players.map(p => p.id));
  const votes = room.votes || {};

  const counts = {};
  Object.values(votes).forEach(targetId => {
    if (validPlayerIds.has(targetId)) {
      counts[targetId] = (counts[targetId] || 0) + 1;
    }
  });

  const maxVote = Math.max(...Object.values(counts));
  const topIds = Object.keys(counts).filter(id => counts[id] === maxVote);
  const eliminatedId = randomItem(topIds);
  const eliminatedName = getPlayerName(room, eliminatedId);
  const spyName = getPlayerName(room, room.spyId);

  if (eliminatedId === room.spyId) {
    await update(ref(db, `rooms/${currentRoomCode}`), {
      status: "spy_guess",
      eliminatedId,
      resultText: `Spy (${spyName}) berhasil ditemukan. Sekarang spy harus menebak kata asli.`
    });
  } else {
    await update(ref(db, `rooms/${currentRoomCode}`), {
      status: "finished",
      eliminatedId,
      winner: "spy",
      resultText: `${eliminatedName} divote, tapi dia bukan spy. Spy sebenarnya adalah ${spyName}.`
    });
  }
}

async function submitSpyGuess() {
  if (!latestRoom || !currentRoomCode) return;

  if (latestRoom.spyId !== playerId) {
    alert("Hanya spy yang bisa menebak.");
    return;
  }

  const input = document.getElementById("spyGuessInput");
  const guess = String(input?.value || "").trim();

  if (!guess) {
    alert("Isi tebakan dulu.");
    return;
  }

  const correct = normalizeWord(guess) === normalizeWord(latestRoom.normalWord);
  const spyName = getPlayerName(latestRoom, latestRoom.spyId);

  await update(ref(db, `rooms/${currentRoomCode}`), {
    status: "finished",
    spyGuess: guess,
    winner: correct ? "spy" : "players",
    resultText: correct
      ? `${spyName} menebak kata asli dengan benar.`
      : `${spyName} gagal menebak kata asli.`
  });
}

async function playAgain() {
  if (!latestRoom || !currentRoomCode) return;

  if (!isHost(latestRoom)) {
    alert("Hanya host yang bisa mulai ulang.");
    return;
  }

  const players = getPlayersArray(latestRoom);

  const updates = {
    [`rooms/${currentRoomCode}/status`]: "waiting",
    [`rooms/${currentRoomCode}/category`]: null,
    [`rooms/${currentRoomCode}/normalWord`]: null,
    [`rooms/${currentRoomCode}/spyWord`]: null,
    [`rooms/${currentRoomCode}/spyId`]: null,
    [`rooms/${currentRoomCode}/turnOrder`]: null,
    [`rooms/${currentRoomCode}/currentTurn`]: null,
    [`rooms/${currentRoomCode}/clues`]: null,
    [`rooms/${currentRoomCode}/votes`]: null,
    [`rooms/${currentRoomCode}/eliminatedId`]: null,
    [`rooms/${currentRoomCode}/winner`]: null,
    [`rooms/${currentRoomCode}/resultText`]: null,
    [`rooms/${currentRoomCode}/spyGuess`]: null,
    [`rooms/${currentRoomCode}/startedAt`]: null
  };

  players.forEach(player => {
    updates[`rooms/${currentRoomCode}/players/${player.id}/role`] = null;
    updates[`rooms/${currentRoomCode}/players/${player.id}/word`] = null;
  });

  resolvingVote = false;
  await update(ref(db), updates);
}

async function leaveRoom() {
  if (!currentRoomCode) {
    goMenu();
    return;
  }

  try {
    const roomSnap = await get(child(ref(db), `rooms/${currentRoomCode}`));

    if (!roomSnap.exists()) {
      goMenu();
      return;
    }

    const room = roomSnap.val();

    if (room.hostId === playerId) {
      await remove(ref(db, `rooms/${currentRoomCode}`));
    } else {
      await remove(ref(db, `rooms/${currentRoomCode}/players/${playerId}`));
    }

    goMenu();
  } catch (err) {
    alert("Gagal keluar room: " + err.message);
  }
}

function goMenu() {
  if (currentRoomUnsubscribe) {
    currentRoomUnsubscribe();
    currentRoomUnsubscribe = null;
  }

  currentRoomCode = null;
  latestRoom = null;
  resolvingVote = false;
  roomCodeInput.value = "";
  gameArea.innerHTML = "";
  playersList.innerHTML = "";
  showPage(menuPage);
}

/* =========================
   EVENTS
========================= */
saveNameBtn.addEventListener("click", () => {
  playerName = cleanName(nameInput.value);
  localStorage.setItem("spy_player_name", playerName);
  updateNameUI();
  showPage(menuPage);
});

changeNameBtn.addEventListener("click", () => {
  nameInput.value = playerName === "Guest" ? "" : playerName;
  showPage(namePage);
});

createRoomBtn.addEventListener("click", createRoom);
joinRoomBtn.addEventListener("click", joinRoom);
leaveRoomBtn.addEventListener("click", leaveRoom);

copyCodeBtn.addEventListener("click", async () => {
  if (!currentRoomCode) return;

  try {
    await navigator.clipboard.writeText(currentRoomCode);
    toastMsg("Kode room disalin.");
  } catch {
    alert("Kode room: " + currentRoomCode);
  }
});

roomCodeInput.addEventListener("input", () => {
  roomCodeInput.value = roomCodeInput.value.toUpperCase();
});

gameArea.addEventListener("click", (e) => {
  const id = e.target?.id;

  if (id === "startGameBtn") startGame();
  if (id === "submitClueBtn") submitClue();
  if (id === "submitVoteBtn") submitVote();
  if (id === "submitSpyGuessBtn") submitSpyGuess();
  if (id === "playAgainBtn") playAgain();
});

/* Error helper biar gampang debug di HP */
window.addEventListener("error", (e) => {
  console.error(e.error || e.message);
});

window.addEventListener("unhandledrejection", (e) => {
  console.error(e.reason);
  if (String(e.reason?.message || "").includes("permission")) {
    alert("Firebase permission error. Cek Realtime Database Rules.");
  }
});

/* =========================
   INIT
========================= */
updateNameUI();

if (localStorage.getItem("spy_player_name") || playerName !== "Guest") {
  showPage(menuPage);
} else {
  showPage(namePage);
}
