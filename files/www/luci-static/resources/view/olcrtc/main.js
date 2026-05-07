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
   Матрица совместимости carrier ↔ transport
   ══════════════════════════════════════════════════════════ */

var COMPAT = {
    telemost : ['vp8channel', 'videochannel'],
    jazz     : ['vp8channel', 'seichannel', 'videochannel'],
    wbstream : ['datachannel', 'vp8channel', 'seichannel', 'videochannel']
};

/* ══════════════════════════════════════════════════════════
   Парсер URI-формата olcrtc://
   Формат: olcrtc://<carrier>?<transport>@<roomId>#<key>%<clientId>$<mimo>
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

    /* Базовая валидация */
    var knownCarriers   = ['telemost', 'jazz', 'wbstream'];
    var knownTransports = ['datachannel', 'vp8channel', 'seichannel', 'videochannel'];
    if (knownCarriers.indexOf(carrier)     === -1) return null;
    if (knownTransports.indexOf(transport) === -1) return null;
    if (key.length !== 64)                         return null;
    if (!clientId)                                 return null;

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

    _statusTimer  : null,
    _logsTimer    : null,
    _statusEl     : null,
    _logsEl       : null,
    _startBtn     : null,
    _stopBtn      : null,
    _transportSel : null,

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
    },

    render: function (data) {
        var self       = this;
        var initStatus = data[1];

        var cfg = {
            carrier    : uci.get('olcrtc', 'config', 'carrier')    || 'telemost',
            transport  : uci.get('olcrtc', 'config', 'transport')  || 'vp8channel',
            room_id    : uci.get('olcrtc', 'config', 'room_id')    || '',
            client_id  : uci.get('olcrtc', 'config', 'client_id')  || '',
            key        : uci.get('olcrtc', 'config', 'key')        || '',
            socks_port : uci.get('olcrtc', 'config', 'socks_port') || '1080',
            dns        : uci.get('olcrtc', 'config', 'dns')        || '1.1.1.1:53'
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

        /* Дебаунс 600 мс для текстовых полей */
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

        /* ── Поля настроек ───────────────────────────────────── */

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

        var allowed = COMPAT[cfg.carrier] || COMPAT['telemost'];

        var transportSel = E('select', {
            class  : 'cbi-input-select',
            change : function (ev) {
                self._saveField('transport', ev.target.value);
                updateMatrix(carrierSel.value, ev.target.value);
            }
        }, [
            E('option', {
                value: 'datachannel', selected: cfg.transport === 'datachannel' ? '' : null,
                disabled: allowed.indexOf('datachannel') === -1 ? '' : null
            }, 'datachannel — максимальная скорость (не для Telemost)'),
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

        var roomHandlers   = makeDebounced('room_id');
        var roomInput = E('input', {
            class: 'cbi-input-text', type: 'text', value: cfg.room_id,
            placeholder : 'Например: 49286587700808',
            change: roomHandlers.change, input: roomHandlers.input
        });

        var clientHandlers = makeDebounced('client_id');
        var clientInput = E('input', {
            class: 'cbi-input-text', type: 'text', value: cfg.client_id,
            placeholder : 'Например: home-router',
            change: clientHandlers.change, input: clientHandlers.input
        });

        var keyHandlers = makeDebounced('key');
        var keyInput = E('input', {
            class: 'cbi-input-text', type: 'password', value: cfg.key,
            placeholder : 'e5265a924657a8807dc...',
            change: keyHandlers.change, input: keyHandlers.input
        });

        var portInput = E('input', {
            class: 'cbi-input-text', type: 'number', value: cfg.socks_port,
            placeholder: '1080', min: '1', max: '65535',
            change: function (ev) {
                var v = parseInt(ev.target.value);
                if (v >= 1 && v <= 65535) self._saveField('socks_port', String(v));
            }
        });

        var dnsHandlers = makeDebounced('dns');
        var dnsInput = E('input', {
            class: 'cbi-input-text', type: 'text', value: cfg.dns,
            placeholder: '1.1.1.1:53',
            change: dnsHandlers.change, input: dnsHandlers.input
        });

        /* ── Матрица совместимости ───────────────────────────── */

        /* Ячейки матрицы — обновляются при смене carrier/transport */
        var matrixCells = {};   /* ключ: "carrier-transport" → TD-элемент */

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
                    var td   = matrixCells[c + '-' + t];
                    var ok   = COMPAT[c].indexOf(t) !== -1;
                    var isCur = (c === selCarrier && t === selTransport);
                    td.style.cssText = cellStyle(isCur);
                    /* Обновляем текст только если ok не изменился — он не изменяется,
                       но подсветку активной ячейки перерисовываем. */
                    var icon = td.querySelector('span');
                    if (icon) icon.style.cssText =
                        ok ? 'color:#3fb950;font-size:1.1em;'
                           : 'color:#f85149;font-size:1.1em;';
                    /* Жирный заголовок столбца для активного carrier */
                    var thEl = matrixCells['__th_' + c];
                    if (thEl) thEl.style.color = (c === selCarrier) ? '#e6edf3' : '#8b949e';
                });
            });
        }

        /* Заголовочные TH — сохраняем ссылки для подсветки */
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

        var matrixRows = transports.map(function (t) {
            var labels = {
                datachannel  : 'DataCh',
                vp8channel   : 'VP8Ch',
                seichannel   : 'SEICh',
                videochannel : 'VideoCh'
            };
            return E('tr', {}, [E('td', { style: 'padding:4px 10px;font-size:0.8em;color:#8b949e;' }, labels[t])].concat(
                carriers.map(function (c) { return makeCell(c, t); })
            ));
        });

        var matrixTable = E('table', {
            style : 'border-collapse:collapse;margin-bottom:4px;'
        }, [E('thead', {}, [E('tr', {}, headerCells)]),
            E('tbody', {}, matrixRows)]);

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

                /* ── Заполняем все поля ── */
                carrierSel.value   = p.carrier;
                transportSel.value = p.transport;
                roomInput.value    = p.room_id;
                clientInput.value  = p.client_id;
                keyInput.value     = p.key;

                /* Обновляем состояние транспортного списка */
                self._updateTransportOptions(p.carrier);
                updateMatrix(p.carrier, p.transport);

                /* Сохраняем все поля в UCI одним коммитом */
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
                E('div', { style: 'margin-bottom:8px;' }, [
                    uriInput,
                    uriLabel
                ]),
                E('div', { style: 'font-size:0.82em;color:#8b949e;' },
                    'Вставьте строку вида olcrtc://… — все параметры подключения заполнятся автоматически.')
            ])
        ]);

        /* ── Блок настроек ───────────────────────────────────── */
        var settingsSection = E('div', { class: 'cbi-section' }, [
            E('legend', {}, 'Настройки подключения'),
            E('div', { class: 'cbi-section-node' }, [
                /* Матрица совместимости над полями выбора */
                E('div', { style: 'margin-bottom:16px;overflow-x:auto;' }, [ matrixTable ]),

                row('Сервис',
                    'Через какой сервис идёт туннель. Telemost поддерживает меньше транспортов.',
                    carrierSel),
                row('Транспорт',
                    'Протокол передачи данных внутри туннеля.',
                    transportSel),
                row('Room ID',
                    'ID комнаты с сервера. Скопируйте из вывода сервера при его первом запуске.',
                    roomInput),
                row('Client ID',
                    'Короткий идентификатор, должен совпадать с сервером (например: home-router).',
                    clientInput),
                row('Ключ шифрования',
                    'HEX-строка 64 символа. Генерация: openssl rand -hex 32. Должна совпадать с сервером.',
                    keyInput),
                row('SOCKS5-порт',
                    'Локальный порт прокси (по умолчанию 1080).',
                    portInput),
                row('DNS-сервер',
                    'DNS для резолвинга в туннеле (по умолчанию 1.1.1.1:53).',
                    dnsInput)
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
            logsSection
        ]);
    },

    handleSave      : function () { return Promise.resolve(); },
    handleSaveApply : function () { return Promise.resolve(); },
    handleReset     : function () { return Promise.resolve(); }
});
