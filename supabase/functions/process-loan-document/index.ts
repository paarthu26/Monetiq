// ---------------------------------------------------------------------------
// process-loan-document  (PRD 6.6)
//
// Extracts what the debt record needs from a staged loan/credit document and
// deletes the staged file immediately afterwards, inside this function's own
// execution.
//
// Like process-receipt, document extraction is a pluggable STUB here because
// no extraction provider credential exists. It reports that honestly rather
// than inventing loan figures.
// ---------------------------------------------------------------------------

import {
  AppError, corsHeaders, errorResponse, json, parseBody, requireActiveAccount,
  requireUser, serviceClient, assertOwnedPath, z,
} from '../_shared/lib.ts';

const BUCKET = 'loan-documents-staging';

const Body = z.object({
  path: z.string().min(1).max(512),
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const db = serviceClient();
  let path: string | null = null;
  let userId: string | null = null;

  try {
    const user = await requireUser(req);
    userId = user.id;
    await requireActiveAccount(db, user.id);

    const body = await parseBody(req, Body);
    path = body.path;
    assertOwnedPath(path, user.id);

    const { data: file, error } = await db.storage.from(BUCKET).download(path);
    if (error || !file) {
      throw new AppError('file_not_found', 'The uploaded document could not be read.', 404);
    }

    const provider = Deno.env.get('LOAN_DOC_PROVIDER') ?? 'stub';
    if (provider !== 'stub') {
      throw new AppError(
        'extraction_provider_not_implemented',
        'The configured document extraction provider is not available.',
        503,
      );
    }

    return json({
      data: {
        loan_type: null,
        lender_name: null,
        principal_amount: null,
        interest_rate: null,
        tenure_months: null,
        emi_amount: null,
        start_date: null,
        outstanding_balance: null,
        extraction_source: 'stub',
        requires_manual_review: true,
      },
      notice:
        'No document extraction provider is configured in this environment. No values were extracted — enter the loan details manually.',
    });
  } catch (err) {
    return errorResponse(err);
  } finally {
    if (userId && path) {
      const { error } = await db.storage.from(BUCKET).remove([path]);
      if (error) console.error('staged_file_delete_failed', error.message);
    }
  }
});
