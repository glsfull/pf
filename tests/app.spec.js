import { test, expect } from '@playwright/test';

/** Каждый тест стартует с чистого хранилища, чтобы демо-данные были детерминированы. */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.clear());
  await page.goto('/app/');
});

test('открывается список проектов с демо-проектом', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Мои проекты' })).toBeVisible();
  const cards = page.getByTestId('project-card');
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText('analitika-marketpleysov.ru');
});

test('создание проекта: домен нормализуется, пустое имя отклоняется', async ({ page }) => {
  await page.getByTestId('create-project').click();
  await expect(page.getByTestId('toast')).toContainText('Укажите название проекта');

  await page.getByTestId('new-project-name').fill('Новый проект');
  await page.getByTestId('new-project-domain').fill('https://www.Example.RU/catalog?a=1');
  await page.getByTestId('create-project').click();

  await expect(page.getByTestId('project-status')).toBeVisible();
  await expect(page.locator('h1')).toContainText('example.ru');
});

test('ключевые слова: добавление, дубликат, массовый ввод, удаление', async ({ page }) => {
  await page.getByTestId('project-card').first().click();

  await page.getByTestId('kw-input').fill('новый ключ');
  await page.getByTestId('kw-add').click();
  await expect(page.getByTestId('toast')).toContainText('добавлено');
  await expect(page.locator('[data-field=keyword]').last()).toHaveValue('новый ключ');

  // Повторное добавление того же ключа отклоняется.
  await page.getByTestId('kw-input').fill('новый ключ');
  await page.getByTestId('kw-add').click();
  await expect(page.getByTestId('toast')).toContainText('уже добавлено');

  const before = await page.locator('#tab-body tbody tr').count();
  await page.getByTestId('kw-bulk').fill('ключ один\n\nключ два\nновый ключ');
  await page.getByTestId('kw-bulk-add').click();
  await expect(page.getByTestId('toast')).toContainText('Добавлено: 2, дублей пропущено: 1');
  await expect(page.locator('#tab-body tbody tr')).toHaveCount(before + 2);

  page.once('dialog', (d) => d.accept());
  await page.locator('[data-del]').first().click();
  await expect(page.locator('#tab-body tbody tr')).toHaveCount(before + 1);
});

test('выключенный проект не позволяет ставить задачи в очередь', async ({ page }) => {
  await page.getByTestId('project-card').first().click();
  await page.getByRole('button', { name: 'Дополнительно' }).click();
  await page.getByTestId('project-toggle').click();
  await expect(page.getByTestId('project-status')).toContainText('Выключен');

  await page.getByRole('button', { name: 'Ключевые слова' }).click();
  await page.getByTestId('kw-enqueue').click();
  await expect(page.getByTestId('toast')).toContainText('Проект выключен');
});

test('постановка задач в очередь и отмена задачи', async ({ page }) => {
  await page.getByTestId('project-card').first().click();
  await page.getByTestId('kw-enqueue').click();
  await expect(page.getByTestId('toast')).toContainText('В очередь поставлено задач: 8');

  await expect(page.getByTestId('tasks-table')).toBeVisible();
  const cancel = page.locator('[data-cancel]').first();
  await cancel.click();
  await expect(page.getByTestId('toast')).toContainText('Задача отменена');
});

test('фильтр очереди по статусу', async ({ page }) => {
  await page.getByRole('button', { name: 'Очередь задач' }).click();
  await page.locator('#f-status').selectOption('error');
  const rows = page.locator('[data-testid=tasks-table] tbody tr');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Ошибка');
});

test('расписание: час окончания должен быть больше часа начала', async ({ page }) => {
  await page.getByTestId('project-card').first().click();
  await page.getByRole('button', { name: 'Расписание' }).click();
  await page.locator('#sc-from').fill('20');
  await page.locator('#sc-to').fill('10');
  await page.getByTestId('schedule-save').click();
  await expect(page.getByTestId('toast')).toContainText('должен быть больше');
});

test('регионы: нельзя снять все галочки', async ({ page }) => {
  await page.getByTestId('project-card').first().click();
  await page.getByRole('button', { name: 'Регионы' }).click();
  for (const box of await page.locator('[data-testid=regions] input').all()) {
    await box.uncheck();
  }
  await page.getByTestId('regions-save').click();
  await expect(page.getByTestId('toast')).toContainText('хотя бы один регион');
});

test('статистика показывает KPI, графики и частотность', async ({ page }) => {
  await page.getByRole('button', { name: 'Статистика' }).click();
  await expect(page.getByTestId('stats-kpis')).toContainText('средняя позиция');
  await expect(page.locator('svg.chart')).toHaveCount(2);
  await expect(page.locator('[data-testid=freq-table] tbody tr')).toHaveCount(8);
});

test('профиль: пополнение баланса увеличивает баланс', async ({ page }) => {
  await page.getByRole('button', { name: 'Профиль' }).click();
  await expect(page.getByTestId('balance')).toContainText('2 500,00');
  await page.getByTestId('topup-amount').fill('1500');
  await page.getByTestId('topup').click();
  await expect(page.getByTestId('balance')).toContainText('4 000,00');
});
