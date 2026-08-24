// ---------------------------------------------------------------------------
// process-receipt  (PRD 6.3)
//
// Receives a staged file reference from `receipts-staging`, extracts the
// merchant / amount / date, and returns them for the user to review and edit.
// It does NOT write to expense_ledger — the user confirms first, then the
// client inserts the row under RLS.
//
// The staged file is deleted inside THIS function's own execution, in a
// finally block, so a failed extraction still leaves nothing behind. There is
// no separate cleanup job to depend on.
//
// OCR PROVIDER: no real OCR credential exists in this environment. The
// provider below is a pluggable STUB and says so in its response
// (`extraction_source: "stub"`, `requires_manual_review: true`). It does not
// fabricate a plausible-looking receipt and present it as a real reading.
// ---------------------------------------------------------------------------

import {
  AppError, corsHeaders, errorResponse, json, parseBody, requireActiveAccount,
  requireUser, serviceClient, assertOwnedPath, assertWithinRateLimit, z,
} from '../_shared/lib.ts';

const BUCKET = 'receipts-staging';

const Body = z.object({
  path: z.string().min(1).max(512),
});

type Extraction = {
  merchant: string | null;
  amount: number | null;
  expense_date: string | null;
  suggested_category: string | null;
  confidence: number;
  extraction_source: 'stub' | string;
  requires_manual_review: boolean;
};

async function runOcr(_file: Blob): Promise<Extraction> {
  const provider = Deno.env.get('OCR_PROVIDER') ?? 'stub';
  if (provider !== 'stub') {
    // A real provider integration goes here once a credential exists. Failing
    // loudly beats silently falling back to the stub and calling it real.
    throw new AppError(
      'ocr_provider_not_implemented',
      'The configured OCR provider is not available.',
      503,
    );
  }
  return {
    merchant: null,
    amount: null,
    expense_date: null,
    suggested_category: null,
    confidence: 0,
    extraction_source: 'stub',
    requires_manual_review: true,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const started = Date.now();
  const db = serviceClient();
  let userId: string | null = null;
  let path: string | null = null;

  try {
    const user = await requireUser(req);
    userId = user.id;
    await requireActiveAccount(db, user.id);
    const body = await parseBody(req, Body);
    path = body.path;
    assertOwnedPath(path, user.id);

    // Rate limited here rather than before parseBody: the check must run
    // before any download or parsing work, but `path` has to be resolved
    // first so the finally block still deletes the staged file when a
    // request is refused. A 429 must not leave the upload behind.
    await assertWithinRateLimit(db, user.id, 'process_receipt');

    const { data: file, error: dlError } = await db.storage.from(BUCKET).download(path);
    if (dlError || !file) {
      throw new AppError('file_not_found', 'The uploaded receipt could not be read.', 404);
    }

    const extraction = await runOcr(file);

    await db.from('ocr_scan_log').insert({
      user_id: user.id,
      status: 'success',
      duration_ms: Date.now() - started,
      provider: extraction.extraction_source,
    });

    return json({
      data: extraction,
      notice: extraction.extraction_source === 'stub'
        ? 'No OCR provider is configured in this environment. No values were extracted — enter the receipt details manually.'
        : undefined,
    });
  } catch (err) {
    if (userId) {
      await db.from('ocr_scan_log').insert({
        user_id: userId,
        status: 'failed',
        failure_reason: err instanceof AppError ? err.code : 'internal_error',
        duration_ms: Date.now() - started,
        provider: Deno.env.get('OCR_PROVIDER') ?? 'stub',
      });
    }
    return errorResponse(err);
  } finally {
    // Privacy rule: the raw document never survives this request.
    if (userId && path) {
      const { error } = await db.storage.from(BUCKET).remove([path]);
      if (error) console.error('staged_file_delete_failed', error.message);
    }
  }
});
