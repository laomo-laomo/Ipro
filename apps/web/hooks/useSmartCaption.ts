'use client';

import { useEffect, useState } from 'react';

export type CaptionPosition =
  | 'top'
  | 'bottom';

export interface SmartCaptionStyle {
  position: CaptionPosition;
  textColor: string;   // hex
  strokeColor: string; // hex
  // 0..1 — how much extra opacity we should use; for busy backgrounds we
  // slightly bump it so the text reads cleanly.
  opacity: number;
}

interface RegionStats {
  mean: number;   // 0..1 luminance
  variance: number; // 0..1 — higher means busier / less uniform
}

// A picture-book caption reads best as a horizontal text area, not a small
// corner stamp. Sample the upper/lower bands and choose the calmer one.
const BAND_SAMPLE_FRACTION = 0.32;

function analyzeBand(
  imageData: ImageData,
  fullW: number,
  fullH: number,
  position: CaptionPosition,
): RegionStats {
  const startX = Math.floor(fullW * 0.08);
  const endX = Math.ceil(fullW * 0.92);
  const bandH = Math.floor(fullH * BAND_SAMPLE_FRACTION);
  const startY = position === 'top' ? 0 : fullH - bandH;
  const endY = position === 'top' ? bandH : fullH;

  let sum = 0;
  let sumSq = 0;
  let n = 0;
  let edges = 0;
  let prevLum = 0;
  for (let y = startY; y < endY; y += 1) {
    prevLum = 0;
    for (let x = startX; x < endX; x += 1) {
      const idx = (y * fullW + x) * 4;
      const r = imageData.data[idx];
      const g = imageData.data[idx + 1];
      const b = imageData.data[idx + 2];
      const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      sum += lum;
      sumSq += lum * lum;
      // Edge density — fast proxy for "stuff in this region" (faces, trees,
      // characters have lots of edges; sky, walls, blank ground don't).
      edges += Math.abs(lum - prevLum);
      prevLum = lum;
      n++;
    }
  }
  // Edge density per pixel (0..1 range, ~empirically)
  const edgeDensity = edges / Math.max(1, n);
  // Blend: variance catches uniform-but-textured (calm sky), edge density
  // catches busy regions (faces). Use both — pick the corner with the lowest
  // combined score.
  const variance = sumSq / n - (sum / n) * (sum / n);
  return { mean: sum / n, variance: variance * 0.5 + edgeDensity * 0.5 };
}

/**
 * Fallback when the image is CORS-tainted (so canvas.getImageData throws).
 * Deterministically derive a position from the URL hash so different images
 * get different corners, and pick a complementary color based on the hash
 * too. Result is stable across reloads for the same image.
 */
function hashFallback(imageUrl: string): SmartCaptionStyle {
  let h = 5381;
  for (let i = 0; i < imageUrl.length; i++) {
    h = ((h << 5) + h + imageUrl.charCodeAt(i)) | 0;
  }
  const positions: CaptionPosition[] = ['bottom', 'top'];
  const position = positions[Math.abs(h) % positions.length];

  // Pick from a small palette of 绘本-friendly pairs. The frame behind the text
  // carries most of the contrast; this only tunes the printed-ink mood.
  const palettes: Array<[string, string]> = [
    ['#a82a3a', '#fff5e1'], // warm red on cream stroke
    ['#1f3a5f', '#fff5e1'], // deep navy on cream stroke
    ['#fff5e1', '#1f3a5f'], // cream on navy stroke (for very dark scenes)
    ['#5a3a1f', '#fce8a8'], // brown on warm yellow stroke
  ];
  const [textColor, strokeColor] = palettes[Math.abs(h >> 4) % palettes.length];
  return { position, textColor, strokeColor, opacity: 0.95 };
}

/**
 * Hook: given an image URL, returns a SmartCaptionStyle describing where
 * and how to render story text on top of the image. Analyzes the image
 * once per URL change; result is stable for the same image.
 */
