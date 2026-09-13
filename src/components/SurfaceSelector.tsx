import type { SurfaceProfile } from '../types';

interface SurfaceSelectorProps {
  surfaces: SurfaceProfile[];
  selectedId: string;
  onSelect: (id: string) => void;
  customSurface: SurfaceProfile;
}

export function SurfaceSelector({ surfaces, selectedId, onSelect, customSurface }: SurfaceSelectorProps) {
  return (
    <div className="panel">
      <div className="panel-label">Surface profiles</div>
      <div className="surface-list">
        {surfaces.map((surface) => (
          <button
            key={surface.id}
            type="button"
            className={`surface-item${selectedId === surface.id ? ' active' : ''}`}
            onClick={() => onSelect(surface.id)}
          >
            <span>{surface.name}</span>
            <span className="dims">
              {surface.width} × {surface.height}
            </span>
          </button>
        ))}
        <button
          type="button"
          className={`surface-item${selectedId === 'custom' ? ' active' : ''}`}
          onClick={() => onSelect('custom')}
        >
          <span>Custom</span>
          <span className="dims">
            {customSurface.width} × {customSurface.height}
          </span>
        </button>
      </div>
    </div>
  );
}
