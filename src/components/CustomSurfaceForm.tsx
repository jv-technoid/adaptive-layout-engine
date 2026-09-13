import type { SurfaceProfile } from '../types';

interface CustomSurfaceFormProps {
  value: SurfaceProfile;
  onChange: (next: SurfaceProfile) => void;
}

function numberField(raw: string, fallback: number, min: number): number {
  const parsed = Number(raw);
  if (Number.isNaN(parsed)) return fallback;
  return Math.max(parsed, min);
}

export function CustomSurfaceForm({ value, onChange }: CustomSurfaceFormProps) {
  const padding = value.safeArea.top;

  return (
    <div className="panel">
      <div className="panel-label">Custom surface</div>
      <div className="custom-form">
        <div className="field">
          <label htmlFor="cs-width">Width (px)</label>
          <input
            id="cs-width"
            type="number"
            min={80}
            max={2000}
            value={value.width}
            onChange={(e) => onChange({ ...value, width: numberField(e.target.value, value.width, 80) })}
          />
        </div>
        <div className="field">
          <label htmlFor="cs-height">Height (px)</label>
          <input
            id="cs-height"
            type="number"
            min={80}
            max={2000}
            value={value.height}
            onChange={(e) => onChange({ ...value, height: numberField(e.target.value, value.height, 80) })}
          />
        </div>
        <div className="field">
          <label htmlFor="cs-padding">Safe-area padding</label>
          <input
            id="cs-padding"
            type="number"
            min={0}
            max={200}
            value={padding}
            onChange={(e) => {
              const next = numberField(e.target.value, padding, 0);
              onChange({ ...value, safeArea: { top: next, right: next, bottom: next, left: next } });
            }}
          />
        </div>
        <div className="field">
          <label htmlFor="cs-text">Min text size</label>
          <input
            id="cs-text"
            type="number"
            min={8}
            max={80}
            value={value.minTextSize}
            onChange={(e) => onChange({ ...value, minTextSize: numberField(e.target.value, value.minTextSize, 8) })}
          />
        </div>
        <div className="field full">
          <label htmlFor="cs-tap">Min tap target</label>
          <input
            id="cs-tap"
            type="number"
            min={0}
            max={120}
            value={value.minTapTarget}
            onChange={(e) => onChange({ ...value, minTapTarget: numberField(e.target.value, value.minTapTarget, 0) })}
          />
        </div>
      </div>
    </div>
  );
}
