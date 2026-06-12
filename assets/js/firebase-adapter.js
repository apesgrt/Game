(function(){
  let firebaseApp = null;
  let firebaseAuth = null;
  let firebaseDb = null;
  let libs = null;
  let readyPromise = null;

  function config(){ return window.GAMEDEX_FIREBASE_CONFIG || {}; }
  function firebaseConfig(){ return config().firebaseConfig || {}; }
  function hasFirebaseConfig(){
    const c = firebaseConfig();
    return !!(config().enabled && c.apiKey && c.authDomain && c.projectId && c.appId);
  }
  function firestoreEnabled(){ return !!(hasFirebaseConfig() && config().firestore?.enabled); }
  function moduleUrl(name){
    const version = config().sdkVersion || '10.12.5';
    return `https://www.gstatic.com/firebasejs/${version}/${name}.js`;
  }
  async function load(){
    if(readyPromise) return readyPromise;
    readyPromise = (async () => {
      if(!hasFirebaseConfig()) throw new Error('Firebase belum aktif atau config belum lengkap.');
      const appLib = await import(moduleUrl('firebase-app'));
      const authLib = await import(moduleUrl('firebase-auth'));
      let firestoreLib = null;
      if(config().firestore?.enabled){ firestoreLib = await import(moduleUrl('firebase-firestore')); }
      libs = { appLib, authLib, firestoreLib };
      firebaseApp = appLib.getApps().length ? appLib.getApps()[0] : appLib.initializeApp(firebaseConfig());
      firebaseAuth = authLib.getAuth(firebaseApp);
      try{ await authLib.setPersistence(firebaseAuth, authLib.browserLocalPersistence); }catch{}
      if(firestoreLib && config().firestore?.enabled){ firebaseDb = firestoreLib.getFirestore(firebaseApp); }
      return { app: firebaseApp, auth: firebaseAuth, db: firebaseDb, libs };
    })();
    return readyPromise;
  }
  function settingsCollection(){ return config().firestore?.collections?.settings || 'settings'; }
  function settingsDocId(){ return config().firestore?.settingsDocId || 'public'; }
  function cleanRemoteSettings(data){
    if(!data) return null;
    if(data.config && typeof data.config === 'object') return data.config;
    const clone = Object.assign({}, data);
    delete clone.updatedAt;
    delete clone.updatedBy;
    delete clone.updatedByEmail;
    return clone;
  }
  async function loadSettingsFromFirestore(){
    if(!firestoreEnabled()) return null;
    const ctx = await load();
    if(!ctx.db || !ctx.libs.firestoreLib) return null;
    const { doc, getDoc } = ctx.libs.firestoreLib;
    const snap = await getDoc(doc(ctx.db, settingsCollection(), settingsDocId()));
    if(!snap.exists()) return null;
    const remote = cleanRemoteSettings(snap.data());
    if(remote) GameDex.setRemoteSettingsCache(remote);
    return remote;
  }
  async function saveSettingsToFirestore(configData){
    if(!firestoreEnabled()) return false;
    const ctx = await load();
    if(!ctx.db || !ctx.libs.firestoreLib) return false;
    const { doc, setDoc, serverTimestamp } = ctx.libs.firestoreLib;
    const user = GameDex.getUser();
    await setDoc(doc(ctx.db, settingsCollection(), settingsDocId()), {
      config: configData,
      updatedAt: serverTimestamp(),
      updatedBy: user?.uid || '',
      updatedByEmail: user?.email || ''
    }, { merge: true });
    GameDex.setRemoteSettingsCache(configData);
    return true;
  }
  async function syncSettingsFromFirestore(){
    try{ return await loadSettingsFromFirestore(); }
    catch(err){ console.warn('Firestore settings sync gagal:', err); return null; }
  }
  async function saveUserDocument(user){
    if(!firestoreEnabled() || !user?.uid) return false;
    const ctx = await load();
    if(!ctx.db || !ctx.libs.firestoreLib) return false;
    const { doc, setDoc, serverTimestamp } = ctx.libs.firestoreLib;
    const usersCol = config().firestore?.collections?.users || 'users';
    await setDoc(doc(ctx.db, usersCol, user.uid), {
      uid: user.uid,
      name: user.name || '',
      email: user.email || '',
      photoURL: user.photoURL || '',
      role: user.role || 'user',
      provider: user.provider || '',
      lastLoginAt: serverTimestamp()
    }, { merge: true });
    return true;
  }
  async function saveProfileDocument(profile){
    const user = GameDex.getUser();
    if(!firestoreEnabled() || !user?.uid) return false;
    const ctx = await load();
    if(!ctx.db || !ctx.libs.firestoreLib) return false;
    const { doc, setDoc, serverTimestamp } = ctx.libs.firestoreLib;
    const profilesCol = config().firestore?.collections?.profiles || 'profiles';
    await setDoc(doc(ctx.db, profilesCol, user.uid), {
      uid: user.uid,
      email: user.email || '',
      name: profile?.name || '',
      username: profile?.username || '',
      bio: profile?.bio || '',
      avatar: profile?.avatar || '',
      updatedAt: serverTimestamp()
    }, { merge: true });
    return true;
  }
  function toGameDexUser(firebaseUser, provider){
    const email = GameDex.normalizeEmail(firebaseUser.email || '');
    return {
      uid: firebaseUser.uid,
      name: firebaseUser.displayName || (email ? email.split('@')[0] : 'Player'),
      email,
      photoURL: firebaseUser.photoURL || '',
      role: GameDex.resolveRole(email, provider),
      provider,
      loggedAt: new Date().toISOString()
    };
  }
  async function prepareRoleFromRemote(){
    try{ await syncSettingsFromFirestore(); }catch{}
  }
  async function signInEmail(email, password, name, mode){
    const ctx = await load();
    let credential;
    if(mode === 'register'){
      credential = await ctx.libs.authLib.createUserWithEmailAndPassword(ctx.auth, email, password);
      if(name){
        try{ await ctx.libs.authLib.updateProfile(credential.user, { displayName: name }); }catch{}
      }
    }else{
      credential = await ctx.libs.authLib.signInWithEmailAndPassword(ctx.auth, email, password);
    }
    await prepareRoleFromRemote();
    const user = toGameDexUser(credential.user, 'firebase-email');
    if(name && !user.name) user.name = name;
    GameDex.setUser(user);
    saveUserDocument(user).catch(()=>{});
    return user;
  }
  async function signInGoogle(){
    const ctx = await load();
    const provider = new ctx.libs.authLib.GoogleAuthProvider();
    provider.addScope('profile');
    provider.addScope('email');
    provider.setCustomParameters({ prompt: 'select_account' });
    const credential = await ctx.libs.authLib.signInWithPopup(ctx.auth, provider);
    await prepareRoleFromRemote();
    const user = toGameDexUser(credential.user, 'firebase-google');
    GameDex.setUser(user);
    saveUserDocument(user).catch(()=>{});
    return user;
  }
  async function updateAuthProfile(profile){
    if(!hasFirebaseConfig()) return false;
    const ctx = await load();
    const current = ctx.auth.currentUser;
    if(!current) return false;
    const payload = {};
    if(profile?.name) payload.displayName = profile.name;
    if(profile?.avatar && String(profile.avatar).startsWith('http')) payload.photoURL = profile.avatar;
    if(Object.keys(payload).length){ await ctx.libs.authLib.updateProfile(current, payload); }
    saveProfileDocument(profile).catch(()=>{});
    return true;
  }
  async function signOut(){
    try{
      if(hasFirebaseConfig()){
        const ctx = await load();
        await ctx.libs.authLib.signOut(ctx.auth);
      }
    }catch{}
    GameDex.logout();
  }
  function friendlyError(error){
    const code = error?.code || '';
    if(code.includes('permission-denied')) return 'Firestore ditolak rules. Cek FIRESTORE_SETUP.md.';
    if(code.includes('invalid-email')) return 'Format email belum benar.';
    if(code.includes('user-not-found')) return 'Email belum terdaftar.';
    if(code.includes('wrong-password') || code.includes('invalid-credential')) return 'Email atau password salah.';
    if(code.includes('email-already-in-use')) return 'Email ini sudah terdaftar.';
    if(code.includes('weak-password')) return 'Password terlalu lemah, minimal 6 karakter.';
    if(code.includes('popup-closed-by-user')) return 'Login Google dibatalkan.';
    if(code.includes('popup-blocked')) return 'Popup Google diblokir browser.';
    if(code.includes('operation-not-allowed')) return 'Provider login belum diaktifkan di Firebase Console.';
    return error?.message || 'Login gagal. Cek config Firebase.';
  }

  window.GameDexFirebase = {
    hasFirebaseConfig,
    firestoreEnabled,
    load,
    syncSettingsFromFirestore,
    loadSettingsFromFirestore,
    saveSettingsToFirestore,
    saveUserDocument,
    saveProfileDocument,
    signInEmail,
    signInGoogle,
    signOut,
    updateAuthProfile,
    friendlyError
  };
})();
