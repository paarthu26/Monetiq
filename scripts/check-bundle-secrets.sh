#!/usr/bin/env bash
#
# Phase 2 §9 — prove no server-only secret reaches the client bundle.
#
# A canary value is placed in SUPABASE_SERVICE_ROLE_KEY, the app is built, and
# every emitted file under .next (including .next/static) is searched for it.
# The required result is 0 matches. The script fails loudly on any match.
set -euo pipefail

CANARY="MONETIQ_CANARY_$(date +%s)_do_not_ship_this_value"

echo "canary: ${CANARY}"
rm -rf .next

URL_VALUE="${NEXT_PUBLIC_SUPABASE_URL:-http://127.0.0.1:54331}"

SUPABASE_SERVICE_ROLE_KEY="${CANARY}" \
NEXT_PUBLIC_SUPABASE_URL="${URL_VALUE}" \
NEXT_PUBLIC_SUPABASE_ANON_KEY="${NEXT_PUBLIC_SUPABASE_ANON_KEY:-e2e-anon-key-not-a-secret}" \
NEXT_PUBLIC_SITE_URL="${NEXT_PUBLIC_SITE_URL:-http://127.0.0.1:3100}" \
  npx next build > /tmp/canary-build.log 2>&1 || {
    echo "BUILD FAILED"; tail -30 /tmp/canary-build.log; exit 1;
  }

fail=0

count_in() {
  # grep exits 1 when there are no matches — which is the PASSING case here.
  # Under `set -e -o pipefail` that would abort the script, so the exit code is
  # swallowed explicitly and only the match count is used.
  local n
  n=$(grep -rIl --binary-files=text -F "$1" "$2" 2>/dev/null | wc -l | tr -d ' ') || true
  echo "${n:-0}"
}

for target in .next .next/static; do
  [ -d "$target" ] || continue
  n=$(count_in "${CANARY}" "${target}")
  echo "${target}: ${n} file(s) containing the canary"
  [ "${n}" = "0" ] || { fail=1; grep -rIl --binary-files=text -F "${CANARY}" "${target}" | head || true; }
done

# Same check for the real variable name and the service-role marker.
for pattern in 'SUPABASE_SERVICE_ROLE_KEY' 'service_role'; do
  n=$(count_in "${pattern}" ".next/static")
  echo ".next/static: ${n} file(s) containing '${pattern}'"
  [ "${n}" = "0" ] || { fail=1; grep -rIl --binary-files=text -F "${pattern}" .next/static | head || true; }
done

# --- Supabase JWTs in the client bundle -------------------------------------
#
# This used to grep .next/static for the JWT header shared by every Supabase
# key and require 0 matches. That test was wrong in both directions.
#
# The ANON key is a JWT and is SUPPOSED to be in the client bundle — that is
# how a browser Supabase client authenticates, and RLS is what constrains it.
# So the check could only pass while the anon key was failing to reach the
# bundle, which is exactly the bug it should have caught: a dynamic
# `process.env[name]` lookup meant nothing was inlined, the check went green,
# and the deployed site threw "Missing NEXT_PUBLIC_SUPABASE_URL" in the
# browser.
#
# Meanwhile it proved nothing about the service-role key beyond the header,
# which every Supabase JWT shares.
#
# So: decode every JWT found and require that each one is role=anon. A
# service-role token is then caught by what it CLAIMS, not by its shape.
echo "--- decoding JWTs found in .next/static ---"
node -e '
const { readdirSync, statSync, readFileSync } = require("node:fs");
const { join } = require("node:path");
const bad = [];
const seen = new Set();
function scan(p) {
  let text;
  try { text = readFileSync(p, "utf8"); } catch { return; }
  const re = /eyJ[A-Za-z0-9_-]{8,}\.(eyJ[A-Za-z0-9_-]{8,})/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const payload = m[1];
    if (seen.has(payload)) continue;
    seen.add(payload);
    let claims;
    try { claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")); }
    catch { continue; }
    const role = claims.role ?? "(no role claim)";
    console.log("  " + p + ": role=" + role);
    if (role !== "anon") bad.push(p + " -> role=" + role);
  }
}
function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p); else scan(p);
  }
}
walk(".next/static");
if (bad.length) {
  console.error("FAIL: a non-anon JWT reached the client bundle:");
  for (const b of bad) console.error("  " + b);
  process.exit(1);
}
console.log("  (every JWT found decodes to role=anon)");
' || fail=1

# --- The inverse check ------------------------------------------------------
#
# NEXT_PUBLIC_SUPABASE_URL must actually BE in the client bundle. Its absence
# is not safety, it is a broken deployment: the browser cannot build a Supabase
# client at all, so nothing past the sign-in button works. This is the guard
# against reintroducing a dynamic env lookup.
n=$(count_in "${URL_VALUE}" ".next/static")
echo ".next/static: ${n} file(s) containing NEXT_PUBLIC_SUPABASE_URL"
if [ "${n}" = "0" ]; then
  echo "FAIL: NEXT_PUBLIC_SUPABASE_URL was not compiled into the client bundle."
  echo "      Check that lib/supabase/env.ts references process.env.NEXT_PUBLIC_*"
  echo "      as literal tokens — Next.js substitutes those textually, so a"
  echo "      computed lookup like process.env[name] is never replaced."
  fail=1
fi

# AI provider key shapes. Anchored on a realistic key body — a bare 'sk-' also
# matches minified identifiers such as `task-${id}` and is not evidence of
# anything.
count_re() {
  local n
  n=$(grep -rIlE --binary-files=text "$1" "$2" 2>/dev/null | wc -l | tr -d ' ') || true
  echo "${n:-0}"
}

for pattern in 'sk-[A-Za-z0-9_-]{20,}' 'sk-ant-[A-Za-z0-9_-]{10,}' 'AIza[A-Za-z0-9_-]{30,}'; do
  n=$(count_re "${pattern}" ".next/static")
  echo ".next/static: ${n} file(s) matching /${pattern}/"
  [ "${n}" = "0" ] || { fail=1; grep -rIlE --binary-files=text "${pattern}" .next/static | head || true; }
done

if [ "${fail}" != "0" ]; then
  # Either direction fails the build: a secret that reached the client, or a
  # public value that did not. See the specific FAIL line above.
  echo "FAIL: client bundle check did not pass — see the failure above."
  exit 1
fi

echo "PASS: no server-only material in the bundle; public config present."
