import { useMemo, useState } from 'react';
import { TopNav } from './components/TopNav';
import { Hero } from './components/Hero';
import { SurfaceSelector } from './components/SurfaceSelector';
import { AdSpecPanel } from './components/AdSpecPanel';
import { CustomSurfaceForm } from './components/CustomSurfaceForm';
import { AdStage } from './components/AdStage';
import { StressControl } from './components/StressControl';
import { ResolutionPanel } from './components/ResolutionPanel';
import { StatsBar } from './components/StatsBar';
import { resolveLayout } from './resolver';
import { validateLayout } from './validator';
import { novaAdSpec } from './spec';
import { defaultCustomSurface, defaultSurfaces, applyStress } from './surfaces';
import type { StressLevel, SurfaceProfile } from './types';

export default function App() {
  const [selectedSurfaceId, setSelectedSurfaceId] = useState<string>(defaultSurfaces[0].id);
  const [customSurface, setCustomSurface] = useState<SurfaceProfile>(defaultCustomSurface);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [showSafeArea, setShowSafeArea] = useState(true);
  const [showDecisions, setShowDecisions] = useState(false);
  const [stressLevel, setStressLevel] = useState<StressLevel>('normal');

  const baseSurface = useMemo(
    () => (selectedSurfaceId === 'custom' ? customSurface : defaultSurfaces.find((s) => s.id === selectedSurfaceId) ?? defaultSurfaces[0]),
    [selectedSurfaceId, customSurface]
  );

  const activeSurface = useMemo(() => applyStress(baseSurface, stressLevel), [baseSurface, stressLevel]);

  const layout = useMemo(() => resolveLayout(novaAdSpec, activeSurface), [activeSurface]);
  const validation = useMemo(() => validateLayout(layout, activeSurface), [layout, activeSurface]);

  function handleUpload(file: File) {
    setImageUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
  }

  function handleClearImage() {
    setImageUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }

  return (
    <div className="app-shell">
      <div className="field-grid" aria-hidden="true" />
      <div className="glow" aria-hidden="true" />

      <TopNav />
      <Hero />

      <section id="demo" className="demo">
        <div>
          <SurfaceSelector
            surfaces={defaultSurfaces}
            selectedId={selectedSurfaceId}
            onSelect={setSelectedSurfaceId}
            customSurface={customSurface}
          />
          <AdSpecPanel
            spec={novaAdSpec}
            resolvedElements={layout.elements}
            imageUrl={imageUrl}
            onUpload={handleUpload}
            onClearImage={handleClearImage}
          />
          {selectedSurfaceId === 'custom' && <CustomSurfaceForm value={customSurface} onChange={setCustomSurface} />}
        </div>

        <div className="stage-column">
          <div className="panel-label">Live resolution</div>
          <AdStage
            layout={layout}
            surface={activeSurface}
            imageUrl={imageUrl}
            showSafeArea={showSafeArea}
            showDecisions={showDecisions}
          />
          <div className="stage-dims">
            <strong>
              {activeSurface.width} × {activeSurface.height}
            </strong>{' '}
            · {baseSurface.name}
          </div>
          <div className="stage-controls">
            <button
              type="button"
              className={`toggle-pill${showSafeArea ? ' on' : ''}`}
              onClick={() => setShowSafeArea((v) => !v)}
            >
              Safe area
            </button>
            <button
              type="button"
              className={`toggle-pill${showDecisions ? ' on' : ''}`}
              onClick={() => setShowDecisions((v) => !v)}
            >
              Decisions
            </button>
          </div>
          <StressControl value={stressLevel} onChange={setStressLevel} />
        </div>

        <div>
          <ResolutionPanel layout={layout} validation={validation} surface={activeSurface} />
        </div>
      </section>

      <StatsBar layout={layout} validation={validation} surface={activeSurface} />

      <p className="footnote">
        One AdSpec, resolved by the same <code>resolveLayout()</code> for every surface above — no per-surface
        branching.
      </p>
    </div>
  );
}
