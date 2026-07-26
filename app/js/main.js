import { api, REGIONS, STATUS_LABELS, TASK_STATUSES, TASK_TYPES, PRICE_CENTS } from './api.js';
import { esc, rub, dt, toast, lineChart, download } from './ui.js';

const view = document.getElementById('view');
const DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

const route = {
  view: 'projects',
  projectId: null,
  tab: 'keywords',
  taskPage: 1,
  taskStatus: '',
  statsKeyword: null,
};

/* ------------------------------------------------------------- Навигация */

function go(patch) {
  Object.assign(route, patch);
  render();
}

document.getElementById('nav').addEventListener('click', (e) => {
  const btn = e.target.closest('.tab');
  if (btn) go({ view: btn.dataset.view, projectId: null });
});

document.getElementById('reset-demo').addEventListener('click', () => {
  if (confirm('Сбросить демо-данные и вернуть исходный пример?')) {
    api.resetDemo();
    go({ view: 'projects', projectId: null });
    toast('Демо-данные восстановлены');
  }
});

function render() {
  for (const tab of document.querySelectorAll('.tab')) {
    tab.classList.toggle('active', tab.dataset.view === route.view);
  }
  const profile = api.getProfile();
  document.getElementById('balance-chip').textContent = `Баланс: ${rub(profile.balance_cents)}`;

  if (route.view === 'projects') return route.projectId ? renderProject() : renderProjects();
  if (route.view === 'tasks') return renderTasks();
  if (route.view === 'stats') return renderStats();
  if (route.view === 'profile') return renderProfile();
}

/* --------------------------------------------------------- Мои проекты */

