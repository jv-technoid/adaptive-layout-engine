# Architecture

## Modules and data flow

```
 spec.ts                     surfaces.ts
 (AdSpec, no                 (SurfaceProfile,
  surface data)                per-surface only)
        \                          /
         \                        /
          v                      v
             resolver.ts
      resolveLayout(spec, surface)
      → ResolvedLayout { elements, decisions }
                    |
                    v
            validator.ts
      validateLayout(layout, surface)
      → ValidationResult { valid, checks, violations }
                    |
                    v
            render-dom.ts
   ResolvedElement → React.CSSProperties
                    |
                    v
   components/AdStage.tsx (+ siblings)
        React renders the DOM
```

`resolver.ts` and `validator.ts` import only from `types.ts`. Neither imports React, the DOM, or each other's internals. `App.tsx` is the only place that owns interactive state (selected surface, custom-surface values, uploaded image, stress level, overlay toggles) and it recomputes `layout`/`validation` with `useMemo` whenever an input changes — the UI never mutates a layout after the fact.

## Types

`types.ts` defines two independent vocabularies that meet only inside `ResolvedElement`:

- **Ad vocabulary** (`ElementType`, `ElementRole`, `Priority`, `AdElement`) — describes *intent*: what an element is, what job it does, how critical it is. None of this mentions a surface.
- **Surface vocabulary** (`SurfaceProfile`, `SafeArea`) — describes *constraints*: raw pixel size, safe-area insets, minimum legible text, minimum tap target, whether the surface is touch-capable. None of this mentions the ad.

`AdElement` is a discriminated union on `type` (`TextElement | ImageElement | ButtonElement`). `role` and `priority` are separate fields on the shared base, not baked into the union — so nothing in the type system requires (for example) the hero to be an image. That decoupling is deliberate: it keeps the resolver's hero-handling code generic instead of "the image with role hero."

`ResolvedElement` is the single output shape the renderer needs — position, size, visibility, `fontSize` where relevant, and an `action`/`reason` pair explaining what the resolver did and why. The renderer never has to re-derive anything or guess.

## Constraints

A `SurfaceProfile` is nothing but numbers and one boolean: `width`, `height`, `safeArea` (four insets), `minTapTarget`, `minTextSize`, `touchOnly`, plus optional `viewingDistance`/`min*`/`max*` metadata used for display only. The resolver reads exactly these fields — never `id`, never `name`. That is what makes "add a new surface" a matter of writing a new `SurfaceProfile` object, not new code (see `tests/resolver.test.ts`'s "surface ID independence" and "custom / previously unseen surface" suites, which construct surfaces the resolver has never encountered and assert they resolve correctly).

## Resolver

### 1. Safe area

`computeSafeAreaRect()` subtracts the four safe-area insets from the surface's width/height. Everything downstream operates inside this rectangle, not the raw surface — the raw surface only reappears at the very end, as the outer bound for the defensive clamp.

### 2. Composition planning

`planComposition(usableWidth, usableHeight)` is a pure function of the safe area's **aspect ratio** — nothing else:

- `aspect >= 1.35` → `row` mode: the hero sits beside the content column. The hero's share of the width *shrinks* as the surface gets wider (a 900px-wide broadcast plate doesn't need the same hero proportion as a 568px landscape phone), clamped to 30–50%.
- otherwise → `stacked` mode: the hero sits above the content column, sized 42–62% of the height depending on how far from square the surface is.

This is the mechanism that satisfies "no hardcoded surface layouts": a hypothetical 1800×500 surface the resolver has never seen shares an aspect ratio with the 900×250 broadcast profile and receives the same treatment, automatically.

### 3. Natural sizing

Every non-hero element gets a *natural* size before any degradation is considered:

- **Text**: font size = `contentWidth × roleRatio`, clamped to `[minTextSize, minTextSize × 4.5]`. Height is estimated from a characters-per-line heuristic (`fontSize × 0.56` average glyph width) capped at a role-specific maximum line count (2 for headlines, 1 for price/CTA/branding).
- **Button**: same font-size formula, padded, and — on touch-capable surfaces with a positive `minTapTarget` — floored to that tap target in both dimensions.
- **Non-hero image** (branding): sized to 16% of content width, clamped to `[22, 64]`px.

None of these ratios are surface-specific; they're keyed by `role`, which is ad vocabulary, not surface vocabulary.

### 4. Allocation

Elements are stacked into **rows** (one element per row initially, in priority-then-declaration order) inside the content rectangle. `stackHeight()` sums each row's tallest element plus a gap derived from `min(safeWidth, safeHeight) × 0.035`. If the sum fits, nothing further happens — every element is `preserved`.

### 5. Priority and degradation

If the stack overflows the content rectangle, `degrade()` walks priority tiers **3 → 2 → 1**. At each tier, it repeatedly finds the highest-priority-tier element that still has room to give and applies, in order:

1. **Shrink** — reduce font size by a fixed factor (0.85 for text, 0.8 for images) down to the surface's `minTextSize` floor (or the image floor of 22px). Buttons reflow their padding and re-apply the tap-target floor after each shrink.
2. **Truncate** — if shrinking alone can't bring a text block within its line budget, content is cut to fit exactly that many lines, with an ellipsis. Marked `truncated: true`.
3. **Reposition** — merge the element's row with an adjacent row if the combined width still fits the content column (this is how, e.g., price ends up inline with the CTA button on a cramped surface instead of stacked above it — recovering an entire row's height and one gap).

