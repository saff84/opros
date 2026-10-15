Новая версия: редактор, несколько опросов, архив и расширенные выгрузки — см. [SURVEYS.md](SURVEYS.md). Перед обновлением существующей установки прочитайте раздел о миграции.

# Опрос SANEXT: самостоятельное размещение через Docker

Автономная версия опроса с фирменным оформлением SANEXT. В комплекте: пошаговая анкета, первый вопрос в два столбца с выпадающими списками, резервный черновик в браузере, сохранение ответов на сервере, пароль для результатов, сводные таблицы, графики, CSV и JSON. Логотип и Manrope включены в архив и загружаются с вашего сервера.

Это приложение с сервером и базой, а не один статический HTML-файл. Для прохождения опроса аккаунт ChatGPT не нужен. Работа не зависит от ChatGPT Sites или Cloudflare. Уже собранные ответы НЕ включены в архив: их нужно перенести отдельно, см. раздел 8.

## 1. Что нужно

- Сервер в России с Ubuntu 24.04 LTS. Практический ориентир для небольшого внутреннего опроса: 2 ядра, 2 ГБ RAM и 20 ГБ диска. На сборку желательно 4 ГБ RAM; если процесс завершится из-за нехватки памяти, увеличьте RAM или добавьте swap. Это оценка ресурсов, не результат нагрузочного тестирования.
- SSH-доступ с правами sudo.
- Docker Engine и Docker Compose v2.
- Для публичного HTTPS: домен или поддомен, например `survey.example.ru`, DNS A-запись на IP сервера. Порты TCP 80/443 должны быть свободны и доступны снаружи.
- При первой сборке нужен доступ к Docker Hub и npm. Дальнейшая работа опроса не обращается к ним. Caddy обращается к центру сертификации для выпуска и обновления HTTPS-сертификата.

В инструкции вместо `SERVER_IP`, `SERVER_USER` и `survey.example.ru` подставьте свои значения. Не вводите примеры адресов буквально.

## 2. Загрузить и распаковать архив

На компьютере с Windows откройте PowerShell в папке с архивом:

```powershell
scp .\SANEXT_survey_Docker.zip SERVER_USER@SERVER_IP:/tmp/
ssh SERVER_USER@SERVER_IP
```

На сервере:

```bash
sudo apt-get update
sudo apt-get install -y unzip openssl
sudo mkdir -p /opt/sanext-survey
sudo chown "$(id -un):$(id -gn)" /opt/sanext-survey
unzip /tmp/SANEXT_survey_Docker.zip -d /opt/sanext-survey
cd /opt/sanext-survey/sanext-survey-docker
```

## 3. Установить Docker, если его ещё нет

На чистом Ubuntu:

```bash
sudo bash scripts/install-docker-ubuntu.sh
sudo docker version
sudo docker compose version
```

Скрипт использует официальный apt-репозиторий Docker и пропускает установку, если Docker и Compose уже есть. Если на сервере установлен Docker из другого репозитория или есть конфликт пакетов, не удаляйте его вслепую: используйте официальную инструкцию под свою ОС.

## 4. Настроить адрес и пароль

```bash
cp .env.example .env
chmod 600 .env
openssl rand -hex 24
nano .env
```

Скопируйте сгенерированную строку в `ADMIN_PASSWORD`. Пароль должен быть не короче 16 символов. Это ваш НОВЫЙ пароль доступа к результатам на собственном сервере. Старый пароль ChatGPT Sites не копируется в архив.

Для запуска с доменом и HTTPS `.env` должен выглядеть так:

```dotenv
PUBLIC_ORIGIN=https://survey.example.ru
ADMIN_PASSWORD=ВАШ_СГЕНЕРИРОВАННЫЙ_ПАРОЛЬ
DOMAIN=survey.example.ru
BIND_ADDRESS=127.0.0.1
APP_PORT=8080
```

У `PUBLIC_ORIGIN` не должно быть завершающего `/` или пути `/results`. Он должен точно совпадать с адресом, по которому сотрудники открывают опрос: протокол, домен и порт. Иначе защита запросов отклонит сохранение.

Сохранить в nano: Ctrl+O, Enter. Выйти: Ctrl+X.

## 5. Запустить с автоматическим HTTPS — основной вариант

Сначала создайте DNS A-запись для своего поддомена. Если есть AAAA-запись, убедитесь, что она указывает на корректный IPv6 сервера, или удалите ошибочную запись. Убедитесь, что на портах 80/443 не работает другой веб-сервер.

```bash
sudo docker compose -f docker-compose.yml -f docker-compose.https.yml up -d --build
sudo docker compose -f docker-compose.yml -f docker-compose.https.yml ps
sudo docker compose -f docker-compose.yml -f docker-compose.https.yml logs --tail=100 app caddy
```

