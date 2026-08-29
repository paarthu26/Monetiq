'use client';

import { Eye, EyeOff, Loader2, type LucideIcon } from 'lucide-react';
import {
  forwardRef,
  useId,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';

import { cn } from '@/lib/cn';

/* ------------------------------------------------------------------ Button */

type ButtonVariant = 'primary' | 'outline' | 'text' | 'success' | 'danger';
type ButtonSize = 'sm' | 'md';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-action text-white hover:bg-action-hover active:bg-action-press disabled:bg-action/40',
  outline:
    'bg-surface text-heading border border-hairline hover:bg-cream-200 active:bg-cream-300 disabled:text-subtle',
  text: 'bg-transparent text-action hover:bg-action-soft active:bg-indigo-100 disabled:text-subtle',
  success:
    'bg-success text-white hover:bg-success-text active:bg-success-text disabled:bg-success/40',
  danger: 'bg-error text-white hover:bg-error-text active:bg-error-text disabled:bg-error/40',
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  // 44px min touch target on md; sm is for dense table rows only.
  md: 'h-11 px-4 text-body-1 gap-2',
  sm: 'h-9 px-3 text-body-2 gap-1.5',
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: LucideIcon;
  iconPosition?: 'left' | 'right';
  fullWidth?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    icon: Icon,
    iconPosition = 'left',
    fullWidth,
    className,
    children,
    disabled,
    ...rest
  },
  ref,
) {
  // A loading button is also disabled — otherwise a double click fires twice.
  const isDisabled = disabled || loading;
  return (
    <button
      ref={ref}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex items-center justify-center rounded-control font-medium',
        'transition-colors duration-control ease-standard',
        'disabled:cursor-not-allowed',
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        fullWidth && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading && <Loader2 aria-hidden className="h-4 w-4 animate-spin" />}
      {!loading && Icon && iconPosition === 'left' && (
        <Icon aria-hidden strokeWidth={1.75} className="h-[18px] w-[18px]" />
      )}
      {children}
      {!loading && Icon && iconPosition === 'right' && (
        <Icon aria-hidden strokeWidth={1.75} className="h-[18px] w-[18px]" />
      )}
    </button>
  );
});

/* -------------------------------------------------------------- IconButton */

export type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: LucideIcon;
  /** Required: an icon-only control must still have an accessible name. */
  label: string;
  variant?: 'ghost' | 'outline';
  size?: 'sm' | 'md';
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton(
    { icon: Icon, label, variant = 'ghost', size = 'md', className, ...rest },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type="button"
        aria-label={label}
        title={label}
        className={cn(
          'inline-flex items-center justify-center rounded-control transition-colors duration-control ease-standard',
          size === 'md' ? 'h-11 w-11' : 'h-9 w-9',
          variant === 'ghost'
            ? 'text-secondary hover:bg-cream-200 hover:text-heading'
            : 'border border-hairline bg-surface text-secondary hover:bg-cream-200',
          'disabled:cursor-not-allowed disabled:text-subtle',
          className,
        )}
        {...rest}
      >
        <Icon aria-hidden strokeWidth={1.75} className="h-5 w-5" />
      </button>
    );
  },
);

/* ------------------------------------------------------------------- Field */

type FieldShellProps = {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
  errorId: string;
  hintId: string;
};

function FieldShell({
  label,
  htmlFor,
  error,
  hint,
  required,
  children,
  errorId,
  hintId,
}: FieldShellProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-body-2 font-medium text-secondary">
        {label}
        {required && (
          <span aria-hidden className="ml-0.5 text-error">
            *
          </span>
        )}
        {required && <span className="sr-only"> (required)</span>}
      </label>
      {children}
      {hint && !error && (
        <p id={hintId} className="text-caption text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-caption text-error-text">
          {error}
        </p>
      )}
    </div>
  );
}

const CONTROL_BASE =
  'w-full rounded-control border bg-surface px-3 text-body-1 text-body placeholder:text-subtle ' +
  'transition-colors duration-control ease-standard ' +
  'disabled:cursor-not-allowed disabled:bg-sunken disabled:text-muted';

