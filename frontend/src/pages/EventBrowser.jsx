import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, RefreshCw, Radio, Calendar, Trophy } from "lucide-react";
import api from "../lib/api";
import { StatusBadge, Spinner, EmptyState } from "../components/ui/index.jsx";
import { clsx } from "clsx";

const SPORTS = ["All", "Soccer", "Basketball", "Baseball"];
const STATUSES = ["All", "In Progress", "Upcoming", "Final"];

export default function EventBrowser() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sport, setSport] = useState("All");
  const [status, setStatus] = useState("All");
  const [search, setSearch] = useState("");
  const [subbing, setSubbing] = useState({});
  const navigate = useNavigate();

  const fetchEvents = async () => {
    try {
      const params = {};
      if (sport !== "All") params.sport = sport;
      if (status !== "All") params.status = status;
      const { data } = await api.get("/api/events", { params });
      setEvents(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await api.get("/api/events/refresh");
    await fetchEvents();
    setRefreshing(false);
  };

  const toggleSubscribe = async (e, eventId, isSubscribed) => {
    e.stopPropagation();
    setSubbing(s => ({ ...s, [eventId]: true }));
    try {
      if (isSubscribed) await api.delete(`/api/events/${eventId}/subscribe`);
      else await api.post(`/api/events/${eventId}/subscribe`);
      setEvents(evs => evs.map(ev =>
        ev.id === eventId ? { ...ev, is_subscribed: !isSubscribed } : ev
      ));
    } catch (e) {
      alert(e.response?.data?.detail || "Action failed");
    } finally {
      setSubbing(s => ({ ...s, [eventId]: false }));
    }
  };

  useEffect(() => { fetchEvents(); }, [sport, status]);

  const filtered = events.filter(e =>
    search === "" ||
    e.name.toLowerCase().includes(search.toLowerCase()) ||
    e.sport.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Event Browser</h1>
          <p className="text-gray-500 text-sm mt-1">{events.length} events loaded</p>
        </div>
        <button onClick={handleRefresh} disabled={refreshing}
          className="btn-secondary flex items-center gap-2">
          <RefreshCw className={clsx("w-4 h-4", refreshing && "animate-spin")} />
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input className="input pl-9" placeholder="Search events..." value={search}
            onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-1 bg-card border border-border rounded-lg p-1">
          {SPORTS.map(s => (
            <button key={s} onClick={() => setSport(s)}
              className={clsx("px-3 py-1 rounded-md text-sm font-medium transition-colors",
                sport === s ? "bg-brand-500 text-white" : "text-gray-400 hover:text-white")}>
              {s}
            </button>
          ))}
        </div>
        <div className="flex gap-1 bg-card border border-border rounded-lg p-1">
          {STATUSES.map(s => (
            <button key={s} onClick={() => setStatus(s)}
              className={clsx("px-3 py-1 rounded-md text-sm font-medium transition-colors",
                status === s ? "bg-brand-500 text-white" : "text-gray-400 hover:text-white")}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Events grid */}
      {loading ? (
        <div className="flex justify-center py-20"><Spinner size="lg" /></div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={Calendar} title="No events found" description="Try adjusting your filters or refresh the data" />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(event => (
            <div key={event.id}
              onClick={() => navigate(`/events/${event.id}`)}
              className="card hover:border-brand-500/50 cursor-pointer transition-all hover:-translate-y-0.5 group">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <StatusBadge status={event.status} />
                  <span className="text-xs text-gray-600">{event.sport}</span>
                </div>
                <button
                  onClick={ev => toggleSubscribe(ev, event.id, event.is_subscribed)}
                  disabled={subbing[event.id]}
                  className={clsx(
                    "text-xs px-2.5 py-1 rounded-full border font-medium transition-colors",
                    event.is_subscribed
                      ? "bg-brand-500/20 border-brand-500/40 text-brand-500 hover:bg-red-500/10 hover:border-red-500/40 hover:text-red-400"
                      : "border-border text-gray-400 hover:border-brand-500 hover:text-brand-500"
                  )}>
                  {subbing[event.id] ? "..." : event.is_subscribed ? "Subscribed ✓" : "+ Subscribe"}
                </button>
              </div>

              <div className="mb-3">
                <p className="text-xs text-gray-500 mb-1">{event.league}</p>
                <div className="flex items-center gap-2 justify-between">
                  <span className="text-white font-semibold text-sm truncate flex-1">{event.home_team}</span>
                  {event.status !== "Upcoming" ? (
                    <span className="text-white font-black text-lg tabular-nums px-2">
                      {event.home_score ?? 0} - {event.away_score ?? 0}
                    </span>
                  ) : (
                    <span className="text-gray-600 text-xs px-2">vs</span>
                  )}
                  <span className="text-white font-semibold text-sm truncate flex-1 text-right">{event.away_team}</span>
                </div>
              </div>

              <div className="flex items-center gap-3 text-xs text-gray-600 pt-2 border-t border-border">
                <span>{event.venue || "TBD"}</span>
                <span>•</span>
                <span>{event.date_event}</span>
                {event.status === "In Progress" && (
                  <span className="ml-auto flex items-center gap-1 text-red-400">
                    <Radio className="w-3 h-3" /> Live
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
