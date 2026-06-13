let GameDex = window.GameDex || null;

function ensureGameDexReady() {
  GameDex = window.GameDex || GameDex;
  return !!GameDex;
}

function showCoreLoadError() {
  const appShell = document.getElementById('appShell');
  if (appShell) {
    appShell.innerHTML = `
      <section class="container main-content">
        <section class="global-card">
          <div class="global-inner">
            <div class="global-kicker">Error</div>
            <h1 class="global-title">Core GameDex belum kebaca</h1>
            <p class="global-text">Cek apakah file assets/js/core.js dan config/app.config.js berhasil ke-load. Jangan buka home.js langsung; buka index.html atau aula/home.html.</p>
          </div>
        </section>
      </section>
    `;
  }
}

function $(id) {
  return document.getElementById(id);
}

function cfg() {
  return GameDex.getConfig();
}

function safe(value) {
  return GameDex.safeText(value);
}

function statusClass(status) {
  const normalized = GameDex.normalizeStatus(status);

  if (normalized === 'READY') return 'status-ready';
  if (normalized === 'UPDATE') return 'status-update';

  return 'status-rebuild';
}

function loadFallbackIcon(img) {
  img.onerror = null;
  img.src = GameDex.resolvePath(
    cfg().assets?.fallbackGameIcon || 'assets/images/game-icons/default.png'
  );
}

window.loadFallbackIcon = loadFallbackIcon;

function renderAvatar(profile) {
  const avatar = $('avatar');
  if (!avatar) return;

  if (profile.avatar) {
    avatar.innerHTML = `<img src="${safe(profile.avatar)}" alt="Avatar">`;
    return;
  }

  avatar.innerHTML = `<span class="initial">${safe((profile.name || 'G').trim()[0] || 'G')}</span>`;
}

function renderProfile() {
  const profile = GameDex.getProfile();
  const user = GameDex.getUser();

  $('profileName').textContent = profile.name;
  $('profileUser').textContent = user?.email
    ? `${profile.username} · ${user.email}`
    : `${profile.username} · Guest mode`;

  renderAvatar(profile);

  $('roleBadge')?.classList.toggle('hidden', !GameDex.isAdmin());
  document.body.classList.toggle('is-admin', GameDex.isAdmin());

  const adminLink = document.querySelector('.admin-menu-link');
  if (adminLink) adminLink.style.display = GameDex.isAdmin() ? 'flex' : 'none';

  const authBtn = $('authBtn');
  if (authBtn) {
    authBtn.textContent = user ? 'LOGOUT' : 'LOGIN';
    authBtn.href = user ? '#' : 'login.html';
  }

  const loginMenuText = $('loginMenuText');
  if (loginMenuText) loginMenuText.textContent = user ? 'Logout' : 'Login';

  const loginMenuLink = $('loginMenuLink');
  if (loginMenuLink) loginMenuLink.href = user ? '#' : 'login.html';
}

function renderGlobal() {
  const conf = cfg();

  $('welcomeTitle').textContent = conf.global?.welcomeTitle || 'Selamat datang di GameDex';
  $('welcomeText').textContent = conf.global?.welcomeText || conf.app?.description || '';

  const ann = $('announcementBox');
  const show = conf.global?.showAnnouncement !== false && (conf.global?.announcement || '').trim();

  ann.classList.toggle('hidden', !show);
  ann.textContent = show ? conf.global.announcement : '';

  $('footerNote').textContent = `${conf.app?.name || 'GameDex'} ${conf.app?.version || ''}`;
}

function renderLauncherButton(item, type) {
  const id = item.id || item.title || 'default';
  const icon = item.icon || id;
  const status = GameDex.normalizeStatus(item.status);
  const ready = status === 'READY';
  const cls = type === 'tool' ? 'tool' : 'game';
  const lock = item.requiresLogin
    ? `
      <span class="game-lock" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
          <rect x="4" y="10" width="16" height="10" rx="3"></rect>
          <path d="M8 10V7a4 4 0 0 1 8 0v3"></path>
        </svg>
      </span>
    `
    : '';

  return `
    <button class="${cls}-button ${ready ? 'is-ready' : 'is-blocked'}" type="button" data-kind="${safe(type)}" data-id="${safe(id)}" aria-label="${safe(item.title || id)}">
      <span class="${cls}-icon">
        <img src="${safe(GameDex.iconPath(icon))}" data-icon="${safe(icon)}" alt="${safe(item.title || id)} icon" onerror="loadFallbackIcon(this)">
      </span>
      <span class="${cls}-text">
        <span class="${cls}-title">${safe(item.title || id)}</span>
        <span class="${cls}-desc">${safe(item.description || 'Belum disambungkan')}</span>
        <span class="${cls}-status ${statusClass(status)}">${safe(status)}</span>
      </span>
      ${lock}
      <span class="${cls}-arrow" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
          <path d="M9 18l6-6-6-6"></path>
        </svg>
      </span>
    </button>
  `;
}

