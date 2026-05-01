import { useEffect, useState } from "react";
import { clsx } from "clsx";
import { Check, Loader2, Circle, Zap, Database, MessageSquare,
         Brain, Radio, Wifi, Bell, FileText } from "lucide-react";
import api from "../lib/api";;

const STAGE_ICONS = [Zap, Database, MessageSquare, Brain, Radio, Wifi, Bell, FileText];
const STAGE_COLORS = {
  done:    "bg-green-500 border-green-500 text-white",
  active:  "bg-brand-500 border-brand-500 text-white animate-pulse",
  pending: "bg-surface border-border text-gray-500",
};
const LINE_COLORS = {
  done:   "bg-green-500",
  active: "bg-brand-500",
  pending:"bg-border",
};

export function PipelineStepper({ eventId, onStageUpdate }) {
  const [stages, setStages] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchStages = async () => {
    try {
      const { data } = await api.get(`/api/events/${eventId}/stages`);
      setStages(data);
      onStageUpdate?.(data);
    } catch (e) {
      console.warn("Stage fetch failed:", e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!eventId) return;
    fetchStages();
    // Poll every 10s
    const interval = setInterval(fetchStages, 10_000);
    return () => clearInterval(interval);
  }, [eventId]);

  // Also accept WS updates externally via prop
  useEffect(() => {}, [stages]);

  if (loading) return (
    <div className="card flex items-center justify-center py-8">
      <Loader2 className="w-5 h-5 animate-spin text-brand-500" />
    </div>
  );

  if (!stages.length) return null;

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-white text-sm">Pipeline Stages</h3>
        <span className="text-xs text-gray-500">Live • updates every 10s</span>
      </div>

      <div className="space-y-1">
        {stages.map((stage, i) => {
          const Icon = STAGE_ICONS[i] || Circle;
          const isLast = i === stages.length - 1;
          return (
            <div key={stage.id} className="flex gap-3">
              {/* Icon + connector line */}
              <div className="flex flex-col items-center">
                <div className={clsx(
                  "w-8 h-8 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all duration-500",
                  STAGE_COLORS[stage.status]
                )}>
                  {stage.status === "done" ? (
                    <Check className="w-4 h-4" />
                  ) : stage.status === "active" ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Icon className="w-3.5 h-3.5" />
                  )}
                </div>
                {!isLast && (
                  <div className={clsx(
                    "w-0.5 flex-1 min-h-[16px] my-1 transition-all duration-500",
                    LINE_COLORS[stage.status]
                  )} />
                )}
              </div>

              {/* Stage info */}
              <div className="pb-4 flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={clsx(
                    "text-sm font-medium",
                    stage.status === "done"   ? "text-white" :
                    stage.status === "active" ? "text-brand-500" : "text-gray-500"
                  )}>
                    {stage.stage_name}
                  </span>
                  {stage.status === "active" && (
                    <span className="text-xs text-brand-500 bg-brand-500/10 px-1.5 py-0.5 rounded-full">
                      Running
                    </span>
                  )}
                  {stage.status === "done" && stage.completed_at && (
                    <span className="text-xs text-gray-600">
                      {new Date(stage.completed_at).toLocaleTimeString()}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-600 mt-0.5">
                  Stage {stage.stage_number} of 8
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
