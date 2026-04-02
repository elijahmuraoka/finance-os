#!/usr/bin/env bash
set -euo pipefail
TMP_FILE=$(mktemp)
echo '#!/usr/bin/env node' > "$TMP_FILE"
cat dist/cli.js >> "$TMP_FILE"
mv "$TMP_FILE" dist/cli.js
chmod +x dist/cli.js
