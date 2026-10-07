# RetailFlow AI — Retail CCTV Store Mapping & Customer Heatmap

An end-to-end computer-vision and spatial analytics system for reconstructing a camera-visible retail layout, tracking customer movement from fixed CCTV footage, and rendering time-synchronized 2D customer heatmaps.

Based on the project specification in [`retail_cctv_store_mapping_heatmap_proposal.pdf`](retail_cctv_store_mapping_heatmap_proposal.pdf).

---

## 🌟 Key Features

1. **Synchronized CCTV Video & 2D Top-Down Floor Map**
   - Side-by-side synchronized playback between original CCTV footage and reconstructed top-down store map.
   - **YOLO person detection (people only — shelves, racks and grocery items are never highlighted)**, persistent Track IDs (`Person #1`, `#2`, ...), confidence metrics, and floor contact point markers.
   - **Automatic face blurring**: faces are found with FaceNet's MTCNN detector and blurred server-side. The browser only ever receives the anonymised video (and an anonymised calibration frame).
   - Explicit representation of camera frustum, visible boundaries, walkable area, and **unseen / occluded uncertainty regions** (strictly following the project principle: *never hallucinate complete floor plans*).

2. **Interactive 4-Point Floor Calibration (Homography Transform)**
   - Interactive draggable anchors on the CCTV frozen frame (`Top-Left`, `Top-Right`, `Bottom-Right`, `Bottom-Left`).
   - Removes perspective distortion by projecting feet/floor contact points $(x + w/2, y + h)$ directly to top-down 2D map space.
   - Instant live preview in TypeScript plus instant backend trajectory re-projection.

3. **High-Performance 2D Customer Heatmap Engine**
   - Real-time HTML5 Canvas Gaussian radial density kernels running at 60 FPS.
   - **Cumulative Mode**: Aggregates all customer dwell time from start to current timeline position.
   - **Sliding-Window Mode**: Configurable time window ($5s, 10s, 15s, 30s$) to inspect moving traffic clusters over time.
   - Customizable kernel spread radius, density opacity, and 4 color palettes (*Classic Heat, Thermal FLIR, Emerald Mint, Cyberpunk Neon*).

4. **Synchronized Timeline Controls**
   - Play/Pause, Frame Step ($\pm 0.2s$), and speed selector ($0.5x, 1x, 2x, 4x$).
   - Interactive scrub bar with customer activity density sparkline histogram.

5. **Retail Spatial Analytics**
   - Total tracked customer count, currently in-store shoppers, average dwell time, peak dwell time.
   - Zone footfall breakdown & congestion progress bars (*Cashier/Checkout Line, Snack Aisle, Promo Displays, Entrance*).
   - Trajectory log with individual customer dwell time and distance traveled.

6. **Full Data Model & Artifact Export**
   - Export `store_map.json` (Structured visible layout geometry, shelves, walkable area, unseen boundaries).
   - Export `tracks.json` (Full customer trajectories with timestamps, image-space coordinates, map-space coordinates).
   - Export `video_metadata.json` (Resolution, FPS, duration, sampling configuration).
   - Export `trajectories_summary.csv` for spreadsheet analytics.
   - Export high-resolution rendered 2D Heatmap snapshot as PNG.

---

## 🏗️ Architecture

