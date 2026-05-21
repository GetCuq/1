#!/bin/sh

set -e

REPO_OWNER="GetCuq"
REPO_NAME="1"
API_URL="https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest"
TMP_DIR="/tmp/olcrtc-install"

info() {
    echo "[OK] $*"
}

warn() {
    echo "[!!] $*"
}

error() {
    echo "[ER] $*"
    exit 1
}

need_cmd() {
    command -v "$1" >/dev/null 2>&1 || error "Required command not found: $1"
}

detect_arch() {
    local machine
    machine="$(uname -m 2>/dev/null || true)"
    case "$machine" in
        aarch64|arm64)
            OPENWRT_ARCH="aarch64_cortex-a53"
            ;;
        x86_64|amd64)
            OPENWRT_ARCH="x86_64"
            ;;
        *)
            error "Unsupported architecture: $machine"
            ;;
    esac
}

extract_asset_url() {
    local arch="$1"
    wget -qO- "$API_URL" | sed -n 's/.*"browser_download_url":[[:space:]]*"\([^"]*luci-app-olcrtc[^"]*'"${arch}"'[^"]*\.ipk\)".*/\1/p' | head -n 1
}

echo ""
echo "======================================="
echo "  OlcRTC OpenWrt installer bootstrap   "
echo "======================================="
echo ""

need_cmd wget
need_cmd opkg
need_cmd sed

detect_arch
info "Detected architecture: $OPENWRT_ARCH"

ASSET_URL="$(extract_asset_url "$OPENWRT_ARCH")"
[ -n "$ASSET_URL" ] || error "Could not find .ipk asset for architecture $OPENWRT_ARCH in latest GitHub release"

mkdir -p "$TMP_DIR"
PKG_PATH="${TMP_DIR}/luci-app-olcrtc.ipk"

info "Downloading package from release asset"
info "$ASSET_URL"
wget -q -O "$PKG_PATH" "$ASSET_URL" || error "Failed to download package"

info "Installing package via opkg"
opkg install "$PKG_PATH" || error "opkg install failed"

info "Cleaning up"
rm -rf "$TMP_DIR"

echo ""
echo "======================================="
echo "  Install completed"
echo "  Open LuCI -> Services -> OlcRTC"
echo "======================================="
echo ""
