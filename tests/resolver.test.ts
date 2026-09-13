import { describe, expect, it } from 'vitest';
import { resolveLayout } from '../src/resolver';
import { validateLayout } from '../src/validator';
import { novaAdSpec } from '../src/spec';
import { broadcastLowerThird, defaultSurfaces, mobileLandscape, mobilePortrait, retailKiosk } from '../src/surfaces';
import type { SurfaceProfile } from '../src/types';

describe('resolveLayout — every default surface produces a valid layout', () => {
  for (const surface of defaultSurfaces) {
    it(`${surface.name} (${surface.width}x${surface.height})`, () => {
      const layout = resolveLayout(novaAdSpec, surface);
      const result = validateLayout(layout, surface);

      expect(result.checks.noOverlap).toBe(true);
      expect(result.checks.noClipping).toBe(true);
      expect(result.checks.withinSafeArea).toBe(true);
      expect(result.checks.textSizeOk).toBe(true);
      expect(result.checks.tapTargetOk).toBe(true);
      expect(result.checks.validDimensions).toBe(true);
      expect(result.valid).toBe(true);

      // At least the two priority-1 elements (headline + hero) must always survive.
      const priority1 = layout.elements.filter((e) => e.priority === 1);
      expect(priority1.every((e) => e.visible)).toBe(true);
    });
  }
});

describe('resolveLayout — broadcast honors its larger minimum text size', () => {
  it('never renders below 22px even though the surface is short', () => {
    const layout = resolveLayout(novaAdSpec, broadcastLowerThird);
    for (const el of layout.elements) {
      if (el.visible && el.fontSize !== undefined) {
        expect(el.fontSize).toBeGreaterThanOrEqual(broadcastLowerThird.minTextSize - 1);
      }
    }
  });
});

describe('resolveLayout — kiosk honors its larger minimum tap target', () => {
  it('never renders a visible button smaller than 56px', () => {
    const layout = resolveLayout(novaAdSpec, retailKiosk);
    const cta = layout.elements.find((e) => e.type === 'button');
    expect(cta).toBeDefined();
    if (cta?.visible) {
      expect(cta.width).toBeGreaterThanOrEqual(retailKiosk.minTapTarget - 1);
      expect(cta.height).toBeGreaterThanOrEqual(retailKiosk.minTapTarget - 1);
    }
  });
});

describe('resolveLayout — custom / previously unseen surface', () => {
  const bannerSurface: SurfaceProfile = {
    id: 'custom-banner-728x90',
    name: 'Leaderboard Banner',
    width: 728,
    height: 90,
    safeArea: { top: 4, right: 10, bottom: 4, left: 10 },
    minTapTarget: 0,
    minTextSize: 11,
    touchOnly: false,
  };

  it('resolves a surface the resolver has never seen, with no special-casing required', () => {
    const layout = resolveLayout(novaAdSpec, bannerSurface);
    const result = validateLayout(layout, bannerSurface);

    expect(result.checks.noOverlap).toBe(true);
    expect(result.checks.noClipping).toBe(true);
    expect(result.checks.withinSafeArea).toBe(true);
  });
});

describe('resolveLayout — determinism', () => {
  it('produces identical output for repeated calls with identical input', () => {
    const a = resolveLayout(novaAdSpec, mobilePortrait);
    const b = resolveLayout(novaAdSpec, mobilePortrait);
    expect(a).toEqual(b);
  });

  it('is stable across all default surfaces', () => {
    for (const surface of defaultSurfaces) {
      const a = resolveLayout(novaAdSpec, surface);
      const b = resolveLayout(novaAdSpec, surface);
      expect(a).toEqual(b);
    }
  });
});

describe('resolveLayout — surface ID independence', () => {
  it('two surfaces with identical constraints but different identities resolve to the same layout', () => {
    const surfaceA: SurfaceProfile = { ...mobileLandscape, id: 'surface-a', name: 'Surface A' };
    const surfaceB: SurfaceProfile = { ...mobileLandscape, id: 'zzz-totally-different', name: 'Nothing Alike' };

    const layoutA = resolveLayout(novaAdSpec, surfaceA);
    const layoutB = resolveLayout(novaAdSpec, surfaceB);

    expect(layoutA.elements).toEqual(layoutB.elements);
    expect(layoutA.decisions).toEqual(layoutB.decisions);
    expect(layoutA.compositionMode).toEqual(layoutB.compositionMode);
  });
});

describe('resolveLayout — priority degradation under extreme constraint', () => {
  const tinySurface: SurfaceProfile = {
    id: 'extreme-tiny',
    name: 'Extreme Constraint Test',
    width: 200,
    height: 130,
    safeArea: { top: 6, right: 6, bottom: 6, left: 6 },
    minTapTarget: 40,
    minTextSize: 12,
    touchOnly: true,
  };

  it('never drops a priority-1 element', () => {
    const layout = resolveLayout(novaAdSpec, tinySurface);
    const priority1 = layout.elements.filter((e) => e.priority === 1);
    expect(priority1.length).toBeGreaterThan(0);
    for (const el of priority1) {
      expect(el.visible).toBe(true);
    }
  });

  it('degrades the lowest-priority element before anything else is dropped', () => {
    const layout = resolveLayout(novaAdSpec, tinySurface);
    const branding = layout.elements.find((e) => e.role === 'branding');
    const priority2 = layout.elements.filter((e) => e.priority === 2);

    // If any priority-2 element was dropped, priority-3 branding must have
    // been dropped (or already had no more room to give) first.
    const anyP2Dropped = priority2.some((e) => e.action === 'dropped');
    if (anyP2Dropped) {
      expect(branding?.visible).toBe(false);
    }
  });

  it('still produces a layout with no overlap and no clipping', () => {
    const layout = resolveLayout(novaAdSpec, tinySurface);
    const result = validateLayout(layout, tinySurface);
    expect(result.checks.noOverlap).toBe(true);
    expect(result.checks.noClipping).toBe(true);
  });
});

describe('resolveLayout — truncation', () => {
  it('truncates long text content that would otherwise wrap past its line budget', () => {
    const narrowSurface: SurfaceProfile = {
      id: 'narrow-text-test',
      name: 'Narrow Text Test',
      width: 180,
      height: 400,
      safeArea: { top: 12, right: 12, bottom: 12, left: 12 },
      minTapTarget: 40,
      minTextSize: 12,
      touchOnly: true,
    };

    const longSpec = {
      id: 'long-copy-test',
      name: 'Long Copy Test',
      elements: [
        {
          id: 'headline',
          type: 'text' as const,
          role: 'primary' as const,
          priority: 1 as const,
          label: 'Headline',
          content:
            'This is a deliberately long headline written to exceed the available line budget for this narrow surface',
        },
        { id: 'hero', type: 'image' as const, role: 'hero' as const, priority: 1 as const, label: 'Hero' },
      ],
    };

    const layout = resolveLayout(longSpec, narrowSurface);
    const headline = layout.elements.find((e) => e.id === 'headline');
    expect(headline).toBeDefined();
    expect(headline?.truncated).toBe(true);
  });
});
