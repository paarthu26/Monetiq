'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  Pie,
  PieChart,
  ResponsiveContainer,
  Sector,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
  type PieSectorDataItem,
} from 'recharts';
import { useEffect, useRef, type ReactNode } from 'react';

import { formatINR, formatMonthShort, savingsRatePct } from '@/lib/finance';

/**
 * Chart series colours, in the donut legend order from the kit sheet.
 * Series are never distinguished by colour alone — every chart here ships an
 * accessible data table alongside it (Section 7).
 */
export const CHART_COLORS = [
  '#3748F0',
  '#20A2C4',
  '#5071ED',
  '#4C37D8',
  '#2826AC',
  '#086F75',
  '#F32E55',
];

/**
 * Wraps a chart with a visually hidden table carrying the same numbers, so the
 * data is reachable without perceiving colour or shape.
 */
function ChartFrame({
  title,
  data,
  valueLabel,
  children,
  height = 260,
  format = formatINR,
}: {
  title: string;
  data: Array<{ name: string; value: number | null }>;
  valueLabel: string;
  children: ReactNode;
  height?: number;
  /**
   * How to render a value in the accessible table. Defaults to rupees, which
   * is right for the money charts this started as — but the admin charts carry
   * counts, percentages and milliseconds, and a success rate rendered as "₹83"
   * is simply wrong for anyone reading the table instead of the picture.
   */
  format?: (v: number) => string;
}) {
  const visualRef = useRef<HTMLDivElement>(null);

  /*
    Recharts' accessibility layer puts `tabindex="0"` on its wrapper. Inside an
    `aria-hidden` subtree that is an axe `aria-hidden-focus` failure: a keyboard
    user would land on something a screen reader never announces.

    The accessible content here is the sr-only data table below, so the visual
    chart is taken out of the FOCUS order — and only the focus order.

    This used to set `el.inert = true`, which does remove it from the focus
    order but also disables pointer events on the entire subtree. That silently
    killed every hover interaction in the app: no tooltips, no slice highlight,
    nothing. Sweeping tabindex achieves the accessibility goal on its own and
    leaves the mouse alone.

    The sweep runs again on mutation because Recharts re-creates its wrapper on
    resize and on data changes, restoring `tabindex="0"` each time.
  */
  useEffect(() => {
    const el = visualRef.current;
    if (!el) return;

    const sweep = () => {
      el.querySelectorAll<HTMLElement>('[tabindex]:not([tabindex="-1"])').forEach((node) => {
        node.tabIndex = -1;
      });
    };

    sweep();
    const observer = new MutationObserver(sweep);
    observer.observe(el, { childList: true, subtree: true, attributeFilter: ['tabindex'] });
    return () => observer.disconnect();
  }, [data, children]);

  return (
    <figure className="m-0">
      <figcaption className="sr-only">{title}</figcaption>
      <div ref={visualRef} style={{ width: '100%', height }} aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          {children as React.ReactElement}
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th scope="col">Category</th>
            <th scope="col">{valueLabel}</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.name}>
              <th scope="row">{d.name}</th>
              {/* A null period genuinely has no value; 0 would be a claim. */}
              <td>{typeof d.value === 'number' ? format(d.value) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

/**
 * The hovered slice grows outward and the others step back, so the segment
 * under the pointer is unmistakable before the tooltip is even read.
 *
 * Recharts 3 tracks which slice is hovered on its own — `activeIndex` was
 * removed in that major — so the highlight is expressed purely as the pair of
 * shapes it renders for the active and inactive states.
 */
export function CategoryDonut({
  title,
  data,
}: {
  title: string;
  data: Array<{ name: string; value: number }>;
}) {
  return (
    <ChartFrame title={title} data={data} valueLabel="Amount">
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          innerRadius="58%"
          outerRadius="86%"
          activeShape={(props: PieSectorDataItem) => (
            <Sector
              {...props}
              outerRadius={(props.outerRadius ?? 0) + 8}
              style={{ filter: 'drop-shadow(0 2px 6px rgba(30,27,75,.28))' }}
            />
          )}
          inactiveShape={(props: PieSectorDataItem) => (
            <Sector {...props} opacity={0.4} />
          )}
        >
          {data.map((_, i) => (
            <Cell
              key={i}
              fill={CHART_COLORS[i % CHART_COLORS.length]}
              // A hairline gap keeps adjacent slices readable once one lifts.
              stroke="#FFFFFF"
              strokeWidth={2}
            />
          ))}
        </Pie>
        <RTooltip
          formatter={(v) => formatINR(Number(v))}
          // The series colour identifies the slice via its swatch; using it for
          // the text itself fails contrast (e.g. #F32E55 is 3.93:1 on white).
          itemStyle={{ color: '#27272A' }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ChartFrame>
  );
}

/** Donut plus a visible legend table, driven by a category → amount map. */
export function CategoryDonutSection({
  breakdown,
}: {
  breakdown: Record<string, number>;
}) {
  const data = Object.entries(breakdown)
    .map(([name, value]) => ({ name, value: Number(value) }))
    .sort((a, b) => b.value - a.value);

  if (data.length === 0) {
    return <p className="py-6 text-center text-body-2 text-muted">Nothing to break down.</p>;
  }

  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <>
      <CategoryDonut title="Spending by category" data={data} />
      <ul className="mt-3 flex flex-col gap-2">
        {data.map((d, i) => (
          <li key={d.name} className="flex items-center gap-2.5 text-body-2">
            <span
              aria-hidden
              className="h-2.5 w-2.5 shrink-0 rounded-circle"
              style={{ background: CHART_COLORS[i % CHART_COLORS.length] }}
            />
            <span className="min-w-0 flex-1 truncate text-secondary">{d.name}</span>
            <span className="tabular text-muted">
              {total > 0 ? Math.round((d.value / total) * 100) : 0}%
            </span>
            <span className="tabular text-body">{formatINR(d.value)}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

export function IncomeExpenseBars({
  title,
  data,
}: {
  title: string;
  data: Array<{ name: string; income: number; expense: number }>;
}) {
  const flat = data.flatMap((d) => [
    { name: `${d.name} income`, value: d.income },
    { name: `${d.name} expense`, value: d.expense },
  ]);
  return (
    <ChartFrame title={title} data={flat} valueLabel="Amount">
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="#E4E4E7" vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="#A1A1AA" />
        <YAxis
          tick={{ fontSize: 11 }}
          stroke="#A1A1AA"
          width={64}
          tickFormatter={(v: number) => formatINR(v)}
        />
        <RTooltip
          formatter={(v) => formatINR(Number(v))}
          // The series colour identifies the slice via its swatch; using it for
          // the text itself fails contrast (e.g. #F32E55 is 3.93:1 on white).
          itemStyle={{ color: '#27272A' }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="income" name="Income" fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]} />
        <Bar dataKey="expense" name="Expense" fill={CHART_COLORS[6]} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ChartFrame>
  );
}

export function TrendLine({
  title,
  data,
  valueLabel = 'Amount',
}: {
  title: string;
  data: Array<{ name: string; value: number }>;
  valueLabel?: string;
}) {
  return (
    <ChartFrame title={title} data={data} valueLabel={valueLabel}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="#E4E4E7" vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="#A1A1AA" />
        <YAxis tick={{ fontSize: 11 }} stroke="#A1A1AA" width={56} />
        <RTooltip />
        <Line
          type="monotone"
          dataKey="value"
          name={valueLabel}
          stroke={CHART_COLORS[0]}
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ChartFrame>
  );
}

export function CountBars({
  title,
  data,
  valueLabel = 'Count',
}: {
  title: string;
  data: Array<{ name: string; value: number }>;
  valueLabel?: string;
}) {
  return (
    <ChartFrame title={title} data={data} valueLabel={valueLabel}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="#E4E4E7" vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="#A1A1AA" />
        <YAxis tick={{ fontSize: 11 }} stroke="#A1A1AA" width={40} allowDecimals={false} />
        <RTooltip />
        <Bar dataKey="value" name={valueLabel} fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ChartFrame>
  );
}

/* --------------------------------------- income / expenses / savings trend */

/**
 * The MONETIQ trend palette.
 *
 * The brand's two dark blues (#1E1B4B and #314363) cannot both be series here —
 * against each other they measure ΔE 13.0 for normal vision, under the 15 floor
 * where two lines stop being reliably tellable apart.
 *
 * The first fix for that used a lighter slate (#64748B) for savings, which is
 * fine ADJACENT to expenses but only ΔE 10.6 from income — and on a line chart
 * every series is visible at once and the lines cross, so all-pairs is the test
 * that matters, not adjacency. Savings now takes #B45309, already an app token,
 * which lifts the worst pair to ΔE 28.4 for normal vision and 24.6 under
 * deuteranopia, with all three over 3:1 against the card.
 */
const TREND_COLORS = {
  income: '#0284C7',
  expense: '#1E1B4B',
  savings: '#B45309',
} as const;

/** Grid, axis and guide ink. Recessive on purpose — the lines are the subject. */
const AXIS_INK = '#A1A1AA';
const GRID_INK = '#E4E4E7';
const TEXT_INK = '#27272A';

export type TrendPoint = {
  /** `YYYY-MM`. */
  month: string;
  income: number;
  expense: number;
  savings: number;
};

/** Compact ₹ ticks — full rupee values would crowd the axis off the card. */
function formatAxisINR(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 10000000) return `₹${(v / 10000000).toFixed(abs % 10000000 === 0 ? 0 : 1)}Cr`;
  if (abs >= 100000) return `₹${(v / 100000).toFixed(abs % 100000 === 0 ? 0 : 1)}L`;
  if (abs >= 1000) return `₹${(v / 1000).toFixed(abs % 1000 === 0 ? 0 : 1)}k`;
  return `₹${v}`;
}

/**
 * `dash` is on savings alone, and it is load-bearing rather than decorative.
 *
 * Savings is income minus expenses, so in any month with little spending it
 * lands on the income line exactly. Drawn solid it covered income completely
 * and the income series simply vanished — measured on the dev account, both
 * resolved to the same y pixel. A dashed stroke lets the solid line beneath
 * show through, so a coincidence reads as "these two are equal" rather than
 * "one is missing". It also gives the series a second cue beyond colour.
 *
 * `dotR` nests the markers for the same reason: where two points coincide, the
 * smaller one sits inside the larger instead of hiding it.
 */
const SERIES = [
  { key: 'income', label: 'Income', color: TREND_COLORS.income, dash: undefined, dotR: 4 },
  { key: 'expense', label: 'Expenses', color: TREND_COLORS.expense, dash: undefined, dotR: 3.5 },
  { key: 'savings', label: 'Savings', color: TREND_COLORS.savings, dash: '5 4', dotR: 2.5 },
] as const;

function TrendTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: TrendPoint }>;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;

  return (
    <div className="rounded-control border border-hairline bg-surface px-3 py-2.5 shadow-md">
      <p className="mb-1.5 text-caption font-semibold" style={{ color: TEXT_INK }}>
        {formatMonthShort(p.month)}
      </p>
      <dl className="flex flex-col gap-1">
        {SERIES.map((sr) => (
          <div key={sr.key} className="flex items-center gap-2 text-caption">
            <span
              aria-hidden
              className={sr.dash ? 'h-0 w-3 shrink-0 border-t-2 border-dashed' : 'h-2 w-2 shrink-0 rounded-circle'}
              style={sr.dash ? { borderColor: sr.color } : { background: sr.color }}
            />
            <dt className="text-muted">{sr.label}</dt>
            <dd className="tabular ml-auto pl-4" style={{ color: TEXT_INK }}>
              {formatINR(p[sr.key])}
            </dd>
          </div>
        ))}
        <div className="mt-1 flex items-center gap-2 border-t border-hairline pt-1.5 text-caption">
          <dt className="text-muted">Savings rate</dt>
          <dd className="tabular ml-auto" style={{ color: TEXT_INK }}>
            {savingsRatePct(p.income, p.expense)}%
          </dd>
        </div>
      </dl>
    </div>
  );
}

/**
 * Income, expenses and savings over time.
 *
 * Savings is drawn rather than left to be inferred: it is the number the user
 * actually cares about, and reading it as the gap between two other lines is
 * work. It can legitimately go negative, so the zero line is drawn whenever the
 * range crosses it.
 */
export function IncomeExpenseSavingsTrend({
  title,
  data,
}: {
  title: string;
  data: TrendPoint[];
}) {
  const flat = data.flatMap((d) => [
    { name: `${formatMonthShort(d.month)} income`, value: d.income },
    { name: `${formatMonthShort(d.month)} expenses`, value: d.expense },
    { name: `${formatMonthShort(d.month)} savings`, value: d.savings },
  ]);

  const crossesZero = data.some((d) => d.savings < 0);

  return (
    <>
      {/* A real legend, laid out here rather than by Recharts, whose own
          wrapper was clipping the third entry inside the card. */}
      <ul className="mb-2 flex flex-wrap items-center gap-x-5 gap-y-1.5">
        {SERIES.map((sr) => (
          <li key={sr.key} className="flex items-center gap-2 text-body-2">
            <span
              aria-hidden
              className={sr.dash ? 'h-0 w-4 shrink-0 border-t-2 border-dashed' : 'h-2.5 w-2.5 shrink-0 rounded-circle'}
              style={sr.dash ? { borderColor: sr.color } : { background: sr.color }}
            />
            <span className="text-secondary">{sr.label}</span>
          </li>
        ))}
      </ul>

      <ChartFrame title={title} data={flat} valueLabel="Amount" height={300}>
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
          <CartesianGrid stroke={GRID_INK} vertical={false} />
          <XAxis
            dataKey="month"
            tickFormatter={formatMonthShort}
            tick={{ fontSize: 11, fill: AXIS_INK }}
            stroke={AXIS_INK}
            tickMargin={8}
            minTickGap={16}
          />
          <YAxis
            tick={{ fontSize: 11, fill: AXIS_INK }}
            stroke={AXIS_INK}
            width={68}
            tickFormatter={formatAxisINR}
          />
          <RTooltip
            content={<TrendTooltip />}
            // The vertical guide: it lands on the hovered month and reads as a
            // guide rather than a series.
            cursor={{ stroke: TREND_COLORS.expense, strokeWidth: 1, strokeDasharray: '4 4' }}
          />
          {crossesZero && <ReferenceLine y={0} stroke={AXIS_INK} strokeWidth={1} />}
          {SERIES.map((sr) => (
            <Line
              key={sr.key}
              type="monotone"
              dataKey={sr.key}
              name={sr.label}
              stroke={sr.color}
              strokeWidth={2}
              strokeDasharray={sr.dash}
              // Circular points, with a surface ring so overlapping series stay
              // separable where the lines cross.
              dot={{ r: sr.dotR, fill: sr.color, stroke: '#FFFFFF', strokeWidth: 1.5 }}
              // The hovered month's points grow — that is the "selected" state.
              activeDot={{ r: sr.dotR + 2.5, fill: sr.color, stroke: '#FFFFFF', strokeWidth: 2 }}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ChartFrame>
    </>
  );
}

/* ------------------------------------------------- admin analytics trend */

/**
 * The Super Admin chart palette.
 *
 * Validated all-pairs, because these are line charts: every series is on
 * screen at once and the lines cross, so "adjacent in the legend" is not the
 * relevant test. Worst pair is #B45309↔#0284C7 at ΔE 28.4 for normal vision
 * and 24.6 under deuteranopia, with all three over 3:1 on the card.
 *
 * Three is the ceiling, and that is a measured limit rather than a stylistic
 * one: no fourth hue drawn from this brand clears the ΔE 15 normal-vision
 * floor against all of the first three. A metric with four dimensions is drawn
 * as small multiples instead — see the feature-usage card on the dashboard.
 */
export const ADMIN_SERIES_COLORS = {
  primary: '#0284C7',
  secondary: '#1E1B4B',
  tertiary: '#B45309',
  /** Status pair, for success-versus-failure only. Never as "series 4". */
  success: '#0EA765',
  failure: '#B91C2C',
} as const;

export type AdminSeries = {
  key: string;
  label: string;
  color: string;
  /** Dash a derived or secondary series so a coincidence stays readable. */
  dash?: string;
};

export type AdminTrendRow = { month: string } & Record<string, number | string | null>;

/** Compact integer ticks: 1.2k rather than 1200. */
export function formatCount(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1000000) return `${(v / 1000000).toFixed(abs % 1000000 === 0 ? 0 : 1)}M`;
  if (abs >= 1000) return `${(v / 1000).toFixed(abs % 1000 === 0 ? 0 : 1)}k`;
  return String(v);
}

export const formatPct = (v: number) => `${v}%`;
export const formatMs = (v: number) => `${formatCount(v)} ms`;

function AdminTooltip({
  active,
  payload,
  series,
  format,
}: {
  active?: boolean;
  payload?: Array<{ payload: AdminTrendRow }>;
  series: readonly AdminSeries[];
  format: (v: number) => string;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;

  return (
    <div className="rounded-control border border-hairline bg-surface px-3 py-2.5 shadow-md">
      <p className="mb-1.5 text-caption font-semibold" style={{ color: TEXT_INK }}>
        {formatMonthShort(row.month)}
      </p>
      <dl className="flex flex-col gap-1">
        {series.map((sr) => {
          const raw = row[sr.key];
          return (
            <div key={sr.key} className="flex items-center gap-2 text-caption">
              <span
                aria-hidden
                className={
                  sr.dash
                    ? 'h-0 w-3 shrink-0 border-t-2 border-dashed'
                    : 'h-2 w-2 shrink-0 rounded-circle'
                }
                style={sr.dash ? { borderColor: sr.color } : { background: sr.color }}
              />
              <dt className="text-muted">{sr.label}</dt>
              <dd className="tabular ml-auto pl-4" style={{ color: TEXT_INK }}>
                {/* A null month has no value, and printing 0 would be a lie. */}
                {typeof raw === 'number' ? format(raw) : '—'}
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}

/**
 * The one line chart every Super Admin analytics card uses.
 *
 * Same shape as the user-facing trend: monotone curves, circular points with a
 * surface ring, light horizontal grid, a dashed vertical guide on hover, and
 * an sr-only data table behind it.
 */
export function AdminTrendChart({
  title,
  data,
  series,
  format = formatCount,
  height = 260,
  compact = false,
}: {
  title: string;
  data: AdminTrendRow[];
  series: readonly AdminSeries[];
  format?: (v: number) => string;
  height?: number;
  /** Small-multiple mode: no legend, tighter axes. */
  compact?: boolean;
}) {
  const flat = data.flatMap((d) =>
    series.map((sr) => ({
      name: `${formatMonthShort(d.month)} ${sr.label.toLowerCase()}`,
      // Nulls are kept as nulls: the table shows "—" rather than inventing a 0.
      value: typeof d[sr.key] === 'number' ? (d[sr.key] as number) : null,
    })),
  );

  return (
    <>
      {!compact && series.length > 1 && (
        <ul className="mb-2 flex flex-wrap items-center gap-x-5 gap-y-1.5">
          {series.map((sr) => (
            <li key={sr.key} className="flex items-center gap-2 text-body-2">
              <span
                aria-hidden
                className={
                  sr.dash
                    ? 'h-0 w-4 shrink-0 border-t-2 border-dashed'
                    : 'h-2.5 w-2.5 shrink-0 rounded-circle'
                }
                style={sr.dash ? { borderColor: sr.color } : { background: sr.color }}
              />
              <span className="text-secondary">{sr.label}</span>
            </li>
          ))}
        </ul>
      )}

      <ChartFrame title={title} data={flat} valueLabel="Value" height={height} format={format}>
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
          <CartesianGrid stroke={GRID_INK} vertical={false} />
          <XAxis
            dataKey="month"
            tickFormatter={formatMonthShort}
            tick={{ fontSize: compact ? 10 : 11, fill: AXIS_INK }}
            stroke={AXIS_INK}
            tickMargin={8}
            minTickGap={compact ? 24 : 16}
          />
          <YAxis
            tick={{ fontSize: compact ? 10 : 11, fill: AXIS_INK }}
            stroke={AXIS_INK}
            width={compact ? 40 : 56}
            tickFormatter={format}
            allowDecimals={false}
          />
          <RTooltip
            content={<AdminTooltip series={series} format={format} />}
            cursor={{
              stroke: ADMIN_SERIES_COLORS.secondary,
              strokeWidth: 1,
              strokeDasharray: '4 4',
            }}
          />
          {series.map((sr) => (
            <Line
              key={sr.key}
              type="monotone"
              dataKey={sr.key}
              name={sr.label}
              stroke={sr.color}
              strokeWidth={2}
              strokeDasharray={sr.dash}
              // A month with no activity has no rate, so the line breaks rather
              // than dropping to zero and implying total failure.
              connectNulls={false}
              dot={{ r: compact ? 2.5 : 3.5, fill: sr.color, stroke: '#FFFFFF', strokeWidth: 1.5 }}
              activeDot={{ r: compact ? 5 : 6, fill: sr.color, stroke: '#FFFFFF', strokeWidth: 2 }}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ChartFrame>
    </>
  );
}
