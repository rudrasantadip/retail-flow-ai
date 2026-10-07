/**
 * Homography and Perspective Transform Utilities
 * Computes 3x3 transformation matrix from 4 image-space reference points to 4 map-space points.
 */

export type Point = [number, number];

export function computeHomography(src: Point[], dst: Point[]): number[][] | null {
  if (src.length < 4 || dst.length < 4) return null;

  // Build 8x8 system for h1..h8 with h9 = 1
  const A: number[][] = [];
  const B: number[] = [];

  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i];
    const [u, v] = dst[i];

    A.push([x, y, 1, 0, 0, 0, -x * u, -y * u]);
    B.push(u);

    A.push([0, 0, 0, x, y, 1, -x * v, -y * v]);
    B.push(v);
  }

  // Gaussian elimination with partial pivoting
  const n = 8;
  for (let i = 0; i < n; i++) {
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(A[k][i]) > Math.abs(A[maxRow][i])) {
        maxRow = k;
      }
    }

    const tmpA = A[i];
    A[i] = A[maxRow];
    A[maxRow] = tmpA;

    const tmpB = B[i];
    B[i] = B[maxRow];
    B[maxRow] = tmpB;

    if (Math.abs(A[i][i]) < 1e-12) return null;

    for (let k = i + 1; k < n; k++) {
      const c = -A[k][i] / A[i][i];
      for (let j = i; j < n; j++) {
        if (i === j) {
          A[k][j] = 0;
        } else {
          A[k][j] += c * A[i][j];
        }
      }
      B[k] += c * B[i];
    }
  }

  // Back-substitution
  const h: number[] = new Array(8).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let sum = B[i];
    for (let j = i + 1; j < n; j++) {
      sum -= A[i][j] * h[j];
    }
    h[i] = sum / A[i][i];
  }

  return [
    [h[0], h[1], h[2]],
    [h[3], h[4], h[5]],
    [h[6], h[7], 1.0]
  ];
}

export function projectPoint(
  H: number[][] | null,
  x: number,
  y: number,
  maxW: number = 800,
  maxH: number = 800
): [number, number] {
  if (!H) return [x, y];

  const px = H[0][0] * x + H[0][1] * y + H[0][2];
  const py = H[1][0] * x + H[1][1] * y + H[1][2];
  const pz = H[2][0] * x + H[2][1] * y + H[2][2];

  if (Math.abs(pz) < 1e-7) return [x, y];

  let resX = px / pz;
  let resY = py / pz;

  // Clamp within floor plan bounds
  resX = Math.max(15, Math.min(maxW - 15, resX));
  resY = Math.max(15, Math.min(maxH - 15, resY));

  return [Math.round(resX * 10) / 10, Math.round(resY * 10) / 10];
}
