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

SUPABASE_SERVICE_ROLE_KEY="${CANARY}" \
NEXT_PUBLIC_SUPABASE_URL="${NEXT_PUBLIC_SUPABASE_URL:-http://127.0.0.1:54331}" \
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

# Same check for the real variable name, the service-role marker and the JWT
# header every Supabase key starts with.
for pattern in 'SUPABASE_SERVICE_ROLE_KEY' 'service_role' 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'; do
  n=$(count_in "${pattern}" ".next/static")
  echo ".next/static: ${n} file(s) containing '${pattern}'"
  [ "${n}" = "0" ] || { fail=1; grep -rIl --binary-files=text -F "${pattern}" .next/static | head || true; }
done

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
  echo "FAIL: server-only material reached the client bundle."
  exit 1
fi

echo "PASS: 0 matches in .next and .next/static."
