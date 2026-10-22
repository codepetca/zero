#!/bin/zsh
cd -- "$(dirname -- "$0")" || exit 1
if command -v node >/dev/null 2>&1; then
  node scripts/zero-dev.mjs
elif [[ -x /opt/homebrew/bin/node ]]; then
  /opt/homebrew/bin/node scripts/zero-dev.mjs
elif [[ -x /usr/local/bin/node ]]; then
  /usr/local/bin/node scripts/zero-dev.mjs
else
  echo 'Zero Dev needs Node.js 22+ for maintainer tooling.'
  exit 1
fi
