// ---------------------------------------------------------------------------
// Constraint resolver
// ---------------------------------------------------------------------------
//
// This module is plain, framework-independent TypeScript: no React, no DOM
// APIs, no `document`, nothing surface-specific hard-coded in.
//
// resolveLayout() reads only:
//   - numeric/boolean constraints carried by a SurfaceProfile (width,
//     height, safeArea, minTapTarget, minTextSize, touchOnly), and
//   - the `role` / `priority` / `type` metadata carried by the AdSpec —
//     which is part of the ad vocabulary itself, general to any ad on any
//     surface (not a per-surface concept).
//
// It never reads `surface.id` or `surface.name` to make a layout decision.
// That is what makes the same function correct for a brand new, previously
// unseen SurfaceProfile with no code changes — see the "surface ID
// independence" test in tests/resolver.test.ts, which proves two surfaces
// with identical constraints but different identities resolve identically.
//
// Algorithm, in order:
//   1. Compute the safe-area rectangle.
//   2. Classify a composition (stacked vs. row) purely from aspect ratio.
//   3. Give the hero element a dedicated region sized from that plan.
//   4. Compute each remaining element's *natural* size from its role and
//      the available width (font ratios, tap-target floors, image ratios).
//   5. Stack those elements into rows and measure the total height needed.
//   6. If it doesn't fit: walk priority tiers from 3 → 1. At each tier,
//      repeatedly shrink → truncate → reposition (merge into a neighboring
//      row) the most space-hungry option available; only once every
//      priority-3-then-2 option is exhausted do elements at that tier get
//      dropped. Priority 1 is never dropped.
//   7. Position the surviving rows, then run a final defensive clamp so no
//      element can ever be returned outside the surface bounds.
//
// The same input always produces the same output — there is no randomness
// and no wall-clock/state dependency anywhere in this file.

import type {
  AdElement,
  AdSpec,
  DegradationAction,
  Priority,
  ResolutionDecision,
  ResolvedElement,
  ResolvedLayout,
  SurfaceProfile,
} from './types';

// ---------------------------------------------------------------------------
// Tunable constants — every number the algorithm uses lives here, none of
// it is keyed by surface identity.
// ---------------------------------------------------------------------------

const LINE_HEIGHT = 1.28;
const AVG_CHAR_WIDTH_RATIO = 0.56;
const TEXT_SHRINK_FACTOR = 0.85;
const IMAGE_SHRINK_FACTOR = 0.8;
const IMAGE_FLOOR = 22;
const IMAGE_NATURAL_RATIO = 0.16;
const IMAGE_NATURAL_MAX = 64;
const TRUNCATE_THRESHOLD_CHARS = 16;

const MAX_LINES: Record<string, number> = {
  primary: 2,
  secondary: 1,
  action: 1,
  branding: 1,
  hero: 2,
};

const FONT_RATIO: Record<string, number> = {
  primary: 0.115,
  secondary: 0.065,
  action: 0.06,
  branding: 0.05,
  hero: 0.09,
};

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function computeSafeAreaRect(surface: SurfaceProfile): Rect {
  const width = Math.max(surface.width - surface.safeArea.left - surface.safeArea.right, 0);
  const height = Math.max(surface.height - surface.safeArea.top - surface.safeArea.bottom, 0);
  return { x: surface.safeArea.left, y: surface.safeArea.top, width, height };
}

export type CompositionMode = 'stacked' | 'row';

export interface CompositionPlan {
  mode: CompositionMode;
  heroFraction: number;
}

/**
 * Chooses how the hero region relates to the content region, purely from
 * the aspect ratio of the usable (safe-area) box. A 900x250 broadcast plate
 * and a hypothetical, never-seen-before 1800x500 custom surface share an
 * aspect ratio and therefore share a composition strategy — nothing here
 * consults what the surface is called.
 */
export function planComposition(usableWidth: number, usableHeight: number): CompositionPlan {
  if (usableWidth <= 0 || usableHeight <= 0) {
    return { mode: 'stacked', heroFraction: 0.5 };
  }
  const aspect = usableWidth / usableHeight;
  if (aspect >= 1.35) {
    const heroFraction = clamp(0.5 - (aspect - 1.35) * 0.04, 0.3, 0.5);
    return { mode: 'row', heroFraction };
  }
  const heroFraction = clamp(0.62 - Math.max(0, 1 - aspect) * 0.1, 0.42, 0.62);
  return { mode: 'stacked', heroFraction };
}

