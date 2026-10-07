import os
import json

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
ARTIFACTS_DIR = os.path.join(os.path.dirname(__file__), "artifacts")
os.makedirs(ARTIFACTS_DIR, exist_ok=True)

# Pre-registered retail videos with default homography calibration and store geometry
VIDEOS = {
    "cashier_store": {
        "id": "cashier_store",
        "title": "Scottish Convenience Store - Cashier & Crisp Aisle",
        "filename": "CCTV Footage A Day in the Life of a Scottish Store Cashier  WooGlobe - WooGlobe (720p, h264).mp4",
        "description": "Fixed 720p camera monitoring aisle with shelves, floor distancing markers, and cashier counter.",
        "fps_sample": 5,
        # 4 reference points on the floor plane in image space: [top-left, top-right, bottom-right, bottom-left]
        "calibration_src": [
            [370, 240],   # top-left near cashier entrance
            [510, 240],   # top-right near cashier counter
            [570, 690],   # bottom-right near aisle end
            [350, 690]    # bottom-left near aisle end
        ],
        # Corresponding 4 points in normalized 800x800 map space:
        "calibration_dst": [
            [320, 220],
            [480, 220],
            [480, 680],
            [320, 680]
        ],
        # Store Map layout elements (visible shelves, counters, walkable area, camera)
        "store_map": {
            "name": "Scottish Store - Checkout & Crisp Aisle",
            "dimensions": {"width": 800, "height": 800, "unit": "px"},
            "camera": {
                "x": 400,
                "y": 780,
                "height_m": 2.8,
                "label": "CCTV Cam #1 (High-Angle Aisle)",
                "fov_angle": 65
            },
            "boundary": [
                [200, 100], [600, 100], [680, 750], [120, 750]
            ],
            "unseen_regions": [
                {"name": "Backroom / Storage", "polygon": [[0, 0], [200, 0], [200, 250], [0, 250]], "reason": "Behind Cashier Partition"},
                {"name": "Blind Spot (Right Exterior)", "polygon": [[680, 400], [800, 400], [800, 800], [680, 800]], "reason": "Window / Wall Occlusion"},
                {"name": "Left Perimeter", "polygon": [[0, 250], [120, 250], [120, 800], [0, 800]], "reason": "Behind Wall Shelving"}
            ],
            "shelves": [
                {
                    "id": "shelf_left_counter",
                    "name": "Checkout Counter & Confectionery",
                    "type": "counter",
                    "x": 160,
                    "y": 240,
                    "width": 140,
                    "height": 450,
                    "color": "#3b82f6"
                },
                {
                    "id": "shelf_cashier_desk",
                    "name": "Cashier Till & Register Desk",
                    "type": "checkout",
                    "x": 280,
                    "y": 110,
                    "width": 240,
                    "height": 90,
                    "color": "#ef4444"
                },
                {
                    "id": "shelf_right_rack",
                    "name": "Crisps & Snacks Display Rack",
                    "type": "rack",
                    "x": 500,
                    "y": 250,
                    "width": 150,
                    "height": 440,
                    "color": "#10b981"
                },
                {
                    "id": "shelf_window_display",
                    "name": "Window Promotion Display",
                    "type": "promo",
                    "x": 670,
                    "y": 140,
                    "width": 70,
                    "height": 550,
                    "color": "#f59e0b"
                }
            ],
            "walkable_area": [
                [310, 200], [490, 200], [490, 720], [310, 720]
            ],
            "zones": [
                {
                    "id": "zone_cashier",
                    "name": "Cashier / Payment Zone",
                    "bounds": {"x1": 290, "y1": 180, "x2": 510, "y2": 320},
                    "color": "rgba(239, 68, 68, 0.25)"
                },
                {
                    "id": "zone_mid_aisle",
                    "name": "Crisp Aisle Mid-Section",
                    "bounds": {"x1": 300, "y1": 320, "x2": 500, "y2": 520},
                    "color": "rgba(16, 185, 129, 0.25)"
                },
                {
                    "id": "zone_entrance",
                    "name": "Aisle Entrance / Queue",
                    "bounds": {"x1": 300, "y1": 520, "x2": 500, "y2": 720},
                    "color": "rgba(59, 130, 246, 0.25)"
                }
            ]
        }
    },
    "retail_store": {
        "id": "retail_store",
        "title": "HD Retail Store - Toys & Gift Aisles",
        "filename": "HD CCTV Camera video 3MP 4MP iProx CCTV HDCCTVCameras.net retail store - HDCCTV Cameras (720p, h264).mp4",
        "description": "High resolution retail CCTV tracking shoppers between checkout counter, center promotional towers, and wall racks.",
        "fps_sample": 5,
        "calibration_src": [
            [260, 270],   # top-left
            [740, 270],   # top-right
            [940, 670],   # bottom-right
            [120, 670]    # bottom-left
        ],
        "calibration_dst": [
            [180, 160],
            [660, 160],
            [660, 680],
            [180, 680]
        ],
        "store_map": {
            "name": "HD Retail Store - Main Floor",
            "dimensions": {"width": 800, "height": 800, "unit": "px"},
            "camera": {
                "x": 400,
                "y": 790,
                "height_m": 3.2,
                "label": "CCTV Cam #2 (Wide-Angle Ceiling)",
                "fov_angle": 75
            },
            "boundary": [
                [100, 120], [720, 120], [750, 720], [80, 720]
            ],
            "unseen_regions": [
                {"name": "Back Wall / Staff Room", "polygon": [[0, 0], [800, 0], [800, 100], [0, 100]], "reason": "Beyond Camera FOV"},
                {"name": "Behind Left Counter", "polygon": [[0, 100], [120, 100], [120, 700], [0, 700]], "reason": "Blocked by POS till partition"},
                {"name": "Far Right Blind Spot", "polygon": [[740, 100], [800, 100], [800, 800], [740, 800]], "reason": "Behind high product shelving"}
            ],
            "shelves": [
                {
                    "id": "shelf_left_pos",
                    "name": "Checkout POS Counter & Till",
                    "type": "checkout",
                    "x": 110,
                    "y": 180,
                    "width": 110,
                    "height": 380,
                    "color": "#ef4444"
                },
                {
                    "id": "shelf_center_promo",
                    "name": "Center Promotional Red Towers",
                    "type": "promo",
                    "x": 320,
                    "y": 200,
                    "width": 150,
                    "height": 280,
                    "color": "#f59e0b"
                },
                {
                    "id": "shelf_wire_stands",
                    "name": "Center Wire Carousel Displays",
                    "type": "rack",
                    "x": 330,
                    "y": 510,
                    "width": 130,
                    "height": 140,
                    "color": "#8b5cf6"
                },
                {
                    "id": "shelf_right_wall",
                    "name": "Main Wall Product Shelving",
                    "type": "wall_shelf",
                    "x": 580,
                    "y": 140,
                    "width": 140,
                    "height": 550,
                    "color": "#10b981"
                }
            ],
            "walkable_area": [
                [220, 150], [580, 150], [720, 690], [130, 690]
            ],
            "zones": [
                {
                    "id": "zone_pos_line",
                    "name": "Checkout Line & Register",
                    "bounds": {"x1": 130, "y1": 180, "x2": 280, "y2": 450},
                    "color": "rgba(239, 68, 68, 0.25)"
                },
                {
                    "id": "zone_center_aisle",
                    "name": "Center Browsing Promenade",
                    "bounds": {"x1": 270, "y1": 160, "x2": 520, "y2": 660},
                    "color": "rgba(245, 158, 11, 0.25)"
                },
                {
                    "id": "zone_wall_shelf",
                    "name": "Main Wall Shelf Browsing Zone",
                    "bounds": {"x1": 500, "y1": 150, "x2": 680, "y2": 660},
                    "color": "rgba(16, 185, 129, 0.25)"
                },
                {
                    "id": "zone_entrance_lobby",
                    "name": "Store Entrance & Mat Area",
                    "bounds": {"x1": 500, "y1": 580, "x2": 720, "y2": 720},
                    "color": "rgba(59, 130, 246, 0.25)"
                }
            ]
        }
    }
}

