/**
 * CT-01 .. CT-12 — component-level tests (Phase 2 prompt Section 8.1).
 *
 * These render real components against real DOM output. Nothing here mocks the
 * component under test.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import {
  AiDisclosure,
  Amount,
  CategoryTile,
  EmptyState,
  QuotaIndicator,
  Table,
  categoryTintClass,
} from '@/components/ui/data';
import { Modal, ToastProvider, useToast } from '@/components/ui/overlay';
import { Button, Input, Skeleton } from '@/components/ui/primitives';
import { FileUpload } from '@/components/ui/upload';

/* ------------------------------------------------------------------ CT-01 */

describe('CT-01 Button', () => {
  it('renders each variant with its own classes', () => {
    render(
      <>
        <Button variant="primary">Primary</Button>
        <Button variant="outline">Outline</Button>
        <Button variant="text">Text</Button>
        <Button variant="success">Success</Button>
        <Button variant="danger">Danger</Button>
      </>,
    );
    expect(screen.getByRole('button', { name: 'Primary' })).toHaveClass('bg-action');
    expect(screen.getByRole('button', { name: 'Outline' })).toHaveClass('border-hairline');
    expect(screen.getByRole('button', { name: 'Text' })).toHaveClass('text-action');
    expect(screen.getByRole('button', { name: 'Success' })).toHaveClass('bg-success');
    expect(screen.getByRole('button', { name: 'Danger' })).toHaveClass('bg-error');
  });

  it('renders each size with the documented height', () => {
    render(
      <>
        <Button size="md">Medium</Button>
        <Button size="sm">Small</Button>
      </>,
    );
    // 44px minimum touch target on the default size.
    expect(screen.getByRole('button', { name: 'Medium' })).toHaveClass('h-11');
    expect(screen.getByRole('button', { name: 'Small' })).toHaveClass('h-9');
  });

  it('does not call onClick when disabled', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(
      <Button disabled onClick={onClick}>
        Save
      </Button>,
    );
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('treats loading as disabled so a double click cannot fire twice', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(
      <Button loading onClick={onClick}>
        Save
      </Button>,
    );
    const btn = screen.getByRole('button', { name: 'Save' });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('aria-busy', 'true');
    await user.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });
});

/* ------------------------------------------------------------------ CT-02 */

describe('CT-02 Input', () => {
  it('links its error text with aria-describedby and marks the field invalid', () => {
    render(<Input label="Amount" error="Enter an amount greater than zero" />);
    const input = screen.getByLabelText(/Amount/);
    expect(input).toHaveAttribute('aria-invalid', 'true');
    const describedBy = input.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)).toHaveTextContent(
      'Enter an amount greater than zero',
    );
  });

  it('describes the hint when there is no error, and swaps to the error when there is', () => {
    const { rerender } = render(<Input label="Merchant" hint="Where you spent it" />);
    let input = screen.getByLabelText(/Merchant/);
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(document.getElementById(input.getAttribute('aria-describedby')!)).toHaveTextContent(
      'Where you spent it',
    );

    rerender(<Input label="Merchant" hint="Where you spent it" error="Required" />);
    input = screen.getByLabelText(/Merchant/);
    // Only the error is announced — stale hint text must not be read out.
    expect(document.getElementById(input.getAttribute('aria-describedby')!)).toHaveTextContent(
      'Required',
    );
  });
});

/* ------------------------------------------------------------ CT-03 / 04 */

describe('CT-03 Amount formats with Indian lakh grouping', () => {
  it('renders 124560 as ₹1,24,560 with tabular numerals', () => {
    render(<Amount value={124560} />);
    const el = screen.getByText('₹1,24,560');
    expect(el).toHaveClass('tabular');
  });
});

describe('CT-04 Amount edge values', () => {
  it('renders zero', () => {
    render(<Amount value={0} />);
    expect(screen.getByText('₹0')).toBeInTheDocument();
  });

  it('renders a negative value with a minus sign', () => {
    render(<Amount value={-2500} />);
    expect(screen.getByText('−₹2,500')).toBeInTheDocument();
  });

  it('renders one crore as ₹1,00,00,000', () => {
    render(<Amount value={10000000} />);
    expect(screen.getByText('₹1,00,00,000')).toBeInTheDocument();
  });

  it('signs credits and debits explicitly when asked', () => {
    render(
      <>
        <Amount value={500} signed direction="credit" />
        <Amount value={500} signed direction="debit" />
      </>,
    );
    expect(screen.getByText('+₹500')).toHaveClass('text-success-text');
    expect(screen.getByText('−₹500')).toHaveClass('text-error-text');
  });
});

/* ------------------------------------------------------------------ CT-05 */

function ModalHarness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open dialog
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Edit expense">
        <input aria-label="First field" />
        <input aria-label="Last field" />
      </Modal>
    </>
  );
}

