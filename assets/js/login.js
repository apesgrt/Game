let mode = 'login';
function $(id){ return document.getElementById(id); }
function setMessage(text, type){
  const el = $('message');
  el.textContent = text;
  el.className = 'message ' + (type || '');
}
function setBusy(isBusy){
  $('submitBtn').disabled = isBusy;
  $('googleBtn').disabled = isBusy;
  $('submitBtn').textContent = isBusy ? 'PROCESS...' : (mode === 'register' ? 'REGISTER' : 'LOGIN');
}
function setTab(id, active){ $(id).classList.toggle('active', active); }
window.setMode = function(next){
  mode = next;
  setTab('tabLogin', mode === 'login');
  setTab('tabRegister', mode === 'register');
  $('nameGroup').style.display = mode === 'register' ? 'grid' : 'none';
  $('submitBtn').textContent = mode === 'register' ? 'REGISTER' : 'LOGIN';
  $('authTitle').textContent = mode === 'register' ? 'Create Account' : 'Login Account';
  $('authDesc').textContent = mode === 'register'
    ? 'Buat akun user. Kalau email ini terdaftar sebagai admin di config, role admin aktif setelah login Firebase.'
    : 'Masuk sebagai user biasa. Admin otomatis terbuka kalau email login cocok dengan daftar admin Firebase.';
  setMessage('', '');
};
window.togglePassword = function(){
  const input = $('passwordInput');
  const btn = document.querySelector('.show-pass');
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  btn.textContent = show ? 'HIDE' : 'SHOW';
};
function getNextTarget(user){
  const params = new URLSearchParams(location.search);
  const next = params.get('next');
  if(user?.role === 'admin') return 'settings.html';
  if(next) return 'home.html#games';
  return 'home.html';
}
function goAfterLogin(user){
  const target = getNextTarget(user);
  setTimeout(() => location.href = target, 650);
}
function localEmailFallback(email, name){
  const conf = GameDex.getConfig();
  const role = conf.admin?.enableLocalAdminFallback === true ? GameDex.resolveRole(email, 'local-dev') : 'user';
  const user = { name: name || email.split('@')[0], email, role, provider:'local-dev', loggedAt:new Date().toISOString() }; // fallback lokal tidak membuat UID
  GameDex.setUser(user);
  return user;
}
$('authForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = $('nameInput').value.trim();
  const email = GameDex.normalizeEmail($('emailInput').value);
  const password = $('passwordInput').value.trim();
  if(!email || !password){ setMessage('Email dan password wajib diisi.', 'error'); return; }
  if(password.length < 6){ setMessage('Password minimal 6 karakter.', 'error'); return; }
  setBusy(true);
  try{
    let user;
    if(GameDexFirebase.hasFirebaseConfig() && GameDex.getConfig().features?.enableFirebaseLogin !== false){
      user = await GameDexFirebase.signInEmail(email, password, name, mode);
      setMessage(user.role === 'admin' ? 'Login admin berhasil. Membuka panel...' : 'Login berhasil.', 'success');
    }else{
      user = localEmailFallback(email, name);
      setMessage('Login lokal berhasil. Isi Firebase config untuk login asli.', 'success');
    }
    goAfterLogin(user);
  }catch(err){
    setMessage(GameDexFirebase.friendlyError(err), 'error');
  }finally{
    setBusy(false);
  }
});
window.loginWithGoogle = async function(){
  if(!GameDexFirebase.hasFirebaseConfig()){
    setMessage('Google login butuh Firebase config aktif dulu.', 'error');
    return;
  }
  setBusy(true);
  try{
    const user = await GameDexFirebase.signInGoogle();
    setMessage(user.role === 'admin' ? 'Google admin berhasil. Membuka panel...' : 'Google login berhasil.', 'success');
    goAfterLogin(user);
  }catch(err){
    setMessage(GameDexFirebase.friendlyError(err), 'error');
  }finally{
    setBusy(false);
  }
};
window.addEventListener('load', () => {
  GameDex.applyBrand();
  setMode('login');
  const params = new URLSearchParams(location.search);
  if(params.get('next')) setMessage('Game ini butuh login dulu. Setelah login kamu bisa buka lagi dari Home.', '');
  const configured = GameDexFirebase.hasFirebaseConfig();
  $('adminHint').textContent = configured
    ? 'Firebase aktif. Admin akan dicek dari email yang login.'
    : 'Mode test lokal. Isi config/firebase.config.js untuk Email/Google login asli.';
});
