#!/bin/sh

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info() { echo -e "${GREEN}[OK]${NC} $*"; }
warn() { echo -e "${YELLOW}[!!]${NC} $*"; }

echo ""
echo "======================================="
echo "      Removing OlcRTC-OpenWRT         "
echo "======================================="
echo ""

if [ -f /etc/init.d/olcrtc ]; then
    /etc/init.d/olcrtc stop 2>/dev/null || true
    /etc/init.d/olcrtc disable 2>/dev/null || true
    rm -f /etc/init.d/olcrtc
    info "Removed init script"
fi

rm -f /usr/bin/olcrtc && info "Removed binary" || true
rm -f /etc/config/olcrtc && info "Removed UCI config" || true
rm -f /usr/share/luci/menu.d/luci-app-olcrtc.json && info "Removed LuCI menu" || true
rm -f /usr/share/rpcd/acl.d/luci-app-olcrtc.json && info "Removed ACL" || true
rm -rf /www/luci-static/resources/view/olcrtc && info "Removed LuCI view" || true
rm -rf /etc/olcrtc && info "Removed runtime YAML directory" || true

/etc/init.d/rpcd restart 2>/dev/null || warn "rpcd restart failed"
/etc/init.d/uhttpd restart 2>/dev/null || warn "uhttpd restart failed"

echo ""
echo "======================================="
echo " Removal completed"
echo "======================================="
echo ""
