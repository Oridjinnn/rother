#!/usr/bin/env bash
# Downloads a Node.js binary matching the host platform and places it as the
# Tauri external sidecar binary (src-tauri/binaries/node-<target-triple>[.exe]).
# Tauri requires a binary whose name matches the build target triple, so each
# CI runner fetches its own. Must run before `tauri build`.
set -euo pipefail

NODE_VERSION="22.23.1"
OUT_DIR="src-tauri/binaries"
mkdir -p "$OUT_DIR"

OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS" in
  Linux)
    if [ "$ARCH" = "aarch64" ]; then
      TRIPLE="aarch64-unknown-linux-gnu"; SUB="linux-arm64"
    else
      TRIPLE="x86_64-unknown-linux-gnu"; SUB="linux-x64"
    fi
    URL="https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-${SUB}.tar.xz"
    curl -fsSL "$URL" -o /tmp/node.tar.xz
    tar -xf /tmp/node.tar.xz -C /tmp
    cp "/tmp/node-v${NODE_VERSION}-${SUB}/bin/node" "$OUT_DIR/node-$TRIPLE"
    ;;
  Darwin)
    if [ "$ARCH" = "arm64" ]; then
      TRIPLE="aarch64-apple-darwin"; SUB="darwin-arm64"
    else
      TRIPLE="x86_64-apple-darwin"; SUB="darwin-x64"
    fi
    URL="https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-${SUB}.tar.gz"
    curl -fsSL "$URL" -o /tmp/node.tar.gz
    tar -xf /tmp/node.tar.gz -C /tmp
    cp "/tmp/node-v${NODE_VERSION}-${SUB}/bin/node" "$OUT_DIR/node-$TRIPLE"
    # Universal macOS builds (tauri target "universal-apple-darwin") need BOTH
    # sidecars present. When building universal, fetch the other arch too.
    if [ "${TAURI_BUILD_TARGET:-}" = "universal-apple-darwin" ] || [ "${ROHER_BUILD_UNIVERSAL:-}" = "1" ]; then
      case "$TRIPLE" in
        aarch64-apple-darwin) OTHER="x86_64-apple-darwin"; OSUB="darwin-x64" ;;
        x86_64-apple-darwin)   OTHER="aarch64-apple-darwin"; OSUB="darwin-arm64" ;;
      esac
      if [ ! -f "$OUT_DIR/node-$OTHER" ]; then
        curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-${OSUB}.tar.gz" -o /tmp/node.tar.gz
        tar -xf /tmp/node.tar.gz -C /tmp
        cp "/tmp/node-v${NODE_VERSION}-${OSUB}/bin/node" "$OUT_DIR/node-$OTHER"
      fi
    fi
    ;;
  MINGW* | MSYS* | CYGWIN* | Windows_NT)
    TRIPLE="x86_64-pc-windows-msvc"
    URL="https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-win-x64.zip"
    curl -fsSL "$URL" -o /tmp/node.zip
    (cd /tmp && unzip -oq node.zip)
    cp "/tmp/node-v${NODE_VERSION}-win-x64/node.exe" "$OUT_DIR/node-$TRIPLE.exe"
    ;;
  *)
    echo "Unsupported OS: $OS" >&2
    exit 1
    ;;
esac

chmod +x "$OUT_DIR/node-$TRIPLE" 2>/dev/null || true
echo "Prepared node sidecar at $OUT_DIR/node-$TRIPLE"
