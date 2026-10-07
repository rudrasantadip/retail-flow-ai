import cv2
import numpy as np
import json
import os
import shutil
import subprocess
import threading
import time
from typing import Callable, Dict, List, Optional, Tuple, Any

import config
from config import BASE_DIR, ARTIFACTS_DIR, VIDEOS, get_all_videos
import detectors

# Distinct vibrant colors for customer trajectories
TRACK_COLORS = [
    "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
    "#ec4899", "#06b6d4", "#14b8a6", "#f97316", "#a855f7",
    "#6366f1", "#84cc16", "#e11d48", "#0ea5e9", "#d946ef"
]

class CVEngine:
    def __init__(self):
        self.artifacts_dir = ARTIFACTS_DIR
        os.makedirs(self.artifacts_dir, exist_ok=True)
        # Background job state, keyed by video_id: {status, stage, progress, error, ...}
        self.jobs: Dict[str, Dict[str, Any]] = {}
        self._jobs_lock = threading.Lock()

    # ------------------------------------------------------------------ jobs
    def _set_job(self, video_id: str, **fields):
        with self._jobs_lock:
            job = self.jobs.setdefault(video_id, {})
            job.update(fields)
            job["updated_at"] = time.time()

    def get_job(self, video_id: str) -> Optional[Dict[str, Any]]:
        with self._jobs_lock:
            job = self.jobs.get(video_id)
            return dict(job) if job else None

    def start_pipeline_async(self, video_id: str, custom_calibration: Dict[str, Any] = None,
                             max_duration_sec: float = None) -> bool:
        """Run the pipeline in a background thread. Returns False if one is already running."""
        with self._jobs_lock:
            existing = self.jobs.get(video_id)
            if existing and existing.get("status") == "processing":
                return False
            self.jobs[video_id] = {"status": "processing", "stage": "queued", "progress": 0.0,
                                   "error": None, "started_at": time.time(),
                                   "updated_at": time.time()}

        def _worker():
            try:
                self.run_pipeline(video_id, custom_calibration=custom_calibration,
                                  max_duration_sec=max_duration_sec)
            except Exception as e:  # noqa: BLE001
                import traceback
                traceback.print_exc()
                self._set_job(video_id, status="error", stage="failed", error=str(e))

        threading.Thread(target=_worker, daemon=True).start()
        return True

    def blurred_video_path(self, video_id: str) -> str:
        return os.path.join(self.artifacts_dir, video_id, config.BLURRED_VIDEO_NAME)

    def get_video_path(self, video_id: str) -> str:
        all_videos = get_all_videos()
        if video_id not in all_videos:
            raise ValueError(f"Unknown video id: {video_id}")
        fn = all_videos[video_id]["filename"]
        if os.path.isabs(fn):
            return fn
        if os.path.exists(os.path.join(BASE_DIR, fn)):
            return os.path.join(BASE_DIR, fn)
        if os.path.exists(os.path.join(BASE_DIR, "uploads", fn)):
            return os.path.join(BASE_DIR, "uploads", fn)
        return os.path.join(BASE_DIR, fn)

    def extract_metadata(self, video_id: str) -> Dict[str, Any]:
        video_path = self.get_video_path(video_id)
        if not os.path.exists(video_path):
            raise FileNotFoundError(f"Video file not found: {video_path}")

        cap = cv2.VideoCapture(video_path)
        fps = float(cap.get(cv2.CAP_PROP_FPS))
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        duration = float(total_frames / fps) if fps > 0 else 0.0
        cap.release()

        info = get_all_videos()[video_id]
        meta = {
            "video_id": video_id,
            "title": info["title"],
            "description": info["description"],
            "filename": info["filename"],
            "resolution": {"width": width, "height": height},
            "fps": round(fps, 2),
            "total_frames": total_frames,
            "duration_seconds": round(duration, 2),
            "sample_fps": info.get("fps_sample", 5)
        }
        return meta

    def compute_homography(self, src_pts: List[List[float]], dst_pts: List[List[float]]) -> np.ndarray:
        src = np.array(src_pts, dtype=np.float32)
        dst = np.array(dst_pts, dtype=np.float32)
        H, _ = cv2.findHomography(src, dst)
        return H

    def project_point(self, H: np.ndarray, x: float, y: float, max_w: float = 800.0, max_h: float = 800.0) -> Tuple[float, float]:
        if H is None:
            return (x, y)
        vec = np.array([x, y, 1.0], dtype=np.float32).reshape((3, 1))
        proj = np.dot(H, vec)
        scale = proj[2, 0]
        if abs(scale) < 1e-6:
            return (x, y)
        px = float(proj[0, 0] / scale)
        py = float(proj[1, 0] / scale)
        # Clamp to realistic map range with slight margin
        px = max(20.0, min(max_w - 20.0, px))
        py = max(20.0, min(max_h - 20.0, py))
        return (round(px, 1), round(py, 1))

    # ---------------------------------------------------------------- privacy
    @staticmethod
    def _face_rel(face: List[float], bbox: List[float]) -> List[float]:
        """Express a face box relative to its person box so it can follow interpolated boxes."""
        x, y, w, h = bbox
        w, h = max(1.0, float(w)), max(1.0, float(h))
        return [(face[0] - x) / w, (face[1] - y) / h, (face[2] - x) / w, (face[3] - y) / h]

    def _build_blur_schedule(self, raw_tracks: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Build the per-track data needed to blur EVERY video frame from detections that were only
        sampled at ~5 FPS. Uses all raw tracks (including short/noisy ones that are later dropped
        from analytics) so no detected person is ever left un-blurred.
        """
        schedule = []
        for t in raw_tracks:
            pos = t["positions"]
            face_idx = [i for i, p in enumerate(pos) if p.get("faces")]
            if not face_idx:
                continue
            schedule.append({
                "times": np.array([p["timestamp"] for p in pos], dtype=float),
                "boxes": np.array([p["bbox"] for p in pos], dtype=float),  # x, y, w, h
                "face_idx": np.array(face_idx, dtype=int),
                "face_rel": {i: [self._face_rel(f, pos[i]["bbox"]) for f in pos[i]["faces"]]
                             for i in face_idx},
            })
        return schedule

    def _blur_boxes_at(self, schedule: List[Dict[str, Any]], t: float) -> List[List[float]]:
        """Face boxes [x1, y1, x2, y2] to blur at video time t (seconds)."""
        max_gap = config.FACE_INTERP_MAX_GAP_SEC
        hold = config.FACE_HOLD_SEC
        max_face_age = 2.0  # reuse the most recent face offset for up to this long
        out: List[List[float]] = []
        for s in schedule:
            times = s["times"]
            if t < times[0] - hold or t > times[-1] + hold:
                continue
            i = int(np.searchsorted(times, t))
            if i == 0:
                box = s["boxes"][0]
            elif i >= len(times):
                box = s["boxes"][-1]
            else:
                t0, t1 = times[i - 1], times[i]
                if t1 - t0 <= max_gap:
                    a = (t - t0) / max(1e-6, t1 - t0)
                    box = (1.0 - a) * s["boxes"][i - 1] + a * s["boxes"][i]
                else:
                    if min(t - t0, t1 - t) > hold:
                        continue  # in the middle of a long detection gap
                    box = s["boxes"][i - 1] if (t - t0) <= (t1 - t) else s["boxes"][i]
            fi = s["face_idx"]
            j = int(fi[int(np.argmin(np.abs(times[fi] - t)))])
            if abs(times[j] - t) > max_face_age:
                continue
            x, y, w, h = [float(v) for v in box]
            for rel in s["face_rel"][j]:
                out.append([x + rel[0] * w, y + rel[1] * h, x + rel[2] * w, y + rel[3] * h])
        return out

    @staticmethod
    def _find_ffmpeg() -> Optional[str]:
        exe = shutil.which("ffmpeg")
        if exe:
            return exe
        try:
            import imageio_ffmpeg
            return imageio_ffmpeg.get_ffmpeg_exe()
        except Exception:  # noqa: BLE001
            return None

    def _transcode_h264(self, src: str, dst: str) -> bool:
        """Re-encode to browser-playable H.264 (OpenCV's own writer only produces MPEG-4 Part 2)."""
        ffmpeg = self._find_ffmpeg()
        if not ffmpeg:
            return False
        cmd = [ffmpeg, "-y", "-loglevel", "error", "-i", src, "-an",
               "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2",
               "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
               "-pix_fmt", "yuv420p", "-movflags", "+faststart", dst]
        try:
            res = subprocess.run(cmd, capture_output=True, text=True, timeout=3600)
            if res.returncode != 0:
                print(f"[cv_engine] ffmpeg failed: {res.stderr[:400]}")
            return res.returncode == 0 and os.path.exists(dst)
        except Exception as e:  # noqa: BLE001
            print(f"[cv_engine] ffmpeg error: {e}")
            return False

    def _write_blurred_video(self, video_id: str, video_path: str, meta: Dict[str, Any],
                             schedule: List[Dict[str, Any]], total_frames: int,
                             progress_cb: Callable[[float], None]) -> Dict[str, Any]:
        """Second pass: write an anonymised copy of the video with every detected face blurred."""
        dest_dir = os.path.join(self.artifacts_dir, video_id)
        os.makedirs(dest_dir, exist_ok=True)
        tmp_raw = os.path.join(dest_dir, "blurred.raw.tmp.mp4")
        tmp_h264 = os.path.join(dest_dir, "blurred.h264.tmp.mp4")
        final = self.blurred_video_path(video_id)

        cap = cv2.VideoCapture(video_path)
        fps = meta["fps"] if meta["fps"] > 0 else 25.0
        w, h = meta["resolution"]["width"], meta["resolution"]["height"]
        writer = cv2.VideoWriter(tmp_raw, cv2.VideoWriter_fourcc(*"mp4v"), fps, (w, h))
        if not writer.isOpened():
            cap.release()
            raise RuntimeError("Could not open a video writer for the anonymised video")

        frames_blurred = 0
        frame_idx = 0
        try:
            while frame_idx < total_frames:
                ret, frame = cap.read()
                if not ret:
                    break
                boxes = self._blur_boxes_at(schedule, frame_idx / fps)
                if boxes:
                    detectors.blur_regions(frame, boxes)
                    frames_blurred += 1
                writer.write(frame)
                frame_idx += 1
                if frame_idx % 50 == 0:
                    progress_cb(frame_idx / max(1, total_frames))
        finally:
            cap.release()
            writer.release()

        playable = self._transcode_h264(tmp_raw, tmp_h264)
        os.replace(tmp_h264 if playable else tmp_raw, final)
        for leftover in (tmp_raw, tmp_h264):
            if os.path.exists(leftover):
                os.remove(leftover)
        if not playable:
            print("[cv_engine] WARNING: ffmpeg not available - anonymised video is MPEG-4 Part 2 and "
                  "may not play in browsers. Install ffmpeg or `pip install imageio-ffmpeg`.")
        progress_cb(1.0)
        return {"frames_written": frame_idx, "frames_blurred": frames_blurred,
                "browser_playable": playable}

    # --------------------------------------------------------------- pipeline
    def run_pipeline(self, video_id: str, custom_calibration: Dict[str, Any] = None,
                     max_duration_sec: float = None) -> Dict[str, Any]:
        """
        Runs the full Computer Vision Pipeline:
        1. Ingests CCTV video and extracts metadata
        2. Samples frames at ~5 FPS
        3. Detects PERSONS ONLY with YOLO (shelves, racks, groceries etc. are filtered out)
        4. Detects faces inside each person box with FaceNet's MTCNN detector
        5. Multi-object tracking with persistent IDs across frames
        6. Computes homography transformation matrix
        7. Projects customer trajectories into 2D map space
        8. Computes dwell times, zone breakdown, and heat density
        9. Writes an anonymised copy of the video with every face blurred
        10. Saves structured artifacts (store_map.json, tracks.json, video_metadata.json, ...)
        """
        self._set_job(video_id, status="processing", stage="loading_models", progress=0.0,
                      error=None)
        blur_enabled = config.FACE_BLUR_ENABLED
        # Pass 1 (detection) is ~85% of the work when blurring, 100% otherwise
        detect_share = 0.85 if blur_enabled else 1.0

        video_cfg = get_all_videos()[video_id]
        video_path = self.get_video_path(video_id)
        meta = self.extract_metadata(video_id)

        person_det = detectors.get_person_detector()
        face_det = detectors.get_face_detector() if blur_enabled else None

        # Calibration points
        if custom_calibration and "src" in custom_calibration and "dst" in custom_calibration:
            src_pts = custom_calibration["src"]
            dst_pts = custom_calibration["dst"]
        else:
            src_pts = video_cfg["calibration_src"]
            dst_pts = video_cfg["calibration_dst"]

        H = self.compute_homography(src_pts, dst_pts)

        cap = cv2.VideoCapture(video_path)
        fps = meta["fps"]
        sample_fps = meta["sample_fps"]
        frame_step = max(1, int(round(fps / sample_fps)))

        total_frames = meta["total_frames"]
        if max_duration_sec:
            max_frames = int(max_duration_sec * fps)
            total_frames = min(total_frames, max_frames)
        frame_h = meta["resolution"]["height"]
        expected_samples = max(1, total_frames // frame_step)

        # Tracker state
        next_track_id = 1
        active_tracks: Dict[int, Dict[str, Any]] = {}
        completed_tracks: List[Dict[str, Any]] = []

        # Store layout zones
        zones = video_cfg["store_map"]["zones"]

        frame_idx = 0
        processed_count = 0
        person_detections_total = 0
        face_detections_total = 0

        self._set_job(video_id, stage="detecting_people", progress=0.0)

        while cap.isOpened() and frame_idx < total_frames:
            ret, frame = cap.read()
            if not ret:
                break

            if frame_idx % frame_step == 0:
                timestamp = round(frame_idx / fps, 2)

                # ---- YOLO person detection (class 0 only) + FaceNet/MTCNN face detection
                detections = []
                for d in person_det.detect(frame):
                    x, y, w, h = d["bbox"]
                    faces: List[List[int]] = []
                    if face_det is not None:
                        faces = [[int(round(v)) for v in f]
                                 for f in face_det.detect_in_person(frame, d["bbox"])]
                    person_detections_total += 1
                    face_detections_total += len(faces)
                    detections.append({
                        "bbox": [int(x), int(y), int(w), int(h)],
                        # Bottom-center of the box = feet = contact point with the floor plane
                        "floor_x": float(x + w / 2.0),
                        "floor_y": float(min(frame_h - 1, y + h)),
                        "confidence": d["confidence"],
                        "faces": faces,
                    })

                # Association & Multi-Object Tracking
                # Calculate cost matrix based on Euclidean distance
                matched_tracks = set()
                matched_detections = set()

                if len(active_tracks) > 0 and len(detections) > 0:
                    track_ids = list(active_tracks.keys())
                    cost_matrix = np.zeros((len(track_ids), len(detections)), dtype=np.float32)

                    for i, tid in enumerate(track_ids):
                        t_pos = active_tracks[tid]["last_pos"]
                        for j, det in enumerate(detections):
                            dist = np.hypot(t_pos[0] - det["floor_x"], t_pos[1] - det["floor_y"])
                            cost_matrix[i, j] = dist

                    # Greedy nearest neighbor association with distance threshold
                    max_distance = 120.0
                    for _ in range(min(len(track_ids), len(detections))):
                        min_val = np.min(cost_matrix)
                        if min_val > max_distance:
                            break
                        min_idx = np.unravel_index(np.argmin(cost_matrix), cost_matrix.shape)
                        t_idx, d_idx = min_idx
                        tid = track_ids[t_idx]
                        if tid not in matched_tracks and d_idx not in matched_detections:
                            matched_tracks.add(tid)
                            matched_detections.add(d_idx)
                            det = detections[d_idx]

                            # Map space projection
                            map_x, map_y = self.project_point(H, det["floor_x"], det["floor_y"])

                            active_tracks[tid]["positions"].append({
                                "timestamp": timestamp,
                                "frame": frame_idx,
                                "bbox": det["bbox"],
                                "faces": det["faces"],
                                "img_x": round(det["floor_x"], 1),
                                "img_y": round(det["floor_y"], 1),
                                "map_x": map_x,
                                "map_y": map_y,
                                "confidence": det["confidence"]
                            })
                            active_tracks[tid]["last_pos"] = (det["floor_x"], det["floor_y"])
                            active_tracks[tid]["last_seen_frame"] = frame_idx
                            active_tracks[tid]["disappeared_count"] = 0

                        cost_matrix[t_idx, :] = 1e6
                        cost_matrix[:, d_idx] = 1e6

                # Handle unmatched tracks (increase disappeared counter)
                for tid, trk in list(active_tracks.items()):
                    if tid not in matched_tracks:
                        trk["disappeared_count"] += 1
                        # If lost for more than 12 sample cycles (~2.4s), complete the track
                        if trk["disappeared_count"] > 12:
                            completed_tracks.append(trk)
                            del active_tracks[tid]

                # Handle unmatched detections (create new track)
                for j, det in enumerate(detections):
                    if j not in matched_detections:
                        map_x, map_y = self.project_point(H, det["floor_x"], det["floor_y"])
                        color_choice = TRACK_COLORS[(next_track_id - 1) % len(TRACK_COLORS)]
                        active_tracks[next_track_id] = {
                            "track_id": next_track_id,
                            "color": color_choice,
                            "first_seen": timestamp,
                            "last_seen_frame": frame_idx,
                            "disappeared_count": 0,
                            "last_pos": (det["floor_x"], det["floor_y"]),
                            "positions": [{
                                "timestamp": timestamp,
                                "frame": frame_idx,
                                "bbox": det["bbox"],
                                "faces": det["faces"],
                                "img_x": round(det["floor_x"], 1),
                                "img_y": round(det["floor_y"], 1),
                                "map_x": map_x,
                                "map_y": map_y,
                                "confidence": det["confidence"]
                            }]
                        }
                        next_track_id += 1

                processed_count += 1
                if processed_count % 5 == 0:
                    self._set_job(video_id,
                                  progress=round(detect_share * min(1.0, processed_count / expected_samples), 3))

            frame_idx += 1

        cap.release()

        # Combine any remaining active tracks
        all_raw_tracks = completed_tracks + list(active_tracks.values())

        # ---- Anonymised video (blur schedule uses ALL raw tracks, even ones dropped below)
        privacy: Dict[str, Any] = {
            "face_blur_enabled": blur_enabled,
            "face_model": "FaceNet MTCNN (facenet-pytorch)" if blur_enabled else None,
            "blurred_video": None,
            "browser_playable": None,
            "face_detections": face_detections_total,
            "frames_blurred": 0,
            "generated_at": int(time.time()),
        }
        if blur_enabled:
            self._set_job(video_id, stage="blurring_faces", progress=detect_share)
            schedule = self._build_blur_schedule(all_raw_tracks)
            info = self._write_blurred_video(
                video_id, video_path, meta, schedule, total_frames,
                progress_cb=lambda f: self._set_job(video_id, progress=round(detect_share + (1 - detect_share) * f, 3)),
            )
            privacy["blurred_video"] = config.BLURRED_VIDEO_NAME
            privacy["browser_playable"] = info["browser_playable"]
            privacy["frames_blurred"] = info["frames_blurred"]

        self._set_job(video_id, stage="finalizing", progress=0.99)

        # Filter spurious noise (require minimum length of detections)
        valid_tracks = [t for t in all_raw_tracks if len(t["positions"]) >= 4]

        # Trajectory smoothing and zone analytics calculation
        processed_tracks = []
        for t in valid_tracks:
            positions = t["positions"]
            # Temporal smoothing on map coordinates (3-point moving average)
            for k in range(len(positions)):
                start_k = max(0, k - 1)
                end_k = min(len(positions), k + 2)
                sub = positions[start_k:end_k]
                avg_mx = round(float(np.mean([p["map_x"] for p in sub])), 1)
                avg_my = round(float(np.mean([p["map_y"] for p in sub])), 1)
                positions[k]["map_x"] = avg_mx
                positions[k]["map_y"] = avg_my

            start_t = positions[0]["timestamp"]
            end_t = positions[-1]["timestamp"]
            dwell = round(max(0.5, end_t - start_t), 1)

            # Zone attribution
            zones_visited = set()
            for p in positions:
                mx, my = p["map_x"], p["map_y"]
                for z in zones:
                    b = z["bounds"]
                    if b["x1"] <= mx <= b["x2"] and b["y1"] <= my <= b["y2"]:
                        zones_visited.add(z["name"])

            # Total spatial movement distance in map space
            dist = 0.0
            for idx in range(1, len(positions)):
                p1 = positions[idx - 1]
                p2 = positions[idx]
                dist += np.hypot(p2["map_x"] - p1["map_x"], p2["map_y"] - p1["map_y"])

            processed_tracks.append({
                "track_id": t["track_id"],
                "color": t["color"],
                "start_time": start_t,
                "end_time": end_t,
                "dwell_time": dwell,
                "distance_traveled": round(dist, 1),
                "zones_visited": list(zones_visited),
                "point_count": len(positions),
                "positions": positions
            })

        # Sort tracks by start time
        processed_tracks.sort(key=lambda x: x["start_time"])

        # Compute aggregate retail analytics
        total_customers = len(processed_tracks)
        avg_dwell = round(float(np.mean([t["dwell_time"] for t in processed_tracks])), 1) if total_customers > 0 else 0.0
        max_dwell = max([t["dwell_time"] for t in processed_tracks]) if total_customers > 0 else 0.0

        # Zone visit statistics
        zone_stats = {z["name"]: {"count": 0, "color": z.get("color", "")} for z in zones}
        for t in processed_tracks:
            for zn in t["zones_visited"]:
                if zn in zone_stats:
                    zone_stats[zn]["count"] += 1

        analytics = {
            "total_tracked_customers": total_customers,
            "average_dwell_time_seconds": avg_dwell,
            "max_dwell_time_seconds": max_dwell,
            "zone_breakdown": zone_stats,
            "processed_frames": processed_count,
            "duration_analyzed": meta["duration_seconds"],
            "person_detections": person_detections_total,
            "faces_blurred": face_detections_total,
            "detector_model": person_det.model_name
        }

        # Record what produced these artifacts so the UI can show it
        meta["detector"] = {
            "model": person_det.model_name,
            "classes": ["person"],
            "confidence_threshold": config.YOLO_CONF
        }
        meta["privacy"] = privacy

        # Structure store map
        store_map_data = {
            "name": video_cfg["store_map"]["name"],
            "dimensions": video_cfg["store_map"]["dimensions"],
            "camera": video_cfg["store_map"]["camera"],
            "boundary": video_cfg["store_map"]["boundary"],
            "unseen_regions": video_cfg["store_map"]["unseen_regions"],
            "shelves": video_cfg["store_map"]["shelves"],
            "walkable_area": video_cfg["store_map"]["walkable_area"],
            "zones": video_cfg["store_map"]["zones"],
            "calibration": {
                "src_points": src_pts,
                "dst_points": dst_pts,
                "homography_matrix": H.tolist() if H is not None else None
            }
        }

        # Save artifacts to backend/artifacts/<video_id>/
        dest_dir = os.path.join(self.artifacts_dir, video_id)
        os.makedirs(dest_dir, exist_ok=True)

        with open(os.path.join(dest_dir, "video_metadata.json"), "w", encoding="utf-8") as f:
            json.dump(meta, f, indent=2)

        with open(os.path.join(dest_dir, "store_map.json"), "w", encoding="utf-8") as f:
            json.dump(store_map_data, f, indent=2)

        with open(os.path.join(dest_dir, "tracks.json"), "w", encoding="utf-8") as f:
            json.dump(processed_tracks, f, indent=2)

        with open(os.path.join(dest_dir, "analytics.json"), "w", encoding="utf-8") as f:
            json.dump(analytics, f, indent=2)

        self._set_job(video_id, status="ready", stage="done", progress=1.0)

        return {
            "status": "success",
            "video_metadata": meta,
            "store_map": store_map_data,
            "tracks": processed_tracks,
            "analytics": analytics
        }

    def reproject_tracks(self, video_id: str, new_src: List[List[float]], new_dst: List[List[float]]) -> Dict[str, Any]:
        """
        Allows instantaneous re-projection of existing tracked points when the user adjusts
        calibration points interactively in the React UI!
        """
        dest_dir = os.path.join(self.artifacts_dir, video_id)
        tracks_file = os.path.join(dest_dir, "tracks.json")
        store_map_file = os.path.join(dest_dir, "store_map.json")

        if not os.path.exists(tracks_file) or not os.path.exists(store_map_file):
            raise FileNotFoundError(f"Artifacts for {video_id} not yet generated. Run pipeline first.")

        with open(tracks_file, "r", encoding="utf-8") as f:
            tracks = json.load(f)

        with open(store_map_file, "r", encoding="utf-8") as f:
            store_map = json.load(f)

        H = self.compute_homography(new_src, new_dst)

        for trk in tracks:
            for p in trk["positions"]:
                mx, my = self.project_point(H, p["img_x"], p["img_y"])
                p["map_x"] = mx
                p["map_y"] = my

        store_map["calibration"]["src_points"] = new_src
        store_map["calibration"]["dst_points"] = new_dst
        store_map["calibration"]["homography_matrix"] = H.tolist() if H is not None else None

        with open(tracks_file, "w", encoding="utf-8") as f:
            json.dump(tracks, f, indent=2)

        with open(store_map_file, "w", encoding="utf-8") as f:
            json.dump(store_map, f, indent=2)

        return {"status": "reprojected", "tracks": tracks, "store_map": store_map}

engine = CVEngine()