// ---------------------------------------------------------------------------
// Flow box model — every non-hero element becomes a FlowBox that the
// degradation loop can shrink, truncate, reposition, or drop.
// ---------------------------------------------------------------------------

interface FlowBox {
  el: AdElement;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize?: number;
  visible: boolean;
  truncated: boolean;
  repositionTried: boolean;
  rowId: number;
  action: DegradationAction;
  reason: string;
  displayContent?: string;
}

function estimateLines(content: string, fontSize: number, boxWidth: number): number {
  const avgCharWidth = Math.max(fontSize * AVG_CHAR_WIDTH_RATIO, 1);
  const charsPerLine = Math.max(1, Math.floor(boxWidth / avgCharWidth));
  return Math.max(1, Math.ceil(content.length / charsPerLine));
}

function textBlockHeight(content: string, fontSize: number, boxWidth: number, maxLines: number): number {
  const lines = Math.min(estimateLines(content, fontSize, boxWidth), maxLines);
  return Math.ceil(lines * fontSize * LINE_HEIGHT);
}

function naturalFontSize(role: string, contentWidth: number, minTextSize: number): number {
  const ratio = FONT_RATIO[role] ?? 0.07;
  const base = contentWidth * ratio;
  return Math.round(clamp(base, minTextSize, minTextSize * 4.5));
}

function truncateContent(content: string, maxChars: number): string {
  if (content.length <= maxChars) return content;
  return `${content.slice(0, Math.max(1, maxChars - 1)).trimEnd()}…`;
}

function computeButtonSize(
  fontSize: number,
  content: string,
  contentWidth: number,
  minTapTarget: number,
  touchOnly: boolean
): { width: number; height: number } {
  const paddingX = fontSize * 1.4;
  const paddingY = fontSize * 0.9;
  const textWidth = content.length * fontSize * AVG_CHAR_WIDTH_RATIO;
  let width = Math.ceil(textWidth + paddingX * 2);
  let height = Math.ceil(fontSize * LINE_HEIGHT + paddingY * 2);
  if (touchOnly && minTapTarget > 0) {
    width = Math.max(width, minTapTarget);
    height = Math.max(height, minTapTarget);
  }
  width = Math.min(width, contentWidth);
  return { width, height };
}

function buildFlowBox(
  el: AdElement,
  contentWidth: number,
  minTextSize: number,
  minTapTarget: number,
  touchOnly: boolean,
  rowId: number
): FlowBox {
  const base = {
    el,
    x: 0,
    y: 0,
    visible: true,
    truncated: false,
    repositionTried: false,
    rowId,
    action: 'preserved' as DegradationAction,
    reason: 'Fits at natural size for this surface.',
  };

  if (el.type === 'text') {
    const fontSize = naturalFontSize(el.role, contentWidth, minTextSize);
    const maxLines = MAX_LINES[el.role] ?? 2;
    const height = textBlockHeight(el.content, fontSize, contentWidth, maxLines);
    return { ...base, width: contentWidth, height, fontSize, displayContent: el.content };
  }

  if (el.type === 'button') {
    const fontSize = naturalFontSize(el.role, contentWidth, minTextSize);
    const { width, height } = computeButtonSize(fontSize, el.content, contentWidth, minTapTarget, touchOnly);
    return { ...base, width, height, fontSize, displayContent: el.content };
  }

  // Non-hero image (e.g. branding mark).
  const size = Math.round(clamp(contentWidth * IMAGE_NATURAL_RATIO, IMAGE_FLOOR, IMAGE_NATURAL_MAX));
  return { ...base, width: size, height: size };
}

function groupByRow(boxes: FlowBox[]): FlowBox[][] {
  const order: number[] = [];
  const byId = new Map<number, FlowBox[]>();
  for (const box of boxes) {
    if (!byId.has(box.rowId)) {
      byId.set(box.rowId, []);
      order.push(box.rowId);
    }
    byId.get(box.rowId)!.push(box);
  }
  return order.map((id) => byId.get(id)!);
}

