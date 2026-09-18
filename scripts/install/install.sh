#!/bin/sh
# WrongStack standalone installer (Linux, macOS).
#
#   curl -fsSL https://github.com/WrongStack/WrongStack/releases/latest/download/install.sh | sh
#
# Environment:
#   WSTACK_VERSION      release to install, e.g. 1.0.21 (default: latest)
#   WSTACK_INSTALL_DIR  target directory (default: ~/.wrongstack/bin)
#   WSTACK_DOWNLOAD_BASE  mirror serving the release assets (overrides the version URL)
#
# Downloads the single self-contained executable for this platform, verifies
# it against the release's SHA256SUMS and installs it as `wstack` with a
# `wrongstack` alias. No Node.js or npm is required.
set -eu

REPO="WrongStack/WrongStack"
INSTALL_DIR="${WSTACK_INSTALL_DIR:-$HOME/.wrongstack/bin}"

fail() {
  printf 'wstack install: %s\n' "$1" >&2
  exit 1
}

need() {
  command -v "$1" >/dev/null 2>&1 || fail "'$1' is required"
}

need uname
need mkdir
need chmod

os=$(uname -s)
arch=$(uname -m)
case "$os" in
  Linux) os=linux ;;
  Darwin) os=darwin ;;
  *) fail "unsupported OS: $os (Windows: use install.ps1)" ;;
esac
case "$arch" in
  x86_64 | amd64) arch=x64 ;;
  aarch64 | arm64) arch=arm64 ;;
  *) fail "unsupported architecture: $arch" ;;
esac

# Rosetta: an x64 shell on Apple silicon should still get the native build.
if [ "$os" = darwin ] && [ "$arch" = x64 ] && [ "$(sysctl -n sysctl.proc_translated 2>/dev/null || echo 0)" = 1 ]; then
  arch=arm64
fi

libc=""
if [ "$os" = linux ]; then
  if ls /lib/ld-musl-* >/dev/null 2>&1 || (ldd --version 2>&1 | grep -qi musl); then
    libc="-musl"
  fi
fi

asset="wstack-${os}-${arch}${libc}"
if [ -n "${WSTACK_DOWNLOAD_BASE:-}" ]; then
  base="${WSTACK_DOWNLOAD_BASE%/}"
elif [ -n "${WSTACK_VERSION:-}" ]; then
  base="https://github.com/${REPO}/releases/download/v${WSTACK_VERSION#v}"
else
  base="https://github.com/${REPO}/releases/latest/download"
fi

if command -v curl >/dev/null 2>&1; then
  fetch() { curl -fsSL --retry 3 -o "$2" "$1"; }
elif command -v wget >/dev/null 2>&1; then
  fetch() { wget -q -O "$2" "$1"; }
else
  fail "curl or wget is required"
fi

if command -v sha256sum >/dev/null 2>&1; then
  sha256() { sha256sum "$1" | cut -d' ' -f1; }
elif command -v shasum >/dev/null 2>&1; then
  sha256() { shasum -a 256 "$1" | cut -d' ' -f1; }
else
  fail "sha256sum or shasum is required to verify the download"
fi

tmp=$(mktemp -d 2>/dev/null || mktemp -d -t wstack)
trap 'rm -rf "$tmp"' EXIT INT TERM

printf 'Downloading %s...\n' "$asset"
fetch "$base/$asset" "$tmp/$asset" || fail "download failed: $base/$asset"
fetch "$base/SHA256SUMS" "$tmp/SHA256SUMS" || fail "download failed: $base/SHA256SUMS"

expected=$(awk -v name="$asset" '$2 == name || $2 == "*"name { print $1 }' "$tmp/SHA256SUMS")
[ -n "$expected" ] || fail "SHA256SUMS has no entry for $asset"
actual=$(sha256 "$tmp/$asset")
[ "$expected" = "$actual" ] || fail "checksum mismatch for $asset"

mkdir -p "$INSTALL_DIR"
chmod 755 "$tmp/$asset"
if [ "$os" = darwin ]; then
  # Ad-hoc sign so Gatekeeper runs it; clear any quarantine flag.
  command -v codesign >/dev/null 2>&1 && codesign --force --sign - "$tmp/$asset" >/dev/null 2>&1 || true
  command -v xattr >/dev/null 2>&1 && xattr -d com.apple.quarantine "$tmp/$asset" >/dev/null 2>&1 || true
fi
# Rename into place: a running wstack keeps its old inode.
mv -f "$tmp/$asset" "$INSTALL_DIR/wstack"
ln -sf wstack "$INSTALL_DIR/wrongstack"

if [ -n "$libc" ] && ! ls /usr/lib/libstdc++.so.6 /lib/libstdc++.so.6 >/dev/null 2>&1; then
  # Bun's musl runtime links the C++ runtime dynamically.
  printf '\nThis musl build needs libstdc++ and libgcc. On Alpine: apk add libstdc++ libgcc\n' >&2
fi

version=$("$INSTALL_DIR/wstack" version 2>/dev/null | head -n 1 || true)
printf '\nInstalled %s → %s/wstack\n' "${version:-wstack}" "$INSTALL_DIR"

case ":$PATH:" in
  *":$INSTALL_DIR:"*) ;;
  *)
    shell_name=$(basename "${SHELL:-sh}")
    case "$shell_name" in
      zsh) rc="$HOME/.zshrc" ;;
      bash) rc="$HOME/.bashrc" ;;
      fish) rc="$HOME/.config/fish/config.fish" ;;
      *) rc="$HOME/.profile" ;;
    esac
    printf '\n%s is not on your PATH. Add it with:\n' "$INSTALL_DIR"
    if [ "$shell_name" = fish ]; then
      printf '  fish_add_path %s\n' "$INSTALL_DIR"
    else
      printf '  echo '\''export PATH="%s:$PATH"'\'' >> %s\n' "$INSTALL_DIR" "$rc"
    fi
    ;;
esac

# Another wstack earlier on PATH (an old npm/pnpm/bun global) would keep
# running instead of this one.
found=$(command -v wstack 2>/dev/null || true)
if [ -n "$found" ] && [ "$found" != "$INSTALL_DIR/wstack" ]; then
  printf '\nAnother wstack is earlier on your PATH and will run instead: %s\n' "$found" >&2
  printf 'Remove it with whichever applies: npm uninstall -g wrongstack; pnpm remove -g wrongstack; bun remove -g wrongstack\n' >&2
fi
printf '\nUpdate later with: wstack update\n'