function controlTone(hasError: boolean) {
  return hasError
    ? 'border-error focus:border-error'
    : 'border-hairline focus:border-action';
}

/* ------------------------------------------------------------------- Input */

export type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> & {
  label: string;
  error?: string;
  hint?: string;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, hint, id, className, required, ...rest },
  ref,
) {
  const auto = useId();
  const inputId = id ?? auto;
  const errorId = `${inputId}-error`;
  const hintId = `${inputId}-hint`;

  return (
    <FieldShell
      label={label}
      htmlFor={inputId}
      error={error}
      hint={hint}
      required={required}
      errorId={errorId}
      hintId={hintId}
    >
      <input
        ref={ref}
        id={inputId}
        required={required}
        aria-invalid={error ? true : undefined}
        // Points at whichever of the two is actually rendered, so screen
        // readers announce the error instead of stale hint text.
        aria-describedby={error ? errorId : hint ? hintId : undefined}
        className={cn(CONTROL_BASE, controlTone(!!error), 'h-11', className)}
        {...rest}
      />
    </FieldShell>
  );
});

/* ----------------------------------------------------------- PasswordInput */

export type PasswordInputProps = Omit<InputProps, 'type'>;

/**
 * A password field with a reveal toggle.
 *
 * Typing a password you cannot see is the single most common cause of a failed
 * sign-in, and on a phone keyboard it is worse. The toggle is a button rather
 * than a checkbox so it stays out of the tab order between the field and the
 * submit button — the eye is there for the mouse and for a deliberate visit,
 * not something to tab through on every login.
 *
 * The field is padded on the right so a long password never runs underneath
 * the button, and `aria-pressed` tells assistive technology the current state
 * rather than leaving the label to imply it.
 */
export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  function PasswordInput({ label, error, hint, id, className, required, ...rest }, ref) {
    const auto = useId();
    const inputId = id ?? auto;
    const errorId = `${inputId}-error`;
    const hintId = `${inputId}-hint`;
    const [visible, setVisible] = useState(false);

    return (
      <FieldShell
        label={label}
        htmlFor={inputId}
        error={error}
        hint={hint}
        required={required}
        errorId={errorId}
        hintId={hintId}
      >
        <div className="relative">
          <input
            ref={ref}
            id={inputId}
            type={visible ? 'text' : 'password'}
            required={required}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : hint ? hintId : undefined}
            className={cn(CONTROL_BASE, controlTone(!!error), 'h-11 pr-12', className)}
            {...rest}
          />
          <button
            type="button"
            // Never a submit button: this sits inside a form and a stray Enter
            // must still submit the form, not toggle the eye.
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? 'Hide password' : 'Show password'}
            aria-pressed={visible}
            aria-controls={inputId}
            title={visible ? 'Hide password' : 'Show password'}
            tabIndex={-1}
            className={cn(
              'absolute right-1 top-1/2 inline-flex h-9 w-9 -translate-y-1/2',
              'items-center justify-center rounded-control text-muted',
              'transition-colors duration-control ease-standard',
              'hover:bg-cream-200 hover:text-heading',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action',
            )}
          >
            {visible ? (
              <EyeOff aria-hidden strokeWidth={1.75} className="h-[18px] w-[18px]" />
            ) : (
              <Eye aria-hidden strokeWidth={1.75} className="h-[18px] w-[18px]" />
            )}
          </button>
        </div>
      </FieldShell>
    );
  },
);

/* ---------------------------------------------------------------- Textarea */

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  error?: string;
  hint?: string;
};

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, error, hint, id, className, required, rows = 4, ...rest },
  ref,
) {
  const auto = useId();
  const fieldId = id ?? auto;
  const errorId = `${fieldId}-error`;
  const hintId = `${fieldId}-hint`;

  return (
    <FieldShell
      label={label}
      htmlFor={fieldId}
      error={error}
      hint={hint}
      required={required}
      errorId={errorId}
      hintId={hintId}
    >
      <textarea
        ref={ref}
        id={fieldId}
        rows={rows}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : hint ? hintId : undefined}
        className={cn(CONTROL_BASE, controlTone(!!error), 'py-2.5', className)}
        {...rest}
      />
    </FieldShell>
  );
});