function stackHeight(boxes: FlowBox[], gap: number): number {
  const rows = groupByRow(boxes.filter((b) => b.visible));
  if (rows.length === 0) return 0;
  const rowHeights = rows.map((row) => Math.max(...row.map((b) => b.height)));
  return rowHeights.reduce((sum, h) => sum + h, 0) + gap * (rows.length - 1);
}

// ---------------------------------------------------------------------------
// Degradation steps
// ---------------------------------------------------------------------------

function tryShrink(
  box: FlowBox,
  minTextSize: number,
  minTapTarget: number,
  touchOnly: boolean,
  contentWidth: number
): boolean {
  if (box.el.type === 'text' || box.el.type === 'button') {
    const floor = minTextSize;
    const current = box.fontSize ?? floor;
    if (current <= floor + 0.5) return false;

    const next = Math.max(Math.round(current * TEXT_SHRINK_FACTOR), floor);
    box.fontSize = next;

    if (box.el.type === 'text') {
      const maxLines = MAX_LINES[box.el.role] ?? 2;
      box.height = textBlockHeight(box.displayContent ?? box.el.content, next, box.width, maxLines);
    } else {
      const content = box.displayContent ?? box.el.content;
      const size = computeButtonSize(next, content, contentWidth, minTapTarget, touchOnly);
      box.width = size.width;
      box.height = size.height;
    }

    box.action = 'shrunk';
    box.reason = `Reduced to ${next}px (surface minimum is ${floor}px).`;
    return true;
  }

  if (box.el.type === 'image') {
    if (box.width <= IMAGE_FLOOR + 0.5) return false;
    const next = Math.max(Math.round(box.width * IMAGE_SHRINK_FACTOR), IMAGE_FLOOR);
    box.width = next;
    box.height = next;
    box.action = 'shrunk';
    box.reason = `Reduced to ${next}px to help the layout fit.`;
    return true;
  }

  return false;
}

function tryTruncate(box: FlowBox, minTextSize: number): boolean {
  if (box.el.type !== 'text' || box.truncated) return false;
  const content = box.el.content;
  if (content.length <= TRUNCATE_THRESHOLD_CHARS) return false;

  const fontSize = box.fontSize ?? minTextSize;
  const maxLines = MAX_LINES[box.el.role] ?? 2;
  if (estimateLines(content, fontSize, box.width) <= maxLines) return false;

  const avgCharWidth = Math.max(fontSize * AVG_CHAR_WIDTH_RATIO, 1);
  const charsPerLine = Math.max(1, Math.floor(box.width / avgCharWidth));
  const maxChars = Math.max(6, Math.floor(charsPerLine * maxLines * 0.94));

  box.displayContent = truncateContent(content, maxChars);
  box.truncated = true;
  box.height = textBlockHeight(box.displayContent, fontSize, box.width, maxLines);
  box.action = 'truncated';
  box.reason = `Shortened to fit within ${maxLines} line${maxLines > 1 ? 's' : ''}.`;
  return true;
}

/** Merges this box's row with a neighboring row, if the combined width fits. */
function tryReposition(boxes: FlowBox[], box: FlowBox, contentWidth: number, gap: number): boolean {
  if (box.repositionTried) return false;
  box.repositionTried = true;

  const rows = groupByRow(boxes.filter((b) => b.visible));
  const rowIndex = rows.findIndex((row) => row.includes(box));
  if (rowIndex === -1) return false;

  for (const neighborIndex of [rowIndex - 1, rowIndex + 1]) {
    if (neighborIndex < 0 || neighborIndex >= rows.length) continue;
    const rowA = rows[rowIndex];
    const rowB = rows[neighborIndex];
    const merged = [...rowA, ...rowB];
    const combinedWidth = merged.reduce((sum, b) => sum + b.width, 0) + gap * (merged.length - 1);
    if (combinedWidth <= contentWidth) {
      const targetRowId = rowA[0].rowId;
      for (const b of rowB) b.rowId = targetRowId;
      box.action = 'repositioned';
      box.reason = 'Repositioned inline with a neighboring element to reclaim vertical space.';
      return true;
    }
  }
  return false;
}

