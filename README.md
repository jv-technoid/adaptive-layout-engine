# Adaptive Layout Engine for Multi-Surface Ads

A constraint-based layout engine that takes **one declarative ad specification** and resolves it onto **any surface** — mobile, broadcast, kiosk, or a surface it has never seen before — using a single, deterministic resolver with no per-surface branching.

```
Ad Spec + Surface Profile
        ↓
Constraint Resolver
        ↓
Resolved Layout
        ↓
Validation
        ↓
Renderer (React)
```

## Problem statement

Ad creative today is usually built per-surface: a designer (or a pile of `if (surface === 'mobile')` code) hand-places elements for each format. That doesn't scale — every new placement needs new code, and there's no guarantee the "mobile" version and the "kiosk" version are expressing the same creative intent.

This project inverts that: the **ad spec describes intent** (what the elements are, their role, and how critical each one is), the **surface profile describes constraints** (size, safe area, minimum legible text, minimum tap target), and a **resolver** — plain, framework-independent TypeScript — computes a layout from those two inputs alone. Add a new surface by describing its constraints; zero resolver code changes.

## Architecture

| Module | Responsibility |
|---|---|
| `src/types.ts` | Shared type system: `AdSpec`, `SurfaceProfile`, `ResolvedLayout`, `ValidationResult`, etc. |
| `src/spec.ts` | The one ad spec used throughout (`novaAdSpec`) — no surface-specific data. |
| `src/surfaces.ts` | The four default `SurfaceProfile`s, the default custom-surface starting point, and `applyStress()`. |
| `src/resolver.ts` | The constraint resolver. Pure TypeScript, no DOM/React. |
| `src/validator.ts` | An **independent** validator that re-derives every check from raw geometry — it does not trust the resolver's own bookkeeping. |
| `src/render-dom.ts` | Pure functions turning a `ResolvedElement`/`ResolvedLayout` into CSS style objects. |
| `src/components/*` | React UI: surface picker, spec/upload panel, live stage, resolution log, stats bar. |
| `src/App.tsx` | Wires state (selected surface, uploaded image, stress level, overlays) to the resolver and the UI. |

See `ARCHITECTURE.md` for the full data flow and algorithm details.

## Features

- Genuine constraint resolution — priority-ordered, explainable, deterministic (see "Constraint algorithm" below).
- Four built-in surface profiles: Mobile Portrait, Mobile Landscape, Broadcast Lower Third, Retail Kiosk.
- **Custom surface**: width, height, safe-area padding, minimum text size, and minimum tap target are all live controls that re-run the same resolver.
- **Image upload**: PNG/JPG/WebP creative replaces the hero placeholder and participates in the resolved layout on every surface, via `URL.createObjectURL` — no backend.
- **Stress test**: Normal / Constrained / Very constrained — shrinks the surface's raw pixel footprint (not its constraints) so the same resolver degrades more aggressively.
- Live validation checklist (overlap, safe area, clipping, text size, tap target) computed independently of the resolver.
- A numbered "Resolution decisions" log explaining what happened to every element and why.
- Safe-area overlay and per-element decision chips, toggleable on the live stage.
- Deterministic — resolving the same spec + surface twice always returns the same layout (see tests).

## Tech stack

React 18 · TypeScript (strict) · Vite 5 · Vitest · lucide-react. No CSS framework — hand-written CSS with a small design-token system.

## Installation

```bash
npm install
```

## Running locally

```bash
npm run dev       # start the dev server
npm run build     # type-check (tsc) + production build
npm run preview   # preview the production build
npm test          # run the resolver test suite (vitest)
```

## Surface switching

Clicking a surface in the left panel re-runs `resolveLayout(novaAdSpec, surface)` with a different `SurfaceProfile`. Nothing else changes — same spec, same resolver, same validator. Element positions animate between surfaces via CSS transitions on the resolved `x`/`y`/`width`/`height`.

## Image upload

"Upload creative" accepts PNG/JPG/WebP, creates an object URL, and stores it in React state. The hero element's *resolved rectangle* (position and size) always comes from the resolver — the image is rendered inside that rectangle with `object-fit: cover`, so it crops to fit without ever influencing the layout math. No image, on any surface, means no hardcoded image dimensions anywhere in the pipeline.

## Custom surfaces

