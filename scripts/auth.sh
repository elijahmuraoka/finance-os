#!/usr/bin/env bash
# finance/scripts/auth.sh
# ─────────────────────────────────────────────────────────────────────────────
# Capture a Copilot Money bearer token and save it for the finance skill.
#
# MODES:
#   (default)         Launches a real Chromium browser window. Log in normally.
#                     Captures bearer token AND Firebase refreshToken automatically.
#                     After this, you never need to log in again.
#
#   --mode refresh    Uses stored Firebase refreshToken to get a fresh bearer token.
#                     No browser. No login. ~200ms. Used by the nightly cron.
#                     Run default mode first to seed the refresh token.
#
#   --mode headless   Legacy: reuses saved browser session state (no login needed).
#                     Replaced by --mode refresh (more reliable). Still works as fallback.
#
#   --mode manual     Prompts you to paste a token you copied from DevTools.
#                     Zero dependencies fallback.
#
#   --mode verify     Checks if the saved token is still valid.
#
# USAGE:
#   ./auth.sh                     # default: Playwright browser login (one-time setup)
#   ./auth.sh --mode refresh      # refresh token via Firebase REST (cron mode, recommended)
#   ./auth.sh --mode headless     # legacy headless browser refresh (fallback)
#   ./auth.sh --mode manual       # paste token yourself
#   ./auth.sh --mode verify       # verify saved token
#
# TOKEN LOCATION:        ~/.openclaw/secrets/copilot-token (chmod 600)
# SESSION STATE:         ~/.openclaw/secrets/copilot-browser-state/ (chmod 700)
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SKILL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
VENV_PYTHON="${SKILL_DIR}/.venv/bin/python3"
GET_TOKEN_PY="${SKILL_DIR}/scripts/get_token.py"
TOKEN_FILE="${HOME}/.openclaw/secrets/copilot-token"
REFRESH_TOKEN_FILE="${HOME}/.openclaw/secrets/copilot-refresh-token"
SESSION_STATE_DIR="${HOME}/.openclaw/secrets/copilot-browser-state"
COPILOT_GQL="https://app.copilot.money/api/graphql"
FIREBASE_API_KEY="AIzaSyAMgjkeOSkHj4J4rlswOkD16N3WQOoNPpk"
FIREBASE_TOKEN_URL="https://securetoken.googleapis.com/v1/token"
MODE="playwright"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode) MODE="$2"; shift 2 ;;
    --help|-h)
      grep '^#' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) echo "Unknown flag: $1" >&2; exit 2 ;;
  esac
done

# ── helpers ───────────────────────────────────────────────────────────────────
save_token() {
  local token="$1"
  mkdir -p "$(dirname "$TOKEN_FILE")"
  printf '%s\n' "$token" > "$TOKEN_FILE"
  chmod 600 "$TOKEN_FILE"
  echo "✓ Token saved to $TOKEN_FILE"
}

