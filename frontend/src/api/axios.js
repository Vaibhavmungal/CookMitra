import axios from "axios";

const API = axios.create({
  // Same-origin default: when the backend serves the built frontend (single
  // service deployment), "/api" just works. Separate-hosting deployments set
  // REACT_APP_API_URL at build time; local dev sets it in frontend/.env.
  baseURL: process.env.REACT_APP_API_URL || "/api",
  // Fail fast instead of hanging forever when the backend is unreachable —
  // hung requests pile up and make the app look frozen.
  timeout: 15000,
});

API.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

API.interceptors.response.use(
  (response) => response,
  (error) => {
    // Expired/invalid tokens bounce to login — except for login/register
    // attempts themselves, where a 401 is a form error ("Invalid
    // credentials") that must reach the page instead of reloading it.
    const url = error.config?.url || "";
    const isAuthForm =
      url.includes("/auth/login") ||
      url.includes("/auth/register") ||
      url.includes("/auth/google");
    if (error.response?.status === 401 && !isAuthForm) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

export default API;
