# OlcRTC-OpenWRT

Панель управления LuCI для запуска [OlcRTC](https://github.com/openlibrecommunity/olcrtc) в режиме клиента на роутере с OpenWRT.

> [!NOTE] 
> **OlcRTC** — проект [zarazaex](https://github.com/zarazaex69) / [openlibrecommunity](https://github.com/openlibrecommunity).  
> Реализация обхода блокировок через WebRTC-туннели поверх разрешённых сервисов.  

> [!CAUTION]
> OlcRTC находится в статусе pre-alpha, возможны любые непресказуемые ошибки!

## Что это такое

OlcRTC запускается на роутере как SOCKS5-прокси.
Весь трафик браузера или устройства, направленный через этот прокси, проходит по зашифрованному WebRTC-туннелю через разрешённый в России сервис, что позволяет обходить блокировки.

Данный проект добавляет удобный веб-интерфейс в стандартное меню LuCI (**Службы → OlcRTC**).

## Возможности

- Выбор провайдера: **WBStream**, **Telemost**, **Jazz**
- Ввод Room ID, ключа и SOCKS5-порта
- Кнопки **Старт** и **Стоп**
- Индикатор статуса с PID
- Отображение логов

## Требования

- OpenWRT с LuCI (проверено на OpenWrt 25.12.1 & Luci 0.7.14)
- Архитектура: **ARM64** (aarch64) — например, роутер Cudy WR3000S

> Если у вас другая архитектура — соберите бинарник самостоятельно из [исходников OlcRTC](https://github.com/openlibrecommunity/olcrtc), там описано как это сделать.

- Свободное место: 10 МБ
- Удалённый VPS сервер на Linux для запуска OlcRTC сервера (Как это сделать также описано в оригинальном репозитории OlcRTC)
---

## Установка клиента на роутер

Подключитесь к роутеру по SSH и выполните:

```sh
sh -c "$(wget -qO- https://raw.githubusercontent.com/tankionline2005/OlcRTC-OpenWRT/main/install.sh)"
```

## Использование прокси

После запуска на роутере доступен SOCKS5-прокси:

```
Хост:  <IP роутера> или 127.0.0.1
Порт:  1080  (или тот, что вы указали)
Тип:   SOCKS5
```

Укажите эти настройки в браузере, приложении или в установленном сервисе (Например podkop)

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
