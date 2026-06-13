function $(id) {
  return document.getElementById(id);
}

let workingConfig = null;
let editingGameId = null;
let editingToolId = null;

function cfg() {
  return workingConfig || GameDex.getConfig();
}

function safe(value) {
  return GameDex.safeText(value);
}

function setValue(id, value) {
  const el = $(id);
  if (el) el.value = value ?? '';
}

function setCheck(id, value) {
  const el = $(id);
  if (el) el.checked = !!value;
}

function getValue(id) {
  return ($(id)?.value || '').trim();
}

function emailsToText(list) {
  return (list || []).join(', ');
}

function textToEmails(text) {
  return String(text || '')
    .split(/[\n,; ]+/)
    .map(GameDex.normalizeEmail)
    .filter(Boolean);
}

function statusClass(status) {
  const normalized = GameDex.normalizeStatus(status);

  if (normalized === 'READY') return 'chip-green';
  if (normalized === 'UPDATE') return 'chip-yellow';

  return 'chip-red';
}

function normalizeId(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9_-]/g, '');
}

function loadFallbackIcon(img) {
  img.onerror = null;
  img.src = GameDex.resolvePath(
    cfg().assets?.fallbackGameIcon || 'assets/images/game-icons/default.png'
  );
}

window.loadFallbackIcon = loadFallbackIcon;

function requireAdmin() {
  const allowed = GameDex.isAdmin();

  $('lockedView').classList.toggle('hidden', allowed);
  $('adminView').classList.toggle('hidden', !allowed);

  return allowed;
}

async function loadRemoteFirst() {
  if (window.GameDexFirebase) await GameDexFirebase.syncSettingsFromFirestore();
}

function defaultMusicTool() {
  return {
    id: 'music',
    title: 'Music',
    description: 'Music Player lokal',
    icon: 'music',
    status: 'READY',
    url: 'tools/music/musik.html',
    localOnly: true
  };
}

function getToolsWithMusic(list) {
  const tools = Array.isArray(list) ? [...list] : [];
  const index = tools.findIndex(tool => String(tool.id || '').toLowerCase() === 'music');

  if (index >= 0) {
    tools[index] = {
      ...defaultMusicTool(),
      ...tools[index],
      id: 'music',
      url: 'tools/music/musik.html',
      localOnly: true
    };
  } else {
    tools.push(defaultMusicTool());
  }

  return tools;
}

function loadForm() {
  workingConfig = GameDex.getConfig();
  workingConfig.tools = getToolsWithMusic(workingConfig.tools);

  const c = cfg();
  const user = GameDex.getUser();

  $('adminNameLabel').textContent = user?.name || 'GameDex Control';
  $('adminEmailLabel').textContent = user?.email || 'Firebase email verified';

  setValue('appName', c.app?.name || 'GameDex');
  setValue('appSubtitle', c.app?.subtitle || 'Mobile Launcher');
  setValue('appDescription', c.app?.description || '');
  setValue('welcomeTitleInput', c.global?.welcomeTitle || '');
  setValue('welcomeTextInput', c.global?.welcomeText || '');
  setValue('announcementInput', c.global?.announcement || '');
  setCheck('showAnnouncement', c.global?.showAnnouncement !== false);
  setCheck('maintenanceEnabled', c.maintenance?.enabled || false);
  setValue('maintenanceTitle', c.maintenance?.title || 'GameDex Sedang Maintenance');
  setValue('maintenanceMessage', c.maintenance?.message || 'Launcher sedang dirapikan. Silakan kembali lagi nanti.');
  setValue('adminEmails', emailsToText(c.admin?.adminEmails || c.admin?.emails || window.GAMEDEX_FIREBASE_CONFIG?.adminEmails || []));
  setValue('logoPath', c.assets?.logo || 'assets/images/app-logo.png');

  cancelGameEdit(false);
  cancelToolEdit(false);
  renderAdminGames();
  renderAdminTools();
  updateExport();
}

