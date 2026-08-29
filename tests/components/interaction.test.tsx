/**
 * The interaction regressions reported after the first real test of the portal.
 *
 * Every one of these was invisible to the existing suite because the suite
 * asserted on content, not on whether the pointer could reach anything.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { CategoryDonut } from '@/components/ui/charts';
import { Card, Toggle } from '@/components/ui/primitives';

describe('charts are not pointer-inert', () => {
  /*
    ChartFrame used to set `inert` on the chart wrapper to keep it out of the
    focus order. `inert` also disables pointer events on the whole subtree, so
    every chart in the app silently stopped responding to the mouse: no
    tooltip, no hover highlight, nothing. The fix keeps the focus-order goal
    (a tabindex sweep) without the pointer side effect.
  */
  it('the chart wrapper does not carry inert', () => {
    const { container } = render(
      <CategoryDonut
        title="Spending by category"
        data={[
          { name: 'Food', value: 400 },
          { name: 'Travel', value: 250 },
        ]}
      />,
    );

    const wrapper = container.querySelector('[aria-hidden]');
    expect(wrapper).not.toBeNull();
    expect(wrapper!.hasAttribute('inert')).toBe(false);
    // jsdom does not implement the `inert` DOM property, so it reads back as
    // undefined rather than false. Asserting it is not true covers both the
    // real browser and jsdom without pretending the property exists here.
    expect((wrapper as HTMLElement).inert).not.toBe(true);
  });

  it('still keeps the visual chart out of the focus order', () => {
    const { container } = render(
      <CategoryDonut title="Spending by category" data={[{ name: 'Food', value: 400 }]} />,
    );

    const focusable = container.querySelectorAll('[tabindex]:not([tabindex="-1"])');
    expect(focusable.length, 'nothing inside an aria-hidden chart may be focusable').toBe(0);
  });

  it('still exposes the numbers as a table for assistive technology', () => {
    render(
      <CategoryDonut
        title="Spending by category"
        data={[{ name: 'Food', value: 400 }]}
      />,
    );
    expect(screen.getByRole('rowheader', { name: 'Food' })).toBeInTheDocument();
  });
});

describe('cards respond to the pointer', () => {
  it('carries a hover elevation by default', () => {
    const { container } = render(<Card>Body</Card>);
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toMatch(/hover:shadow-md/);
  });

  it('can opt out where a nested lift would read as a glitch', () => {
    const { container } = render(<Card interactive={false}>Body</Card>);
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).not.toMatch(/hover:shadow-md/);
  });
});

describe('the alert settings toggle', () => {
  function Harness({ initial = false }: { initial?: boolean }) {
    const [on, setOn] = useState(initial);
    return (
      <Toggle
        label="Overspending"
        description="When total spending passes an amount you choose."
        checked={on}
        onChange={setOn}
      />
    );
  }

  it('is a switch that reports and flips its state', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const sw = screen.getByRole('switch', { name: /Overspending/ });
    expect(sw).toHaveAttribute('aria-checked', 'false');

    await user.click(sw);
    expect(sw).toHaveAttribute('aria-checked', 'true');
  });

  it('is operable from the keyboard', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const sw = screen.getByRole('switch', { name: /Overspending/ });
    sw.focus();
    await user.keyboard('{Enter}');
    expect(sw).toHaveAttribute('aria-checked', 'true');
  });

  it('does not fire when disabled', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Toggle label="Overspending" checked={false} onChange={onChange} disabled />);

    await user.click(screen.getByRole('switch', { name: /Overspending/ }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('keeps its description associated for screen readers', () => {
    render(<Harness />);
    const sw = screen.getByRole('switch', { name: /Overspending/ });
    expect(sw).toHaveAccessibleDescription(/passes an amount you choose/);
  });
});
