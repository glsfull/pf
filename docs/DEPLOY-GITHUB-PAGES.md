# Пошаговая инструкция: публикация демо на GitHub Pages

## Что публикуется и почему только это

GitHub Pages — хостинг **статических** файлов. Node.js, PostgreSQL, Redis и воркеры
там работать не могут. Поэтому на Pages публикуется каталог `app/` — демо личного
кабинета, где вместо backend используется `localStorage` браузера
(модуль `app/js/api.js` повторяет контракт REST API из [ARCHITECTURE.md](ARCHITECTURE.md)).

Продакшн-развёртывание backend описано в разделе «Что дальше» ниже.

## Шаг 1. Влить ветку в `main`

Деплой запускается из workflow [`.github/workflows/pages.yml`](../.github/workflows/pages.yml)
при push в `main`.

```bash
git checkout main
git pull
git merge issue-1-a49d71be9a67   # или смёрджить Pull Request через веб-интерфейс
git push origin main
```

## Шаг 2. Включить Pages в настройках репозитория

1. Открыть `https://github.com/glsfull/pf/settings/pages`.
2. В блоке **Build and deployment → Source** выбрать **GitHub Actions**
   (именно Actions, не «Deploy from a branch»).
3. Сохранить. Дополнительно ничего настраивать не нужно — workflow уже
   запрашивает права `pages: write` и `id-token: write`.

## Шаг 3. Запустить деплой

Автоматически — любым push в `main`. Вручную:

1. `https://github.com/glsfull/pf/actions/workflows/pages.yml`
2. Кнопка **Run workflow** → ветка `main` → **Run workflow**.

## Шаг 4. Проверить результат

1. Дождаться зелёного статуса job `deploy` (обычно < 1 мин).
2. Ссылка на сайт — в выводе job (`Deploy to GitHub Pages → page_url`)
   или в Settings → Pages.
3. Адрес по умолчанию: **https://glsfull.github.io/pf/**

Проверить вручную: открываются разделы «Мои проекты», «Очередь задач»,
«Статистика», «Профиль»; создание проекта и добавление ключей работают;
кнопка «Сбросить демо-данные» возвращает исходный пример.

## Шаг 5. Локальный запуск (для разработки)

```bash
npm install
npm start                      # http://127.0.0.1:4173/app/
npx playwright install --with-deps chromium
npm test                       # e2e-тесты демо
```

## Типовые проблемы

| Симптом | Причина | Решение |
| --- | --- | --- |
| 404 на `https://glsfull.github.io/pf/` | Source не переключён на GitHub Actions | Шаг 2 |
| Белая страница, в консоли 404 на `js/main.js` | Файлы скопированы не из `app/` | Проверить шаг «Собрать статический сайт» в workflow |
| Стили не применились | Jekyll съел файлы с `_` | В workflow создаётся `.nojekyll` — убедиться, что шаг не удалён |
| Данные не сохраняются | Приватный режим браузера блокирует localStorage | Открыть в обычном окне |
| Workflow падает с `Resource not accessible by integration` | Отключены Actions-права на Pages | Settings → Actions → General → Workflow permissions |

## Что дальше — развёртывание полноценной версии

Pages подходит только для демо интерфейса. Для боевой системы (см.
[ROADMAP.md](ROADMAP.md), Этап 1):

1. Сервер с Docker: `docker compose up -d` поднимает `api`, `worker`, `postgres`, `redis`.
2. Домен и TLS через Caddy/Nginx.
3. Секреты (`DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `YOOKASSA_*`, `YANDEX_XML_*`)
   — в переменных окружения, не в репозитории.
4. Фронтенд собирается в статику и раздаётся тем же Nginx; `app/js/api.js`
   заменяется на реализацию поверх `fetch('/api/v1/...')`.
5. GitHub Actions деплоит по SSH или в Kubernetes.
