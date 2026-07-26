/** Снимает скриншоты всех разделов демо-кабинета в docs/screenshots. */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';

const server = spawn('npx', ['--yes', 'http-server', '.', '-p', '4180', '-c-1', '--silent'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.addInitScript(() => window.localStorage.clear());
await page.goto('http://127.0.0.1:4180/app/');

const shot = (name) => page.screenshot({ path: `docs/screenshots/${name}.png`, fullPage: false });

await shot('projects');
await page.getByTestId('project-card').first().click();
await shot('keywords');
await page.getByRole('button', { name: 'Очередь задач' }).click();
await shot('tasks');
await page.getByRole('button', { name: 'Статистика' }).click();
await shot('stats');
await page.getByRole('button', { name: 'Профиль' }).click();
await shot('profile');

await browser.close();
server.kill();
console.log('готово');
