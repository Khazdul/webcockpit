#!/usr/bin/env bash
# Stage 80 part E: check the directory of shared looks on staging by hand
# (report, find, a refused take-over with a second key, delete), with a
# made-up letters-only name that is removed again at the end.
# Needs: staging deployed with migration 0009 applied, FLAG_LOOKS true there
# (wrangler.jsonc env.staging), AUTH_PEPPER set on the staging Worker.
# Each step prints the HTTP status; the expected one is in the comment.
set -u

SITE=https://staging.mumecockpit.com
NAME=Zzlookcurl            # 2-20 letters, never a real character
KEY_A=7d1b3c5e-2a4f-4b6d-8e9f-0a1b2c3d4e5f
KEY_B=8e2c4d6f-3b5a-4c7e-9f0a-1b2c3d4e5f6a
H=(-H 'Content-Type: application/json' -H 'X-WC: 1' -H "Origin: $SITE")

BODY=$(mktemp)
step() { printf '\n== %s\n' "$1"; }
code() { curl -sS -o "$BODY" -w '%{http_code}\n' "$@"; cat "$BODY" 2>/dev/null; echo; }

step "flag on? (expect \"looks\":true in flags)"
curl -sS "$SITE/api/config" | grep -o '"looks":[a-z]*'

step "1. report with key A (expect 204)"
code -X PUT "$SITE/api/look" "${H[@]}" \
  --data "{\"key\":\"$KEY_A\",\"name\":\"$NAME\",\"race\":\"elf\",\"subrace\":\"noldo\",\"sex\":\"female\",\"token\":\"elf-f-noldor\"}"

step "2. find it (expect 200 and {\"looks\":{\"zzlookcurl\":{race elf, subrace noldo, sex female, token elf-f-noldor}}})"
code -X POST "$SITE/api/look/find" "${H[@]}" --data "{\"names\":[\"$NAME\",\"Zznobodyhere\"]}"

step "3. a take-over with key B, while A's row is fresh (expect 409 {\"error\":\"look_owned\"})"
code -X PUT "$SITE/api/look" "${H[@]}" \
  --data "{\"key\":\"$KEY_B\",\"name\":\"$NAME\",\"race\":\"orc\",\"subrace\":null,\"sex\":\"male\",\"token\":null}"

step "4. validation: MUME's text as a race (expect 400)"
code -X PUT "$SITE/api/look" "${H[@]}" \
  --data "{\"key\":\"$KEY_A\",\"name\":\"$NAME\",\"race\":\"Elf\",\"subrace\":null,\"sex\":null,\"token\":null}"

step "5. without X-WC and Origin (expect 403)"
code -X POST "$SITE/api/look/find" -H 'Content-Type: application/json' --data "{\"names\":[\"$NAME\"]}"

step "6. key B's DELETE removes nothing of A's (expect 204)"
code -X DELETE "$SITE/api/look" "${H[@]}" --data "{\"key\":\"$KEY_B\"}"
code -X POST "$SITE/api/look/find" "${H[@]}" --data "{\"names\":[\"$NAME\"]}"   # still there

step "7. key A's DELETE removes it (expect 204)"
code -X DELETE "$SITE/api/look" "${H[@]}" --data "{\"key\":\"$KEY_A\"}"

step "8. gone (expect 200 and {\"looks\":{}})"
code -X POST "$SITE/api/look/find" "${H[@]}" --data "{\"names\":[\"$NAME\"]}"

rm -f "$BODY"
# Each PUT and DELETE counts against 30 an hour for its key and for this
# address; running the script a few times in an hour is fine.
