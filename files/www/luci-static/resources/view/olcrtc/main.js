'use strict';
'require view';
'require uci';
'require rpc';
'require ui';

/*
 * OlcRTC-OpenWRT — LuCI-панель управления
 * Основана на проекте OlcRTC (https://github.com/openlibrecommunity/olcrtc)
 * автора zarazaex / openlibrecommunity
 *
 * Сохранение: автоматическое при изменении любого поля (ubus uci/set + uci/commit).
 * НЕ используем uci.apply() — он предназначен для сетевых настроек и вызывает
 * ошибку "ubus code 5: No data received" при использовании не по назначению.
 */

/* ══════════════════════════════════════════════════════════
   RPC-объявления (прямые ubus-вызовы, без LuCI-прослойки)
   ══════════════════════════════════════════════════════════ */

var callInitAction = rpc.declare({
    object : 'rc',
    method : 'init',
    params : [ 'name', 'action' ],
    expect : { result: 0 }
});

var callServiceList = rpc.declare({
    object : 'service',
    method : 'list',
    params : [ 'name' ],
    expect : { '': {} }
});

var callUciSet = rpc.declare({
    object : 'uci',
    method : 'set',
    params : [ 'config', 'section', 'values' ],
    expect : {}
});

var callUciCommit = rpc.declare({
    object : 'uci',
    method : 'commit',
    params : [ 'config' ],
    expect : {}
});

var callExec = rpc.declare({
    object : 'file',
    method : 'exec',
    params : [ 'command', 'params', 'env' ],
    expect : { stdout: '' }
});

/* ══════════════════════════════════════════════════════════
   Матрица совместимости carrier × transport
   Jazz + datachannel: в документации помечен «*» (работает,
   но не желательно) — в данной реализации полностью запрещён.
   ══════════════════════════════════════════════════════════ */

var COMPAT = {
    telemost : ['vp8channel', 'videochannel'],
    jazz     : ['vp8channel', 'seichannel', 'videochannel'],
    wbstream : ['datachannel', 'vp8channel', 'seichannel', 'videochannel']
};

/* ══════════════════════════════════════════════════════════
   Парсер URI-формата olcrtc://
   Формат: olcrtc://<carrier>?<transport>@<roomId>#<key>%<clientId>[$<mimo>]
   ══════════════════════════════════════════════════════════ */

function parseOlcrtcUri(raw) {
    var uri = raw.trim();
    if (uri.indexOf('olcrtc://') !== 0) return null;
    var rest = uri.slice(9);
    var i;

    i = rest.indexOf('?');
    if (i < 1) return null;
    var carrier = rest.slice(0, i);
    rest = rest.slice(i + 1);

    i = rest.indexOf('@');
    if (i < 1) return null;
    var transport = rest.slice(0, i);
    rest = rest.slice(i + 1);

    i = rest.indexOf('#');
    if (i < 0) return null;
    var roomId = rest.slice(0, i);
    rest = rest.slice(i + 1);

    i = rest.indexOf('%');
    if (i < 1) return null;
    var key = rest.slice(0, i);
    rest = rest.slice(i + 1);

    i = rest.indexOf('$');
    var clientId = i !== -1 ? rest.slice(0, i) : rest;

    var knownCarriers   = ['telemost', 'jazz', 'wbstream'];
    var knownTransports = ['datachannel', 'vp8channel', 'seichannel', 'videochannel'];
    if (knownCarriers.indexOf(carrier)     === -1) return null;
    if (knownTransports.indexOf(transport) === -1) return null;
    if (key.length !== 64)                         return null;
    if (!clientId)                                 return null;
    /* Jazz + datachannel запрещён даже при импорте через URI */
    if (carrier === 'jazz' && transport === 'datachannel') return null;

    return { carrier: carrier, transport: transport,
             room_id: roomId,  key: key, client_id: clientId };
}

/* ══════════════════════════════════════════════════════════
   Вспомогательные функции
   ══════════════════════════════════════════════════════════ */

function getStatus() {
    return callServiceList('olcrtc').then(function (res) {
        var instances = (res && res.olcrtc && res.olcrtc.instances)
                        ? res.olcrtc.instances : {};
        var running = false, pid = null;
        Object.keys(instances).forEach(function (k) {
            if (instances[k].running) { running = true; pid = instances[k].pid || null; }
        });
        return { running: running, pid: pid };
    }).catch(function () { return { running: false, pid: null }; });
}