function buildConfigFromForm() {
  const current = cfg();
  const merged = GameDex.mergeDeep(current, {
    app: {
      name: getValue('appName') || 'GameDex',
      subtitle: getValue('appSubtitle') || 'Mobile Launcher',
      description: getValue('appDescription') || ''
    },
    assets: {
      logo: getValue('logoPath') || 'assets/images/app-logo.png'
    },
    admin: {
      adminEmails: textToEmails(getValue('adminEmails')),
      enableLocalAdminFallback: current.admin?.enableLocalAdminFallback === true
    },
    global: {
      welcomeTitle: getValue('welcomeTitleInput') || 'Selamat datang di GameDex',
      welcomeText: getValue('welcomeTextInput') || '',
      announcement: getValue('announcementInput') || '',
      showAnnouncement: $('showAnnouncement').checked
    },
    maintenance: {
      enabled: $('maintenanceEnabled').checked,
      title: getValue('maintenanceTitle') || 'GameDex Sedang Maintenance',
      message: getValue('maintenanceMessage') || 'Launcher sedang dirapikan. Silakan kembali lagi nanti.'
    },
    music: {
      ...(current.music || {}),
      enabled: true,
      defaultPath: 'tools/music/musik.html',
      mode: 'local-only'
    }
  });

  merged.games = Array.isArray(current.games) ? current.games : [];
  merged.tools = getToolsWithMusic(current.tools);
  workingConfig = merged;

  return merged;
}

function updateExport() {
  const c = buildConfigFromForm();
  const box = $('exportBox');

  if (box) box.value = JSON.stringify(c, null, 2);
}

function clearGameForm() {
  ['gameId', 'gameTitle', 'gameIcon', 'gameUrl', 'gameDescription'].forEach(id => setValue(id, ''));
  setValue('gameStatus', 'REBUILD');
  setCheck('gameRequiresLogin', false);
}

window.cancelGameEdit = function cancelGameEdit(showToast = true) {
  editingGameId = null;
  clearGameForm();

  const btn = $('gameSaveBtn');
  if (btn) btn.textContent = 'TAMBAH TOMBOL GAME';

  if (showToast) GameDex.toast('Edit game dibatalkan.');
};

function renderAdminGames() {
  const list = cfg().games || [];

  $('adminGameCount').textContent = GameDex.countLabel(list.length, 'GAME');
  $('adminGamesList').innerHTML = list.map((game, index) => {
    const icon = game.icon || game.id || 'default';
    const status = GameDex.normalizeStatus(game.status);

    return `
      <div class="admin-game-item">
        <span class="admin-game-icon">
          <img src="${safe(GameDex.iconPath(icon))}" alt="${safe(game.title || game.id)} icon" onerror="loadFallbackIcon(this)">
        </span>
        <span class="admin-game-info">
          <span class="admin-game-title">${safe(game.title || game.id)}</span>
          <span class="admin-game-meta">${safe(game.id || '-')} · ${safe(game.url || 'no-url')} ${game.requiresLogin ? ' · LOGIN' : ''}</span>
        </span>
        <span class="chip ${statusClass(status)} admin-status-chip">${safe(status)}</span>
        <button class="btn btn-dark btn-small" type="button" onclick="editGameButton(${index})">EDIT</button>
        <button class="btn btn-danger btn-small" type="button" onclick="deleteGameButton(${index})">HAPUS</button>
      </div>
    `;
  }).join('');

  updateExport();
}

window.editGameButton = function editGameButton(index) {
  buildConfigFromForm();

  const game = (cfg().games || [])[index];
  if (!game) return;

  editingGameId = game.id;

  setValue('gameId', game.id || '');
  setValue('gameTitle', game.title || '');
  setValue('gameIcon', game.icon || game.id || '');
  setValue('gameStatus', GameDex.normalizeStatus(game.status));
  setValue('gameUrl', game.url || `game/${game.id || ''}/index.html`);
  setValue('gameDescription', game.description || '');
  setCheck('gameRequiresLogin', !!game.requiresLogin);

  $('gameSaveBtn').textContent = 'SIMPAN EDIT GAME';
  GameDex.toast('Data game masuk ke form edit.');
};

