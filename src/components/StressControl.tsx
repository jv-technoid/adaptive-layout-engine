import type { StressLevel } from '../types';

interface StressControlProps {
  value: StressLevel;
  onChange: (level: StressLevel) => void;
}

const LEVELS: { id: StressLevel; label: string }[] = [
  { id: 'normal', label: 'Normal' },
  { id: 'constrained', label: 'Constrained' },
  { id: 'very-constrained', label: 'Very constrained' },
];

export function StressControl({ value, onChange }: StressControlProps) {
  return (
    <div className="stress-control">
      <div className="stress-control-label">Stress test</div>
      <div className="stress-segments">
        {LEVELS.map((level) => (
          <button
            key={level.id}
            type="button"
            className={`stress-segment${value === level.id ? ' active' : ''}`}
            onClick={() => onChange(level.id)}
          >
            {level.label}
          </button>
        ))}
      </div>
    </div>
  );
}
