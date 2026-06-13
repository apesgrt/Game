(function(){
  const STORAGE = {
    user: 'gamedex_user_base',
    profile: 'gamedex_profile_base',
    adminSettings: 'gamedex_admin_settings_v2',
    launchContext: 'gamedex_launch_context',
    remoteSettingsCache: 'gamedex_remote_settings_cache_v1'
  };

  function isObject(value){ return value && typeof value === 'object' && !Array.isArray(value); }
  function clone(value){ return JSON.parse(JSON.stringify(value || {})); }
  function mergeDeep(target, source){
    const out = clone(target);
    Object.keys(source || {}).forEach(key => {
      if(isObject(source[key]) && isObject(out[key])) out[key] = mergeDeep(out[key], source[key]);
      else out[key] = source[key];
    });
    return out;
  }
  function readJSON(key, fallback){
    try{ const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
    catch{ return fallback; }
  }
  function writeJSON(key, value){ localStorage.setItem(key, JSON.stringify(value)); }
  function getDefaultConfig(){ return clone(window.GAMEDEX_CONFIG || {}); }
  function getLocalSettings(){ return readJSON(STORAGE.adminSettings, null); }
  function getRemoteSettingsCache(){ return readJSON(STORAGE.remoteSettingsCache, null); }
  function setRemoteSettingsCache(value){ if(value) writeJSON(STORAGE.remoteSettingsCache, value); }
  function getConfig(){
    const base = getDefaultConfig();
    const remote = getRemoteSettingsCache() || {};
    const local = getLocalSettings() || {};
    return mergeDeep(mergeDeep(base, remote), local);
  }
  function saveSettings(partial){
    const current = getConfig();
    const merged = mergeDeep(current, partial || {});
    writeJSON(STORAGE.adminSettings, merged);
    return merged;
  }
  function resetSettings(){ localStorage.removeItem(STORAGE.adminSettings); }
  function clearRemoteCache(){ localStorage.removeItem(STORAGE.remoteSettingsCache); }
  function normalizeEmail(email){ return String(email || '').trim().toLowerCase(); }
  function getAdminEmails(){
    const cfg = getConfig();
    const appEmails = cfg.admin?.adminEmails || cfg.admin?.emails || [];
    const firebaseEmails = window.GAMEDEX_FIREBASE_CONFIG?.adminEmails || [];
    return [...appEmails, ...firebaseEmails].map(normalizeEmail).filter(Boolean);
  }
  function isAdminEmail(email){
    const normalized = normalizeEmail(email);
    return !!normalized && getAdminEmails().includes(normalized);
  }
  function resolveRole(email, provider){
    const cfg = getConfig();
    const localAllowed = cfg.admin?.enableLocalAdminFallback === true;
    const isTrustedProvider = String(provider || '').startsWith('firebase');
    return (isTrustedProvider || localAllowed) && isAdminEmail(email) ? 'admin' : 'user';
  }
  function getUser(){ return readJSON(STORAGE.user, null); }
  function setUser(user){
    const normalized = Object.assign({}, user || {});
    normalized.email = normalizeEmail(normalized.email);
    if(!normalized.uid) delete normalized.uid;
    normalized.role = normalized.role || resolveRole(normalized.email, normalized.provider);
    writeJSON(STORAGE.user, normalized);
  }
  function logout(){ localStorage.removeItem(STORAGE.user); }
  function isLoggedIn(){ return !!getUser()?.email; }
  function isGuest(){ return !isLoggedIn(); }
  function isAdmin(){ return getUser()?.role === 'admin'; }
  function getProfileKey(){
    const user = getUser();
    if(!user?.uid) return STORAGE.profile + '_guest';
    return STORAGE.profile + '_' + user.uid;
  }
  function getProfile(){
    const cfg = getConfig();
    const user = getUser();
    const saved = readJSON(getProfileKey(), {});
    const isUser = !!user?.email;
    const base = {
      uid: isUser ? (user.uid || '') : '',
      name: isUser ? (user.name || user.email.split('@')[0]) : (cfg.app?.defaultUserName || 'Guest'),
      username: isUser ? ('@' + user.email.split('@')[0]) : '@guest',
      bio: isUser ? 'Siap main di GameDex.' : 'Guest mode. Login untuk menyimpan UID akun.',
      avatar: isUser ? (user.photoURL || '') : '',
      email: isUser ? user.email : '',
      provider: isUser ? (user.provider || '') : 'guest'
    };
    const profile = Object.assign(base, saved || {});
    if(!isUser){ profile.uid = ''; profile.email = ''; profile.provider = 'guest'; }
    return profile;
  }
  function setProfile(profile){
    const user = getUser();
    const clean = Object.assign({}, profile || {});
    if(user?.email){
      clean.uid = user.uid || '';
      clean.email = user.email;
      clean.provider = user.provider || '';
    }else{
      delete clean.uid;
      delete clean.email;
      clean.provider = 'guest';
    }
    writeJSON(getProfileKey(), clean);
    return clean;
  }
  function safeText(value){
    return String(value ?? '').replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
  }
  function isExternalPath(path){ return /^(https?:|data:|blob:|mailto:|tel:)/i.test(String(path || '')); }
  function isInAula(){ return /\/aula\//.test(location.pathname) || location.pathname.endsWith('/aula') || location.pathname.includes('aula/'); }
  function resolvePath(path){
    const raw = String(path || '');
    if(!raw || isExternalPath(raw) || raw.startsWith('#')) return raw;
    if(raw.startsWith('../') || raw.startsWith('./') || raw.startsWith('/')) return raw;
    if(isInAula() && /^(assets|config|game|tools)\//.test(raw)) return '../' + raw;
    return raw;
  }
  function iconPath(icon){
    const cfg = getConfig();
    if(!icon) return resolvePath(cfg.assets?.fallbackGameIcon || 'assets/images/game-icons/default.png');
    const text = String(icon);
    if(text.includes('/') || text.startsWith('data:') || text.startsWith('http')) return resolvePath(text);
    return resolvePath((cfg.assets?.gameIconFolder || 'assets/images/game-icons/') + text + (cfg.assets?.iconExtension || '.png'));
  }
  function applyBrand(){
    const cfg = getConfig();
    const logo = resolvePath(cfg.assets?.logo || 'assets/images/app-logo.png');
    document.querySelectorAll('[data-app-logo]').forEach(img => { img.src = logo; });
    document.querySelectorAll('[data-app-name]').forEach(el => { el.textContent = cfg.app?.name || 'GameDex'; });
    document.querySelectorAll('[data-app-subtitle]').forEach(el => { el.textContent = cfg.app?.subtitle || 'Mobile Launcher'; });
    document.querySelectorAll('[data-app-tagline]').forEach(el => { el.textContent = cfg.app?.tagline || cfg.app?.subtitle || 'Mobile Launcher'; });
    document.title = (cfg.app?.name || 'GameDex') + (document.body?.dataset?.page ? ' - ' + document.body.dataset.page : '');
  }
  function getPlayerName(){
    const profile = getProfile();
    return (profile.name || '').trim() || (isLoggedIn() ? 'Player' : 'Guest');
  }
  function setLaunchContext(game){
    const profile = getProfile();
    const user = getUser();
    const data = {
      gameId: game?.id || '',
      gameTitle: game?.title || game?.id || '',
      playerName: getPlayerName(),
      username: profile.username || '',
      uid: user?.uid || '',
      email: user?.email || '',
      loggedIn: !!user?.email,
      createdAt: new Date().toISOString()
    };
    writeJSON(STORAGE.launchContext, data);
    return data;
  }
  function normalizeStatus(status){
    const s = String(status || 'REBUILD').trim().toUpperCase();
    return ['REBUILD','UPDATE','READY'].includes(s) ? s : 'REBUILD';
  }
  function canOpenItem(item){ return normalizeStatus(item?.status) === 'READY'; }
  function countLabel(count, word){ return `${Number(count || 0)} ${word || 'GAME'}`; }
  function toast(text){
    const el = document.getElementById('toast');
    if(!el) return;
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(window.__toastTimer);
    window.__toastTimer = setTimeout(()=>el.classList.remove('show'), 2500);
  }

  window.GameDex = {
    STORAGE,
    getDefaultConfig,
    getLocalSettings,
    getRemoteSettingsCache,
    setRemoteSettingsCache,
    clearRemoteCache,
    getConfig,
    saveSettings,
    resetSettings,
    normalizeEmail,
    getAdminEmails,
    isAdminEmail,
    resolveRole,
    getUser,
    setUser,
    logout,
    isLoggedIn,
    isGuest,
    isAdmin,
    getProfile,
    setProfile,
    getPlayerName,
    setLaunchContext,
    safeText,
    resolvePath,
    iconPath,
    applyBrand,
    normalizeStatus,
    canOpenItem,
    countLabel,
    toast,
    readJSON,
    writeJSON,
    mergeDeep
  };
})();
