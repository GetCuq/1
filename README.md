# OlcRTC-OpenWRT

Панель управления LuCI для запуска [OlcRTC](https://github.com/openlibrecommunity/olcrtc) в режиме клиента на роутере с OpenWRT.

<img width="1212" height="1208" alt="Image" src="https://github.com/user-attachments/assets/307b3dd2-50f3-4dc6-8a8b-d7dee7fd36ca" />

> [!NOTE]
> **OlcRTC** — проект [zarazaex](https://github.com/zarazaex69) / [openlibrecommunity](https://github.com/openlibrecommunity).  
> Реализация обхода блокировок через WebRTC-туннели поверх разрешённых сервисов.

> [!CAUTION]
> OlcRTC находится в статусе beta, возможны любые непредсказуемые ошибки!

## Что это такое

OlcRTC запускается на роутере как SOCKS5-прокси.
Весь трафик браузера или устройства, направленный через этот прокси, проходит по зашифрованному WebRTC-туннелю через разрешённый в России сервис, что позволяет обходить блокировки.

Данный проект добавляет удобный веб-интерфейс в стандартное меню LuCI (**Службы → OlcRTC**).

## Возможности

- **URI-импорт** — вставьте строку `olcrtc://…` от сервера, все параметры заполнятся автоматически
- Выбор сервиса: **Telemost**, **Jazz**, **Wildberries Stream**
- Выбор транспорта: **datachannel**, **vp8channel**, **seichannel**, **videochannel**
- Встроенная матрица совместимости сервис × транспорт
- Ввод Room ID, Client ID, ключа шифрования, SOCKS5-порта и DNS-сервера
- Автосохранение при изменении любого поля — кнопка «Сохранить» не нужна
- Кнопки **Старт** и **Стоп**
- Индикатор статуса с PID
- Отображение логов в реальном времени

## Требования

- OpenWRT с LuCI (проверено на OpenWrt 25.12.1 & LuCI 0.7.14)
- Архитектура: **ARM64** (aarch64) — например, роутер Cudy WR3000S

> Если у вас другая архитектура — соберите бинарник самостоятельно из [исходников OlcRTC](https://github.com/openlibrecommunity/olcrtc), там описано как это сделать.

- Свободное место: ~10 МБ
- Удалённый сервер (VPS) с запущенной серверной частью OlcRTC — для этого можете воспользоваться моим репозиторием [OlcRTC-VPS](https://github.com/tankionline2005/OlcRTC-VPS)

---

## Установка на роутер

Подключитесь к роутеру по SSH и выполните:

```sh
sh -c "$(wget -qO- https://raw.githubusercontent.com/tankionline2005/OlcRTC-OpenWRT/main/install.sh)"
```

После установки откройте LuCI → **Службы → OlcRTC**.

### Быстрый старт через URI

Если сервер выдал строку подключения вида `olcrtc://…` — вставьте её в поле **«Подключение по URI»**, все параметры заполнятся сами. Нажмите **Старт**.

### Ручная настройка

| Параметр | Описание |
|---|---|
| **Сервис** | Carrier: Telemost, Jazz или Wildberries Stream — должен совпадать с сервером |
| **Транспорт** | Протокол передачи: datachannel, vp8channel, seichannel, videochannel — должен совпадать с сервером |
| **Room ID** | ID комнаты — скопируйте из логов сервера при первом запуске |
| **Client ID** | Произвольная строка без пробелов, одинаковая на сервере и клиенте |
| **Ключ шифрования** | 64-символьная HEX-строка — скопируйте с сервера |
| **SOCKS5-порт** | Порт локального прокси (по умолчанию 1080) |
| **DNS-сервер** | DNS внутри туннеля (по умолчанию 1.1.1.1:53) |

## Использование прокси

После запуска на роутере доступен SOCKS5-прокси:

```
Хост:  <IP роутера>
Порт:  1080  (или тот, что вы указали)
Тип:   SOCKS5
```

Укажите эти настройки в браузере, приложении или в установленном сервисе (например, podkop).

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