/* ------------------------------------------------------------------ Select */

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  error?: string;
  hint?: string;
  options: Array<{ value: string; label: string; disabled?: boolean }>;
  placeholder?: string;
};

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, error, hint, options, placeholder, id, className, required, ...rest },
  ref,
) {
  const auto = useId();
  const fieldId = id ?? auto;
  const errorId = `${fieldId}-error`;
  const hintId = `${fieldId}-hint`;

  return (
    <FieldShell
      label={label}
      htmlFor={fieldId}
      error={error}
      hint={hint}
      required={required}
      errorId={errorId}
      hintId={hintId}
    >
      <select
        ref={ref}
        id={fieldId}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : hint ? hintId : undefined}
        className={cn(CONTROL_BASE, controlTone(!!error), 'h-11 pr-8', className)}
        {...rest}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
});

/* ---------------------------------------------------------------- Checkbox */

export type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  label: ReactNode;
  error?: string;
};

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, error, id, className, ...rest },
  ref,
) {
  const auto = useId();
  const fieldId = id ?? auto;
  const errorId = `${fieldId}-error`;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-start gap-2.5">
        <input
          ref={ref}
          id={fieldId}
          type="checkbox"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className={cn(
            'mt-0.5 h-[18px] w-[18px] shrink-0 rounded-[4px] border-hairline text-action',
            'accent-action',
            className,
          )}
          {...rest}
        />
        <label htmlFor={fieldId} className="text-body-1 text-body">
          {label}
        </label>
      </div>
      {error && (
        <p id={errorId} className="text-caption text-error-text">
          {error}
        </p>
      )}
    </div>
  );
});

/* ------------------------------------------------------------------- Radio */

export function RadioGroup({
  label,
  name,
  value,
  onChange,
  options,
  error,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string; description?: string }>;
  error?: string;
}) {
  const errorId = `${name}-error`;
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-body-2 font-medium text-secondary">{label}</legend>
      <div
        role="radiogroup"
        aria-describedby={error ? errorId : undefined}
        className="flex flex-col gap-2"
      >
        {options.map((o) => (
          <label
            key={o.value}
            className={cn(
              'flex cursor-pointer items-start gap-2.5 rounded-control border p-3',
              'transition-colors duration-control ease-standard',
              value === o.value
                ? 'border-action bg-action-soft'
                : 'border-hairline bg-surface hover:bg-cream-200',
            )}
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
              className="mt-0.5 h-[18px] w-[18px] accent-action"
            />
            <span>
              <span className="block text-body-1 text-body">{o.label}</span>
              {o.description && (
                <span className="block text-caption text-muted">{o.description}</span>
              )}
            </span>
          </label>
        ))}
      </div>
      {error && (
        <p id={errorId} className="text-caption text-error-text">
          {error}
        </p>
      )}
    </fieldset>
  );
}

/* ------------------------------------------------------------------ Toggle */

export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled,
  id,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
  id?: string;
}) {
  const auto = useId();
  const fieldId = id ?? auto;
  const descId = `${fieldId}-desc`;
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <label
          htmlFor={fieldId}
          className={cn(
            'block text-body-1 font-medium text-body',
            !disabled && 'cursor-pointer',
          )}
        >
          {label}
        </label>
        {description && (
          <p id={descId} className="text-caption text-muted">
            {description}
          </p>
        )}
      </div>
      <button
        id={fieldId}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={description ? descId : undefined}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'group relative h-7 w-[52px] shrink-0 rounded-pill p-0.5',
          'transition-colors duration-control ease-standard',
          // A visible ring inset gives the track an edge, so an off switch
          // still reads as a control rather than a flat grey bar.
          'ring-1 ring-inset',
          checked
            ? 'bg-action ring-action-press/40 hover:bg-action-hover'
            : 'bg-slate-200 ring-black/[.08] hover:bg-slate-300',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2',
          disabled
            ? 'cursor-not-allowed opacity-50'
            : 'cursor-pointer active:[&>span]:w-7',
        )}
      >
        <span
          aria-hidden
          className={cn(
            'block h-6 w-6 rounded-circle bg-white shadow-md',
            // Width is animated too, so pressing squashes the knob slightly —
            // the small physical cue that makes a switch feel like a switch.
            'transition-all duration-control ease-standard',
            checked ? 'translate-x-[24px]' : 'translate-x-0',
            'motion-reduce:transition-none',
          )}
        />
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------- Badge */