# ---------------------------------------------------------------------------
# Detection / privacy settings (override with environment variables)
# ---------------------------------------------------------------------------
# YOLO weights used for person detection. YOLO26 is the latest Ultralytics family;
# swap the size suffix (n/s/m/l/x) for speed vs. accuracy, e.g. "yolo26m.pt".
YOLO_MODEL = os.environ.get("RETAILFLOW_YOLO_MODEL", "yolo26s.pt")
YOLO_FALLBACK_MODEL = "yolo11s.pt"      # used if the installed ultralytics is too old for YOLO26
YOLO_CONF = float(os.environ.get("RETAILFLOW_YOLO_CONF", "0.35"))
YOLO_IOU = 0.5
YOLO_IMGSZ = int(os.environ.get("RETAILFLOW_YOLO_IMGSZ", "960"))
PERSON_CLASS_ID = 0                     # COCO class 0 = person; every other class is ignored

# Face blurring (FaceNet family: MTCNN detector from facenet-pytorch)
FACE_BLUR_ENABLED = os.environ.get("RETAILFLOW_FACE_BLUR", "1") != "0"
FACE_MIN_CONF = 0.80                    # minimum MTCNN probability to accept a face
FACE_MIN_SIZE = 12                      # smallest face (px) MTCNN will look for
FACE_HEAD_FRACTION = 0.45               # top share of a person box searched for faces
FACE_BOX_PADDING = 0.35                 # expand each face box by this fraction before blurring
FACE_INTERP_MAX_GAP_SEC = 0.8           # don't interpolate blur boxes across longer detection gaps
FACE_HOLD_SEC = 0.35                    # keep blurring this long after a track's last detection
BLURRED_VIDEO_NAME = "blurred.mp4"

CUSTOM_VIDEOS_FILE = os.path.join(BASE_DIR, "data", "custom_videos.json")
UPLOADS_DIR = os.path.join(BASE_DIR, "uploads")
os.makedirs(UPLOADS_DIR, exist_ok=True)

def load_custom_videos():
    if os.path.exists(CUSTOM_VIDEOS_FILE):
        try:
            with open(CUSTOM_VIDEOS_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {}
    return {}

def save_custom_videos(custom_videos):
    os.makedirs(os.path.dirname(CUSTOM_VIDEOS_FILE), exist_ok=True)
    with open(CUSTOM_VIDEOS_FILE, "w", encoding="utf-8") as f:
        json.dump(custom_videos, f, indent=2)

def get_all_videos():
    all_vids = dict(VIDEOS)
    custom = load_custom_videos()
    all_vids.update(custom)
    return all_vids

def register_custom_video(video_id, data):
    custom = load_custom_videos()
    custom[video_id] = data
    save_custom_videos(custom)
    return custom

