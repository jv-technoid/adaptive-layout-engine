import type { StressLevel, SurfaceProfile } from './types';

export const mobilePortrait: SurfaceProfile = {
  id: 'mobile-portrait',
  name: 'Mobile Portrait',
  width: 320,
  height: 480,
  safeArea: { top: 16, right: 16, bottom: 16, left: 16 },
  minTapTarget: 44,
  minTextSize: 14,
  touchOnly: true,
  viewingDistance: 'close',
};

export const mobileLandscape: SurfaceProfile = {
  id: 'mobile-landscape',
  name: 'Mobile Landscape',
  width: 568,
  height: 320,
  safeArea: { top: 12, right: 20, bottom: 12, left: 20 },
  minTapTarget: 44,
  minTextSize: 14,
  touchOnly: true,
  viewingDistance: 'close',
};

export const broadcastLowerThird: SurfaceProfile = {
  id: 'broadcast-lower-third',
  name: 'Broadcast Lower Third',
  width: 900,
  height: 250,
  safeArea: { top: 10, right: 36, bottom: 10, left: 36 },
  minTapTarget: 0,
  minTextSize: 22,
  touchOnly: false,
  viewingDistance: 'far',
};

export const retailKiosk: SurfaceProfile = {
  id: 'retail-kiosk',
  name: 'Retail Kiosk',
  width: 600,
  height: 600,
  safeArea: { top: 24, right: 24, bottom: 24, left: 24 },
  minTapTarget: 56,
  minTextSize: 16,
  touchOnly: true,
  viewingDistance: 'medium',
};

export const defaultSurfaces: SurfaceProfile[] = [
  mobilePortrait,
  mobileLandscape,
  broadcastLowerThird,
  retailKiosk,
];

export const defaultCustomSurface: SurfaceProfile = {
  id: 'custom',
  name: 'Custom Surface',
  width: 400,
  height: 400,
  safeArea: { top: 20, right: 20, bottom: 20, left: 20 },
  minTapTarget: 44,
  minTextSize: 14,
  touchOnly: true,
  viewingDistance: 'medium',
};

const STRESS_FACTORS: Record<StressLevel, number> = {
  normal: 1,
  constrained: 0.68,
  'very-constrained': 0.46,
};

/**
 * Simulates "less available space" by shrinking the surface's raw pixel
 * footprint while leaving every other constraint (safe-area insets, minimum
 * text size, minimum tap target) untouched. This is not a special resolver
 * code path — it just constructs a smaller SurfaceProfile and hands it to
 * the same resolveLayout() function. Because the fixed-size constraints now
 * consume a larger share of a smaller surface, the resolver is naturally
 * forced to degrade more aggressively.
 */
export function applyStress(surface: SurfaceProfile, level: StressLevel): SurfaceProfile {
  const factor = STRESS_FACTORS[level];
  if (factor === 1) return surface;
  return {
    ...surface,
    id: `${surface.id}--${level}`,
    width: Math.max(Math.round(surface.width * factor), 60),
    height: Math.max(Math.round(surface.height * factor), 60),
  };
}