export function useSmartCaption(imageUrl: string | undefined | null): SmartCaptionStyle | null {
  const [style, setStyle] = useState<SmartCaptionStyle | null>(null);

  useEffect(() => {
    if (!imageUrl) {
      setStyle(null);
      return;
    }

    let cancelled = false;

    const compute = () => {
      const img = new Image();
      // CORS: try anonymous; if the CDN doesn't return CORS headers the
      // canvas will be tainted and getImageData will throw, in which case
      // we fall back to a hash-derived style.
      img.crossOrigin = 'anonymous';
      img.referrerPolicy = 'no-referrer';
      img.onload = () => {
        if (cancelled) return;
        try {
          const SAMPLE = 128; // sample at 128x128 to keep this fast
          const canvas = document.createElement('canvas');
          canvas.width = SAMPLE;
          canvas.height = SAMPLE;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (!ctx) {
            setStyle(hashFallback(imageUrl));
            return;
          }
          // Preserve aspect: cover-fit so the analysis sees the same composition
          // the user sees.
          const ar = img.width / img.height;
          let dw = SAMPLE;
          let dh = SAMPLE;
          let dx = 0;
          let dy = 0;
          if (ar > 1) {
            dh = Math.round(SAMPLE / ar);
            dy = Math.floor((SAMPLE - dh) / 2);
          } else {
            dw = Math.round(SAMPLE * ar);
            dx = Math.floor((SAMPLE - dw) / 2);
          }
          ctx.fillStyle = '#000';
          ctx.fillRect(0, 0, SAMPLE, SAMPLE);
          ctx.drawImage(img, dx, dy, dw, dh);
          const data = ctx.getImageData(0, 0, SAMPLE, SAMPLE);

          const stats: Record<CaptionPosition, RegionStats> = {
            top: analyzeBand(data, SAMPLE, SAMPLE, 'top'),
            bottom: analyzeBand(data, SAMPLE, SAMPLE, 'bottom'),
          };

          // Pick the band with the lowest combined texture/edge score — that's
          // the safest place to put a real picture-book caption block.
          const sortedByUniformity = (Object.keys(stats) as CaptionPosition[])
            .map((k) => ({ pos: k, ...stats[k] }))
            .sort((a, b) => a.variance - b.variance);

          const winner = sortedByUniformity[0];
          const dark = winner.mean < 0.45;
          const veryDark = winner.mean < 0.25;

          // Text color: cream + dark stroke on dark scenes, deep red/blue
          // on bright scenes. Bump opacity if the area is busy.
          let textColor: string;
          let strokeColor: string;
          if (veryDark) {
            textColor = '#fff5e1';
            strokeColor = '#1f3a5f';
          } else if (dark) {
            textColor = '#fff5e1';
            strokeColor = '#1f3a5f';
          } else {
            // Bright scene — alternate between warm red and deep navy
            // depending on the mean (slightly cooler if mean is high, warmer
            // if mid).
            if (winner.mean > 0.7) {
              textColor = '#1f3a5f';
              strokeColor = '#fff5e1';
            } else {
              textColor = '#a82a3a';
              strokeColor = '#fff5e1';
            }
          }

          const opacity = Math.min(1, 0.85 + sortedByUniformity[0].variance * 0.3);

          if (!cancelled) setStyle({ position: winner.pos, textColor, strokeColor, opacity });
        } catch {
          // CORS-tainted canvas or other analysis error — fall back to a
          // hash-derived stable style so different images still get different
          // placement.
          if (!cancelled) setStyle(hashFallback(imageUrl));
        }
      };
      img.onerror = () => {
        if (!cancelled) setStyle(hashFallback(imageUrl));
      };
      img.src = imageUrl;
    };

    compute();

    return () => {
      cancelled = true;
    };
  }, [imageUrl]);

  return style;
}