```
retail-flow-ai/
├── backend/
│   ├── app.py                 # Flask REST API, video range streaming & static React serving
│   ├── cv_engine.py           # Video Ingestion, Tracking, Homography, Layout, Analytics, blurred-video export
│   ├── detectors.py           # YOLO person detector, FaceNet (MTCNN) face detector, blur routines
│   ├── config.py              # Retail store geometries, default calibration & zone definitions
│   ├── requirements.txt       # Python dependencies (flask, opencv, ultralytics/YOLO, imageio-ffmpeg, ...)
│   └── artifacts/             # Generated JSON artifacts per video (store_map.json, tracks.json, etc.)
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Header.tsx             # Navigation, video switcher & pipeline triggers
│   │   │   ├── VideoPlayer.tsx        # CCTV Video player with detection boxes & floor points
│   │   │   ├── FloorMap2D.tsx         # 2D Store Map with shelves, unseen areas & canvas heatmap
│   │   │   ├── CalibrationModal.tsx   # Interactive 4-point floor plane calibration
│   │   │   ├── TimelineControls.tsx   # Scrubber, activity sparkline & speed controls
│   │   │   ├── HeatmapSettings.tsx    # Cumulative vs Sliding-Window & color schemes
│   │   │   ├── AnalyticsPanel.tsx     # KPIs, zone footfall bars & trajectory logs
│   │   │   └── ExportModal.tsx        # JSON, CSV and PNG export modal
│   │   ├── types/                     # TypeScript definitions
│   │   ├── utils/                     # Homography matrix solver & canvas heatmap renderer
│   │   ├── App.tsx                    # Main integrated dashboard
│   │   └── index.css                  # Tailwind styles
│   ├── index.html
│   ├── package.json
│   └── vite.config.ts
├── data/thumbnails/           # Video frame snapshots for calibration overlay
└── retail_cctv_store_mapping_heatmap_proposal.pdf
```

---

## 🧠 Person Detection & Face Blurring

**Pipeline per video:** YOLO (COCO class `person` only) → MTCNN face detection inside each person's head region → tracking → homography → a second pass that writes `backend/artifacts/<video_id>/blurred.mp4` with every face blurred on **every** frame (face boxes from the ~5 FPS detections are interpolated between samples and follow the person if a face is momentarily missed).

**Install the models**

```powershell
pip install -r backend/requirements.txt
pip install --no-deps facenet-pytorch   # tqdm (needed by it) is in requirements.txt
```

`facenet-pytorch` pins very old `torch`/`numpy` versions, so it must be installed with `--no-deps` (the dependencies come from `ultralytics`). YOLO weights are downloaded automatically on first run; MTCNN's weights ship inside the `facenet-pytorch` package.

**Settings** (environment variables, defaults in `backend/config.py`)

| Variable | Default | Meaning |
|---|---|---|
| `RETAILFLOW_YOLO_MODEL` | `yolo26s.pt` | Any Ultralytics weights, e.g. `yolo26n.pt` (faster) or `yolo26m.pt` (more accurate) |
| `RETAILFLOW_YOLO_CONF` | `0.35` | Person confidence threshold |
| `RETAILFLOW_YOLO_IMGSZ` | `960` | Inference size — lower is faster on CPU |
| `RETAILFLOW_FACE_BLUR` | `1` | Set to `0` to disable blurring and stream the original video |

**Notes**
- Processing runs in the background; the UI shows live progress (loading models → detecting people → blurring faces). Use a GPU if available — on CPU a 2-minute clip takes several minutes.
- Existing artifacts from the old background-subtraction detector are stale: click **Run CV Pipeline** once per video to regenerate tracks and the blurred video. Until then the video panel shows an "Anonymised feed not generated yet" notice instead of the raw footage.
- MTCNN works best on faces roughly 15 px and larger; very small or fully turned-away faces in wide overhead shots can be missed.

---

## 🚀 Quick Start

### 1. Start the Backend API & Server
The backend serves both the REST APIs and the built production React frontend:

```powershell
python backend/app.py
```
Access the application directly in your browser at:
👉 **`http://localhost:5000`**

### 2. (Optional) Run Frontend in Vite Development Mode
If you wish to make live UI modifications with Hot Module Replacement (HMR):

```powershell
cd frontend
npm run dev
```
Access Vite dev server at:
👉 **`http://localhost:5173`** (automatically proxies API and video streams to port 5000).

---

## 📹 Sample CCTV Retail Datasets Included
- **Scottish Convenience Store (Cashier & Crisp Aisle)**: Fixed 720p 30 FPS camera monitoring shopper aisle, counter checkout, floor distancing markers, and cashier till.
- **HD Retail Store (Toys & Gifts Promenade)**: High-resolution wide-angle CCTV camera tracking shoppers browsing between checkout counters, promotional towers, and wall racks.
