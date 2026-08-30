'use client';

import { useState } from 'react';

import { Button, Input } from '@/components/ui/primitives';
import { monthEnd, monthStart } from '@/lib/finance';

/**
 * The 6M / 1Y / 2Y / Custom control the admin analytics screens share.
 *
 * One implementation so the four screens cannot drift apart on what "1Y" means
 * or on how an inverted custom range is handled.
 */
export type TrendRange = '6m' | '1y' | '2y' | 'custom';

const MONTHS_BACK: Record<Exclude<TrendRange, 'custom'>, number> = {
  '6m': 5,
  '1y': 11,
  '2y': 23,
};

/** Inclusive bounds ending with the current month. */
export function trendBounds(range: Exclude<TrendRange, 'custom'>): {
  from: string;
  to: string;
} {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - MONTHS_BACK[range], 1);
  return { from: monthStart(start), to: monthEnd(now) };
}

export type TrendWindow = {
  range: TrendRange;
  setRange: (r: TrendRange) => void;
  from: string;
  to: string;
  customFrom: string;
  customTo: string;
  setCustomFrom: (v: string) => void;
  setCustomTo: (v: string) => void;
  /** True when the custom range runs backwards; queries stay disabled. */
  invalid: boolean;
};

export function useTrendRange(initial: TrendRange = '6m'): TrendWindow {
  const [range, setRange] = useState<TrendRange>(initial);
  const seed = trendBounds(initial === 'custom' ? '6m' : initial);
  const [customFrom, setCustomFrom] = useState(seed.from);
  const [customTo, setCustomTo] = useState(seed.to);

  const window = range === 'custom' ? { from: customFrom, to: customTo } : trendBounds(range);
  const invalid = Boolean(window.to < window.from);

  return {
    range,
    setRange,
    from: window.from,
    to: window.to,
    customFrom,
    customTo,
    setCustomFrom,
    setCustomTo,
    invalid,
  };
}

const OPTIONS: Array<[TrendRange, string]> = [
  ['6m', '6M'],
  ['1y', '1Y'],
  ['2y', '2Y'],
  ['custom', 'Custom'],
];

/** The button row. Sits in a CardHeader action slot. */
export function TrendRangeTabs({ window: w }: { window: TrendWindow }) {
  return (
    <div className="flex flex-wrap gap-1">
      {OPTIONS.map(([value, label]) => (
        <Button
          key={value}
          size="sm"
          variant={w.range === value ? 'primary' : 'text'}
          aria-pressed={w.range === value}
          onClick={() => w.setRange(value)}
        >
          {label}
        </Button>
      ))}
    </div>
  );
}

/** The two date fields, rendered only while Custom is selected. */
export function TrendRangeCustomFields({ window: w }: { window: TrendWindow }) {
  if (w.range !== 'custom') return null;
  return (
    <div className="mb-4 grid gap-3 sm:grid-cols-2">
      <Input
        label="From"
        type="date"
        value={w.customFrom}
        onChange={(e) => w.setCustomFrom(e.target.value)}
      />
      <Input
        label="To"
        type="date"
        value={w.customTo}
        onChange={(e) => w.setCustomTo(e.target.value)}
        error={w.invalid ? 'The end date must not be before the start date.' : undefined}
      />
    </div>
  );
}
