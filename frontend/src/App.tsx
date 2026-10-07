import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  VideoItem, 
  VideoMeta, 
  StoreMap, 
  Track, 
  Analytics, 
  HeatmapConfig,
  PipelineStatus
} from './types';
import { Header } from './components/Header';
import { VideoPlayer } from './components/VideoPlayer';
import { FloorMap2D } from './components/FloorMap2D';
import { TimelineControls } from './components/TimelineControls';
import { HeatmapSettings } from './components/HeatmapSettings';
import { AnalyticsPanel } from './components/AnalyticsPanel';
import { CalibrationModal } from './components/CalibrationModal';
import { ExportModal } from './components/ExportModal';
import { UploadModal } from './components/UploadModal';

export const App: React.FC = () => {
  // Video and state
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [selectedVideoId, setSelectedVideoId] = useState<string>('cashier_store');
  const [videoMeta, setVideoMeta] = useState<VideoMeta | null>(null);
  const [storeMap, setStoreMap] = useState<StoreMap | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);

  // Playback state
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // UI state
  const [isRunningPipeline, setIsRunningPipeline] = useState<boolean>(false);
  const [pipelineStatus, setPipelineStatus] = useState<PipelineStatus | null>(null);
  const [pipelineError, setPipelineError] = useState<string | null>(null);
  const [faceBlurEnabled, setFaceBlurEnabled] = useState<boolean>(true);
  const [isCalibrationOpen, setIsCalibrationOpen] = useState<boolean>(false);
  const [isExportOpen, setIsExportOpen] = useState<boolean>(false);
  const [isUploadOpen, setIsUploadOpen] = useState<boolean>(false);

  // Heatmap configuration
  const [heatmapConfig, setHeatmapConfig] = useState<HeatmapConfig>({
    mode: 'cumulative',
    windowDuration: 10,
    radius: 36,
    intensity: 0.85,
    colorScheme: 'classic',
    showTrails: true,
    showCustomerDots: true,
    showCustomerIds: true,
    showShelves: true,
    showUnseenAreas: true,
    showCameraFrustum: true,
    showZones: true
  });

  // Fetch available videos on mount
  useEffect(() => {
    fetch('/api/videos')
      .then((res) => res.json())
      .then((data) => {
        if (data.videos && data.videos.length > 0) {
          setVideos(data.videos);
          if (!selectedVideoId) {
            setSelectedVideoId(data.videos[0].id);
          }
        }
      })
      .catch((err) => console.error('Error fetching videos:', err));
  }, []);

  // Ask the backend how it is configured (detector model, whether faces are blurred)
  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json())
      .then((data) => {
        if (typeof data.face_blur_enabled === 'boolean') {
          setFaceBlurEnabled(data.face_blur_enabled);
        }
      })
      .catch(() => {});
  }, []);

  // Fetch video artifacts when selectedVideoId changes
  const loadArtifacts = useCallback(async (vid: string) => {
    try {
      // 1. Video metadata
      const metaRes = await fetch(`/api/artifacts/${vid}/video_metadata.json`);
      if (metaRes.ok) {
        const meta = await metaRes.json();
        setVideoMeta(meta);
        setDuration(meta.duration_seconds || 0);
      }

      // 2. Store map
      const mapRes = await fetch(`/api/artifacts/${vid}/store_map.json`);
      if (mapRes.ok) {
        const smap = await mapRes.json();
        setStoreMap(smap);
      }

      // 3. Customer tracks
      const tracksRes = await fetch(`/api/artifacts/${vid}/tracks.json`);
      if (tracksRes.ok) {
        const trks = await tracksRes.json();
        setTracks(trks);
      }

      // 4. Analytics
      const analyticsRes = await fetch(`/api/artifacts/${vid}/analytics.json`);
      if (analyticsRes.ok) {
        const an = await analyticsRes.json();
        setAnalytics(an);
      }

      // Reset playback
      setCurrentTime(0);
      setIsPlaying(false);
    } catch (err) {
      console.error('Error loading artifacts:', err);
    }
  }, []);

  useEffect(() => {
    if (selectedVideoId) {
      loadArtifacts(selectedVideoId);
    }
  }, [selectedVideoId, loadArtifacts]);

  // Poll the backend until the (background) CV pipeline finishes for a video
  const pollPipeline = useCallback(async (vid: string) => {
    setIsRunningPipeline(true);
    setPipelineError(null);
    try {
      // Detection + face blurring can take several minutes on CPU, so poll with no hard cap
      while (true) {
        const res = await fetch(`/api/pipeline/status/${vid}`);
        if (!res.ok) throw new Error(`Status check failed (${res.status})`);
        const st: PipelineStatus = await res.json();
        setPipelineStatus(st);
        if (st.status === 'ready' || st.status === 'idle') {
          if (st.status === 'ready') await loadArtifacts(vid);
          break;
        }
        if (st.status === 'error') {
          setPipelineError(st.error || 'Pipeline failed. Check the backend console for details.');
          break;
        }
        await new Promise((r) => setTimeout(r, 1500));
      }
    } catch (err) {
      console.error('Pipeline polling failed:', err);
      setPipelineError('Lost connection to the backend while processing.');
    } finally {
      setIsRunningPipeline(false);
    }
  }, [loadArtifacts]);

  // Run or re-run CV pipeline (YOLO persons -> FaceNet faces -> blurred video)
  const handleRunPipeline = async () => {
    setPipelineError(null);
    setPipelineStatus({ status: 'processing', stage: 'loading_models', progress: 0 });
    setIsRunningPipeline(true);
    try {
      const res = await fetch('/api/pipeline/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ video_id: selectedVideoId, max_duration_sec: null })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Could not start pipeline (${res.status})`);
      }
      await pollPipeline(selectedVideoId);
    } catch (err: any) {
      console.error('Pipeline run failed:', err);
      setPipelineError(err.message || 'Pipeline failed to start.');
      setIsRunningPipeline(false);
    }
  };

  // If a pipeline is already running for the selected video (e.g. just uploaded), resume tracking it
  useEffect(() => {
    if (!selectedVideoId) return;
    let cancelled = false;
    fetch(`/api/pipeline/status/${selectedVideoId}`)
      .then((res) => res.json())
      .then((st: PipelineStatus) => {
        if (!cancelled && st.status === 'processing') {
          setPipelineStatus(st);
          pollPipeline(selectedVideoId);
        } else if (!cancelled) {
          setPipelineStatus(null);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [selectedVideoId, pollPipeline]);

  // Floor calibration save
  const handleSaveCalibration = async (newSrc: [number, number][], newDst: [number, number][]) => {
    try {
      const res = await fetch('/api/calibration/reproject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          video_id: selectedVideoId,
          src: newSrc,
          dst: newDst
        })
      });
      const data = await res.json();
      if (data.status === 'reprojected') {
        setTracks(data.tracks);
        setStoreMap(data.store_map);
      }
    } catch (err) {
      console.error('Calibration save error:', err);
    }
  };

  // Video time synchronization
  const handleTimeUpdate = (time: number) => {
    setCurrentTime(time);
  };

  const handleSeek = (time: number) => {
    setCurrentTime(time);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
    }
  };

  const handlePlayPause = () => {
    setIsPlaying(!isPlaying);
  };

  const handleChangePlaybackRate = (rate: number) => {
    setPlaybackRate(rate);
    if (videoRef.current) {
      videoRef.current.playbackRate = rate;
    }
  };

  // Count active customers at current time
  const activeCustomerCount = tracks.filter((t) =>
    t.positions.some((p) => Math.abs(p.timestamp - currentTime) <= 0.3)
  ).length;

  const handleUploadSuccess = async (newVideoId: string) => {
    try {
      const res = await fetch('/api/videos');
      if (res.ok) {
        const data = await res.json();
        if (data.videos) {
          setVideos(data.videos);
        }
      }
      setSelectedVideoId(newVideoId);
      // Auto open calibration for the new video
      setTimeout(() => {
        setIsCalibrationOpen(true);
      }, 700);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Navigation */}
      <Header
        videos={videos}
        selectedVideoId={selectedVideoId}
        onSelectVideo={(id) => setSelectedVideoId(id)}
        onOpenCalibration={() => setIsCalibrationOpen(true)}
        onOpenExport={() => setIsExportOpen(true)}
        onOpenUpload={() => setIsUploadOpen(true)}
        onRunPipeline={handleRunPipeline}
        isRunningPipeline={isRunningPipeline}
        pipelineStatus={pipelineStatus}
        detectorLabel={(videoMeta?.detector?.model || 'yolo26s.pt').replace(/\.pt$/i, '').toUpperCase()}
        faceBlurEnabled={faceBlurEnabled}
        activeCustomerCount={activeCustomerCount}
        totalCustomers={tracks.length}
      />

      {pipelineError && (
        <div className="bg-red-950/60 border-b border-red-900 text-red-200 text-xs px-4 py-2 text-center">
          {pipelineError}
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 lg:p-6 space-y-4">
        
        {/* Upper Row: Side-by-Side Video & 2D Top-Down Store Map */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
          
          {/* Left: CCTV Video Player with detections & floor markers */}
          <div className="flex flex-col gap-2">
            <VideoPlayer
              videoId={selectedVideoId}
              videoMeta={videoMeta}
              currentTime={currentTime}
              isPlaying={isPlaying}
              onTimeUpdate={handleTimeUpdate}
              onDurationChange={(d) => setDuration(d)}
              tracks={tracks}
              calibrationSrc={storeMap?.calibration?.src_points || []}
              showCalibrationOverlay={true}
              videoRef={videoRef}
              faceBlurEnabled={faceBlurEnabled}
              isRunningPipeline={isRunningPipeline}
              pipelineStatus={pipelineStatus}
              onRunPipeline={handleRunPipeline}
            />
          </div>

          {/* Right: 2D Top-Down Store Map & Dynamic Heatmap */}
          <div className="flex flex-col gap-2">
            <FloorMap2D
              storeMap={storeMap}
              tracks={tracks}
              currentTime={currentTime}
              heatmapConfig={heatmapConfig}
            />
          </div>

        </div>

        {/* Middle: Synchronized Timeline Controls */}
        <TimelineControls
          currentTime={currentTime}
          duration={duration}
          isPlaying={isPlaying}
          onPlayPause={handlePlayPause}
          onSeek={handleSeek}
          playbackRate={playbackRate}
          onChangeRate={handleChangePlaybackRate}
          tracks={tracks}
        />

        {/* Lower Row: Heatmap & Spatial Controls + Retail Analytics */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
          
          {/* Spatial & Heatmap Configuration */}
          <HeatmapSettings
            config={heatmapConfig}
            onChange={(c) => setHeatmapConfig(c)}
          />

          {/* Retail Spatial Analytics & Trajectory Logs */}
          <AnalyticsPanel
            analytics={analytics}
            tracks={tracks}
            currentTime={currentTime}
          />

        </div>

      </main>

      {/* Floor Calibration Modal */}
      <CalibrationModal
        isOpen={isCalibrationOpen}
        onClose={() => setIsCalibrationOpen(false)}
        videoId={selectedVideoId}
        initialSrcPoints={storeMap?.calibration?.src_points || []}
        initialDstPoints={storeMap?.calibration?.dst_points || []}
        onSaveCalibration={handleSaveCalibration}
      />

      {/* Export Artifacts Modal */}
      <ExportModal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        videoId={selectedVideoId}
        storeMap={storeMap}
        tracks={tracks}
        videoMeta={videoMeta}
        analytics={analytics}
      />

      {/* Upload CCTV Video Modal */}
      <UploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onUploadSuccess={handleUploadSuccess}
      />

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-4 px-6 text-center text-xs text-slate-500">
        <p>
          RetailFlow AI — Computer Vision Spatial Reconstruction & Time-Synchronized 2D Heatmap Pipeline
        </p>
      </footer>
    </div>
  );
};

export default App;
