# Архитектура системы PF

## 1. Диаграмма компонентов

```
                       ┌──────────────────────────┐
                       │  Браузер (SEO-специалист)│
                       └────────────┬─────────────┘
                                    │ HTTPS
                   ┌────────────────▼─────────────────┐
                   │  Frontend (React + Vite + AntD)  │
                   │  demo-сборка → GitHub Pages      │
                   └────────────────┬─────────────────┘
                                    │ REST /api/v1 (JWT)
                   ┌────────────────▼─────────────────┐
                   │  API Gateway / NestJS            │
                   │  auth · projects · keywords ·    │
                   │  tasks · stats · billing · admin │
                   └───┬───────────┬──────────┬───────┘
                       │           │          │
          ┌────────────▼──┐  ┌─────▼─────┐  ┌─▼───────────────┐
          │ PostgreSQL 16 │  │ Redis 7   │  │ Scheduler (cron)│
          │ основная БД   │  │ кэш,      │  │ шаг 1 мин       │
          └───────────────┘  │ квоты,    │  └─┬───────────────┘
                             │ BullMQ    │    │ enqueue
                             └─────┬─────┘◄───┘
                                   │ consume
        ┌──────────────────────────┼───────────────────────────┐
        │                          │                           │
┌───────▼────────┐      ┌──────────▼─────────┐      ┌──────────▼─────────┐
│ worker-position│      │ worker-wordstat    │      │ worker-audit/ab    │
│ Яндекс XML,    │      │ Wordstat API       │      │ Playwright,        │
│ Google CSE     │      │                    │      │ Lighthouse         │
└───────┬────────┘      └──────────┬─────────┘      └──────────┬─────────┘
        └──────────────────────────┼───────────────────────────┘
                                   │
                        ┌──────────▼──────────┐
                        │ Внешние интеграции  │
                        │ ЮKassa · Метрика/GA4│
                        │ GSC · LLM API       │
                        └─────────────────────┘
```

Ключевые принципы:
- **Никакой эмуляции пользователей поисковика.** Позиции берутся из официальных
  платных API, региональность — параметром `lr`, а не подменой IP.
- **Квоты как first-class сущность.** Каждый вызов внешнего API проходит через
  token bucket в Redis, чтобы не превысить лимиты провайдера.
- **Идемпотентность задач.** `dedupe_key = project_id:keyword_id:region_id:YYYYMMDDHH`
  не даёт продублировать съём при рестарте планировщика.

## 2. Схема базы данных