function blockedMessage(item) {
  const status = GameDex.normalizeStatus(item?.status);

  if (status === 'REBUILD') return `${item.title || 'Item ini'} sedang REBUILD. Belum bisa dibuka.`;
  if (status === 'UPDATE') return `${item.title || 'Item ini'} sedang UPDATE. Coba lagi nanti.`;

  return `${item.title || 'Item ini'} belum siap.`;
}

function isMusicItem(item, type) {
  return type === 'tool' && String(item?.id || '').toLowerCase() === 'music';
}

function getMusicDefaultPath() {
  return window.GAMEDEX_CONFIG?.music?.defaultPath || 'tools/music/musik.html';
}

function localMusicTool(source) {
  return {
    ...(source || {}),
    id: 'music',
    title: source?.title || 'Music',
    description: source?.description || 'Music Player lokal',
    icon: source?.icon || 'music',
    status: 'READY',
    url: getMusicDefaultPath(),
    localOnly: true,
    storage: 'indexeddb'
  };
}

function localSpyGame(source) {
  return {
    ...(source || {}),
    id: 'spy',
    title: source?.title || "Who's The Spy",
    description: source?.description || 'Online room game. Wajib login dan nickname mengikuti akun.',
    icon: source?.icon || 'spy',
    status: 'READY',
    url: 'game/spy/spy.html',
    requiresLogin: true,
    defaultNameFromProfile: true
  };
}

function normalizeLauncherGame(game) {
  if (String(game?.id || '').toLowerCase() === 'spy') return localSpyGame(game);
  return game;
}

function ensureMusicFrame() {
  return $('music-bar');
}

function openMusicFrame(url) {
  const bar = $('music-bar');
  const frame = $('music-iframe');

  if (!bar || !frame) {
    GameDex.toast('Iframe Music belum ditemukan di home.html.');
    return;
  }

  const target = url || GameDex.resolvePath(getMusicDefaultPath());

  // Iframe sudah preloaded dari HTML. Kalau src kosong/beda, set sekali saja.
  // Saat ditutup src tidak dihapus supaya musik tidak restart.
  if (!frame.getAttribute('src') || frame.src === 'about:blank') {
    frame.src = target;
  }

  bar.classList.add('open');
  bar.setAttribute('aria-hidden', 'false');
  document.body.classList.add('music-frame-open');
}

function closeMusicFrame() {
  const bar = $('music-bar');
  if (!bar) return;

  bar.classList.remove('open');
  bar.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('music-frame-open');
}

function isSameFramePage(currentSrc, targetSrc) {
  try {
    const current = new URL(currentSrc || '', location.href);
    const target = new URL(targetSrc || '', location.href);
    return current.pathname === target.pathname;
  } catch {
    return false;
  }
}

function getCurrentLaunchContext() {
  try {
    return GameDex.readJSON?.(GameDex.STORAGE?.launchContext, null) || null;
  } catch {
    return null;
  }
}

function sendGameLaunch(frame, target, context) {
  if (!frame?.contentWindow) return;

  const payload = {
    type: 'gamedex:game:launch',
    id: context?.gameId || 'spy',
    url: target,
    context: context || getCurrentLaunchContext()
  };

  try {
    frame.contentWindow.postMessage(payload, '*');
  } catch (error) {
    console.warn('Gagal kirim launch context ke game iframe:', error);
  }
}

function openGameFrame(url) {
  const layer = $('game-frame-layer');
  const frame = $('game-frame');

  if (!layer || !frame) {
    location.href = url;
    return;
  }

  const target = url || '../game/spy/spy.html';
  const context = getCurrentLaunchContext();

  // Tampilkan layer dulu. CSS .game-frame-layer.open wajib ada di home.css.
  layer.classList.add('open');
  layer.setAttribute('aria-hidden', 'false');
  document.body.classList.add('game-frame-open');
  if ($('menuPanel')?.classList.contains('active')) setMenu(false);

  const currentAttr = frame.getAttribute('src') || '';
  const currentAbs = frame.src || currentAttr;
  const blank = !currentAttr || currentAttr === 'about:blank' || currentAbs === 'about:blank';
  const samePage = !blank && isSameFramePage(currentAbs, target);

  frame.dataset.currentGame = context?.gameId || 'spy';

  if (!samePage) {
    const onLoad = () => {
      sendGameLaunch(frame, target, context);
      setTimeout(() => sendGameLaunch(frame, target, context), 140);
    };

    frame.addEventListener('load', onLoad, { once: true });
    frame.src = target;
    return;
  }

  // Spy sudah dipreload, jadi jangan reset src. Cukup kirim context.
  sendGameLaunch(frame, target, context);
  setTimeout(() => sendGameLaunch(frame, target, context), 140);
}

