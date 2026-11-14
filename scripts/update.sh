#!/bin/bash
# Copies the newest emergency-booking*.zip from your Downloads into this project:  npm run update
# Your .git folder, node_modules, and .env files are left alone. Then publish with git add, commit, push.
# Everything runs inside main(), so the shell reads the whole script before the copy replaces this file.
set -e
main() {
cd "$(dirname "$0")/.."
Z=$(ls -t ~/Downloads/emergency-booking*.zip 2>/dev/null | head -1 || true)
if [ -z "$Z" ]; then echo "No emergency-booking zip found in Downloads. Download it first."; exit 1; fi
echo "Updating from: $Z"
TMP=$(mktemp -d)
unzip -oq "$Z" -d "$TMP"
SRC=$(dirname "$(find "$TMP" -maxdepth 3 -name package.json | head -1)")
rm -rf "$SRC/.git" "$SRC/node_modules" "$SRC/.env" "$SRC/.env.local"
cp -R "$SRC/." ./
rm -rf "$TMP"
N=$(git status --short | wc -l | tr -d ' ')
if [ "$N" = "0" ]; then echo "No changes: this project already matches that zip."; exit 0; fi
git status --short | head -15
echo "$N files changed. Publish with:"
echo '  git add -A'
echo '  git commit -m "Update site"'
echo '  git push'
}
main "$@"; exit