Caddy выпустит сертификат и передаст запросы приложению. База хранится в постоянном Docker-томе `survey_data`, сертификаты — в `caddy_data`. У приложения ожидается статус `healthy`.

Если включён UFW, сначала проверьте, что SSH разрешён; затем разрешите веб-порты:

```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
```

Не включайте и не сбрасывайте firewall этими командами; учитывайте также firewall в панели провайдера.

Проверка:

```bash
curl -fsS http://127.0.0.1:8080/api/health
curl -I https://survey.example.ru
```

Первый запрос должен вернуть `{"ok":true}`.

Ссылка сотрудникам: `https://survey.example.ru/`.
Результаты: `https://survey.example.ru/results` — вход по `ADMIN_PASSWORD`.

Проверяйте полный сценарий в браузере: открыть опрос → ответить → перейти далее → обновить страницу и увидеть черновик → закончить → войти в результаты → проверить таблицы и графики. Проверьте отдельно с телефона и из сети в России.

## 6. Если на сервере уже есть Nginx / сайт SANEXT

Не запускайте Caddy на занятых 80/443. Используйте существующий Nginx и отдельный поддомен. Опрос рассчитан на корень отдельного домена; размещение в `/survey/` потребует дополнительной адаптации путей.

Оставьте `BIND_ADDRESS=127.0.0.1`, а `PUBLIC_ORIGIN` установите в публичный HTTPS-адрес поддомена. Запустите только приложение:

```bash
sudo docker compose up -d --build
curl -fsS http://127.0.0.1:8080/api/health
```

В HTTPS server-блоке Nginx с уже настроенным сертификатом добавьте:

```nginx
location / {
    client_max_body_size 5m;
    proxy_pass http://127.0.0.1:8080;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

Этот блок предназначен для отдельного поддомена. Не заменяйте им `location /` основного сайта SANEXT.

После сохранения конфигурации:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## 7. Временная проверка по IP без домена

В `.env` поставьте:

```dotenv
PUBLIC_ORIGIN=http://SERVER_IP:8080
BIND_ADDRESS=0.0.0.0
APP_PORT=8080
```

`ADMIN_PASSWORD` оставьте заполненным. Запуск:

```bash
sudo docker compose up -d --build
```

Открыть: `http://SERVER_IP:8080/`. При необходимости разрешите TCP 8080 в firewall провайдера. Этот вариант предназначен для краткой проверки: HTTP не шифрует ответы и пароль администратора. Для рабочей рассылки используйте HTTPS из раздела 5 или 6.

После перехода на HTTPS верните `BIND_ADDRESS=127.0.0.1`, укажите новый `PUBLIC_ORIGIN` и пересоздайте приложение:

```bash
sudo docker compose -f docker-compose.yml -f docker-compose.https.yml up -d
```

## 8. Перенести уже накопленные ответы

1. Откройте старую страницу результатов в ChatGPT Sites, войдите по старому паролю и нажмите **«Скачать JSON»**. Для переноса нужен JSON с индивидуальными анкетами; CSV-сводка для импорта не подходит.
2. Загрузите файл на сервер как `responses.json` в папку проекта.
3. Сначала сделайте резервную копию новой базы, затем импортируйте:

```bash
sudo docker compose exec app node scripts/backup.mjs /data/before-import.sqlite
sudo docker compose cp ./responses.json app:/data/import.json
sudo docker compose exec app node scripts/import-responses.mjs /data/import.json
sudo docker compose exec app rm -f /data/import.json
```

Импорт сохраняет имена, статусы, даты и ответы. Совпавшие ID пропускаются: существующие записи не перезаписываются. Импортировать повторно изменённый старый экспорт для обновления записей эта команда не будет.

После проверки результатов удалите локальный `responses.json` с сервера или храните его как защищённую резервную копию. Не выкладывайте его рядом с публичными файлами сайта.

Черновики и идентификатор в браузере привязаны к домену. На новом домене посетитель начнёт новую сессию; завершённые и незавершённые анкеты из экспорта будут видны в админке. После переноса разошлите новую ссылку и прекратите сбор по старой, чтобы ответы не расходились по двум базам.

## 9. Резервная копия

Копию создаёт SQLite backup API: файл согласован даже при работающем приложении.

```bash
mkdir -p backups
sudo docker compose exec app node scripts/backup.mjs /data/backups/survey-backup.sqlite
sudo docker compose cp app:/data/backups/survey-backup.sqlite ./backups/survey-backup.sqlite
```

Файл содержит ответы сотрудников. Сохраняйте копию также вне этого сервера. Автоматическое расписание работает через сервис `backup` и настраивается в кабинете: [FEATURES.md](FEATURES.md).

Восстановление заменяет текущую базу выбранной копией. Сначала сохраните актуальную базу командой выше. Затем:

