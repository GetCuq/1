'use strict';
'require view';
'require uci';
'require rpc';
'require ui';

var callInitAction = rpc.declare({
    object: 'rc',
    method: 'init',
    params: [ 'name', 'action' ],
    expect: { result: 0 }
});

var callServiceList = rpc.declare({
    object: 'service',
    method: 'list',
    params: [ 'name' ],
    expect: { '': {} }
});

var callUciSet = rpc.declare({
    object: 'uci',
    method: 'set',
    params: [ 'config', 'section', 'values' ],
    expect: {}
});

var callUciCommit = rpc.declare({
    object: 'uci',
    method: 'commit',
    params: [ 'config' ],
    expect: {}
});

var callUciAdd = rpc.declare({
    object: 'uci',
    method: 'add',
    params: [ 'config', 'type' ],
    expect: { section: '' }
});

var callUciDelete = rpc.declare({
    object: 'uci',
    method: 'delete',
    params: [ 'config', 'section' ],
    expect: {}
});

var callExec = rpc.declare({
    object: 'file',
    method: 'exec',
    params: [ 'command', 'params', 'env' ],
    expect: { stdout: '' }
});

var callExecFull = rpc.declare({
    object: 'file',
    method: 'exec',
    params: [ 'command', 'params', 'env' ]
    // No `expect` — LuCI's expect with multiple keys only returns the FIRST key's
    // value (it breaks after one iteration), so {code,stdout,stderr} would return
    // just the code number, making stdout permanently inaccessible.
});

var MATRIX = {
    telemost: {
        datachannel: 'bad',
        vp8channel: 'good',
        seichannel: 'bad',
        videochannel: 'warn'
    },
    wbstream: {
        datachannel: 'warn',
        vp8channel: 'good',
        seichannel: 'good',
        videochannel: 'good'
    },
    jitsi: {
        datachannel: 'good',
        vp8channel: 'warn',
        seichannel: 'warn',
        videochannel: 'warn'
    }
};

var PROVIDER_LABELS = {
    telemost: 'Telemost',
    wbstream: 'WBStream',
    jitsi: 'Jitsi'
};

var TRANSPORT_LABELS = {
    datachannel: 'datachannel',
    vp8channel: 'vp8channel',
    seichannel: 'seichannel',
    videochannel: 'videochannel'
};

var LOGREAD_PATHS = [ '/sbin/logread', '/usr/sbin/logread', '/bin/logread' ];
var REPO_RAW = 'https://raw.githubusercontent.com/GetCuq/1/master';
var INSTALL_URL = REPO_RAW + '/install.sh';
var MANIFEST_URL = REPO_RAW + '/manifest.json';
var AUTO_UPDATE_LOG = '/etc/olcrtc/update-history.log';

var THEME = {
    page: 'padding:24px;background:linear-gradient(180deg,#f5f1e8 0%,#eee6d7 100%);min-height:100vh;color:#28323c;',
    heroTitle: 'margin:0 0 8px 0;font-size:2rem;font-weight:800;letter-spacing:-0.02em;color:#25313a;',
    heroText: 'color:#5e6b76;max-width:860px;line-height:1.5;',
    card: 'background:#fffdf8;border:1px solid #ded4c4;border-radius:18px;padding:18px;box-sizing:border-box;height:100%;box-shadow:0 14px 32px rgba(62,49,27,0.08);',
    cardTitle: 'font-size:0.74em;text-transform:uppercase;letter-spacing:0.12em;color:#7b6d58;margin-bottom:14px;font-weight:800;',
    rowLabel: 'font-weight:700;margin-bottom:5px;color:#25313a;',
    rowDesc: 'font-size:0.85em;color:#6f7a83;margin-bottom:8px;line-height:1.45;',
    input: 'width:100%;box-sizing:border-box;padding:11px 12px;border-radius:12px;border:1px solid #cbbfae;background:#fffaf0;color:#22303a;font-family:inherit;font-size:1em;box-shadow:inset 0 1px 2px rgba(53,39,17,0.05);',
    inputSelect: 'width:100%;box-sizing:border-box;padding:7px 12px;border-radius:12px;border:1px solid #cbbfae;background:#fffaf0;color:#22303a;font-family:inherit;font-size:1em;',
    inputMono: 'font-family:monospace;',
    note: 'margin-top:10px;padding:10px 12px;border-radius:12px;background:#f7f2e8;border:1px solid #ddd1c0;',
    statusGood: '#2f855a',
    statusBad: '#c53030',
    tableBorder: '#ded4c4',
    logs: 'background:linear-gradient(180deg,#24313b 0%,#1d2730 100%);color:#edf3f7;padding:14px;max-height:360px;overflow:auto;border-radius:14px;margin:0;border:1px solid #31404d;box-shadow:inset 0 1px 0 rgba(255,255,255,0.04);',
    serverCard: 'cursor:pointer;flex:1 1 220px;min-width:220px;max-width:320px;padding:12px;border:1px solid #ddd2c1;border-radius:14px;background:#fffaf2;box-shadow:0 8px 20px rgba(62,49,27,0.06);',
    serverCardActive: 'border-color:#2f855a;background:#eef9f0;box-shadow:0 10px 24px rgba(47,133,90,0.14);',
    buttonGap: 'margin-left:8px;',
    tabBar: 'display:flex;gap:10px;margin:0 0 18px 0;flex-wrap:wrap;',
    tab: 'padding:10px 14px;border-radius:999px;border:1px solid #d9cfbf;background:#f8f2e8;color:#4d5963;font-weight:700;cursor:pointer;',
    tabActive: 'background:#25313a;color:#fff;border-color:#25313a;',
    updateGrid: 'display:grid;grid-template-columns:minmax(180px, 220px) 1fr;gap:10px 16px;align-items:start;',
    codeBox: 'font-family:monospace;background:#f6eee1;padding:2px 6px;border-radius:8px;color:#5f4732;display:inline-block;',
    softPanel: 'padding:12px 14px;border-radius:14px;background:#f8f2e8;border:1px solid #ddd1c0;',
    warning: '#b7791f'
};

function execStdout(command, params, env) {
    // callExec has expect:{stdout:''} — LuCI returns the stdout string directly
    return callExec(command, params || [], env || null).then(function (res) {
        return typeof res === 'string' ? res : '';
    });
}

function execResult(command, params, env) {
    return callExecFull(command, params || [], env || null).then(function (res) {
        return {
            code: res && typeof res.code === 'number' ? res.code : 0,
            stdout: (res && typeof res.stdout === 'string') ? res.stdout : '',
            stderr: (res && typeof res.stderr === 'string') ? res.stderr : ''
        };
    });
}

function readFileText(path) {
    return execResult('/bin/cat', [ path ], null).then(function (res) {
        if (res.code !== 0) {
            throw new Error((res.stderr || 'Не удалось прочитать временный файл').trim());
        }
        return String(res.stdout || '').replace(/^\uFEFF/, '');
    });
}

function removeFile(path) {
    return execResult('/bin/rm', [ '-f', path ], null).catch(function () {
        return null;
    });
}

function shortHash(str) {
    return str ? String(str).slice(0, 12) : 'unknown';
}

function mapMachineToArch(machine) {
    switch ((machine || '').trim()) {
    case 'aarch64':
    case 'arm64':
        return 'arm64';
    case 'x86_64':
    case 'amd64':
        return 'amd64';
    default:
        return '';
    }
}

function pad2(n) {
    return n < 10 ? '0' + n : String(n);
}

function fmtDate(ts) {
    if (!ts) return '';
    var d = new Date(ts * 1000);
    return pad2(d.getDate()) + '.' + pad2(d.getMonth() + 1) + '.' + d.getFullYear() +
        ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
}

function parseRefreshMs(str) {
    var num = parseInt(str, 10);
    if (isNaN(num) || num <= 0) return 10 * 60 * 1000;
    var unit = str.replace(/[0-9]/g, '').trim().toLowerCase();
    if (unit === 's') return num * 1000;
    if (unit === 'h') return num * 3600 * 1000;
    if (unit === 'd') return num * 86400 * 1000;
    return num * 60 * 1000;
}

function refreshLabel(str) {
    var num = parseInt(str, 10);
    var unit = str.replace(/[0-9]/g, '').trim().toLowerCase();
    var names = { s: 'сек', m: 'мин', h: 'ч', d: 'д' };
    return num + ' ' + (names[unit] || 'мин');
}

function isHex64(str) {
    return /^[0-9a-fA-F]{64}$/.test(str || '');
}

function isLoopbackHost(host) {
    return host === '127.0.0.1' || host === 'localhost' || host === '::1';
}

function statusMeta(kind) {
    if (kind === 'good') return { icon: 'OK', color: '#3fb950', text: 'Работает стабильно' };
    if (kind === 'warn') return { icon: '!!', color: '#d29922', text: 'Best effort / нестабильно' };
    return { icon: 'NO', color: '#f85149', text: 'Не поддерживается' };
}

function compatibilityKind(provider, transport) {
    return (MATRIX[provider] && MATRIX[provider][transport]) || 'bad';
}

