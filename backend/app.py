import os
import json
import mimetypes
import re
import time
import cv2
import threading
from werkzeug.utils import secure_filename
from flask import Flask, request, jsonify, send_file, Response
from flask_cors import CORS
import config
from config import BASE_DIR, ARTIFACTS_DIR, VIDEOS, get_all_videos, register_custom_video, UPLOADS_DIR
from cv_engine import engine
import detectors

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 500 * 1024 * 1024  # 500 MB
CORS(app, resources={r"/*": {"origins": "*"}})

@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({
        "status": "ok",
        "service": "RetailFlow AI Engine",
        "person_model": config.YOLO_MODEL,
        "face_blur_enabled": config.FACE_BLUR_ENABLED
    })

@app.route("/api/videos", methods=["GET"])
def get_videos():
    video_list = []
    all_videos = get_all_videos()
    for vid, conf in all_videos.items():
        art_dir = os.path.join(ARTIFACTS_DIR, vid)
        has_artifacts = os.path.exists(os.path.join(art_dir, "tracks.json"))
        
        meta = {}
        try:
            meta = engine.extract_metadata(vid)
        except Exception as e:
            meta = {"error": str(e)}

        video_list.append({
            "id": vid,
            "title": conf["title"],
            "description": conf.get("description", ""),
            "has_artifacts": has_artifacts,
            "anonymized": os.path.exists(engine.blurred_video_path(vid)),
            "metadata": meta
        })
    return jsonify({"videos": video_list})

