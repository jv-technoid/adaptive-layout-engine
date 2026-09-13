// ---------------------------------------------------------------------------
// render-dom
// ---------------------------------------------------------------------------
//
// The bridge between resolved layout numbers and the DOM. Everything here
// is a pure function: ResolvedElement/ResolvedLayout in, a CSS style object
// out. Keeping this separate from the React components means "how do
// layout numbers become CSS" never gets tangled up with "how is the
// component tree structured" — the App layer (React) owns composition and
// interaction; this module owns translation.

import type { CSSProperties } from 'react';
import type { ResolvedElement, ResolvedLayout } from './types';

export function stageStyle(layout: ResolvedLayout): CSSProperties {
  return {
    position: 'relative',
    width: layout.surfaceWidth,
    height: layout.surfaceHeight,
  };
}

export function elementStyle(el: ResolvedElement): CSSProperties {
  return {
    position: 'absolute',
    left: el.x,
    top: el.y,
    width: el.width,
    height: el.height,
    zIndex: el.zIndex,
    fontSize: el.fontSize ? `${el.fontSize}px` : undefined,
    opacity: el.visible ? 1 : 0,
    pointerEvents: el.visible ? 'auto' : 'none',
  };
}

export function safeAreaStyle(layout: ResolvedLayout): CSSProperties {
  return {
    position: 'absolute',
    left: layout.safeArea.left,
    top: layout.safeArea.top,
    right: layout.safeArea.right,
    bottom: layout.safeArea.bottom,
  };
}
