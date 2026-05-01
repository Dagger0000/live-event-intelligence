// ── Screens 04-08 ─────────────────────────────────────────────────────────────
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Brain, RefreshCw } from "lucide-react";
import api from "../lib/api";
import { TrendBadge, ConfidenceBar, Spinner, ScoreBug } from "../components/ui/index.jsx";

export function AnalysisPanel() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [analyses, setAnalyses] = useState([]);
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get(`/api/events/${id}`),
      api.get(`/api/events/${id}/analysis`),
    ]).then(([ev, an]) => {
      setEvent(ev.data);
      setAnalyses(an.data);
    }).finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="flex justify-center items-center h-full"><Spinner size="lg" /></div>;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate(`/events/${id}`)} className="text-gray-500 hover:text-white">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <Brain className="w-5 h-5 text-brand-500" />
        <h1 className="text-xl font-bold text-white">AI Analysis Panel</h1>
        <span className="text-gray-500 text-sm ml-auto">Gemini 1.5 Flash</span>
      </div>

      {event && (
        <div className="mb-6">
          <ScoreBug homeTeam={event.home_team} awayTeam={event.away_team}
            homeScore={event.home_score} awayScore={event.away_score} />
        </div>
      )}

      {analyses.length === 0 ? (
        <div className="card text-center py-12">
          <Brain className="w-10 h-10 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400">No analysis yet. Gemini runs every 5 minutes for live events.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {analyses.map((a, i) => (
            <div key={a.id} className={`card ${i === 0 ? "border-brand-500/30" : ""}`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  {i === 0 && <span className="text-xs bg-brand-500/20 text-brand-500 px-2 py-0.5 rounded-full">Latest</span>}
                  <TrendBadge trend={a.trend} />
                </div>
                <span className="text-xs text-gray-600">{new Date(a.created_at).toLocaleString()}</span>
              </div>
              <p className="text-gray-300 text-sm leading-relaxed mb-4">{a.updated_summary}</p>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <p className="text-xs text-gray-500 mb-1">Prediction</p>
                  <p className="text-white text-sm">{a.prediction}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-2">Confidence</p>
                  <ConfidenceBar value={a.confidence} />
                </div>
              </div>
              {a.key_moments?.length > 0 && (
                <div className="pt-3 border-t border-border">
                  <p className="text-xs text-gray-500 mb-2">Key Moments</p>
                  <ul className="space-y-1">
                    {a.key_moments.map((m, j) => (
                      <li key={j} className="text-sm text-gray-300 flex gap-2">
                        <span className="text-brand-500 font-bold">{j + 1}.</span> {m}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Screen 05: Prediction Board ───────────────────────────────────────────────
export function PredictionBoard() {
  const [predictions, setPredictions] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    api.get("/api/predictions").then(r => setPredictions(r.data)).finally(() => setLoading(false));
  }, []);

  const trendColors = { momentum: "text-green-400", stable: "text-yellow-400", reversal: "text-red-400" };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Prediction Board</h1>
          <p className="text-gray-500 text-sm mt-1">AI outcome predictions for your subscribed events</p>
        </div>
        <button onClick={() => { setLoading(true); api.get("/api/predictions").then(r => setPredictions(r.data)).finally(() => setLoading(false)); }}
          className="btn-secondary flex items-center gap-2">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {loading ? <div className="flex justify-center py-20"><Spinner size="lg" /></div>
      : predictions.length === 0 ? (
        <div className="card text-center py-16">
          <p className="text-gray-400 mb-2">No predictions yet.</p>
          <p className="text-gray-600 text-sm">Subscribe to live events and wait for Gemini to generate predictions.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {predictions.map((p, i) => (
            <div key={p.event_id} className="card hover:border-brand-500/30 cursor-pointer transition-all"
              onClick={() => navigate(`/events/${p.event_id}`)}>
              <div className="flex items-start gap-4">
                <div className="w-8 h-8 rounded-full bg-brand-500/10 flex items-center justify-center flex-shrink-0 text-brand-500 font-bold text-sm">
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <p className="text-white font-semibold truncate">{p.event_name}</p>
                    <TrendBadge trend={p.trend} />
                    {p.actual_outcome && (
                      <span className="text-xs bg-green-500/10 text-green-400 border border-green-500/20 px-2 py-0.5 rounded-full">
                        Final: {p.actual_outcome}
                      </span>
                    )}
                  </div>
                  <p className="text-gray-300 text-sm mb-2">{p.prediction}</p>
                  <div className="max-w-xs">
                    <ConfidenceBar value={p.confidence} />
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-2xl font-black text-white">{Math.round(p.confidence * 100)}%</p>
                  <p className="text-xs text-gray-500">confidence</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Screen 06: Alert Manager ──────────────────────────────────────────────────
export function AlertManager() {
  const [events, setEvents] = useState([]);
  const [rules, setRules] = useState([]);
  const [history, setHistory] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState("");
  const [form, setForm] = useState({ rule_type: "keyword_detected", rule_config: {} });
  const [keyword, setKeyword] = useState("");
  const [scoreThreshold, setScoreThreshold] = useState(3);
  const [trendTarget, setTrendTarget] = useState("reversal");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    api.get("/api/events").then(r => {
      const subscribed = r.data.filter(e => e.is_subscribed);
      setEvents(subscribed);
      if (subscribed.length > 0) setSelectedEvent(subscribed[0].id);
    });
    api.get("/api/alerts/history").then(r => setHistory(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedEvent) return;
    api.get(`/api/events/${selectedEvent}/alerts/rules`)
      .then(r => setRules(r.data))
      .catch(() => setRules([]));
  }, [selectedEvent]);

  const getRuleConfig = () => {
    if (form.rule_type === "keyword_detected") return { keyword };
    if (form.rule_type === "score_threshold") return { threshold: scoreThreshold };
    return { trend: trendTarget };
  };

  const handleCreate = async () => {
    if (!selectedEvent) return;
    setLoading(true);
    try {
      await api.post(`/api/events/${selectedEvent}/alerts/rules`, {
        event_id: selectedEvent,
        rule_type: form.rule_type,
        rule_config: getRuleConfig(),
      });
      const r = await api.get(`/api/events/${selectedEvent}/alerts/rules`);
      setRules(r.data);
    } catch (e) {
      alert(e.response?.data?.detail || "Failed to create rule");
    } finally { setLoading(false); }
  };

  const handleDelete = async (ruleId) => {
    await api.delete(`/api/events/${selectedEvent}/alerts/rules/${ruleId}`);
    setRules(rules.filter(r => r.id !== ruleId));
  };

  const ruleTypeLabels = {
    keyword_detected: "Keyword Detected",
    score_threshold: "Score Gap Threshold",
    trend_change: "Trend Change",
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-white mb-6">Alert Manager</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Create rule */}
        <div className="card">
          <h2 className="font-semibold text-white mb-4">Create Alert Rule</h2>
          <div className="space-y-4">
            <div>
              <label className="text-sm text-gray-400 block mb-1">Event</label>
              <select className="input" value={selectedEvent} onChange={e => setSelectedEvent(e.target.value)}>
                {events.map(ev => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm text-gray-400 block mb-1">Rule Type</label>
              <select className="input" value={form.rule_type}
                onChange={e => setForm(f => ({ ...f, rule_type: e.target.value }))}>
                {Object.entries(ruleTypeLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            {form.rule_type === "keyword_detected" && (
              <div>
                <label className="text-sm text-gray-400 block mb-1">Keyword</label>
                <input className="input" placeholder='e.g. "injury"' value={keyword} onChange={e => setKeyword(e.target.value)} />
              </div>
            )}
            {form.rule_type === "score_threshold" && (
              <div>
                <label className="text-sm text-gray-400 block mb-1">Score Gap ≥</label>
                <input className="input" type="number" min="1" max="20" value={scoreThreshold}
                  onChange={e => setScoreThreshold(Number(e.target.value))} />
              </div>
            )}
            {form.rule_type === "trend_change" && (
              <div>
                <label className="text-sm text-gray-400 block mb-1">Target Trend</label>
                <select className="input" value={trendTarget} onChange={e => setTrendTarget(e.target.value)}>
                  <option value="momentum">Momentum</option>
                  <option value="stable">Stable</option>
                  <option value="reversal">Reversal</option>
                </select>
              </div>
            )}
            <button onClick={handleCreate} disabled={loading || !selectedEvent} className="btn-primary w-full">
              {loading ? "Creating..." : "+ Add Rule"}
            </button>
            <p className="text-xs text-gray-600 text-center">Max 5 rules per event · Analyst role required</p>
          </div>
        </div>

        {/* Active rules */}
        <div className="card">
          <h2 className="font-semibold text-white mb-4">Active Rules ({rules.length}/5)</h2>
          {rules.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-8">No rules yet for this event</p>
          ) : (
            <div className="space-y-2">
              {rules.map(rule => (
                <div key={rule.id} className="flex items-center gap-3 p-3 bg-surface rounded-lg border border-border">
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium">{ruleTypeLabels[rule.rule_type]}</p>
                    <p className="text-gray-500 text-xs mt-0.5">{JSON.stringify(rule.rule_config)}</p>
                  </div>
                  <button onClick={() => handleDelete(rule.id)}
                    className="text-gray-600 hover:text-red-400 text-xs transition-colors">
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Alert history */}
      <div className="card mt-6">
        <h2 className="font-semibold text-white mb-4">Recent Alert History</h2>
        {history.length === 0 ? (
          <p className="text-gray-500 text-sm text-center py-6">No alerts triggered yet</p>
        ) : (
          <div className="space-y-2">
            {history.map(alert => (
              <div key={alert.id} className="flex items-center gap-3 p-3 bg-yellow-500/5 border border-yellow-500/20 rounded-lg">
                <span className="text-yellow-500 text-lg">⚡</span>
                <div className="flex-1">
                  <p className="text-white text-sm">{alert.matched_value}</p>
                  <p className="text-gray-500 text-xs">{new Date(alert.triggered_at).toLocaleString()}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Screen 07: Post-Event Report ──────────────────────────────────────────────
export function PostEventReport() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [report, setReport] = useState(null);
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([
      api.get(`/api/events/${id}`),
      api.get(`/api/events/${id}/report`),
    ]).then(([ev, rep]) => {
      setEvent(ev.data);
      setReport(rep.data);
    }).catch(e => {
      setError(e.response?.data?.detail || "Report not available");
    }).finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="flex justify-center items-center h-full"><Spinner size="lg" /></div>;

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate(`/events/${id}`)} className="text-gray-500 hover:text-white">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-bold text-white">Post-Event Report</h1>
      </div>

      {error ? (
        <div className="card text-center py-12">
          <p className="text-gray-400 mb-2">{error}</p>
          <p className="text-gray-600 text-sm">Reports are generated when the event status becomes "Final"</p>
        </div>
      ) : report && (
        <>
          {event && (
            <div className="card mb-4">
              <ScoreBug homeTeam={event.home_team} awayTeam={event.away_team}
                homeScore={event.home_score} awayScore={event.away_score} />
              <p className="text-center text-sm text-gray-500 mt-2">Final Score · {event.date_event}</p>
            </div>
          )}

          <div className="card mb-4">
            <h2 className="font-semibold text-white mb-3">Match Narrative</h2>
            <p className="text-gray-300 text-sm leading-relaxed whitespace-pre-line">{report.narrative}</p>
          </div>

          <div className="card mb-4">
            <h2 className="font-semibold text-white mb-3">Top 5 Key Moments</h2>
            <ol className="space-y-3">
              {report.key_moments?.map((m, i) => (
                <li key={i} className="flex gap-3">
                  <span className="w-6 h-6 rounded-full bg-brand-500/20 text-brand-500 text-xs font-bold flex items-center justify-center flex-shrink-0">{i + 1}</span>
                  <span className="text-gray-300 text-sm leading-relaxed">{m}</span>
                </li>
              ))}
            </ol>
          </div>

          <div className="card">
            <h2 className="font-semibold text-white mb-3">Prediction Accuracy</h2>
            <div className="flex items-center gap-4 mb-3">
              <div className="text-4xl font-black text-white">{Math.round(report.prediction_accuracy * 100)}%</div>
              <ConfidenceBar value={report.prediction_accuracy} />
            </div>
            {report.accuracy_notes && (
              <p className="text-gray-400 text-sm leading-relaxed">{report.accuracy_notes}</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ── Screen 08: Admin Dashboard ────────────────────────────────────────────────
export function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [failedJobs, setFailedJobs] = useState([]);
  const [retryMsg, setRetryMsg] = useState(null);

  const fetchFailedJobs = async () => {
    try {
      const res = await fetch("http://localhost:3001/api/failed-jobs");
      const data = await res.json();
      setFailedJobs(data.failed || []);
    } catch (e) {
      setFailedJobs([]);
    }
  };

  const retryJob = async (queueName, jobId) => {
    try {
      const res = await fetch("http://localhost:3001/api/retry-job", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ queue: queueName, jobId }),
      });
      const data = await res.json();
      setRetryMsg(data.message || "Retried");
      setTimeout(() => setRetryMsg(null), 3000);
      fetchFailedJobs();
    } catch (e) {
      setRetryMsg("Retry failed: " + e.message);
    }
  };

  useEffect(() => {
    Promise.all([
      api.get("/api/admin/stats"),
      api.get("/api/admin/ai-logs"),
    ]).then(([s, l]) => {
      setStats(s.data);
      setLogs(l.data);
    }).finally(() => setLoading(false));

    fetchFailedJobs();

    const interval = setInterval(async () => {
      const [s] = await Promise.all([api.get("/api/admin/stats")]);
      setStats(s.data);
      fetchFailedJobs();
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  const statCards = stats ? [
    { label: "Active WS Connections", value: stats.active_ws_connections, color: "text-green-400" },
    { label: "Total Events", value: stats.total_events, color: "text-white" },
    { label: "Live Events", value: stats.live_events, color: "text-red-400" },
    { label: "AI Calls Today", value: stats.ai_calls_today, color: "text-brand-500" },
  ] : [];

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Admin Dashboard</h1>
      </div>

      {loading ? <div className="flex justify-center py-12"><Spinner size="lg" /></div> : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {statCards.map(({ label, value, color }) => (
              <div key={label} className="card text-center">
                <p className={`text-3xl font-black ${color}`}>{value}</p>
                <p className="text-gray-500 text-xs mt-1">{label}</p>
              </div>
            ))}
          </div>

          {/* Bull Board embedded inline */}
          <div className="card mb-6">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="font-semibold text-white">🐂 BullMQ Queue Monitor</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Live queue depth for all 6 worker queues · powered by Bull Board
                </p>
              </div>
              <a
                href="http://localhost:3001/admin/queues"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-brand-500 hover:underline"
              >
                Open in new tab ↗
              </a>
            </div>
            <div className="rounded-lg overflow-hidden border border-border">
              <iframe
                src="http://localhost:3001/admin/queues"
                title="Bull Board — BullMQ Queue Dashboard"
                width="100%"
                style={{ height: "620px", border: "none", background: "#fff" }}
                loading="lazy"
              />
            </div>
            <p className="text-xs text-gray-600 mt-2">
              ⚠️ Bull Board runs on the workers service (port 3001). If the frame is blank, ensure
              the workers container is running: <code className="text-gray-400">docker compose up workers</code>
            </p>
          </div>

          {/* BullMQ Retry Dashboard — Bonus Challenge */}
          <div className="card mb-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-semibold text-white">⚠️ BullMQ Failed Jobs</h2>
                <p className="text-xs text-gray-500 mt-0.5">Retry dashboard · auto-refreshes every 15s</p>
              </div>
              <div className="flex items-center gap-3">
                {retryMsg && <span className="text-xs text-green-400">{retryMsg}</span>}
                <button onClick={fetchFailedJobs} className="text-xs text-brand-500 hover:underline">Refresh</button>
              </div>
            </div>
            {failedJobs.length === 0 ? (
              <p className="text-center text-gray-500 py-6 text-sm">✅ No failed jobs — all queues healthy</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 border-b border-border">
                      <th className="pb-2 pr-4">Queue</th>
                      <th className="pb-2 pr-4">Job</th>
                      <th className="pb-2 pr-4">Attempts</th>
                      <th className="pb-2 pr-4">Error</th>
                      <th className="pb-2 pr-4">Last Attempt</th>
                      <th className="pb-2">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {failedJobs.map(job => (
                      <tr key={`${job.queue}-${job.id}`} className="hover:bg-surface/50">
                        <td className="py-2 pr-4">
                          <span className="text-xs font-mono bg-red-900/30 text-red-400 px-2 py-0.5 rounded">{job.queue}</span>
                        </td>
                        <td className="py-2 pr-4 text-white text-xs font-mono">{job.name} <span className="text-gray-600">#{job.id}</span></td>
                        <td className="py-2 pr-4 text-xs">
                          <span className="text-red-400 font-medium">{job.attempts}</span>
                          <span className="text-gray-600">/{job.maxAttempts}</span>
                        </td>
                        <td className="py-2 pr-4 text-red-400 text-xs max-w-xs truncate" title={job.error}>{job.error}</td>
                        <td className="py-2 pr-4 text-gray-500 text-xs">
                          {job.lastAttempt ? new Date(job.lastAttempt).toLocaleTimeString() : "—"}
                        </td>
                        <td className="py-2">
                          <button
                            onClick={() => retryJob(job.queue, job.id)}
                            className="text-xs bg-brand-500/20 text-brand-400 hover:bg-brand-500/40 px-2 py-1 rounded transition-colors"
                          >
                            Retry
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-white">AI Call Log</h2>
              <span className="text-xs text-gray-500">Last 100 calls</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b border-border">
                    <th className="pb-2 pr-4">Model</th>
                    <th className="pb-2 pr-4">Event</th>
                    <th className="pb-2 pr-4">Latency</th>
                    <th className="pb-2 pr-4">Status</th>
                    <th className="pb-2">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {logs.map(log => (
                    <tr key={log.id} className="hover:bg-surface/50">
                      <td className="py-2 pr-4 text-white font-mono text-xs">{log.model}</td>
                      <td className="py-2 pr-4 text-gray-400 text-xs">{log.event_id || "—"}</td>
                      <td className="py-2 pr-4 text-gray-400 text-xs">{log.latency_ms ? `${log.latency_ms}ms` : "—"}</td>
                      <td className="py-2 pr-4">
                        <span className={`text-xs font-medium ${log.success ? "text-green-400" : "text-red-400"}`}>
                          {log.success ? "✓ OK" : "✗ Error"}
                        </span>
                      </td>
                      <td className="py-2 text-gray-600 text-xs">{new Date(log.created_at).toLocaleTimeString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {logs.length === 0 && <p className="text-center text-gray-500 py-6 text-sm">No AI calls logged yet</p>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