```bash
sudo docker compose stop app backup
sudo docker compose run --rm --no-deps app node scripts/restore.mjs /data/backups/survey-backup.sqlite
sudo docker compose up -d app backup
```

Для восстановления файла с компьютера сначала загрузите его в `backups/survey-backup.sqlite` на сервере, затем при работающем приложении:

```bash
sudo docker compose cp ./backups/survey-backup.sqlite app:/data/restore.sqlite
sudo docker compose stop app backup
sudo docker compose run --rm --no-deps app node scripts/restore.mjs /data/restore.sqlite
sudo docker compose up -d app backup
```

## 10. Обновление и остановка

Перед обновлением сделайте резервную копию. Замените исходники новой версией, сохранив `.env`.

Если используете Caddy:

```bash
sudo docker compose -f docker-compose.yml -f docker-compose.https.yml up -d --build
```

Если используете свой Nginx или HTTP по IP:

```bash
sudo docker compose up -d --build
```

Чтобы остановить контейнеры без удаления данных:

```bash
sudo docker compose -f docker-compose.yml -f docker-compose.https.yml down
```

При работе без Caddy используйте `sudo docker compose down`. **Не добавляйте `-v`**: этот ключ удалит тома и ответы.

Менять пароль можно в `/results` → «Сменить пароль»: он сохраняется в базе, административные сессии отзываются, сессии участников сохраняются. Для восстановления забытого пароля задайте другое значение `ADMIN_PASSWORD` в `.env` и пересоздайте приложение через `up -d`. Подробности совместимости старых подписей и восстановления — в [SURVEYS.md](SURVEYS.md).

## 11. Если что-то не работает

| Симптом                             | Что проверить                                                                                                     |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Сервер не открывается               | Контейнеры в `docker compose ps`, DNS, firewall, занятые порты                                                    |
| `unhealthy`                         | `ADMIN_PASSWORD` не короче 16 символов, корректность `PUBLIC_ORIGIN`, логи `app`, доступность тома                |
| «Запрос отклонён»                   | Точное совпадение `PUBLIC_ORIGIN` с адресом в браузере, отсутствие `/` в конце, перезапуск после изменения `.env` |
| Браузер показывает старые вопросы | Изменения опроса появляются в течение 5 секунд и при возвращении на вкладку; после обновления кода приложения достаточно обычной перезагрузки |
| Caddy не получает сертификат        | DNS A/AAAA, доступность TCP 80/443, логи `caddy`                                                                  |
| Сборка прервана / killed            | Объём RAM, свободный диск, доступ к npm и Docker Hub                                                              |
| После перезапуска пропали ответы    | Не менялось ли имя проекта, подключён ли том `survey_data`, не использовался ли `down -v`                         |
| Ошибка импортирования               | Используется индивидуальный JSON-экспорт, а не CSV; приложение уже запускалось и создало базу                     |

Логи:

```bash
sudo docker compose logs --tail=100 app
```

## 12. Техническая структура и проверка архива

- `app/` — интерфейс и API Next.js.
- `public/` — логотип и локальные шрифты.
- `app/runtime.ts` — SQLite через встроенный модуль `node:sqlite` в Node.js 24.
- `Dockerfile` — сборка и запуск от непривилегированного пользователя.
- `docker-compose.yml` — приложение и постоянный том данных.
- `docker-compose.https.yml`, `Caddyfile` — дополнительный HTTPS-сервис.
- `scripts/` — установка Docker на Ubuntu, импорт, бэкап и восстановление.
- `.env.example` — образец настроек без рабочего пароля.

SQLite подходит для одного экземпляра этого приложения на одном сервере. Несколько реплик с общей SQLite-базой этой конфигурацией не поддерживаются. Модуль SQLite в Node.js 24 может выводить предупреждение `ExperimentalWarning`; это предупреждение, а не ошибка сохранения.

Проверка при подготовке архива описана в `VALIDATION.md`. Docker-образ после обновления 15.10.2026 собран и проверен в отдельном Compose-проекте. Повторная проверка: `npm run test:docker`. HTTPS, DNS и доступность проверяются на сервере размещения.

Официальная документация:

- Docker на Ubuntu: https://docs.docker.com/engine/install/ubuntu/
- Next.js standalone: https://nextjs.org/docs/app/api-reference/config/next-config-js/output
- SQLite в Node.js 24: https://nodejs.org/download/release/latest-v24.x/docs/api/sqlite.html
- Caddy reverse proxy: https://caddyserver.com/docs/caddyfile/directives/reverse_proxy
# Расширенные возможности

Актуальное описание воронки, QR-кодов, расписания, шаблонов, новых вопросов, ролей, PDF, автоматических копий и обновления открытых страниц: [FEATURES.md](FEATURES.md).