function getLogs() {
    return callExec('/sbin/logread', [ '-e', 'olcrtc' ], null)
        .then(function (res) {
            return (res && res.length > 0) ? res : '(записей в логе пока нет)';
        })
        .catch(function () {
            return callExec('/sbin/logread', [], null)
                .then(function (res) {
                    if (!res) return '(лог пуст)';
                    var lines = res.split('\n').filter(function (l) {
                        return l.toLowerCase().indexOf('olcrtc') !== -1;
                    });
                    return lines.length ? lines.join('\n') : '(записей с тегом olcrtc нет)';
                })
                .catch(function () {
                    return '(logread недоступен — проверьте ACL в /usr/share/rpcd/acl.d/)';
                });
        });
}

/* ══════════════════════════════════════════════════════════
   Основной вид
   ══════════════════════════════════════════════════════════ */
return view.extend({

    _statusTimer      : null,
    _logsTimer        : null,
    _statusEl         : null,
    _logsEl           : null,
    _startBtn         : null,
    _stopBtn          : null,
    _transportSel     : null,
    _vp8Section       : null,
    _seiSection       : null,
    _videoSection     : null,
    _datachannelHint  : null,
    _qrRows           : null,
    _tileRows         : null,

    load: function () {
        return Promise.all([ uci.load('olcrtc'), getStatus() ]);
    },

    _saveField: function (key, value) {
        var values = {};
        values[key] = value;
        callUciSet('olcrtc', 'config', values)
            .then(function () { return callUciCommit('olcrtc'); })
            .catch(function (e) { console.error('[OlcRTC] Ошибка сохранения UCI:', e); });
    },

    _updateUI: function (status) {
        if (this._statusEl) {
            var dot   = status.running ? '🟢' : '🔴';
            var label = status.running
                ? ('Работает' + (status.pid ? ' (PID ' + status.pid + ')' : ''))
                : 'Остановлен';
            this._statusEl.innerHTML = dot + ' <strong>' + label + '</strong>';
        }
        if (this._startBtn) {
            this._startBtn.disabled      = !!status.running;
            this._startBtn.style.opacity = status.running ? '0.5' : '1';
        }
        if (this._stopBtn) {
            this._stopBtn.disabled       = !status.running;
            this._stopBtn.style.opacity  = !status.running ? '0.5' : '1';
        }
    },

    _startPolling: function () {
        var self = this;

        if (self._statusTimer) clearInterval(self._statusTimer);
        self._statusTimer = setInterval(function () {
            getStatus().then(function (s) { self._updateUI(s); });
        }, 300);

        if (self._logsTimer) clearInterval(self._logsTimer);
        self._logsTimer = setInterval(function () {
            getLogs().then(function (text) {
                if (!self._logsEl) return;
                var el = self._logsEl;
                var atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
                el.textContent = text;
                if (atBottom) el.scrollTop = el.scrollHeight;
            });
        }, 3000);
    },

    _updateTransportSections: function (transport) {
        if (this._vp8Section)      this._vp8Section.style.display      = transport === 'vp8channel'   ? '' : 'none';
        if (this._seiSection)      this._seiSection.style.display      = transport === 'seichannel'   ? '' : 'none';
        if (this._videoSection)    this._videoSection.style.display    = transport === 'videochannel' ? '' : 'none';
        if (this._datachannelHint) this._datachannelHint.style.display = transport === 'datachannel'  ? '' : 'none';
    },

    _updateTransportOptions: function (carrier) {
        var sel = this._transportSel;
        if (!sel) return;
        var allowed = COMPAT[carrier] || COMPAT['telemost'];
        var opts = sel.options;
        for (var i = 0; i < opts.length; i++)
            opts[i].disabled = allowed.indexOf(opts[i].value) === -1;
        if (allowed.indexOf(sel.value) === -1) {
            sel.value = 'vp8channel';
            this._saveField('transport', 'vp8channel');
        }
        this._updateTransportSections(sel.value);
    },

    _updateVideoCodecRows: function (codec) {
        if (this._qrRows)
            this._qrRows.forEach(function (el) { el.style.display = codec === 'qrcode' ? '' : 'none'; });
        if (this._tileRows)
            this._tileRows.forEach(function (el) { el.style.display = codec === 'tile' ? '' : 'none'; });
    },

    render: function (data) {
        var self       = this;
        var initStatus = data[1];

        var cfg = {
            arch             : uci.get('olcrtc', 'config', 'arch')              || 'arm64',
            carrier          : uci.get('olcrtc', 'config', 'carrier')           || 'telemost',
            transport        : uci.get('olcrtc', 'config', 'transport')         || 'vp8channel',
            room_id          : uci.get('olcrtc', 'config', 'room_id')           || '',
            client_id        : uci.get('olcrtc', 'config', 'client_id')         || '',
            key              : uci.get('olcrtc', 'config', 'key')               || '',
            socks_host       : uci.get('olcrtc', 'config', 'socks_host')        || '0.0.0.0',
            socks_port       : uci.get('olcrtc', 'config', 'socks_port')        || '1080',
            socks_user       : uci.get('olcrtc', 'config', 'socks_user')        || '',
            socks_pass       : uci.get('olcrtc', 'config', 'socks_pass')        || '',
            dns              : uci.get('olcrtc', 'config', 'dns')               || '1.1.1.1:53',
            debug            : uci.get('olcrtc', 'config', 'debug')             || '0',
            vp8_fps          : uci.get('olcrtc', 'config', 'vp8_fps')           || '25',
            vp8_batch        : uci.get('olcrtc', 'config', 'vp8_batch')         || '1',
            sei_fps          : uci.get('olcrtc', 'config', 'sei_fps')           || '60',
            sei_batch        : uci.get('olcrtc', 'config', 'sei_batch')         || '64',
            sei_frag         : uci.get('olcrtc', 'config', 'sei_frag')          || '900',
            sei_ack_ms       : uci.get('olcrtc', 'config', 'sei_ack_ms')        || '2000',
            video_codec      : uci.get('olcrtc', 'config', 'video_codec')       || 'qrcode',
            video_w          : uci.get('olcrtc', 'config', 'video_w')           || '1920',
            video_h          : uci.get('olcrtc', 'config', 'video_h')           || '1080',
            video_fps        : uci.get('olcrtc', 'config', 'video_fps')         || '30',
            video_bitrate    : uci.get('olcrtc', 'config', 'video_bitrate')     || '2M',
            video_hw         : uci.get('olcrtc', 'config', 'video_hw')          || 'none',
            video_qr_recovery: uci.get('olcrtc', 'config', 'video_qr_recovery') || 'low',
            video_qr_size    : uci.get('olcrtc', 'config', 'video_qr_size')     || '0',
            video_tile_module: uci.get('olcrtc', 'config', 'video_tile_module') || '4',
            video_tile_rs    : uci.get('olcrtc', 'config', 'video_tile_rs')     || '20',
            ffmpeg           : uci.get('olcrtc', 'config', 'ffmpeg')            || 'ffmpeg'
        };

        /* ── Блок статуса ───────────────────────────────────── */
        var statusSpan = E('span');
        self._statusEl = statusSpan;

        var startBtn = E('button', {
            class : 'btn cbi-button cbi-button-apply',
            style : 'margin-right:8px',
            click : ui.createHandlerFn(self, function () {
                startBtn.disabled = stopBtn.disabled = true;
                startBtn.style.opacity = stopBtn.style.opacity = '0.5';
                return callInitAction('olcrtc', 'start')
                    .then(function () {
                        ui.addNotification(null, E('p', 'OlcRTC запущен'), 'info');
                    })
                    .catch(function (e) {
                        ui.addNotification(null, E('p', 'Ошибка запуска: ' + (e.message || e)), 'error');
                    })
                    .then(function () {
                        return getStatus().then(function (s) { self._updateUI(s); });
                    });
            })
        }, '▶ Старт');

        var stopBtn = E('button', {
            class : 'btn cbi-button cbi-button-reset',
            click : ui.createHandlerFn(self, function () {
                startBtn.disabled = stopBtn.disabled = true;
                startBtn.style.opacity = stopBtn.style.opacity = '0.5';
                return callInitAction('olcrtc', 'stop')
                    .then(function () {
                        ui.addNotification(null, E('p', 'OlcRTC остановлен'), 'info');
                    })
                    .catch(function (e) {
                        ui.addNotification(null, E('p', 'Ошибка остановки: ' + (e.message || e)), 'error');
                    })
                    .then(function () {
                        return getStatus().then(function (s) { self._updateUI(s); });
                    });
            })
        }, '■ Стоп');

        self._startBtn = startBtn;
        self._stopBtn  = stopBtn;
        self._updateUI(initStatus);

        var statusSection = E('div', { class: 'cbi-section' }, [
            E('legend', {}, 'Статус'),
            E('div', { class: 'cbi-section-node' }, [
                E('div', { style: 'margin-bottom:14px;font-size:1.15em;line-height:1.8;' }, statusSpan),
                E('div', {}, [ startBtn, stopBtn ])
            ])
        ]);

        /* ── Вспомогательная функция строки формы ───────────── */
        function row(label, hint, inputEl) {
            return E('div', { class: 'cbi-value' }, [
                E('label', { class: 'cbi-value-title' }, label),
                E('div', { class: 'cbi-value-field' }, [
                    inputEl,
                    hint ? E('div', {
                        class : 'cbi-value-description',
                        style : 'margin-top:4px;font-size:0.85em;'
                    }, hint) : null
                ].filter(Boolean))
            ]);
        }

        /* ── Дебаунс 600 мс для текстовых полей ────────────── */
        function makeDebounced(fieldName) {
            var timer;
            return {
                change : function (ev) {
                    clearTimeout(timer);
                    self._saveField(fieldName, ev.target.value.trim());
                },
                input : function (ev) {
                    var v = ev.target.value;
                    clearTimeout(timer);
                    timer = setTimeout(function () { self._saveField(fieldName, v.trim()); }, 600);
                }
            };
        }

        /* ── Числовое поле ──────────────────────────────────── */
        function numInput(fieldName, val, placeholder, min, max) {
            var attrs = {
                class       : 'cbi-input-text',
                type        : 'number',
                value       : val,
                placeholder : placeholder,
                min         : String(min),
                change      : function (ev) {
                    var v = parseInt(ev.target.value);
                    if (!isNaN(v) && v >= min && (max == null || v <= max))
                        self._saveField(fieldName, String(v));
                }
            };
            if (max != null) attrs.max = String(max);
            return E('input', attrs);
        }

        /* ── Выбор архитектуры бинарника ───────────────────── */
        var archSel = E('select', {
            class  : 'cbi-input-select',
            change : function (ev) { self._saveField('arch', ev.target.value); }
        }, [
            E('option', { value: 'arm64', selected: cfg.arch === 'arm64' ? '' : null },
                'ARM64 / aarch64 — роутеры (Cudy, GL.iNet, OpenWRT на ARM)'),
            E('option', { value: 'amd64', selected: cfg.arch === 'amd64' ? '' : null },
                'AMD64 / x86-64 — ПК или сервер под OpenWRT')
        ]);

        /* ── Матрица совместимости ───────────────────────────── */
        var matrixCells = {};
        var carriers   = ['telemost', 'jazz', 'wbstream'];
        var transports = ['datachannel', 'vp8channel', 'seichannel', 'videochannel'];

        var TH_STYLE  = 'padding:4px 10px;text-align:center;font-size:0.8em;' +
                        'color:#8b949e;font-weight:normal;border-bottom:1px solid #21262d;';
        var THL_STYLE = 'padding:4px 10px;text-align:left;font-size:0.8em;' +
                        'color:#8b949e;font-weight:normal;border-bottom:1px solid #21262d;';

        function cellStyle(active) {
            return 'padding:4px 10px;text-align:center;font-size:0.85em;' +
                   (active ? 'background:rgba(63,185,80,0.08);' : '');
        }

        function makeCell(carrier, transport) {
            var ok    = COMPAT[carrier].indexOf(transport) !== -1;
            var isCur = (carrier === cfg.carrier && transport === cfg.transport);
            var td    = E('td', { style: cellStyle(isCur) },
                ok ? E('span', { style: 'color:#3fb950;font-size:1.1em;' }, '✓')
                   : E('span', { style: 'color:#f85149;font-size:1.1em;' }, '✗'));
            matrixCells[carrier + '-' + transport] = td;
            return td;
        }

        function updateMatrix(selCarrier, selTransport) {
            carriers.forEach(function (c) {
                transports.forEach(function (t) {
                    var td    = matrixCells[c + '-' + t];
                    var ok    = COMPAT[c].indexOf(t) !== -1;
                    var isCur = (c === selCarrier && t === selTransport);
                    td.style.cssText = cellStyle(isCur);
                    var icon = td.querySelector('span');
                    if (icon) icon.style.cssText =
                        ok ? 'color:#3fb950;font-size:1.1em;'
                           : 'color:#f85149;font-size:1.1em;';
                    var thEl = matrixCells['__th_' + c];
                    if (thEl) thEl.style.color = (c === selCarrier) ? '#e6edf3' : '#8b949e';
                });
            });
        }

        var headerCells = [E('th', { style: THL_STYLE }, '')].concat(
            carriers.map(function (c) {
                var names = { telemost: 'Telemost', jazz: 'Jazz', wbstream: 'WBStream' };
                var th = E('th', {
                    style: TH_STYLE + (c === cfg.carrier ? 'color:#e6edf3;' : '')
                }, names[c]);
                matrixCells['__th_' + c] = th;
                return th;
            })
        );

        var transportLabels = {
            datachannel  : 'DataCh',
            vp8channel   : 'VP8Ch',
            seichannel   : 'SEICh',
            videochannel : 'VideoCh'
        };
        var matrixRows = transports.map(function (t) {
            return E('tr', {}, [
                E('td', { style: 'padding:4px 10px;font-size:0.8em;color:#8b949e;' }, transportLabels[t])
            ].concat(carriers.map(function (c) { return makeCell(c, t); })));
        });

        var matrixTable = E('table', {
            style : 'border-collapse:collapse;margin-bottom:4px;'
        }, [E('thead', {}, [E('tr', {}, headerCells)]),
            E('tbody', {}, matrixRows)]);

        /* ── Выбор сервиса и транспорта ─────────────────────── */
        var allowed = COMPAT[cfg.carrier] || COMPAT['telemost'];

        var carrierSel = E('select', {
            class  : 'cbi-input-select',
            change : function (ev) {
                var c = ev.target.value;
                self._saveField('carrier', c);
                self._updateTransportOptions(c);
                updateMatrix(c, transportSel.value);
            }
        }, [
            E('option', { value: 'telemost',
                          selected: cfg.carrier === 'telemost' ? '' : null },
                'Telemost (telemost.yandex.ru)'),
            E('option', { value: 'jazz',
                          selected: cfg.carrier === 'jazz' ? '' : null },
                'Jazz (salutejazz.ru)'),
            E('option', { value: 'wbstream',
                          selected: cfg.carrier === 'wbstream' ? '' : null },
                'Wildberries Stream (stream.wb.ru)')
        ]);

        var transportSel = E('select', {
            class  : 'cbi-input-select',
            change : function (ev) {
                var t = ev.target.value;
                self._saveField('transport', t);
                updateMatrix(carrierSel.value, t);
                self._updateTransportSections(t);
            }
        }, [
            E('option', {
                value: 'datachannel', selected: cfg.transport === 'datachannel' ? '' : null,
                disabled: allowed.indexOf('datachannel') === -1 ? '' : null
            }, 'datachannel — максимальная скорость (Telemost и Jazz — запрещён)'),
            E('option', {
                value: 'vp8channel', selected: cfg.transport === 'vp8channel' ? '' : null
            }, 'vp8channel — работает везде (рекомендуется)'),
            E('option', {
                value: 'seichannel', selected: cfg.transport === 'seichannel' ? '' : null,
                disabled: allowed.indexOf('seichannel') === -1 ? '' : null
            }, 'seichannel — не для Telemost'),
            E('option', {
                value: 'videochannel', selected: cfg.transport === 'videochannel' ? '' : null
            }, 'videochannel — крайний случай, везде')
        ]);
        self._transportSel = transportSel;

        /* ── Поля подключения ───────────────────────────────── */
        var roomH = makeDebounced('room_id');
        var roomInput = E('input', {
            class: 'cbi-input-text', type: 'text', value: cfg.room_id,
            placeholder : 'Например: 49286587700808',
            change: roomH.change, input: roomH.input
        });

        var clientH = makeDebounced('client_id');
        var clientInput = E('input', {
            class: 'cbi-input-text', type: 'text', value: cfg.client_id,
            placeholder : 'Например: home-router',
            change: clientH.change, input: clientH.input
        });

        var keyH = makeDebounced('key');
        var keyInput = E('input', {
            class: 'cbi-input-text', type: 'password', value: cfg.key,
            placeholder : 'e5265a924657a8807dc...',
            change: keyH.change, input: keyH.input
        });

        /* ── SOCKS5 поля ────────────────────────────────────── */
        var socksHostH = makeDebounced('socks_host');
        var socksHostInput = E('input', {
            class: 'cbi-input-text', type: 'text', value: cfg.socks_host,
            placeholder : '0.0.0.0',
            change: socksHostH.change, input: socksHostH.input
        });

        var socksPortInput = E('input', {
            class: 'cbi-input-text', type: 'number', value: cfg.socks_port,
            placeholder: '1080', min: '1', max: '65535',
            change: function (ev) {
                var v = parseInt(ev.target.value);
                if (v >= 1 && v <= 65535) self._saveField('socks_port', String(v));
            }
        });

        var socksUserH = makeDebounced('socks_user');
        var socksUserInput = E('input', {
            class: 'cbi-input-text', type: 'text', value: cfg.socks_user,
            placeholder : '(без аутентификации — оставьте пустым)',
            change: socksUserH.change, input: socksUserH.input
        });

        var socksPassH = makeDebounced('socks_pass');
        var socksPassInput = E('input', {
            class: 'cbi-input-text', type: 'password', value: cfg.socks_pass,
            placeholder : '(без аутентификации — оставьте пустым)',
            change: socksPassH.change, input: socksPassH.input
        });

        /* ── DNS и отладка ──────────────────────────────────── */
        var dnsH = makeDebounced('dns');
        var dnsInput = E('input', {
            class: 'cbi-input-text', type: 'text', value: cfg.dns,
            placeholder: '1.1.1.1:53',
            change: dnsH.change, input: dnsH.input
        });

        var debugCheck = E('input', {
            type    : 'checkbox',
            checked : cfg.debug === '1' ? '' : null,
            style   : 'width:auto;margin-right:6px;',
            change  : function (ev) {
                self._saveField('debug', ev.target.checked ? '1' : '0');
            }
        });

        /* ── Параметры vp8channel ───────────────────────────── */
        var vp8Section = E('div', {}, [
            E('div', { style: 'margin-bottom:8px;padding:4px 0;font-size:0.8em;color:#8b949e;' +
                              'text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #21262d;' },
                'VP8 Channel — рекомендуется -vp8-fps 60 -vp8-batch 64'),
            row('-vp8-fps',
                'FPS VP8-потока. Рекомендуется: 60. По умолчанию: 25.',
                numInput('vp8_fps', cfg.vp8_fps, '25', 1, 120)),
            row('-vp8-batch',
                'Кадров за тик (чётное число, больше = выше скорость). Рекомендуется: 64. По умолчанию: 1.',
                numInput('vp8_batch', cfg.vp8_batch, '1', 1, null))
        ]);
        self._vp8Section = vp8Section;

        /* ── Параметры seichannel ───────────────────────────── */
        var seiSection = E('div', {}, [
            E('div', { style: 'margin-bottom:8px;padding:4px 0;font-size:0.8em;color:#8b949e;' +
                              'text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #21262d;' },
                'SEI Channel — рекомендуется -fps 60 -batch 64 -frag 900 -ack-ms 2000'),
            row('-fps',
                'FPS H264-потока. Рекомендуется: 60. По умолчанию: 60.',
                numInput('sei_fps', cfg.sei_fps, '60', 1, 120)),
            row('-batch',
                'Кадров за тик. Рекомендуется: 64. По умолчанию: 64.',
                numInput('sei_batch', cfg.sei_batch, '64', 1, null)),
            row('-frag',
                'Размер фрагмента в байтах. Рекомендуется: 900. По умолчанию: 900.',
                numInput('sei_frag', cfg.sei_frag, '900', 1, null)),
            row('-ack-ms',
                'Таймаут ACK в миллисекундах. Рекомендуется: 2000. По умолчанию: 2000.',
                numInput('sei_ack_ms', cfg.sei_ack_ms, '2000', 1, null))
        ]);
        self._seiSection = seiSection;

        /* ── Параметры videochannel ─────────────────────────── */
        var videoCodecSel = E('select', {
            class  : 'cbi-input-select',
            change : function (ev) {
                var codec = ev.target.value;
                self._saveField('video_codec', codec);
                self._updateVideoCodecRows(codec);
            }
        }, [
            E('option', { value: 'qrcode', selected: cfg.video_codec === 'qrcode' ? '' : null },
                'qrcode (рекомендуется)'),
            E('option', { value: 'tile',   selected: cfg.video_codec === 'tile'   ? '' : null },
                'tile (требует разрешение строго 1080×1080)')
        ]);

        var bitrateH = makeDebounced('video_bitrate');
        var videoBitrateInput = E('input', {
            class: 'cbi-input-text', type: 'text', value: cfg.video_bitrate,
            placeholder : '2M',
            change: bitrateH.change, input: bitrateH.input
        });

        var videoHwSel = E('select', {
            class  : 'cbi-input-select',
            change : function (ev) { self._saveField('video_hw', ev.target.value); }
        }, [
            E('option', { value: 'none',  selected: cfg.video_hw === 'none'  ? '' : null }, 'none'),
            E('option', { value: 'nvenc', selected: cfg.video_hw === 'nvenc' ? '' : null }, 'nvenc (NVIDIA GPU)')
        ]);

        var qrRecoverySel = E('select', {
            class  : 'cbi-input-select',
            change : function (ev) { self._saveField('video_qr_recovery', ev.target.value); }
        }, [
            E('option', { value: 'low',     selected: cfg.video_qr_recovery === 'low'     ? '' : null }, 'low'),
            E('option', { value: 'medium',  selected: cfg.video_qr_recovery === 'medium'  ? '' : null }, 'medium'),
            E('option', { value: 'high',    selected: cfg.video_qr_recovery === 'high'    ? '' : null }, 'high'),
            E('option', { value: 'highest', selected: cfg.video_qr_recovery === 'highest' ? '' : null }, 'highest')
        ]);

        var qrRecoveryRow = row('-video-qr-recovery',
            'Коррекция ошибок QR. По умолчанию: low. (только для qrcode)',
            qrRecoverySel);
        var qrSizeRow = row('-video-qr-size',
            'Размер фрагмента QR в байтах, 0 = авто. По умолчанию: 0. (только для qrcode)',
            numInput('video_qr_size', cfg.video_qr_size, '0', 0, null));

        var tileModuleRow = row('-video-tile-module',
            'Размер тайла в пикселях 1..270. По умолчанию: 4. Требует разрешение 1080×1080. (только для tile)',
            numInput('video_tile_module', cfg.video_tile_module, '4', 1, 270));
        var tileRsRow = row('-video-tile-rs',
            'Reed-Solomon паритет % 0..200. По умолчанию: 20. (только для tile)',
            numInput('video_tile_rs', cfg.video_tile_rs, '20', 0, 200));

        self._qrRows   = [qrRecoveryRow, qrSizeRow];
        self._tileRows = [tileModuleRow, tileRsRow];

        var ffmpegH = makeDebounced('ffmpeg');
        var ffmpegInput = E('input', {
            class: 'cbi-input-text', type: 'text', value: cfg.ffmpeg,
            placeholder : 'ffmpeg',
            change: ffmpegH.change, input: ffmpegH.input
        });

        var videoSection = E('div', {}, [
            E('div', { style: 'margin-bottom:8px;padding:4px 0;font-size:0.8em;color:#8b949e;' +
                              'text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #21262d;' },
                'Video Channel — рекомендуется: qrcode 1080×1080 60fps 5000k'),
            row('-video-codec',
                'Кодек передачи данных. qrcode — рекомендуется. tile — нужно точно 1080×1080.',
                videoCodecSel),
            row('-video-w',
                'Ширина кадра в пикселях. По умолчанию: 1920. Для tile — строго 1080.',
                numInput('video_w', cfg.video_w, '1920', 1, null)),
            row('-video-h',
                'Высота кадра в пикселях. По умолчанию: 1080. Для tile — строго 1080.',
                numInput('video_h', cfg.video_h, '1080', 1, null)),
            row('-video-fps',
                'FPS видеопотока. Рекомендуется: 60. По умолчанию: 30.',
                numInput('video_fps', cfg.video_fps, '30', 1, 120)),
            row('-video-bitrate',
                'Битрейт. Например: 2M или 5000k. Рекомендуется: 5000k. По умолчанию: 2M.',
                videoBitrateInput),
            row('-video-hw',
                'Аппаратное ускорение кодирования. По умолчанию: none.',
                videoHwSel),
            qrRecoveryRow,
            qrSizeRow,
            tileModuleRow,
            tileRsRow,
            row('-ffmpeg',
                'Путь к исполняемому файлу ffmpeg. По умолчанию: ffmpeg (из PATH).',
                ffmpegInput)
        ]);
        self._videoSection = videoSection;

        /* ── Подсказка для datachannel (параметров нет) ─────── */
        var datachannelHint = E('div', {
            style: 'color:#8b949e;font-size:0.9em;padding:8px 0;'
        }, 'datachannel не имеет дополнительных параметров — всё по умолчанию.');
        self._datachannelHint = datachannelHint;

        /* ── Применяем начальную видимость секций ───────────── */
        self._updateTransportSections(cfg.transport);
        self._updateVideoCodecRows(cfg.video_codec);

        /* ── URI-импорт ──────────────────────────────────────── */
        var uriLabel = E('span', {
            style : 'margin-left:10px;font-size:0.85em;vertical-align:middle;'
        }, '');

        var uriInput = E('input', {
            class       : 'cbi-input-text',
            type        : 'text',
            placeholder : 'olcrtc://wbstream?datachannel@room-id#key64chars%client-id$...',
            style       : 'font-family:monospace;font-size:0.82em;width:100%;',
            input : function (ev) {
                var val = ev.target.value.trim();
                if (!val) {
                    uriLabel.textContent    = '';
                    ev.target.style.outline = '';
                    return;
                }
                var p = parseOlcrtcUri(val);
                if (!p) {
                    uriLabel.textContent    = '✗ Неверный формат';
                    uriLabel.style.color    = '#f85149';
                    ev.target.style.outline = '2px solid #f85149';
                    return;
                }

                carrierSel.value   = p.carrier;
                transportSel.value = p.transport;
                roomInput.value    = p.room_id;
                clientInput.value  = p.client_id;
                keyInput.value     = p.key;

                self._updateTransportOptions(p.carrier);
                updateMatrix(p.carrier, p.transport);

                callUciSet('olcrtc', 'config', {
                    carrier   : p.carrier,
                    transport : p.transport,
                    room_id   : p.room_id,
                    client_id : p.client_id,
                    key       : p.key
                }).then(function () { return callUciCommit('olcrtc'); })
                  .catch(function (e) { console.error('[OlcRTC] UCI import error:', e); });

                uriLabel.textContent    = '✓ Параметры применены';
                uriLabel.style.color    = '#3fb950';
                ev.target.style.outline = '2px solid #3fb950';
            }
        });

        var uriSection = E('div', { class: 'cbi-section' }, [
            E('legend', {}, 'Подключение по URI'),
            E('div', { class: 'cbi-section-node' }, [
                E('div', { style: 'margin-bottom:8px;' }, [ uriInput, uriLabel ]),
                E('div', { style: 'font-size:0.82em;color:#8b949e;' },
                    'Вставьте строку вида olcrtc://… — все параметры подключения заполнятся автоматически.')
            ])
        ]);

        /* ── Блок основных настроек ──────────────────────────── */
        var settingsSection = E('div', { class: 'cbi-section' }, [
            E('legend', {}, 'Настройки подключения'),
            E('div', { class: 'cbi-section-node' }, [

                row('Архитектура бинарника',
                    'Выберите архитектуру процессора вашего устройства. Большинство современных роутеров — ARM64.',
                    archSel),

                E('hr', { style: 'border:none;border-top:1px solid #21262d;margin:12px 0;' }),

                E('div', { style: 'margin-bottom:16px;overflow-x:auto;' }, [ matrixTable ]),

                row('Сервис',
                    'Через какой сервис идёт туннель. Telemost поддерживает меньше транспортов.',
                    carrierSel),
                row('Транспорт',
                    'Протокол передачи данных внутри туннеля.',
                    transportSel),

                E('hr', { style: 'border:none;border-top:1px solid #21262d;margin:12px 0;' }),

                row('Room ID',
                    'ID комнаты с сервера. Скопируйте из вывода сервера при его первом запуске.',
                    roomInput),
                row('Client ID',
                    'Короткий идентификатор, должен совпадать с сервером (например: home-router).',
                    clientInput),
                row('Ключ шифрования',
                    'HEX-строка 64 символа. Генерация: openssl rand -hex 32. Должна совпадать с сервером.',
                    keyInput)
            ])
        ]);

        /* ── Блок SOCKS5 ─────────────────────────────────────── */
        var socks5Section = E('div', { class: 'cbi-section' }, [
            E('legend', {}, 'SOCKS5 прокси'),
            E('div', { class: 'cbi-section-node' }, [
                row('Адрес (-socks-host)',
                    '0.0.0.0 — доступен с любого интерфейса роутера. 127.0.0.1 — только локально. По умолчанию: 0.0.0.0.',
                    socksHostInput),
                row('Порт (-socks-port)',
                    'Локальный порт прокси. По умолчанию: 1080.',
                    socksPortInput),
                row('Логин (-socks-user)',
                    'Если задан — включается аутентификация RFC 1929. Оставьте пустым для открытого доступа.',
                    socksUserInput),
                row('Пароль (-socks-pass)',
                    'Пароль для SOCKS5-аутентификации. Используется только вместе с логином.',
                    socksPassInput)
            ])
        ]);

        /* ── Блок дополнительных настроек ───────────────────── */
        var advancedSection = E('div', { class: 'cbi-section' }, [
            E('legend', {}, 'Дополнительно'),
            E('div', { class: 'cbi-section-node' }, [
                row('DNS-сервер (-dns)',
                    'DNS для резолвинга в туннеле. По умолчанию: 1.1.1.1:53.',
                    dnsInput),
                row('Режим отладки (--debug)',
                    'Подробные логи WebRTC-соединений. Может сильно увеличить объём логов.',
                    E('label', { style: 'display:flex;align-items:center;cursor:pointer;' }, [
                        debugCheck,
                        E('span', {}, 'Включить подробное логирование')
                    ]))
            ])
        ]);

        /* ── Блок параметров транспорта ──────────────────────── */
        var transportSection = E('div', { class: 'cbi-section' }, [
            E('legend', {}, 'Параметры транспорта'),
            E('div', { class: 'cbi-section-node' }, [
                datachannelHint,
                vp8Section,
                seiSection,
                videoSection
            ])
        ]);

        /* ── Блок логов ──────────────────────────────────────── */
        var logsEl = E('pre', {
            style : 'background:#0d1117;color:#3fb950;padding:12px;' +
                    'max-height:360px;overflow-y:auto;border-radius:6px;' +
                    'font-size:0.78em;white-space:pre-wrap;word-break:break-all;' +
                    'margin:0;border:1px solid #30363d;'
        }, 'Загрузка логов...');
        self._logsEl = logsEl;

        var logsSection = E('div', { class: 'cbi-section' }, [
            E('legend', {}, '📋 Логи'),
            E('div', { class: 'cbi-section-node' }, [ logsEl ])
        ]);

        self._startPolling();

        return E('div', {}, [
            statusSection,
            uriSection,
            settingsSection,
            socks5Section,
            advancedSection,
            transportSection,
            logsSection
        ]);
    },

    handleSave      : function () { return Promise.resolve(); },
    handleSaveApply : function () { return Promise.resolve(); },
    handleReset     : function () { return Promise.resolve(); }
});
