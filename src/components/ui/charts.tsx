'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
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

import { formatINR } from '@/lib/finance';

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
}: {
  title: string;
  data: Array<{ name: string; value: number }>;
  valueLabel: string;
  children: ReactNode;
  height?: number;
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
              <td>{formatINR(d.value)}</td>
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
