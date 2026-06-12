// GameDex Firebase Config
// 1) Buat project di Firebase Console.
// 2) Aktifkan Authentication > Sign-in method > Email/Password dan Google.
// 3) Copy const firebaseConfig dari Firebase, lalu paste ke object di bawah.

const firebaseConfig = {
  apiKey: "AIzaSyAAHiHYuCFfRk-UkUMDCrGgNIIpZQGN6Go",
  authDomain: "peswebb-98af2.firebaseapp.com",
  databaseURL: "https://peswebb-98af2-default-rtdb.firebaseio.com",
  projectId: "peswebb-98af2",
  storageBucket: "peswebb-98af2.firebasestorage.app",
  messagingSenderId: "876898601670",
  appId: "1:876898601670:web:d7267d232f81ad9c45e5c7",
  measurementId: "G-QY7DRCCD7Q"
};

window.GAMEDEX_FIREBASE_CONFIG = {
  // Ubah jadi true kalau firebaseConfig sudah diisi.
  enabled: true,

  // Versi SDK bisa kamu ganti nanti kalau perlu.
  sdkVersion: "10.12.5",

  firebaseConfig,

  auth: {
    emailPassword: true,
    googleProvider: true,
    redirectOnMobile: false
  },

  // Admin otomatis aktif kalau email login Firebase cocok dengan daftar ini.
  // Ganti contoh ini ke email Firebase kamu, misal: "hahahacees@gmail.com".
  adminEmails: [
    "hahahacees@gmail.com"
  ],

  firestore: {
    enabled: true,
    settingsDocId: "public",
    collections: {
      settings: "settings",
      users: "users",
      profiles: "profiles",
      games: "games",
      purchases: "purchases"
    }
  }
};
