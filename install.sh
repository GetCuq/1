#!/bin/sh

set -e

REPO_RAW="https://raw.githubusercontent.com/GetCuq/1/master"
APP_VERSION="2026.05.22.1"
APP_REVISION="2026-05-22-ui-update"
BINARY_ARM64_URL="${REPO_RAW}/olcrtc-linux-arm64"
BINARY_AMD64_URL="${REPO_RAW}/olcrtc-linux-amd64"
BINARY_DST="/usr/bin/olcrtc"
CONFIG_DIR="/etc/olcrtc"
APP_VERSION_FILE="${CONFIG_DIR}/openwrt-app-version"
APP_REVISION_FILE="${CONFIG_DIR}/openwrt-app-revision"
BINARY_SHA_FILE="${CONFIG_DIR}/olcrtc.sha256"
INITD="/etc/init.d/olcrtc"
UCI_CONF="/etc/config/olcrtc"
LUCI_MENU="/usr/share/luci/menu.d/luci-app-olcrtc.json"
LUCI_ACL="/usr/share/rpcd/acl.d/luci-app-olcrtc.json"
LUCI_VIEW_DIR="/www/luci-static/resources/view/olcrtc"
LUCI_VIEW_MAIN="${LUCI_VIEW_DIR}/main.js"
LUCI_VIEW_V2="${LUCI_VIEW_DIR}/main-v2.js"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}[OK]${NC} $*"; }
warn()  { echo -e "${YELLOW}[!!]${NC} $*"; }
error() { echo -e "${RED}[ER]${NC} $*"; exit 1; }

detect_arch() {
    local machine
    machine="$(uname -m 2>/dev/null || true)"
    case "$machine" in
        aarch64|arm64)
            ARCH_NAME="ARM64"
            BINARY_URL="$BINARY_ARM64_URL"
            ;;
        x86_64|amd64)
            ARCH_NAME="AMD64"
            BINARY_URL="$BINARY_AMD64_URL"
            ;;
        *)
            ARCH_NAME=""
            BINARY_URL=""
            ;;
    esac
}

ask_arch() {
    echo "Select architecture:"
    echo "  1) arm64  - routers on aarch64/OpenWrt"
    echo "  2) amd64  - x86-64 OpenWrt"
    printf "Your choice [1/2]: "
    read ARCH_CHOICE
    case "$ARCH_CHOICE" in
        2)
            ARCH_NAME="AMD64"
            BINARY_URL="$BINARY_AMD64_URL"
            ;;
        *)
            ARCH_NAME="ARM64"
            BINARY_URL="$BINARY_ARM64_URL"
            ;;
    esac
}

echo ""
echo "======================================="
echo "      Installing OlcRTC-OpenWRT       "
echo "======================================="
echo ""

command -v wget >/dev/null 2>&1 || error "wget not found"
command -v uci  >/dev/null 2>&1 || error "uci not found (is this OpenWrt?)"

detect_arch
if [ -z "$ARCH_NAME" ]; then
    warn "Could not auto-detect architecture from uname -m."
    ask_arch
else
    info "Detected architecture: $ARCH_NAME"
fi

info "Downloading universal-carrier binary (${ARCH_NAME})..."
wget -q -O "$BINARY_DST" "$BINARY_URL" || error "Failed to download binary from $BINARY_URL"
chmod 755 "$BINARY_DST"

info "Installing init script..."
wget -q -O "$INITD" "${REPO_RAW}/files/etc/init.d/olcrtc" || error "Failed to download init script"
chmod 755 "$INITD"
"$INITD" enable

if [ ! -f "$UCI_CONF" ]; then
    info "Creating UCI config..."
    wget -q -O "$UCI_CONF" "${REPO_RAW}/files/etc/config/olcrtc" || error "Failed to create UCI config"
else
    warn "UCI config already exists, keeping it: $UCI_CONF"
fi

mkdir -p "$CONFIG_DIR"
printf '%s\n' "$APP_VERSION" > "$APP_VERSION_FILE"
printf '%s\n' "$APP_REVISION" > "$APP_REVISION_FILE"
if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$BINARY_DST" | awk '{print $1}' > "$BINARY_SHA_FILE"
fi

HWID_CUR="$(uci get olcrtc.config.hwid 2>/dev/null || true)"
if [ -z "$HWID_CUR" ]; then
    HWID="install-$(cat /proc/sys/kernel/random/uuid | tr -d '-')"
    uci set olcrtc.config.hwid="$HWID"
    uci commit olcrtc
    info "Generated install HWID: $HWID"
else
    info "Using existing install HWID: $HWID_CUR"
fi

info "Installing LuCI menu..."
mkdir -p "$(dirname "$LUCI_MENU")"
wget -q -O "$LUCI_MENU" "${REPO_RAW}/files/usr/share/luci/menu.d/luci-app-olcrtc.json" || error "Failed to download menu file"

info "Installing rpcd ACL..."
mkdir -p "$(dirname "$LUCI_ACL")"
wget -q -O "$LUCI_ACL" "${REPO_RAW}/files/usr/share/rpcd/acl.d/luci-app-olcrtc.json" || error "Failed to download ACL file"

info "Installing LuCI frontend..."
mkdir -p "$LUCI_VIEW_DIR"
wget -q -O "$LUCI_VIEW_MAIN" "${REPO_RAW}/files/www/luci-static/resources/view/olcrtc/main.js" || error "Failed to download LuCI main.js"
wget -q -O "$LUCI_VIEW_V2" "${REPO_RAW}/files/www/luci-static/resources/view/olcrtc/main-v2.js" || error "Failed to download LuCI main-v2.js"

info "Clearing LuCI caches..."
rm -f /tmp/luci-indexcache
rm -rf /tmp/luci-modulecache/*

info "Restarting services..."
/etc/init.d/rpcd restart 2>/dev/null || warn "rpcd restart failed"
/etc/init.d/uhttpd restart 2>/dev/null || warn "uhttpd restart failed"

echo ""
echo "======================================="
echo " Installation completed"
echo ""
echo " Open LuCI -> Services -> OlcRTC"
echo " Paste an olcrtc:// URI or configure provider/room/key manually"
echo " Then press Start"
echo "======================================="
echo ""
