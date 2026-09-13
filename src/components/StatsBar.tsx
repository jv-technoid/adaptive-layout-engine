import type { ResolvedLayout, SurfaceProfile, ValidationResult } from '../types';

interface StatsBarProps {
  layout: ResolvedLayout;
  validation: ValidationResult;
  surface: SurfaceProfile;
}

export function StatsBar({ layout, validation, surface }: StatsBarProps) {
  const total = layout.elements.length;
  const visible = layout.elements.filter((el) => el.visible);

  const safeWidth = Math.max(surface.width - surface.safeArea.left - surface.safeArea.right, 0);
  const safeHeight = Math.max(surface.height - surface.safeArea.top - surface.safeArea.bottom, 0);
  const safeArea = safeWidth * safeHeight;
  const usedArea = visible.reduce((sum, el) => sum + el.width * el.height, 0);
  const utilization = safeArea > 0 ? Math.round((usedArea / safeArea) * 100) : 0;

  const priorities = visible.map((el) => el.priority);
  const priorityLabel =
    priorities.length === 0
      ? '—'
      : Math.min(...priorities) === Math.max(...priorities)
        ? `P${Math.min(...priorities)}`
        : `P${Math.min(...priorities)}–P${Math.max(...priorities)}`;

  const overlapCount = validation.violations.filter((v) => v.type === 'overlap').length;

  return (
    <div className="stats-bar">
      <div className="stat-cell">
        <div className="stat-value">
          {visible.length}/{total}
        </div>
        <div className="stat-label">Visible</div>
      </div>
      <div className="stat-cell">
        <div className="stat-value">{utilization}%</div>
        <div className="stat-label">Utilization</div>
      </div>
      <div className="stat-cell">
        <div className="stat-value">{priorityLabel}</div>
        <div className="stat-label">Priority</div>
      </div>
      <div className="stat-cell">
        <div className={`stat-value${overlapCount > 0 ? ' warn' : ''}`}>{overlapCount}</div>
        <div className="stat-label">Overlaps</div>
      </div>
    </div>
  );
}
