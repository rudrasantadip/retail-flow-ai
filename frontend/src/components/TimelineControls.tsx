import React from 'react';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  SkipBack, 
  SkipForward, 
  Repeat, 
  Gauge, 
  Clock 
} from 'lucide-react';
import { Track } from '../types';

interface TimelineControlsProps {
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  onPlayPause: () => void;
  onSeek: (time: number) => void;
  playbackRate: number;
  onChangeRate: (rate: number) => void;
  tracks: Track[];
}

export const TimelineControls: React.FC<TimelineControlsProps> = ({
  currentTime,
  duration,
  isPlaying,
  onPlayPause,
  onSeek,
  playbackRate,
  onChangeRate,
  tracks
}) => {
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 10);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms}`;
  };

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onSeek(parseFloat(e.target.value));
  };

  const stepFrame = (delta: number) => {
    const next = Math.max(0, Math.min(duration, currentTime + delta));
    onSeek(next);
  };

  // Generate density sparkline buckets (e.g. 100 buckets across the video duration)
  const buckets = 100;
  const sparklineData = React.useMemo(() => {
    if (!duration || duration <= 0) return new Array(buckets).fill(0);
    const counts = new Array(buckets).fill(0);
    const bucketDuration = duration / buckets;

    tracks.forEach((track) => {
      track.positions.forEach((p) => {
        const bIdx = Math.min(buckets - 1, Math.floor(p.timestamp / bucketDuration));
        if (bIdx >= 0) counts[bIdx]++;
      });
    });

    const maxCount = Math.max(1, ...counts);
    return counts.map((c) => (c / maxCount) * 100);
  }, [tracks, duration]);

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 shadow-lg flex flex-col gap-2.5">
      {/* Activity Histogram / Sparkline behind timeline slider */}
      <div className="relative w-full h-8 bg-slate-950/80 rounded-lg overflow-hidden border border-slate-800/80 flex items-end px-1">
        {sparklineData.map((h, idx) => (
          <div
            key={idx}
            className="flex-1 transition-all mx-[0.5px]"
            style={{
              height: `${Math.max(4, h)}%`,
              backgroundColor:
                (idx / buckets) * 100 <= progressPercent
                  ? '#10b981'
                  : '#334155'
            }}
          />
        ))}

        {/* Current Playhead Line on Sparkline */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-amber-400 z-10 pointer-events-none shadow-[0_0_8px_#f59e0b]"
          style={{ left: `${progressPercent}%` }}
        />
      </div>

      {/* Scrub Slider */}
      <div className="relative flex items-center">
        <input
          type="range"
          min="0"
          max={duration || 100}
          step="0.05"
          value={currentTime}
          onChange={handleSliderChange}
          className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
        />
      </div>

      {/* Control Buttons & Indicators */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
        
        {/* Left: Playback controls */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => onSeek(0)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title="Reset to beginning"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          <button
            onClick={() => stepFrame(-0.2)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title="Step back 0.2s"
          >
            <SkipBack className="w-4 h-4" />
          </button>

          <button
            onClick={onPlayPause}
            className="flex items-center justify-center w-8 h-8 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/30 transition-all active:scale-95"
          >
            {isPlaying ? (
              <Pause className="w-4 h-4 fill-white" />
            ) : (
              <Play className="w-4 h-4 fill-white ml-0.5" />
            )}
          </button>

          <button
            onClick={() => stepFrame(0.2)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title="Step forward 0.2s"
          >
            <SkipForward className="w-4 h-4" />
          </button>
        </div>

        {/* Center: Timestamp Display */}
        <div className="flex items-center gap-2 font-mono text-xs bg-slate-950 px-3 py-1 rounded-md border border-slate-800">
          <Clock className="w-3.5 h-3.5 text-indigo-400" />
          <span className="text-white font-bold">{formatTime(currentTime)}</span>
          <span className="text-slate-500">/</span>
          <span className="text-slate-400">{formatTime(duration)}</span>
        </div>

        {/* Right: Playback Speed selector */}
        <div className="flex items-center gap-1">
          <Gauge className="w-3.5 h-3.5 text-slate-400 mr-1" />
          {[0.5, 1, 2, 4].map((rate) => (
            <button
              key={rate}
              onClick={() => onChangeRate(rate)}
              className={`px-2 py-0.5 text-[11px] font-mono rounded transition-colors ${
                playbackRate === rate
                  ? 'bg-indigo-600 text-white font-bold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              {rate}x
            </button>
          ))}
        </div>

      </div>
    </div>
  );
};