window.addGameButton = function addGameButton() {
  buildConfigFromForm();

  const id = normalizeId(getValue('gameId'));
  const title = getValue('gameTitle');
  const icon = getValue('gameIcon') || id;
  const status = GameDex.normalizeStatus(getValue('gameStatus'));
  const description = getValue('gameDescription') || 'Game belum disambungkan';
  const url = getValue('gameUrl') || `game/${id}/index.html`;
  const requiresLogin = $('gameRequiresLogin')?.checked || false;

  if (!id || !title) {
    GameDex.toast('ID dan nama game wajib diisi.');
    return;
  }

  const games = cfg().games || [];
  let index = games.findIndex(game => game.id === id);

  if (editingGameId && editingGameId !== id) {
    const oldIndex = games.findIndex(game => game.id === editingGameId);
    if (oldIndex >= 0) index = oldIndex;
  }

  const data = { id, title, description, icon, status, url, requiresLogin };
  if (id === 'spy') data.defaultNameFromProfile = true;

  if (index >= 0) games[index] = data;
  else games.push(data);

  workingConfig.games = games;
  editingGameId = null;
  clearGameForm();
  $('gameSaveBtn').textContent = 'TAMBAH TOMBOL GAME';

  renderAdminGames();
  GameDex.toast(index >= 0 ? 'Game diperbarui.' : 'Tombol game ditambahkan.');
};

window.deleteGameButton = function deleteGameButton(index) {
  buildConfigFromForm();

  const games = cfg().games || [];
  games.splice(index, 1);
  workingConfig.games = games;

  renderAdminGames();
  GameDex.toast('Tombol game dihapus.');
};

function clearToolForm() {
  ['toolId', 'toolTitle', 'toolIcon', 'toolUrl', 'toolDescription'].forEach(id => setValue(id, ''));
  setValue('toolStatus', 'READY');
}

window.cancelToolEdit = function cancelToolEdit(showToast = true) {
  editingToolId = null;
  clearToolForm();

  const btn = $('toolSaveBtn');
  if (btn) btn.textContent = 'TAMBAH TOMBOL TOOL';

  if (showToast) GameDex.toast('Edit tool dibatalkan.');
};

function renderAdminTools() {
  const list = getToolsWithMusic(cfg().tools || []);
  workingConfig.tools = list;

  $('adminToolCount').textContent = `${list.length} TOOLS`;
  $('adminToolsList').innerHTML = list.map((tool, index) => {
    const icon = tool.icon || tool.id || 'default';
    const status = GameDex.normalizeStatus(tool.status);
    const isMusic = String(tool.id || '').toLowerCase() === 'music';

    return `
      <div class="admin-game-item admin-tool-item">
        <span class="admin-game-icon">
          <img src="${safe(GameDex.iconPath(icon))}" alt="${safe(tool.title || tool.id)} icon" onerror="loadFallbackIcon(this)">
        </span>
        <span class="admin-game-info">
          <span class="admin-game-title">${safe(tool.title || tool.id)}</span>
          <span class="admin-game-meta">${safe(tool.id || '-')} · ${safe(tool.url || 'no-url')} ${isMusic ? ' · LOCAL' : ''}</span>
        </span>
        <span class="chip ${statusClass(status)} admin-status-chip">${safe(status)}</span>
        <button class="btn btn-dark btn-small" type="button" onclick="editToolButton(${index})">EDIT</button>
        <button class="btn btn-danger btn-small" type="button" onclick="deleteToolButton(${index})" ${isMusic ? 'disabled title="Music bawaan tidak dihapus"' : ''}>HAPUS</button>
      </div>
    `;
  }).join('');

  updateExport();
}

window.editToolButton = function editToolButton(index) {
  buildConfigFromForm();

  const tool = getToolsWithMusic(cfg().tools || [])[index];
  if (!tool) return;

  editingToolId = tool.id;

  setValue('toolId', tool.id || '');
  setValue('toolTitle', tool.title || '');
  setValue('toolIcon', tool.icon || tool.id || '');
  setValue('toolStatus', GameDex.normalizeStatus(tool.status));
  setValue('toolUrl', tool.url || `tools/${tool.id || ''}/index.html`);
  setValue('toolDescription', tool.description || '');

  $('toolSaveBtn').textContent = 'SIMPAN EDIT TOOL';
  GameDex.toast('Data tool masuk ke form edit.');
};

