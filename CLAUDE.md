# Tolimoto Log — заметки для Claude Code

Журнал ТО и заправок для мотоцикла и машины. PWA на React 18 + TypeScript + Vite,
живёт на https://app.tolimoto.com (GitHub Pages, домен через Cloudflare, DNS only).
Издатель — Tolimoto. Владелец общается по-русски; отвечать по-русски.

## Команды

    npm install
    npm run dev        # локальный сервер
    npm test           # расчёты: tsx scripts/test-calc.ts (сейчас 60 ok)
    npm run build      # tsc --noEmit + vite build в dist/

Сквозные тесты (Playwright для Python): собрать с `VITE_GOOGLE_CLIENT_ID=test`,
отдать dist/ на порту 4174, затем `python3 e2e/run_onboarding.py`, `run_google.py`,
`run_renew.py`. Google в них подменён `e2e/google_mock.py`.
Кнопки искать как `button:has-text("…")`, а не `text=…` (совпадает с текстом абзацев).

Публикация: каждый push в `main` → `.github/workflows/deploy.yml` (тесты, сборка, Pages).

## Устройство

- `src/store.ts` — IndexedDB, настройки (installSeen, onboarded, localAck, lastBackup,
  backupSnooze); `normalize` отмечает онбординг пройденным у тех, у кого уже есть транспорт.
- `src/App.tsx` — порядок первого запуска: выбор языка → InstallIntro (если не установлено
  и !installSeen) → Tour (если !onboarded) → выбор хранения.
- `src/Onboarding.tsx` — установка (iOS: ≡ в адресной строке → «Поделиться» → «На экран
  „Домой“» → «Добавить»), тур, выбор хранения, напоминание о резервной копии раз в 30 дней
  (без Google и при >10 записях), экран «Сохранность данных», navigator.storage.persist.
- `src/google.ts`, `src/sync.ts`, `src/sheetLook.ts` — вход Google и двусторонняя
  синхронизация с таблицей. `src/config.ts`: client ID и scopes (`drive.file email`).
- `src/exportImport.ts`, `src/fuelly.ts` — JSON/CSV, импорт Fuelly и Fuelio.
- `src/i18n.ts` — тексты, языки приложения: ru и en. Новые строки — сразу на оба языка.
- `src/Forms.tsx` — настройки; там же строка версии. При релизе менять версию и в
  `package.json`, и в Forms.tsx (сейчас 0.5.1).

## Правила

- Главный приоритет — чтобы пользователь не потерял данные. Любое изменение хранения,
  синхронизации или импорта проверять тестами и не ломать старые данные (`normalize`).
- Приложение local-first: без своего сервера, без аналитики, без сторонних SDK.
  Это обещано в политике конфиденциальности на tolimoto.com — не нарушать.
- Google: только `drive.file` и `email`. Новый scope = проверка Google и правка политики;
  сначала спросить владельца. OAuth-проект `tolimoto-log` в Google Cloud, статус
  «In production» без проверки; логотип на экран входа не загружать без согласия
  (потребует проверку).
- Рассчитано в первую очередь на iPhone (Safari, установка на экран «Домой»).
- Личные данные не коммитить: `data/`, бэкапы, CSV из Fuelly, `scripts/gen-nc750x.mjs`
  в .gitignore. Репозиторий публичный.
- Сначала концепция и согласие владельца, потом код для заметных изменений интерфейса.
- Коммиты: понятные сообщения на английском.

Сайт с инструкцией и политикой — отдельный репозиторий Anatose/tolimoto-site.
