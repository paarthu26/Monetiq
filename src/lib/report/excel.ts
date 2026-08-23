import * as XLSX from 'xlsx';

import { AI_REPORT_DISCLAIMER } from '@/lib/constants';
import { formatINR } from '@/lib/finance';
import type { Tables } from '@/lib/supabase/types';

/**
 * Bank statement report (PRD 6.5 "Download Report").
 *
 * Phase 1 did not build this, so it is generated client-side here from data the
 * user already has on screen. That keeps it out of the Edge Function budget and
 * needs no new backend surface — but it does mean the workbook is assembled in
 * the browser, so it is only ever as trustworthy as the session that made it.
 * Flagged in the Phase 2 report as worth confirming.
 *
 * The AI-generated-content disclaimer is written into the workbook itself, not
 * just shown on the page — the file outlives the screen.
 */
export function buildStatementWorkbook(input: {
  upload: Tables<'bank_statement_uploads'>;
  result: Tables<'bank_statement_analysis_results'>;
  transactions: Tables<'bank_statement_transactions'>[];
}): XLSX.WorkBook {
  const { upload, result, transactions } = input;

  const breakdown = (result.category_breakdown ?? {}) as Record<string, number>;
  const disclaimer = result.ai_disclaimer || AI_REPORT_DISCLAIMER;

  const summary = [
    ['Monetiq — Bank statement analysis'],
    [],
    ['Bank', upload.bank_name ?? '—'],
    ['Period from', upload.period_from ?? '—'],
    ['Period to', upload.period_to ?? '—'],
    ['Generated', new Date(result.generated_at).toISOString().slice(0, 10)],
    [],
    ['Total income', formatINR(Number(result.total_income))],
    ['Total expense', formatINR(Number(result.total_expense))],
    ['Net', formatINR(Number(result.total_income) - Number(result.total_expense))],
    ['Transactions', result.transaction_count],
    [],
    ['Category', 'Amount'],
    ...Object.entries(breakdown).map(([k, v]) => [k, formatINR(Number(v))]),
    [],
    // Row 1 of the disclaimer block. Kept as its own labelled row so it is
    // obvious in the file, not buried in a footer.
    ['Disclaimer', disclaimer],
  ];

  const txnRows = [
    ['Date', 'Description', 'Direction', 'Amount', 'Category (guess)'],
    ...transactions.map((t) => [
      t.txn_date,
      t.description ?? '',
      t.direction,
      Number(t.amount),
      t.category_guess ?? '',
    ]),
    [],
    ['Disclaimer', disclaimer],
  ];

  const wb = XLSX.utils.book_new();
  const summarySheet = XLSX.utils.aoa_to_sheet(summary);
  summarySheet['!cols'] = [{ wch: 28 }, { wch: 60 }];
  XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary');

  const txnSheet = XLSX.utils.aoa_to_sheet(txnRows);
  txnSheet['!cols'] = [{ wch: 12 }, { wch: 40 }, { wch: 10 }, { wch: 14 }, { wch: 22 }];
  XLSX.utils.book_append_sheet(wb, txnSheet, 'Transactions');

  return wb;
}

/** Returns the workbook as text, for asserting the disclaimer is present. */
export function workbookToCsvBundle(wb: XLSX.WorkBook): string {
  return wb.SheetNames.map((n) => XLSX.utils.sheet_to_csv(wb.Sheets[n])).join('\n');
}

export function downloadStatementReport(input: {
  upload: Tables<'bank_statement_uploads'>;
  result: Tables<'bank_statement_analysis_results'>;
  transactions: Tables<'bank_statement_transactions'>[];
}): void {
  const wb = buildStatementWorkbook(input);
  const name = `monetiq-statement-${input.upload.period_from ?? 'report'}.xlsx`;
  XLSX.writeFile(wb, name);
}