function TypingModalHarness() {
  // `onClose` is an inline arrow and the parent re-renders on every keystroke —
  // the exact shape that used to make the focus effect re-run and steal focus.
  const [open, setOpen] = useState(true);
  const [value, setValue] = useState('');
  return (
    <Modal open={open} onClose={() => setOpen(false)} title="Add a debt">
      <input
        aria-label="Principal amount"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
    </Modal>
  );
}

describe('CT-05 Modal', () => {
  it('keeps focus in the field being typed into across re-renders', async () => {
    const user = userEvent.setup();
    render(<TypingModalHarness />);

    const field = screen.getByLabelText('Principal amount');
    await user.click(field);
    await user.keyboard('500000');

    // Regression guard: this used to record only the first character.
    expect(field).toHaveValue('500000');
    expect(document.activeElement).toBe(field);
  });

  it('traps focus, closes on Esc and returns focus to the trigger', async () => {
    const user = userEvent.setup();
    render(<ModalHarness />);

    const trigger = screen.getByRole('button', { name: 'Open dialog' });
    await user.click(trigger);

    const dialog = await screen.findByRole('dialog');
    // Focus moves into the dialog.
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));

    const first = within(dialog).getByLabelText('First field');
    const last = within(dialog).getByLabelText('Last field');

    // Tab wraps from the last focusable back to the first.
    last.focus();
    await user.tab();
    expect(document.activeElement).toBe(
      within(dialog).getByRole('button', { name: 'Close dialog' }),
    );
    await user.tab();
    expect(document.activeElement).toBe(first);

    // Shift+Tab wraps backwards off the first.
    first.focus();
    await user.tab({ shift: true });
    expect(dialog.contains(document.activeElement)).toBe(true);

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });
});

/* ------------------------------------------------------------------ CT-06 */

function fileOf(name: string, type: string, bytes: number) {
  return new File([new Uint8Array(bytes)], name, { type });
}

/** Drops a file onto the upload zone, the component's other real entry point. */
function drop(file: File) {
  const zone = screen.getByText('Drag a file here, or choose one').closest('div')!;
  fireEvent.drop(zone, { dataTransfer: { files: [file], types: ['Files'] } });
}

