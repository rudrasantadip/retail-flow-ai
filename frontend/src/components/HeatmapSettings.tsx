import React from 'react';
import { 
  Flame, 
  Clock, 
  Palette, 
  Eye, 
  Layers, 
  Sliders,
  Sparkles
} from 'lucide-react';
import { HeatmapConfig, ColorScheme, HeatmapMode } from '../types';

interface HeatmapSettingsProps {
  config: HeatmapConfig;
  onChange: (newConfig: HeatmapConfig) => void;
}

export const HeatmapSettings: React.FC<HeatmapSettingsProps> = ({ config, onChange }) => {
  const update = (partial: Partial<HeatmapConfig>) => {
    onChange({ ...config, ...partial });
  };

  const palettes: Array<{ id: ColorScheme; label: string; preview: string }> = [
    { id: 'classic', label: 'Classic Heat', preview: 'from-blue-600 via-emerald-400 via-yellow-400 to-red-500' },
    { id: 'thermal', label: 'Thermal FLIR', preview: 'from-purple-900 via-pink-600 via-amber-500 to-yellow-200' },
    { id: 'emerald', label: 'Emerald Mint', preview: 'from-emerald-900 via-emerald-500 to-emerald-200' },
    { id: 'cyberpunk', label: 'Neon Cyber', preview: 'from-purple-900 via-pink-500 via-cyan-400 to-yellow-300' }
  ];

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-indigo-400" />
          <h3 className="font-semibold text-sm text-slate-100">
            Heatmap & Spatial Controls
          </h3>
        </div>
        <span className="text-[11px] font-mono text-slate-500">v1.2</span>
      </div>

      {/* Mode Switcher: Cumulative vs Sliding Window */}
      <div>
        <label className="text-xs font-semibold text-slate-300 mb-1.5 block">
          Density Accumulation Mode
        </label>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => update({ mode: 'cumulative' })}
            className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-medium border transition-all ${
              config.mode === 'cumulative'
                ? 'bg-indigo-600 border-indigo-500 text-white shadow-md shadow-indigo-600/30'
                : 'bg-slate-800/80 border-slate-700/80 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <Flame className="w-3.5 h-3.5" />
            <span>Cumulative</span>
          </button>

          <button
            onClick={() => update({ mode: 'window' })}
            className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-medium border transition-all ${
              config.mode === 'window'
                ? 'bg-indigo-600 border-indigo-500 text-white shadow-md shadow-indigo-600/30'
                : 'bg-slate-800/80 border-slate-700/80 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Sliding Window</span>
          </button>
        </div>
      </div>

      {/* Window Duration (if sliding window) */}
      {config.mode === 'window' && (
        <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80">
          <div className="flex justify-between items-center text-xs mb-1.5">
            <span className="text-slate-400">Window Duration:</span>
            <span className="text-indigo-400 font-mono font-bold">{config.windowDuration}s</span>
          </div>
          <div className="flex gap-1.5">
            {[5, 10, 15, 30].map((sec) => (
              <button
                key={sec}
                onClick={() => update({ windowDuration: sec })}
                className={`flex-1 py-1 text-xs font-mono rounded border transition-all ${
                  config.windowDuration === sec
                    ? 'bg-indigo-600 border-indigo-500 text-white'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {sec}s
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Sliders: Kernel Radius & Opacity */}
      <div className="space-y-3">
        <div>
          <div className="flex justify-between items-center text-xs text-slate-400 mb-1">
            <span>Kernel Radius (Spread)</span>
            <span className="font-mono text-slate-200">{config.radius}px</span>
          </div>
          <input
            type="range"
            min="12"
            max="64"
            step="2"
            value={config.radius}
            onChange={(e) => update({ radius: parseInt(e.target.value) })}
            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
          />
        </div>

        <div>
          <div className="flex justify-between items-center text-xs text-slate-400 mb-1">
            <span>Heatmap Opacity / Intensity</span>
            <span className="font-mono text-slate-200">{Math.round(config.intensity * 100)}%</span>
          </div>
          <input
            type="range"
            min="0.2"
            max="1.0"
            step="0.05"
            value={config.intensity}
            onChange={(e) => update({ intensity: parseFloat(e.target.value) })}
            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
          />
        </div>
      </div>

      {/* Color Palette Selector */}
      <div>
        <label className="text-xs font-semibold text-slate-300 mb-1.5 block">
          Heat Gradient Palette
        </label>
        <div className="grid grid-cols-2 gap-2">
          {palettes.map((p) => (
            <button
              key={p.id}
              onClick={() => update({ colorScheme: p.id })}
              className={`p-2 rounded-lg border text-left transition-all ${
                config.colorScheme === p.id
                  ? 'border-indigo-500 bg-indigo-950/30 ring-1 ring-indigo-500'
                  : 'border-slate-800 bg-slate-950/40 hover:border-slate-700'
              }`}
            >
              <div className="text-[11px] font-medium text-slate-200 mb-1">{p.label}</div>
              <div className={`h-2.5 rounded-full bg-gradient-to-r ${p.preview}`} />
            </button>
          ))}
        </div>
      </div>

      {/* Layer Toggles */}
      <div className="border-t border-slate-800 pt-3">
        <label className="text-xs font-semibold text-slate-300 mb-2 block">
          Display Layers & Annotations
        </label>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <label className="flex items-center gap-2 cursor-pointer select-none text-slate-300">
            <input
              type="checkbox"
              checked={config.showTrails}
              onChange={(e) => update({ showTrails: e.target.checked })}
              className="rounded bg-slate-800 border-slate-700 text-indigo-600 focus:ring-indigo-500"
            />
            <span>Motion Trails</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer select-none text-slate-300">
            <input
              type="checkbox"
              checked={config.showCustomerIds}
              onChange={(e) => update({ showCustomerIds: e.target.checked })}
              className="rounded bg-slate-800 border-slate-700 text-indigo-600 focus:ring-indigo-500"
            />
            <span>Customer IDs</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer select-none text-slate-300">
            <input
              type="checkbox"
              checked={config.showShelves}
              onChange={(e) => update({ showShelves: e.target.checked })}
              className="rounded bg-slate-800 border-slate-700 text-indigo-600 focus:ring-indigo-500"
            />
            <span>Shelves & Fixtures</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer select-none text-slate-300">
            <input
              type="checkbox"
              checked={config.showUnseenAreas}
              onChange={(e) => update({ showUnseenAreas: e.target.checked })}
              className="rounded bg-slate-800 border-slate-700 text-indigo-600 focus:ring-indigo-500"
            />
            <span>Unseen / Occluded</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer select-none text-slate-300">
            <input
              type="checkbox"
              checked={config.showZones}
              onChange={(e) => update({ showZones: e.target.checked })}
              className="rounded bg-slate-800 border-slate-700 text-indigo-600 focus:ring-indigo-500"
            />
            <span>Retail Zones</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer select-none text-slate-300">
            <input
              type="checkbox"
              checked={config.showCameraFrustum}
              onChange={(e) => update({ showCameraFrustum: e.target.checked })}
              className="rounded bg-slate-800 border-slate-700 text-indigo-600 focus:ring-indigo-500"
            />
            <span>Camera Frustum</span>
          </label>
        </div>
      </div>
    </div>
  );
};
