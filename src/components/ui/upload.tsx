'use client';

import { FileUp, Loader2, X } from 'lucide-react';
import { useId, useRef, useState, type DragEvent } from 'react';

import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/primitives';

export type UploadRejection = {
  reason: 'type' | 'size';
  message: string;
};

/**
 * Drag-and-drop file upload with a real file picker behind it.
 *
 * Rejection messages are specific per reason — "that file is 24 MB, the limit
 * is 10 MB" tells the user what to do; "invalid file" does not.
 */
export function FileUpload({
  accept,
  acceptLabel,
  maxBytes,
  onFile,
  disabled,
  progress,
  busy,
  label,
}: {
  /** MIME types or extensions, e.g. ['image/jpeg', '.pdf'] */
  accept: string[];
  acceptLabel: string;
  maxBytes: number;
  onFile: (file: File) => void;
  disabled?: boolean;
  /** 0–100 while processing. */
  progress?: number;
  busy?: boolean;
  label: string;
}) {
  const inputId = useId();
  const errorId = `${inputId}-error`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [rejection, setRejection] = useState<UploadRejection | null>(null);
  const [selected, setSelected] = useState<File | null>(null);

  const maxMb = Math.round(maxBytes / (1024 * 1024));

  function validate(file: File): UploadRejection | null {
    const nameLower = file.name.toLowerCase();
    const typeOk = accept.some((a) =>
      a.startsWith('.') ? nameLower.endsWith(a) : file.type === a,
    );
    if (!typeOk) {
      return {
        reason: 'type',
        message: `${file.name} is not a supported file type. Accepted: ${acceptLabel}.`,
      };
    }
    if (file.size > maxBytes) {
      const mb = (file.size / (1024 * 1024)).toFixed(1);
      return {
        reason: 'size',
        message: `${file.name} is ${mb} MB. The maximum is ${maxMb} MB.`,
      };
    }
    return null;
  }

  function handle(file: File | undefined) {
    if (!file) return;
    const bad = validate(file);
    if (bad) {
      setRejection(bad);
      setSelected(null);
      return;
    }
    setRejection(null);
    setSelected(file);
    onFile(file);
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    if (disabled) return;
    handle(e.dataTransfer.files?.[0]);
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          'rounded-card border-2 border-dashed p-8 text-center transition-colors duration-control ease-standard',
          dragging ? 'border-action bg-action-soft' : 'border-hairline bg-surface',
          disabled && 'opacity-60',
        )}
      >
        {busy ? (
          <div data-testid="upload-processing">
            <Loader2
              aria-hidden
              className="mx-auto mb-3 h-8 w-8 animate-spin text-action"
            />
            <p className="text-body-1 font-medium text-heading">Processing…</p>
            {typeof progress === 'number' && (
              <>
                <div
                  role="progressbar"
                  aria-valuenow={progress}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="Upload progress"
                  className="mx-auto mt-3 h-2 w-full max-w-xs overflow-hidden rounded-pill bg-chart-track"
                >
                  <div
                    className="h-full rounded-pill bg-action transition-[width]"
                    style={{
                      width: `${progress}%`,
                      transitionDuration: 'var(--duration-value)',
                    }}
                  />
                </div>
                <p className="mt-1.5 text-caption tabular text-muted">{progress}%</p>
              </>
            )}
          </div>
        ) : (
          <>
            <FileUp
              aria-hidden
              strokeWidth={1.75}
              className="mx-auto mb-3 h-8 w-8 text-action"
            />
            <p className="text-body-1 font-medium text-heading">
              Drag a file here, or choose one
            </p>
            <p className="mt-1 text-caption text-muted">
              {acceptLabel} · up to {maxMb} MB
            </p>

            <label htmlFor={inputId} className="sr-only">
              {label}
            </label>
            <input
              ref={inputRef}
              id={inputId}
              type="file"
              accept={accept.join(',')}
              disabled={disabled}
              aria-invalid={rejection ? true : undefined}
              aria-describedby={rejection ? errorId : undefined}
              onChange={(e) => handle(e.target.files?.[0])}
              className="sr-only"
            />
            <Button
              type="button"
              variant="outline"
              className="mt-4"
              disabled={disabled}
              onClick={() => inputRef.current?.click()}
            >
              Choose file
            </Button>
          </>
        )}
      </div>

      {selected && !busy && (
        <p className="flex items-center gap-2 text-body-2 text-secondary">
          <span className="truncate">{selected.name}</span>
          <button
            type="button"
            aria-label={`Remove ${selected.name}`}
            onClick={() => {
              setSelected(null);
              if (inputRef.current) inputRef.current.value = '';
            }}
            className="inline-flex h-6 w-6 items-center justify-center rounded-circle hover:bg-cream-200"
          >
            <X aria-hidden strokeWidth={1.75} className="h-3.5 w-3.5" />
          </button>
        </p>
      )}

      {rejection && (
        <p
          id={errorId}
          role="alert"
          data-testid={`upload-rejected-${rejection.reason}`}
          className="text-caption text-error-text"
        >
          {rejection.message}
        </p>
      )}
    </div>
  );
}
