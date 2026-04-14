# OlcRTC-OpenWRT

Панель управления LuCI для запуска [OlcRTC](https://github.com/openlibrecommunity/olcrtc) в режиме клиента на роутере с OpenWRT.

> **OlcRTC** — проект [zarazaex](https://t.me/zarazaexe) / [openlibrecommunity](https://github.com/openlibrecommunity).  
> Реализация обхода блокировок через WebRTC-туннели поверх разрешённых сервисов.  
> Лицензия оригинального проекта: **WTFPL**.

---

## Что это такое

OlcRTC запускается на роутере как SOCKS5-прокси.
Весь трафик браузера или устройства, направленный через этот прокси, проходит по зашифрованному WebRTC-туннелю через разрешённый в России сервис, что позволяет обходить блокировки.

Данный проект добавляет удобный веб-интерфейс в стандартное меню LuCI (**Службы → OlcRTC**).

---

## Возможности

- Выбор провайдера: **Telemost** или **Jazz**
- Ввод Room ID, ключа и SOCKS5-порта
- Кнопки **Старт / Перезапуск** и **Стоп**
- Индикатор статуса с PID (🟢 / 🔴), обновляется каждые 5 секунд
- Раскрывающийся блок с логами
- Настройки сохраняются через UCI (`/etc/config/olcrtc`)
- Автозапуск при старте роутера (опционально)

---

## Требования

- OpenWRT с LuCI (проверено на OpenWrt 25.12.1 & Luci 0.7.14)
- Архитектура: **ARM64** (aarch64) — например, роутер Cudy WR3000S
- Свободное место: 10 МБ

> Если у вас другая архитектура — соберите бинарник самостоятельно из [исходников OlcRTC](https://github.com/openlibrecommunity/olcrtc), ниже будет описано как это сделать

---

## Установка

Подключитесь к роутеру по SSH и выполните:

```sh
sh -c "$(wget -qO- https://raw.githubusercontent.com/tankionline2005/OlcRTC-OpenWRT/main/install.sh)"
```


## Настройка через UCI (хз зачем но есть)

```sh
uci set olcrtc.config.provider='telemost'
uci set olcrtc.config.room_id='49286587700808'
uci set olcrtc.config.key='e5265a924657a8807dcef7a7b8e89562ca4d070d6ac4fcdd313897900d71ba6a'
uci set olcrtc.config.socks_port='1080'
uci set olcrtc.config.enabled='1'
uci commit olcrtc
/etc/init.d/olcrtc restart
```

---

## Использование прокси

После запуска на роутере доступен SOCKS5-прокси:

```
Хост:  <IP роутера> или 127.0.0.1
Порт:  1080  (или тот, что вы указали)
Тип:   SOCKS5
```

Укажите эти настройки в браузере, приложении или в установленном сервисе (Например podkop)

---

## Удаление

```sh
sh -c "$(wget -qO- https://raw.githubusercontent.com/tankionline2005/OlcRTC-OpenWRT/main/uninstall.sh)"
```

Или вручную:

```sh
/etc/init.d/olcrtc stop
/etc/init.d/olcrtc disable
rm -f /usr/bin/olcrtc
rm -f /etc/init.d/olcrtc
rm -f /etc/config/olcrtc
rm -f /usr/share/luci/menu.d/luci-app-olcrtc.json
rm -f /usr/share/rpcd/acl.d/luci-app-olcrtc.json
rm -rf /www/luci-static/resources/view/olcrtc
/etc/init.d/rpcd restart
/etc/init.d/uhttpd restart
```

---

## Структура проекта

```
OlcRTC-OpenWRT/
├── README.md
├── install.sh                   # Установочный скрипт
├── uninstall.sh                 # Скрипт удаления
├── olcrtc-linux-arm64           # Скомпилированный бинарник, рекомендуется скомпилировать самостоятельно из исходников OlcRTC, а не слепо доверять мне =)
└── files/
    ├── etc/
    │   ├── config/olcrtc        # UCI конфиг по умолчанию
    │   └── init.d/olcrtc        # Сервисный скрипт (procd)
    ├── usr/share/
    │   ├── luci/menu.d/         # Пункт меню LuCI
    │   └── rpcd/acl.d/          # Права доступа
    └── www/luci-static/
        └── resources/view/olcrtc/main.js  # Веб-интерфейс
```

---

## Благодарности

- [zarazaex](https://t.me/zarazaexe) и [openlibrecommunity](https://github.com/openlibrecommunity) — за создание OlcRTC

---

## Лицензия

Код данного проекта распространяется под лицензией **WTFPL**.
