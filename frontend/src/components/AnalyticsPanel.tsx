import React from 'react';
import { 
  Users, 
  Clock, 
  TrendingUp, 
  MapPin, 
  BarChart3, 
  Activity,
  Flame,
  ArrowRight,
  ShieldCheck
} from 'lucide-react';
import { Analytics, Track } from '../types';

interface AnalyticsPanelProps {
  analytics: Analytics | null;
  tracks: Track[];
  currentTime: number;
}

export const AnalyticsPanel: React.FC<AnalyticsPanelProps> = ({
  analytics,
  tracks,
  currentTime
}) => {
  // Current active customer count
  const activeCount = tracks.filter((t) =>
    t.positions.some((p) => Math.abs(p.timestamp - currentTime) <= 0.3)
  ).length;

  const totalCustomers = analytics?.total_tracked_customers || tracks.length || 0;
  const avgDwell = analytics?.average_dwell_time_seconds || 0;
  const maxDwell = analytics?.max_dwell_time_seconds || 0;

  // Zone breakdown calculation
  const zoneStats = analytics?.zone_breakdown || {};
  const totalZoneVisits = Object.values(zoneStats).reduce((acc, curr) => acc + curr.count, 0) || 1;

  // Find hottest zone
  let hottestZone = 'None';
  let maxZoneCount = -1;
  Object.entries(zoneStats).forEach(([name, data]) => {
    if (data.count > maxZoneCount) {
      maxZoneCount = data.count;
      hottestZone = name;
    }
  });

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl flex flex-col gap-4">
      {/* Title */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-emerald-400" />
          <h3 className="font-semibold text-sm text-slate-100">
            Retail Spatial Analytics
          </h3>
        </div>
        <span className="text-[11px] font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-800/60 px-2 py-0.5 rounded-full">
          Live Tracking
        </span>
      </div>

      {/* Detector & privacy summary */}
      {analytics?.detector_model && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-mono text-slate-400 bg-slate-950/60 border border-slate-800/80 rounded-lg px-3 py-2">
          <span>
            Detector: <strong className="text-slate-200">{analytics.detector_model.replace(/\.pt$/i, '').toUpperCase()}</strong> (person class only)
          </span>
          <span>
            People detections: <strong className="text-slate-200">{analytics.person_detections ?? 0}</strong>
          </span>
          <span className="flex items-center gap-1">
            <ShieldCheck className="w-3 h-3 text-purple-400" />
            Faces blurred: <strong className="text-purple-300">{analytics.faces_blurred ?? 0}</strong>
          </span>
        </div>
      )}

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        
        {/* Total Shoppers */}
        <div className="bg-slate-950/70 border border-slate-800/80 rounded-lg p-2.5 flex flex-col">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>Total Shoppers</span>
            <Users className="w-3.5 h-3.5 text-indigo-400" />
          </div>
          <div className="text-xl font-bold font-mono text-white">
            {totalCustomers}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">Unique tracked IDs</div>
        </div>

        {/* Current Active */}
        <div className="bg-slate-950/70 border border-slate-800/80 rounded-lg p-2.5 flex flex-col">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>In-Store Now</span>
            <Activity className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="text-xl font-bold font-mono text-emerald-400">
            {activeCount}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">At t = {currentTime.toFixed(1)}s</div>
        </div>

        {/* Avg Dwell Time */}
        <div className="bg-slate-950/70 border border-slate-800/80 rounded-lg p-2.5 flex flex-col">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>Avg Dwell Time</span>
            <Clock className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="text-xl font-bold font-mono text-white">
            {avgDwell}s
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">Per visitor session</div>
        </div>

        {/* Peak Dwell Time */}
        <div className="bg-slate-950/70 border border-slate-800/80 rounded-lg p-2.5 flex flex-col">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>Peak Dwell</span>
            <Flame className="w-3.5 h-3.5 text-red-400" />
          </div>
          <div className="text-xl font-bold font-mono text-white">
            {maxDwell}s
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">Max single session</div>
        </div>

      </div>

      {/* Zone Traffic & Congestion Breakdown */}
      <div className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-3">
        <div className="flex items-center justify-between text-xs font-semibold text-slate-300 mb-2.5">
          <span className="flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-indigo-400" />
            Zone Footfall & Dwell Density
          </span>
          <span className="text-[11px] text-amber-400 font-mono">
            Hottest: {hottestZone}
          </span>
        </div>

        <div className="space-y-2.5">
          {Object.entries(zoneStats).map(([zoneName, stat]) => {
            const pct = Math.round((stat.count / totalZoneVisits) * 100);
            return (
              <div key={zoneName} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-300 font-medium">{zoneName}</span>
                  <span className="font-mono text-slate-400">
                    <strong className="text-slate-200">{stat.count}</strong> visits ({pct}%)
                  </span>
                </div>
                <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-indigo-500 to-emerald-400 rounded-full transition-all duration-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Recent Track History Table */}
      <div className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-3">
        <div className="text-xs font-semibold text-slate-300 mb-2 flex items-center justify-between">
          <span>Customer Trajectories Log</span>
          <span className="text-[10px] text-slate-500 font-mono">Showing {Math.min(6, tracks.length)} of {tracks.length}</span>
        </div>
        <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
          {tracks.slice(0, 8).map((t) => (
            <div
              key={t.track_id}
              className="flex items-center justify-between p-1.5 rounded bg-slate-900/80 border border-slate-800/60 text-xs"
            >
              <div className="flex items-center gap-2">
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: t.color }}
                />
                <span className="font-mono font-bold text-slate-200">
                  ID #{t.track_id}
                </span>
                <span className="text-[11px] text-slate-400">
                  t = {t.start_time}s - {t.end_time}s
                </span>
              </div>
              <div className="flex items-center gap-3 text-[11px] font-mono">
                <span className="text-emerald-400 font-semibold">{t.dwell_time}s</span>
                <span className="text-slate-400">{t.distance_traveled}px</span>
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
};
