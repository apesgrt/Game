function $(id){ return document.getElementById(id); }
let workingConfig = null;
let editingGameId = null;
function cfg(){ return workingConfig || GameDex.getConfig(); }
function safe(v){ return GameDex.safeText(v); }
function setValue(id, value){ const el = $(id); if(el) el.value = value ?? ''; }
function setCheck(id, value){ const el = $(id); if(el) el.checked = !!value; }
function getValue(id){ return ($(id)?.value || '').trim(); }
function emailsToText(list){ return (list || []).join(', '); }
function textToEmails(text){ return String(text || '').split(/[\n,; ]+/).map(GameDex.normalizeEmail).filter(Boolean); }
function statusClass(status){
  const s = GameDex.normalizeStatus(status);
  if(s === 'READY') return 'chip-green';
  if(s === 'UPDATE') return 'chip-yellow';
  return 'chip-red';
}
function loadFallbackIcon(img){
  img.onerror = null;
  img.src = GameDex.resolvePath(cfg().assets?.fallbackGameIcon || 'assets/images/game-icons/default.png');
}
window.loadFallbackIcon = loadFallbackIcon;
function requireAdmin(){
  const allowed = GameDex.isAdmin();
  $('lockedView').classList.toggle('hidden', allowed);
  $('adminView').classList.toggle('hidden', !allowed);
  return allowed;
}
async function loadRemoteFirst(){
  if(window.GameDexFirebase) await GameDexFirebase.syncSettingsFromFirestore();
}
function loadForm(){
  workingConfig = GameDex.getConfig();
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
  renderAdminGames();
  updateExport();
}
function buildConfigFromForm(){
  const c = GameDex.mergeDeep(cfg(), {
    app: {
      name: getValue('appName') || 'GameDex',
      subtitle: getValue('appSubtitle') || 'Mobile Launcher',
      description: getValue('appDescription') || ''
    },
    assets: { logo: getValue('logoPath') || 'assets/images/app-logo.png' },
    admin: {
      adminEmails: textToEmails(getValue('adminEmails')),
      enableLocalAdminFallback: cfg().admin?.enableLocalAdminFallback === true
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
    }
  });
  c.games = cfg().games || [];
  c.tools = cfg().tools || [];
  workingConfig = c;
  return c;
}
function updateExport(){
  const c = buildConfigFromForm();
  if($('exportBox')) $('exportBox').value = JSON.stringify(c, null, 2);
}
function clearGameForm(){
  ['gameId','gameTitle','gameIcon','gameUrl','gameDescription'].forEach(key => setValue(key, ''));
  setValue('gameStatus', 'REBUILD');
  setCheck('gameRequiresLogin', false);
}
window.cancelGameEdit = function(showToast = true){
  editingGameId = null;
  clearGameForm();
  const btn = $('gameSaveBtn');
  if(btn) btn.textContent = 'TAMBAH TOMBOL GAME';
  if(showToast) GameDex.toast('Edit dibatalkan.');
};
function renderAdminGames(){
  const list = cfg().games || [];
  $('adminGameCount').textContent = GameDex.countLabel(list.length, 'GAME');
  $('adminGamesList').innerHTML = list.map((game, index) => {
    const icon = game.icon || game.id || 'default';
    const status = GameDex.normalizeStatus(game.status);
    return `<div class="admin-game-item">
      <span class="admin-game-icon"><img src="${safe(GameDex.iconPath(icon))}" alt="${safe(game.title || game.id)} icon" onerror="loadFallbackIcon(this)"></span>
      <span class="admin-game-info"><span class="admin-game-title">${safe(game.title || game.id)}</span><span class="admin-game-meta">${safe(game.id || '-') } · ${safe(game.url || 'no-url')} ${game.requiresLogin ? ' · LOGIN' : ''}</span></span>
      <span class="chip ${statusClass(status)} admin-status-chip">${safe(status)}</span>
      <button class="btn btn-dark btn-small" type="button" onclick="editGameButton(${index})">EDIT</button>
      <button class="btn btn-danger btn-small" type="button" onclick="deleteGameButton(${index})">HAPUS</button>
    </div>`;
  }).join('');
  updateExport();
}
window.editGameButton = function(index){
  buildConfigFromForm();
  const game = (cfg().games || [])[index];
  if(!game) return;
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
window.addGameButton = function(){
  buildConfigFromForm();
  const id = getValue('gameId').toLowerCase().replace(/[^a-z0-9_-]/g, '');
  const title = getValue('gameTitle');
  const icon = getValue('gameIcon') || id;
  const status = GameDex.normalizeStatus(getValue('gameStatus'));
  const description = getValue('gameDescription') || 'Game belum disambungkan';
  const url = getValue('gameUrl') || `game/${id}/index.html`;
  const requiresLogin = $('gameRequiresLogin')?.checked || false;
  if(!id || !title){ GameDex.toast('ID dan nama game wajib diisi.'); return; }
  const games = cfg().games || [];
  let index = games.findIndex(game => game.id === id);
  if(editingGameId && editingGameId !== id){
    const oldIndex = games.findIndex(game => game.id === editingGameId);
    if(oldIndex >= 0) index = oldIndex;
  }
  const data = { id, title, description, icon, status, url, requiresLogin };
  if(id === 'spy') data.defaultNameFromProfile = true;
  if(index >= 0) games[index] = data;
  else games.push(data);
  workingConfig.games = games;
  editingGameId = null;
  clearGameForm();
  $('gameSaveBtn').textContent = 'TAMBAH TOMBOL GAME';
  renderAdminGames();
  GameDex.toast(index >= 0 ? 'Game diperbarui.' : 'Tombol game ditambahkan.');
};
window.deleteGameButton = function(index){
  buildConfigFromForm();
  const games = cfg().games || [];
  games.splice(index, 1);
  workingConfig.games = games;
  renderAdminGames();
  GameDex.toast('Tombol game dihapus.');
};
window.saveAllSettings = async function(){
  const c = buildConfigFromForm();
  GameDex.saveSettings(c);
  let remoteSaved = false;
  if(window.GameDexFirebase && GameDexFirebase.firestoreEnabled()){
    try{ remoteSaved = await GameDexFirebase.saveSettingsToFirestore(c); }
    catch(err){ GameDex.toast(GameDexFirebase.friendlyError(err)); }
  }
  workingConfig = GameDex.getConfig();
  GameDex.applyBrand();
  updateExport();
  GameDex.toast(remoteSaved ? 'Settings disimpan ke Firestore.' : 'Settings disimpan lokal.');
};
window.copyExport = async function(){
  updateExport();
  try{ await navigator.clipboard.writeText($('exportBox').value); GameDex.toast('JSON disalin.'); }
  catch{ GameDex.toast('Gagal copy. Salin manual dari textarea.'); }
};
window.resetAllSettings = function(){
  if(!confirm('Reset semua setting lokal admin? Data Firestore tidak dihapus.')) return;
  GameDex.resetSettings();
  workingConfig = GameDex.getConfig();
  loadForm();
  GameDex.toast('Setting lokal direset.');
};
window.adminLogout = async function(){
  if(window.GameDexFirebase) await GameDexFirebase.signOut();
  else GameDex.logout();
  location.href = 'login.html';
};
window.addEventListener('load', async () => {
  GameDex.applyBrand();
  await loadRemoteFirst();
  GameDex.applyBrand();
  if(!requireAdmin()) return;
  loadForm();
  document.querySelectorAll('input, textarea, select').forEach(el => el.addEventListener('input', updateExport));
  document.querySelectorAll('input[type="checkbox"], select').forEach(el => el.addEventListener('change', updateExport));
});
