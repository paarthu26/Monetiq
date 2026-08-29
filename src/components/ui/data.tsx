'use client';

import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Info,
  Search,
  Sparkles,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useId, type ReactNode } from 'react';

import { cn } from '@/lib/cn';
import { formatINR } from '@/lib/finance';
import { Badge, Button, Skeleton } from '@/components/ui/primitives';

/* ------------------------------------------------------------------ Amount */

/**
 * Every monetary value in the product goes through here.
 *
 * Two reasons this is a component rather than a call to `formatINR`: the
 * tabular-numeral class must be applied consistently so ledger columns line up
 * down the page, and debit/credit signing needs one rule rather than twelve.
 */
export function Amount({
  value,
  signed = false,
  direction,
  decimals = false,
  className,
  tone,
}: {
  value: number;
  /** Render a leading − for debits and + for credits. */
  signed?: boolean;
  direction?: 'credit' | 'debit';
  decimals?: boolean;
  className?: string;
  tone?: 'default' | 'positive' | 'negative' | 'muted';
}) {
  const magnitude = Math.abs(value);
  const isNegative = direction ? direction === 'debit' : value < 0;

  const prefix = signed ? (isNegative ? '−' : '+') : value < 0 && !direction ? '−' : '';
  const text = `${prefix}${formatINR(magnitude, { decimals })}`;

  const tones = {
    default: 'text-body',
    positive: 'text-success-text',
    negative: 'text-error-text',
    muted: 'text-muted',
  };
  const resolved =
    tone ?? (signed ? (isNegative ? 'negative' : 'positive') : 'default');

  return <span className={cn('tabular', tones[resolved], className)}>{text}</span>;
}

/* ------------------------------------------------------------ CategoryTile */

/** Maps a category's stored tint to one of the five design-system tints. */
export function categoryTintClass(tint: string | null): string {
  const map: Record<string, string> = {
    '#16A34A': 'bg-tint-green',
    '#059669': 'bg-tint-green',
    '#0EA5E9': 'bg-tint-mint',
    '#06B6D4': 'bg-tint-mint',
    '#0891B2': 'bg-tint-mint',
    '#EF4444': 'bg-tint-red',
    '#DC2626': 'bg-tint-red',
    '#F43F5E': 'bg-tint-red',
    '#F97316': 'bg-tint-peach',
    '#F59E0B': 'bg-tint-peach',
    '#B45309': 'bg-tint-peach',
  };
  return map[tint ?? ''] ?? 'bg-tint-violet';
}

export function CategoryTile({
  name,
  tint,
  icon: Icon,
  size = 'md',
}: {
  name: string;
  tint: string | null;
  icon?: LucideIcon;
  size?: 'sm' | 'md';
}) {
  const initials = name.slice(0, 2).toUpperCase();
  return (
    <span
      aria-hidden
      data-testid="category-tile"
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-control font-semibold text-heading',
        categoryTintClass(tint),
        size === 'md' ? 'h-10 w-10 text-body-2' : 'h-8 w-8 text-caption',
      )}
    >
      {Icon ? <Icon strokeWidth={1.75} className="h-[18px] w-[18px]" /> : initials}
    </span>
  );
}

/* ------------------------------------------------------------------- Table */

export type Column<T> = {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  /** Hidden on mobile where the table becomes stacked cards. */
  className?: string;
  align?: 'left' | 'right';
};

