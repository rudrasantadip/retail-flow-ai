export interface VideoMeta {
  video_id: string;
  title: string;
  description: string;
  filename: string;
  resolution: { width: number; height: number };
  fps: number;
  total_frames: number;
  duration_seconds: number;
  sample_fps: number;
  detector?: DetectorInfo;
  privacy?: PrivacyInfo;
}

export interface DetectorInfo {
  model: string;            // e.g. "yolo26s.pt"
  classes: string[];        // always ["person"]
  confidence_threshold: number;
}

export interface PrivacyInfo {
  face_blur_enabled: boolean;
  face_model: string | null;
  blurred_video: string | null;   // null until the anonymised video has been generated
  browser_playable: boolean | null;
  face_detections: number;
  frames_blurred: number;
  generated_at: number;           // unix seconds, used to bust the browser's video cache
}

export interface VideoItem {
  id: string;
  title: string;
  description: string;
  has_artifacts: boolean;
  anonymized?: boolean;
  metadata: Partial<VideoMeta>;
}

export type PipelineState = 'idle' | 'processing' | 'ready' | 'error';
export type PipelineStage =
  | 'loading_models'
  | 'detecting_people'
  | 'blurring_faces'
  | 'finalizing'
  | 'done'
  | null;

export interface PipelineStatus {
  status: PipelineState;
  stage: PipelineStage;
  progress: number;         // 0..1
  error?: string | null;
}

export interface Position {
  timestamp: number;
  frame: number;
  bbox: [number, number, number, number]; // [x, y, w, h] YOLO person box
  faces?: [number, number, number, number][]; // [x1, y1, x2, y2] faces blurred in this person box
  img_x: number;
  img_y: number;
  map_x: number;
  map_y: number;
  confidence: number;
}

export interface Track {
  track_id: number;
  color: string;
  start_time: number;
  end_time: number;
  dwell_time: number;
  distance_traveled: number;
  zones_visited: string[];
  point_count: number;
  positions: Position[];
}

export interface Shelf {
  id: string;
  name: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
}

export interface Zone {
  id: string;
  name: string;
  bounds: { x1: number; y1: number; x2: number; y2: number };
  color: string;
}

export interface UnseenRegion {
  name: string;
  polygon: [number, number][];
  reason: string;
}

export interface CameraConfig {
  x: number;
  y: number;
  height_m: number;
  label: string;
  fov_angle: number;
}

export interface StoreMap {
  name: string;
  dimensions: { width: number; height: number; unit: string };
  camera: CameraConfig;
  boundary: [number, number][];
  unseen_regions: UnseenRegion[];
  shelves: Shelf[];
  walkable_area: [number, number][];
  zones: Zone[];
  calibration: {
    src_points: [number, number][];
    dst_points: [number, number][];
    homography_matrix: number[][] | null;
  };
}

export interface ZoneStat {
  count: number;
  color: string;
}

export interface Analytics {
  total_tracked_customers: number;
  average_dwell_time_seconds: number;
  max_dwell_time_seconds: number;
  zone_breakdown: Record<string, ZoneStat>;
  processed_frames: number;
  duration_analyzed: number;
  person_detections?: number;
  faces_blurred?: number;
  detector_model?: string;
}

export type HeatmapMode = 'cumulative' | 'window';
export type ColorScheme = 'classic' | 'thermal' | 'emerald' | 'cyberpunk';

export interface HeatmapConfig {
  mode: HeatmapMode;
  windowDuration: number; // in seconds, for sliding-window
  radius: number;
  intensity: number;
  colorScheme: ColorScheme;
  showTrails: boolean;
  showCustomerDots: boolean;
  showCustomerIds: boolean;
  showShelves: boolean;
  showUnseenAreas: boolean;
  showCameraFrustum: boolean;
  showZones: boolean;
}
