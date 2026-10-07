import React, { useState, useRef, useEffect } from 'react';
import { Compass, Check, RotateCcw, X, Info } from 'lucide-react';
import { computeHomography, projectPoint } from '../utils/homography';

interface CalibrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  videoId: string;
  initialSrcPoints: [number, number][];
  initialDstPoints: [number, number][];
  onSaveCalibration: (newSrc: [number, number][], newDst: [number, number][]) => Promise<void>;
}

export const CalibrationModal: React.FC<CalibrationModalProps> = ({
  isOpen,
  onClose,
  videoId,
  initialSrcPoints,
  initialDstPoints,
  onSaveCalibration
}) => {
  const [srcPoints, setSrcPoints] = useState<[number, number][]>(initialSrcPoints || []);
  const [dstPoints, setDstPoints] = useState<[number, number][]>(initialDstPoints || []);
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    if (initialSrcPoints && initialSrcPoints.length === 4) {
      setSrcPoints(initialSrcPoints);
    }
    if (initialDstPoints && initialDstPoints.length === 4) {
      setDstPoints(initialDstPoints);
    }
  }, [initialSrcPoints, initialDstPoints, isOpen]);

  if (!isOpen) return null;

  const labels = ['Top-Left (TL)', 'Top-Right (TR)', 'Bottom-Right (BR)', 'Bottom-Left (BL)'];
  const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444'];

  const handleMouseDown = (idx: number) => {
    setDraggingIdx(idx);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (draggingIdx === null || !imageRef.current) return;

    const rect = imageRef.current.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;

    // Scale to original 1280x720 video resolution
    const normX = Math.max(0, Math.min(1280, (clientX / rect.width) * 1280));
    const normY = Math.max(0, Math.min(720, (clientY / rect.height) * 720));

    const updated = [...srcPoints] as [number, number][];
    updated[draggingIdx] = [Math.round(normX), Math.round(normY)];
    setSrcPoints(updated);
  };

  const handleMouseUp = () => {
    setDraggingIdx(null);
  };

  const handleReset = () => {
    setSrcPoints(initialSrcPoints);
    setDstPoints(initialDstPoints);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSaveCalibration(srcPoints, dstPoints);
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-4xl w-full shadow-2xl overflow-hidden flex flex-col my-auto">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/80">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center">
              <Compass className="w-4 h-4 text-indigo-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">
                Floor-Plane Calibration (Homography Transform)
              </h2>
              <p className="text-xs text-slate-400">
                Drag the 4 corner anchors on the floor plane to align CCTV perspective with the 2D top-down map.
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

        {/* Calibration Canvas Viewport */}
        <div className="p-6 flex flex-col gap-4">
          <div
            ref={containerRef}
            className="relative rounded-xl overflow-hidden border border-slate-800 bg-black select-none aspect-video flex items-center justify-center cursor-crosshair"
          >
            {/* Frozen Frame Image from CCTV */}
            <img
              ref={imageRef}
              src={`/api/thumbnails/${videoId}`}
              alt="CCTV Frame for Calibration"
              className="w-full h-full object-contain pointer-events-none"
            />

            {/* Draggable Anchors and Connecting Quadrilateral Polygon */}
            {imageRef.current && srcPoints.length === 4 && (
              <svg className="absolute inset-0 w-full h-full pointer-events-none">
                {/* SVG Polygon connecting 4 points */}
                <polygon
                  points={srcPoints
                    .map(([x, y]) => {
                      const rect = imageRef.current?.getBoundingClientRect();
                      const w = rect ? rect.width : 1280;
                      const h = rect ? rect.height : 720;
                      return `${(x / 1280) * w},${(y / 720) * h}`;
                    })
                    .join(' ')}
                  fill="rgba(99, 102, 241, 0.25)"
                  stroke="#6366f1"
                  strokeWidth="2.5"
                  strokeDasharray="6 3"
                />
              </svg>
            )}

            {/* Draggable Interactive Handles */}
            {srcPoints.map(([x, y], idx) => {
              const rect = imageRef.current?.getBoundingClientRect();
              const w = rect ? rect.width : 1280;
              const h = rect ? rect.height : 720;
              const posX = (x / 1280) * w;
              const posY = (y / 720) * h;

              return (
                <div
                  key={idx}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    handleMouseDown(idx);
                  }}
                  style={{
                    left: `${posX}px`,
                    top: `${posY}px`,
                    transform: 'translate(-50%, -50%)',
                    borderColor: colors[idx]
                  }}
                  className="absolute w-6 h-6 rounded-full bg-slate-900 border-2 cursor-grab active:cursor-grabbing flex items-center justify-center shadow-lg shadow-black/80 hover:scale-125 transition-transform z-30"
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: colors[idx] }}
                  />
                  <span
                    className="absolute -top-5 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold text-white whitespace-nowrap bg-black/80 border border-white/20 pointer-events-none"
                  >
                    {labels[idx].split(' ')[0]}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Coordinate Table and Instructions */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2.5">
            {srcPoints.map(([x, y], idx) => (
              <div
                key={idx}
                className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 text-xs flex flex-col gap-1"
              >
                <div className="flex items-center gap-1.5 font-semibold text-slate-300">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: colors[idx] }} />
                  <span>{labels[idx]}</span>
                </div>
                <div className="font-mono text-slate-400 text-[11px]">
                  Video: <strong className="text-white">({x}, {y})</strong>
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-950/60 p-3 rounded-lg border border-slate-800/80">
            <Info className="w-4 h-4 text-indigo-400 shrink-0" />
            <span>
              Tip: Position the anchors to enclose a known rectangular section of the floor (e.g. tile intersections or aisle corridor). The system calculates the homography matrix to remove perspective distortion.
            </span>
          </div>
        </div>

        {/* Modal Actions */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-800 bg-slate-950/80">
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white px-3 py-2 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset to Default</span>
          </button>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="text-xs text-slate-400 hover:text-white px-4 py-2 rounded-lg hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-4 py-2 rounded-lg shadow-md shadow-indigo-600/30 transition-all"
            >
              <Check className="w-4 h-4" />
              <span>{isSaving ? 'Calculating...' : 'Apply & Re-Project Trajectories'}</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
