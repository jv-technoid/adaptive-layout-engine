import { useEffect, useRef, useState } from 'react';
import type { ResolvedElement, ResolvedLayout, SurfaceProfile } from '../types';
import { elementStyle, safeAreaStyle, stageStyle } from '../render-dom';

interface AdStageProps {
  layout: ResolvedLayout;
  surface: SurfaceProfile;
  imageUrl: string | null;
  showSafeArea: boolean;
  showDecisions: boolean;
}

const MAX_STAGE_HEIGHT = 480;

export function AdStage({ layout, surface, imageUrl, showSafeArea, showDecisions }: AdStageProps) {
  const outerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const outer = outerRef.current;
    if (!outer) return;

    const update = () => {
      const availableWidth = outer.clientWidth;
      const availableHeight = Math.min(window.innerHeight * 0.5, MAX_STAGE_HEIGHT);
      const next = Math.min(availableWidth / surface.width, availableHeight / surface.height, 1);
      setScale(next > 0 ? next : 1);
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(outer);
    window.addEventListener('resize', update);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [surface.width, surface.height]);

  return (
    <div className="stage-outer" ref={outerRef} style={{ height: Math.round(surface.height * scale) }}>
      <div
        className="stage-frame"
        style={{ ...stageStyle(layout), transform: `scale(${scale})` }}
      >
        {showSafeArea && <div className="safe-area-overlay" style={safeAreaStyle(layout)} />}
        {layout.elements.map((el) => (
          <ElementView key={el.id} element={el} imageUrl={imageUrl} showDecision={showDecisions} />
        ))}
      </div>
    </div>
  );
}

interface ElementViewProps {
  element: ResolvedElement;
  imageUrl: string | null;
  showDecision: boolean;
}

function ElementView({ element, imageUrl, showDecision }: ElementViewProps) {
  return (
    <div
      className={`ad-element ad-element--${element.type} ad-element--${element.role}`}
      style={elementStyle(element)}
      aria-hidden={!element.visible}
    >
      {element.type === 'text' && (
        <span className={`ad-text ad-text--${element.role}`}>{element.content}</span>
      )}

      {element.type === 'button' && <span className="ad-cta">{element.content}</span>}

      {element.type === 'image' && element.role === 'hero' && (
        <div className="ad-hero-fill">{imageUrl ? <img src={imageUrl} alt="Uploaded creative" /> : <HeroPlaceholder />}</div>
      )}

      {element.type === 'image' && element.role !== 'hero' && <BrandMark />}

      {showDecision && (
        <span className="decision-chip" data-action={element.action}>
          {element.action}
        </span>
      )}
    </div>
  );
}

function HeroPlaceholder() {
  return (
    <svg width="100%" height="100%" viewBox="0 0 400 400" preserveAspectRatio="xMidYMid slice">
      <defs>
        <radialGradient id="heroGlow" cx="50%" cy="42%" r="60%">
          <stop offset="0%" stopColor="#c8ff5e" stopOpacity="0.35" />
          <stop offset="45%" stopColor="#3a4a1f" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#0a0b0e" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="heroLine" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#c8ff5e" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#c8ff5e" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="400" height="400" fill="url(#heroGlow)" />
      <circle cx="200" cy="190" r="86" fill="none" stroke="url(#heroLine)" strokeWidth="1.5" />
      <circle cx="200" cy="190" r="128" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
      <text
        x="50%"
        y="93%"
        textAnchor="middle"
        fill="rgba(255,255,255,0.32)"
        fontSize="12"
        fontFamily="'JetBrains Mono', monospace"
        letterSpacing="0.08em"
      >
        NO CREATIVE UPLOADED
      </text>
    </svg>
  );
}

function BrandMark() {
  return (
    <svg width="100%" height="100%" viewBox="0 0 40 40">
      <rect width="40" height="40" rx="9" fill="rgba(255,255,255,0.07)" stroke="rgba(255,255,255,0.16)" />
      <path d="M12 27 L20 11 L28 27 L22.5 27 L20 21.2 L17.5 27 Z" fill="#c8ff5e" />
    </svg>
  );
}
