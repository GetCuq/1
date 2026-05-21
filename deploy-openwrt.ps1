param(
    [string]$Router = "192.168.1.1",
    [string]$User = "root",
    [string]$BinaryPath = "",
    [switch]$RestartService,
    [switch]$NoPause
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

function Pause-BeforeExit() {
    if (-not $NoPause) {
        Write-Host ""
        Read-Host "Press Enter to close this window"
    }
}

function Require-Command($name) {
    $cmd = Get-Command $name -ErrorAction SilentlyContinue
    if (-not $cmd) {
        throw "Required command not found: $name"
    }
    return $cmd.Source
}

function Resolve-RepoPath($relativePath) {
    return Join-Path $repoRoot $relativePath
}

function Copy-FileToRouter($localPath, $remotePath) {
    Write-Host "Uploading $localPath -> $remotePath"
    & $scpExe -O $localPath "${User}@${Router}:${remotePath}"
    if ($LASTEXITCODE -ne 0) {
        throw "scp failed for $localPath"
    }
}

try {
    $sshExe = Require-Command "ssh"
    $scpExe = Require-Command "scp"

    if (-not $BinaryPath) {
        $BinaryPath = Resolve-RepoPath "olcrtc-linux-arm64"
    }

    $requiredFiles = @(
        $BinaryPath,
        (Resolve-RepoPath "files\etc\init.d\olcrtc"),
        (Resolve-RepoPath "files\etc\config\olcrtc"),
        (Resolve-RepoPath "files\www\luci-static\resources\view\olcrtc\main.js"),
        (Resolve-RepoPath "files\usr\share\luci\menu.d\luci-app-olcrtc.json"),
        (Resolve-RepoPath "files\usr\share\rpcd\acl.d\luci-app-olcrtc.json")
    )

    foreach ($file in $requiredFiles) {
        if (-not (Test-Path $file)) {
            throw "Required file not found: $file"
        }
    }

    Write-Host "Deploying OlcRTC to ${User}@${Router}"
    Write-Host "Using binary: $BinaryPath"

    Copy-FileToRouter $BinaryPath "/tmp/olcrtc-linux-arm64"
    Copy-FileToRouter (Resolve-RepoPath "files\etc\init.d\olcrtc") "/tmp/olcrtc-init"
    Copy-FileToRouter (Resolve-RepoPath "files\etc\config\olcrtc") "/tmp/olcrtc-config"
    Copy-FileToRouter (Resolve-RepoPath "files\www\luci-static\resources\view\olcrtc\main.js") "/tmp/olcrtc-main.js"
    Copy-FileToRouter (Resolve-RepoPath "files\usr\share\luci\menu.d\luci-app-olcrtc.json") "/tmp/luci-app-olcrtc.json"
    Copy-FileToRouter (Resolve-RepoPath "files\usr\share\rpcd\acl.d\luci-app-olcrtc.json") "/tmp/luci-app-olcrtc-acl.json"

    $remoteInstall = @'
set -e

install -d /etc/olcrtc
install -m 755 /tmp/olcrtc-linux-arm64 /usr/bin/olcrtc
install -m 755 /tmp/olcrtc-init /etc/init.d/olcrtc
install -m 644 /tmp/olcrtc-config /etc/config/olcrtc
install -d /www/luci-static/resources/view/olcrtc
install -m 644 /tmp/olcrtc-main.js /www/luci-static/resources/view/olcrtc/main.js
install -d /usr/share/luci/menu.d
install -m 644 /tmp/luci-app-olcrtc.json /usr/share/luci/menu.d/luci-app-olcrtc.json
install -d /usr/share/rpcd/acl.d
install -m 644 /tmp/luci-app-olcrtc-acl.json /usr/share/rpcd/acl.d/luci-app-olcrtc.json
/etc/init.d/olcrtc enable
/etc/init.d/rpcd restart
/etc/init.d/uhttpd restart
'@

    if ($RestartService) {
        $remoteInstall += @'
/etc/init.d/olcrtc restart || /etc/init.d/olcrtc start
'@
    }

    $remoteInstall += @'
echo "Install completed"
'@

    Write-Host "Running remote install commands"
    & $sshExe "${User}@${Router}" $remoteInstall
    if ($LASTEXITCODE -ne 0) {
        throw "ssh install step failed"
    }

    Write-Host ""
    Write-Host "Done."
    Write-Host "Open LuCI -> Services -> OlcRTC"
}
catch {
    Write-Host ""
    Write-Host "Deployment failed:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
}
finally {
    Pause-BeforeExit
}
