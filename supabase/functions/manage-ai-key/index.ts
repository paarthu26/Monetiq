// ---------------------------------------------------------------------------
// manage-ai-key  (PRD 6.15)
//
// Super Admin AI key management. The raw key value arrives here over HTTPS,
// is handed straight to Supabase Vault through a service-role-only SECURITY
// DEFINER function, and is never written to a client-readable column and
// never returned in any response.
//
// WHY AN EDGE FUNCTION RATHER THAN A DIRECT RPC:
// the Vault schema is not exposed through PostgREST, so a browser cannot call
// vault.create_secret at all. Routing through this function also means the
// admin's own session never carries a privilege that could read a stored key
// back — EXECUTE on the Vault accessors is granted to service_role only.
//
// Actions: set_key | delete_key | upsert_provider | set_active | set_limits
// ---------------------------------------------------------------------------

import {
  AppError, corsHeaders, errorResponse, json, parseBody, requireSuperAdmin,
  requireUser, serviceClient, z,
} from '../_shared/lib.ts';

const Body = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('upsert_provider'),
    provider: z.string().min(1).max(50),
    model: z.string().min(1).max(100),
    label: z.string().max(100).optional(),
    monthly_usage_limit: z.number().int().positive().optional(),
  }),
  z.object({
    action: z.literal('set_key'),
    config_id: z.string().uuid(),
    api_key: z.string().min(8, 'Key looks too short to be valid.').max(500),
  }),
  z.object({ action: z.literal('delete_key'), config_id: z.string().uuid() }),
  z.object({ action: z.literal('set_active'), config_id: z.string().uuid() }),
  z.object({
    action: z.literal('set_limits'),
    config_id: z.string().uuid(),
    is_enabled: z.boolean().optional(),
    monthly_usage_limit: z.number().int().positive().nullable().optional(),
  }),
]);

async function audit(
  db: ReturnType<typeof serviceClient>,
  adminId: string, action: string, targetId: string | null,
  status: 'successful' | 'denied', details: Record<string, unknown> = {},
) {
  await db.from('admin_audit_log').insert({
    admin_id: adminId, action, target: 'ai_provider_config',
    target_id: targetId, status, details,
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const db = serviceClient();
  let adminId: string | null = null;

  try {
    const user = await requireUser(req);
    adminId = user.id;
    await requireSuperAdmin(db, user.id);

    const body = await parseBody(req, Body);

    switch (body.action) {
      case 'upsert_provider': {
        const { data, error } = await db.from('ai_provider_config').upsert({
          provider: body.provider,
          model: body.model,
          label: body.label ?? null,
          monthly_usage_limit: body.monthly_usage_limit ?? null,
          updated_by: user.id,
        }, { onConflict: 'provider,model' }).select('id, provider, model, is_active, is_enabled, has_key').single();

        if (error || !data) throw new AppError('persist_failed', 'Could not save the provider.', 500);
        await audit(db, user.id, 'ai_key.upsert_provider', data.id, 'successful',
          { provider: body.provider, model: body.model });
        return json({ data });
      }

      case 'set_key': {
        const { error } = await db.rpc('admin_set_ai_provider_key', {
          p_config_id: body.config_id, p_key: body.api_key,
        });
        if (error) {
          await audit(db, user.id, 'ai_key.set', body.config_id, 'denied', { reason: 'rpc_failed' });
          throw new AppError('persist_failed', 'The key could not be stored.', 500);
        }
        await audit(db, user.id, 'ai_key.set', body.config_id, 'successful');
        // Deliberately returns no key material, not even a masked form.
        return json({ data: { config_id: body.config_id, has_key: true } });
      }

      case 'delete_key': {
        const { error } = await db.rpc('admin_delete_ai_provider_key', {
          p_config_id: body.config_id,
        });
        if (error) throw new AppError('persist_failed', 'The key could not be removed.', 500);
        await audit(db, user.id, 'ai_key.delete', body.config_id, 'successful');
        return json({ data: { config_id: body.config_id, has_key: false } });
      }

      case 'set_active': {
        const { data: cfg } = await db.from('ai_provider_config')
          .select('id, has_key').eq('id', body.config_id).maybeSingle();
        if (!cfg) throw new AppError('not_found', 'Provider configuration not found.', 404);
        if (!cfg.has_key) {
          throw new AppError('no_key', 'Add an API key before making this provider active.', 422);
        }

        // A partial unique index allows only one active row at a time.
        await db.from('ai_provider_config').update({ is_active: false }).eq('is_active', true);
        const { error } = await db.from('ai_provider_config')
          .update({ is_active: true, updated_by: user.id }).eq('id', body.config_id);
        if (error) throw new AppError('persist_failed', 'Could not switch the active provider.', 500);

        await audit(db, user.id, 'ai_key.set_active', body.config_id, 'successful');
        return json({ data: { config_id: body.config_id, is_active: true } });
      }

      case 'set_limits': {
        const patch: Record<string, unknown> = { updated_by: user.id };
        if (body.is_enabled !== undefined) patch.is_enabled = body.is_enabled;
        if (body.monthly_usage_limit !== undefined) patch.monthly_usage_limit = body.monthly_usage_limit;

        const { data, error } = await db.from('ai_provider_config')
          .update(patch).eq('id', body.config_id)
          .select('id, is_enabled, monthly_usage_limit').single();
        if (error || !data) throw new AppError('persist_failed', 'Could not update the provider.', 500);

        await audit(db, user.id, 'ai_key.set_limits', body.config_id, 'successful', patch);
        return json({ data });
      }
    }
  } catch (err) {
    if (adminId && err instanceof AppError && err.code === 'forbidden') {
      await audit(db, adminId, 'ai_key.access', null, 'denied', { reason: 'not_super_admin' });
    }
    return errorResponse(err);
  }
});