function hasDegradeRoom(box: FlowBox, minTextSize: number): boolean {
  if (!box.visible) return false;
  if ((box.el.type === 'text' || box.el.type === 'button') && (box.fontSize ?? minTextSize) > minTextSize + 0.5) {
    return true;
  }
  if (box.el.type === 'image' && box.width > IMAGE_FLOOR + 0.5) return true;
  if (box.el.type === 'text' && !box.truncated && box.el.content.length > TRUNCATE_THRESHOLD_CHARS) return true;
  if (!box.repositionTried) return true;
  return false;
}

function degradeStep(
  boxes: FlowBox[],
  box: FlowBox,
  contentWidth: number,
  minTextSize: number,
  minTapTarget: number,
  touchOnly: boolean,
  gap: number
): void {
  if (tryShrink(box, minTextSize, minTapTarget, touchOnly, contentWidth)) return;
  if (tryTruncate(box, minTextSize)) return;
  tryReposition(boxes, box, contentWidth, gap);
}

function degrade(
  boxes: FlowBox[],
  availableHeight: number,
  contentWidth: number,
  minTextSize: number,
  minTapTarget: number,
  touchOnly: boolean,
  gap: number
): void {
  const overflow = () => stackHeight(boxes, gap) - availableHeight;
  const tiers: Priority[] = [3, 2, 1];

  for (const tier of tiers) {
    let guard = 0;
    while (overflow() > 0.5 && guard < 40) {
      guard += 1;
      const target = boxes.find((b) => b.visible && b.el.priority === tier && hasDegradeRoom(b, minTextSize));
      if (!target) break;
      degradeStep(boxes, target, contentWidth, minTextSize, minTapTarget, touchOnly, gap);
    }

    if (tier !== 1) {
      guard = 0;
      while (overflow() > 0.5 && guard < 10) {
        guard += 1;
        // Dropping the biggest remaining element at this tier recovers the
        // most room per drop, minimizing how many elements are lost.
        const droppable = boxes
          .filter((b) => b.visible && b.el.priority === tier)
          .sort((a, b) => b.height - a.height)[0];
        if (!droppable) break;
        droppable.visible = false;
        droppable.action = 'dropped';
        droppable.reason = `Dropped after exhausting shrink and reposition options at priority ${tier}.`;
      }
    }
  }

  const remaining = overflow();
  if (remaining > 0.5) {
    const currentHeight = stackHeight(boxes, gap);
    const scale = currentHeight > 0 ? Math.max(availableHeight / currentHeight, 0.4) : 1;
    for (const box of boxes) {
      if (!box.visible) continue;
      box.height = Math.max(Math.round(box.height * scale), 1);
      if (box.fontSize) {
        box.fontSize = Math.max(Math.round(box.fontSize * scale), Math.round(minTextSize * 0.85));
      }
      if (box.action === 'preserved') {
        box.action = 'compressed';
        box.reason = 'Uniformly compressed as a last resort — the surface is smaller than the content needs.';
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Positioning
// ---------------------------------------------------------------------------

function positionRows(boxes: FlowBox[], contentRect: Rect, gap: number): void {
  const rows = groupByRow(boxes.filter((b) => b.visible));
  let y = contentRect.y;
  for (const row of rows) {
    const rowHeight = Math.max(...row.map((b) => b.height));
    let x = contentRect.x;
    for (const box of row) {
      box.x = x;
      box.y = y + (rowHeight - box.height) / 2;
      x += box.width + gap;
    }
    y += rowHeight + gap;
  }
  for (const box of boxes) {
    if (!box.visible) {
      box.x = contentRect.x;
      box.y = contentRect.y;
    }
  }
}

/** Absolute last line of defence: never return a rect outside the surface. */
function clampToSurface(surface: SurfaceProfile) {
  return (el: ResolvedElement): ResolvedElement => {
    if (!el.visible) return el;
    const width = Math.min(el.width, surface.width);
    const height = Math.min(el.height, surface.height);
    const x = clamp(el.x, 0, Math.max(surface.width - width, 0));
    const y = clamp(el.y, 0, Math.max(surface.height - height, 0));
    return { ...el, x, y, width, height };
  };
}

function toResolvedElement(box: FlowBox, zIndex: number): ResolvedElement {
  let content: string | undefined;
  if (box.el.type === 'text' || box.el.type === 'button') {
    content = box.displayContent ?? box.el.content;
  }

  return {
    id: box.el.id,
    label: box.el.label,
    type: box.el.type,
    role: box.el.role,
    priority: box.el.priority,
    x: Math.round(box.x),
    y: Math.round(box.y),
    width: Math.round(box.width),
    height: Math.round(box.height),
    visible: box.visible,
    fontSize: box.fontSize ? Math.round(box.fontSize) : undefined,
    zIndex,
    content,
    truncated: box.truncated || undefined,
    action: box.action,
    reason: box.reason,
  };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

function byPriority(a: AdElement, b: AdElement): number {
  return a.priority - b.priority;
}

export function resolveLayout(spec: AdSpec, surface: SurfaceProfile): ResolvedLayout {
  const safe = computeSafeAreaRect(surface);
  const { mode, heroFraction } = planComposition(safe.width, safe.height);
  const gap = Math.round(clamp(Math.min(safe.width, safe.height) * 0.035, 6, 18));

  const heroEl = spec.elements.find((e) => e.role === 'hero') ?? null;
  const flowEls = spec.elements.filter((e) => e.id !== heroEl?.id).slice().sort(byPriority);

  let heroBox: FlowBox | null = null;
  let contentRect: Rect;

  if (heroEl && safe.width > 0 && safe.height > 0) {
    if (mode === 'stacked') {
      const heroHeight = Math.round(safe.height * heroFraction);
      heroBox = {
        el: heroEl,
        x: safe.x,
        y: safe.y,
        width: safe.width,
        height: heroHeight,
        visible: true,
        truncated: false,
        repositionTried: true,
        rowId: -1,
        action: 'preserved',
        reason: 'Hero region sized from the composition plan for this aspect ratio.',
      };
      contentRect = {
        x: safe.x,
        y: safe.y + heroHeight + gap,
        width: safe.width,
        height: Math.max(safe.height - heroHeight - gap, 0),
      };
    } else {
      const heroWidth = Math.round(safe.width * heroFraction);
      heroBox = {
        el: heroEl,
        x: safe.x,
        y: safe.y,
        width: heroWidth,
        height: safe.height,
        visible: true,
        truncated: false,
        repositionTried: true,
        rowId: -1,
        action: 'preserved',
        reason: 'Hero region sized from the composition plan for this aspect ratio.',
      };
      contentRect = {
        x: safe.x + heroWidth + gap,
        y: safe.y,
        width: Math.max(safe.width - heroWidth - gap, 0),
        height: safe.height,
      };
    }
  } else {
    contentRect = safe;
  }

  const boxes: FlowBox[] = flowEls.map((el, index) =>
    buildFlowBox(el, contentRect.width, surface.minTextSize, surface.minTapTarget, surface.touchOnly, index)
  );

  degrade(boxes, contentRect.height, contentRect.width, surface.minTextSize, surface.minTapTarget, surface.touchOnly, gap);
  positionRows(boxes, contentRect, gap);

  const resolvedHero = heroBox ? [toResolvedElement(heroBox, 0)] : [];
  const resolvedFlow = boxes.map((box, idx) => toResolvedElement(box, idx + 1));
  const elements = [...resolvedHero, ...resolvedFlow].map(clampToSurface(surface));

  const decisionSource = heroBox ? [heroBox, ...boxes] : boxes;
  const decisions: ResolutionDecision[] = decisionSource.map((box) => ({
    id: box.el.id,
    label: box.el.label,
    action: box.action,
    priority: box.el.priority,
    reason: box.reason,
  }));

  return {
    surfaceId: surface.id,
    surfaceName: surface.name,
    surfaceWidth: surface.width,
    surfaceHeight: surface.height,
    safeArea: surface.safeArea,
    compositionMode: mode,
    elements,
    decisions,
  };
}
