import { useRef } from 'react';
import { ImagePlus, X } from 'lucide-react';
import type { AdSpec, ResolvedElement } from '../types';

interface AdSpecPanelProps {
  spec: AdSpec;
  resolvedElements: ResolvedElement[];
  imageUrl: string | null;
  onUpload: (file: File) => void;
  onClearImage: () => void;
}

const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

export function AdSpecPanel({ spec, resolvedElements, imageUrl, onUpload, onClearImage }: AdSpecPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const statusById = new Map(resolvedElements.map((el) => [el.id, el]));

  function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    if (!ACCEPTED_TYPES.includes(file.type)) return;
    onUpload(file);
  }

  return (
    <div className="panel">
      <div className="panel-label">Ad spec</div>
      <div className="spec-list">
        {spec.elements.map((el) => {
          const resolved = statusById.get(el.id);
          return (
            <div className="spec-row" key={el.id}>
              <span className="status-dot" data-visible={resolved ? resolved.visible : true} />
              <span className="name">{el.label}</span>
              <span className="priority-tag" data-p={el.priority}>
                P{el.priority}
              </span>
            </div>
          );
        })}
      </div>

      <button type="button" className="upload-zone" onClick={() => inputRef.current?.click()}>
        <ImagePlus size={18} />
        <span className="upload-label">Upload creative</span>
        <span className="upload-hint">PNG · JPG · WebP</span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        style={{ display: 'none' }}
        onChange={(e) => handleFiles(e.target.files)}
      />

      {imageUrl && (
        <div className="upload-current">
          <span>Custom creative active</span>
          <button type="button" onClick={onClearImage}>
            <X size={11} style={{ verticalAlign: 'text-top' }} /> remove
          </button>
        </div>
      )}
    </div>
  );
}
