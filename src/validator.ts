// ---------------------------------------------------------------------------
// Validator
// ---------------------------------------------------------------------------
//
// Deliberately independent of resolver.ts: it does not import any resolver
// internals or trust the `action`/`reason` fields the resolver attached. It
// re-derives every check from raw geometry (the ResolvedLayout's element
// rects) against the SurfaceProfile's own constraints, so a bug in the
// resolver's bookkeeping can't quietly disable the check that would catch it.

import type { ConstraintViolation, ResolvedElement, ResolvedLayout, SurfaceProfile, ValidationResult } from './types';

interface RectLike {
  x: number;
  y: number;
  width: number;
  height: number;
}

function rectsOverlap(a: RectLike, b: RectLike): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

const EPSILON = 0.5;

export function validateLayout(layout: ResolvedLayout, surface: SurfaceProfile): ValidationResult {
  const violations: ConstraintViolation[] = [];
  const visible = layout.elements.filter((e) => e.visible);

  checkDimensions(visible, violations);
  checkSafeArea(visible, surface, violations);
  checkClipping(visible, surface, violations);
  checkOverlap(visible, violations);
  checkTextSize(visible, surface, violations);
  checkTapTargets(visible, surface, violations);

  const checks = {
    noOverlap: !violations.some((v) => v.type === 'overlap'),
    withinSafeArea: !violations.some((v) => v.type === 'safe-area-violation'),
    noClipping: !violations.some((v) => v.type === 'clipping'),
    textSizeOk: !violations.some((v) => v.type === 'text-too-small'),
    tapTargetOk: !violations.some((v) => v.type === 'tap-target-too-small'),
    validDimensions: !violations.some((v) => v.type === 'invalid-dimensions'),
  };

  return {
    valid: violations.every((v) => v.severity !== 'error'),
    violations,
    checks,
  };
}

function checkDimensions(elements: ResolvedElement[], violations: ConstraintViolation[]): void {
  for (const el of elements) {
    if (el.width <= 0 || el.height <= 0 || Number.isNaN(el.x) || Number.isNaN(el.y)) {
      violations.push({
        type: 'invalid-dimensions',
        elementId: el.id,
        message: `${el.label} has invalid dimensions (${el.width}×${el.height}).`,
        severity: 'error',
      });
    }
  }
}

function checkSafeArea(elements: ResolvedElement[], surface: SurfaceProfile, violations: ConstraintViolation[]): void {
  const left = surface.safeArea.left;
  const top = surface.safeArea.top;
  const right = surface.width - surface.safeArea.right;
  const bottom = surface.height - surface.safeArea.bottom;

  for (const el of elements) {
    const outside = el.x < left - EPSILON || el.y < top - EPSILON || el.x + el.width > right + EPSILON || el.y + el.height > bottom + EPSILON;
    if (outside) {
      violations.push({
        type: 'safe-area-violation',
        elementId: el.id,
        message: `${el.label} extends outside the safe area.`,
        severity: 'error',
      });
    }
  }
}

function checkClipping(elements: ResolvedElement[], surface: SurfaceProfile, violations: ConstraintViolation[]): void {
  for (const el of elements) {
    const clipped = el.x < -EPSILON || el.y < -EPSILON || el.x + el.width > surface.width + EPSILON || el.y + el.height > surface.height + EPSILON;
    if (clipped) {
      violations.push({
        type: 'clipping',
        elementId: el.id,
        message: `${el.label} is clipped by the surface bounds.`,
        severity: 'error',
      });
    }
  }
}

function checkOverlap(elements: ResolvedElement[], violations: ConstraintViolation[]): void {
  for (let i = 0; i < elements.length; i += 1) {
    for (let j = i + 1; j < elements.length; j += 1) {
      if (rectsOverlap(elements[i], elements[j])) {
        violations.push({
          type: 'overlap',
          elementId: `${elements[i].id}+${elements[j].id}`,
          message: `${elements[i].label} overlaps ${elements[j].label}.`,
          severity: 'error',
        });
      }
    }
  }
}

function checkTextSize(elements: ResolvedElement[], surface: SurfaceProfile, violations: ConstraintViolation[]): void {
  for (const el of elements) {
    if (el.fontSize !== undefined && el.fontSize < surface.minTextSize - EPSILON) {
      violations.push({
        type: 'text-too-small',
        elementId: el.id,
        message: `${el.label} is ${el.fontSize}px, below the ${surface.minTextSize}px minimum.`,
        severity: 'error',
      });
    }
  }
}

function checkTapTargets(elements: ResolvedElement[], surface: SurfaceProfile, violations: ConstraintViolation[]): void {
  if (!surface.touchOnly || surface.minTapTarget <= 0) return;
  for (const el of elements) {
    if (el.type !== 'button') continue;
    if (el.width < surface.minTapTarget - EPSILON || el.height < surface.minTapTarget - EPSILON) {
      violations.push({
        type: 'tap-target-too-small',
        elementId: el.id,
        message: `${el.label} is ${el.width}×${el.height}, below the ${surface.minTapTarget}px tap target minimum.`,
        severity: 'error',
      });
    }
  }
}
