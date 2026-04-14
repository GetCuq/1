'use strict';
'require view';
'require form';
'require uci';
'require rpc';
'require ui';
'require poll';

/*
 * OlcRTC-OpenWRT — LuCI-панель управления
 * Основана на проекте OlcRTC (https://github.com/openlibrecommunity/olcrtc)
 * автора zarazaex / openlibrecommunity
 */

/* ── RPC-вызовы ─────────────────────────────────────────── */
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

var callFileRead = rpc.declare({
    object : 'file',
    method : 'read',
    params : [ 'path' ],
    expect : { data: '' }
});

/* ── Вспомогательные функции ────────────────────────────── */
function getStatus() {
    return callServiceList('olcrtc').then(function (res) {
        var instances = L.isObject(res, 'olcrtc') &&
                        L.isObject(res.olcrtc, 'instances')
                        ? res.olcrtc.instances : {};
        var running = false;
        var pid     = null;

        Object.keys(instances).forEach(function (k) {
            if (instances[k].running) {
                running = true;
                pid = instances[k].pid || null;
            }
        });

        return { running: running, pid: pid };
    }).catch(function () {
        return { running: false, pid: null };
    });
}

function renderStatusBadge(running, pid) {
    var dot   = running ? '🟢' : '🔴';
    var label = running
        ? ('Работает' + (pid ? ' (PID: ' + pid + ')' : ''))
        : 'Остановлен';
    return dot + ' <strong>' + label + '</strong>';
}

/* ── Основной вид ───────────────────────────────────────── */
return view.extend({

    /* хранит ссылки на DOM-элементы для обновления */
    _statusEl : null,
    _logsEl   : null,

    load: function () {
        return Promise.all([
            uci.load('olcrtc'),
            getStatus()
        ]);
    },

    /* Периодическое обновление статуса и логов */
    _startPolling: function () {
        var self = this;
        poll.add(function () {
            return Promise.all([
                getStatus(),
                callFileRead('/tmp/olcrtc.log').catch(function () { return { data: '' }; })
            ]).then(function (res) {
                var status = res[0];

                if (self._statusEl) {
                    self._statusEl.innerHTML = renderStatusBadge(status.running, status.pid);
                }

                /* Логи через logread (читаем /tmp/olcrtc.log если пишем туда,
                   иначе пытаемся через системный лог) */
                if (self._logsEl) {
                    callFileRead('/tmp/olcrtc.log').then(function (r) {
                        var txt = (r && r.data) ? r.data : '(логи недоступны)';
                        self._logsEl.textContent = txt;
                        self._logsEl.scrollTop   = self._logsEl.scrollHeight;
                    }).catch(function () {
                        self._logsEl.textContent = '(логи недоступны)';
                    });
                }
            });
        }, 5);
    },

    render: function (data) {
        var self       = this;
        var initStatus = data[1];

        /* ── Форма UCI ──────────────────────────────────────── */
        var m = new form.Map('olcrtc',
            'OlcRTC',
            'Управление SOCKS5-клиентом OlcRTC. ' +
            'Tunneling через WebRTC-провайдеров для обхода блокировок.');

        var s = m.section(form.NamedSection, 'config', 'olcrtc', 'Настройки подключения');
        s.anonymous = true;

        /* Провайдер */
        var o = s.option(form.ListValue, 'provider', 'Провайдер');
        o.value('telemost', 'Telemost (VK Teams)');
        o.value('jazz',     'Jazz (Sber)');
        o.default = 'telemost';

        /* Room ID */
        o = s.option(form.Value, 'room_id', 'Room ID',
            'Идентификатор комнаты. Для Telemost — числовой, для Jazz — вида user:roomcode');
        o.placeholder = 'Например: 49286587700808';
        o.rmempty = false;

        /* Ключ */
        o = s.option(form.Value, 'key', 'Ключ (key)',
            'Общий секретный ключ (hex-строка, 64 символа)');
        o.placeholder = 'e5265a924657a8807dcef7a7b8e89562...';
        o.password = true;
        o.rmempty  = false;

        /* SOCKS-порт */
        o = s.option(form.Value, 'socks_port', 'SOCKS5-порт',
            'Локальный порт для SOCKS5-прокси (по умолчанию 1080)');
        o.placeholder = '1080';
        o.datatype    = 'port';
        o.default     = '1080';

        /* Автозапуск */
        o = s.option(form.Flag, 'enabled', 'Автозапуск при загрузке');
        o.default = '0';

        /* ── Рендер формы ───────────────────────────────────── */
        return m.render().then(function (formNode) {

            /* ── Блок статуса ───────────────────────────────── */
            var statusSection = E('div', { class: 'cbi-section' }, [
                E('h3', {}, 'Статус'),
                E('div', { style: 'margin-bottom:12px; font-size:1.1em;' },
                    E('span', { id: 'olcrtc-status' },
                        renderStatusBadge(initStatus.running, initStatus.pid)
                    )
                ),
                E('div', { class: 'cbi-section-node' }, [
                    /* Кнопка Старт / Перезапуск */
                    E('button', {
                        class   : 'btn cbi-button cbi-button-apply',
                        style   : 'margin-right:8px',
                        click   : ui.createHandlerFn(self, function () {
                            return uci.save().then(function () {
                                return uci.apply();
                            }).then(function () {
                                return callInitAction('olcrtc', 'restart');
                            }).then(function () {
                                ui.addNotification(null,
                                    E('p', 'OlcRTC перезапущен'), 'info');
                            }).catch(function (e) {
                                ui.addNotification(null,
                                    E('p', 'Ошибка: ' + e.message), 'error');
                            });
                        })
                    }, '▶ Старт / Перезапуск'),

                    /* Кнопка Стоп */
                    E('button', {
                        class : 'btn cbi-button cbi-button-reset',
                        click : ui.createHandlerFn(self, function () {
                            return callInitAction('olcrtc', 'stop')
                                .then(function () {
                                    ui.addNotification(null,
                                        E('p', 'OlcRTC остановлен'), 'info');
                                }).catch(function (e) {
                                    ui.addNotification(null,
                                        E('p', 'Ошибка: ' + e.message), 'error');
                                });
                        })
                    }, '■ Стоп')
                ])
            ]);

            /* ── Блок логов (раскрывающийся) ────────────────── */
            var logsContent = E('pre', {
                id    : 'olcrtc-logs',
                style : 'background:#111;color:#0f0;padding:10px;' +
                        'max-height:320px;overflow-y:auto;' +
                        'font-size:0.78em;border-radius:4px;white-space:pre-wrap;'
            }, 'Загрузка логов...');

            var logsSection = E('div', { class: 'cbi-section' }, [
                E('details', {}, [
                    E('summary', {
                        style: 'cursor:pointer;font-weight:bold;font-size:1em;' +
                               'padding:4px 0;user-select:none;'
                    }, '📋 Логи (logread | grep olcrtc)'),
                    E('div', { style: 'margin-top:8px;' }, logsContent)
                ])
            ]);

            /* Сохраняем ссылки для polling */
            self._statusEl = formNode.querySelector('#olcrtc-status') ||
                             statusSection.querySelector('#olcrtc-status');
            self._logsEl   = logsContent;

            self._startPolling();

            return E('div', {}, [ statusSection, formNode, logsSection ]);
        });
    },

    handleSaveApply: function (ev) {
        return this.handleSave(ev).then(function () {
            return uci.apply();
        });
    },

    handleSave: function (ev) {
        var map = document.querySelector('.cbi-map');
        return map ? map._luci_map.save() : Promise.resolve();
    }
});
