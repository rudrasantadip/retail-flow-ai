import { ColorScheme } from '../types';

export interface HeatmapPoint {
  x: number;
  y: number;
  weight?: number;
}

// Generate color lookup tables (256 RGBA values)
function generateGradientLUT(scheme: ColorScheme): Uint8ClampedArray {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 1;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return new Uint8ClampedArray(256 * 4);

  const grad = ctx.createLinearGradient(0, 0, 256, 0);

  if (scheme === 'classic') {
    grad.addColorStop(0.0, 'rgba(0, 0, 255, 0)');
    grad.addColorStop(0.2, 'rgba(0, 200, 255, 0.4)');
    grad.addColorStop(0.45, 'rgba(0, 255, 120, 0.7)');
    grad.addColorStop(0.7, 'rgba(255, 230, 0, 0.85)');
    grad.addColorStop(1.0, 'rgba(255, 40, 0, 1.0)');
  } else if (scheme === 'thermal') {
    grad.addColorStop(0.0, 'rgba(20, 0, 40, 0)');
    grad.addColorStop(0.25, 'rgba(120, 0, 150, 0.5)');
    grad.addColorStop(0.55, 'rgba(240, 60, 40, 0.8)');
    grad.addColorStop(0.8, 'rgba(255, 180, 0, 0.95)');
    grad.addColorStop(1.0, 'rgba(255, 255, 200, 1.0)');
  } else if (scheme === 'emerald') {
    grad.addColorStop(0.0, 'rgba(6, 78, 59, 0)');
    grad.addColorStop(0.3, 'rgba(16, 185, 129, 0.5)');
    grad.addColorStop(0.65, 'rgba(52, 211, 153, 0.8)');
    grad.addColorStop(0.85, 'rgba(167, 243, 208, 0.95)');
    grad.addColorStop(1.0, 'rgba(255, 255, 255, 1.0)');
  } else {
    // cyberpunk / neon
    grad.addColorStop(0.0, 'rgba(30, 0, 60, 0)');
    grad.addColorStop(0.25, 'rgba(139, 92, 246, 0.5)');
    grad.addColorStop(0.55, 'rgba(236, 72, 153, 0.8)');
    grad.addColorStop(0.85, 'rgba(6, 182, 212, 0.95)');
    grad.addColorStop(1.0, 'rgba(250, 204, 21, 1.0)');
  }

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 1);
  return ctx.getImageData(0, 0, 256, 1).data;
}

const lutCache: Record<string, Uint8ClampedArray> = {};

function getLUT(scheme: ColorScheme): Uint8ClampedArray {
  if (!lutCache[scheme]) {
    lutCache[scheme] = generateGradientLUT(scheme);
  }
  return lutCache[scheme];
}

/**
 * Creates a circular radial gradient brush on a small scratch canvas
 */
function createRadialBrush(radius: number): HTMLCanvasElement {
  const brushCanvas = document.createElement('canvas');
  const size = radius * 2;
  brushCanvas.width = size;
  brushCanvas.height = size;
  const ctx = brushCanvas.getContext('2d');
  if (!ctx) return brushCanvas;

  const grad = ctx.createRadialGradient(radius, radius, 0, radius, radius, radius);
  grad.addColorStop(0, 'rgba(0,0,0,1)');
  grad.addColorStop(0.25, 'rgba(0,0,0,0.7)');
  grad.addColorStop(0.65, 'rgba(0,0,0,0.2)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return brushCanvas;
}

const brushCache: Record<number, HTMLCanvasElement> = {};

function getBrush(radius: number): HTMLCanvasElement {
  const r = Math.max(8, Math.min(80, Math.round(radius)));
  if (!brushCache[r]) {
    brushCache[r] = createRadialBrush(r);
  }
  return brushCache[r];
}

/**
 * Render customer density heatmap onto target HTML5 Canvas
 */
export function renderHeatmap(
  canvas: HTMLCanvasElement,
  points: HeatmapPoint[],
  radius: number = 32,
  intensity: number = 0.8,
  scheme: ColorScheme = 'classic'
) {
  const width = canvas.width;
  const height = canvas.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;

  // Clear canvas
  ctx.clearRect(0, 0, width, height);
  if (points.length === 0) return;

  // Step 1: Draw grayscale density into offscreen canvas
  const alphaCanvas = document.createElement('canvas');
  alphaCanvas.width = width;
  alphaCanvas.height = height;
  const alphaCtx = alphaCanvas.getContext('2d');
  if (!alphaCtx) return;

  const brush = getBrush(radius);
  const brushSize = brush.width;
  const brushOffset = brushSize / 2;

  alphaCtx.globalAlpha = Math.max(0.1, Math.min(1.0, 0.25 * intensity));

  for (let i = 0; i < points.length; i++) {
    const pt = points[i];
    const w = pt.weight !== undefined ? pt.weight : 1.0;
    alphaCtx.globalAlpha = Math.max(0.05, Math.min(0.8, 0.22 * intensity * w));
    alphaCtx.drawImage(brush, pt.x - brushOffset, pt.y - brushOffset);
  }

  // Step 2: Colorize via LUT (Color Lookup Table)
  const imgData = alphaCtx.getImageData(0, 0, width, height);
  const pixels = imgData.data;
  const lut = getLUT(scheme);

  for (let i = 3; i < pixels.length; i += 4) {
    const alpha = pixels[i];
    if (alpha > 0) {
      const lutIdx = alpha * 4;
      pixels[i - 3] = lut[lutIdx];     // R
      pixels[i - 2] = lut[lutIdx + 1]; // G
      pixels[i - 1] = lut[lutIdx + 2]; // B
      // Scale output alpha with user intensity
      pixels[i] = Math.min(255, Math.round(lut[lutIdx + 3] * intensity * 0.9));
    }
  }

  ctx.putImageData(imgData, 0, 0);
}