```sql
-- Пользователи и доступ
CREATE TABLE users (
  id             BIGSERIAL PRIMARY KEY,
  email          CITEXT UNIQUE NOT NULL,
  password_hash  TEXT NOT NULL,                   -- argon2id
  role           TEXT NOT NULL DEFAULT 'user',    -- user | admin
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  balance_cents  BIGINT NOT NULL DEFAULT 0 CHECK (balance_cents >= 0),
  timezone       TEXT NOT NULL DEFAULT 'Europe/Moscow',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE projects (
  id             BIGSERIAL PRIMARY KEY,
  user_id        BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  domain         TEXT NOT NULL,
  search_engine  TEXT NOT NULL DEFAULT 'yandex',  -- yandex | google | both
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  ownership_verified BOOLEAN NOT NULL DEFAULT FALSE,
  verification_token TEXT,
  timezone       TEXT NOT NULL DEFAULT 'Europe/Moscow',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, domain)
);

CREATE TABLE regions (
  id        BIGSERIAL PRIMARY KEY,
  code      INT UNIQUE NOT NULL,   -- lr Яндекса: 213, 2, 51
  name      TEXT NOT NULL
);

CREATE TABLE project_regions (
  project_id BIGINT REFERENCES projects(id) ON DELETE CASCADE,
  region_id  BIGINT REFERENCES regions(id),
  PRIMARY KEY (project_id, region_id)
);

CREATE TABLE keywords (
  id           BIGSERIAL PRIMARY KEY,
  project_id   BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  keyword      TEXT NOT NULL,
  tag          TEXT,                    -- бывшая «подсказка» / метка группы
  interval_min INT NOT NULL DEFAULT 1440 CHECK (interval_min >= 60),
  target_url   TEXT,                    -- NULL → главная домена
  priority     SMALLINT NOT NULL DEFAULT 0,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  last_run_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, keyword)
);

CREATE TABLE schedules (
  project_id BIGINT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  days       SMALLINT[] NOT NULL DEFAULT '{1,2,3,4,5,6,7}',  -- ISO: 1=пн
  hour_from  SMALLINT NOT NULL DEFAULT 9  CHECK (hour_from BETWEEN 0 AND 23),
  hour_to    SMALLINT NOT NULL DEFAULT 21 CHECK (hour_to   BETWEEN 0 AND 24)
);

-- Очередь и результаты
CREATE TABLE tasks (
  id           BIGSERIAL PRIMARY KEY,
  project_id   BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  keyword_id   BIGINT REFERENCES keywords(id) ON DELETE CASCADE,
  region_id    BIGINT REFERENCES regions(id),
  type         TEXT NOT NULL,      -- position | wordstat | audit | ab_test
  status       TEXT NOT NULL DEFAULT 'queued',
                                   -- queued|running|done|not_found|error|cancelled
  attempts     SMALLINT NOT NULL DEFAULT 0,
  dedupe_key   TEXT UNIQUE,
  error_text   TEXT,
  cost_cents   INT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ
);
CREATE INDEX ON tasks (project_id, status, created_at DESC);

CREATE TABLE positions (
  id           BIGSERIAL PRIMARY KEY,
  keyword_id   BIGINT NOT NULL REFERENCES keywords(id) ON DELETE CASCADE,
  region_id    BIGINT NOT NULL REFERENCES regions(id),
  checked_on   DATE NOT NULL,
  position     SMALLINT,          -- NULL = вне топ-100
  found_url    TEXT,
  serp_json    JSONB,             -- сжатый снимок выдачи
  UNIQUE (keyword_id, region_id, checked_on)
);
CREATE INDEX ON positions (keyword_id, checked_on DESC);

CREATE TABLE frequencies (
  keyword_id       BIGINT REFERENCES keywords(id) ON DELETE CASCADE,
  region_id        BIGINT REFERENCES regions(id),
  measured_on      DATE NOT NULL,
  frequency_base   INT,
  frequency_quoted INT,
  frequency_exact  INT,
  PRIMARY KEY (keyword_id, region_id, measured_on)
);

-- Биллинг
CREATE TABLE payments (
  id             BIGSERIAL PRIMARY KEY,
  user_id        BIGINT NOT NULL REFERENCES users(id),
  amount_cents   BIGINT NOT NULL,
  provider       TEXT NOT NULL DEFAULT 'yookassa',
  provider_id    TEXT UNIQUE,
  status         TEXT NOT NULL,        -- pending | succeeded | canceled
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE balance_transactions (
  id           BIGSERIAL PRIMARY KEY,
  user_id      BIGINT NOT NULL REFERENCES users(id),
  delta_cents  BIGINT NOT NULL,
  reason       TEXT NOT NULL,          -- topup | task:position | refund | admin
  task_id      BIGINT REFERENCES tasks(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Админка
CREATE TABLE api_credentials (
  id            BIGSERIAL PRIMARY KEY,
  provider      TEXT NOT NULL,         -- yandex_xml | wordstat | gsc | metrika | llm
  label         TEXT,
  secret_enc    BYTEA NOT NULL,        -- AES-256-GCM
  daily_limit   INT,
  used_today    INT NOT NULL DEFAULT 0,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE audit_log (
  id         BIGSERIAL PRIMARY KEY,
  actor_id   BIGINT REFERENCES users(id),
  action     TEXT NOT NULL,
  payload    JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

## 3. REST API (v1)

Аутентификация: `Authorization: Bearer <access_token>`.
Ошибки: RFC 7807 (`application/problem+json`).

### Auth
| Метод | Путь | Описание |
| --- | --- | --- |
| POST | `/api/v1/auth/register` | `{email, password}` → письмо с токеном |
| POST | `/api/v1/auth/verify` | `{token}` |
| POST | `/api/v1/auth/login` | → `{access_token}` + refresh в cookie |
| POST | `/api/v1/auth/refresh` | обновление access |
| POST | `/api/v1/auth/logout` | |

### Проекты
| Метод | Путь | Описание |
| --- | --- | --- |
| GET | `/api/v1/projects` | список, `?page&limit&q` |
| POST | `/api/v1/projects` | `{name, domain, search_engine}` |
| GET | `/api/v1/projects/:id` | карточка + регионы + расписание |
| PATCH | `/api/v1/projects/:id` | `{name, is_active, ...}` |
| DELETE | `/api/v1/projects/:id` | |
| POST | `/api/v1/projects/:id/verify` | запуск проверки владения доменом |
| PUT | `/api/v1/projects/:id/regions` | `{region_ids: [213, 2]}` |
| PUT | `/api/v1/projects/:id/schedule` | `{days, hour_from, hour_to}` |

### Ключевые слова
| Метод | Путь | Описание |
| --- | --- | --- |
| GET | `/api/v1/projects/:id/keywords` | `?page&limit&tag&q` |
| POST | `/api/v1/projects/:id/keywords` | одиночное добавление |
| POST | `/api/v1/projects/:id/keywords/bulk` | `{text}` — ключи через `\n` |
| POST | `/api/v1/projects/:id/keywords/import` | `multipart/form-data`, xlsx/csv |
| PATCH | `/api/v1/keywords/:id` | |
| DELETE | `/api/v1/keywords/:id` | |

Пример ответа `POST /keywords/bulk`:
```json
{ "created": 42, "skipped_duplicates": 3, "invalid": ["   "] }
```

### Задачи
| Метод | Путь | Описание |
| --- | --- | --- |
| GET | `/api/v1/tasks` | `?project_id&status&type&from&to&page&limit` |
| GET | `/api/v1/tasks/:id` | детальный лог |
| POST | `/api/v1/tasks` | ручной запуск: `{project_id, keyword_ids[], type}` |
| POST | `/api/v1/tasks/:id/cancel` | |

### Статистика
| Метод | Путь | Описание |
| --- | --- | --- |
| GET | `/api/v1/stats/summary` | `?project_id&from&to` — топ-3/10/50/100, средняя позиция |
| GET | `/api/v1/stats/positions` | история по ключам |
| GET | `/api/v1/stats/frequencies` | частотности Wordstat |
| GET | `/api/v1/stats/export` | `?format=csv|xlsx` |

### Биллинг и профиль
| Метод | Путь | Описание |
| --- | --- | --- |
| GET | `/api/v1/profile` | баланс, email, таймзона |
| PATCH | `/api/v1/profile` | смена email/пароля/таймзоны |
| GET | `/api/v1/payments` | история |
| POST | `/api/v1/payments/topup` | `{amount_cents}` → `{confirmation_url}` ЮKassa |
| POST | `/api/v1/payments/webhook` | webhook ЮKassa (подпись проверяется) |

### Админ
`/api/v1/admin/credentials`, `/api/v1/admin/workers`, `/api/v1/admin/tasks`,
`/api/v1/admin/users`, `/api/v1/admin/regions` — CRUD, роль `admin`.

## 4. Ключевые фрагменты кода

### 4.1. Планировщик: постановка задач
```ts
// scheduler/position.scheduler.ts
@Cron('* * * * *')
async enqueueDuePositionTasks() {
  const rows = await this.db.query(`
    SELECT k.id AS keyword_id, k.project_id, pr.region_id
      FROM keywords k
      JOIN projects p        ON p.id = k.project_id AND p.is_active
      JOIN users u           ON u.id = p.user_id AND u.balance_cents > 0
      JOIN schedules s       ON s.project_id = p.id
      JOIN project_regions pr ON pr.project_id = p.id
     WHERE k.is_active
       AND (k.last_run_at IS NULL OR k.last_run_at + (k.interval_min * INTERVAL '1 minute') <= now())
       AND EXTRACT(ISODOW FROM now() AT TIME ZONE p.timezone) = ANY (s.days)
       AND EXTRACT(HOUR   FROM now() AT TIME ZONE p.timezone)
           BETWEEN s.hour_from AND s.hour_to - 1
     LIMIT 5000`);

  for (const r of rows) {
    const dedupeKey = `${r.project_id}:${r.keyword_id}:${r.region_id}:${hourStamp()}`;
    const task = await this.tasks.createIfAbsent({ ...r, type: 'position', dedupeKey });
    if (task) await this.queue.add('position', { taskId: task.id }, { attempts: 3, backoff: { type: 'exponential', delay: 30_000 } });
  }
}
```

### 4.2. Воркер съёма позиции (официальный Яндекс XML API)
```ts
// workers/position.worker.ts
export const processPosition = async (job: Job<{ taskId: number }>) => {
  const task = await tasks.startRunning(job.data.taskId);
  const { keyword, domain, regionCode } = await tasks.loadContext(task);

  const cred = await quotas.acquire('yandex_xml');           // token bucket в Redis
  const serp = await yandexXml.search({
    query: keyword.tag ? `${keyword.keyword} ${keyword.tag}` : keyword.keyword,
    lr: regionCode,
    depth: 100,
    user: cred.user,
    key: cred.secret,
  });

  const hit = serp.results.findIndex((r) => sameSite(r.url, domain));
  if (hit === -1) return tasks.finish(task, 'not_found', { serp });

  await positions.upsert({
    keywordId: keyword.id,
    regionId: task.region_id,
    checkedOn: today(),
    position: hit + 1,
    foundUrl: serp.results[hit].url,
    serpJson: compact(serp),
  });
  await billing.charge(task, PRICE_POSITION_CENTS);          // транзакция с FOR UPDATE
  return tasks.finish(task, 'done');
};

