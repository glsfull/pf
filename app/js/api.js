/**
 * Слой доступа к данным.
 *
 * В демо-режиме (GitHub Pages) данные лежат в localStorage, а этот модуль имитирует
 * REST API из docs/ARCHITECTURE.md §3. При переходе на реальный backend достаточно
 * заменить тела методов на fetch('/api/v1/...') — сигнатуры и формы ответов совпадают.
 */

const KEY = 'pf.demo.v1';

export const REGIONS = [
  { id: 1, code: 213, name: 'Москва' },
  { id: 2, code: 2, name: 'Санкт-Петербург' },
  { id: 3, code: 51, name: 'Самара' },
];

export const TASK_STATUSES = ['queued', 'running', 'done', 'not_found', 'error', 'cancelled'];

export const STATUS_LABELS = {
  queued: 'В очереди',
  running: 'В процессе',
  done: 'Завершено',
  not_found: 'Не найдено',
  error: 'Ошибка',
  cancelled: 'Отменено',
};

export const TASK_TYPES = {
  position: 'Съём позиции',
  wordstat: 'Частотность',
  audit: 'Технический аудит',
  ab_test: 'A/B-тест',
};

/** Детерминированный ГПСЧ, чтобы демо-данные и тесты были воспроизводимы. */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const clone = (v) => JSON.parse(JSON.stringify(v));
const todayIso = () => new Date().toISOString().slice(0, 10);

function emptyState() {
  return {
    seq: 1,
    profile: {
      email: 'seo@example.com',
      timezone: 'Europe/Moscow',
      balance_cents: 250000,
    },
    projects: [],
    keywords: [],
    tasks: [],
    positions: [],
    frequencies: [],
    payments: [],
  };
}

let state = null;

function load() {
  if (state) return state;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      state = JSON.parse(raw);
      return state;
    }
  } catch {
    /* повреждённое хранилище — пересоздаём демо */
  }
  state = seed();
  save();
  return state;
}

function save() {
  localStorage.setItem(KEY, JSON.stringify(state));
}

function nextId() {
  return state.seq++;
}

/** Демо-данные: один проект, 8 ключей, история позиций за 30 дней, очередь задач. */
function seed() {
  const rand = rng(20260725);
  const s = emptyState();
  state = s;

  const project = {
    id: nextId(),
    name: 'Аналитика маркетплейсов',
    domain: 'analitika-marketpleysov.ru',
    search_engine: 'yandex',
    is_active: true,
    ownership_verified: true,
    region_ids: [1, 2],
    schedule: { days: [1, 2, 3, 4, 5], hour_from: 9, hour_to: 21 },
    created_at: '2026-06-01T10:00:00.000Z',
  };
  s.projects.push(project);

  const seedKeywords = [
    ['аналитика wildberries', 'сервис', 1440, '/wildberries'],
    ['аналитика яндекс маркет', 'сервис', 1440, '/yandex-market'],
    ['аналитика ozon', 'сервис', 1440, '/ozon'],
    ['статистика продаж маркетплейс', '', 2880, ''],
    ['подбор товара для wildberries', '', 1440, '/tools/product-picker'],
    ['seo для маркетплейсов', 'гайд', 4320, '/blog/seo'],
    ['отчёт по продажам wb', '', 1440, '/reports'],
    ['выгрузка остатков ozon', '', 2880, '/reports/stock'],
  ];

  for (const [keyword, tag, interval, url] of seedKeywords) {
    const kw = {
      id: nextId(),
      project_id: project.id,
      keyword,
      tag,
      interval_min: interval,
      target_url: url,
      is_active: true,
      created_at: project.created_at,
    };
    s.keywords.push(kw);

    s.frequencies.push({
      keyword_id: kw.id,
      region_id: 1,
      measured_on: todayIso(),
      frequency_base: 200 + Math.floor(rand() * 12000),
      frequency_quoted: 50 + Math.floor(rand() * 3000),
      frequency_exact: 10 + Math.floor(rand() * 900),
    });

    // История позиций за 30 дней с плавным трендом вверх.
    let pos = 25 + Math.floor(rand() * 60);
    for (let d = 29; d >= 0; d--) {
      const date = new Date(Date.now() - d * 86400000).toISOString().slice(0, 10);
      pos = Math.max(1, Math.min(100, pos + Math.round((rand() - 0.62) * 6)));
      const outOfTop = rand() < 0.04;
      s.positions.push({
        keyword_id: kw.id,
        region_id: 1,
        checked_on: date,
        position: outOfTop ? null : pos,
        found_url: outOfTop ? null : `https://${project.domain}${url || '/'}`,
      });
    }
  }

  // Очередь задач: по одной за последние часы для каждого ключа.
  const statusPool = ['done', 'done', 'done', 'not_found', 'done', 'error', 'queued', 'running'];
  s.keywords.forEach((kw, i) => {
    const created = new Date(Date.now() - (i + 1) * 3600000);
    const status = statusPool[i % statusPool.length];
    const finished = status === 'queued' || status === 'running';
    s.tasks.push({
      id: nextId(),
      project_id: project.id,
      keyword_id: kw.id,
      region_id: 1,
      type: 'position',
      status,
      attempts: status === 'error' ? 3 : 1,
      error_text: status === 'error' ? 'HTTP 429 от Яндекс XML API: превышена дневная квота' : null,
      created_at: created.toISOString(),
      processed_at: finished ? null : new Date(created.getTime() + 99000).toISOString(),
    });
  });

  s.payments.push({
    id: nextId(),
    amount_cents: 250000,
    status: 'succeeded',
    provider: 'yookassa',
    created_at: '2026-06-01T10:05:00.000Z',
  });

  return s;
}