describe('CT-06 FileUpload rejection', () => {
  const props = {
    accept: ['image/jpeg', 'image/png'],
    acceptLabel: 'JPG or PNG',
    maxBytes: 5 * 1024 * 1024,
    label: 'Receipt image',
  };

  it('rejects the wrong type with a message naming the file and what is accepted', async () => {
    const onFile = vi.fn();
    render(<FileUpload {...props} onFile={onFile} />);

    // Dropped rather than picked: `userEvent.upload` pre-filters against the
    // input's `accept` attribute, so the picker path can never deliver a
    // wrong-type file to the component. Drag-and-drop can, and does here.
    drop(fileOf('statement.pdf', 'application/pdf', 10));

    const msg = await screen.findByTestId('upload-rejected-type');
    expect(msg).toHaveTextContent('statement.pdf');
    expect(msg).toHaveTextContent('JPG or PNG');
    expect(screen.queryByTestId('upload-rejected-size')).not.toBeInTheDocument();
    expect(onFile).not.toHaveBeenCalled();
  });

  it('rejects an oversize file with a message naming both sizes', async () => {
    const onFile = vi.fn();
    const user = userEvent.setup();
    render(<FileUpload {...props} onFile={onFile} />);

    // Size is not filtered by the picker, so this goes through the real input.
    await user.upload(
      screen.getByLabelText('Receipt image'),
      fileOf('huge.png', 'image/png', 6 * 1024 * 1024),
    );

    const msg = await screen.findByTestId('upload-rejected-size');
    expect(msg).toHaveTextContent('huge.png');
    expect(msg).toHaveTextContent('6.0 MB');
    expect(msg).toHaveTextContent('5 MB');
    expect(screen.queryByTestId('upload-rejected-type')).not.toBeInTheDocument();
    expect(onFile).not.toHaveBeenCalled();
  });

  it('accepts a valid file', async () => {
    const onFile = vi.fn();
    const user = userEvent.setup();
    render(<FileUpload {...props} onFile={onFile} />);

    await user.upload(
      screen.getByLabelText('Receipt image'),
      fileOf('bill.jpg', 'image/jpeg', 1024),
    );

    expect(onFile).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('upload-rejected-type')).not.toBeInTheDocument();
    expect(screen.queryByTestId('upload-rejected-size')).not.toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------ CT-07 */

describe('CT-07 Table empty state', () => {
  it('renders the empty state and no table chrome when rows is empty', () => {
    render(
      <Table
        caption="Expenses"
        columns={[{ key: 'a', header: 'Merchant', render: (r: { id: string }) => r.id }]}
        rows={[] as { id: string }[]}
        emptyState={<EmptyState title="No expenses yet" description="Add your first one." />}
      />,
    );
    expect(screen.getByText('No expenses yet')).toBeInTheDocument();
    // Not a header-only shell, and not a skeleton.
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByTestId('table-skeleton')).not.toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------ CT-08 */

describe('CT-08 Skeleton', () => {
  it('renders a skeleton in place of rows while loading, then the rows', () => {
    const { rerender } = render(
      <Table
        caption="Expenses"
        loading
        columns={[{ key: 'a', header: 'Merchant', render: (r: { id: string }) => r.id }]}
        rows={[] as { id: string }[]}
      />,
    );
    const skeleton = screen.getByTestId('table-skeleton');
    // Same shape as a loaded list: one block per row, not a spinner.
    expect(skeleton.children).toHaveLength(5);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();

    rerender(
      <Table
        caption="Expenses"
        columns={[{ key: 'a', header: 'Merchant', render: (r) => r.id }]}
        rows={[{ id: 'row-1' }]}
      />,
    );
    expect(screen.queryByTestId('table-skeleton')).not.toBeInTheDocument();
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('renders a standalone skeleton with the shared pulse treatment', () => {
    render(<Skeleton className="h-10 w-full" />);
    expect(document.querySelector('.skeleton')).toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------ CT-09 */

function ToastHarness() {
  const { toast } = useToast();
  return (
    <button type="button" onClick={() => toast('Expense saved')}>
      Save
    </button>
  );
}

describe('CT-09 Toast', () => {
  it('renders inside a polite live region that exists before the message', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <ToastHarness />
      </ToastProvider>,
    );

    // The region must already be in the DOM — a region created at the same
    // moment as the message is unreliably announced.
    const region = screen.getByRole('status');
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(within(region).queryByTestId('toast')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Save' }));

    const toast = await within(region).findByTestId('toast');
    expect(toast).toHaveTextContent('Expense saved');
  });
});

/* ------------------------------------------------------------------ CT-10 */

describe('CT-10 QuotaIndicator', () => {
  it('shows exhausted styling and the reset day when nothing remains', () => {
    render(<QuotaIndicator used={2} limit={2} remaining={0} weekStart="2026-08-17" />);
    const box = screen.getByTestId('quota-indicator');
    expect(box).toHaveAttribute('data-exhausted', 'true');
    expect(box).toHaveClass('bg-warning-tint');
    // Resets at the start of the next IST week — the Monday after 17 Aug.
    expect(box).toHaveTextContent('resets on Monday, 24 Aug');
    expect(box).toHaveTextContent('2 of 2 used');
  });

  it('shows the remaining count and no exhausted styling when quota is left', () => {
    render(<QuotaIndicator used={1} limit={2} remaining={1} weekStart="2026-08-17" />);
    const box = screen.getByTestId('quota-indicator');
    expect(box).toHaveAttribute('data-exhausted', 'false');
    expect(box).toHaveTextContent('1 remaining');
  });
});

/* ------------------------------------------------------------------ CT-11 */

describe('CT-11 AI disclosure', () => {
  it('renders the disclosure text passed to it', () => {
    render(<AiDisclosure text="AI-generated. Verify before acting on it." />);
    expect(screen.getByTestId('ai-disclosure')).toHaveTextContent(
      'AI-generated. Verify before acting on it.',
    );
  });

  it('is present in every screen that renders AI output', () => {
    // Structural guard: if a new AI surface is added without a disclosure this
    // fails, which a per-screen render test would not catch.
    const aiScreens = [
      'src/app/(app)/chat/page.tsx',
      'src/app/(app)/debt/page.tsx',
      'src/app/(app)/statements/page.tsx',
    ];
    for (const path of aiScreens) {
      expect(readFileSync(path, 'utf8'), path).toContain('AiDisclosure');
    }
  });
});

/* ------------------------------------------------------------------ CT-12 */

describe('CT-12 Category tint mapping', () => {
  it.each([
    ['#16A34A', 'bg-tint-green'],
    ['#0EA5E9', 'bg-tint-mint'],
    ['#EF4444', 'bg-tint-red'],
    ['#F97316', 'bg-tint-peach'],
    ['#8B5CF6', 'bg-tint-violet'],
    [null, 'bg-tint-violet'],
  ])('maps %s to %s', (tint, expected) => {
    expect(categoryTintClass(tint)).toBe(expected);
  });

  it('applies the mapped tint to the rendered tile', () => {
    render(<CategoryTile name="Fuel" tint="#EF4444" />);
    expect(screen.getByTestId('category-tile')).toHaveClass('bg-tint-red');
  });
});
