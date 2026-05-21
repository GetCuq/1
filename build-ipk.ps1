param(
    [string]$BinaryPath = "",
    [string]$Architecture = "aarch64_cortex-a53",
    [string]$PackageName = "luci-app-olcrtc",
    [string]$Version = "",
    [string]$Maintainer = "GetCuq",
    [string]$Description = "LuCI app for OlcRTC universal-carrier on OpenWrt"
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

function Resolve-RepoPath($RelativePath) {
    return Join-Path $repoRoot $RelativePath
}

if (-not $BinaryPath) {
    $BinaryPath = Resolve-RepoPath "olcrtc-linux-arm64"
}

if (-not (Test-Path $BinaryPath)) {
    throw "Binary not found: $BinaryPath"
}

if (-not $Version) {
    try {
        $gitCommit = (git -C $repoRoot rev-parse --short HEAD).Trim()
    } catch {
        $gitCommit = "local"
    }
    $Version = (Get-Date -Format "yyyy.MM.dd") + "-$gitCommit"
}

$pythonScript = @'
import io
import os
import shutil
import stat
import tarfile
import time
from pathlib import Path

repo_root = Path(os.environ["REPO_ROOT"])
binary_path = Path(os.environ["BINARY_PATH"])
architecture = os.environ["PKG_ARCH"]
package_name = os.environ["PKG_NAME"]
version = os.environ["PKG_VERSION"]
maintainer = os.environ["PKG_MAINTAINER"]
description = os.environ["PKG_DESCRIPTION"]

stage_root = repo_root / ".ipk-build"
control_dir = stage_root / "control"
data_dir = stage_root / "data"
dist_dir = repo_root / "dist"

if stage_root.exists():
    shutil.rmtree(stage_root)
control_dir.mkdir(parents=True, exist_ok=True)
data_dir.mkdir(parents=True, exist_ok=True)
dist_dir.mkdir(parents=True, exist_ok=True)

def write_text(path: Path, text: str):
    path.write_text(text, encoding="utf-8", newline="\n")

def copy_file(src: Path, dst: Path):
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(src, dst)

copy_file(binary_path, data_dir / "usr/bin/olcrtc")
copy_file(repo_root / "files/etc/init.d/olcrtc", data_dir / "etc/init.d/olcrtc")
copy_file(repo_root / "files/etc/config/olcrtc", data_dir / "etc/config/olcrtc")
copy_file(repo_root / "files/usr/share/luci/menu.d/luci-app-olcrtc.json", data_dir / "usr/share/luci/menu.d/luci-app-olcrtc.json")
copy_file(repo_root / "files/usr/share/rpcd/acl.d/luci-app-olcrtc.json", data_dir / "usr/share/rpcd/acl.d/luci-app-olcrtc.json")
copy_file(repo_root / "files/www/luci-static/resources/view/olcrtc/main.js", data_dir / "www/luci-static/resources/view/olcrtc/main.js")
(data_dir / "etc/olcrtc").mkdir(parents=True, exist_ok=True)

control = f"""Package: {package_name}
Version: {version}
Depends: libc, luci-base, rpcd, uhttpd
Section: luci
Category: LuCI
Title: OlcRTC LuCI app
Architecture: {architecture}
Maintainer: {maintainer}
Description: {description}
"""

conffiles = "/etc/config/olcrtc\n"

postinst = """#!/bin/sh
[ -n "$IPKG_INSTROOT" ] || {
    /etc/init.d/olcrtc enable >/dev/null 2>&1 || true
    /etc/init.d/rpcd restart >/dev/null 2>&1 || true
    /etc/init.d/uhttpd restart >/dev/null 2>&1 || true
}
exit 0
"""

prerm = """#!/bin/sh
[ -n "$IPKG_INSTROOT" ] || {
    /etc/init.d/olcrtc stop >/dev/null 2>&1 || true
    /etc/init.d/olcrtc disable >/dev/null 2>&1 || true
}
exit 0
"""

write_text(control_dir / "control", control)
write_text(control_dir / "conffiles", conffiles)
write_text(control_dir / "postinst", postinst)
write_text(control_dir / "prerm", prerm)

def set_mode(path: Path, mode: int):
    os.chmod(path, mode)

set_mode(control_dir / "control", 0o644)
set_mode(control_dir / "conffiles", 0o644)
set_mode(control_dir / "postinst", 0o755)
set_mode(control_dir / "prerm", 0o755)

set_mode(data_dir / "usr/bin/olcrtc", 0o755)
set_mode(data_dir / "etc/init.d/olcrtc", 0o755)
set_mode(data_dir / "etc/config/olcrtc", 0o644)
set_mode(data_dir / "usr/share/luci/menu.d/luci-app-olcrtc.json", 0o644)
set_mode(data_dir / "usr/share/rpcd/acl.d/luci-app-olcrtc.json", 0o644)
set_mode(data_dir / "www/luci-static/resources/view/olcrtc/main.js", 0o644)

def add_tree_to_tar(tar: tarfile.TarFile, root: Path):
    for path in sorted(root.rglob("*")):
        arcname = path.relative_to(root).as_posix()
        tar.add(path, arcname=arcname, recursive=False)

control_tar_path = stage_root / "control.tar.gz"
data_tar_path = stage_root / "data.tar.gz"
debian_binary_path = stage_root / "debian-binary"
debian_binary_path.write_text("2.0\n", encoding="ascii", newline="\n")

with tarfile.open(control_tar_path, "w:gz", format=tarfile.GNU_FORMAT) as tf:
    for name in ["control", "conffiles", "postinst", "prerm"]:
        tf.add(control_dir / name, arcname=name, recursive=False)

with tarfile.open(data_tar_path, "w:gz", format=tarfile.GNU_FORMAT) as tf:
    add_tree_to_tar(tf, data_dir)

def ar_member(name: str, payload: bytes) -> bytes:
    if not name.endswith("/"):
        name = name + "/"
    if len(name) > 16:
        raise ValueError(f"ar member name too long: {name}")
    header = (
        name.ljust(16) +
        str(int(time.time())).ljust(12) +
        "0".ljust(6) +
        "0".ljust(6) +
        "100644".ljust(8) +
        str(len(payload)).ljust(10) +
        "`\n"
    )
    out = header.encode("ascii") + payload
    if len(payload) % 2 == 1:
        out += b"\n"
    return out

ipk_name = f"{package_name}_{version}_{architecture}.ipk"
ipk_path = dist_dir / ipk_name

with open(ipk_path, "wb") as f:
    f.write(b"!<arch>\n")
    f.write(ar_member("debian-binary", debian_binary_path.read_bytes()))
    f.write(ar_member("control.tar.gz", control_tar_path.read_bytes()))
    f.write(ar_member("data.tar.gz", data_tar_path.read_bytes()))

print(ipk_path)
'@

$env:REPO_ROOT = $repoRoot
$env:BINARY_PATH = (Resolve-Path $BinaryPath).Path
$env:PKG_ARCH = $Architecture
$env:PKG_NAME = $PackageName
$env:PKG_VERSION = $Version
$env:PKG_MAINTAINER = $Maintainer
$env:PKG_DESCRIPTION = $Description

$tmpPy = Join-Path $repoRoot ".ipk-build-script.py"
[System.IO.File]::WriteAllText($tmpPy, $pythonScript, [System.Text.UTF8Encoding]::new($false))

try {
    $built = & python $tmpPy
    if ($LASTEXITCODE -ne 0) {
        throw "Python packaging script failed"
    }
    Write-Host "Built package:"
    Write-Host $built
}
finally {
    Remove-Item $tmpPy -Force -ErrorAction SilentlyContinue
}