function normalizeSubscriptionText(text) {
    return String(text || '')
        .replace(/\r/g, '')
        .replace(/\s+(?=(?:olcrtc:\/\/|##(?:name|color|icon|used|available|ip|comment):|#(?:name|update|refresh|color|icon|used|available):))/g, '\n')
        .trim();
}

function readLogread(path, params) {
    return execStdout(path, params, null).then(function (stdout) {
        return stdout ? stdout : '';
    }).catch(function () {
        return '';
    });
}

function parseTransportParams(transport, paramsStr) {
    var result = {};
    if (!paramsStr) return result;

    paramsStr.split('&').forEach(function (pair) {
        var eq = pair.indexOf('=');
        if (eq < 0) return;
        var k = pair.slice(0, eq).trim();
        var v = pair.slice(eq + 1).trim();

        if (transport === 'vp8channel') {
            if (k === 'vp8-fps') result.vp8_fps = v;
            if (k === 'vp8-batch') result.vp8_batch = v;
        } else if (transport === 'seichannel') {
            if (k === 'fps') result.sei_fps = v;
            if (k === 'batch') result.sei_batch = v;
            if (k === 'frag') result.sei_frag = v;
            if (k === 'ack-ms') result.sei_ack_ms = v;
        } else if (transport === 'videochannel') {
            if (k === 'video-codec') result.video_codec = v;
            if (k === 'video-w') result.video_w = v;
            if (k === 'video-h') result.video_h = v;
            if (k === 'video-fps') result.video_fps = v;
            if (k === 'video-bitrate') result.video_bitrate = v;
            if (k === 'video-hw') result.video_hw = v;
            if (k === 'video-qr-recovery') result.video_qr_recovery = v;
            if (k === 'video-qr-size') result.video_qr_size = v;
            if (k === 'video-tile-module') result.video_tile_module = v;
            if (k === 'video-tile-rs') result.video_tile_rs = v;
        }
    });

    return result;
}

function parseOlcrtcUri(raw) {
    var uri = (raw || '').trim();
    if (uri.indexOf('olcrtc://') !== 0) return null;

    var rest = uri.slice(9);
    var qIdx = rest.indexOf('?');
    if (qIdx < 1) return null;

    var auth = rest.slice(0, qIdx);
    rest = rest.slice(qIdx + 1);

    var atIdx = rest.indexOf('@');
    var ltIdx = rest.indexOf('<');
    var transport, transportParams = {};

    if (ltIdx !== -1 && (atIdx === -1 || ltIdx < atIdx)) {
        transport = rest.slice(0, ltIdx);
        var gtIdx = rest.indexOf('>');
        if (gtIdx < 0) return null;
        transportParams = parseTransportParams(transport, rest.slice(ltIdx + 1, gtIdx));
        rest = rest.slice(gtIdx + 1);
        if (rest.charAt(0) !== '@') return null;
        rest = rest.slice(1);
    } else {
        if (atIdx < 1) return null;
        transport = rest.slice(0, atIdx);
        rest = rest.slice(atIdx + 1);
    }

    var hashIdx = rest.indexOf('#');
    if (hashIdx < 1) return null;
    var roomId = rest.slice(0, hashIdx);
    rest = rest.slice(hashIdx + 1);

    var dollarIdx = rest.indexOf('$');
    var key = dollarIdx === -1 ? rest : rest.slice(0, dollarIdx);
    var mimo = dollarIdx === -1 ? '' : rest.slice(dollarIdx + 1);

    if (['telemost', 'wbstream', 'jitsi'].indexOf(auth) === -1) return null;
    if (['datachannel', 'vp8channel', 'seichannel', 'videochannel'].indexOf(transport) === -1) return null;
    if (!isHex64(key)) return null;
    if (!roomId) return null;

    return {
        auth_provider: auth,
        transport: transport,
        room_id: roomId,
        key: key,
        mimo: mimo,
        transportParams: transportParams
    };
}

function parseSubscription(text) {
    var lines = normalizeSubscriptionText(text).split('\n');
    var sub = {
        name: '',
        update: 0,
        refresh: '10m',
        refreshMs: 10 * 60 * 1000,
        color: '',
        icon: '',
        used: '',
        available: '',
        servers: []
    };
    var cur = null;

    for (var i = 0; i < lines.length; i++) {
        var line = lines[i].trim();
        if (!line) continue;

        if (line.indexOf('##') === 0) {
            if (!cur) continue;
            var sep = line.indexOf(':', 2);
            if (sep < 0) continue;
            var lk = line.slice(2, sep).trim();
            var lv = line.slice(sep + 1).trim();
            if (lk === 'name') cur.name = lv;
            else if (lk === 'color') cur.color = lv;
            else if (lk === 'icon') cur.icon = lv;
            else if (lk === 'used') cur.used = lv;
            else if (lk === 'available') cur.available = lv;
            else if (lk === 'ip') cur.ip = lv;
            else if (lk === 'comment') cur.comment = lv;
        } else if (line.indexOf('#') === 0) {
            var sep2 = line.indexOf(':', 1);
            if (sep2 < 0) continue;
            var gk = line.slice(1, sep2).trim();
            var gv = line.slice(sep2 + 1).trim();
            if (gk === 'name') sub.name = gv;
            else if (gk === 'update') sub.update = parseInt(gv, 10) || 0;
            else if (gk === 'refresh') {
                sub.refresh = gv;
                sub.refreshMs = parseRefreshMs(gv);
            } else if (gk === 'color') sub.color = gv;
            else if (gk === 'icon') sub.icon = gv;
            else if (gk === 'used') sub.used = gv;
            else if (gk === 'available') sub.available = gv;
        } else if (line.indexOf('olcrtc://') === 0) {
            var parsed = parseOlcrtcUri(line);
            if (!parsed) continue;
            cur = {
                uri: line,
                parsed: parsed,
                name: '',
                color: '',
                icon: '',
                used: '',
                available: '',
                ip: '',
                comment: ''
            };
            sub.servers.push(cur);
        }
    }

    return sub.servers.length > 0 ? sub : null;
}

function getStatus() {
    return callServiceList('olcrtc').then(function (res) {
        var inst = (res && res.olcrtc && res.olcrtc.instances) ? res.olcrtc.instances : {};
        var running = false;
        var pid = null;

        Object.keys(inst).forEach(function (name) {
            if (inst[name].running) {
                running = true;
                pid = inst[name].pid || null;
            }
        });

        return { running: running, pid: pid };
    }).catch(function () {
        return { running: false, pid: null };
    });
}

function getLogsLegacy() {
    return execStdout('/sbin/logread', ['-e', 'olcrtc'], null)
        .then(function (stdout) {
            if (stdout) return stdout;
            return execStdout('/sbin/logread', [], null).then(function (full) {
                if (!full) return '(лог пуст)';
                var lines = full.split('\n').filter(function (line) {
                    return line.toLowerCase().indexOf('olcrtc') !== -1;
                });
                return lines.length ? lines.join('\n') : '(записей с тегом olcrtc нет)';
            });
        })
        .catch(function () {
            return '(logread недоступен)';
        });
}

function rowLegacy(label, desc, node) {
    return E('div', { style: 'margin-bottom:14px;' }, [
        E('div', { style: 'font-weight:600;margin-bottom:4px;' }, label),
        E('div', { style: 'font-size:0.85em;color:#6b7280;margin-bottom:6px;' }, desc),
        node
    ]);
}

function cardLegacy(title, nodes) {
    return E('div', {
        style: 'background:#fff;border:1px solid #d0d7de;border-radius:12px;padding:16px;box-sizing:border-box;height:100%;'
    }, [
        E('div', { style: 'font-size:0.75em;text-transform:uppercase;letter-spacing:0.08em;color:#57606a;margin-bottom:14px;font-weight:700;' }, title)
    ].concat(Array.isArray(nodes) ? nodes : [nodes]));
}

function getLogs() {
    function tryFiltered(idx) {
        if (idx >= LOGREAD_PATHS.length) return Promise.resolve('');
        return readLogread(LOGREAD_PATHS[idx], [ '-e', 'olcrtc' ]).then(function (stdout) {
            return stdout || tryFiltered(idx + 1);
        });
    }

    function tryFull(idx) {
        if (idx >= LOGREAD_PATHS.length) return Promise.resolve('');
        return readLogread(LOGREAD_PATHS[idx], [ '-n', '500' ]).then(function (stdout) {
            return stdout || tryFull(idx + 1);
        });
    }

    return tryFiltered(0).then(function (stdout) {
        if (stdout) return stdout;
        return tryFull(0).then(function (full) {
            if (!full) return '(Логи пока пусты)';
            var lines = full.split('\n').filter(function (line) {
                return line.toLowerCase().indexOf('olcrtc') !== -1;
            });
            return lines.length ? lines.join('\n') : '(Записей с отметкой olcrtc пока нет)';
        });
    }).catch(function () {
        return '(logread недоступен)';
    });
}

function row(label, desc, node) {
    return E('div', { style: 'margin-bottom:14px;' }, [
        E('div', { style: THEME.rowLabel }, label),
        E('div', { style: THEME.rowDesc }, desc),
        node
    ]);
}

function card(title, nodes) {
    return E('div', {
        style: THEME.card
    }, [
        title ? E('div', { style: THEME.cardTitle }, title) : null
    ].concat(Array.isArray(nodes) ? nodes : [nodes]).filter(Boolean));
}

return view.extend({
    _statusEl: null,
    _logsEl: null,
    _statusTimer: null,
    _logsTimer: null,
    _startBtn: null,
    _stopBtn: null,
    _providerSel: null,
    _transportSel: null,
    _roomInput: null,
    _keyInput: null,
    _vp8Section: null,
    _seiSection: null,
    _videoSection: null,
    _dataHint: null,
    _transportParamInputs: null,
    _subsContainer: null,
    _subscriptions: null,
    _selectedServer: null,
    _matrixCells: null,
    _comboNote: null,
    _updateInfoEl: null,
    _updateStatusEl: null,
    _checkUpdatesBtn: null,
    _updateAppBtn: null,
    _updateBinaryBtn: null,
    _lastCheckState: null,

    load: function () {
        return Promise.all([ uci.load('olcrtc'), getStatus() ]);
    },

    _saveField: function (key, value) {
        var vals = {};
        vals[key] = value;
        return callUciSet('olcrtc', 'config', vals)
            .then(function () { return callUciCommit('olcrtc'); })
            .catch(function (err) { console.error('[OlcRTC] UCI save error:', err); });
    },

    _saveFields: function (vals) {
        return callUciSet('olcrtc', 'config', vals)
            .then(function () { return callUciCommit('olcrtc'); })
            .catch(function (err) { console.error('[OlcRTC] UCI bulk save error:', err); });
    },

    _fetchRemoteText: function (url, extraHeaders) {
        // Use -O - (stdout) so rpcd captures the response directly.
        // Avoids writing+reading a temp file through two separate RPC calls,
        // which silently returns empty on some OpenWrt/rpcd builds.
        var args = [ '-q', '-O', '-', '--timeout=30', '--no-check-certificate', '-U', 'olcrtc-openwrt' ];
        (extraHeaders || []).forEach(function (header) {
            args.push('--header=' + header);
        });
        args.push(url);

        return execResult('/usr/bin/wget', args, null).then(function (res) {
            if (res.code !== 0) {
                throw new Error((res.stderr || res.stdout || 'wget завершился с кодом ' + res.code).trim());
            }
            var text = res.stdout || '';
            if (!text.trim()) throw new Error('Сервер вернул пустой ответ');
            return text;
        });
    },

    _fetchManifest: function () {
        return this._fetchRemoteText(MANIFEST_URL, []).then(function (text) {
            try {
                return JSON.parse(text);
            } catch (e) {
                throw new Error('Некорректный JSON в манифесте: ' + e.message);
            }
        });
    },

    _getMachineArch: function () {
        return execResult('/bin/uname', [ '-m' ], null).then(function (res) {
            return {
                machine: (res.stdout || '').trim(),
                arch: mapMachineToArch(res.stdout)
            };
        });
    },

    _getLocalAppVersion: function () {
        return Promise.all([
            readFileText('/etc/olcrtc/openwrt-app-version').catch(function () { return 'unknown'; }),
            readFileText('/etc/olcrtc/openwrt-app-revision').catch(function () { return 'unknown'; })
        ]).then(function (vals) {
            return {
                version: vals[0].trim() || 'unknown',
                revision: vals[1].trim() || 'unknown'
            };
        });
    },

    _getLocalBinarySha: function () {
        return execResult('/usr/bin/sha256sum', [ '/usr/bin/olcrtc' ], null).then(function (res) {
            if (res.code !== 0) return '';
            return (res.stdout || '').trim().split(/\s+/)[0] || '';
        }).catch(function () {
            return '';
        });
    },

    _getLocalBinaryRevision: function () {
        return readFileText('/etc/olcrtc/binary-revision').then(function (text) {
            return text.trim() || '';
        }).catch(function () { return ''; });
    },

    _setUpdateBusy: function (busy) {
        if (this._checkUpdatesBtn) this._checkUpdatesBtn.disabled = !!busy;
        if (this._updateAppBtn) this._updateAppBtn.disabled = !!busy;
        if (this._updateBinaryBtn) this._updateBinaryBtn.disabled = !!busy;
        // After releasing the busy lock, re-apply known update states
        // (so buttons that are up-to-date stay greyed out)
        if (!busy) this._applyUpdateButtonStates();
    },

    _applyUpdateButtonStates: function () {
        var s = this._lastCheckState;
        if (!s) return;
        // Disable button only when we KNOW there is no update (false).
        // null = unknown → keep enabled so user can trigger the update.
        if (this._updateAppBtn) {
            this._updateAppBtn.disabled = (s.appUpdate === false);
            this._updateAppBtn.title    = (s.appUpdate === false) ? 'Панель актуальна' : '';
        }
        if (this._updateBinaryBtn) {
            this._updateBinaryBtn.disabled = (s.binaryUpdate === false);
            this._updateBinaryBtn.title    = (s.binaryUpdate === false) ? 'Бинарник актуален' : '';
        }
    },

    _renderUpdateInfo: function (state) {
        if (!this._updateInfoEl) return;

        var binaryState = state.machine.arch && state.remote.binary_sha256
            ? (state.remote.binary_sha256[state.machine.arch] || '')
            : '';

        // Panel: compare by revision (auto-bumped on every push), fall back to version
        var appUpdate;
        if (state.local.app.revision !== 'unknown' && state.remote.app_revision) {
            appUpdate = state.local.app.revision !== state.remote.app_revision;
        } else if (state.local.app.version !== 'unknown' && state.remote.app_version) {
            appUpdate = state.local.app.version !== state.remote.app_version;
        } else {
            appUpdate = null;
        }

        // OlcRTC binary: compare by binary_revision if available, else SHA256.
        // Normalise to 7 chars — install.sh stores short SHA, autoupdate may store full SHA,
        // manifest always stores short SHA (after CI fix). startsWith comparison is robust.
        var binaryUpdate;
        if (state.local.binaryRevision && state.remote.binary_revision) {
            var localRev  = String(state.local.binaryRevision).slice(0, 7);
            var remoteRev = String(state.remote.binary_revision).slice(0, 7);
            binaryUpdate = localRev !== remoteRev;
        } else if (state.local.binarySha && binaryState) {
            binaryUpdate = state.local.binarySha.toLowerCase() !== binaryState.toLowerCase();
        } else {
            binaryUpdate = null;
        }

        this._lastCheckState = { appUpdate: appUpdate, binaryUpdate: binaryUpdate };

        // "2026.05.22.1" → "22.05.2026"
        function fmtVer(ver) {
            var m = /^(\d{4})\.(\d{2})\.(\d{2})/.exec(ver || '');
            return m ? m[3] + '.' + m[2] + '.' + m[1] : (ver || '');
        }

        // Build a row: label | current info | [arrow + new info if update]
        function infoRow(label, update, curText, newText) {
            var badge, badgeColor;
            if (update === true)       { badge = '↑'; badgeColor = THEME.warning; }
            else if (update === false) { badge = '✓'; badgeColor = THEME.statusGood; }
            else                       { badge = '?'; badgeColor = '#9aa5b4'; }

            var children = [
                E('span', { style: 'font-weight:700;min-width:72px;flex-shrink:0;color:#25313a;' }, label),
                E('span', { style: 'font-size:1.1em;font-weight:800;color:' + badgeColor + ';flex-shrink:0;' }, badge),
                E('span', { style: 'font-family:monospace;font-size:0.88em;color:#4d5963;' }, curText)
            ];
            if (update === true && newText) {
                children.push(E('span', { style: 'color:#9aa5b4;' }, '→'));
                children.push(E('span', {
                    style: 'font-family:monospace;font-size:0.88em;font-weight:700;color:' + THEME.warning + ';'
                }, newText));
            }
            return E('div', {
                style: 'display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid #ede5d5;flex-wrap:wrap;'
            }, children);
        }

        // Panel: "22.05.2026 · abc1234"
        var appCur = fmtVer(state.local.app.version) + '  ·  ' + (state.local.app.revision || '?');
        var appNew = fmtVer(state.remote.app_version) + '  ·  ' + (state.remote.app_revision || '?');

        // OlcRTC: "53e4c98 (22.05.2026)" — date shown wherever we know it
        var binDate = state.remote.binary_date ? '  (' + fmtVer(state.remote.binary_date) + ')' : '';
        var binCur = state.local.binaryRevision || shortHash(state.local.binarySha) || '?';
        if (binaryUpdate === false) binCur += binDate;   // up-to-date → current revision has this date
        var binNew = state.remote.binary_revision || shortHash(binaryState) || '?';
        if (binaryUpdate === true)  binNew += binDate;   // update available → show date for new version

        this._updateInfoEl.innerHTML = '';
        this._updateInfoEl.appendChild(E('div', {}, [
            infoRow('Панель',  appUpdate,    appCur, appNew),
            infoRow('OlcRTC', binaryUpdate, binCur, binNew)
        ]));
    },

    _setUpdateStatus: function (text, color) {
        if (!this._updateStatusEl) return;
        this._updateStatusEl.textContent = text;
        this._updateStatusEl.style.color = color || '#5e6b76';
    },

    _checkUpdates: function () {
        var self = this;
        self._setUpdateBusy(true);
        self._setUpdateStatus('Проверяю версии...', '#5e6b76');

        return Promise.all([
            self._getLocalAppVersion(),
            self._getLocalBinarySha(),
            self._getMachineArch(),
            self._fetchManifest(),
            self._getLocalBinaryRevision()
        ]).then(function (data) {
            var state = {
                local: {
                    app: data[0],
                    binarySha: data[1],
                    binaryRevision: data[4]
                },
                machine: data[2],
                remote: data[3] || {}
            };
            self._renderUpdateInfo(state);
            self._setUpdateStatus('Проверка завершена.', THEME.statusGood);
        }).catch(function (err) {
            self._setUpdateStatus('Ошибка проверки: ' + err, THEME.statusBad);
        }).finally(function () {
            self._setUpdateBusy(false);
        });
    },

    _runShellTask: function (script, okMessage) {
        var self = this;
        self._setUpdateBusy(true);
        self._setUpdateStatus('Выполняю обновление...', '#5e6b76');

        return execResult('/bin/sh', [ '-c', script ], null).then(function (res) {
            if (res.code !== 0) {
                throw new Error((res.stderr || res.stdout || 'Command failed with code ' + res.code).trim());
            }
            self._setUpdateStatus(okMessage, THEME.statusGood);
            return self._checkUpdates();
        }).catch(function (err) {
            self._setUpdateStatus('Ошибка обновления: ' + err, THEME.statusBad);
        }).finally(function () {
            self._setUpdateBusy(false);
        });
    },

    _updateApp: function () {
        // Run in background so the browser doesn't time out waiting for install.sh to finish.
        // Log is written to /tmp/olcrtc-update.log — check there if anything goes wrong.
        var self = this;
        self._setUpdateBusy(true);
        self._setUpdateStatus('Запускаю обновление в фоне...', '#5e6b76');
        var script = '( wget -qO /tmp/_olcrtc_install.sh "' + INSTALL_URL + '" && sh /tmp/_olcrtc_install.sh ) >/tmp/olcrtc-update.log 2>&1 &';
        return execResult('/bin/sh', [ '-c', script ], null).then(function () {
            self._setUpdateStatus(
                'Обновление запущено. Подождите ~30–60 сек и обновите страницу.',
                THEME.statusGood
            );
        }).catch(function (err) {
            self._setUpdateStatus('Ошибка запуска: ' + err, THEME.statusBad);
        }).finally(function () {
            self._setUpdateBusy(false);
        });
    },

    _updateBinary: function () {
        // Run in background so the browser doesn't time out while the binary downloads.
        var self = this;
        self._setUpdateBusy(true);
        self._setUpdateStatus('Запускаю обновление бинарника в фоне...', '#5e6b76');
        var lines = [
            'arch="$(uname -m)"',
            'case "$arch" in',
            '  aarch64|arm64) url="' + REPO_RAW + '/olcrtc-linux-arm64" ;;',
            '  x86_64|amd64)  url="' + REPO_RAW + '/olcrtc-linux-amd64" ;;',
            '  *) echo "Unsupported arch: $arch" >&2; exit 1 ;;',
            'esac',
            // Download to temp file first — atomic replace prevents corrupted binary on error
            'wget -q --timeout=60 --no-check-certificate -O /tmp/olcrtc.new "$url" || { rm -f /tmp/olcrtc.new; echo "Download failed" >&2; exit 1; }',
            'chmod 755 /tmp/olcrtc.new',
            'mv /tmp/olcrtc.new /usr/bin/olcrtc',
            // Save SHA256 for future update checks
            'if command -v sha256sum >/dev/null 2>&1; then sha256sum /usr/bin/olcrtc | awk \'{print $1}\' > /etc/olcrtc/olcrtc.sha256; fi',
            // Fetch manifest and save binary_revision so the next check shows "up to date"
            'manifest=$(wget -qO- --timeout=15 --no-check-certificate "' + MANIFEST_URL + '" 2>/dev/null)',
            'if [ -n "$manifest" ]; then',
            '  rev=$(printf \'%s\' "$manifest" | grep \'"binary_revision"\' | grep -o \'"[a-f0-9]*"\' | tr -d \'"\')',
            '  [ -n "$rev" ] && printf \'%s\\n\' "$rev" > /etc/olcrtc/binary-revision',
            'fi',
            // Restart only if the service was already running — don't start it if user stopped it
            'if pidof olcrtc >/dev/null 2>&1; then /etc/init.d/olcrtc restart 2>/dev/null; fi'
        ];
        var script = '(\n' + lines.join('\n') + '\n) >/tmp/olcrtc-update.log 2>&1 &';
        return execResult('/bin/sh', [ '-c', script ], null).then(function () {
            self._setUpdateStatus(
                'Обновление бинарника запущено. Подождите ~30 сек и нажмите "Проверить обновления".',
                THEME.statusGood
            );
        }).catch(function (err) {
            self._setUpdateStatus('Ошибка запуска: ' + err, THEME.statusBad);
        }).finally(function () {
            self._setUpdateBusy(false);
        });
    },

    // ── Auto-update settings ──────────────────────────────────────────────────

    _saveAutoUpdate: function (enabled, interval) {
        var self = this;
        return callUciSet('olcrtc', 'config', {
            auto_update:          enabled,
            auto_update_interval: interval
        }).then(function () {
            return callUciCommit('olcrtc');
        }).then(function () {
            // Trigger init.d reload so setup_cron() picks up the new values
            return callInitAction('olcrtc', 'reload');
        }).then(function () {
            self._setUpdateStatus('Настройки авто-обновления сохранены.', THEME.statusGood);
        }).catch(function (err) {
            self._setUpdateStatus('Ошибка сохранения: ' + err, THEME.statusBad);
        });
    },

    _loadAutoUpdateHistory: function (el) {
        execResult('/bin/cat', [ AUTO_UPDATE_LOG ], null).then(function (res) {
            var lines = (res.stdout || '').trim().split('\n').filter(Boolean).reverse();
            if (!lines.length) {
                el.textContent = 'Обновлений пока не было.';
                return;
            }
            el.innerHTML = '';
            lines.slice(0, 20).forEach(function (line) {
                el.appendChild(E('div', {
                    style: 'font-family:monospace;font-size:0.85em;padding:2px 0;border-bottom:1px solid #ede5d5;'
                }, line));
            });
        }).catch(function () {
            el.textContent = 'Лог недоступен.';
        });
    },

    // ─────────────────────────────────────────────────────────────────────────

    _updateUI: function (status) {
        if (this._statusEl) {
            this._statusEl.textContent = status.running
                ? 'Работает' + (status.pid ? ' (PID ' + status.pid + ')' : '')
                : 'Остановлен';
            this._statusEl.style.color = status.running ? THEME.statusGood : THEME.statusBad;
        }
        if (this._startBtn) this._startBtn.disabled = !!status.running;
        if (this._stopBtn) this._stopBtn.disabled = !status.running;
    },

    _stopPolling: function () {
        if (this._statusTimer) { clearInterval(this._statusTimer); this._statusTimer = null; }
        if (this._logsTimer)   { clearInterval(this._logsTimer);   this._logsTimer   = null; }
    },

    _startPolling: function () {
        var self = this;
        self._stopPolling();

        self._statusTimer = setInterval(function () {
            getStatus().then(function (status) { self._updateUI(status); });
        }, 5000);

        self._logsTimer = setInterval(function () {
            getLogs().then(function (text) {
                if (!self._logsEl) return;
                var el = self._logsEl;
                var atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
                el.textContent = text;
                if (atBottom) el.scrollTop = el.scrollHeight;
            });
        }, 10000);
    },

    _runAction: function (action) {
        var self = this;
        // Use OpenWrt's native enable/disable mechanism (symlinks in /etc/rc.d/).
        // start → enable first (so service auto-starts after reboot too), then start.
        // stop  → stop first, then disable (removes rc.d symlink → won't start at boot).
        // This prevents the service from auto-starting if the user deliberately stopped it,
        // while reload_service (triggered by UCI changes) uses pidof to avoid waking it.
        var pre  = action === 'start' ? callInitAction('olcrtc', 'enable')  : Promise.resolve();
        var post = action === 'stop'  ? callInitAction('olcrtc', 'disable') : Promise.resolve();
        return pre
            .then(function () { return callInitAction('olcrtc', action); })
            .then(function () { return post; })
            .then(function () { return ui.showModal(null, [ E('p', {}, 'Команда отправлена: ' + action) ]); })
            .then(function () { setTimeout(function () { ui.hideModal(); }, 700); })
            .then(function () { return getStatus(); })
            .then(function (status) { self._updateUI(status); })
            .catch(function (err) {
                ui.addNotification(null, E('p', {}, 'Не удалось выполнить действие: ' + err));
            });
    },

    _updateTransportVisibility: function (transport) {
        if (this._vp8Section) this._vp8Section.style.display = transport === 'vp8channel' ? '' : 'none';
        if (this._seiSection) this._seiSection.style.display = transport === 'seichannel' ? '' : 'none';
        if (this._videoSection) this._videoSection.style.display = transport === 'videochannel' ? '' : 'none';
        if (this._dataHint) this._dataHint.style.display = transport === 'datachannel' ? '' : 'none';
    },

    _updateMatrix: function (provider, transport) {
        var cells = this._matrixCells || {};
        Object.keys(cells).forEach(function (key) {
            var cell = cells[key];
            cell.style.outline = '';
            cell.style.outlineOffset = '';
        });
        var active = cells[provider + ':' + transport];
        if (active) {
            active.style.outline = '2px solid #0f766e';
            active.style.background = '#eef6ff';
            active.style.outlineOffset = '-2px';
        }

        if (this._comboNote) {
            var kind = compatibilityKind(provider, transport);
            var meta = statusMeta(kind);
            this._comboNote.textContent = meta.icon + ' ' + meta.text;
            this._comboNote.style.color = meta.color;
        }
    },

    _warnForCombo: function (provider, transport) {
        var kind = compatibilityKind(provider, transport);
        var meta = statusMeta(kind);
        return E('div', {
            style: THEME.note + 'color:' + meta.color + ';'
        }, meta.icon + ' ' + meta.text);
    },

    _collectConfig: function () {
        return {
            auth_provider: uci.get('olcrtc', 'config', 'auth_provider') || 'jitsi',
            transport: uci.get('olcrtc', 'config', 'transport') || 'datachannel',
            room_id: uci.get('olcrtc', 'config', 'room_id') || '',
            key: uci.get('olcrtc', 'config', 'key') || '',
            socks_host: uci.get('olcrtc', 'config', 'socks_host') || '127.0.0.1',
            socks_port: uci.get('olcrtc', 'config', 'socks_port') || '1080',
            socks_user: uci.get('olcrtc', 'config', 'socks_user') || '',
            socks_pass: uci.get('olcrtc', 'config', 'socks_pass') || '',
            dns: uci.get('olcrtc', 'config', 'dns') || '1.1.1.1:53',
            data_dir: uci.get('olcrtc', 'config', 'data_dir') || '/var/lib/olcrtc',
            debug: uci.get('olcrtc', 'config', 'debug') || '0',
            auto_reconnect: uci.get('olcrtc', 'config', 'auto_reconnect') || '1',
            vp8_fps: uci.get('olcrtc', 'config', 'vp8_fps') || '60',
            vp8_batch: uci.get('olcrtc', 'config', 'vp8_batch') || '64',
            sei_fps: uci.get('olcrtc', 'config', 'sei_fps') || '60',
            sei_batch: uci.get('olcrtc', 'config', 'sei_batch') || '64',
            sei_frag: uci.get('olcrtc', 'config', 'sei_frag') || '900',
            sei_ack_ms: uci.get('olcrtc', 'config', 'sei_ack_ms') || '2000',
            video_codec: uci.get('olcrtc', 'config', 'video_codec') || 'qrcode',
            video_w: uci.get('olcrtc', 'config', 'video_w') || '1920',
            video_h: uci.get('olcrtc', 'config', 'video_h') || '1080',
            video_fps: uci.get('olcrtc', 'config', 'video_fps') || '30',
            video_bitrate: uci.get('olcrtc', 'config', 'video_bitrate') || '2M',
            video_hw: uci.get('olcrtc', 'config', 'video_hw') || 'none',
            video_qr_recovery: uci.get('olcrtc', 'config', 'video_qr_recovery') || 'low',
            video_qr_size: uci.get('olcrtc', 'config', 'video_qr_size') || '0',
            video_tile_module: uci.get('olcrtc', 'config', 'video_tile_module') || '4',
            video_tile_rs: uci.get('olcrtc', 'config', 'video_tile_rs') || '20',
            ffmpeg: uci.get('olcrtc', 'config', 'ffmpeg') || 'ffmpeg',
            auto_update:          uci.get('olcrtc', 'config', 'auto_update')          || '0',
            auto_update_interval: uci.get('olcrtc', 'config', 'auto_update_interval') || '24'
        };
    },

    _applyServer: function (server, cardEl, baseStyle) {
        var self = this;
        var p = server.parsed;
        var vals = {
            auth_provider: p.auth_provider,
            transport: p.transport,
            room_id: p.room_id,
            key: p.key
        };

        Object.keys(p.transportParams || {}).forEach(function (key) {
            vals[key] = p.transportParams[key];
        });

        self._saveFields(vals).then(function () {
            if (self._providerSel) self._providerSel.value = p.auth_provider;
            if (self._transportSel) self._transportSel.value = p.transport;
            if (self._roomInput) self._roomInput.value = p.room_id;
            if (self._keyInput) self._keyInput.value = p.key;

            Object.keys(p.transportParams || {}).forEach(function (key) {
                if (self._transportParamInputs[key]) self._transportParamInputs[key].value = p.transportParams[key];
            });

            self._updateTransportVisibility(p.transport);
            self._updateMatrix(p.auth_provider, p.transport);

            if (self._selectedServer) self._selectedServer.card.style.cssText = self._selectedServer.baseStyle;
            self._selectedServer = { card: cardEl, baseStyle: baseStyle };
            cardEl.style.cssText = baseStyle + THEME.serverCardActive;
        });
    },

    _fetchSubscription: function (url) {
        var hwid = uci.get('olcrtc', 'config', 'hwid') || '';
        var headers = hwid ? [ 'X-HWID: ' + hwid ] : [];
        return this._fetchRemoteText(url, headers);
    },

    _renderSubscriptionBlock: function (entry, sub) {
        var self = this;
        entry.blockEl.innerHTML = '';

        // Prefer local refresh timestamp over server-provided #update: field.
        var updatedStr = entry.lastRefreshed
            ? fmtDate(entry.lastRefreshed)
            : (sub.update ? fmtDate(sub.update) : 'неизвестно');

        var header = [
            E('div', { style: 'font-weight:700;font-size:1.05em;margin-bottom:4px;' }, (sub.icon ? sub.icon + ' ' : '') + (sub.name || entry.url)),
            E('div', { style: 'font-size:0.82em;color:#6f7a83;margin-bottom:2px;' }, 'URL: ' + entry.url),
            E('div', { style: 'font-size:0.82em;color:#6f7a83;margin-bottom:10px;' },
                'Обновлено: ' + updatedStr)
        ];

        var wrap = E('div', { style: 'display:flex;gap:10px;flex-wrap:wrap;' }, []);
        sub.servers.forEach(function (server, idx) {
            var p = server.parsed;
            var kind = compatibilityKind(p.auth_provider, p.transport);
            var meta = statusMeta(kind);
            var title = server.name || (server.icon ? server.icon + ' ' : '') || (p.mimo ? p.mimo.split('/')[0].trim() : '');
            if (!title) title = 'Server ' + (idx + 1);
            var baseStyle = THEME.serverCard;
            var cardEl = E('div', { style: baseStyle, click: function () { self._applyServer(server, cardEl, baseStyle); } }, [
                E('div', { style: 'display:flex;justify-content:space-between;gap:8px;margin-bottom:6px;' }, [
                    E('strong', {}, title),
                    E('span', { style: 'color:' + meta.color + ';font-size:0.82em;' }, meta.icon)
                ]),
                E('div', { style: 'font-size:0.84em;color:#6f7a83;margin-bottom:3px;' }, PROVIDER_LABELS[p.auth_provider] + ' / ' + TRANSPORT_LABELS[p.transport]),
                server.comment ? E('div', { style: 'font-size:0.82em;color:#6f7a83;margin-bottom:3px;' }, server.comment) : null,
                server.ip ? E('div', { style: 'font-size:0.82em;color:#6f7a83;margin-bottom:3px;' }, 'IP: ' + server.ip) : null,
                server.available ? E('div', { style: 'font-size:0.82em;color:#6f7a83;' }, 'Available: ' + server.available) : null
            ].filter(Boolean));
            wrap.appendChild(cardEl);
        });

        var refreshBtn = E('button', {
            class: 'btn cbi-button cbi-button-action',
            style: 'margin-right:8px;',
            click: ui.createHandlerFn(this, function () {
                self._refreshSubscription(entry);
            })
        }, 'Обновить подписку');
        entry.refreshBtn = refreshBtn;   // so _refreshSubscription can update button state

        var removeBtn = E('button', {
            class: 'btn cbi-button cbi-button-remove',
            click: ui.createHandlerFn(this, function () {
                self._removeSubscription(entry.sectionName);
            })
        }, 'Удалить подписку');

        entry.blockEl.appendChild(card(null, header.concat([ wrap, E('div', { style: 'margin-top:12px;' }, [refreshBtn, removeBtn]) ])));
    },

    _refreshSubscription: function (entry) {
        var self = this;

        // Prevent concurrent fetches; show loading state
        if (entry.fetching) return Promise.resolve();
        entry.fetching = true;
        if (entry.refreshBtn) {
            entry.refreshBtn.disabled = true;
            entry.refreshBtn.textContent = '⏳ Загрузка...';
        }

        return self._fetchSubscription(entry.url).then(function (text) {
            var sub = parseSubscription(text);
            if (!sub) {
                self._showSubscriptionError(entry, 'Не удалось разобрать sub.md');
                return;
            }
            // Track when we last successfully refreshed (shown in UI instead of "неизвестно")
            entry.lastRefreshed = Math.floor(Date.now() / 1000);
            self._renderSubscriptionBlock(entry, sub);
        }).catch(function (err) {
            self._showSubscriptionError(entry, 'Ошибка загрузки: ' + err);
        }).then(function () {
            entry.fetching = false;
            // Restore button state if it's still in DOM (not replaced by re-render)
            if (entry.refreshBtn && entry.refreshBtn.isConnected) {
                entry.refreshBtn.disabled = false;
                entry.refreshBtn.textContent = 'Обновить подписку';
            }
        });
    },

    _showSubscriptionError: function (entry, message) {
        var self = this;
        var retryBtn = E('button', {
            class: 'btn cbi-button cbi-button-action',
            style: 'margin-top:10px;',
            click: ui.createHandlerFn(this, function () {
                self._refreshSubscription(entry);
            })
        }, 'Повторить');
        entry.blockEl.innerHTML = '';
        entry.blockEl.appendChild(card(null, [
            E('div', { style: 'color:#cf222e;margin-bottom:8px;' }, message),
            E('div', { style: 'font-size:0.82em;color:#6f7a83;margin-bottom:8px;' }, 'URL: ' + entry.url),
            retryBtn
        ]));
    },

    _createSubscription: function (sectionName, url) {
        var self = this;
        var blockEl = E('div', { style: 'margin-top:12px;' }, []);

        // Show loading placeholder immediately so the block appears at once (not after async fetch)
        blockEl.appendChild(E('div', {
            style: THEME.softPanel + 'color:#6f7a83;'
        }, '⏳ Загрузка подписки: ' + url));

        self._subsContainer.appendChild(blockEl);

        var entry = {
            sectionName: sectionName,
            url: url,
            blockEl: blockEl,
            lastRefreshed: 0,
            fetching: false,
            refreshBtn: null
        };

        if (!self._subscriptions) self._subscriptions = [];
        self._subscriptions.push(entry);
        self._refreshSubscription(entry);
    },

    _addSubscription: function (url) {
        var self = this;
        var existing = uci.sections('olcrtc', 'subscription').filter(function (section) {
            return section.url === url;
        })[0];

        if (existing) {
            ui.addNotification(null, E('p', {}, 'Подписка уже добавлена'));
            return;
        }

        // Show placeholder immediately — don't wait for RPC chain to finish
        var pendingEl = E('div', { style: 'margin-top:12px;' }, [
            E('div', { style: THEME.softPanel + 'color:#6f7a83;' }, '⏳ Сохранение подписки: ' + url)
        ]);
        self._subsContainer.appendChild(pendingEl);

        callUciAdd('olcrtc', 'subscription')
            .then(function (section) {
                // callUciAdd has expect:{section:''} — LuCI returns the string directly
                return callUciSet('olcrtc', section, { url: url }).then(function () {
                    return callUciCommit('olcrtc').then(function () { return section; });
                });
            })
            .then(function (sectionName) {
                pendingEl.remove();
                self._createSubscription(sectionName, url);
            })
            .catch(function (err) {
                pendingEl.remove();
                ui.addNotification(null, E('p', {}, 'Не удалось добавить подписку: ' + err));
            });
    },

    _removeSubscription: function (sectionName) {
        var self = this;
        callUciDelete('olcrtc', sectionName)
            .then(function () { return callUciCommit('olcrtc'); })
            .then(function () {
                if (!self._subscriptions) return;
                for (var i = 0; i < self._subscriptions.length; i++) {
                    if (self._subscriptions[i].sectionName === sectionName) {
                        self._subscriptions[i].blockEl.remove();
                        self._subscriptions.splice(i, 1);
                        break;
                    }
                }
            })
            .catch(function (err) {
                ui.addNotification(null, E('p', {}, 'Не удалось удалить подписку: ' + err));
            });
    },

    render: function (data) {
        var self = this;
        var cfg = self._collectConfig();
        var status = data[1];

        self._subscriptions = [];
        self._matrixCells = {};

        function textInput(key, value, placeholder, extraHandler) {
            return E('input', {
                class: 'cbi-input-text',
                type: 'text',
                value: value,
                placeholder: placeholder || '',
                style: THEME.input,
                change: function (ev) {
                    self._saveField(key, ev.target.value);
                    if (extraHandler) extraHandler(ev.target.value);
                }
            });
        }

        function numInput(key, value, placeholder, min, max) {
            return E('input', {
                class: 'cbi-input-text',
                type: 'number',
                value: value,
                placeholder: placeholder || '',
                min: String(min),
                max: String(max),
                style: THEME.input,
                change: function (ev) {
                    self._saveField(key, ev.target.value);
                }
            });
        }

        var statusEl = E('div', { style: 'font-size:1.1em;font-weight:700;margin-bottom:12px;' }, '');
        self._statusEl = statusEl;

        var startBtn = E('button', {
            class: 'btn cbi-button cbi-button-action',
            click: ui.createHandlerFn(this, function () { return self._runAction('start'); })
        }, 'Start');
        var stopBtn = E('button', {
            class: 'btn cbi-button cbi-button-remove',
            style: THEME.buttonGap,
            click: ui.createHandlerFn(this, function () { return self._runAction('stop'); })
        }, 'Stop');
        self._startBtn = startBtn;
        self._stopBtn = stopBtn;
        self._updateUI(status);

        var autoReconnectCheck = E('input', {
            type: 'checkbox',
            checked: cfg.auto_reconnect === '1' ? 'checked' : null,
            change: function (ev) {
                self._saveField('auto_reconnect', ev.target.checked ? '1' : '0');
            }
        });

        var statusCard = card('Сервис', [
            statusEl,
            E('div', { style: 'font-size:0.85em;color:#57606a;margin-bottom:12px;' },
                'Сервис запускает universal-carrier через YAML: /etc/olcrtc/client.yaml'),
            E('div', {}, [ startBtn, stopBtn ]),
            E('div', { style: 'margin-top:14px;' }, [
                row('Автопереподключение', 'Если клиент оборвётся, сервис сам поднимет его заново. Для полностью ручного режима можно отключить.', E('label', {
                    style: 'display:flex;gap:8px;align-items:center;'
                }, [ autoReconnectCheck, E('span', {}, 'Включено') ]))
            ])
        ]);

        var uriHint = E('div', { style: 'font-size:0.82em;color:#6f7a83;margin-top:6px;' },
            'Поддерживается olcrtc://... и https://... на sub.md');
        var uriInput = E('input', {
            class: 'cbi-input-text',
            type: 'text',
            placeholder: 'olcrtc://... или https://example.com/sub.md',
            style: THEME.input + THEME.inputMono,
            change: function (ev) {
                var val = (ev.target.value || '').trim();
                if (!val) return;

                if (val.indexOf('http://') === 0 || val.indexOf('https://') === 0) {
                    self._addSubscription(val);
                    ev.target.value = '';
                    return;
                }

                var parsed = parseOlcrtcUri(val);
                if (!parsed) {
                    ui.addNotification(null, E('p', {}, 'Неверный формат URI'));
                    return;
                }

                var vals = {
                    auth_provider: parsed.auth_provider,
                    transport: parsed.transport,
                    room_id: parsed.room_id,
                    key: parsed.key
                };
                Object.keys(parsed.transportParams || {}).forEach(function (k) {
                    vals[k] = parsed.transportParams[k];
                });

                self._saveFields(vals).then(function () {
                    self._providerSel.value = parsed.auth_provider;
                    self._transportSel.value = parsed.transport;
                    self._roomInput.value = parsed.room_id;
                    self._keyInput.value = parsed.key;
                    Object.keys(parsed.transportParams || {}).forEach(function (k) {
                        if (self._transportParamInputs[k]) self._transportParamInputs[k].value = parsed.transportParams[k];
                    });
                    self._updateTransportVisibility(parsed.transport);
                    self._updateMatrix(parsed.auth_provider, parsed.transport);
                    ui.addNotification(null, E('p', {}, 'Параметры из URI применены'));
                });
            }
        });

        self._subsContainer = E('div', {}, []);
        var uriCard = card('URI и подписки', [
            uriInput,
            uriHint,
            self._subsContainer
        ]);

        var providerSel = E('select', {
            class: 'cbi-input-select',
            style: THEME.inputSelect,
            change: function (ev) {
                self._saveField('auth_provider', ev.target.value);
                self._updateMatrix(ev.target.value, transportSel.value);
            }
        }, [
            E('option', { value: 'jitsi', selected: cfg.auth_provider === 'jitsi' ? '' : null }, 'Jitsi'),
            E('option', { value: 'wbstream', selected: cfg.auth_provider === 'wbstream' ? '' : null }, 'WBStream'),
            E('option', { value: 'telemost', selected: cfg.auth_provider === 'telemost' ? '' : null }, 'Telemost')
        ]);
        self._providerSel = providerSel;

        var transportSel = E('select', {
            class: 'cbi-input-select',
            style: THEME.inputSelect,
            change: function (ev) {
                self._saveField('transport', ev.target.value);
                self._updateTransportVisibility(ev.target.value);
                self._updateMatrix(providerSel.value, ev.target.value);
            }
        }, [
            E('option', { value: 'datachannel', selected: cfg.transport === 'datachannel' ? '' : null }, 'datachannel'),
            E('option', { value: 'vp8channel', selected: cfg.transport === 'vp8channel' ? '' : null }, 'vp8channel'),
            E('option', { value: 'seichannel', selected: cfg.transport === 'seichannel' ? '' : null }, 'seichannel'),
            E('option', { value: 'videochannel', selected: cfg.transport === 'videochannel' ? '' : null }, 'videochannel')
        ]);
        self._transportSel = transportSel;

        var roomInput = textInput('room_id', cfg.room_id, 'Room ID или https://host/room для Jitsi');
        var keyInput = textInput('key', cfg.key, '64 hex chars');
        self._roomInput = roomInput;
        self._keyInput = keyInput;

        var matrixTable = E('table', {
            class: 'table',
            style: 'width:100%;border-collapse:collapse;background:#fffaf2;border-radius:12px;overflow:hidden;'
        }, [
            E('tr', {}, [
                E('th', { style: 'text-align:left;padding:10px;border-bottom:1px solid ' + THEME.tableBorder + ';color:#55626d;' }, 'Transport'),
                E('th', { style: 'text-align:center;padding:10px;border-bottom:1px solid ' + THEME.tableBorder + ';color:#55626d;' }, 'Telemost'),
                E('th', { style: 'text-align:center;padding:10px;border-bottom:1px solid ' + THEME.tableBorder + ';color:#55626d;' }, 'WBStream'),
                E('th', { style: 'text-align:center;padding:10px;border-bottom:1px solid ' + THEME.tableBorder + ';color:#55626d;' }, 'Jitsi')
            ])
        ]);

        [ 'datachannel', 'vp8channel', 'seichannel', 'videochannel' ].forEach(function (transport) {
            var tr = E('tr', {}, [
                E('td', { style: 'padding:10px;border-bottom:1px solid ' + THEME.tableBorder + ';font-weight:700;color:#25313a;' }, transport)
            ]);

            [ 'telemost', 'wbstream', 'jitsi' ].forEach(function (provider) {
                var kind = compatibilityKind(provider, transport);
                var meta = statusMeta(kind);
                var td = E('td', {
                    style: 'padding:10px;border-bottom:1px solid ' + THEME.tableBorder + ';text-align:center;color:' + meta.color + ';font-weight:700;'
                }, meta.icon);
                self._matrixCells[provider + ':' + transport] = td;
                tr.appendChild(td);
            });

            matrixTable.appendChild(tr);
        });

        var comboNote = E('div', { style: THEME.note }, '');
        self._comboNote = comboNote;

        var baseCard = card('Базовые настройки', [
            row('Provider', 'Новая модель использует auth.provider вместо старого carrier.', providerSel),
            row('Transport', 'Задаёт net.transport в runtime YAML.', transportSel),
            row('Room ID', 'Для Jitsi сюда вставляется полный room URL или host/room.', roomInput),
            row('Ключ', '64-символьный hex-ключ шифрования.', keyInput),
            comboNote
        ]);

        var socksHostInput = textInput('socks_host', cfg.socks_host, '127.0.0.1');
        var socksPortInput = numInput('socks_port', cfg.socks_port, '1080', 1, 65535);
        var socksUserInput = textInput('socks_user', cfg.socks_user, '');
        var socksPassInput = textInput('socks_pass', cfg.socks_pass, '');

        var socksCard = card('SOCKS5', [
            row('Host', 'Если это не loopback, init-скрипт потребует логин и пароль.', socksHostInput),
            row('Port', 'Локальный SOCKS5 порт.', socksPortInput),
            row('User', 'Входящая SOCKS5 аутентификация.', socksUserInput),
            row('Pass', 'Пароль для SOCKS5.', socksPassInput)
        ]);

        var dnsInput = textInput('dns', cfg.dns, '1.1.1.1:53');
        var dataDirInput = textInput('data_dir', cfg.data_dir, '/var/lib/olcrtc');
        var ffmpegInput = textInput('ffmpeg', cfg.ffmpeg, 'ffmpeg');
        var debugCheck = E('input', {
            type: 'checkbox',
            checked: cfg.debug === '1' ? 'checked' : null,
            change: function (ev) {
                self._saveField('debug', ev.target.checked ? '1' : '0');
            }
        });

        var advancedCard = card('Runtime', [
            row('DNS', 'Записывается в net.dns.', dnsInput),
            row('Data dir', 'Путь для top-level data: в YAML.', dataDirInput),
            row('ffmpeg', 'Top-level ffmpeg path для videochannel.', ffmpegInput),
            row('Debug', 'Включает подробные логи.', E('label', { style: 'display:flex;gap:8px;align-items:center;' }, [ debugCheck, E('span', {}, 'debug: true') ]))
        ]);

        var vp8FpsInput = numInput('vp8_fps', cfg.vp8_fps, '60', 1, 120);
        var vp8BatchInput = numInput('vp8_batch', cfg.vp8_batch, '64', 1, 512);
        var seiFpsInput = numInput('sei_fps', cfg.sei_fps, '60', 1, 120);
        var seiBatchInput = numInput('sei_batch', cfg.sei_batch, '64', 1, 512);
        var seiFragInput = numInput('sei_frag', cfg.sei_frag, '900', 1, 65535);
        var seiAckInput = numInput('sei_ack_ms', cfg.sei_ack_ms, '2000', 1, 60000);
        var videoCodecSel = E('select', {
            class: 'cbi-input-select',
            style: THEME.inputSelect,
            change: function (ev) { self._saveField('video_codec', ev.target.value); }
        }, [
            E('option', { value: 'qrcode', selected: cfg.video_codec === 'qrcode' ? '' : null }, 'qrcode'),
            E('option', { value: 'tile', selected: cfg.video_codec === 'tile' ? '' : null }, 'tile')
        ]);
        var videoWInput = numInput('video_w', cfg.video_w, '1920', 1, 8192);
        var videoHInput = numInput('video_h', cfg.video_h, '1080', 1, 8192);
        var videoFpsInput = numInput('video_fps', cfg.video_fps, '30', 1, 120);
        var videoBitrateInput = textInput('video_bitrate', cfg.video_bitrate, '2M');
        var videoHwSel = E('select', {
            class: 'cbi-input-select',
            style: THEME.inputSelect,
            change: function (ev) { self._saveField('video_hw', ev.target.value); }
        }, [
            E('option', { value: 'none', selected: cfg.video_hw === 'none' ? '' : null }, 'none'),
            E('option', { value: 'nvenc', selected: cfg.video_hw === 'nvenc' ? '' : null }, 'nvenc')
        ]);
        var qrRecoverySel = E('select', {
            class: 'cbi-input-select',
            style: THEME.inputSelect,
            change: function (ev) { self._saveField('video_qr_recovery', ev.target.value); }
        }, [
            E('option', { value: 'low', selected: cfg.video_qr_recovery === 'low' ? '' : null }, 'low'),
            E('option', { value: 'medium', selected: cfg.video_qr_recovery === 'medium' ? '' : null }, 'medium'),
            E('option', { value: 'high', selected: cfg.video_qr_recovery === 'high' ? '' : null }, 'high'),
            E('option', { value: 'highest', selected: cfg.video_qr_recovery === 'highest' ? '' : null }, 'highest')
        ]);
        var qrSizeInput = numInput('video_qr_size', cfg.video_qr_size, '0', 0, 65535);
        var tileModuleInput = numInput('video_tile_module', cfg.video_tile_module, '4', 1, 270);
        var tileRsInput = numInput('video_tile_rs', cfg.video_tile_rs, '20', 0, 200);

        self._transportParamInputs = {
            vp8_fps: vp8FpsInput,
            vp8_batch: vp8BatchInput,
            sei_fps: seiFpsInput,
            sei_batch: seiBatchInput,
            sei_frag: seiFragInput,
            sei_ack_ms: seiAckInput,
            video_codec: videoCodecSel,
            video_w: videoWInput,
            video_h: videoHInput,
            video_fps: videoFpsInput,
            video_bitrate: videoBitrateInput,
            video_hw: videoHwSel,
            video_qr_recovery: qrRecoverySel,
            video_qr_size: qrSizeInput,
            video_tile_module: tileModuleInput,
            video_tile_rs: tileRsInput
        };

        var dataHint = E('div', { style: 'color:#57606a;' }, 'datachannel не требует дополнительных параметров.');
        self._dataHint = dataHint;

        var vp8Section = E('div', {}, [
            row('VP8 FPS', 'vp8.fps', vp8FpsInput),
            row('VP8 batch', 'vp8.batch_size', vp8BatchInput)
        ]);
        self._vp8Section = vp8Section;

        var seiSection = E('div', {}, [
            row('SEI FPS', 'sei.fps', seiFpsInput),
            row('SEI batch', 'sei.batch_size', seiBatchInput),
            row('SEI fragment size', 'sei.fragment_size', seiFragInput),
            row('SEI ack timeout', 'sei.ack_timeout_ms', seiAckInput)
        ]);
        self._seiSection = seiSection;

        var videoSection = E('div', {}, [
            row('Video codec', 'video.codec', videoCodecSel),
            row('Video width', 'video.width', videoWInput),
            row('Video height', 'video.height', videoHInput),
            row('Video FPS', 'video.fps', videoFpsInput),
            row('Video bitrate', 'video.bitrate', videoBitrateInput),
            row('Video HW', 'video.hw', videoHwSel),
            row('QR recovery', 'video.qr_recovery', qrRecoverySel),
            row('QR size', 'video.qr_size', qrSizeInput),
            row('Tile module', 'video.tile_module', tileModuleInput),
            row('Tile RS', 'video.tile_rs', tileRsInput)
        ]);
        self._videoSection = videoSection;

        var transportCard = card('Параметры транспорта', [
            dataHint,
            vp8Section,
            seiSection,
            videoSection
        ]);

        var logsEl = E('pre', {
            style: THEME.logs
        }, 'Загрузка логов...');
        self._logsEl = logsEl;
        var logsCard = card('Логи', [ logsEl ]);

        var updateInfoEl = E('div', { style: THEME.softPanel }, 'Нажми "Проверить обновление", чтобы увидеть локальную и удалённую версии.');
        var updateStatusEl = E('div', { style: 'margin-top:12px;color:#5e6b76;' }, 'Ожидает проверки.');
        var checkUpdatesBtn = E('button', {
            class: 'btn cbi-button cbi-button-action',
            click: ui.createHandlerFn(this, function () { return self._checkUpdates(); })
        }, 'Проверить обновление');
        var updateAppBtn = E('button', {
            class: 'btn cbi-button',
            style: THEME.buttonGap,
            click: ui.createHandlerFn(this, function () { return self._updateApp(); })
        }, 'Обновить панель');
        var updateBinaryBtn = E('button', {
            class: 'btn cbi-button',
            style: THEME.buttonGap,
            click: ui.createHandlerFn(this, function () { return self._updateBinary(); })
        }, 'Обновить olcrtc');

        self._updateInfoEl = updateInfoEl;
        self._updateStatusEl = updateStatusEl;
        self._checkUpdatesBtn = checkUpdatesBtn;
        self._updateAppBtn = updateAppBtn;
        self._updateBinaryBtn = updateBinaryBtn;

        // ── Auto-update UI ────────────────────────────────────────────────────
        var autoUpdateToggle = E('select', {
            class: 'cbi-input-select',
            style: 'width:auto;margin-right:10px;padding:7px 12px;font-family:inherit;font-size:1em;border-radius:12px;border:1px solid #cbbfae;background:#fffaf0;color:#22303a;'
        }, [
            E('option', { value: '0', selected: cfg.auto_update !== '1' ? 'selected' : null }, 'Выключено'),
            E('option', { value: '1', selected: cfg.auto_update === '1' ? 'selected' : null }, 'Включено')
        ]);

        var intervalOpts = [
            { v: '1',  label: 'Каждый час' },
            { v: '3',  label: 'Каждые 3 часа' },
            { v: '6',  label: 'Каждые 6 часов' },
            { v: '12', label: 'Каждые 12 часов' },
            { v: '24', label: 'Раз в сутки (03:00)' }
        ];
        var autoUpdateInterval = E('select', {
            class: 'cbi-input-select',
            style: 'width:auto;padding:7px 12px;font-family:inherit;font-size:1em;border-radius:12px;border:1px solid #cbbfae;background:#fffaf0;color:#22303a;'
        }, intervalOpts.map(function (o) {
            return E('option', {
                value: o.v,
                selected: cfg.auto_update_interval === o.v ? 'selected' : null
            }, o.label);
        }));

        var saveAutoUpdateBtn = E('button', {
            class: 'btn cbi-button cbi-button-action',
            style: 'margin-top:10px;',
            click: ui.createHandlerFn(this, function () {
                return self._saveAutoUpdate(autoUpdateToggle.value, autoUpdateInterval.value);
            })
        }, 'Сохранить настройки');

        var historyEl = E('div', {
            style: THEME.softPanel + 'margin-top:10px;min-height:32px;color:#6f7a83;'
        }, 'Нажмите «Обновить историю», чтобы загрузить.');

        var refreshHistoryBtn = E('button', {
            class: 'btn cbi-button',
            style: 'margin-top:8px;',
            click: ui.createHandlerFn(this, function () {
                historyEl.textContent = '⏳ Загрузка...';
                self._loadAutoUpdateHistory(historyEl);
            })
        }, 'Обновить историю');

        var autoUpdateSection = E('div', { style: 'margin-top:18px;padding-top:16px;border-top:1px solid #ded4c4;' }, [
            E('div', { style: THEME.cardTitle }, 'Авто-обновление olcrtc'),
            E('div', { style: THEME.rowDesc }, 'Роутер сам проверяет наличие нового бинарника и обновляется по расписанию без браузера.'),
            E('div', { style: 'display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-top:10px;' }, [
                E('span', { style: THEME.rowLabel + 'margin:0;' }, 'Режим:'),
                autoUpdateToggle,
                E('span', { style: THEME.rowLabel + 'margin:0;' }, 'Интервал:'),
                autoUpdateInterval
            ]),
            saveAutoUpdateBtn,
            E('div', { style: THEME.rowLabel + 'margin-top:16px;margin-bottom:6px;' }, 'История обновлений'),
            historyEl,
            refreshHistoryBtn
        ]);
        // ─────────────────────────────────────────────────────────────────────

        var updateCard = card('Обновление', [
            E('div', { style: THEME.rowDesc + 'margin-bottom:12px;' }, 'Проверка обновлений не пишет ничего в flash. Обновление панели перекачивает LuCI-файлы и install.sh, а обновление olcrtc заменяет только бинарник и перезапускает сервис.'),
            updateInfoEl,
            updateStatusEl,
            E('div', { style: 'margin-top:14px;' }, [ checkUpdatesBtn, updateAppBtn, updateBinaryBtn ]),
            autoUpdateSection
        ]);

        self._updateTransportVisibility(cfg.transport);
        self._updateMatrix(cfg.auth_provider, cfg.transport);
        self._startPolling();

        (uci.sections('olcrtc', 'subscription') || []).forEach(function (section) {
            if (section.url) self._createSubscription(section['.name'], section.url);
        });

        function flex(children) {
            return E('div', { style: 'display:flex;gap:16px;align-items:stretch;flex-wrap:wrap;margin-bottom:16px;' }, children);
        }

        function col(width, node) {
            return E('div', { style: 'flex:' + width + ';min-width:280px;' }, [ node ]);
        }

        var settingsAnchor = E('div', {});
        var updateAnchor = E('div', {});
        var settingsTab = E('button', {
            style: THEME.tab + THEME.tabActive,
            click: function () { settingsAnchor.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
        }, 'Настройки');
        var updatesTab = E('button', {
            style: THEME.tab,
            click: function () {
                updateAnchor.scrollIntoView({ behavior: 'smooth', block: 'start' });
                self._checkUpdates();
            }
        }, 'Обновление');

        setTimeout(function () { self._checkUpdates(); }, 0);
        return E('div', { style: THEME.page }, [
            E('div', { style: 'margin-bottom:18px;' }, [
                E('h2', { style: THEME.heroTitle }, 'OlcRTC OpenWrt'),
                E('div', { style: 'color:#57606a;' }, 'LuCI-панель для ветки universal-carrier: provider + transport + YAML runtime')
            ]),
            settingsAnchor,
            E('div', { style: THEME.tabBar }, [ settingsTab, updatesTab ]),
            flex([
                col(1, statusCard),
                col(2, uriCard)
            ]),
            flex([
                col(1, card('Совместимость', [ matrixTable ])),
                col(1, baseCard)
            ]),
            flex([
                col(1, socksCard),
                col(1, transportCard),
                col(1, advancedCard)
            ]),
            logsCard,
            updateAnchor,
            updateCard
        ]);
    },

    handleSave: function () { return Promise.resolve(); },
    handleSaveApply: function () { return Promise.resolve(); },
    handleReset: function () { return Promise.resolve(); }
});
