import { clsx } from "clsx";
import { Loader2, TrendingUp, TrendingDown, Minus } from "lucide-react";

export function Spinner({ size = "md" }) {
  const s = size === "sm" ? "w-4 h-4" : size === "lg" ? "w-8 h-8" : "w-6 h-6";
  return <Loader2 className={clsx(s, "animate-spin text-brand-500")} />;
}

export function Badge({ children, variant = "default", className }) {
  const variants = {
    default: "bg-gray-700 text-gray-200",
    live:    "bg-red-500/20 text-red-400 border border-red-500/30",
    upcoming:"bg-blue-500/20 text-blue-400 border border-blue-500/30",
    final:   "bg-gray-600/30 text-gray-400 border border-gray-600/30",
    success: "bg-green-500/20 text-green-400 border border-green-500/30",
    warning: "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30",
    analyst: "bg-purple-500/20 text-purple-400 border border-purple-500/30",
    viewer:  "bg-blue-500/20 text-blue-400 border border-blue-500/30",
  };
  return (
    <span className={clsx("badge", variants[variant] || variants.default, className)}>
      {variant === "live" && <span className="live-dot" />}
      {children}
    </span>
  );
}

export function StatusBadge({ status }) {
  const map = { "In Progress": "live", "Upcoming": "upcoming", "Final": "final" };
  return <Badge variant={map[status] || "default"}>{status === "In Progress" ? "LIVE" : status}</Badge>;
}

export function TrendBadge({ trend }) {
  const map = {
    momentum: { icon: TrendingUp,   color: "text-green-400",  bg: "bg-green-500/10 border-green-500/20", label: "Momentum" },
    stable:   { icon: Minus,        color: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/20", label: "Stable" },
    reversal: { icon: TrendingDown, color: "text-red-400",    bg: "bg-red-500/10 border-red-500/20",    label: "Reversal" },
  };
  const cfg = map[trend] || map.stable;
  const Icon = cfg.icon;
  return (
    <span className={clsx("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border", cfg.bg, cfg.color)}>
      <Icon className="w-3 h-3" /> {cfg.label}
    </span>
  );
}

export function ScoreBug({ homeTeam, awayTeam, homeScore, awayScore, sport }) {
  return (
    <div className="flex items-center gap-3 bg-surface/60 rounded-xl px-5 py-3 border border-border">
      <div className="text-right flex-1">
        <p className="font-bold text-white text-sm truncate">{homeTeam}</p>
        <p className="text-xs text-gray-500">Home</p>
      </div>
      <div className="flex items-center gap-2 text-center">
        <span className="text-3xl font-black text-white tabular-nums">
          {homeScore ?? "—"}
        </span>
        <span className="text-gray-500 font-bold">:</span>
        <span className="text-3xl font-black text-white tabular-nums">
          {awayScore ?? "—"}
        </span>
      </div>
      <div className="text-left flex-1">
        <p className="font-bold text-white text-sm truncate">{awayTeam}</p>
        <p className="text-xs text-gray-500">Away</p>
      </div>
    </div>
  );
}

export function ConfidenceBar({ value }) {
  const pct = Math.round((value || 0) * 100);
  const color = pct >= 70 ? "bg-green-500" : pct >= 50 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-border rounded-full overflow-hidden">
        <div className={clsx("h-full rounded-full transition-all", color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-400 tabular-nums w-8">{pct}%</span>
    </div>
  );
}

export function EmptyState({ icon: Icon, title, description }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
      <div className="w-14 h-14 rounded-full bg-brand-500/10 flex items-center justify-center">
        <Icon className="w-7 h-7 text-brand-500" />
      </div>
      <p className="font-semibold text-white">{title}</p>
      {description && <p className="text-sm text-gray-500 max-w-xs">{description}</p>}
    </div>
  );
}
