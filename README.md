# OlcRTC-OpenWRT

LuCI-панель для запуска клиента [OlcRTC](https://github.com/openlibrecommunity/olcrtc) на OpenWrt.

Текущая версия репозитория мигрирована под ветку `refactor/universal-carrier` upstream-проекта:

- запуск идёт через YAML-конфиг `olcrtc /etc/olcrtc/client.yaml`
- в LuCI используется модель `auth.provider + net.transport`
- поддерживаются `jitsi`, `wbstream`, `telemost`
- поддерживаются URI `olcrtc://...` и подписки `sub.md`

## Что изменилось

Старый UI был привязан к legacy CLI-флагам и `client_id`.
В `universal-carrier` это заменено на YAML runtime-конфиг, поэтому:

- `client_id` удалён из панели
- `carrier` заменён на `auth.provider`
- init-скрипт генерирует `/etc/olcrtc/client.yaml` из UCI
- добавлен `jitsi`
- обновлена матрица совместимости по новой документации upstream

## Возможности

- импорт `olcrtc://...` URI нового формата
- загрузка `https://...` подписок в формате `sub.md`
- автосохранение полей в UCI
- запуск и остановка сервиса из LuCI
- просмотр логов `olcrtc`
- настройка `vp8`, `sei`, `videochannel`

## Поддерживаемый URI

Поддерживается формат:

```text
olcrtc://<Auth>?<Transport>@<RoomID>#<EncryptionKey>$<MIMO>
olcrtc://<Auth>?<Transport><key=value&key=value>@<RoomID>#<EncryptionKey>$<MIMO>
```

Примеры:

```text
olcrtc://jitsi?datachannel@https://meet.jit.si/myroom#aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa$RU
olcrtc://wbstream?vp8channel<vp8-fps=60&vp8-batch=64>@room-01#aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa$RU
olcrtc://telemost?videochannel<video-w=1080&video-h=1080&video-fps=60&video-bitrate=5000k&video-hw=none&video-codec=qrcode>@room-01#aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa$RU
```

## Установка

Подключитесь к роутеру по SSH и выполните:

```sh
sh -c "$(wget -qO- https://raw.githubusercontent.com/GetCuq/1/master/install.sh)"
```

Что делает скрипт:

- определяет архитектуру роутера (`arm64` или `amd64`)
- скачивает бинарник `olcrtc`
- устанавливает init-скрипт, LuCI-файлы и UCI-конфиг
- создаёт runtime-директорию `/etc/olcrtc`

После установки откройте LuCI -> `Services -> OlcRTC`.

### Установка с локального ПК по SSH

Если бинарник уже скачан с GitHub Actions и ты не хочешь, чтобы роутер что-то тянул из интернета, используй локальный PowerShell-скрипт:

```powershell
.\deploy-openwrt.ps1 -Router 192.168.1.1 -User root -BinaryPath .\olcrtc-linux-arm64
```

Если хочешь сразу перезапустить сервис после копирования:

```powershell
.\deploy-openwrt.ps1 -Router 192.168.1.1 -User root -BinaryPath .\olcrtc-linux-arm64 -RestartService
```

Скрипт сам:

- заливает бинарник на роутер через `scp`
- копирует init, UCI и LuCI-файлы
- ставит их на нужные пути
- включает `/etc/init.d/olcrtc`
- перезапускает `rpcd` и `uhttpd`

## Сборка IPK

Если хочешь ставить это как обычный OpenWrt-пакет, собери `.ipk` локально:

```powershell
.\build-ipk.ps1 -BinaryPath .\olcrtc-linux-arm64 -Architecture aarch64_cortex-a53
```

Готовый файл появится в:

```text
.\dist\
```

Для `AX3000T` правильная архитектура пакета:

```text
aarch64_cortex-a53
```

Установка на роутер после сборки:

```powershell
scp -O .\dist\luci-app-olcrtc_*.ipk root@192.168.1.1:/tmp/
ssh root@192.168.1.1 opkg install /tmp/luci-app-olcrtc_*.ipk
```

## Настройка

Минимально нужны:

- `Provider`
- `Transport`
- `Room ID`
- `Key`

Для `jitsi` в `Room ID` можно вставлять полный URL комнаты:

```text
https://meet.jit.si/myroom
```

SOCKS5 по умолчанию слушает только `127.0.0.1:1080`.
Если указать не-loopback адрес, сервис потребует `socks.user` и `socks.pass`.

## Матрица совместимости

По текущей документации `universal-carrier`:

| Transport | telemost | wbstream | jitsi |
|---|---:|---:|---:|
| datachannel | no | warn | ok |
| vp8channel | ok | ok | warn |
| seichannel | no | ok | warn |
| videochannel | warn | ok | warn |

Где:

- `ok` — работает стабильно
- `warn` — best effort / нестабильно
- `no` — не поддерживается

## Важно про бинарники

Код панели и init-скрипт уже переведены на `universal-carrier`.
Готовые бинарники `olcrtc-linux-arm64` и `olcrtc-linux-amd64` в репозитории тоже должны соответствовать этой ветке upstream, иначе установка даст старый runtime.

Если вы обновляете форк дальше, самый простой путь:

1. собрать `universal-carrier` бинарники отдельно
2. заменить `olcrtc-linux-arm64` и `olcrtc-linux-amd64` в репозитории
3. после этого `install.sh` начнёт ставить уже новую версию

## Private repo + GitHub Actions

Да, приватный репозиторий сделать можно, и в этом репо уже добавлен workflow:

- [.github/workflows/build-universal-carrier.yml](/C:/Users/aorus/Desktop/OlcRTC-OpenWRT/.github/workflows/build-universal-carrier.yml)

Что он умеет:

1. берёт upstream `openlibrecommunity/olcrtc` из ветки `refactor/universal-carrier`
2. собирает `olcrtc-linux-amd64`
3. собирает `olcrtc-linux-arm64`
4. выкладывает оба файла как GitHub Actions artifacts
5. опционально коммитит свежие бинарники обратно в репозиторий

Но есть важное ограничение:

- если репозиторий **приватный**, роутер не сможет просто так скачать `install.sh` и бинарники по `raw.githubusercontent.com/...`
- значит, для приватного режима удобнее использовать один из двух сценариев:

### Вариант A

Приватный репо только для сборки.

- запускаешь workflow
- скачиваешь artifact `olcrtc-linux-arm64`
- копируешь бинарник на роутер вручную по `scp`
- ставишь LuCI-часть из локального репо или отдельным архивом

### Вариант B

Приватный рабочий репо + отдельный публичный install-канал.

- в приватном репо Actions собирает бинарники
- потом ты публикуешь `install.sh`, LuCI-файлы и бинарники в публичный репо или иной публичный хостинг
- роутер ставится уже с публичного URL

Если хочешь полностью без ручных скачиваний на роутере, для `install.sh` лучше держать **публичный** install-source.

## Удаление

```sh
sh -c "$(wget -qO- https://raw.githubusercontent.com/GetCuq/1/master/uninstall.sh)"
```
