'use client';

import { X } from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/primitives';

/* ------------------------------------------------------------------- Modal */

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Modal — and, below `md`, a bottom sheet.
 *
 * Focus handling is the substance here: focus moves in on open, is trapped
 * while open, and returns to whatever opened it on close. Escape closes.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descId = useId();

  /*
    `onClose` is almost always an inline arrow, so it is a new function on every
    parent render. Depending on it directly would tear down and re-run the
    effect below on each render — which re-runs the focus-into-dialog step and
    steals focus from whatever field the user is typing in. Holding it in a ref
    keeps the effect keyed on `open` alone.
  */
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;

    restoreRef.current = document.activeElement as HTMLElement | null;

    // Move focus into the dialog once it exists.
    const timer = window.setTimeout(() => {
      const first = panelRef.current?.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? panelRef.current)?.focus();
    }, 0);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab') return;

      const nodes = panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (!nodes || nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
      restoreRef.current?.focus();
    };
  }, [open]);

  if (!open) return null;

  const sizes = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl' };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div
        aria-hidden
        onClick={onClose}
        className="absolute inset-0 bg-[rgba(11,16,51,.5)]"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={cn(
          'relative z-10 w-full bg-surface shadow-xl',
          // Bottom sheet on mobile, centred panel from sm up.
          'rounded-t-panel sm:rounded-panel',
          'max-h-[90vh] overflow-y-auto',
          sizes[size],
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-hairline p-5">
          <div className="min-w-0">
            <h2 id={titleId} className="text-h3 font-semibold text-heading">
              {title}
            </h2>
            {description && (
              <p id={descId} className="mt-1 text-body-2 text-muted">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-control text-secondary hover:bg-cream-200"
          >
            <X aria-hidden strokeWidth={1.75} className="h-5 w-5" />
          </button>
        </div>
        <div className="p-5">{children}</div>
        {footer && (
          <div className="flex flex-wrap justify-end gap-2 border-t border-hairline p-5">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------- ConfirmDialog */

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'primary',
  loading,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  /** Say what will actually happen. No euphemisms, no implied permanence. */
  description: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'primary' | 'danger';
  loading?: boolean;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm">
      <div className="text-body-1 text-secondary">{description}</div>
      <div className="mt-6 flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          {cancelLabel}
        </Button>
        <Button
          variant={tone === 'danger' ? 'danger' : 'primary'}
          onClick={onConfirm}
          loading={loading}
        >
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ Toasts */

type Toast = {
  id: string;
  message: string;
  tone: 'success' | 'error' | 'info';
};

type ToastContextValue = {
  toast: (message: string, tone?: Toast['tone']) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((message: string, tone: Toast['tone'] = 'success') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, message, tone }]);
    window.setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
    }, 5000);
  }, []);

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/*
        A live region that exists at all times. Creating the region at the same
        moment as the message is unreliable — screen readers may miss it.
      */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:bottom-auto sm:right-0 sm:top-0 sm:items-end"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            data-testid="toast"
            className={cn(
              'pointer-events-auto w-full max-w-sm rounded-card border px-4 py-3 text-body-1 shadow-md',
              t.tone === 'success' && 'border-success-tint bg-success-soft text-success-text',
              t.tone === 'error' && 'border-error-tint bg-error-soft text-error-text',
              t.tone === 'info' && 'border-hairline bg-surface text-body',
            )}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  // Falling back to a no-op keeps components renderable in isolation in tests
  // without every test having to wrap in a provider.
  return ctx ?? { toast: () => {} };
}

/* -------------------------------------------------------------------- Tabs */

export function Tabs({
  tabs,
  value,
  onChange,
  label,
}: {
  tabs: Array<{ value: string; label: string; count?: number }>;
  value: string;
  onChange: (v: string) => void;
  label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="flex gap-1 overflow-x-auto">
      {tabs.map((t) => {
        const selected = t.value === value;
        return (
          <button
            key={t.value}
            role="tab"
            type="button"
            aria-selected={selected}
            onClick={() => onChange(t.value)}
            className={cn(
              'whitespace-nowrap rounded-control px-3 py-2 text-body-2 font-medium transition-colors duration-control ease-standard',
              selected
                ? 'bg-action text-white'
                : 'bg-transparent text-secondary hover:bg-cream-200',
            )}
          >
            {t.label}
            {typeof t.count === 'number' && (
              <span className="ml-1.5 tabular opacity-80">{t.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