export type BadgeTone =
  | 'neutral'
  | 'success'
  | 'warning'
  | 'error'
  | 'info'
  | 'action';

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: 'bg-sunken text-secondary',
  success: 'bg-success-tint text-success-text',
  warning: 'bg-warning-tint text-warning-text',
  error: 'bg-error-tint text-error-text',
  info: 'bg-info-soft text-info',
  action: 'bg-action-soft text-action',
};

export function Badge({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-pill px-2.5 py-0.5 text-caption font-medium',
        BADGE_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ Avatar */

export function Avatar({
  name,
  size = 'md',
}: {
  name: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');
  const sizes = { sm: 'h-8 w-8 text-caption', md: 'h-10 w-10 text-body-2', lg: 'h-14 w-14 text-h4' };
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-circle bg-action-soft font-semibold text-action',
        sizes[size],
      )}
      // The name is always rendered next to the avatar in this product, so the
      // initials are decorative rather than a second announcement.
      aria-hidden
    >
      {initials || '?'}
    </span>
  );
}

/* -------------------------------------------------------------------- Card */

export function Card({
  children,
  className,
  as: Tag = 'div',
  interactive = true,
}: {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'section' | 'article' | 'li';
  /**
   * Lift the card on hover. On by default so every surface in the app responds
   * to the pointer — previously nothing did, and the whole UI felt inert.
   * Turn it off for a card that is purely a container inside another card,
   * where a second lift reads as a glitch rather than a response.
   */
  interactive?: boolean;
}) {
  return (
    <Tag
      className={cn(
        'rounded-card border border-hairline bg-surface p-5 shadow-sm',
        interactive &&
          'transition-[box-shadow,border-color,transform] duration-surface ease-standard ' +
            'hover:-translate-y-0.5 hover:border-border-default hover:shadow-md ' +
            // Someone who has asked for less motion still gets the shadow and
            // the border change; they just do not get the movement.
            'motion-reduce:hover:translate-y-0 motion-reduce:transition-[box-shadow,border-color]',
        className,
      )}
    >
      {children}
    </Tag>
  );
}

export function CardHeader({
  title,
  description,
  action,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h3 className="text-h4 font-medium text-heading">{title}</h3>
        {description && <p className="mt-0.5 text-body-2 text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

/* ---------------------------------------------------------------- Skeleton */

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('skeleton', className)} />;
}

/** Matches the shape of loaded content rather than a bare spinner. */
export function SkeletonText({ lines = 3 }: { lines?: number }) {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={cn('h-4', i === lines - 1 ? 'w-2/3' : 'w-full')} />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------- ProgressBar */

export function ProgressBar({
  value,
  max = 100,
  tone = 'action',
  label,
}: {
  value: number;
  max?: number;
  tone?: 'action' | 'success' | 'warning' | 'error';
  label?: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  const tones = {
    action: 'bg-action',
    success: 'bg-success',
    warning: 'bg-warning',
    error: 'bg-error',
  };
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className="h-2 w-full overflow-hidden rounded-pill bg-chart-track"
    >
      <div
        className={cn('h-full rounded-pill transition-[width] ease-standard', tones[tone])}
        style={{ width: `${pct}%`, transitionDuration: 'var(--duration-value)' }}
      />
    </div>
  );
}

/* ----------------------------------------------------------------- Tooltip */

export function Tooltip({
  content,
  children,
}: {
  content: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <span className="group relative inline-flex">
      <span aria-describedby={id}>{children}</span>
      <span
        role="tooltip"
        id={id}
        className={cn(
          'pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 hidden -translate-x-1/2',
          'whitespace-nowrap rounded-control bg-navy-900 px-2.5 py-1.5 text-caption text-white shadow-md',
          'group-hover:block group-focus-within:block',
        )}
      >
        {content}
      </span>
    </span>
  );
}