verify_token() {
  local token
  if [[ -f "$TOKEN_FILE" ]]; then
    token=$(tr -d '[:space:]' < "$TOKEN_FILE")
  elif [[ -n "${COPILOT_TOKEN:-}" ]]; then
    token="$COPILOT_TOKEN"
  else
    echo "✗ No token found. Run: ./auth.sh" >&2
    exit 1
  fi

  echo "→ Verifying token against Copilot API..."

  local response
  response=$(curl -sf \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${token}" \
    -d '{"operationName":"User","query":"query User { user { id } }","variables":{}}' \
    "$COPILOT_GQL") || {
      echo "✗ Request failed — check network or try re-running auth" >&2
      exit 1
    }

  if echo "$response" | grep -q '"errors"'; then
    echo "✗ Token rejected by Copilot API" >&2
    echo "$response" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(d.get('errors',[{}])[0].get('message','unknown error'))
" 2>/dev/null || echo "$response" >&2
    exit 1
  fi

  local name
  name=$(echo "$response" | python3 -c "
import sys, json
d = json.load(sys.stdin)
u = d.get('data',{}).get('user',{})
print('user id: ' + u.get('id','unknown'))
" 2>/dev/null || echo "unknown")

  echo "✓ Token valid — authenticated as: ${name}"
}

# ── modes ─────────────────────────────────────────────────────────────────────
case "$MODE" in
  playwright)
    echo ""
    echo "→ Launching Copilot Money login in Chromium..."
    echo "  Log in normally in the browser window that opens."
    echo "  The token will be captured automatically."
    echo ""

    if [[ ! -f "$VENV_PYTHON" ]]; then
      echo "✗ venv not found at $SKILL_DIR/.venv" >&2
      echo "  Run: python3 -m venv $SKILL_DIR/.venv && $SKILL_DIR/.venv/bin/pip install playwright" >&2
      exit 1
    fi

    # Seed session state: use persistent context so Playwright saves cookies/localStorage
    mkdir -p "$SESSION_STATE_DIR"
    chmod 700 "$SESSION_STATE_DIR"

    TOKEN=$("$VENV_PYTHON" "$GET_TOKEN_PY" \
      --mode interactive \
      --user-data-dir "$SESSION_STATE_DIR" \
      2>/dev/tty)

    if [[ -z "$TOKEN" ]]; then
      echo "✗ No token captured. Did you complete login?" >&2
      exit 1
    fi

    save_token "$TOKEN"
    echo "✓ Browser session state saved to $SESSION_STATE_DIR"
    echo ""

    # Also capture the Firebase refreshToken (long-lived — survives indefinitely)
    # Brief pause to ensure Playwright has fully flushed profile state to disk
    sleep 1
    echo "→ Extracting Firebase refreshToken from browser session..."
    GET_REFRESH_PY="${SKILL_DIR}/scripts/get_refresh_token.py"
    REFRESH_TOKEN=$("$VENV_PYTHON" "$GET_REFRESH_PY" \
      --user-data-dir "$SESSION_STATE_DIR" \
      2>/dev/null || true)

    if [[ -n "$REFRESH_TOKEN" ]]; then
      mkdir -p "$(dirname "$REFRESH_TOKEN_FILE")"
      printf '%s\n' "$REFRESH_TOKEN" > "$REFRESH_TOKEN_FILE"
      chmod 600 "$REFRESH_TOKEN_FILE"
      echo "✓ Firebase refreshToken saved to $REFRESH_TOKEN_FILE"
      echo "  Run './auth.sh --mode refresh' anytime to get a fresh token without logging in."
    else
      echo "⚠ Could not extract refreshToken (may need a moment for Firebase to initialize)."
      echo "  Run './auth.sh --mode refresh' to test. If it fails, re-run './auth.sh' once more."
    fi
    echo ""
    verify_token
    ;;

  refresh)
    # Exchange stored Firebase refreshToken for a fresh bearer token.
    # No browser, no login, ~200ms. This is the recommended cron mode.
    # Run './auth.sh' (default) first to seed the refreshToken.
    if [[ ! -f "$REFRESH_TOKEN_FILE" ]]; then
      echo "✗ No Firebase refreshToken found at $REFRESH_TOKEN_FILE" >&2
      echo "  Run './auth.sh' (headed) once to seed it, then retry." >&2
      exit 1
    fi

    REFRESH_TOKEN=$(tr -d '[:space:]' < "$REFRESH_TOKEN_FILE")
    if [[ -z "$REFRESH_TOKEN" ]]; then
      echo "✗ refreshToken file is empty. Run './auth.sh' again." >&2
      exit 1
    fi

    echo "→ Exchanging Firebase refreshToken for fresh bearer token..."
    RESPONSE=$(curl -s -X POST \
      "${FIREBASE_TOKEN_URL}?key=${FIREBASE_API_KEY}" \
      -H "Content-Type: application/x-www-form-urlencoded" \
      -d "grant_type=refresh_token&refresh_token=${REFRESH_TOKEN}" 2>&1)
    if [[ -z "$RESPONSE" ]]; then
      echo "✗ Firebase token exchange request failed (network error)" >&2
      exit 1
    fi

    # Check for error
    if echo "$RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); sys.exit(0 if 'error' not in d else 1)" 2>/dev/null; then
      # Extract id_token (= Copilot bearer token)
      NEW_TOKEN=$(echo "$RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['id_token'], end='')" 2>/dev/null)

      # Also update the stored refreshToken (Firebase may rotate it)
      NEW_REFRESH=$(echo "$RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('refresh_token',''), end='')" 2>/dev/null)
      if [[ -n "$NEW_REFRESH" && "$NEW_REFRESH" != "$REFRESH_TOKEN" ]]; then
        printf '%s\n' "$NEW_REFRESH" > "$REFRESH_TOKEN_FILE"
        chmod 600 "$REFRESH_TOKEN_FILE"
      fi

      if [[ -z "$NEW_TOKEN" ]]; then
        echo "✗ No id_token in Firebase response" >&2
        echo "$RESPONSE" >&2
        exit 1
      fi

      save_token "$NEW_TOKEN"
      verify_token
    else
      ERROR_MSG=$(echo "$RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('error',{}).get('message','unknown'))" 2>/dev/null || echo "unknown")
      echo "✗ Firebase returned error: $ERROR_MSG" >&2
      if [[ "$ERROR_MSG" == *"TOKEN_EXPIRED"* ]] || [[ "$ERROR_MSG" == *"INVALID_REFRESH_TOKEN"* ]] || [[ "$ERROR_MSG" == *"USER_DISABLED"* ]]; then
        echo "  Your session has been revoked or expired. Run './auth.sh' (headed) to re-authenticate." >&2
      fi
      exit 1
    fi
    ;;

  headless)
    # Reuse saved session state — no browser window, no login interaction.
    # Run './auth.sh' (default) first to seed the state.
    # NOTE: --mode refresh is preferred over this — it's faster and more reliable.
    if [[ ! -d "$SESSION_STATE_DIR" ]]; then
      echo "✗ No saved session state found at $SESSION_STATE_DIR" >&2
      echo "  Run './auth.sh' once (headed) to seed the state, then retry." >&2
      exit 1
    fi

    if [[ ! -f "$VENV_PYTHON" ]]; then
      echo "✗ venv not found at $SKILL_DIR/.venv" >&2
      exit 1
    fi

    TOKEN=$("$VENV_PYTHON" "$GET_TOKEN_PY" \
      --mode session \
      --user-data-dir "$SESSION_STATE_DIR" \
      --timeout-seconds 30 \
      2>/dev/null)

    if [[ -z "$TOKEN" ]]; then
      echo "✗ Headless token capture failed — session may have expired." >&2
      echo "  Run './auth.sh' (headed) to re-seed the session state." >&2
      exit 1
    fi

    save_token "$TOKEN"
    verify_token
    ;;

  manual)
    echo ""
    echo "Steps:"
    echo "  1. Open app.copilot.money (logged in)"
    echo "  2. DevTools → Network → filter 'graphql' → click any request"
    echo "  3. Headers → Authorization: Bearer <TOKEN>"
    echo "  4. Copy just the token (after 'Bearer ')"
    echo ""
    read -r -s -p "Paste token (input hidden): " TOKEN
    echo ""

    if [[ -z "$TOKEN" ]]; then
      echo "✗ Empty token. Aborted." >&2
      exit 1
    fi

    TOKEN="${TOKEN#Bearer }"
    TOKEN="${TOKEN#bearer }"
    TOKEN=$(echo "$TOKEN" | tr -d '[:space:]')

    save_token "$TOKEN"
    echo ""
    verify_token
    ;;

  verify)
    verify_token
    ;;

  *)
    echo "Unknown mode: $MODE. Valid: playwright (default), refresh, headless, manual, verify" >&2
    exit 2
    ;;
esac