function closeGameFrame() {
  const layer = $('game-frame-layer');
  const frame = $('game-frame');

  if (!layer || !frame) return;

  layer.classList.remove('open');
  layer.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('game-frame-open');
  // Jangan reset ke about:blank. Spy dipreload supaya buka game stabil seperti Music.
  // Nanti kalau game lain sudah direbuild, src akan diganti saat tombol game lain dibuka.
  if ((frame.getAttribute('src') || '').includes('game/spy/spy.html')) {
    return;
  }

  frame.src = '../game/spy/spy.html';
}

function bindMusicFrameMessages() {
  window.addEventListener('message', event => {
    const data = event.data;
    const shouldClose = data === 'music:close' || data?.type === 'gamedex:music:close';

    if (shouldClose) closeMusicFrame();
  });
}

function bindGameFrameMessages() {
  window.addEventListener('message', event => {
    const data = event.data;
    const shouldClose =
      data === 'game:close' ||
      data === 'gamedex:closeGameFrame' ||
      data?.type === 'gamedex:closeGameFrame' ||
      data?.type === 'gamedex:game:close' ||
      data?.type === 'gamedex:gameFrame:close';

    if (shouldClose) {
      closeGameFrame();
      return;
    }

    if (data?.type === 'gamedex:navigate' && data.url) {
      location.href = GameDex.resolvePath(data.url);
    }
  });
}

function openItem(item, type) {
  const launcherItem = isMusicItem(item, type) ? localMusicTool(item) : (type === 'game' ? normalizeLauncherGame(item) : item);
  const status = GameDex.normalizeStatus(launcherItem?.status);

  if (status !== 'READY') {
    GameDex.toast(blockedMessage(launcherItem));
    return;
  }

  if (launcherItem.requiresLogin && !GameDex.isLoggedIn()) {
    GameDex.toast(`${launcherItem.title || 'Game ini'} wajib login dulu.`);

    setTimeout(() => {
      location.href = `login.html?next=${encodeURIComponent(launcherItem.id || '')}`;
    }, 700);

    return;
  }

  const ctx = GameDex.setLaunchContext(launcherItem);

  if (launcherItem.id === 'spy') {
    localStorage.setItem('whos_spy_default_name', ctx.playerName);
  }

  if (!launcherItem.url) {
    GameDex.toast('Belum ada target URL. Edit dari Admin Panel dulu.');
    return;
  }

  const target = isMusicItem(launcherItem, type)
    ? GameDex.resolvePath(getMusicDefaultPath())
    : GameDex.resolvePath(launcherItem.url);

  if (isMusicItem(launcherItem, type)) {
    openMusicFrame(target);
    return;
  }

  if (type === 'game' && cfg().features?.enableGameOpen !== true) {
    GameDex.toast('Game open masih dimatikan di config.');
    return;
  }

  const sep = target.includes('?') ? '&' : '?';
  const suffix = type === 'game'
    ? `${sep}name=${encodeURIComponent(ctx.playerName)}${ctx.uid ? '&uid=' + encodeURIComponent(ctx.uid) : ''}`
    : '';

  if (type === 'game') {
    openGameFrame(target + suffix);
    return;
  }

  location.href = target + suffix;
}

function getGameList() {
  return (cfg().games || []).map(normalizeLauncherGame);
}

function renderGames() {
  const list = getGameList();
  const box = $('gamesList');

  if (!box) return;

  box.innerHTML = list.map(game => renderLauncherButton(game, 'game')).join('');
  $('gameCount').textContent = GameDex.countLabel(list.length, 'GAME');

  box.querySelectorAll('.game-button').forEach(btn => {
    const game = list.find(item => String(item.id) === String(btn.dataset.id));
    btn.addEventListener('click', () => openItem(game || {}, 'game'));
  });
}

function getToolList() {
  const conf = cfg();
  const defaultTools = Array.isArray(window.GAMEDEX_CONFIG?.tools) ? window.GAMEDEX_CONFIG.tools : [];
  const remoteTools = Array.isArray(conf.tools) ? conf.tools : [];
  const rawTools = [...remoteTools];

  defaultTools.forEach(defaultTool => {
    const exists = rawTools.some(tool => String(tool.id || '').toLowerCase() === String(defaultTool.id || '').toLowerCase());
    if (!exists) rawTools.push(defaultTool);
  });

  const withoutMusic = rawTools.filter(tool => String(tool.id || '').toLowerCase() !== 'music');

  // Music dipaksa lokal supaya tidak ikut status/url lama dari Firestore.
  // Jadi tombol Music tetap muncul walaupun Firestore belum punya field tools.
  if (window.GAMEDEX_CONFIG?.music?.enabled !== false) {
    const source = rawTools.find(tool => String(tool.id || '').toLowerCase() === 'music');
    return [...withoutMusic, localMusicTool(source)];
  }

  return withoutMusic;
}