Selecting "Custom" reveals five inputs (width, height, safe-area padding, minimum text size, minimum tap target). Every keystroke constructs a new `SurfaceProfile` object and re-runs the same `resolveLayout()`. This is the clearest proof that the algorithm isn't secretly keyed to the four built-in surfaces — try an extreme aspect ratio (e.g. 800×120) and watch the composition mode switch from "stacked" to "row" automatically.

## Stress testing

The three-way control doesn't add a special code path — `applyStress()` just scales the *surface's* width/height down while leaving its safe area, minimum text size, and minimum tap target untouched. Fixed-size constraints then consume a larger share of a smaller surface, which forces the same resolver to degrade further. Watch the "Resolution decisions" panel: branding (priority 3) degrades first, then price/CTA (priority 2) shrink or reposition, and priority 1 (headline, hero) is never dropped.

## Constraint algorithm

In order, `resolveLayout()`:

1. Computes the safe-area rectangle (surface size minus safe-area insets).
2. Classifies a **composition mode** — `stacked` or `row` — purely from the safe area's aspect ratio, and sizes a hero region from that plan.
3. Computes each remaining element's *natural* size from its `role` (a font-size ratio, an image-size ratio, or a tap-target-aware button size) and the available content width.
4. Stacks those elements into rows and measures the total height required.
5. If it doesn't fit, walks priority tiers 3 → 2 → 1. At each tier it repeatedly tries **shrink → truncate → reposition** (merge into a neighboring row) on the most under-pressure element; only once every cheaper option is exhausted at a tier does an element get **dropped** — and priority 1 is never dropped.
6. Positions the surviving rows and runs a final defensive clamp so no rectangle can ever be returned outside the surface bounds.

## Priority / degradation

- **Priority 1 (critical)** — preserved as long as physically possible; only ever shrunk (never dropped) as an absolute last resort.
- **Priority 2 (important)** — shrinks and can reposition; dropped only if that's not enough.
- **Priority 3 (optional)** — shrinks, repositions, and drops first.

Every degradation records a human-readable `reason` string, surfaced in the "Resolution decisions" panel.

## Validation

`validator.ts` does not import anything from `resolver.ts` beyond shared types, and does not trust the `action`/`reason` fields the resolver attaches. It re-derives bounds, safe-area containment, pairwise overlap, clipping, minimum text size, and minimum tap target directly from each element's rectangle and the surface's own constraints — so a bug in the resolver's internal bookkeeping can't quietly disable the check that would catch it.

## TypeScript design

Strict mode, `noUnusedLocals`/`noUnusedParameters` on. `AdElement` is a discriminated union (`TextElement | ImageElement | ButtonElement`) on `type`; `role` and `priority` are independent axes so the union stays generic (nothing requires the hero to be an image, for instance). All resolver-facing constants live in one block at the top of `resolver.ts` — nothing is a magic number scattered through the logic.

## Testing

`tests/resolver.test.ts` (Vitest) covers: every default surface resolving validly, broadcast's larger minimum text size, kiosk's larger tap target, a custom/never-seen-before surface, determinism (same input twice → identical output), **surface ID independence** (two surfaces with identical constraints but different ids/names resolve to identical element layouts — proof the resolver never branches on identity), priority degradation under an extreme surface (priority 1 never drops), and truncation triggering on deliberately long copy.

Run with `npm test`.

## Known limitations

- Text height is estimated from an average-character-width heuristic, not real DOM text measurement — estimated line counts can differ slightly from the rendered font in unusual cases.
- The composition planner has two modes (`stacked`/`row`); extremely elongated custom surfaces (e.g. 20:1) still resolve, but the hero region shrinks to a fairly minimal allocation rather than adopting a third layout strategy.
- Uploaded images use `object-fit: cover`, so unusual source aspect ratios are cropped rather than letterboxed.
- The stress test approximates "less space" by scaling surface dimensions; it doesn't model codec/overscan specifics of real broadcast delivery.
- One ad spec ships with the app. The resolver itself accepts any `AdSpec`; wiring up a second example spec in the UI would be a small addition, not a resolver change.

## AI tools used

This project — architecture, the TypeScript resolver/validator, React components, visual design, tests, and this documentation — was built by Claude (Anthropic) in a single automated session from the developer's specification. The build was verified with a successful strict-TypeScript `npm run build`. Disclosing this plainly, as the assignment invited.

## Time spent

One continuous AI-assisted build session. For reference, a human implementing an equivalent resolver, validator, test suite, and this level of UI polish from scratch would typically budget in the range of 8–16 hours.