export function Table<T extends { id: string }>({
  columns,
  rows,
  loading,
  emptyState,
  caption,
  onRowClick,
  rowHref,
  /** Mobile renderer. Tables become cards below md, not a sideways scroll. */
  mobileRow,
}: {
  columns: Column<T>[];
  rows: T[];
  loading?: boolean;
  emptyState?: ReactNode;
  caption: string;
  onRowClick?: (row: T) => void;
  rowHref?: (row: T) => string;
  mobileRow?: (row: T) => ReactNode;
}) {
  if (loading) {
    return (
      <div className="flex flex-col gap-2" data-testid="table-skeleton">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-card" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) return <>{emptyState}</>;

  return (
    <>
      {/* Desktop / tablet */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full border-collapse text-body-1">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="bg-sunken">
              {columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className={cn(
                    'whitespace-nowrap px-4 py-3 text-body-2 font-medium text-secondary',
                    c.align === 'right' ? 'text-right' : 'text-left',
                    c.className,
                  )}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn(
                  'border-b border-hairline last:border-0',
                  (onRowClick || rowHref) && 'cursor-pointer hover:bg-cream-200',
                )}
              >
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={cn(
                      'px-4 py-3 align-middle',
                      c.align === 'right' ? 'text-right' : 'text-left',
                      c.className,
                    )}
                  >
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: stacked cards */}
      <ul className="flex flex-col gap-2 md:hidden">
        {rows.map((row) => (
          <li key={row.id}>
            {mobileRow ? (
              mobileRow(row)
            ) : (
              <div
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className="rounded-card border border-hairline bg-surface p-4 shadow-sm"
              >
                {columns.map((c) => (
                  <div key={c.key} className="flex justify-between gap-3 py-1">
                    <span className="text-body-2 text-muted">{c.header}</span>
                    <span className="text-body-1 text-body">{c.render(row)}</span>
                  </div>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

/* -------------------------------------------------------------- Pagination */

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (p: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  return (
    <nav
      aria-label="Pagination"
      className="flex flex-wrap items-center justify-between gap-3 pt-4"
    >
      <p className="text-body-2 text-muted" aria-live="polite">
        Showing <span className="tabular">{from}</span>–<span className="tabular">{to}</span>{' '}
        of <span className="tabular">{total}</span>
      </p>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          icon={ChevronLeft}
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Previous
        </Button>
        <span className="text-body-2 text-secondary">
          Page <span className="tabular">{page}</span> of{' '}
          <span className="tabular">{pages}</span>
        </span>
        <Button
          size="sm"
          variant="outline"
          icon={ChevronRight}
          iconPosition="right"
          disabled={page >= pages}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </Button>
      </div>
    </nav>
  );
}

/* ------------------------------------------------------------ SearchInput */

export function SearchInput({
  value,
  onChange,
  placeholder = 'Search',
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  label: string;
}) {
  const id = useId();
  return (
    <div className="relative">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <Search
        aria-hidden
        strokeWidth={1.75}
        className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-subtle"
      />
      <input
        id={id}
        type="search"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 w-full rounded-control border border-hairline bg-surface pl-10 pr-3 text-body-1 placeholder:text-subtle focus:border-action"
      />
    </div>
  );
}

/* -------------------------------------------------------------- FilterChip */

export function FilterChip({
  label,
  onRemove,
}: {
  label: string;
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-pill bg-action-soft py-1 pl-3 pr-1.5 text-body-2 text-action">
      {label}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove filter: ${label}`}
        className="inline-flex h-5 w-5 items-center justify-center rounded-circle hover:bg-indigo-100"
      >
        <X aria-hidden strokeWidth={1.75} className="h-3.5 w-3.5" />
      </button>
    </span>
  );
}

/* -------------------------------------------------------------- EmptyState */

export function EmptyState({
  icon: Icon,
  title,
  description,
  actions,
  testId,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  actions?: ReactNode;
  testId?: string;
}) {
  return (
    <div
      data-testid={testId ?? 'empty-state'}
      className="flex flex-col items-center rounded-card border border-dashed border-hairline bg-surface px-6 py-12 text-center"
    >
      {Icon && (
        <span className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-circle bg-action-soft text-action">
          <Icon aria-hidden strokeWidth={1.75} className="h-6 w-6" />
        </span>
      )}
      <h3 className="text-h4 font-medium text-heading">{title}</h3>
      {description && (
        <p className="mt-1 max-w-prose text-body-1 text-muted">{description}</p>
      )}
      {actions && <div className="mt-5 flex flex-wrap justify-center gap-2">{actions}</div>}
    </div>
  );
}

/* -------------------------------------------------------------- ErrorState */

export function ErrorState({
  title = 'Something went wrong',
  description,
  onRetry,
  testId = 'error-state',
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  testId?: string;
}) {
  return (
    <div
      data-testid={testId}
      role="alert"
      className="flex flex-col items-center rounded-card border border-error-tint bg-error-soft px-6 py-10 text-center"
    >
      <AlertCircle aria-hidden strokeWidth={1.75} className="mb-3 h-8 w-8 text-error" />
      <h3 className="text-h4 font-medium text-heading">{title}</h3>
      {description && (
        <p className="mt-1 max-w-prose text-body-1 text-secondary">{description}</p>
      )}
      {onRetry && (
        <Button className="mt-5" variant="outline" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

/* ----------------------------------------------------------- AiDisclosure */

/**
 * Required next to every piece of AI-generated content. It is a component
 * rather than a string so it cannot be quietly dropped from one screen.
 */
export function AiDisclosure({ text }: { text: string }) {
  return (
    <p
      data-testid="ai-disclosure"
      className="flex items-start gap-2 rounded-control bg-action-soft px-3 py-2.5 text-caption text-secondary"
    >
      <Sparkles
        aria-hidden
        strokeWidth={1.75}
        className="mt-px h-3.5 w-3.5 shrink-0 text-action"
      />
      <span>{text}</span>
    </p>
  );
}

/* ---------------------------------------------------------- QuotaIndicator */

export function QuotaIndicator({
  used,
  limit,
  remaining,
  weekStart,
}: {
  used: number;
  limit: number;
  remaining: number;
  weekStart: string;
}) {
  const exhausted = remaining <= 0;
  // The allowance resets at the start of the NEXT IST week.
  const resets = new Date(new Date(weekStart).getTime() + 7 * 24 * 60 * 60 * 1000);
  const resetLabel = resets.toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  });

  return (
    <div
      data-testid="quota-indicator"
      data-exhausted={exhausted ? 'true' : 'false'}
      className={cn(
        'rounded-card border p-4',
        exhausted ? 'border-warning-tint bg-warning-tint' : 'border-hairline bg-surface',
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-body-2 font-medium text-secondary">Weekly AI allowance</span>
        <Badge tone={exhausted ? 'warning' : 'action'}>
          <span className="tabular">
            {used} of {limit} used
          </span>
        </Badge>
      </div>
      <ProgressBarInline value={used} max={limit} exhausted={exhausted} />
      <p className="mt-2 text-caption text-muted">
        {exhausted
          ? `You have used this week's allowance. It resets on ${resetLabel}.`
          : `${remaining} remaining. Shared across chat, loan suggestions and statement reports.`}
      </p>
    </div>
  );
}

function ProgressBarInline({
  value,
  max,
  exhausted,
}: {
  value: number;
  max: number;
  exhausted: boolean;
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-label="AI generations used this week"
      className="h-2 w-full overflow-hidden rounded-pill bg-chart-track"
    >
      <div
        className={cn('h-full rounded-pill', exhausted ? 'bg-warning' : 'bg-action')}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/* -------------------------------------------------------------- InfoBanner */

export function InfoBanner({
  tone = 'info',
  title,
  children,
  testId,
}: {
  tone?: 'info' | 'warning' | 'error' | 'success';
  title?: string;
  children: ReactNode;
  testId?: string;
}) {
  const tones = {
    info: 'border-hairline bg-info-soft text-secondary',
    warning: 'border-warning-tint bg-warning-tint text-warning-text',
    error: 'border-error-tint bg-error-soft text-error-text',
    success: 'border-success-tint bg-success-soft text-success-text',
  };
  return (
    <div
      data-testid={testId}
      className={cn('flex items-start gap-2.5 rounded-card border p-4', tones[tone])}
    >
      <Info aria-hidden strokeWidth={1.75} className="mt-0.5 h-[18px] w-[18px] shrink-0" />
      <div className="min-w-0 text-body-2">
        {title && <p className="font-medium">{title}</p>}
        <div className={title ? 'mt-0.5' : undefined}>{children}</div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------- ProgressBarRow */

/**
 * One budget line: category, spent-of-cap, and a bar.
 *
 * Over-budget is signalled three ways — colour, the word "over", and the
 * amount going negative — so it does not rely on colour alone.
 */
export function ProgressBarRow({
  label,
  spent,
  cap,
  over,
}: {
  label: string;
  spent: number;
  cap: number;
  over: boolean;
}) {
  const pct = cap > 0 ? Math.min(100, (spent / cap) * 100) : 0;
  return (
    <li data-testid="budget-row" data-over={over ? 'true' : 'false'}>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="truncate text-body-2 text-secondary">{label}</span>
        <span className="shrink-0 text-body-2">
          <Amount value={spent} className="font-medium" />
          <span className="text-muted"> of </span>
          <Amount value={cap} tone="muted" />
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${label}: ${formatINR(spent)} of ${formatINR(cap)}`}
        className="h-2 w-full overflow-hidden rounded-pill bg-chart-track"
      >
        <div
          className={cn('h-full rounded-pill', over ? 'bg-error' : 'bg-action')}
          style={{ width: `${pct}%` }}
        />
      </div>
      {over && (
        <p className="mt-1 text-caption font-medium text-error-text">
          Over budget by <Amount value={spent - cap} className="font-medium" />
        </p>
      )}
    </li>
  );
}

/* -------------------------------------------------------------- StatCard */

export function StatCard({
  label,
  value,
  caption,
  icon: Icon,
  tone = 'default',
}: {
  label: string;
  value: ReactNode;
  caption?: string;
  icon?: LucideIcon;
  tone?: 'default' | 'positive' | 'negative';
}) {
  return (
    <div className="rounded-card border border-hairline bg-surface p-5 shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-body-2 text-muted">{label}</span>
        {Icon && (
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-control bg-action-soft text-action">
            <Icon aria-hidden strokeWidth={1.75} className="h-4 w-4" />
          </span>
        )}
      </div>
      <p
        className={cn(
          'text-h2 font-semibold tabular',
          tone === 'positive' && 'text-success-text',
          tone === 'negative' && 'text-error-text',
          tone === 'default' && 'text-heading',
        )}
      >
        {value}
      </p>
      {caption && <p className="mt-1 text-caption text-muted">{caption}</p>}
    </div>
  );
}
