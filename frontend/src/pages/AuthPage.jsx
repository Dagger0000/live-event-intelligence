import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Zap, Eye, EyeOff, AlertCircle } from "lucide-react";
import { useAuthStore } from "../store/authStore";
import { Spinner } from "../components/ui/index.jsx";

export default function AuthPage() {
  const [mode, setMode] = useState("login");
  const [showPw, setShowPw] = useState(false);
  const [form, setForm] = useState({
    email: "", username: "", password: "", role: "viewer",
    notify_commentary: true, notify_analysis: true, notify_alerts: true,
  });
  const { login, register, isLoading, error, clearError } = useAuthStore();
  const navigate = useNavigate();

  const set = (k, v) => { clearError(); setForm(f => ({ ...f, [k]: v })); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const ok = mode === "login"
      ? await login(form.email, form.password)
      : await register(form);
    if (ok) navigate("/events");
  };

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-10 h-10 bg-brand-500 rounded-xl flex items-center justify-center">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-white font-bold text-xl leading-none">LiveIQ</p>
            <p className="text-gray-500 text-sm">Sports Intelligence Platform</p>
          </div>
        </div>

        <div className="card">
          {/* Tab switcher */}
          <div className="flex bg-surface rounded-lg p-1 mb-6">
            {["login", "register"].map((m) => (
              <button key={m} onClick={() => { setMode(m); clearError(); }}
                className={`flex-1 py-2 rounded-md text-sm font-medium capitalize transition-colors ${
                  mode === m ? "bg-brand-500 text-white" : "text-gray-400 hover:text-white"
                }`}>
                {m === "login" ? "Sign In" : "Sign Up"}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="flex items-center gap-2 text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 text-sm">
                <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
              </div>
            )}

            <div>
              <label className="block text-sm text-gray-400 mb-1">Email</label>
              <input className="input" type="email" placeholder="you@example.com"
                value={form.email} onChange={e => set("email", e.target.value)} required />
            </div>

            {mode === "register" && (
              <div>
                <label className="block text-sm text-gray-400 mb-1">Username</label>
                <input className="input" placeholder="johndoe"
                  value={form.username} onChange={e => set("username", e.target.value)} required />
              </div>
            )}

            <div>
              <label className="block text-sm text-gray-400 mb-1">Password</label>
              <div className="relative">
                <input className="input pr-10" type={showPw ? "text" : "password"} placeholder="••••••••"
                  value={form.password} onChange={e => set("password", e.target.value)} required />
                <button type="button" onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white">
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {mode === "register" && (
              <>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Role</label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { v: "viewer",  label: "Viewer",  desc: "Read-only, 3 subs" },
                      { v: "analyst", label: "Analyst", desc: "Full access + alerts" },
                    ].map(({ v, label, desc }) => (
                      <button key={v} type="button" onClick={() => set("role", v)}
                        className={`p-3 rounded-lg border text-left transition-colors ${
                          form.role === v ? "border-brand-500 bg-brand-500/10" : "border-border hover:border-gray-500"
                        }`}>
                        <p className="text-white text-sm font-medium">{label}</p>
                        <p className="text-gray-500 text-xs mt-0.5">{desc}</p>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-2">Notifications</label>
                  <div className="space-y-2">
                    {[
                      { k: "notify_commentary", label: "Groq Commentary" },
                      { k: "notify_analysis",   label: "Gemini Analysis" },
                      { k: "notify_alerts",     label: "Alert Triggers" },
                    ].map(({ k, label }) => (
                      <label key={k} className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={form[k]}
                          onChange={e => set(k, e.target.checked)}
                          className="w-4 h-4 accent-blue-500 rounded" />
                        <span className="text-sm text-gray-300">{label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </>
            )}

            <button type="submit" disabled={isLoading} className="btn-primary w-full flex items-center justify-center gap-2 mt-2">
              {isLoading ? <Spinner size="sm" /> : null}
              {mode === "login" ? "Sign In" : "Create Account"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
