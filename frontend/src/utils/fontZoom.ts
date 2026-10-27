/**
 * KINTSUGI Font Zoom & Typography Scale Utility
 *
 * Manages global application typography scaling by adjusting the root
 * document fontSize percentage. Persists user preference in localStorage.
 */

export const FONT_ZOOM_STORAGE_KEY = 'kintsugi_font_zoom';
export const DEFAULT_FONT_ZOOM = 100;
export const MIN_FONT_ZOOM = 75;
export const MAX_FONT_ZOOM = 150;
export const FONT_ZOOM_STEP = 5;

export interface FontZoomPreset {
  label: string;
  value: number;
  description: string;
}

export const FONT_ZOOM_PRESETS: FontZoomPreset[] = [
  { label: '75%', value: 75, description: 'Compact' },
  { label: '90%', value: 90, description: 'Snug' },
  { label: '100%', value: 100, description: 'Default' },
  { label: '115%', value: 115, description: 'Comfortable' },
  { label: '130%', value: 130, description: 'Large' },
  { label: '145%', value: 145, description: 'Maximum' },
];

/**
 * Retrieve current font zoom from localStorage or default to 100%
 */
export function getStoredFontZoom(): number {
  if (typeof window === 'undefined') return DEFAULT_FONT_ZOOM;
  try {
    const raw = localStorage.getItem(FONT_ZOOM_STORAGE_KEY);
    if (!raw) return DEFAULT_FONT_ZOOM;
    const parsed = Number(raw);
    if (isNaN(parsed) || parsed < MIN_FONT_ZOOM || parsed > MAX_FONT_ZOOM) {
      return DEFAULT_FONT_ZOOM;
    }
    return parsed;
  } catch {
    return DEFAULT_FONT_ZOOM;
  }
}

/**
 * Apply the font zoom percentage to the root documentElement
 */
export function applyFontZoom(zoomPercent: number): void {
  if (typeof document === 'undefined') return;
  const clamped = Math.max(MIN_FONT_ZOOM, Math.min(MAX_FONT_ZOOM, zoomPercent));

  // Set root font-size percentage on <html>
  document.documentElement.style.fontSize = `${clamped}%`;
  document.documentElement.style.setProperty('--app-font-scale', (clamped / 100).toString());

  try {
    localStorage.setItem(FONT_ZOOM_STORAGE_KEY, clamped.toString());
  } catch {
    // Ignore localStorage write failures
  }
}

/**
 * Initialize font zoom on application bootstrap
 */
export function initFontZoom(): number {
  const current = getStoredFontZoom();
  applyFontZoom(current);
  return current;
}
