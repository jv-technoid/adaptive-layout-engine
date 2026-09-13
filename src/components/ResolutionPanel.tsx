import { Check, X } from 'lucide-react';
import type { ResolvedLayout, SurfaceProfile, ValidationResult } from '../types';

interface ResolutionPanelProps {
  layout: ResolvedLayout;
  validation: ValidationResult;
  surface: SurfaceProfile;
}

const CHECK_LABELS: { key: keyof ValidationResult['checks']; label: string }[] = [
  { key: 'noOverlap', label: 'No overlaps' },
  { key: 'withinSafeArea', label: 'Within safe area' },
  { key: 'noClipping', label: 'No clipping' },
  { key: 'textSizeOk', label: 'Text constraints satisfied' },
  { key: 'tapTargetOk', label: 'Tap targets satisfied' },
];

export function ResolutionPanel({ layout, validation, surface }: ResolutionPanelProps) {
  return (
    <>
      <div className="panel">
        <div className={`validity-banner${validation.valid ? '' : ' invalid'}`}>
          {validation.valid ? <Check size={16} /> : <X size={16} />}
          {validation.valid ? 'Valid layout' : 'Layout issues detected'}
        </div>
        {CHECK_LABELS.map(({ key, label }) => {
          const pass = validation.checks[key];
          return (
            <div className={`check-row ${pass ? 'pass' : 'fail'}`} key={key}>
              {pass ? <Check size={13} /> : <X size={13} />}
              {label}
            </div>
          );
        })}
      </div>

      <div className="panel">
        <div className="panel-label">Constraints</div>
        <div className="constraint-row">
          <span className="k">Safe area</span>
          <span className="v">
            {surface.safeArea.top}/{surface.safeArea.right}/{surface.safeArea.bottom}/{surface.safeArea.left}
          </span>
        </div>
        <div className="constraint-row">
          <span className="k">Min text</span>
          <span className="v">{surface.minTextSize}px</span>
        </div>
        <div className="constraint-row">
          <span className="k">Tap target</span>
          <span className="v">{surface.touchOnly ? `${surface.minTapTarget}px` : 'n/a'}</span>
        </div>
        {surface.viewingDistance && (
          <div className="constraint-row">
            <span className="k">Viewing distance</span>
            <span className="v">{surface.viewingDistance}</span>
          </div>
        )}
        <div className="constraint-row">
          <span className="k">Composition</span>
          <span className="v">{layout.compositionMode}</span>
        </div>
      </div>

      <div className="panel">
        <div className="panel-label">Resolution decisions</div>
        <div className="decision-list">
          {layout.decisions.map((decision, index) => (
            <div className="decision-row" key={decision.id}>
              <span className="decision-index">{String(index + 1).padStart(2, '0')}</span>
              <div className="decision-body">
                <div className="decision-top">
                  <span className="decision-name">{decision.label}</span>
                  <span className="decision-action" data-action={decision.action}>
                    {decision.action}
                  </span>
                </div>
                <div className="decision-meta">
                  <span className="priority-tag" data-p={decision.priority}>
                    P{decision.priority}
                  </span>
                </div>
                <div className="decision-reason">{decision.reason}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
