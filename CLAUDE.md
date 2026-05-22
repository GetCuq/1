# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LuCI web UI panel for the OlcRTC peer-to-peer communication client on OpenWrt routers. The app allows users to configure and manage the `olcrtc` binary (which connects to Jitsi, Telemost, or WBStream providers) via the router's web interface.

Stack: JavaScript (LuCI/ES5), shell (procd init), PowerShell (deployment tooling), UCI (configuration system).

## Deployment Commands

### Install on router (run on the router itself)
```bash
sh -c "$(wget -qO- https://raw.githubusercontent.com/GetCuq/1/master/install.sh)"
```

### Deploy from Windows dev machine via SSH
```powershell
.\deploy-openwrt.ps1 -Router 192.168.1.1 -User root -BinaryPath .\olcrtc-linux-arm64
.\deploy-openwrt.ps1 -Router 192.168.1.1 -User root -BinaryPath .\olcrtc-linux-arm64 -RestartService
```

### Build .ipk package
```powershell
.\build-ipk.ps1 -BinaryPath .\olcrtc-linux-arm64 -Architecture aarch64_cortex-a53
# Output: dist/luci-app-olcrtc_*.ipk
```

### Service management (on router)
```bash
/etc/init.d/olcrtc start|stop|restart
logread -e olcrtc
```

## Architecture

### Data Flow
```
Browser → LuCI HTTP → rpcd (UCI/UBUS RPC layer)
    → main-v2.js (frontend, RPC calls)
    → /etc/init.d/olcrtc (shell init script)
    → /etc/olcrtc/client.yaml (generated runtime config)
    → /usr/bin/olcrtc (Go binary, peer-to-peer client)
```

### Key Files

| File | Role |
|------|------|
| `files/www/luci-static/resources/view/olcrtc/main-v2.js` | Current frontend (~3000+ lines). Handles URI parsing, UCI RPC, subscription loading, status polling, and all UI logic. |
| `files/etc/init.d/olcrtc` | procd init script. Validates UCI config, generates `/etc/olcrtc/client.yaml`, starts binary. |
| `files/etc/config/olcrtc` | UCI config template (32 options): provider, transport, room_id, key, SOCKS5, transport-specific params. |
| `files/www/luci-static/resources/view/olcrtc/main.js` | Legacy UI — do not extend, use main-v2.js. |
| `files/usr/share/luci/menu.d/luci-app-olcrtc.json` | LuCI menu registration (Services → OlcRTC). |
| `files/usr/share/rpcd/acl.d/luci-app-olcrtc.json` | RPC ACL: read (uci:olcrtc, ubus, file paths), write (uci set/commit, rc:init). |

### Provider × Transport Compatibility

The frontend (`MATRIX` object in main-v2.js) and init script enforce this:

|              | jitsi | telemost | wbstream |
|--------------|-------|----------|----------|
| datachannel  | ✅    | ❌ blocked | ⚠️ warn |
| vp8channel   | ⚠️    | ✅        | ✅       |
| seichannel   | ⚠️    | ❌ blocked | ✅       |
| videochannel | ⚠️    | ⚠️        | ✅       |

### UCI Configuration

Key options in `/etc/config/olcrtc`:
- `auth_provider`: jitsi | telemost | wbstream
- `transport`: datachannel | vp8channel | seichannel | videochannel
- `room_id`: room identifier or Jitsi URL
- `key`: 64-char hex encryption key
- `socks_host/port/user/pass`: optional SOCKS5 proxy
- Transport-specific params: `vp8_fps`, `sei_fragment_size`, `video_codec`, `video_width`, etc.

### Frontend RPC Calls (main-v2.js)

The frontend uses LuCI's `rpc.declare()` for:
- `uci.set / uci.commit / uci.add / uci.delete` — config management
- `rc.init` — start/stop service
- `service.list` — get running status + PID
- `file.exec` — run `logread`, `wget`, `sha256sum` on router

### Init Script Validations

`validate_config()` in `files/etc/init.d/olcrtc` blocks start if:
- Binary missing or not executable
- `auth_provider` or `transport` not in allowed set
- `room_id` empty
- `key` not matching `^[0-9A-Fa-f]{64}$`
- `data_dir` unset
- Blocked provider+transport combo
- SOCKS5 non-loopback host without credentials

## Testing

Manual testing requires SSH access to an OpenWrt router:

```bash
# Configure via UCI
uci set olcrtc.config.auth_provider=jitsi
uci set olcrtc.config.transport=datachannel
uci set olcrtc.config.room_id=https://meet.jit.si/testroom
uci set olcrtc.config.key=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
uci commit olcrtc

# Start and check
/etc/init.d/olcrtc start
ubus call service list '{"name":"olcrtc"}'
logread -e olcrtc | tail -30
```

For frontend changes: deploy via `deploy-openwrt.ps1`, then clear browser cache and reload the LuCI page at `http://<router>/admin/services/olcrtc`.
