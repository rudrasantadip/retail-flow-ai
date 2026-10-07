import React, { useRef, useEffect, useState, useMemo } from 'react';
import { StoreMap, Track, HeatmapConfig, Shelf, Zone } from '../types';
import { renderHeatmap, HeatmapPoint } from '../utils/heatmapRenderer';
import { 
  Compass, 
  Video, 
  Layers, 
  MapPin, 
  EyeOff, 
  Footprints,
  Info,
  Maximize
} from 'lucide-react';

interface FloorMap2DProps {
  storeMap: StoreMap | null;
  tracks: Track[];
  currentTime: number;
  heatmapConfig: HeatmapConfig;
  onHoverItem?: (item: any) => void;
}

export const FloorMap2D: React.FC<FloorMap2DProps> = ({
  storeMap,
  tracks,
  currentTime,
  heatmapConfig,
  onHoverItem
}) => {
  const heatmapCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hoveredShelf, setHoveredShelf] = useState<Shelf | null>(null);
  const [hoveredZone, setHoveredZone] = useState<Zone | null>(null);
  const [hoveredCustomer, setHoveredCustomer] = useState<any | null>(null);

  // Filter trajectory points for the heatmap according to mode
  const heatmapPoints = useMemo<HeatmapPoint[]>(() => {
    if (!tracks || tracks.length === 0) return [];

    const pts: HeatmapPoint[] = [];
    const isCumulative = heatmapConfig.mode === 'cumulative';
    const windowStart = isCumulative ? 0 : Math.max(0, currentTime - heatmapConfig.windowDuration);

    tracks.forEach((track) => {
      track.positions.forEach((pos) => {
        if (pos.timestamp >= windowStart && pos.timestamp <= currentTime) {
          // Weight recent points slightly higher in sliding-window mode
          let weight = 1.0;
          if (!isCumulative) {
            const age = currentTime - pos.timestamp;
            weight = Math.max(0.2, 1.0 - (age / heatmapConfig.windowDuration) * 0.7);
          }
          pts.push({
            x: pos.map_x,
            y: pos.map_y,
            weight
          });
        }
      });
    });

    return pts;
  }, [tracks, currentTime, heatmapConfig.mode, heatmapConfig.windowDuration]);

  // Render heatmap whenever points or visual parameters change
  useEffect(() => {
    const canvas = heatmapCanvasRef.current;
    if (!canvas) return;

    renderHeatmap(
      canvas,
      heatmapPoints,
      heatmapConfig.radius,
      heatmapConfig.intensity,
      heatmapConfig.colorScheme
    );
  }, [heatmapPoints, heatmapConfig.radius, heatmapConfig.intensity, heatmapConfig.colorScheme]);

  // Current active customer positions at currentTime
  const activeCustomers = useMemo(() => {
    const list: Array<{
      trackId: number;
      color: string;
      x: number;
      y: number;
      dwell: number;
      trail: Array<[number, number]>;
      speed?: number;
    }> = [];

    const threshold = 0.45; // seconds

    tracks.forEach((track) => {
      // Find latest position at or slightly before currentTime
      const validPositions = track.positions.filter((p) => p.timestamp <= currentTime);
      if (validPositions.length === 0) return;

      const currentPos = validPositions[validPositions.length - 1];
      if (currentTime - currentPos.timestamp <= threshold) {
        // Build recent trail (last 10 positions)
        const recent = validPositions.slice(-12).map((p) => [p.map_x, p.map_y] as [number, number]);
        list.push({
          trackId: track.track_id,
          color: track.color,
          x: currentPos.map_x,
          y: currentPos.map_y,
          dwell: Math.round((currentPos.timestamp - track.start_time) * 10) / 10,
          trail: recent
        });
      }
    });

    return list;
  }, [tracks, currentTime]);

  if (!storeMap) {
    return (
      <div className="w-full h-96 flex items-center justify-center bg-slate-900 border border-slate-800 rounded-xl text-slate-500">
        No store layout data loaded.
      </div>
    );
  }

  const { dimensions, camera, boundary, unseen_regions, shelves, zones, walkable_area } = storeMap;
  const viewBox = `0 0 ${dimensions.width} ${dimensions.height}`;

  return (
    <div className="flex flex-col bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
      {/* Map Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-slate-950/80 border-b border-slate-800/80 text-xs">
        <div className="flex items-center gap-2">
          <Layers className="w-3.5 h-3.5 text-indigo-400" />
          <span className="font-semibold text-slate-200">
            2D Top-Down Store Reconstruction
          </span>
          <span className="text-slate-500 text-[11px] font-mono">
            ({dimensions.width}x{dimensions.height}px)
          </span>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-[11px] font-mono">
            <span className="text-slate-400">Mode:</span>
            <span className="text-indigo-400 font-semibold uppercase bg-indigo-950/60 px-2 py-0.5 rounded border border-indigo-800/60">
              {heatmapConfig.mode === 'cumulative' ? 'Cumulative Heatmap' : `Sliding Window (${heatmapConfig.windowDuration}s)`}
            </span>
          </div>
          <span className="text-emerald-400 font-mono text-xs font-semibold bg-emerald-950/50 px-2 py-0.5 rounded border border-emerald-800/50">
            {activeCustomers.length} Active on Map
          </span>
        </div>
      </div>

      {/* Map Canvas and Vector Viewport */}
      <div className="relative aspect-square max-h-[580px] bg-slate-950 overflow-hidden bg-store-grid">
        
        {/* Layer 1: Heatmap Canvas */}
        <canvas
          ref={heatmapCanvasRef}
          width={dimensions.width}
          height={dimensions.height}
          className="absolute inset-0 w-full h-full object-contain pointer-events-none z-10 opacity-90"
        />

        {/* Layer 2: Interactive SVG Vector Layout */}
        <svg
          viewBox={viewBox}
          className="absolute inset-0 w-full h-full object-contain z-20 select-none"
        >
          <defs>
            {/* Unseen area hatching pattern */}
            <pattern
              id="unseenHatch"
              width="12"
              height="12"
              patternTransform="rotate(45 0 0)"
              patternUnits="userSpaceOnUse"
            >
              <line x1="0" y1="0" x2="0" y2="12" stroke="#ef4444" strokeWidth="2.5" opacity="0.35" />
            </pattern>

            {/* Grid pattern */}
            <pattern id="floorGrid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
            </pattern>

            {/* Glow filters for customer dots */}
            <filter id="customerGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="#ffffff" floodOpacity="0.8" />
            </filter>
          </defs>

          {/* Background Grid */}
          <rect width="100%" height="100%" fill="url(#floorGrid)" />

          {/* Camera-Visible Boundary Polygon */}
          {boundary && boundary.length > 0 && (
            <polygon
              points={boundary.map((p) => p.join(',')).join(' ')}
              fill="rgba(30, 41, 59, 0.4)"
              stroke="rgba(148, 163, 184, 0.4)"
              strokeWidth="2"
              strokeDasharray="4 4"
            />
          )}

          {/* Walkable Area */}
          {walkable_area && walkable_area.length > 0 && (
            <polygon
              points={walkable_area.map((p) => p.join(',')).join(' ')}
              fill="rgba(16, 185, 129, 0.04)"
              stroke="rgba(16, 185, 129, 0.2)"
              strokeWidth="1.5"
            />
          )}

          {/* Camera Position & Frustum Cone */}
          {heatmapConfig.showCameraFrustum && camera && (
            <g>
              {/* Frustum Cone Rays */}
              <polygon
                points={`${camera.x},${camera.y} 140,100 660,100`}
                fill="rgba(99, 102, 241, 0.05)"
                stroke="rgba(99, 102, 241, 0.25)"
                strokeWidth="1.5"
                strokeDasharray="6 4"
              />
              {/* Camera Icon Marker */}
              <circle
                cx={camera.x}
                cy={camera.y}
                r="14"
                fill="#4f46e5"
                stroke="#818cf8"
                strokeWidth="2"
              />
              <text
                x={camera.x}
                y={camera.y + 4}
                textAnchor="middle"
                fontSize="12"
                fill="#ffffff"
              >
                📹
              </text>
              <text
                x={camera.x}
                y={camera.y + 26}
                textAnchor="middle"
                fontSize="10"
                fontFamily="monospace"
                fill="#c7d2fe"
                fontWeight="bold"
              >
                {camera.label}
              </text>
            </g>
          )}

          {/* Unseen / Occluded Regions (Explicit Representation of Uncertainty) */}
          {heatmapConfig.showUnseenAreas &&
            unseen_regions &&
            unseen_regions.map((region, idx) => (
              <g key={`unseen-${idx}`} className="cursor-help">
                <polygon
                  points={region.polygon.map((p) => p.join(',')).join(' ')}
                  fill="url(#unseenHatch)"
                  stroke="#ef4444"
                  strokeWidth="1"
                  strokeDasharray="3 3"
                  opacity="0.8"
                />
                <text
                  x={region.polygon[0][0] + 10}
                  y={region.polygon[0][1] + 25}
                  fontSize="10"
                  fontFamily="sans-serif"
                  fill="#f87171"
                  fontWeight="600"
                  opacity="0.9"
                >
                  ⚠ {region.name}
                </text>
                <text
                  x={region.polygon[0][0] + 10}
                  y={region.polygon[0][1] + 40}
                  fontSize="8.5"
                  fontFamily="sans-serif"
                  fill="#fca5a5"
                  opacity="0.75"
                >
                  ({region.reason})
                </text>
              </g>
            ))}

          {/* Labeled Retail Zones */}
          {heatmapConfig.showZones &&
            zones &&
            zones.map((zone) => {
              const b = zone.bounds;
              const w = b.x2 - b.x1;
              const h = b.y2 - b.y1;
              return (
                <g key={zone.id} onMouseEnter={() => setHoveredZone(zone)} onMouseLeave={() => setHoveredZone(null)}>
                  <rect
                    x={b.x1}
                    y={b.y1}
                    width={w}
                    height={h}
                    fill={zone.color}
                    stroke="rgba(255,255,255,0.15)"
                    strokeWidth="1"
                    strokeDasharray="4 4"
                    rx="4"
                  />
                  <text
                    x={b.x1 + 8}
                    y={b.y1 + 16}
                    fontSize="9.5"
                    fontFamily="monospace"
                    fontWeight="600"
                    fill="rgba(255,255,255,0.7)"
                  >
                    📍 {zone.name}
                  </text>
                </g>
              );
            })}

          {/* Shelves and Store Fixtures */}
          {heatmapConfig.showShelves &&
            shelves &&
            shelves.map((shelf) => {
              const isHovered = hoveredShelf?.id === shelf.id;
              return (
                <g
                  key={shelf.id}
                  className="cursor-pointer transition-all"
                  onMouseEnter={() => setHoveredShelf(shelf)}
                  onMouseLeave={() => setHoveredShelf(null)}
                >
                  <rect
                    x={shelf.x}
                    y={shelf.y}
                    width={shelf.width}
                    height={shelf.height}
                    fill={shelf.color || '#3b82f6'}
                    fillOpacity={isHovered ? 0.95 : 0.8}
                    stroke={isHovered ? '#ffffff' : 'rgba(255,255,255,0.3)'}
                    strokeWidth={isHovered ? 2.5 : 1.5}
                    rx="5"
                    filter="drop-shadow(0 2px 4px rgba(0,0,0,0.5))"
                  />
                  {/* Subtle 3D top bevel */}
                  <rect
                    x={shelf.x}
                    y={shelf.y}
                    width={shelf.width}
                    height={Math.min(10, shelf.height)}
                    fill="rgba(255,255,255,0.2)"
                    rx="5"
                  />
                  {/* Shelf Label */}
                  <text
                    x={shelf.x + shelf.width / 2}
                    y={shelf.y + Math.min(22, shelf.height / 2 + 4)}
                    textAnchor="middle"
                    fontSize="10"
                    fontWeight="bold"
                    fontFamily="Inter, sans-serif"
                    fill="#ffffff"
                    filter="drop-shadow(0 1px 2px rgba(0,0,0,0.8))"
                  >
                    {shelf.name}
                  </text>
                  <text
                    x={shelf.x + shelf.width / 2}
                    y={shelf.y + Math.min(36, shelf.height / 2 + 18)}
                    textAnchor="middle"
                    fontSize="8.5"
                    fontFamily="monospace"
                    fill="rgba(255,255,255,0.8)"
                  >
                    [{shelf.type.toUpperCase()}]
                  </text>
                </g>
              );
            })}

          {/* Trajectory Motion Trails */}
          {heatmapConfig.showTrails &&
            activeCustomers.map((cust) => {
              if (cust.trail.length < 2) return null;
              const pointsStr = cust.trail.map((p) => p.join(',')).join(' ');
              return (
                <polyline
                  key={`trail-${cust.trackId}`}
                  points={pointsStr}
                  fill="none"
                  stroke={cust.color}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray="4 2"
                  opacity="0.85"
                />
              );
            })}

          {/* Customer Markers (Real-Time Synchronized Dots) */}
          {heatmapConfig.showCustomerDots &&
            activeCustomers.map((cust) => {
              return (
                <g
                  key={`cust-${cust.trackId}`}
                  className="cursor-pointer"
                  onMouseEnter={() => setHoveredCustomer(cust)}
                  onMouseLeave={() => setHoveredCustomer(null)}
                >
                  {/* Pulse wave ring */}
                  <circle
                    cx={cust.x}
                    cy={cust.y}
                    r="12"
                    fill="none"
                    stroke={cust.color}
                    strokeWidth="1.5"
                    opacity="0.6"
                    className="animate-ping"
                  />
                  {/* Main customer dot */}
                  <circle
                    cx={cust.x}
                    cy={cust.y}
                    r="6.5"
                    fill={cust.color}
                    stroke="#ffffff"
                    strokeWidth="2"
                    filter="url(#customerGlow)"
                  />
                  {/* Track ID Pill */}
                  {heatmapConfig.showCustomerIds && (
                    <g transform={`translate(${cust.x + 8}, ${cust.y - 14})`}>
                      <rect
                        width="36"
                        height="16"
                        rx="4"
                        fill="rgba(15, 23, 42, 0.9)"
                        stroke={cust.color}
                        strokeWidth="1"
                      />
                      <text
                        x="18"
                        y="11.5"
                        textAnchor="middle"
                        fontSize="9"
                        fontWeight="bold"
                        fontFamily="monospace"
                        fill="#ffffff"
                      >
                        #{cust.trackId}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}
        </svg>

        {/* Hover Information Tooltip */}
        {hoveredShelf && (
          <div className="absolute top-3 right-3 bg-slate-900/90 backdrop-blur-md border border-slate-700/80 rounded-lg p-2.5 text-xs shadow-2xl z-30 pointer-events-none max-w-xs">
            <div className="font-bold text-slate-100 flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded" style={{ backgroundColor: hoveredShelf.color }}></span>
              {hoveredShelf.name}
            </div>
            <div className="text-slate-400 text-[11px] mt-1">
              Category: <span className="text-slate-200 capitalize">{hoveredShelf.type}</span>
            </div>
            <div className="text-slate-400 text-[11px]">
              Dimensions: <span className="font-mono text-slate-300">{hoveredShelf.width} x {hoveredShelf.height} px</span>
            </div>
          </div>
        )}

        {hoveredCustomer && (
          <div className="absolute top-3 left-3 bg-slate-900/90 backdrop-blur-md border border-slate-700/80 rounded-lg p-2.5 text-xs shadow-2xl z-30 pointer-events-none">
            <div className="font-bold text-slate-100 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: hoveredCustomer.color }}></span>
              Customer #{hoveredCustomer.trackId}
            </div>
            <div className="text-slate-400 text-[11px] mt-0.5">
              Dwell Time: <strong className="text-emerald-400 font-mono">{hoveredCustomer.dwell}s</strong>
            </div>
            <div className="text-slate-400 text-[11px]">
              Map Position: <span className="font-mono text-slate-300">({hoveredCustomer.x}, {hoveredCustomer.y})</span>
            </div>
          </div>
        )}

        {/* Map Legend Overlay */}
        <div className="absolute bottom-3 right-3 bg-slate-950/80 backdrop-blur-sm border border-slate-800 rounded-lg p-2 text-[10px] font-mono text-slate-300 z-30 pointer-events-none flex flex-col gap-1">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
            <span>Customer Position</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-1.5 bg-red-500/40 border border-red-500/80"></span>
            <span>Unseen / Occluded Region</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded bg-indigo-500"></span>
            <span>Store Fixture / Shelf</span>
          </div>
        </div>

      </div>
    </div>
  );
};
