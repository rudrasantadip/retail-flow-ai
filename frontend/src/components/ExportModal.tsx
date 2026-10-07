import React from 'react';
import { 
  Download, 
  FileJson, 
  FileText, 
  Image as ImageIcon, 
  X, 
  CheckCircle,
  Database
} from 'lucide-react';
import { StoreMap, Track, VideoMeta, Analytics } from '../types';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  videoId: string;
  storeMap: StoreMap | null;
  tracks: Track[];
  videoMeta: VideoMeta | null;
  analytics: Analytics | null;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  videoId,
  storeMap,
  tracks,
  videoMeta,
  analytics
}) => {
  if (!isOpen) return null;

  const downloadJson = (filename: string, data: any) => {
    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadCsv = () => {
    if (!tracks || tracks.length === 0) return;
    const headers = ['Track_ID', 'Start_Time_s', 'End_Time_s', 'Dwell_Time_s', 'Distance_px', 'Zones_Visited', 'Points_Sampled'];
    const rows = tracks.map((t) => [
      t.track_id,
      t.start_time,
      t.end_time,
      t.dwell_time,
      t.distance_traveled,
      `"${t.zones_visited.join(', ')}"`,
      t.positions.length
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${videoId}_customer_trajectories.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadFloorMapPng = () => {
    // Capture the 2D SVG + Heatmap canvas as PNG
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 800;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Background
    ctx.fillStyle = '#0b0f19';
    ctx.fillRect(0, 0, 800, 800);

    // Find heatmap canvas on page and draw it
    const activeCanvas = document.querySelector('canvas') as HTMLCanvasElement;
    if (activeCanvas) {
      ctx.drawImage(activeCanvas, 0, 0, 800, 800);
    }

    // Export
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `${videoId}_2d_store_heatmap.png`;
    a.click();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden flex flex-col">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/80">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center">
              <Download className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">
                Export Project Artifacts & Data
              </h2>
              <p className="text-xs text-slate-400">
                Machine-readable JSON, CSV analytics, and high-res heatmap images
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Export Options List */}
        <div className="p-6 space-y-3">
          
          {/* store_map.json */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950/60 border border-slate-800 hover:border-slate-700 transition-all">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400">
                <FileJson className="w-5 h-5" />
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-200">store_map.json</div>
                <div className="text-xs text-slate-400">Shelves, boundary, walkable area, unseen zones</div>
              </div>
            </div>
            <button
              onClick={() => downloadJson('store_map.json', storeMap)}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-all"
            >
              Download
            </button>
          </div>

          {/* tracks.json */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950/60 border border-slate-800 hover:border-slate-700 transition-all">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
                <FileJson className="w-5 h-5" />
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-200">tracks.json</div>
                <div className="text-xs text-slate-400">All customer trajectories, IDs, timestamps, coordinates</div>
              </div>
            </div>
            <button
              onClick={() => downloadJson('tracks.json', tracks)}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-all"
            >
              Download
            </button>
          </div>

          {/* video_metadata.json */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950/60 border border-slate-800 hover:border-slate-700 transition-all">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400">
                <FileJson className="w-5 h-5" />
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-200">video_metadata.json</div>
                <div className="text-xs text-slate-400">Resolution, duration, frame rate, calibration settings</div>
              </div>
            </div>
            <button
              onClick={() => downloadJson('video_metadata.json', videoMeta)}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-all"
            >
              Download
            </button>
          </div>

          {/* Trajectories CSV */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950/60 border border-slate-800 hover:border-slate-700 transition-all">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-200">trajectories_summary.csv</div>
                <div className="text-xs text-slate-400">Spreadsheet table of dwell times and zone visits</div>
              </div>
            </div>
            <button
              onClick={downloadCsv}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-all"
            >
              Export CSV
            </button>
          </div>

          {/* 2D Heatmap Image PNG */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950/60 border border-slate-800 hover:border-slate-700 transition-all">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400">
                <ImageIcon className="w-5 h-5" />
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-200">store_heatmap.png</div>
                <div className="text-xs text-slate-400">High-resolution rendered snapshot of current heatmap</div>
              </div>
            </div>
            <button
              onClick={downloadFloorMapPng}
              className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-all shadow-md shadow-indigo-600/30"
            >
              Export Image
            </button>
          </div>

        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-950/80 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
};