window.addToolButton = function addToolButton() {
  buildConfigFromForm();

  const id = normalizeId(getValue('toolId'));
  const title = getValue('toolTitle');
  const icon = getValue('toolIcon') || id;
  const status = GameDex.normalizeStatus(getValue('toolStatus'));
  const description = getValue('toolDescription') || 'Tool tambahan GameDex';
  const url = getValue('toolUrl') || `tools/${id}/index.html`;

  if (!id || !title) {
    GameDex.toast('ID dan nama tool wajib diisi.');
    return;
  }

  const tools = getToolsWithMusic(cfg().tools || []);
  let index = tools.findIndex(tool => tool.id === id);

  if (editingToolId && editingToolId !== id) {
    const oldIndex = tools.findIndex(tool => tool.id === editingToolId);
    if (oldIndex >= 0) index = oldIndex;
  }

  let data = { id, title, description, icon, status, url };

  if (id === 'music') {
    data = {
      ...defaultMusicTool(),
      ...data,
      id: 'music',
      url: 'tools/music/musik.html',
      status: 'READY',
      localOnly: true
    };
  }

  if (index >= 0) tools[index] = data;
  else tools.push(data);

  workingConfig.tools = getToolsWithMusic(tools);
  editingToolId = null;
  clearToolForm();
  $('toolSaveBtn').textContent = 'TAMBAH TOMBOL TOOL';

  renderAdminTools();
  GameDex.toast(index >= 0 ? 'Tool diperbarui.' : 'Tombol tool ditambahkan.');
};

window.deleteToolButton = function deleteToolButton(index) {
  buildConfigFromForm();

  const tools = getToolsWithMusic(cfg().tools || []);
  const item = tools[index];

  if (String(item?.id || '').toLowerCase() === 'music') {
    GameDex.toast('Music bawaan tidak dihapus, hanya bisa diedit.');
    return;
  }

  tools.splice(index, 1);
  workingConfig.tools = getToolsWithMusic(tools);

  renderAdminTools();
  GameDex.toast('Tombol tool dihapus.');
};

window.saveAllSettings = async function saveAllSettings() {
  const c = buildConfigFromForm();
  c.tools = getToolsWithMusic(c.tools);

  GameDex.saveSettings(c);

  let remoteSaved = false;

  if (window.GameDexFirebase && GameDexFirebase.firestoreEnabled()) {
    try {
      remoteSaved = await GameDexFirebase.saveSettingsToFirestore(c);
    } catch (error) {
      GameDex.toast(GameDexFirebase.friendlyError(error));
    }
  }

  workingConfig = GameDex.getConfig();
  workingConfig.tools = getToolsWithMusic(workingConfig.tools);

  GameDex.applyBrand();
  updateExport();

  GameDex.toast(remoteSaved ? 'Settings disimpan ke Firestore.' : 'Settings disimpan lokal.');
};

window.copyExport = async function copyExport() {
  updateExport();

  try {
    await navigator.clipboard.writeText($('exportBox').value);
    GameDex.toast('JSON disalin.');
  } catch {
    GameDex.toast('Gagal copy. Salin manual dari textarea.');
  }
};

window.resetAllSettings = function resetAllSettings() {
  if (!confirm('Reset semua setting lokal admin? Data Firestore tidak dihapus.')) return;

  GameDex.resetSettings();
  workingConfig = GameDex.getConfig();
  loadForm();
  GameDex.toast('Setting lokal direset.');
};

window.adminLogout = async function adminLogout() {
  if (window.GameDexFirebase) await GameDexFirebase.signOut();
  else GameDex.logout();

  location.href = 'login.html';
};

window.addEventListener('load', async () => {
  GameDex.applyBrand();
  await loadRemoteFirst();
  GameDex.applyBrand();

  if (!requireAdmin()) return;

  loadForm();

  document.querySelectorAll('input, textarea, select').forEach(el => {
    el.addEventListener('input', updateExport);
  });

  document.querySelectorAll('input[type="checkbox"], select').forEach(el => {
    el.addEventListener('change', updateExport);
  });
});
