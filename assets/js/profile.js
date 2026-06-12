function $(id){ return document.getElementById(id); }
function safe(v){ return GameDex.safeText(v); }
let avatarData = '';

function renderAvatar(profile){
  const el = $('avatarPreview');
  const src = profile.avatar || '';
  if(src) el.innerHTML = `<img src="${safe(src)}" alt="Avatar">`;
  else el.innerHTML = `<span class="initial">${safe((profile.name || 'G').trim()[0] || 'G')}</span>`;
}
function fillProfileForm(){
  const user = GameDex.getUser();
  const profile = GameDex.getProfile();
  avatarData = profile.avatar || '';
  $('nameInput').value = profile.name || '';
  $('usernameInput').value = profile.username || '';
  $('bioInput').value = profile.bio || '';
  $('avatarUrl').value = profile.avatar && String(profile.avatar).startsWith('http') ? profile.avatar : '';
  $('displayNamePreview').textContent = profile.name || 'Guest';
  $('displayUsernamePreview').textContent = profile.username || '@guest';
  $('profileModeText').textContent = user?.email ? 'Firebase Account' : 'Guest Profile';
  $('loginBadge').textContent = user?.email ? (GameDex.isAdmin() ? 'Admin' : 'User') : 'Guest';
  $('loginBadge').className = 'chip ' + (GameDex.isAdmin() ? 'chip-green' : user?.email ? '' : 'chip-red');
  $('uidText').textContent = user?.uid ? user.uid : 'Guest tidak punya UID';
  $('loginStateText').textContent = user?.email
    ? `Login sebagai ${user.email}. Tekan logout kalau mau kembali ke Guest atau pindah akun.`
    : 'Kamu sedang masuk sebagai Guest. Guest bisa edit profil lokal, tapi tidak dibuatkan UID.';
  $('logoutBtn').classList.toggle('hidden', !user?.email);
  $('topLogoutBtn').classList.toggle('hidden', !user?.email);
  renderAvatar(profile);
}
function previewFromInputs(){
  const name = $('nameInput').value.trim() || 'Guest';
  const username = $('usernameInput').value.trim() || '@guest';
  const avatarUrl = $('avatarUrl').value.trim();
  const profile = { name, username, avatar: avatarUrl || avatarData };
  $('displayNamePreview').textContent = name;
  $('displayUsernamePreview').textContent = username;
  renderAvatar(profile);
}
window.pickProfileAvatar = function(input){
  const file = input.files && input.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    avatarData = reader.result;
    $('avatarUrl').value = '';
    previewFromInputs();
    GameDex.toast('Avatar siap disimpan.');
  };
  reader.readAsDataURL(file);
};
window.resetProfileForm = function(){ fillProfileForm(); GameDex.toast('Form dikembalikan.'); };
window.saveProfilePage = async function(){
  const user = GameDex.getUser();
  const name = $('nameInput').value.trim() || (user?.email ? user.email.split('@')[0] : 'Guest');
  let username = $('usernameInput').value.trim() || (user?.email ? '@' + user.email.split('@')[0] : '@guest');
  if(username && !username.startsWith('@')) username = '@' + username;
  const avatarUrl = $('avatarUrl').value.trim();
  const profile = GameDex.setProfile({
    name,
    username,
    bio: $('bioInput').value.trim() || 'Siap main di GameDex.',
    avatar: avatarUrl || avatarData || ''
  });
  if(user?.email && window.GameDexFirebase){
    try{ await GameDexFirebase.updateAuthProfile(profile); }catch{}
  }
  fillProfileForm();
  GameDex.toast(user?.email ? 'Profile akun disimpan.' : 'Profile Guest disimpan tanpa UID.');
};
window.logoutProfile = async function(){
  if(!GameDex.getUser()?.email) return;
  if(window.GameDexFirebase) await GameDexFirebase.signOut();
  else GameDex.logout();
  GameDex.toast('Logout berhasil. Sekarang mode Guest.');
  setTimeout(()=>location.href='home.html', 550);
};
window.addEventListener('load', () => {
  GameDex.applyBrand();
  fillProfileForm();
  ['nameInput','usernameInput','avatarUrl'].forEach(id => $(id).addEventListener('input', previewFromInputs));
});
