#!/bin/bash
# Finder opens this file in Terminal. Keep compatible with macOS system Bash 3.
SETUP_DIR=$(cd "$(dirname "$0")" && pwd) || exit 1
/bin/bash "$SETUP_DIR/setup.sh" "$@"
result=$?
if [ "$#" -eq 0 ] && [ -t 0 ]; then
  printf '\nPress Return to close setup. '
  read -r ignored
fi
exit "$result"
