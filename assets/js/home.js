function $(id){ return document.getElementById(id); }
function cfg(){ return GameDex.getConfig(); }
function safe(value){ return GameDex.safeText(value); }
function statusClass(status){
  const s = GameDex.normalizeStatus(status);
  if(s === 'READY') return 'status-ready';
  if(s === 'UPDATE') return 'status-update';
  return 'status-rebuild';
}
function loadFallbackIcon(img){
  img.onerror = null;
  img.src = GameDex.resolvePath(cfg().assets?.fallbackGameIcon || 'assets/images/game-icons/default.png');
}
window.loadFallbackIcon = loadFallbackIcon;

function renderAvatar(profile){
  const avatar = $('avatar');
  if(!avatar) return;
  if(profile.avatar){ avatar.innerHTML = `<img src="${safe(profile.avatar)}" alt="Avatar">`; }
  else { avatar.innerHTML = `<span class="initial">${safe((profile.name || 'G').trim()[0] || 'G')}</span>`; }
}
function renderProfile(){
  const profile = GameDex.getProfile();
  const user = GameDex.getUser();
  $('profileName').textContent = profile.name;
  $('profileUser').textContent = user?.email ? `${profile.username} · ${user.email}` : `${profile.username} · Guest mode`;
  renderAvatar(profile);
  $('roleBadge').classList.toggle('hidden', !GameDex.isAdmin());
  document.body.classList.toggle('is-admin', GameDex.isAdmin());
  const adminLink = document.querySelector('.admin-menu-link');
  if(adminLink) adminLink.style.display = GameDex.isAdmin() ? 'flex' : 'none';
  $('authBtn').textContent = user ? 'LOGOUT' : 'LOGIN';
  $('authBtn').href = user ? '#' : 'login.html';
  $('loginMenuText').textContent = user ? 'Logout' : 'Login';
  $('loginMenuLink').href = user ? '#' : 'login.html';
}
function renderGlobal(){
  const conf = cfg();
  $('welcomeTitle').textContent = conf.global?.welcomeTitle || 'Selamat datang di GameDex';
  $('welcomeText').textContent = conf.global?.welcomeText || conf.app?.description || '';
  const ann = $('announcementBox');
  const show = conf.global?.showAnnouncement !== false && (conf.global?.announcement || '').trim();
  ann.classList.toggle('hidden', !show);
  ann.textContent = show ? conf.global.announcement : '';
  $('footerNote').textContent = `${conf.app?.name || 'GameDex'} ${conf.app?.version || ''}`;
}
function renderLauncherButton(item, type){
  const id = item.id || item.title || 'default';
  const icon = item.icon || id;
  const status = GameDex.normalizeStatus(item.status);
  const ready = status === 'READY';
  const cls = type === 'tool' ? 'tool' : 'game';
  const lock = item.requiresLogin ? `<span class="game-lock" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="10" width="16" height="10" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg></span>` : '';
  return `<button class="${cls}-button ${ready ? 'is-ready' : 'is-blocked'}" type="button" data-kind="${safe(type)}" data-id="${safe(id)}" aria-label="${safe(item.title || id)}">
    <span class="${cls}-icon"><img src="${safe(GameDex.iconPath(icon))}" data-icon="${safe(icon)}" alt="${safe(item.title || id)} icon" onerror="loadFallbackIcon(this)"></span>
    <span class="${cls}-text"><span class="${cls}-title">${safe(item.title || id)}</span><span class="${cls}-desc">${safe(item.description || 'Belum disambungkan')}</span><span class="${cls}-status ${statusClass(status)}">${safe(status)}</span></span>
    ${lock}<span class="${cls}-arrow" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg></span>
  </button>`;
}
function blockedMessage(item){
  const status = GameDex.normalizeStatus(item?.status);
  if(status === 'REBUILD') return `${item.title || 'Item ini'} sedang REBUILD. Belum bisa dibuka.`;
  if(status === 'UPDATE') return `${item.title || 'Item ini'} sedang UPDATE. Coba lagi nanti.`;
  return `${item.title || 'Item ini'} belum siap.`;
}
function openItem(item, type){
  const status = GameDex.normalizeStatus(item?.status);
  if(status !== 'READY'){
    GameDex.toast(blockedMessage(item));
    return;
  }
  if(item.requiresLogin && !GameDex.isLoggedIn()){
    GameDex.toast(`${item.title || 'Game ini'} wajib login dulu.`);
    setTimeout(()=>{ location.href = `login.html?next=${encodeURIComponent(item.id || '')}`; }, 700);
    return;
  }
  const ctx = GameDex.setLaunchContext(item);
  if(item.id === 'spy') localStorage.setItem('whos_spy_default_name', ctx.playerName);
  if(item.url){
    const target = GameDex.resolvePath(item.url);
    if(type === 'game' && cfg().features?.enableGameOpen !== true){
      GameDex.toast('Game open masih dimatikan di config.');
      return;
    }
    const sep = target.includes('?') ? '&' : '?';
    const suffix = type === 'game' ? `${sep}name=${encodeURIComponent(ctx.playerName)}${ctx.uid ? '&uid=' + encodeURIComponent(ctx.uid) : ''}` : '';
    location.href = target + suffix;
    return;
  }
  GameDex.toast('Belum ada target URL. Edit dari Admin Panel dulu.');
}
function renderGames(){
  const list = cfg().games || [];
  $('gamesList').innerHTML = list.map(game => renderLauncherButton(game, 'game')).join('');
  $('gameCount').textContent = GameDex.countLabel(list.length, 'GAME');
  $('gamesList').querySelectorAll('.game-button').forEach(btn => {
    const game = list.find(item => String(item.id) === String(btn.dataset.id));
    btn.addEventListener('click', () => openItem(game || {}, 'game'));
  });
}
function renderTools(){
  const list = cfg().tools || [];
  const box = $('toolsList');
  if(!box) return;
  box.innerHTML = list.map(tool => renderLauncherButton(tool, 'tool')).join('');
  $('toolCount').textContent = `${list.length} TOOLS`;
  box.querySelectorAll('.tool-button').forEach(btn => {
    const tool = list.find(item => String(item.id) === String(btn.dataset.id));
    btn.addEventListener('click', () => openItem(tool || {}, 'tool'));
  });
}
function setMenu(open){
  $('menuBtn').classList.toggle('active', open);
  $('menuBtn').setAttribute('aria-expanded', String(open));
  $('menuPanel').classList.toggle('active', open);
  $('menuPanel').setAttribute('aria-hidden', String(!open));
}
function renderMaintenanceIfNeeded(){
  const conf = cfg();
  const maintenance = conf.maintenance || {};
  const active = maintenance.enabled && !GameDex.isAdmin();
  $('appShell').classList.toggle('hidden', active);
  $('maintenanceView').classList.toggle('hidden', !active);
  if(!active) return;
  $('maintenanceView').innerHTML = `<main class="maintenance-shell">
    <section class="maintenance-card">
      <img class="maintenance-logo" data-app-logo src="${safe(GameDex.resolvePath(conf.assets?.logo || 'assets/images/app-logo.png'))}" alt="${safe(conf.app?.name || 'GameDex')} logo">
      <span class="chip chip-red">Maintenance</span>
      <h1>${safe(maintenance.title || 'GameDex Sedang Maintenance')}</h1>
      <p>${safe(maintenance.message || 'Launcher sedang dirapikan. Silakan kembali lagi nanti.')}</p>
      <div class="maintenance-actions"><a class="btn btn-purple" href="login.html">LOGIN</a></div>
    </section>
  </main>`;
}
window.logoutUser = async function(){
  if(!GameDex.getUser()) return;
  if(window.GameDexFirebase) await GameDexFirebase.signOut();
  else GameDex.logout();
  GameDex.toast('Logout berhasil. Sekarang mode Guest.');
  renderProfile(); renderGames(); renderTools(); renderMaintenanceIfNeeded();
};
async function initHome(){
  GameDex.applyBrand();
  if(window.GameDexFirebase) await GameDexFirebase.syncSettingsFromFirestore();
  GameDex.applyBrand();
  renderMaintenanceIfNeeded(); renderProfile(); renderGlobal(); renderGames(); renderTools();
  $('menuBtn')?.addEventListener('click', () => setMenu(!$('menuBtn').classList.contains('active')));
  $('authBtn')?.addEventListener('click', (e) => { if(GameDex.getUser()){ e.preventDefault(); logoutUser(); } });
  $('loginMenuLink')?.addEventListener('click', (e) => { if(GameDex.getUser()){ e.preventDefault(); logoutUser(); setMenu(false); } });
  document.addEventListener('click', (e) => { if($('menuPanel') && !$('menuPanel').contains(e.target) && !$('menuBtn').contains(e.target)) setMenu(false); });
  document.querySelectorAll('.menu-link').forEach(link => link.addEventListener('click', () => setMenu(false)));
}
window.addEventListener('load', initHome);
