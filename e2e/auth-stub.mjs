/**
 * Minimal GoTrue-compatible auth server for the Playwright suite.
 *
 * Phase 2's rule is that auth stays REAL: the app must use the actual
 * @supabase/ssr browser, server and middleware clients, real cookies and the
 * real middleware. What this process replaces is only the remote Supabase
 * Auth *service*, which this sandbox cannot reach. Nothing in `src/` knows it
 * exists — `NEXT_PUBLIC_SUPABASE_URL` simply points here.
 *
 * It implements the endpoints supabase-js actually calls, and nothing else.
 */
import { createServer } from 'node:http';

const PORT = Number(process.env.AUTH_STUB_PORT ?? 54331);

const USER_ID = '939daf79-e226-4cd0-8757-52c866e3d999';
const KNOWN = new Map([
  ['user@monetiq.test', { id: USER_ID, password: 'Password123!', confirmed: true }],
  [
    'admin@monetiq.test',
    { id: '58367972-5772-4701-9ab8-de10d1069758', password: 'Password123!', confirmed: true },
  ],
  [
    'unverified@monetiq.test',
    { id: '11111111-1111-4111-8111-111111111111', password: 'Password123!', confirmed: false },
  ],
]);

/** Sessions we have issued, so /user can be answered from the bearer token. */
const sessions = new Map();

function b64url(obj) {
  return Buffer.from(JSON.stringify(obj))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * A structurally valid JWT. supabase-js reads the claims and never verifies
 * the signature client-side, and the middleware revalidates against /user here
 * exactly as it would against the real service.
 */
function mintToken(user, ttlSeconds) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: user.id,
    email: user.email,
    aud: 'authenticated',
    role: 'authenticated',
    iat: now,
    exp: now + ttlSeconds,
    session_id: `sess-${user.id}`,
  };
  return `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(payload)}.e2e-stub-signature`;
}

function userObject(email, id, confirmed) {
  const now = new Date().toISOString();
  return {
    id,
    aud: 'authenticated',
    role: 'authenticated',
    email,
    phone: '',
    email_confirmed_at: confirmed ? now : null,
    confirmed_at: confirmed ? now : null,
    last_sign_in_at: now,
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {},
    identities: [],
    created_at: now,
    updated_at: now,
    is_anonymous: false,
  };
}

function issue(email, id, confirmed, ttlSeconds = 3600) {
  const user = userObject(email, id, confirmed);
  const access_token = mintToken(user, ttlSeconds);
  sessions.set(access_token, user);
  return {
    access_token,
    token_type: 'bearer',
    expires_in: ttlSeconds,
    expires_at: Math.floor(Date.now() / 1000) + ttlSeconds,
    refresh_token: `refresh-${id}-${Date.now()}`,
    user,
  };
}

function send(res, status, body) {
  const payload = JSON.stringify(body ?? {});
  res.writeHead(status, {
    'content-type': 'application/json',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': '*',
    'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'access-control-expose-headers': '*',
    'content-length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
  });
}

const server = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, {});

  const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`);
  const path = url.pathname.replace(/^\/auth\/v1/, '');
  const body = await readBody(req);

  // Test-only control plane, used to simulate an expired session (E2E-13).
  if (path === '/__expire' ) {
    sessions.clear();
    return send(res, 200, { cleared: true });
  }

  if (path === '/settings') {
    return send(res, 200, {
      external: { email: true, google: false },
      disable_signup: false,
      mailer_autoconfirm: false,
    });
  }

  if (path === '/token') {
    const grant = url.searchParams.get('grant_type');
    if (grant === 'refresh_token') {
      // Refresh only succeeds while the stub still holds a session.
      if (sessions.size === 0) {
        return send(res, 400, { error: 'invalid_grant', error_description: 'Invalid Refresh Token' });
      }
      return send(res, 200, issue('user@monetiq.test', USER_ID, true));
    }
    const account = KNOWN.get(String(body.email ?? '').toLowerCase());
    if (!account || account.password !== body.password) {
      return send(res, 400, {
        error: 'invalid_grant',
        error_description: 'Invalid login credentials',
        msg: 'Invalid login credentials',
      });
    }
    if (!account.confirmed) {
      return send(res, 400, {
        error: 'invalid_grant',
        error_description: 'Email not confirmed',
        msg: 'Email not confirmed',
      });
    }
    return send(res, 200, issue(body.email.toLowerCase(), account.id, true));
  }

  if (path === '/signup') {
    const email = String(body.email ?? '').toLowerCase();
    if (KNOWN.has(email)) {
      return send(res, 422, { error_code: 'user_already_exists', msg: 'User already registered' });
    }
    const id = `new-${Buffer.from(email).toString('hex').slice(0, 8)}`;
    KNOWN.set(email, { id, password: body.password, confirmed: false });
    // Confirmation required: GoTrue returns a user with no session.
    return send(res, 200, { ...userObject(email, id, false), session: null });
  }

  if (path === '/user') {
    const token = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
    const user = sessions.get(token);
    if (!user) {
      return send(res, 401, { message: 'invalid claim: missing sub claim', code: 401 });
    }
    if (req.method === 'PUT') {
      return send(res, 200, { ...user, updated_at: new Date().toISOString() });
    }
    return send(res, 200, user);
  }

  if (path === '/logout') {
    const token = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
    sessions.delete(token);
    return send(res, 204, {});
  }

  if (path === '/recover' || path === '/resend') return send(res, 200, {});

  if (path === '/authorize') {
    // Google is not enabled on the project — the app must handle this calmly.
    return send(res, 400, {
      error: 'validation_failed',
      error_description: 'Unsupported provider: provider is not enabled',
      msg: 'Unsupported provider: provider is not enabled',
    });
  }

  return send(res, 404, { message: `no stub route for ${path}` });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`auth stub listening on http://127.0.0.1:${PORT}`);
});
