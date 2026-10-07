import React from 'react';
import { 
  Scan, 
  PlayCircle, 
  Compass, 
  Download, 
  RotateCcw, 
  CheckCircle2, 
  Activity,
  Layers,
  Sparkles
} from 'lucide-react';
import { PipelineStatus, VideoItem } from '../types';

interface HeaderProps {
  videos: VideoItem[];
  selectedVideoId: string;
  onSelectVideo: (id: string) => void;
  onOpenCalibration: () => void;
  onOpenExport: () => void;
  onOpenUpload: () => void;
  onRunPipeline: () => void;
  isRunningPipeline: boolean;
  pipelineStatus?: PipelineStatus | null;
  detectorLabel?: string;
  faceBlurEnabled?: boolean;
  activeCustomerCount: number;
  totalCustomers: number;
}

export const Header: React.FC<HeaderProps> = ({
  videos,
  selectedVideoId,
  onSelectVideo,
  onOpenCalibration,
  onOpenExport,
  onOpenUpload,
  onRunPipeline,
  isRunningPipeline,
  pipelineStatus = null,
  detectorLabel = 'YOLO',
  faceBlurEnabled = true,
  activeCustomerCount,
  totalCustomers
}) => {
  const stageText: Record<string, string> = {
    loading_models: 'Loading models',
    detecting_people: 'Detecting people',
    blurring_faces: 'Blurring faces',
    finalizing: 'Finalizing'
  };
  const progressPct = Math.round((pipelineStatus?.progress ?? 0) * 100);
  const stageLabel = stageText[pipelineStatus?.stage ?? ''] ?? 'Processing';

  return (
    <header className="bg-slate-900/90 backdrop-blur-md border-b border-slate-800 sticky top-0 z-40 px-4 lg:px-6 py-3">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        
        {/* Brand & Project Info */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-emerald-400 flex items-center justify-center shadow-lg shadow-indigo-500/20 ring-1 ring-white/20">
            <Scan className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-white tracking-tight flex items-center gap-1.5">
                RetailFlow <span className="text-emerald-400 font-mono text-sm uppercase px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">AI</span>
              </h1>
              <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-medium text-emerald-400 bg-emerald-950/60 border border-emerald-800/60 px-2 py-0.5 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                {detectorLabel} Person Detection{faceBlurEnabled ? ' + FaceNet Blur' : ''}
              </span>
            </div>
            <p className="text-xs text-slate-400">
              CCTV Retail Spatial Reconstruction & Time-Synchronized 2D Heatmap
            </p>
          </div>
        </div>

        {/* Video selector & Pipeline Controls */}
        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto justify-end">
          
          {/* Upload New Video Button */}
          <button
            onClick={onOpenUpload}
            className="flex items-center gap-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-semibold px-3 py-2 rounded-lg border border-emerald-500/50 shadow-md shadow-emerald-600/20 transition-all active:scale-95"
            title="Upload a new 2-3 min CCTV video clip for analysis"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Upload CCTV Clip</span>
          </button>

          {/* Video Selector */}
          <div className="relative">
            <select
              value={selectedVideoId}
              onChange={(e) => onSelectVideo(e.target.value)}
              className="bg-slate-800/90 text-slate-200 text-xs font-medium rounded-lg border border-slate-700/80 px-3 py-2 pr-8 hover:border-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all cursor-pointer shadow-inner max-w-xs truncate"
            >
              {videos.map((vid) => (
                <option key={vid.id} value={vid.id}>
                  📹 {vid.title}
                </option>
              ))}
            </select>
          </div>

          {/* Floor Calibration Button */}
          <button
            onClick={onOpenCalibration}
            className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium px-3 py-2 rounded-lg border border-slate-700 hover:border-slate-600 transition-all shadow-sm group"
            title="Calibrate 4 floor reference points for homography transform"
          >
            <Compass className="w-3.5 h-3.5 text-indigo-400 group-hover:rotate-45 transition-transform" />
            <span className="hidden sm:inline">Floor Calibration</span>
          </button>

          {/* Rerun Pipeline */}
          <button
            onClick={onRunPipeline}
            disabled={isRunningPipeline}
            className={`flex items-center gap-1.5 text-xs font-medium px-3.5 py-2 rounded-lg border transition-all shadow-sm ${
              isRunningPipeline
                ? 'bg-indigo-950 text-indigo-300 border-indigo-800 cursor-not-allowed'
                : 'bg-indigo-600 hover:bg-indigo-500 text-white border-indigo-500 shadow-indigo-600/20 hover:shadow-indigo-600/40'
            }`}
          >
            {isRunningPipeline ? (
              <>
                <RotateCcw className="w-3.5 h-3.5 animate-spin" />
                <span>{stageLabel}… {progressPct}%</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5 text-indigo-200" />
                <span>Run CV Pipeline</span>
              </>
            )}
          </button>

          {/* Export Artifacts */}
          <button
            onClick={onOpenExport}
            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium px-3 py-2 rounded-lg border border-emerald-500 transition-all shadow-sm shadow-emerald-600/20"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Export</span>
          </button>
        </div>

      </div>
    </header>
  );
};