function renderProjects() {
  const projects = api.listProjects();
  view.innerHTML = `
    <h1>Мои проекты</h1>
    <div class="card">
      <h2>Создать проект</h2>
      <div class="row">
        <div class="grow"><label for="np-name">Название</label>
          <input id="np-name" data-testid="new-project-name" placeholder="Например, Аналитика маркетплейсов"></div>
        <div class="grow"><label for="np-domain">Домен сайта</label>
          <input id="np-domain" data-testid="new-project-domain" placeholder="example.ru"></div>
        <div class="field"><label for="np-se">Поисковая система</label>
          <select id="np-se"><option value="yandex">Яндекс</option><option value="google">Google</option><option value="both">Обе</option></select></div>
        <button class="btn" id="np-create" data-testid="create-project">Создать проект</button>
      </div>
    </div>
    ${projects.length ? '' : '<p class="empty" data-testid="no-projects">Проектов пока нет — создайте первый.</p>'}
    ${projects
      .map(
        (p) => `
      <div class="card project-card" data-project="${p.id}" data-testid="project-card">
        <div class="row">
          <div class="grow">
            <strong>${esc(p.name)}</strong>
            <span class="badge ${p.is_active ? 'on' : 'off'}">${p.is_active ? 'Включён' : 'Выключен'}</span>
            <div class="muted">${esc(p.domain)} · ключей: ${p.keywords_count} · средняя позиция: ${p.avg_position ?? '—'}</div>
          </div>
          <div class="muted">создан ${dt(p.created_at)}</div>
          <button class="btn ghost" data-open="${p.id}">Открыть</button>
        </div>
      </div>`,
      )
      .join('')}
  `;

  document.getElementById('np-create').addEventListener('click', () => {
    try {
      const p = api.createProject({
        name: document.getElementById('np-name').value,
        domain: document.getElementById('np-domain').value,
        search_engine: document.getElementById('np-se').value,
      });
      toast(`Проект «${p.name}» создан`);
      go({ projectId: p.id, tab: 'keywords' });
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  // onclick, а не addEventListener: обработчик пересоздаётся при каждом render().
  view.onclick = (e) => {
    const card = e.target.closest('[data-project]');
    if (card) go({ projectId: Number(card.dataset.project), tab: 'keywords' });
  };
}

/* ------------------------------------------------------- Карточка проекта */

function renderProject() {
  const project = api.getProject(route.projectId);
  if (!project) return go({ projectId: null });

  const tabs = [
    ['keywords', 'Ключевые слова'],
    ['regions', 'Регионы'],
    ['schedule', 'Расписание'],
    ['extra', 'Дополнительно'],
  ];

  view.innerHTML = `
    <div class="row">
      <button class="btn ghost" id="back">← К списку</button>
      <h1 style="margin:0">${esc(project.name)} <span class="muted">${esc(project.domain)}</span></h1>
      <span class="badge ${project.is_active ? 'on' : 'off'}" data-testid="project-status">
        ${project.is_active ? 'Включён' : 'Выключен'}</span>
    </div>
    <div class="subtabs" id="subtabs">
      ${tabs.map(([id, label]) => `<button class="subtab ${route.tab === id ? 'active' : ''}" data-tab="${id}">${label}</button>`).join('')}
    </div>
    <div id="tab-body"></div>
  `;

  document.getElementById('back').addEventListener('click', () => go({ projectId: null }));
  document.getElementById('subtabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (b) go({ tab: b.dataset.tab });
  });

  const body = document.getElementById('tab-body');
  if (route.tab === 'keywords') return renderKeywordsTab(body, project);
  if (route.tab === 'regions') return renderRegionsTab(body, project);
  if (route.tab === 'schedule') return renderScheduleTab(body, project);
  return renderExtraTab(body, project);
}

function renderKeywordsTab(body, project) {
  const keywords = api.listKeywords(project.id);
  body.innerHTML = `
    <div class="card">
      <h2>Добавить ключевое слово</h2>
      <div class="row">
        <div class="grow"><label for="kw-text">Ключевое слово</label>
          <input id="kw-text" data-testid="kw-input" placeholder="аналитика wildberries"></div>
        <div class="field"><label for="kw-tag">Тег</label><input id="kw-tag" placeholder="сервис"></div>
        <div class="field"><label for="kw-int">Интервал, мин</label><input id="kw-int" type="number" min="60" value="1440"></div>
        <div class="grow"><label for="kw-url">Целевой URL</label><input id="kw-url" placeholder="/wildberries"></div>
        <button class="btn" id="kw-add" data-testid="kw-add">Добавить</button>
      </div>
    </div>

    <div class="card">
      <h2>Массовый ввод</h2>
      <p class="muted">По одному ключевому слову в строке (разделитель — Enter).</p>
      <textarea id="kw-bulk" data-testid="kw-bulk" placeholder="аналитика ozon&#10;статистика продаж"></textarea>
      <div class="row" style="margin-top:10px">
        <button class="btn" id="kw-bulk-add" data-testid="kw-bulk-add">Добавить списком</button>
      </div>
    </div>

    <div class="card">
      <h2>Импорт из CSV</h2>
      <p class="muted">Колонки: keyword, tag, interval_min, target_url. Разделитель «,» или «;».</p>
      <input type="file" id="kw-file" accept=".csv,text/csv" data-testid="kw-file">
    </div>

    <div class="card">
      <div class="row">
        <h2 style="flex:1;margin:0">Ключевые слова (${keywords.length})</h2>
        <button class="btn" id="kw-enqueue" data-testid="kw-enqueue">Поставить съём позиций в очередь</button>
      </div>
      ${
        keywords.length
          ? `<table data-testid="kw-table"><thead><tr>
              <th>Ключевое слово</th><th>Тег</th><th>Интервал</th><th>Целевой URL</th>
              <th class="num">Позиция</th><th></th></tr></thead><tbody>
              ${keywords
                .map(
                  (k) => `<tr data-kw="${k.id}">
                    <td><input value="${esc(k.keyword)}" data-field="keyword"></td>
                    <td><input value="${esc(k.tag)}" data-field="tag" style="width:110px"></td>
                    <td><input type="number" min="60" value="${k.interval_min}" data-field="interval_min" style="width:90px"></td>
                    <td><input value="${esc(k.target_url)}" data-field="target_url"></td>
                    <td class="num">${k.last_position ?? '—'}</td>
                    <td class="row">
                      <button class="btn ghost" data-save="${k.id}">Сохранить</button>
                      <button class="btn danger" data-del="${k.id}">Удалить</button>
                    </td></tr>`,
                )
                .join('')}
             </tbody></table>`
          : '<p class="empty" data-testid="kw-empty">Ключевых слов пока нет.</p>'
      }
    </div>
  `;

  document.getElementById('kw-add').addEventListener('click', () => {
    try {
      api.createKeyword(project.id, {
        keyword: document.getElementById('kw-text').value,
        tag: document.getElementById('kw-tag').value,
        interval_min: document.getElementById('kw-int').value,
        target_url: document.getElementById('kw-url').value,
      });
      toast('Ключевое слово добавлено');
      render();
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  document.getElementById('kw-bulk-add').addEventListener('click', () => {
    const res = api.bulkKeywords(project.id, document.getElementById('kw-bulk').value);
    toast(`Добавлено: ${res.created}, дублей пропущено: ${res.skipped_duplicates}`);
    render();
  });

  document.getElementById('kw-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const res = api.importCsv(project.id, await file.text());
    toast(`Импорт: добавлено ${res.created}, дублей ${res.skipped_duplicates}, ошибок ${res.invalid}`);
    render();
  });

  document.getElementById('kw-enqueue').addEventListener('click', () => {
    try {
      const res = api.enqueue(project.id, [], 'position');
      toast(`В очередь поставлено задач: ${res.created} на сумму ${rub(res.cost_cents)}`);
      go({ view: 'tasks', projectId: null });
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  body.onclick = (e) => {
    const saveId = e.target.dataset.save;
    const delId = e.target.dataset.del;
    if (saveId) {
      const row = e.target.closest('tr');
      const patch = {};
      for (const input of row.querySelectorAll('[data-field]')) patch[input.dataset.field] = input.value;
      try {
        api.updateKeyword(saveId, patch);
        toast('Сохранено');
        render();
      } catch (err) {
        toast(err.message, 'error');
      }
    }
    if (delId && confirm('Удалить ключевое слово вместе с историей позиций?')) {
      api.deleteKeyword(delId);
      render();
    }
  };
}

function renderRegionsTab(body, project) {
  body.innerHTML = `
    <div class="card">
      <h2>Регионы съёма</h2>
      <p class="muted">Регион передаётся параметром <code>lr</code> в официальный поисковый API — без подмены IP.</p>
      <div class="checks" data-testid="regions">
        ${REGIONS.map(
          (r) => `<label><input type="checkbox" value="${r.id}" ${project.region_ids.includes(r.id) ? 'checked' : ''}>
            ${esc(r.name)} <span class="muted">lr=${r.code}</span></label>`,
        ).join('')}
      </div>
      <div class="row" style="margin-top:12px"><button class="btn" id="rg-save" data-testid="regions-save">Сохранить</button></div>
    </div>`;

  document.getElementById('rg-save').addEventListener('click', () => {
    const ids = [...body.querySelectorAll('input[type=checkbox]:checked')].map((i) => Number(i.value));
    if (!ids.length) return toast('Выберите хотя бы один регион', 'error');
    api.updateProject(project.id, { region_ids: ids });
    toast('Регионы сохранены');
    render();
  });
}

function renderScheduleTab(body, project) {
  const s = project.schedule;
  body.innerHTML = `
    <div class="card">
      <h2>Расписание съёма</h2>
      <div class="checks" data-testid="days">
        ${DAYS.map(
          (d, i) => `<label><input type="checkbox" value="${i + 1}" ${s.days.includes(i + 1) ? 'checked' : ''}> ${d}</label>`,
        ).join('')}
      </div>
      <div class="row" style="margin-top:12px">
        <div class="field"><label for="sc-from">Час начала</label><input id="sc-from" type="number" min="0" max="23" value="${s.hour_from}"></div>
        <div class="field"><label for="sc-to">Час окончания</label><input id="sc-to" type="number" min="1" max="24" value="${s.hour_to}"></div>
        <button class="btn" id="sc-save" data-testid="schedule-save">Сохранить расписание</button>
      </div>
      <p class="muted" style="margin-top:10px">Задачи ставятся в очередь только внутри окна и при включённом проекте.</p>
    </div>`;

  document.getElementById('sc-save').addEventListener('click', () => {
    const days = [...body.querySelectorAll('[data-testid=days] input:checked')].map((i) => Number(i.value));
    const from = Number(document.getElementById('sc-from').value);
    const to = Number(document.getElementById('sc-to').value);
    if (!days.length) return toast('Выберите хотя бы один день недели', 'error');
    if (!(to > from)) return toast('Час окончания должен быть больше часа начала', 'error');
    api.updateProject(project.id, { schedule: { days, hour_from: from, hour_to: to } });
    toast('Расписание сохранено');
    render();
  });
}

function renderExtraTab(body, project) {
  body.innerHTML = `
    <div class="card">
      <h2>Состояние проекта</h2>
      <p class="muted">Глобальный рубильник: при выключении новые задачи не ставятся в очередь.</p>
      <button class="btn ${project.is_active ? 'danger' : ''}" id="pj-toggle" data-testid="project-toggle">
        ${project.is_active ? 'Выключить проект' : 'Включить проект'}
      </button>
    </div>
    <div class="card">
      <h2>Подтверждение владения доменом</h2>
      <p class="muted">Требуется для технического аудита и e2e-сценариев по вашему сайту.</p>
      <p>Статус: <span class="badge ${project.ownership_verified ? 'on' : 'off'}">
        ${project.ownership_verified ? 'Подтверждено' : 'Не подтверждено'}</span></p>
      <p class="muted">DNS TXT: <code>pf-verify=${project.id}-${esc(project.domain)}</code></p>
      ${project.ownership_verified ? '' : '<button class="btn ghost" id="pj-verify">Проверить владение</button>'}
    </div>
    <div class="card">
      <h2>Удаление</h2>
      <button class="btn danger" id="pj-delete">Удалить проект</button>
    </div>`;

  document.getElementById('pj-toggle').addEventListener('click', () => {
    api.updateProject(project.id, { is_active: !project.is_active });
    toast(project.is_active ? 'Проект выключен' : 'Проект включён');
    render();
  });
  const verify = document.getElementById('pj-verify');
  if (verify) {
    verify.addEventListener('click', () => {
      api.updateProject(project.id, { ownership_verified: true });
      toast('Владение подтверждено (демо)');
      render();
    });
  }
  document.getElementById('pj-delete').addEventListener('click', () => {
    if (!confirm('Удалить проект со всеми ключами, задачами и историей?')) return;
    api.deleteProject(project.id);
    go({ projectId: null });
  });
}

/* --------------------------------------------------------- Очередь задач */

function renderTasks() {
  const counters = api.taskCounters();
  const { items, total, page, pages } = api.listTasks({
    status: route.taskStatus || null,
    page: route.taskPage,
    limit: 20,
  });

  view.innerHTML = `
    <h1>Очередь задач</h1>
    <div class="kpis" style="margin-bottom:16px">
      ${['queued', 'running', 'done', 'not_found', 'error', 'cancelled']
        .map((st) => `<div class="kpi"><div class="val">${counters[st]}</div><div class="cap">${STATUS_LABELS[st]}</div></div>`)
        .join('')}
    </div>
    <div class="card">
      <div class="row">
        <div class="field"><label for="f-status">Статус</label>
          <select id="f-status">
            <option value="">Все</option>
            ${TASK_STATUSES.map((s) => `<option value="${s}" ${route.taskStatus === s ? 'selected' : ''}>${STATUS_LABELS[s]}</option>`).join('')}
          </select></div>
        <div class="muted">Всего задач: ${total}</div>
      </div>
    </div>
    <div class="card">
      ${
        items.length
          ? `<table data-testid="tasks-table"><thead><tr>
              <th>ID</th><th>Проект</th><th>Домен</th><th>Ключевое слово</th><th>Тип</th>
              <th>Статус</th><th>Создан</th><th>Обработан</th><th></th></tr></thead><tbody>
              ${items
                .map(
                  (t) => `<tr>
                    <td>${t.id}</td><td>${t.project_id}</td><td>${esc(t.domain)}</td>
                    <td>${esc(t.keyword)}</td><td>${TASK_TYPES[t.type]}</td>
                    <td><span class="badge ${t.status}">${STATUS_LABELS[t.status]}</span>
                        ${t.error_text ? `<div class="muted">${esc(t.error_text)}</div>` : ''}</td>
                    <td>${dt(t.created_at)}</td><td>${dt(t.processed_at)}</td>
                    <td>${
                      t.status === 'queued' || t.status === 'running'
                        ? `<button class="btn ghost" data-cancel="${t.id}">Отменить</button>`
                        : ''
                    }</td></tr>`,
                )
                .join('')}
             </tbody></table>
             <div class="pager">
               <button class="btn ghost" id="prev" ${page <= 1 ? 'disabled' : ''}>Назад</button>
               <span>Стр. ${page} из ${pages}</span>
               <button class="btn ghost" id="next" ${page >= pages ? 'disabled' : ''}>Вперёд</button>
             </div>`
          : '<p class="empty" data-testid="tasks-empty">Задач нет.</p>'
      }
    </div>`;

  document.getElementById('f-status').addEventListener('change', (e) =>
    go({ taskStatus: e.target.value, taskPage: 1 }),
  );
  const prev = document.getElementById('prev');
  const next = document.getElementById('next');
  if (prev) prev.addEventListener('click', () => go({ taskPage: route.taskPage - 1 }));
  if (next) next.addEventListener('click', () => go({ taskPage: route.taskPage + 1 }));

  view.onclick = (e) => {
    const id = e.target.dataset.cancel;
    if (!id) return;
    try {
      api.cancelTask(id);
      toast('Задача отменена');
      render();
    } catch (err) {
      toast(err.message, 'error');
    }
  };
}

/* ------------------------------------------------------------ Статистика */

function renderStats() {
  const projects = api.listProjects();
  const projectId = route.projectId || (projects[0] && projects[0].id) || null;
  const s = api.summary(projectId);
  const series = api.avgPositionSeries(projectId, 30);
  const freqs = api.frequencies(projectId);
  const keywordId = route.statsKeyword || (freqs[0] && freqs[0].keyword_id) || null;
  const history = keywordId ? api.positionHistory(keywordId, 30) : [];

  view.innerHTML = `
    <h1>Статистика</h1>
    <div class="card">
      <div class="row">
        <div class="field"><label for="st-project">Проект</label>
          <select id="st-project">${projects
            .map((p) => `<option value="${p.id}" ${p.id === projectId ? 'selected' : ''}>${esc(p.name)}</option>`)
            .join('')}</select></div>
        <button class="btn ghost" id="st-export" data-testid="stats-export">Экспорт CSV</button>
      </div>
    </div>
    <div class="kpis" data-testid="stats-kpis">
      <div class="kpi"><div class="val">${s.keywords}</div><div class="cap">ключевых слов</div></div>
      <div class="kpi"><div class="val">${s.avg_position ?? '—'}</div><div class="cap">средняя позиция</div></div>
      <div class="kpi"><div class="val">${s.top3}</div><div class="cap">в топ-3</div></div>
      <div class="kpi"><div class="val">${s.top10}</div><div class="cap">в топ-10</div></div>
      <div class="kpi"><div class="val">${s.top50}</div><div class="cap">в топ-50</div></div>
      <div class="kpi"><div class="val">${s.out_of_top}</div><div class="cap">вне топ-100</div></div>
    </div>
    <div class="card">
      <h2>Динамика средней позиции за 30 дней</h2>
      ${lineChart(series)}
    </div>
    <div class="card">
      <h2>История позиций по ключу</h2>
      <div class="row"><div class="grow"><select id="st-keyword">
        ${freqs.map((f) => `<option value="${f.keyword_id}" ${f.keyword_id === keywordId ? 'selected' : ''}>${esc(f.keyword)}</option>`).join('')}
      </select></div></div>
      <div style="margin-top:12px">${lineChart(
        history.filter((h) => h.position != null).map((h) => ({ date: h.checked_on, value: h.position })),
      )}</div>
    </div>
    <div class="card">
      <h2>Частотность запросов (Wordstat)</h2>
      <table data-testid="freq-table"><thead><tr>
        <th>Ключевое слово</th><th class="num">Базовая</th><th class="num">«Фразовая»</th>
        <th class="num">!Точная</th><th class="num">Позиция</th></tr></thead><tbody>
        ${freqs
          .map(
            (f) => `<tr><td>${esc(f.keyword)}</td>
              <td class="num">${f.frequency_base ?? '—'}</td>
              <td class="num">${f.frequency_quoted ?? '—'}</td>
              <td class="num">${f.frequency_exact ?? '—'}</td>
              <td class="num">${f.position ?? '—'}</td></tr>`,
          )
          .join('')}
      </tbody></table>
    </div>`;

  document.getElementById('st-project').addEventListener('change', (e) =>
    go({ projectId: Number(e.target.value), statsKeyword: null }),
  );
  document.getElementById('st-keyword').addEventListener('change', (e) =>
    go({ statsKeyword: Number(e.target.value) }),
  );
  document.getElementById('st-export').addEventListener('click', () => {
    download('pf-positions.csv', api.exportCsv(projectId));
    toast('Отчёт выгружен');
  });
}

/* ---------------------------------------------------------------- Профиль */

function renderProfile() {
  const profile = api.getProfile();
  const payments = api.listPayments();

  view.innerHTML = `
    <h1>Профиль</h1>
    <div class="card">
      <h2>Баланс</h2>
      <p class="val" style="font-size:26px;font-weight:700" data-testid="balance">${rub(profile.balance_cents)}</p>
      <p class="muted">Стоимость задач: съём позиции — ${rub(PRICE_CENTS.position)}, частотность — ${rub(
        PRICE_CENTS.wordstat,
      )}, аудит — ${rub(PRICE_CENTS.audit)}.</p>
      <div class="row">
        <div class="field"><label for="pf-amount">Сумма пополнения, ₽</label>
          <input id="pf-amount" type="number" min="1" value="1000" data-testid="topup-amount"></div>
        <button class="btn" id="pf-topup" data-testid="topup">Пополнить через ЮKassa</button>
      </div>
      <p class="muted">В демо-режиме платёж проводится локально. В проде — редирект на форму ЮKassa
        и подтверждение по webhook.</p>
    </div>
    <div class="card">
      <h2>Настройки</h2>
      <div class="row">
        <div class="grow"><label for="pf-email">Email</label><input id="pf-email" value="${esc(profile.email)}"></div>
        <div class="field"><label for="pf-tz">Таймзона</label>
          <select id="pf-tz">
            ${['Europe/Moscow', 'Europe/Samara', 'Asia/Yekaterinburg']
              .map((tz) => `<option ${tz === profile.timezone ? 'selected' : ''}>${tz}</option>`)
              .join('')}
          </select></div>
        <button class="btn ghost" id="pf-save">Сохранить</button>
      </div>
    </div>
    <div class="card">
      <h2>История платежей</h2>
      <table><thead><tr><th>ID</th><th>Сумма</th><th>Провайдер</th><th>Статус</th><th>Дата</th></tr></thead><tbody>
        ${payments
          .map(
            (p) =>
              `<tr><td>${p.id}</td><td>${rub(p.amount_cents)}</td><td>${esc(p.provider)}</td>
               <td><span class="badge done">${esc(p.status)}</span></td><td>${dt(p.created_at)}</td></tr>`,
          )
          .join('')}
      </tbody></table>
    </div>`;

  document.getElementById('pf-topup').addEventListener('click', () => {
    try {
      api.topUp(document.getElementById('pf-amount').value);
      toast('Баланс пополнен');
      render();
    } catch (err) {
      toast(err.message, 'error');
    }
  });
  document.getElementById('pf-save').addEventListener('click', () => {
    api.updateProfile({
      email: document.getElementById('pf-email').value,
      timezone: document.getElementById('pf-tz').value,
    });
    toast('Профиль сохранён');
  });
}

render();