@app.route("/api/upload", methods=["POST"])
def upload_video():
    try:
        if "file" not in request.files:
            return jsonify({"error": "No file part in request"}), 400

        file = request.files["file"]
        if file.filename == "":
            return jsonify({"error": "No file selected"}), 400

        raw_title = request.form.get("title", "").strip()
        safe_name = secure_filename(file.filename)
        timestamp_prefix = int(time.time())
        unique_filename = f"{timestamp_prefix}_{safe_name}"
        save_path = os.path.join(UPLOADS_DIR, unique_filename)
        file.save(save_path)

        video_id = f"custom_{timestamp_prefix}"
        title = raw_title if raw_title else safe_name

    # Extract video info & thumbnail
        cap = cv2.VideoCapture(save_path)
        fps = float(cap.get(cv2.CAP_PROP_FPS))
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        ret, frame = cap.read()
        cap.release()

        if not ret or width == 0 or height == 0:
            if os.path.exists(save_path):
                os.remove(save_path)
            return jsonify({"error": "Invalid or unreadable video file"}), 400

        # Save frame 0 thumbnail
        thumb_path = os.path.join(BASE_DIR, "data", "thumbnails", f"{video_id}_frame0.jpg")
        os.makedirs(os.path.dirname(thumb_path), exist_ok=True)
        cv2.imwrite(thumb_path, frame)

        # Initial default floor calibration quadrilateral centered on the visible floor
        calib_src = [
            [int(width * 0.25), int(height * 0.35)],  # Top-Left
            [int(width * 0.75), int(height * 0.35)],  # Top-Right
            [int(width * 0.85), int(height * 0.85)],  # Bottom-Right
            [int(width * 0.15), int(height * 0.85)]   # Bottom-Left
        ]
        calib_dst = [
            [180, 160],
            [620, 160],
            [620, 680],
            [180, 680]
        ]

        custom_entry = {
            "id": video_id,
            "title": title,
            "filename": os.path.join("uploads", unique_filename),
            "description": f"Custom uploaded CCTV video ({width}x{height} @ {round(fps, 1)} FPS)",
            "fps_sample": 5,
            "calibration_src": calib_src,
            "calibration_dst": calib_dst,
            "store_map": {
                "name": f"{title} - Top-Down Floor Map",
                "dimensions": {"width": 800, "height": 800, "unit": "px"},
                "camera": {
                    "x": 400,
                    "y": 780,
                    "height_m": 3.0,
                    "label": f"{title} CCTV",
                    "fov_angle": 70
                },
                "boundary": [
                    [100, 120], [700, 120], [720, 720], [80, 720]
                ],
                "unseen_regions": [
                    {"name": "Camera Blind Spot", "polygon": [[0, 0], [800, 0], [800, 100], [0, 100]], "reason": "Beyond Camera Angle"}
                ],
                "shelves": [
                    {
                        "id": "shelf_left",
                        "name": "Left Aisle Shelving",
                        "type": "rack",
                        "x": 120,
                        "y": 200,
                        "width": 120,
                        "height": 420,
                        "color": "#3b82f6"
                    },
                    {
                        "id": "shelf_right",
                        "name": "Right Aisle Shelving",
                        "type": "rack",
                        "x": 560,
                        "y": 200,
                        "width": 120,
                        "height": 420,
                        "color": "#10b981"
                    }
                ],
                "walkable_area": [
                    [240, 150], [560, 150], [600, 700], [200, 700]
                ],
                "zones": [
                    {
                        "id": "zone_main",
                        "name": "Main Shopping Corridor",
                        "bounds": {"x1": 240, "y1": 150, "x2": 560, "y2": 700},
                        "color": "rgba(59, 130, 246, 0.25)"
                    }
                ]
            }
        }

        register_custom_video(video_id, custom_entry)

        # Run CV pipeline (YOLO persons -> FaceNet faces -> blurred video) in a background thread
        engine.start_pipeline_async(video_id, max_duration_sec=None)

        return jsonify({
            "status": "success",
            "video_id": video_id,
            "title": title,
            "message": "Video uploaded successfully. CV processing started in background."
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": f"Upload failed: {str(e)}"}), 500

@app.route("/api/pipeline/status/<video_id>", methods=["GET"])
def get_pipeline_status(video_id):
    """
    status: processing | ready | error | idle
    stage:  loading_models | detecting_people | blurring_faces | finalizing | done
    progress: 0.0 - 1.0
    """
    job = engine.get_job(video_id)
    if job:
        return jsonify({
            "status": job.get("status", "processing"),
            "stage": job.get("stage"),
            "progress": job.get("progress", 0.0),
            "error": job.get("error"),
            "video_id": video_id
        })
    tracks_file = os.path.join(ARTIFACTS_DIR, video_id, "tracks.json")
    if os.path.exists(tracks_file):
        return jsonify({"status": "ready", "stage": "done", "progress": 1.0, "video_id": video_id})
    return jsonify({"status": "idle", "stage": None, "progress": 0.0, "video_id": video_id})

@app.route("/api/artifacts/<video_id>/<name>", methods=["GET"])
def get_artifact(video_id, name):
    all_videos = get_all_videos()
    if video_id not in all_videos:
        return jsonify({"error": "Unknown video"}), 404
    
    # Only the JSON artifacts are exposed here (never the video files)
    if name not in ("video_metadata.json", "store_map.json", "tracks.json", "analytics.json"):
        return jsonify({"error": "Artifact not found"}), 404

    file_path = os.path.join(ARTIFACTS_DIR, video_id, name)
    if not os.path.exists(file_path):
        # Not generated yet: kick the pipeline off in the background (it can take minutes)
        started = engine.start_pipeline_async(video_id, max_duration_sec=None)
        return jsonify({"error": "Artifact not generated yet; pipeline started" if started
                        else "Artifact not generated yet; pipeline is running",
                        "status": "processing"}), 404

    with open(file_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    return jsonify(data)

@app.route("/api/pipeline/run", methods=["POST"])
def run_pipeline_api():
    payload = request.get_json() or {}
    video_id = payload.get("video_id", "cashier_store")
    max_duration = payload.get("max_duration_sec", None)
    calibration = payload.get("calibration", None)

    if video_id not in get_all_videos():
        return jsonify({"error": "Unknown video"}), 404

    # Detection + face blurring takes minutes on CPU, so run it in the background and
    # let the UI poll /api/pipeline/status/<video_id> for progress.
    started = engine.start_pipeline_async(video_id, custom_calibration=calibration,
                                          max_duration_sec=max_duration)
    return jsonify({"status": "started" if started else "already_running", "video_id": video_id}), 202

@app.route("/api/calibration/reproject", methods=["POST"])
def reproject_calibration():
    payload = request.get_json() or {}
    video_id = payload.get("video_id")
    src = payload.get("src")
    dst = payload.get("dst")

    if not video_id or not src or not dst:
        return jsonify({"error": "Missing parameters"}), 400

    try:
        res = engine.reproject_tracks(video_id, src, dst)
        return jsonify(res)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/thumbnails/<video_id>", methods=["GET"])
def get_thumbnail(video_id):
    """First frame of the video (used for floor calibration), with faces blurred."""
    if video_id not in get_all_videos():
        return jsonify({"error": "Unknown video"}), 404

    thumb_dir = os.path.join(BASE_DIR, "data", "thumbnails")
    os.makedirs(thumb_dir, exist_ok=True)

    if not config.FACE_BLUR_ENABLED:
        thumb_path = os.path.join(thumb_dir, f"{video_id}_frame0.jpg")
    else:
        thumb_path = os.path.join(thumb_dir, f"{video_id}_frame0_blurred.jpg")

    if not os.path.exists(thumb_path):
        cap = cv2.VideoCapture(engine.get_video_path(video_id))
        ret, frame = cap.read()
        cap.release()
        if not ret:
            return jsonify({"error": "Thumbnail not found"}), 404
        try:
            frame = detectors.anonymize_frame(frame)
        except Exception as e:
            return jsonify({"error": f"Could not anonymise thumbnail: {e}"}), 503
        cv2.imwrite(thumb_path, frame)

    return send_file(thumb_path, mimetype="image/jpeg")

@app.route("/videos/<video_id>/stream", methods=["GET"])
def stream_video(video_id):
    if video_id not in get_all_videos():
        return jsonify({"error": "Video not found"}), 404

    if config.FACE_BLUR_ENABLED:
        # Only the face-blurred copy is ever streamed to the browser
        video_path = engine.blurred_video_path(video_id)
        if not os.path.exists(video_path):
            return jsonify({"error": "Anonymised video not generated yet. Run the CV pipeline."}), 409
    else:
        video_path = engine.get_video_path(video_id)
        if not os.path.exists(video_path):
            return jsonify({"error": "File not found"}), 404

    file_size = os.path.getsize(video_path)
    range_header = request.headers.get("Range", None)

    if not range_header:
        return send_file(video_path, mimetype="video/mp4")

    # Handle HTTP 206 Partial Content for video scrubbing
    byte_range = re.findall(r"\d+", range_header)
    start_byte = int(byte_range[0]) if byte_range else 0
    end_byte = int(byte_range[1]) if len(byte_range) > 1 else file_size - 1

    chunk_size = (end_byte - start_byte) + 1

    def generate():
        with open(video_path, "rb") as f:
            f.seek(start_byte)
            bytes_left = chunk_size
            while bytes_left > 0:
                read_amount = min(bytes_left, 1024 * 1024)
                data = f.read(read_amount)
                if not data:
                    break
                bytes_left -= len(data)
                yield data

    resp = Response(
        generate(),
        status=206,
        mimetype="video/mp4",
        direct_passthrough=True
    )
    resp.headers.add("Content-Range", f"bytes {start_byte}-{end_byte}/{file_size}")
    resp.headers.add("Accept-Ranges", "bytes")
    resp.headers.add("Content-Length", str(chunk_size))
    return resp

DIST_DIR = os.path.join(BASE_DIR, "frontend", "dist")

@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve_frontend(path):
    if path.startswith("api/") or path.startswith("videos/"):
        return jsonify({"error": "Endpoint not found"}), 404
    file_path = os.path.join(DIST_DIR, path)
    if os.path.exists(file_path) and os.path.isfile(file_path):
        return send_file(file_path)
    index_file = os.path.join(DIST_DIR, "index.html")
    if os.path.exists(index_file):
        return send_file(index_file)
    return jsonify({"message": "RetailFlow AI API Server Running. Frontend dist not found."})

if __name__ == "__main__":
    print("Starting RetailFlow AI Server on http://127.0.0.1:5000")
    app.run(host="0.0.0.0", port=5000, debug=False, threaded=True)