Only once **all** elements at a tier have exhausted shrink/truncate/reposition — and the tier is not priority 1 — does the loop start **dropping** elements, biggest-first (to recover the most room per drop). Priority 1 is structurally exempt from the drop loop; in the pathological case where even a fully-shrunk priority-1 stack doesn't fit, a final proportional-compression safety net scales everything down uniformly rather than clipping (this is the `compressed` action, and it only fires when a surface is smaller than its own constraints can support at all).

Every mutation updates the box's `action`/`reason` in place; `resolveLayout()` reads the final state once, after degradation settles, to build the `decisions` array — so the log reflects outcomes, not a noisy step-by-step trace.

### 6. Positioning

`positionRows()` walks the surviving rows top-to-bottom, packing each row's elements left-to-right with the same gap used for stacking, vertically centering elements within a shared row. Because rows never share a y-range, non-overlap is a structural property of this pass, not something checked after the fact.

### 7. Defensive clamp

`clampToSurface()` is the last step before returning: it caps every visible element's rectangle to the raw surface bounds (not just the safe area). This is a deliberate second line of defence on top of the degradation loop's own safety net — for a project whose whole premise is "never clip, never overlap," the resolver would rather visibly compress content than return a rectangle a consumer could render outside the canvas.

## Validation

`validator.ts` is intentionally not a thin wrapper around the resolver's own state. It takes only a `ResolvedLayout` and a `SurfaceProfile` — plain data — and re-derives six checks from scratch: valid dimensions, safe-area containment, clipping against the full surface, pairwise bounding-box overlap among visible elements, minimum text size, and minimum tap target (the last only enforced when `touchOnly && minTapTarget > 0`, so non-interactive surfaces like the broadcast plate aren't penalized for a constraint that doesn't apply to them). Because it never imports resolver internals, a bug that made the resolver *believe* it had avoided an overlap wouldn't also fool the validator.

## Rendering

`render-dom.ts` converts a `ResolvedElement` into a `React.CSSProperties` object (`position: absolute`, `left`/`top`/`width`/`height`, `fontSize`, `opacity` for visibility). `components/AdStage.tsx` applies those styles to plain `<div>`s and switches on `element.type`/`element.role` to decide what to render inside: ad copy for text, a styled button face for buttons, the uploaded image (or an SVG placeholder) for the hero, and a small SVG mark for branding. The stage itself is measured with a `ResizeObserver` and scaled with a CSS `transform` so a 900px-wide broadcast plate and a 320px phone both fit the same column without any surface-specific CSS.

## Custom surfaces

The custom-surface form in the UI does nothing but construct a new `SurfaceProfile` object from five numeric inputs and hand it to the exact same `resolveLayout()` call used for the four built-in surfaces. There is no separate "custom" code path in the resolver — `surfaces.ts`'s `defaultCustomSurface` is just a starting point for the form's state.

## Extensibility

Adding a fifth built-in surface means adding one `SurfaceProfile` object to `surfaces.ts` and one line to `defaultSurfaces`. Adding a second ad spec means writing a second `AdSpec` object (any mix of element types/roles/priorities) and passing it to `resolveLayout()` instead of `novaAdSpec` — nothing in `resolver.ts` assumes there are exactly five elements or exactly one hero+one-CTA+one-logo shape. A spec with two hero-role images, for instance, would have the resolver pick the first (by priority, then declaration order) for the dedicated hero region and flow the rest — not crash, not require new code.

## Complexity

`resolveLayout()` runs in effectively constant time for a spec of this size: allocation is O(n log n) (one sort by priority), and the degradation loop is bounded by fixed guard counters (≤40 shrink/truncate/reposition attempts and ≤10 drop attempts per tier) rather than being unbounded, so it always terminates even in pathological inputs. `groupByRow()` is O(n²) in the worst case (it's called repeatedly during degradation) but `n` is the number of ad elements — small by construction — so this is a non-issue in practice; it would be worth revisiting only if specs grew to dozens of elements.

## Trade-offs

- **Heuristic text measurement vs. real DOM measurement.** Measuring actual rendered text (e.g. via a hidden canvas/`measureText`) would be more accurate but ties the "pure TypeScript" resolver to a browser API, breaking the framework-independence requirement. The character-width heuristic is close enough for layout decisions and keeps `resolver.ts` runnable in Node (which is exactly what the test suite does).
- **Two composition modes vs. more.** A three-or-more-mode planner (e.g. a distinct "banner" mode for very wide/short surfaces) could produce more bespoke-feeling layouts for extreme aspect ratios, at the cost of more branching to reason about and test. Two modes driven by a continuous aspect-ratio calculation, with the hero fraction itself varying continuously within each mode, covers the required four surfaces plus arbitrary custom surfaces without needing a third bucket.
- **Row-merge reposition vs. free-form reflow.** A more general reflow (e.g. text wrapping around an image) would look more like real ad design software, but is a meaningfully larger algorithm for a take-home-sized project. Row-merging is a small, well-defined operation that's easy to verify never introduces overlap (merged elements still occupy disjoint x-ranges within a shared y-band).
