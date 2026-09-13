// ---------------------------------------------------------------------------
// Ad specification
// ---------------------------------------------------------------------------

export type ElementType = 'text' | 'image' | 'button';

/**
 * What role an element plays in the composition. This is part of the ad
 * spec's own vocabulary (general to any ad, on any surface) — it is not a
 * surface-specific concept. The resolver uses it to decide *composition
 * intent* (e.g. "the hero gets a dedicated region"), never to decide
 * "for surface X, do Y".
 */
export type ElementRole = 'primary' | 'hero' | 'secondary' | 'action' | 'branding';

/** 1 = critical (never dropped), 2 = important, 3 = optional (degrades first). */
export type Priority = 1 | 2 | 3;

interface AdElementBase {
  id: string;
  type: ElementType;
  role: ElementRole;
  priority: Priority;
  /** Human-readable label used in the UI (decision log, spec list). */
  label: string;
}

export interface TextElement extends AdElementBase {
  type: 'text';
  content: string;
}

export interface ImageElement extends AdElementBase {
  type: 'image';
  /** Optional static content reference. The hero image's actual pixels come
   * from the uploaded creative at render time, not from the spec. */
  content?: string;
}

export interface ButtonElement extends AdElementBase {
  type: 'button';
  content: string;
}

export type AdElement = TextElement | ImageElement | ButtonElement;

export interface AdSpec {
  id: string;
  name: string;
  elements: AdElement[];
}

// ---------------------------------------------------------------------------
// Surface profile
// ---------------------------------------------------------------------------

export interface SafeArea {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export type ViewingDistance = 'close' | 'medium' | 'far';

export interface SurfaceProfile {
  id: string;
  name: string;
  width: number;
  height: number;
  safeArea: SafeArea;
  /** Minimum interactive target size in px. Only enforced when touchOnly is true. */
  minTapTarget: number;
  /** Minimum legible font size in px for this surface. */
  minTextSize: number;
  touchOnly: boolean;
  viewingDistance?: ViewingDistance;
  minWidth?: number;
  maxWidth?: number;
  minHeight?: number;
  maxHeight?: number;
}

export type StressLevel = 'normal' | 'constrained' | 'very-constrained';

// ---------------------------------------------------------------------------
// Resolution output
// ---------------------------------------------------------------------------

export type DegradationAction =
  | 'preserved'
  | 'shrunk'
  | 'truncated'
  | 'repositioned'
  | 'dropped'
  | 'compressed';

export interface ResolvedElement {
  id: string;
  label: string;
  type: ElementType;
  role: ElementRole;
  priority: Priority;
  x: number;
  y: number;
  width: number;
  height: number;
  visible: boolean;
  fontSize?: number;
  zIndex: number;
  content?: string;
  truncated?: boolean;
  action: DegradationAction;
  reason: string;
}

export interface ResolutionDecision {
  id: string;
  label: string;
  action: DegradationAction;
  priority: Priority;
  reason: string;
}

export interface ResolvedLayout {
  surfaceId: string;
  surfaceName: string;
  surfaceWidth: number;
  surfaceHeight: number;
  safeArea: SafeArea;
  compositionMode: 'stacked' | 'row';
  elements: ResolvedElement[];
  decisions: ResolutionDecision[];
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type ViolationType =
  | 'out-of-bounds'
  | 'safe-area-violation'
  | 'overlap'
  | 'clipping'
  | 'text-too-small'
  | 'tap-target-too-small'
  | 'invalid-dimensions';

export interface ConstraintViolation {
  type: ViolationType;
  elementId?: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface ValidationChecks {
  noOverlap: boolean;
  withinSafeArea: boolean;
  noClipping: boolean;
  textSizeOk: boolean;
  tapTargetOk: boolean;
  validDimensions: boolean;
}

export interface ValidationResult {
  valid: boolean;
  violations: ConstraintViolation[];
  checks: ValidationChecks;
}
