// Isi bagian ini nanti kalau daftar game/profile mau diambil dari REST API.
window.GAMEDEX_REST_CONFIG = {
  enabled: false,
  baseUrl: "",
  endpoints: {
    login: "/auth/login",
    register: "/auth/register",
    profile: "/profile",
    games: "/games"
  },
  headers: {
    "Content-Type": "application/json"
  }
};