/* ---------------------------------------------------------------- Профиль */

export const api = {
  resetDemo() {
    localStorage.removeItem(KEY);
    state = null;
    load();
  },

  getProfile() {
    return clone(load().profile);
  },

  updateProfile(patch) {
    const p = load().profile;
    if (patch.email) p.email = patch.email;
    if (patch.timezone) p.timezone = patch.timezone;
    save();
    return clone(p);
  },

  /* -------------------------------------------------------------- Проекты */

  listProjects() {
    const s = load();
    return s.projects.map((p) => ({
      ...clone(p),
      keywords_count: s.keywords.filter((k) => k.project_id === p.id).length,
      avg_position: avgPosition(s, p.id),
    }));
  },

  getProject(id) {
    const p = load().projects.find((x) => x.id === Number(id));
    return p ? clone(p) : null;
  },

  createProject({ name, domain, search_engine = 'yandex' }) {
    const s = load();
    const cleanName = String(name || '').trim();
    const cleanDomain = normalizeDomain(domain);
    if (!cleanName) throw new Error('Укажите название проекта');
    if (!cleanDomain) throw new Error('Укажите корректный домен, например example.ru');
    if (s.projects.some((p) => p.domain === cleanDomain)) {
      throw new Error('Проект с таким доменом уже существует');
    }
    const project = {
      id: nextId(),
      name: cleanName,
      domain: cleanDomain,
      search_engine,
      is_active: true,
      ownership_verified: false,
      region_ids: [1],
      schedule: { days: [1, 2, 3, 4, 5], hour_from: 9, hour_to: 21 },
      created_at: new Date().toISOString(),
    };
    s.projects.push(project);
    save();
    return clone(project);
  },

  updateProject(id, patch) {
    const s = load();
    const p = s.projects.find((x) => x.id === Number(id));
    if (!p) throw new Error('Проект не найден');
    Object.assign(p, patch);
    save();
    return clone(p);
  },

  deleteProject(id) {
    const s = load();
    const pid = Number(id);
    s.projects = s.projects.filter((p) => p.id !== pid);
    const killed = s.keywords.filter((k) => k.project_id === pid).map((k) => k.id);
    s.keywords = s.keywords.filter((k) => k.project_id !== pid);
    s.tasks = s.tasks.filter((t) => t.project_id !== pid);
    s.positions = s.positions.filter((x) => !killed.includes(x.keyword_id));
    s.frequencies = s.frequencies.filter((x) => !killed.includes(x.keyword_id));
    save();
  },

  /* ------------------------------------------------------ Ключевые слова */

  listKeywords(projectId) {
    const s = load();
    return s.keywords
      .filter((k) => k.project_id === Number(projectId))
      .map((k) => ({ ...clone(k), last_position: lastPosition(s, k.id) }));
  },

  createKeyword(projectId, data) {
    const s = load();
    const keyword = String(data.keyword || '').trim();
    if (!keyword) throw new Error('Ключевое слово не может быть пустым');
    if (keyword.length > 200) throw new Error('Ключевое слово длиннее 200 символов');
    const pid = Number(projectId);
    if (s.keywords.some((k) => k.project_id === pid && k.keyword === keyword)) {
      throw new Error('Такое ключевое слово уже добавлено');
    }
    const kw = {
      id: nextId(),
      project_id: pid,
      keyword,
      tag: String(data.tag || '').trim(),
      interval_min: clampInterval(data.interval_min),
      target_url: String(data.target_url || '').trim(),
      is_active: true,
      created_at: new Date().toISOString(),
    };
    s.keywords.push(kw);
    save();
    return clone(kw);
  },

  /** Массовый ввод: по одному ключу на строку. */
  bulkKeywords(projectId, text) {
    const lines = String(text || '').split('\n');
    let created = 0;
    let skipped = 0;
    let invalid = 0;
    for (const line of lines) {
      const value = line.trim();
      if (!value) {
        invalid++;
        continue;
      }
      try {
        this.createKeyword(projectId, { keyword: value });
        created++;
      } catch {
        skipped++;
      }
    }
    return { created, skipped_duplicates: skipped, invalid };
  },

  /**
   * Импорт CSV. Колонки: keyword, tag, interval_min, target_url.
   * Разделитель — запятая или точка с запятой; первая строка-заголовок пропускается.
   */
  importCsv(projectId, csvText) {
    const rows = String(csvText || '')
      .split(/\r?\n/)
      .map((r) => r.trim())
      .filter(Boolean);
    if (!rows.length) return { created: 0, skipped_duplicates: 0, invalid: 0 };

    const split = (line) => line.split(/[;,]/).map((c) => c.trim().replace(/^"|"$/g, ''));
    const first = split(rows[0]);
    const hasHeader = /keyword|ключ/i.test(first[0]);
    const body = hasHeader ? rows.slice(1) : rows;

    let created = 0;
    let skipped = 0;
    let invalid = 0;
    for (const line of body) {
      const [keyword, tag, interval, url] = split(line);
      if (!keyword) {
        invalid++;
        continue;
      }
      try {
        this.createKeyword(projectId, {
          keyword,
          tag,
          interval_min: Number(interval) || 1440,
          target_url: url,
        });
        created++;
      } catch {
        skipped++;
      }
    }
    return { created, skipped_duplicates: skipped, invalid };
  },

  updateKeyword(id, patch) {
    const s = load();
    const k = s.keywords.find((x) => x.id === Number(id));
    if (!k) throw new Error('Ключевое слово не найдено');
    if (patch.keyword !== undefined) {
      const value = String(patch.keyword).trim();
      if (!value) throw new Error('Ключевое слово не может быть пустым');
      k.keyword = value;
    }
    if (patch.tag !== undefined) k.tag = String(patch.tag).trim();
    if (patch.target_url !== undefined) k.target_url = String(patch.target_url).trim();
    if (patch.interval_min !== undefined) k.interval_min = clampInterval(patch.interval_min);
    if (patch.is_active !== undefined) k.is_active = Boolean(patch.is_active);
    save();
    return clone(k);
  },

  deleteKeyword(id) {
    const s = load();
    const kid = Number(id);
    s.keywords = s.keywords.filter((k) => k.id !== kid);
    s.tasks = s.tasks.filter((t) => t.keyword_id !== kid);
    s.positions = s.positions.filter((p) => p.keyword_id !== kid);
    s.frequencies = s.frequencies.filter((f) => f.keyword_id !== kid);
    save();
  },

  /* ---------------------------------------------------------------- Задачи */

  /**
   * Ручная постановка задач в очередь. Повторяет проверки планировщика:
   * проект включён и баланс покрывает стоимость.
   */
  enqueue(projectId, keywordIds, type = 'position') {
    const s = load();
    const project = s.projects.find((p) => p.id === Number(projectId));
    if (!project) throw new Error('Проект не найден');
    if (!project.is_active) throw new Error('Проект выключен — задачи не ставятся в очередь');

    const ids = keywordIds && keywordIds.length
      ? keywordIds.map(Number)
      : s.keywords.filter((k) => k.project_id === project.id && k.is_active).map((k) => k.id);
    if (!ids.length) throw new Error('Нет активных ключевых слов');

    const cost = ids.length * PRICE_CENTS[type];
    if (s.profile.balance_cents < cost) {
      throw new Error('Недостаточно средств на балансе для постановки задач');
    }

    const created = [];
    for (const keywordId of ids) {
      const task = {
        id: nextId(),
        project_id: project.id,
        keyword_id: keywordId,
        region_id: project.region_ids[0] || 1,
        type,
        status: 'queued',
        attempts: 0,
        error_text: null,
        created_at: new Date().toISOString(),
        processed_at: null,
      };
      s.tasks.push(task);
      created.push(task);
    }
    save();
    return { created: created.length, cost_cents: cost };
  },

  listTasks({ projectId = null, status = null, type = null, page = 1, limit = 20 } = {}) {
    const s = load();
    let rows = s.tasks.slice().sort((a, b) => b.created_at.localeCompare(a.created_at));
    if (projectId) rows = rows.filter((t) => t.project_id === Number(projectId));
    if (status) rows = rows.filter((t) => t.status === status);
    if (type) rows = rows.filter((t) => t.type === type);

    const total = rows.length;
    const pages = Math.max(1, Math.ceil(total / limit));
    const current = Math.min(Math.max(1, page), pages);
    const items = rows.slice((current - 1) * limit, current * limit).map((t) => ({
      ...clone(t),
      domain: (s.projects.find((p) => p.id === t.project_id) || {}).domain || '—',
      keyword: (s.keywords.find((k) => k.id === t.keyword_id) || {}).keyword || '—',
    }));
    return { items, total, page: current, pages };
  },

  taskCounters(projectId = null) {
    const rows = load().tasks.filter((t) => !projectId || t.project_id === Number(projectId));
    const counters = { total: rows.length };
    for (const st of TASK_STATUSES) counters[st] = rows.filter((t) => t.status === st).length;
    return counters;
  },

  cancelTask(id) {
    const s = load();
    const t = s.tasks.find((x) => x.id === Number(id));
    if (!t) throw new Error('Задача не найдена');
    if (t.status !== 'queued' && t.status !== 'running') {
      throw new Error('Отменить можно только задачу в очереди или в процессе');
    }
    t.status = 'cancelled';
    t.processed_at = new Date().toISOString();
    save();
    return clone(t);
  },

  /* ----------------------------------------------------------- Статистика */

  summary(projectId = null) {
    const s = load();
    const kwIds = s.keywords
      .filter((k) => !projectId || k.project_id === Number(projectId))
      .map((k) => k.id);
    const latest = kwIds
      .map((id) => lastPosition(s, id))
      .filter((p) => p !== null && p !== undefined);

    const inTop = (n) => latest.filter((p) => p <= n).length;
    const avg = latest.length
      ? Math.round((latest.reduce((a, b) => a + b, 0) / latest.length) * 10) / 10
      : null;
    return {
      keywords: kwIds.length,
      tracked: latest.length,
      avg_position: avg,
      top3: inTop(3),
      top10: inTop(10),
      top50: inTop(50),
      top100: latest.length,
      out_of_top: kwIds.length - latest.length,
    };
  },

  /** Динамика средней позиции по дням за `days` последних дней. */
  avgPositionSeries(projectId = null, days = 30) {
    const s = load();
    const kwIds = new Set(
      s.keywords.filter((k) => !projectId || k.project_id === Number(projectId)).map((k) => k.id),
    );
    const byDate = new Map();
    for (const p of s.positions) {
      if (!kwIds.has(p.keyword_id) || p.position == null) continue;
      const bucket = byDate.get(p.checked_on) || [];
      bucket.push(p.position);
      byDate.set(p.checked_on, bucket);
    }
    return [...byDate.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-days)
      .map(([date, list]) => ({
        date,
        value: Math.round((list.reduce((a, b) => a + b, 0) / list.length) * 10) / 10,
      }));
  },

  positionHistory(keywordId, days = 30) {
    return load()
      .positions.filter((p) => p.keyword_id === Number(keywordId))
      .sort((a, b) => a.checked_on.localeCompare(b.checked_on))
      .slice(-days)
      .map(clone);
  },

  frequencies(projectId = null) {
    const s = load();
    return s.keywords
      .filter((k) => !projectId || k.project_id === Number(projectId))
      .map((k) => {
        const f = s.frequencies.find((x) => x.keyword_id === k.id) || {};
        return {
          keyword_id: k.id,
          keyword: k.keyword,
          frequency_base: f.frequency_base ?? null,
          frequency_quoted: f.frequency_quoted ?? null,
          frequency_exact: f.frequency_exact ?? null,
          position: lastPosition(s, k.id),
        };
      });
  },

  exportCsv(projectId = null) {
    const s = load();
    const head = 'keyword;tag;region;date;position;frequency_base';
    const lines = [head];
    for (const k of s.keywords) {
      if (projectId && k.project_id !== Number(projectId)) continue;
      const f = s.frequencies.find((x) => x.keyword_id === k.id) || {};
      for (const p of s.positions.filter((x) => x.keyword_id === k.id)) {
        const region = (REGIONS.find((r) => r.id === p.region_id) || {}).name || '';
        lines.push([
          k.keyword, k.tag || '', region, p.checked_on,
          p.position ?? '', f.frequency_base ?? '',
        ].join(';'));
      }
    }
    return lines.join('\n');
  },

  /* -------------------------------------------------------------- Биллинг */

  listPayments() {
    return load().payments.slice().sort((a, b) => b.created_at.localeCompare(a.created_at)).map(clone);
  },

  /** Демо-пополнение. В проде — создание платежа в ЮKassa и подтверждение по webhook. */
  topUp(amountRub) {
    const s = load();
    const cents = Math.round(Number(amountRub) * 100);
    if (!Number.isFinite(cents) || cents <= 0) throw new Error('Сумма должна быть больше нуля');
    s.profile.balance_cents += cents;
    s.payments.push({
      id: nextId(),
      amount_cents: cents,
      status: 'succeeded',
      provider: 'yookassa-demo',
      created_at: new Date().toISOString(),
    });
    save();
    return clone(s.profile);
  },
};

export const PRICE_CENTS = { position: 30, wordstat: 20, audit: 500, ab_test: 1000 };

/* ------------------------------------------------------------- Вспомогательное */

function clampInterval(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 1440;
  return Math.min(43200, Math.max(60, Math.round(n)));
}

export function normalizeDomain(input) {
  let v = String(input || '').trim().toLowerCase();
  if (!v) return '';
  v = v.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].split('?')[0];
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(v) ? v : '';
}

function lastPosition(s, keywordId) {
  const rows = s.positions
    .filter((p) => p.keyword_id === keywordId)
    .sort((a, b) => a.checked_on.localeCompare(b.checked_on));
  return rows.length ? rows[rows.length - 1].position : null;
}

function avgPosition(s, projectId) {
  const values = s.keywords
    .filter((k) => k.project_id === projectId)
    .map((k) => lastPosition(s, k.id))
    .filter((p) => p != null);
  if (!values.length) return null;
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
}
