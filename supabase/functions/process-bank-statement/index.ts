// ---------------------------------------------------------------------------
// process-bank-statement  (PRD 6.5)
//
// Parses a staged statement, writes bank_statement_transactions and
// bank_statement_analysis_results, updates bank_statement_uploads.status, and
// deletes the staged file inside this function's own execution.
//
// This function NEVER writes to expense_ledger. Bank statement analysis is a
// separate read-only feature.
//
// CSV is parsed for real. PDF is NOT: no PDF text-extraction provider
// credential exists here, so a PDF upload is recorded as a genuine failure
// with a clear reason rather than being silently faked.
// ---------------------------------------------------------------------------

import {
  AppError, corsHeaders, errorResponse, json, parseBody, requireActiveAccount,
  requireUser, serviceClient, assertOwnedPath, z,
} from '../_shared/lib.ts';

const BUCKET = 'bank-statements-staging';

const Body = z.object({
  upload_id: z.string().uuid(),
  path: z.string().min(1).max(512),
});

type Txn = {
  txn_date: string;
  description: string;
  amount: number;
  direction: 'credit' | 'debit';
  category_guess: string | null;
};

/** Splits one CSV line, honouring double-quoted fields containing commas. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function toIsoDate(raw: string): string | null {
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // Indian statements are overwhelmingly DD/MM/YYYY or DD-MM-YYYY.
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (!m) return null;
  const [, d, mo, y] = m;
  const year = y.length === 2 ? `20${y}` : y;
  const iso = `${year}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  return Number.isNaN(Date.parse(iso)) ? null : iso;
}

function toAmount(raw: string): number | null {
  const cleaned = raw.replace(/[₹,\s]/g, '');
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? Math.abs(n) : null;
}

const CATEGORY_HINTS: Array<[RegExp, string]> = [
  [/swiggy|zomato|restaurant|cafe|hotel/i, 'Food & Dining'],
  [/bigbasket|blinkit|grocer|dmart|zepto/i, 'Groceries'],
  [/uber|ola|rapido|metro|irctc|petrol|fuel|hpcl|iocl|bpcl/i, 'Transport'],
  [/electricity|water|gas|broadband|airtel|jio|vodafone/i, 'Utilities'],
  [/amazon|flipkart|myntra|ajio|shop/i, 'Shopping'],
  [/netflix|prime|hotstar|spotify|subscription/i, 'Subscriptions'],
  [/emi|loan|repayment/i, 'EMI & Loan Payments'],
  [/insurance|policy|lic\b/i, 'Insurance'],
  [/hospital|pharmacy|apollo|medic/i, 'Health & Medical'],
  [/salary|payroll|credit interest/i, 'Income'],
];

function guessCategory(description: string): string | null {
  for (const [re, name] of CATEGORY_HINTS) if (re.test(description)) return name;
  return null;
}

/**
 * Parses a statement CSV. Expects a header row naming at least a date, a
 * description and either an amount column or debit/credit columns.
 */
