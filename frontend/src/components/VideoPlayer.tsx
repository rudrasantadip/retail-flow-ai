import React, { useRef, useEffect, useState } from 'react';
import { PipelineStatus, Track, VideoMeta } from '../types';
import { ShieldCheck, ShieldAlert, UserCheck, EyeOff, Loader2, Sparkles } from 'lucide-react';

interface VideoPlayerProps {
  videoId: string;
  videoMeta: VideoMeta | null;
  currentTime: number;
  isPlaying: boolean;
  onTimeUpdate: (time: number) => void;
  onDurationChange: (dur: number) => void;
  tracks: Track[];
  calibrationSrc: [number, number][];
  showCalibrationOverlay?: boolean;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  /** Whether the backend blurs faces (from /api/health). When true, only the blurred copy is streamed. */
  faceBlurEnabled?: boolean;
  isRunningPipeline?: boolean;
  pipelineStatus?: PipelineStatus | null;
  onRunPipeline?: () => void;
}

const STAGE_LABELS: Record<string, string> = {
  loading_models: 'Loading YOLO & FaceNet models',
  detecting_people: 'Detecting people (YOLO)',
  blurring_faces: 'Blurring faces (FaceNet)',
  finalizing: 'Finalizing analytics',
  done: 'Done'
};

const formatModel = (name?: string) =>
  name ? name.replace(/\.pt$/i, '').toUpperCase() : 'YOLO';

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  videoId,
  videoMeta,
  currentTime,
  isPlaying,
  onTimeUpdate,
  onDurationChange,
  tracks,
  calibrationSrc,
  showCalibrationOverlay = true,
  videoRef,
  faceBlurEnabled = true,
  isRunningPipeline = false,
  pipelineStatus = null,
  onRunPipeline
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [activeDetections, setActiveDetections] = useState<number>(0);
  const [activeFaces, setActiveFaces] = useState<number>(0);

  // The browser only ever receives the face-blurred copy. Until it exists, the feed is withheld.
  const anonymizedReady = !faceBlurEnabled || !!videoMeta?.privacy?.blurred_video;
  const videoSrc = anonymizedReady
    ? `/videos/${videoId}/stream?v=${videoMeta?.privacy?.generated_at ?? 0}`
    : undefined;
  const progressPct = Math.round((pipelineStatus?.progress ?? 0) * 100);

  // Sync video time when currentTime changes from external controls
  useEffect(() => {
    if (videoRef.current) {
      if (Math.abs(videoRef.current.currentTime - currentTime) > 0.3) {
        videoRef.current.currentTime = currentTime;
      }
    }
  }, [currentTime, videoRef]);

  // Sync play/pause state
  useEffect(() => {
    if (!videoRef.current) return;
    if (isPlaying && videoRef.current.paused) {
      videoRef.current.play().catch(() => {});
    } else if (!isPlaying && !videoRef.current.paused) {
      videoRef.current.pause();
    }
  }, [isPlaying, videoRef]);

  // Render detections & calibration quadrilateral on overlay canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    const origW = videoMeta?.resolution.width || 1280;
    const origH = videoMeta?.resolution.height || 720;
    const scaleX = width / origW;
    const scaleY = height / origH;

    // 1. Draw Calibration Floor Quadrilateral if enabled
    if (showCalibrationOverlay && calibrationSrc && calibrationSrc.length === 4) {
      ctx.save();
      ctx.beginPath();
      const p0 = calibrationSrc[0];
      ctx.moveTo(p0[0] * scaleX, p0[1] * scaleY);
      for (let i = 1; i < 4; i++) {
        const p = calibrationSrc[i];
        ctx.lineTo(p[0] * scaleX, p[1] * scaleY);
      }
      ctx.closePath();
      ctx.fillStyle = 'rgba(99, 102, 241, 0.12)';
      ctx.fill();
      ctx.strokeStyle = '#6366f1';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Draw corner anchors
      const labels = ['TL', 'TR', 'BR', 'BL'];
      calibrationSrc.forEach((p, idx) => {
        const cx = p[0] * scaleX;
        const cy = p[1] * scaleY;
        ctx.beginPath();
        ctx.arc(cx, cy, 5, 0, Math.PI * 2);
        ctx.fillStyle = '#818cf8';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.font = 'bold 9px monospace';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(labels[idx], cx + 7, cy - 4);
      });
      ctx.restore();
    }

    // 2. Find and draw active tracked persons at currentTime
    let activeCount = 0;
    let faceCount = 0;

    tracks.forEach((track) => {
      if (currentTime < track.start_time - 0.4 || currentTime > track.end_time + 0.4) {
        return;
      }
      // Find position closest to currentTime within 0.45s
      let closestPos = null;
      let minDiff = 0.45;
      for (const p of track.positions) {
        const diff = Math.abs(p.timestamp - currentTime);
        if (diff < minDiff) {
          minDiff = diff;
          closestPos = p;
        }
      }
      const pos = closestPos;

      if (pos && pos.bbox) {
        activeCount++;
        const [bx, by, bw, bh] = pos.bbox;
        const x = bx * scaleX;
        const y = by * scaleY;
        const w = bw * scaleX;
        const h = bh * scaleY;

        // Bounding box
        ctx.strokeStyle = track.color || '#10b981';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, w, h);

        // Header badge with Track ID
        ctx.fillStyle = track.color || '#10b981';
        const labelText = `Person #${track.track_id} (${Math.round(pos.confidence * 100)}%)`;
        ctx.font = '600 11px Inter, sans-serif';
        const textMetrics = ctx.measureText(labelText);
        const badgeW = textMetrics.width + 10;
        const badgeH = 18;
        ctx.fillRect(x, Math.max(0, y - badgeH), badgeW, badgeH);

        ctx.fillStyle = '#ffffff';
        ctx.fillText(labelText, x + 5, Math.max(12, y - 4));

        // Faces that the backend blurred in this person box (FaceNet / MTCNN)
        (pos.faces || []).forEach(([fx1, fy1, fx2, fy2]) => {
          faceCount++;
          const rx = fx1 * scaleX;
          const ry = fy1 * scaleY;
          const rw = (fx2 - fx1) * scaleX;
          const rh = (fy2 - fy1) * scaleY;
          ctx.save();
          ctx.strokeStyle = '#c084fc';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([3, 3]);
          ctx.strokeRect(rx, ry, rw, rh);
          ctx.setLineDash([]);
          if (rw > 28) {
            ctx.font = '600 9px Inter, sans-serif';
            ctx.fillStyle = '#c084fc';
            ctx.fillText('BLURRED', rx, Math.max(9, ry - 3));
          }
          ctx.restore();
        });

        // Floor contact point (bottom-center)
        const fx = pos.img_x * scaleX;
        const fy = pos.img_y * scaleY;

        ctx.beginPath();
        ctx.arc(fx, fy, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#f59e0b';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Floor projection indicator line
        ctx.beginPath();
        ctx.moveTo(x + w / 2, y + h * 0.7);
        ctx.lineTo(fx, fy);
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.6)';
        ctx.setLineDash([2, 2]);
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.setLineDash([]);
      }
    });

    setActiveDetections(activeCount);
    setActiveFaces(faceCount);
  }, [currentTime, tracks, calibrationSrc, showCalibrationOverlay, videoMeta]);

  return (
    <div className="flex flex-col bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
      {/* CCTV Monitor Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-slate-950/80 border-b border-slate-800/80 text-xs">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 font-mono text-[11px] text-red-400 font-semibold uppercase">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-ping"></span>
            REC
          </span>
          <span className="text-slate-400 font-mono text-xs">
            CAM_01: {videoMeta?.resolution.width || 1280}x{videoMeta?.resolution.height || 720} @ {videoMeta?.fps || 30} FPS
          </span>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 text-slate-300 font-mono text-xs bg-slate-800/80 px-2 py-0.5 rounded border border-slate-700/60">
            <UserCheck className="w-3 h-3 text-emerald-400" />
            <span>People: <strong className="text-emerald-400">{activeDetections}</strong></span>
          </div>
          <div
            className="flex items-center gap-1 text-slate-300 font-mono text-xs bg-slate-800/80 px-2 py-0.5 rounded border border-slate-700/60"
            title="Faces blurred in the current frame"
          >
            <EyeOff className="w-3 h-3 text-purple-400" />
            <span>Blurred: <strong className="text-purple-400">{activeFaces}</strong></span>
          </div>
          <span className="text-slate-500 text-[11px] font-mono">
            {currentTime.toFixed(2)}s
          </span>
        </div>
      </div>

      {/* Video & Canvas Overlay Viewport */}
      <div ref={containerRef} className="relative aspect-video bg-black flex items-center justify-center overflow-hidden group">
        <video
          ref={videoRef}
          src={videoSrc}
          crossOrigin="anonymous"
          playsInline
          muted
          className="w-full h-full object-contain pointer-events-none"
          onTimeUpdate={(e) => onTimeUpdate(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => onDurationChange(e.currentTarget.duration)}
        />

        {/* Overlay Canvas for Person Bounding Boxes & Homography Quad */}
        <canvas
          ref={canvasRef}
          width={1280}
          height={720}
          className="absolute inset-0 w-full h-full object-contain pointer-events-none"
        />

        {/* Feed withheld until the face-blurred copy exists */}
        {!anonymizedReady && (
          <div className="absolute inset-0 z-10 bg-slate-950/95 flex flex-col items-center justify-center gap-3 px-6 text-center">
            <ShieldAlert className="w-9 h-9 text-amber-400" />
            <div className="text-sm font-semibold text-slate-100">Anonymised feed not generated yet</div>
            <p className="text-xs text-slate-400 max-w-sm">
              Faces are blurred on the server before any video reaches the browser. Run the CV pipeline
              (YOLO person detection + FaceNet face blur) to create it.
            </p>
            {isRunningPipeline ? (
              <div className="flex items-center gap-2 text-xs text-indigo-300 bg-indigo-950/60 border border-indigo-800/60 rounded-lg px-3 py-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>
                  {STAGE_LABELS[pipelineStatus?.stage ?? 'loading_models'] ?? 'Processing'} — {progressPct}%
                </span>
              </div>
            ) : (
              onRunPipeline && (
                <button
                  onClick={onRunPipeline}
                  className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium px-3.5 py-2 rounded-lg border border-indigo-500 transition-all"
                >
                  <Sparkles className="w-3.5 h-3.5 text-indigo-200" />
                  <span>Run CV Pipeline</span>
                </button>
              )
            )}
          </div>
        )}

        {/* Watermark / CCTV OSD info */}
        <div className="absolute top-3 left-3 bg-black/60 backdrop-blur-sm border border-white/10 rounded px-2 py-1 text-[10px] font-mono text-slate-300 pointer-events-none">
          <div>FEED: FIXED_RETAIL_OVERHEAD</div>
          <div>
            DETECTOR: {formatModel(videoMeta?.detector?.model)} · PERSON ONLY
          </div>
          <div className={anonymizedReady && faceBlurEnabled ? 'text-emerald-400' : 'text-slate-500'}>
            <ShieldCheck className="inline w-3 h-3 mr-1 -mt-0.5" />
            FACE BLUR: {faceBlurEnabled ? (anonymizedReady ? 'ACTIVE (FACENET)' : 'PENDING') : 'OFF'}
          </div>
          <div className="text-slate-400">FLOOR CALIBRATION: ACTIVE (4-PT)</div>
        </div>

        {/* Legend pill */}
        <div className="absolute bottom-3 left-3 flex items-center gap-2 bg-black/70 backdrop-blur-sm border border-white/10 rounded-md px-2.5 py-1 text-[10px] font-mono text-slate-300 pointer-events-none">
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded bg-emerald-500"></span>
            <span>Person (YOLO)</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm border border-dashed border-purple-400"></span>
            <span>Blurred Face</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-amber-400"></span>
            <span>Floor Contact Point</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2 h-0.5 bg-indigo-400"></span>
            <span>Calib Quad</span>
          </div>
        </div>
      </div>
    </div>
  );
};
