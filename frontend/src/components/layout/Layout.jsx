import { NavLink, useNavigate } from "react-router-dom";
import { clsx } from "clsx";
import {
  Zap, Calendar, Radio, Brain, Target,
  Bell, FileText, LayoutDashboard, LogOut, User
} from "lucide-react";
import { useAuthStore } from "../../store/authStore";
import { Badge } from "../ui/index.jsx";

const NAV = [
  { to: "/events",       icon: Calendar,       label: "Event Browser" },
  { to: "/predictions",  icon: Target,          label: "Prediction Board" },
  { to: "/alerts",       icon: Bell,            label: "Alert Manager", analystOnly: true },
  { to: "/admin",        icon: LayoutDashboard, label: "Admin Dashboard", analystOnly: true },
];

export function Layout({ children }) {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = () => { logout(); navigate("/login"); };

  return (
    <div className="flex h-screen bg-surface overflow-hidden">
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 bg-card border-r border-border flex flex-col">
        {/* Logo */}
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-brand-500 rounded-lg flex items-center justify-center">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-white font-bold text-sm leading-none">LiveIQ</p>
              <p className="text-gray-500 text-xs">Sports Intelligence</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {NAV.filter(n => !n.analystOnly || user?.role === "analyst").map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to} to={to}
              className={({ isActive }) => clsx(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                isActive
                  ? "bg-brand-500/15 text-brand-500"
                  : "text-gray-400 hover:text-white hover:bg-border/50"
              )}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* User */}
        <div className="p-3 border-t border-border">
          <div className="flex items-center gap-2 px-2 py-1.5 mb-2">
            <div className="w-7 h-7 bg-brand-500/20 rounded-full flex items-center justify-center flex-shrink-0">
              <User className="w-3.5 h-3.5 text-brand-500" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-white text-xs font-medium truncate">{user?.username}</p>
              <Badge variant={user?.role === "analyst" ? "analyst" : "viewer"} className="mt-0.5">
                {user?.role}
              </Badge>
            </div>
          </div>
          <button onClick={handleLogout} className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 text-sm transition-colors">
            <LogOut className="w-3.5 h-3.5" /> Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
