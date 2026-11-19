#!/usr/bin/env bash
# F5 (Q177): OwnStudio ships clangd, so C++ code tools work without a download prompt.
# Puts clangd in app/applications/electron/tools/clangd/ (the installer, #5, bundles that folder).
#   scripts/download-clangd.sh            # the pinned version, if not there yet
set -euo pipefail
version="${CLANGD_VERSION:-23.1.0}"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
dest="$here/app/applications/electron/tools/clangd"
if [ -x "$dest/bin/clangd" ] && "$dest/bin/clangd" --version | grep -q "version $version"; then
    exit 0
fi
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
echo "Downloading clangd $version…"
curl -sSfL -o "$tmp/clangd.zip" "https://github.com/clangd/clangd/releases/download/$version/clangd-linux-$version.zip"
(cd "$tmp" && unzip -q clangd.zip)
rm -rf "$dest" && mkdir -p "$(dirname "$dest")"
mv "$tmp/clangd_$version" "$dest"
"$dest/bin/clangd" --version | head -1
