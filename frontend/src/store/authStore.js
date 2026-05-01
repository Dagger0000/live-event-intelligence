import { create } from "zustand";
import api from "../lib/api";

export const useAuthStore = create((set, get) => ({
  user: JSON.parse(localStorage.getItem("user") || "null"),
  token: localStorage.getItem("token") || null,
  isLoading: false,
  error: null,

  login: async (email, password) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.post("/api/auth/login", { email, password });
      localStorage.setItem("token", data.access_token);
      localStorage.setItem("user", JSON.stringify({
        id: data.user_id, role: data.role, username: data.username,
      }));
      set({ token: data.access_token, user: { id: data.user_id, role: data.role, username: data.username }, isLoading: false });
      return true;
    } catch (e) {
      set({ error: e.response?.data?.detail || "Login failed", isLoading: false });
      return false;
    }
  },

  register: async (payload) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.post("/api/auth/register", payload);
      localStorage.setItem("token", data.access_token);
      localStorage.setItem("user", JSON.stringify({
        id: data.user_id, role: data.role, username: data.username,
      }));
      set({ token: data.access_token, user: { id: data.user_id, role: data.role, username: data.username }, isLoading: false });
      return true;
    } catch (e) {
      set({ error: e.response?.data?.detail || "Registration failed", isLoading: false });
      return false;
    }
  },

  logout: () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    set({ token: null, user: null });
  },

  clearError: () => set({ error: null }),
}));