function parseCsv(text: string): Txn[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    throw new AppError('unparsable_statement', 'The statement file contains no transactions.', 422);
  }

  const header = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
  const idxOf = (...names: string[]) =>
    header.findIndex((h) => names.some((n) => h.includes(n)));

  const dateIdx = idxOf('date');
  const descIdx = idxOf('narration', 'description', 'particular', 'remarks');
  const debitIdx = idxOf('withdrawal', 'debit');
  const creditIdx = idxOf('deposit', 'credit');
  const amountIdx = idxOf('amount');

  if (dateIdx < 0 || (debitIdx < 0 && creditIdx < 0 && amountIdx < 0)) {
    throw new AppError(
      'unparsable_statement',
      'The statement columns were not recognised. A date column and an amount (or debit/credit) column are required.',
      422,
    );
  }

  const txns: Txn[] = [];
  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line);
    const txnDate = toIsoDate(cells[dateIdx] ?? '');
    if (!txnDate) continue;

    const description = (descIdx >= 0 ? cells[descIdx] : '') || 'Unlabelled transaction';

    let amount: number | null = null;
    let direction: 'credit' | 'debit' | null = null;

    const debit = debitIdx >= 0 ? toAmount(cells[debitIdx] ?? '') : null;
    const credit = creditIdx >= 0 ? toAmount(cells[creditIdx] ?? '') : null;

    if (debit) { amount = debit; direction = 'debit'; }
    else if (credit) { amount = credit; direction = 'credit'; }
    else if (amountIdx >= 0) {
      const rawAmount = (cells[amountIdx] ?? '').trim();
      const parsed = toAmount(rawAmount);
      if (parsed) {
        amount = parsed;
        direction = rawAmount.startsWith('-') ? 'debit' : 'credit';
      }
    }

    if (!amount || amount <= 0 || !direction) continue;

    txns.push({
      txn_date: txnDate,
      description,
      amount,
      direction,
      category_guess: guessCategory(description),
    });
  }

  if (txns.length === 0) {
    throw new AppError('unparsable_statement', 'No usable transactions were found in the statement.', 422);
  }
  return txns;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const db = serviceClient();
  let path: string | null = null;
  let uploadId: string | null = null;
  let userId: string | null = null;

  try {
    const user = await requireUser(req);
    userId = user.id;
    await requireActiveAccount(db, user.id);

    const body = await parseBody(req, Body);
    path = body.path;
    uploadId = body.upload_id;
    assertOwnedPath(path, user.id);

    // The upload row must belong to the caller — the service role bypasses
    // RLS, so ownership is re-checked explicitly here.
    const { data: upload, error: upErr } = await db
      .from('bank_statement_uploads')
      .select('id, user_id')
      .eq('id', uploadId)
      .maybeSingle();
    if (upErr || !upload) throw new AppError('not_found', 'Upload record not found.', 404);
    if (upload.user_id !== user.id) {
      throw new AppError('forbidden', 'You may only process your own uploads.', 403);
    }

    const { data: file, error: dlErr } = await db.storage.from(BUCKET).download(path);
    if (dlErr || !file) {
      throw new AppError('file_not_found', 'The uploaded statement could not be read.', 404);
    }

    if (path.toLowerCase().endsWith('.pdf')) {
      throw new AppError(
        'pdf_not_supported',
        'PDF statements cannot be processed yet. Please upload the CSV export from your bank.',
        422,
      );
    }

    const txns = parseCsv(await file.text());

    const { error: txnErr } = await db.from('bank_statement_transactions')
      .insert(txns.map((t) => ({ ...t, upload_id: uploadId })));
    if (txnErr) throw new AppError('persist_failed', 'The statement could not be saved.', 500);

    const totalIncome = txns.filter((t) => t.direction === 'credit')
      .reduce((s, t) => s + t.amount, 0);
    const totalExpense = txns.filter((t) => t.direction === 'debit')
      .reduce((s, t) => s + t.amount, 0);

    const breakdown: Record<string, number> = {};
    for (const t of txns) {
      if (t.direction !== 'debit') continue;
      const key = t.category_guess ?? 'Uncategorised';
      breakdown[key] = Number(((breakdown[key] ?? 0) + t.amount).toFixed(2));
    }

    const dates = txns.map((t) => t.txn_date).sort();

    await db.from('bank_statement_analysis_results').upsert({
      upload_id: uploadId,
      total_income: Number(totalIncome.toFixed(2)),
      total_expense: Number(totalExpense.toFixed(2)),
      category_breakdown: breakdown,
      transaction_count: txns.length,
    }, { onConflict: 'upload_id' });

    await db.from('bank_statement_uploads').update({
      status: 'completed',
      period_from: dates[0],
      period_to: dates[dates.length - 1],
    }).eq('id', uploadId);

    return json({
      data: {
        upload_id: uploadId,
        transaction_count: txns.length,
        total_income: Number(totalIncome.toFixed(2)),
        total_expense: Number(totalExpense.toFixed(2)),
        net_savings: Number((totalIncome - totalExpense).toFixed(2)),
        category_breakdown: breakdown,
        period_from: dates[0],
        period_to: dates[dates.length - 1],
      },
    });
  } catch (err) {
    if (uploadId) {
      await db.from('bank_statement_uploads').update({
        status: 'failed',
        failure_reason: err instanceof AppError ? err.code : 'internal_error',
      }).eq('id', uploadId);
    }
    return errorResponse(err);
  } finally {
    if (userId && path) {
      const { error } = await db.storage.from(BUCKET).remove([path]);
      if (error) console.error('staged_file_delete_failed', error.message);
    }
  }
});
