#!/usr/bin/env python3
"""
Extract Firebase refreshToken from Copilot Money's IndexedDB after login.

Used by auth.sh during the headed login flow to capture a long-lived refresh
token alongside the short-lived bearer token. The refresh token can then be
exchanged against Firebase's REST API forever without a browser.

Usage (called by auth.sh after login):
    python3 get_refresh_token.py --user-data-dir <path>

Outputs the refreshToken to stdout (no newline).
Exits 0 on success, 1 on failure (with reason on stderr).
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

# Firebase stores auth state in IndexedDB under the key:
# firebaseLocalStorageDb / firebaseLocalStorage / firebase:authUser:<API_KEY>:<APP_NAME>
# In Playwright's persistent context, IndexedDB is written to leveldb files.
# We read it using the playwright API within a running browser context.

from playwright.sync_api import sync_playwright


def extract_refresh_token(user_data_dir: str) -> str | None:
    """Launch a minimal headless context, navigate to copilot, read IndexedDB."""
    with sync_playwright() as p:
        context = p.chromium.launch_persistent_context(
            user_data_dir,
            headless=True,
            viewport={"width": 1, "height": 1},
        )
        page = context.new_page()

        # Navigate to app so the Firebase SDK initializes and hydrates from IndexedDB.
        # Use "load" (not "domcontentloaded") so the JS bundle has executed and Firebase
        # has had a chance to begin its IndexedDB hydration before we start polling.
        try:
            page.goto("https://app.copilot.money/", wait_until="load", timeout=30_000)
        except Exception:
            # Timeout or navigation error — still try to read IndexedDB
            pass

        # Give Firebase a moment to hydrate from IndexedDB after page load
        page.wait_for_timeout(1500)

        # Poll for up to 15s (60 * 250ms) for the refreshToken to appear
        refresh_token: str | None = None
        for _ in range(60):
            result = page.evaluate("""
                async () => {
                    try {
                        // Firebase v9 stores in IndexedDB: firebaseLocalStorageDb
                        return await new Promise((resolve, reject) => {
                            const req = indexedDB.open('firebaseLocalStorageDb');
                            req.onerror = () => reject('open failed');
                            req.onsuccess = (e) => {
                                const db = e.target.result;
                                const tx = db.transaction('firebaseLocalStorage', 'readonly');
                                const store = tx.objectStore('firebaseLocalStorage');
                                const all = store.getAll();
                                all.onsuccess = (ev) => {
                                    const items = ev.target.result;
                                    for (const item of items) {
                                        const val = item.value;
                                        if (val && val.stsTokenManager && val.stsTokenManager.refreshToken) {
                                            resolve(val.stsTokenManager.refreshToken);
                                            return;
                                        }
                                        // Also check top-level refreshToken
                                        if (val && val.refreshToken) {
                                            resolve(val.refreshToken);
                                            return;
                                        }
                                    }
                                    resolve(null);
                                };
                                all.onerror = () => reject('getAll failed');
                            };
                        });
                    } catch (e) {
                        return null;
                    }
                }
            """)
            if result:
                refresh_token = str(result)
                break
            page.wait_for_timeout(250)

        context.close()
        return refresh_token


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Extract Firebase refreshToken from Copilot Money IndexedDB."
    )
    parser.add_argument(
        "--user-data-dir",
        required=True,
        help="Playwright Chromium user-data-dir path (same as used for login).",
    )
    args = parser.parse_args()

    user_data_dir = str(Path(args.user_data_dir).expanduser())
    if not Path(user_data_dir).exists():
        print(f"user-data-dir not found: {user_data_dir}", file=sys.stderr)
        return 1

    token = extract_refresh_token(user_data_dir)
    if not token:
        print(
            "No refreshToken found in IndexedDB. "
            "Make sure you completed a full login with --user-data-dir set.",
            file=sys.stderr,
        )
        return 1

    sys.stdout.write(token)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