function renderTools() {
  const box = $('toolsList');
  const count = $('toolCount');

  if (!box) return;

  const list = getToolList();
  box.innerHTML = list.map(tool => renderLauncherButton(tool, 'tool')).join('');

  if (count) count.textContent = `${list.length} TOOLS`;

  box.querySelectorAll('.tool-button').forEach(btn => {
    const tool = list.find(item => String(item.id) === String(btn.dataset.id));
    btn.addEventListener('click', () => openItem(tool || {}, 'tool'));
  });
}

function setMenu(open) {
  $('menuBtn').classList.toggle('active', open);
  $('menuBtn').setAttribute('aria-expanded', String(open));
  $('menuPanel').classList.toggle('active', open);
  $('menuPanel').setAttribute('aria-hidden', String(!open));
}

function renderMaintenanceIfNeeded() {
  const conf = cfg();
  const maintenance = conf.maintenance || {};
  const active = maintenance.enabled && !GameDex.isAdmin();

  $('appShell').classList.toggle('hidden', active);
  $('maintenanceView').classList.toggle('hidden', !active);

  if (!active) return;

  $('maintenanceView').innerHTML = `
    <main class="maintenance-shell">
      <section class="maintenance-card">
        <img class="maintenance-logo" data-app-logo src="${safe(GameDex.resolvePath(conf.assets?.logo || 'assets/images/app-logo.png'))}" alt="${safe(conf.app?.name || 'GameDex')} logo">
        <span class="chip chip-red">Maintenance</span>
        <h1>${safe(maintenance.title || 'GameDex Sedang Maintenance')}</h1>
        <p>${safe(maintenance.message || 'Launcher sedang dirapikan. Silakan kembali lagi nanti.')}</p>
        <div class="maintenance-actions">
          <a class="btn btn-purple" href="login.html">LOGIN</a>
        </div>
      </section>
    </main>
  `;
}

window.logoutUser = async function logoutUser() {
  if (!GameDex.getUser()) return;

  if (window.GameDexFirebase) await GameDexFirebase.signOut();
  else GameDex.logout();

  GameDex.toast('Logout berhasil. Sekarang mode Guest.');
  renderProfile();
  renderGames();
  renderTools();
  renderMaintenanceIfNeeded();
};

function renderHomeUI() {
  GameDex.applyBrand();
  renderMaintenanceIfNeeded();
  renderProfile();
  renderGlobal();
  renderGames();
  renderTools();
}

function syncFirebaseSettingsBackground() {
  if (!window.GameDexFirebase) return;
  if (!GameDexFirebase.firestoreEnabled?.()) return;

  Promise.race([
    GameDexFirebase.syncSettingsFromFirestore(),
    new Promise(resolve => setTimeout(() => resolve(null), 2500))
  ])
    .then(remote => {
      if (!remote) return;
      renderHomeUI();
    })
    .catch(err => {
      console.warn('Firebase background sync gagal:', err);
    });
}

function bindHomeEvents() {
  $('menuBtn')?.addEventListener('click', () => {
    setMenu(!$('menuBtn').classList.contains('active'));
  });

  $('authBtn')?.addEventListener('click', event => {
    if (GameDex.getUser()) {
      event.preventDefault();
      logoutUser();
    }
  });

  $('loginMenuLink')?.addEventListener('click', event => {
    if (GameDex.getUser()) {
      event.preventDefault();
      logoutUser();
      setMenu(false);
    }
  });

  document.addEventListener('click', event => {
    if (
      $('menuPanel') &&
      $('menuBtn') &&
      !$('menuPanel').contains(event.target) &&
      !$('menuBtn').contains(event.target)
    ) {
      setMenu(false);
    }
  });

  document.querySelectorAll('.menu-link').forEach(link => {
    link.addEventListener('click', () => setMenu(false));
  });
}

function initHome() {
  if (!ensureGameDexReady()) {
    window.__gamedexHomeRetry = (window.__gamedexHomeRetry || 0) + 1;

    if (window.__gamedexHomeRetry <= 30) {
      setTimeout(initHome, 100);
      return;
    }

    console.error('GameDex is not defined. Pastikan app.config.js dan core.js dimuat sebelum home.js.');
    showCoreLoadError();
    return;
  }

  renderHomeUI();
  bindMusicFrameMessages();
  bindGameFrameMessages();
  bindHomeEvents();

  // Firebase tetap aktif, tapi tidak boleh menghambat tombol Music.
  syncFirebaseSettingsBackground();
}

window.addEventListener('load', initHome);