/** Сравнение по eTLD+1, чтобы www./поддомены считались тем же сайтом. */
const sameSite = (url: string, domain: string) =>
  registrableDomain(new URL(url).hostname) === registrableDomain(domain);
```

### 4.3. Списание баланса без ухода в минус
```ts
async charge(task: Task, cents: number) {
  return this.db.transaction(async (trx) => {
    const user = await trx.one(
      'SELECT balance_cents FROM users WHERE id = $1 FOR UPDATE', [task.user_id]);
    if (user.balance_cents < cents) throw new InsufficientBalanceError();
    await trx.none('UPDATE users SET balance_cents = balance_cents - $2 WHERE id = $1',
      [task.user_id, cents]);
    await trx.none(`INSERT INTO balance_transactions (user_id, delta_cents, reason, task_id)
                    VALUES ($1, $2, $3, $4)`, [task.user_id, -cents, `task:${task.type}`, task.id]);
  });
}
```

### 4.4. API ключевых слов (массовый ввод)
```ts
@Post(':id/keywords/bulk')
async bulk(@Param('id') projectId: number, @Body() dto: BulkKeywordsDto, @User() user) {
  await this.projects.assertOwner(projectId, user.id);
  const lines = dto.text.split('\n').map((s) => s.trim());
  const valid = [...new Set(lines.filter((s) => s.length > 0 && s.length <= 200))];
  const created = await this.keywords.insertMany(projectId, valid);  // ON CONFLICT DO NOTHING
  return { created: created.length, skipped_duplicates: valid.length - created.length,
           invalid: lines.filter((s) => !s.length).length };
}
```

### 4.5. E2E-проверка собственной воронки (Playwright, без антидетекта)
```ts
// workers/ab-test.worker.ts — работает только по подтверждённым доменам
const browser = await chromium.launch();                     // обычный headless
const page = await browser.newPage();
await page.goto(`https://${project.domain}${scenario.entryPath}`);
for (const step of scenario.steps) {
  await page.click(step.selector);
  await page.waitForLoadState('networkidle');
  metrics.push({ step: step.name, ms: await page.evaluate(() => performance.now()) });
}
await page.screenshot({ path: `runs/${task.id}.png`, fullPage: true });
```

## 5. Демо-режим для GitHub Pages
`app/` — статическая версия личного кабинета: те же экраны и модель данных, но
хранилище — `localStorage`, а вместо вызовов API — модуль `app/js/api.js` с
единым интерфейсом. При переходе на реальный backend меняется только реализация
этого модуля (`fetch('/api/v1/...')`), экраны не трогаются.
