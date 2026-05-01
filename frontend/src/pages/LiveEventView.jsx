import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Wifi, WifiOff, MessageSquare, Star } from "lucide-react";
import api from "../lib/api";
import { useEventWebSocket } from "../hooks/useEventWebSocket";
import { PipelineStepper } from "../components/PipelineStepper.jsx";
import { ScoreBug, StatusBadge, TrendBadge, ConfidenceBar, Spinner } from "../components/ui/index.jsx";
import { clsx } from "clsx";

export default function LiveEventView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [event, setEvent] = useState(null);
  const [stream, setStream] = useState([]);
  const [latestAnalysis, setLatestAnalysis] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const feedRef = useRef(null);

  // Load initial data
  useEffect(() => {
    if (!id) return;
    Promise.all([
      api.get(`/api/events/${id}`),
      api.get(`/api/events/${id}/stream`),
      api.get(`/api/events/${id}/analysis`),
    ]).then(([evRes, stRes, anRes]) => {
      setEvent(evRes.data);
      setStream(stRes.data.reverse());
      if (anRes.data.length > 0) setLatestAnalysis(anRes.data[0]);
    }).catch(console.error).finally(() => setLoading(false));
  }, [id]);

  // WebSocket handler
  const handleWsMessage = (msg) => {
    if (msg.type === "commentary") {
      setStream(prev => [{
        id: Date.now(), event_id: id,
        commentary: msg.commentary,
        recorded_at: msg.timestamp,
        status: event?.status || "In Progress",
      }, ...prev].slice(0, 50));
      // Auto-scroll feed
      setTimeout(() => feedRef.current?.scrollTo({ top: 0, behavior: "smooth" }), 100);
    }
    if (msg.type === "analysis") {
      setLatestAnalysis({
        updated_summary: msg.summary,
        key_moments: msg.key_moments,
        trend: msg.trend,
        prediction: msg.prediction,
        confidence: msg.confidence,
        created_at: msg.timestamp,
      });
    }
    if (msg.type === "alert") {
      setAlerts(prev => [msg, ...prev].slice(0, 5));
    }
    if (msg.type === "catchup") {
      // Process catchup messages
      msg.updates?.forEach(u => handleWsMessage(u));
    }
  };

  const { connected } = useEventWebSocket(id, handleWsMessage);

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <Spinner size="lg" />
    </div>
  );
  if (!event) return <div className="p-6 text-gray-400">Event not found</div>;

  return (
    <div className="h-full flex flex-col">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-border bg-card/50 flex-shrink-0">
        <button onClick={() => navigate("/events")} className="text-gray-500 hover:text-white transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <StatusBadge status={event.status} />
            <span className="text-gray-500 text-sm">{event.league}</span>
          </div>
          <h1 className="text-white font-bold truncate">{event.name}</h1>
        </div>
        <div className={clsx("flex items-center gap-1.5 text-xs px-2 py-1 rounded-full",
          connected ? "bg-green-500/10 text-green-400 border border-green-500/20"
                    : "bg-red-500/10 text-red-400 border border-red-500/20")}>
          {connected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
          {connected ? "Live" : "Reconnecting..."}
        </div>
      </div>

      {/* Main 3-column layout */}
      <div className="flex-1 overflow-hidden flex gap-4 p-4">

        {/* Column 1: Score + Feed */}
        <div className="flex-1 min-w-0 flex flex-col gap-4 overflow-hidden">
          <ScoreBug
            homeTeam={event.home_team} awayTeam={event.away_team}
            homeScore={event.home_score} awayScore={event.away_score}
            sport={event.sport}
          />

          {/* Alert banners */}
          {alerts.map((a, i) => (
            <div key={i} className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg px-4 py-2 text-sm text-yellow-400 flex items-center gap-2">
              <Star className="w-4 h-4 flex-shrink-0" />
              <span><strong>Alert:</strong> {a.matched_value}</span>
            </div>
          ))}

          {/* Live Commentary Feed */}
          <div className="card flex-1 flex flex-col overflow-hidden">
            <div className="flex items-center gap-2 mb-3 flex-shrink-0">
              <MessageSquare className="w-4 h-4 text-brand-500" />
              <h3 className="font-semibold text-sm text-white">Live Commentary</h3>
              <span className="text-xs text-gray-600 ml-auto">Groq · Llama 3.1</span>
            </div>
            <div ref={feedRef} className="flex-1 overflow-y-auto space-y-2 pr-1">
              {stream.length === 0 ? (
                <p className="text-gray-600 text-sm text-center py-8">Waiting for live data...</p>
              ) : stream.map((entry, i) => (
                <div key={entry.id || i}
                  className={clsx("flex gap-3 p-2.5 rounded-lg transition-all",
                    i === 0 ? "bg-brand-500/10 border border-brand-500/20" : "hover:bg-surface/50")}>
                  <div className="w-1 rounded-full flex-shrink-0 self-stretch bg-brand-500/40" />
                  <div className="flex-1 min-w-0">
                    {entry.commentary ? (
                      <p className="text-white text-sm leading-relaxed">{entry.commentary}</p>
                    ) : (
                      <p className="text-gray-500 text-sm italic">Update received</p>
                    )}
                    <p className="text-gray-700 text-xs mt-1">
                      {new Date(entry.recorded_at).toLocaleTimeString()}
                      {entry.home_score != null && (
                        <span className="ml-2 text-gray-600">
                          · Score: {entry.home_score}-{entry.away_score}
                        </span>
                      )}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Column 2: AI Analysis */}
        <div className="w-72 flex-shrink-0 flex flex-col gap-4 overflow-y-auto">
          {latestAnalysis ? (
            <>
              <div className="card">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-sm text-white">AI Analysis</h3>
                  <span className="text-xs text-gray-600">Gemini Flash</span>
                </div>
                <div className="flex items-center gap-2 mb-3">
                  <TrendBadge trend={latestAnalysis.trend} />
                  <span className="text-xs text-gray-500">Current Trend</span>
                </div>
                <p className="text-gray-300 text-sm leading-relaxed mb-3">{latestAnalysis.updated_summary}</p>
                <div className="pt-3 border-t border-border">
                  <p className="text-xs text-gray-500 mb-1">Prediction</p>
                  <p className="text-white text-sm">{latestAnalysis.prediction}</p>
                  <div className="mt-2">
                    <p className="text-xs text-gray-500 mb-1">Confidence</p>
                    <ConfidenceBar value={latestAnalysis.confidence} />
                  </div>
                </div>
              </div>

              {latestAnalysis.key_moments?.length > 0 && (
                <div className="card">
                  <h3 className="font-semibold text-sm text-white mb-3">Key Moments</h3>
                  <ul className="space-y-2">
                    {latestAnalysis.key_moments.map((m, i) => (
                      <li key={i} className="flex gap-2 text-sm">
                        <span className="text-brand-500 font-bold flex-shrink-0">{i + 1}.</span>
                        <span className="text-gray-300">{m}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          ) : (
            <div className="card text-center py-8">
              <p className="text-gray-500 text-sm">Analysis pending...</p>
              <p className="text-gray-600 text-xs mt-1">Gemini runs every 5 minutes</p>
            </div>
          )}
        </div>

        {/* Column 3: Pipeline Stepper */}
        <div className="w-56 flex-shrink-0 overflow-y-auto">
          <PipelineStepper eventId={id} />
        </div>
      </div>
    </div>
  );
}
