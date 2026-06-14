window.GAMEDEX_CONFIG = {
  app: {
    name: "GameDex",
    subtitle: "game simple",
    tagline: "SIAP PAKAI",
    description: "Launcher game ringan, responsif, dan siap dipasang game hasil rebuild.",
    version: "base-0.9-iframe-spy-login-v11",
    defaultUserName: "Guest"
  },

  assets: {
    logo: "assets/images/app-logo.png",
    gameIconFolder: "assets/images/game-icons/",
    iconExtension: ".png",
    fallbackGameIcon: "assets/images/game-icons/default.png"
  },

  admin: {
    enabled: true,
    adminEmails: [
      "hahahacees@gmail.com"
    ],
    enableLocalAdminFallback: false
  },

  features: {
    enableLoginPage: true,
    enableLocalGuestProfile: true,
    enableFirebaseLogin: true,
    enableRestApi: false,
    enableGameOpen: true,
    enableMaintenance: true,
    enableAdminPanel: true,
    enableProfilePage: true,
    enableMusicBridge: true
  },

  music: {
    enabled: true,
    keepAliveFrameId: "gamedexMusicFrame",
    defaultPath: "tools/music/musik.html",
    mode: "local-only"
  },

  global: {
    welcomeTitle: "Selamat datang di GameDex",
    welcomeText: "Pilih game favorit kamu. Semua game sedang disiapkan untuk rebuild baru.",
    announcement: "GameDex sedang masuk tahap rebuild total. Tampilan, fitur, dan game akan dirapikan satu per satu.",
    showAnnouncement: true
  },

  maintenance: {
    enabled: false,
    title: "GameDex Sedang Maintenance",
    message: "Launcher sedang dirapikan. Silakan kembali lagi nanti.",
    showLoginButton: true
  },

  statusOptions: [
    "REBUILD",
    "UPDATE",
    "READY"
  ],

  games: [
    {
      id: "tictactoe",
      title: "Tic Tac Toe",
      description: "Classic XOXO game",
      icon: "tictactoe",
      status: "REBUILD",
      url: "game/tictactoe/index.html"
    },
    {
      id: "luncur",
      title: "Luncur",
      description: "Arcade slide game",
      icon: "luncur",
      status: "REBUILD",
      url: "game/luncur/index.html"
    },
    {
      id: "chess",
      title: "Chess",
      description: "Board strategy game",
      icon: "chess",
      status: "REBUILD",
      url: "game/chess/index.html"
    },
    {
      id: "racing",
      title: "Road Rush",
      description: "Racing arcade game",
      icon: "racing",
      status: "REBUILD",
      url: "game/racing/index.html"
    },
    {
      id: "blockblast",
      title: "Block Blast",
      description: "Puzzle block game",
      icon: "blockblast",
      status: "REBUILD",
      url: "game/blockblast/index.html"
    },
    {
      id: "pacman",
      title: "Pac-Man",
      description: "Maze chase game",
      icon: "pacman",
      status: "REBUILD",
      url: "game/pacman/index.html"
    },
    {
      id: "spaceshoot",
      title: "Space Shooter",
      description: "Shooter pesawat luar angkasa",
      icon: "spaceshoot",
      status: "REBUILD",
      url: "game/spaceshoot/index.html"
    },
    {
      id: "mahjong",
      title: "Mahjong",
      description: "Solitaire tile game",
      icon: "mahjong",
      status: "REBUILD",
      url: "game/mahjong/index.html"
    },
    {
      id: "spy",
      title: "Who's The Spy",
      description: "Online room game. Nama default mengikuti akun.",
      icon: "spy",
      status: "READY",
      url: "game/spy/spy.html",
      requiresLogin: true,
      defaultNameFromProfile: true
    }
  ],

  tools: [
    {
      id: "music",
      title: "Music",
      description: "Music Player lokal",
      icon: "music",
      status: "READY",
      url: "tools/music/musik.html",
      localOnly: true
    }
  ]
};
