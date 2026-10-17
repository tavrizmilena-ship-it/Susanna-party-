/**
 * Сквозная проверка сайта и анкеты в Chromium (playwright-core).
 * Нужны запущенные dev-сервер (npm run dev) и тестовый поток (scripts/mock_flow.py).
 *
 *   SITE=http://localhost:5173 CHROME_PATH=/path/to/chrome node scripts/e2e-rsvp.mjs
 */
import { chromium } from 'playwright-core';
import { randomUUID } from 'node:crypto';

const SITE = process.env.SITE || 'http://localhost:5173';
const TITLE = 'Susánna’s birthday party';
const results = [];
const check = (name, ok, extra = '') => {
  results.push(ok);
  console.log(`${ok ? '✔' : '✘'} ${name}${extra ? ` — ${extra}` : ''}`);
};

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH });
const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });

async function open() {
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !m.text().includes('Failed to load resource') && errors.push(m.text()));
  let posts = 0;
  page.on('request', (r) => { if (r.url().includes('/api/rsvp') && r.method() === 'POST') posts++; });
  await page.goto(SITE, { waitUntil: 'networkidle' });
  return { page, errors, posts: () => posts };
}
const submit = (page) => page.getByRole('button', { name: /Отправить ответ/ }).click();
const pick = (page, text) => page.locator('label.option', { hasText: text }).click();
const count = (page, label) => page.getByRole('radio', { name: label, exact: true }).check({ force: true });

// 1. Страница: секции, фото, название, ссылки
{
  const { page, errors } = await open();
  const sections = await page.evaluate(() => ['Дата и время', 'Дресс-код', 'Место проведения', 'Вы придёте?'].every((t) => [...document.querySelectorAll('h2')].some((h) => h.textContent === t)));
  const photo = await page.evaluate(() => { const i = document.querySelector('.hero__photo img'); return i.complete && i.naturalWidth > 0; });
  const titles = await page.evaluate(() => [document.title, document.querySelector('h1').getAttribute('aria-label'), document.querySelector('meta[property="og:title"]').content, document.querySelector('.colophon__meta').textContent.split(' · ')[0]]);
  const map = await page.locator('a', { hasText: 'Перейти к карте' }).getAttribute('href');
  const tg = await page.locator('a', { hasText: 'Создать своё приглашение' });
  const art = await page.evaluate(async () => {
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' });
    await new Promise((r) => setTimeout(r, 800));
    return [...document.querySelectorAll('.art img')].every((i) => i.complete && i.naturalWidth > 0);
  });
  const sw = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  check('Все секции на месте', sections);
  check('Фотография загружается', photo);
  check('Все иллюстрации загружаются', art);
  check(`Название везде написано как «${TITLE}»`, titles.every((t) => t === TITLE), titles.join(' | '));
  check('Кнопка карты ведёт на поиск адреса в Яндекс Картах', decodeURIComponent(map) === 'https://yandex.ru/maps/?text=Дмитров, улица Большевистская д.1');
  check('Ссылка автора: https://t.me/miliuoushik, новая вкладка', (await tg.getAttribute('href')) === 'https://t.me/miliuoushik' && (await tg.getAttribute('target')) === '_blank');
  check('Нет горизонтальной прокрутки (375 px)', sw);
  check('Нет ошибок в консоли', errors.length === 0, errors.join('; '));
  await page.close();
}

// 2. Пустая форма
{
  const { page, posts } = await open();
  await page.locator('#rsvp').scrollIntoViewIfNeeded();
  await submit(page);
  const ok = (await page.getByText('Пожалуйста, укажите имя и фамилию.').isVisible()) && (await page.getByText('Пожалуйста, выберите один из вариантов.').isVisible());
  const focused = await page.evaluate(() => document.activeElement?.getAttribute('data-field'));
  check('Пустая форма: ошибки, фокус на имени, запрос не отправлен', ok && focused === 'name' && posts() === 0);
  await page.close();
}

// 3. «Да, буду» + 2 человека
{
  const { page, posts } = await open();
  await page.getByLabel('Имя и фамилия').fill('Анна Смирнова');
  await pick(page, 'Да, буду');
  const visible = await page.getByText('Сколько человек будет с вами, включая вас?').isVisible();
  await submit(page);
  const need = await page.getByText('Пожалуйста, выберите, сколько вас будет.').isVisible();
  await count(page, '2 человека');
  const caption = await page.locator('.count__caption').textContent();
  await submit(page);
  await page.getByText('Спасибо! Ваш ответ сохранён — до встречи 4 ноября ♡').waitFor({ timeout: 10000 });
  check('«Да» + 2: вопрос о количестве появился, без выбора ошибка, сохранено', visible && need && caption === '2 человека' && posts() === 1);
  await page.close();
}

// 4. Отказ
{
  const { page } = await open();
  await page.getByLabel('Имя и фамилия').fill('Иван Петров');
  await pick(page, 'Да, буду');
  await count(page, '3 человека');
  await pick(page, 'К сожалению, нет');
  await page.waitForTimeout(600);
  const hidden = !(await page.getByText('Сколько человек будет с вами, включая вас?').isVisible());
  await submit(page);
  await page.getByText('Спасибо, что сообщили! Ответ сохранён.').waitFor({ timeout: 10000 });
  check('«К сожалению, нет»: вопрос о количестве скрыт, сохранено с 0 человек', hidden);
  await page.close();
}

// 5. «5 и более»
{
  const { page } = await open();
  await page.getByLabel('Имя и фамилия').fill('Мария Кузнецова');
  await pick(page, 'Да, буду');
  await count(page, '5 и более человек');
  await page.waitForTimeout(500);
  const field = page.getByLabel('Точное количество человек');
  const shown = await field.isVisible();
  await submit(page);
  const need = await page.getByText('Укажите точное количество человек, включая вас.').isVisible();
  await field.fill('4');
  await submit(page);
  const min = await page.getByText('Для варианта «5 и более» укажите число от 5.').isVisible();
  await field.fill('7');
  await submit(page);
  await page.getByText(/Ваш ответ сохранён/).waitFor({ timeout: 10000 });
  check('«5 и более»: поле точного числа, проверки (пусто, < 5), сохранено 7', shown && need && min);
  await page.close();
}

// 6. Двойное нажатие
{
  const { page, posts } = await open();
  await page.route('**/api/rsvp', async (route) => { await new Promise((r) => setTimeout(r, 700)); await route.continue(); });
  await page.getByLabel('Имя и фамилия').fill('Двойное Нажатие');
  await pick(page, 'К сожалению, нет');
  await page.getByRole('button', { name: /Отправить ответ/ }).dblclick();
  await page.getByText(/Спасибо, что сообщили/).waitFor({ timeout: 10000 });
  check('Двойное нажатие: ровно один запрос', posts() === 1, `запросов: ${posts()}`);
  await page.close();
}

// 7. Ошибки — без ложного успеха, форма не очищается
for (const [label, handler, text] of [
  ['Excel не подключён (503)', (r) => r.fulfill({ status: 503, contentType: 'application/json', body: '{"ok":false,"error":"not_configured"}' }), 'Анкета ещё не подключена к таблице'],
  ['Ошибка записи (502)', (r) => r.fulfill({ status: 502, contentType: 'application/json', body: '{"ok":false,"error":"storage_error"}' }), 'Не получилось сохранить ответ'],
  ['Нет сети', (r) => r.abort('internetdisconnected'), 'Нет связи с сервером'],
]) {
  const { page } = await open();
  await page.route('**/api/rsvp', handler);
  await page.getByLabel('Имя и фамилия').fill('Тест Ошибки');
  await pick(page, 'К сожалению, нет');
  await submit(page);
  await page.getByText(text).waitFor({ timeout: 5000 });
  const kept = (await page.getByLabel('Имя и фамилия').inputValue()) === 'Тест Ошибки';
  check(`${label}: понятное сообщение, данные сохранены в форме, «Спасибо» не показано`, kept && !(await page.getByText(/Спасибо/).isVisible()));
  await page.close();
}

// 8. Сервер: валидация, дубли, параллельные ответы
{
  const post = (body) => fetch(`${SITE}/api/rsvp`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': randomUUID() }, body: JSON.stringify(body) });
  const bad = await post({ submissionId: randomUUID(), name: '', attendance: 'maybe' });
  check('Сервер отклоняет некорректные данные (400)', bad.status === 400);
  const big = await post({ submissionId: randomUUID(), name: 'Очень Много', attendance: 'yes', peopleChoice: '5+', exactPeople: '500' });
  check('Сервер не принимает 500 человек в одной анкете', big.status === 400);
  const body = { submissionId: randomUUID(), name: 'Повтор Отправки', attendance: 'yes', peopleChoice: '1' };
  const a = await (await post(body)).json();
  const b = await (await post(body)).json();
  check('Повтор с тем же ID не создаёт вторую строку', a.status === 'saved' && b.status === 'duplicate');
  const many = await Promise.all(Array.from({ length: 10 }, (_, i) =>
    post({ submissionId: randomUUID(), name: `Гость ${i + 1}`, attendance: i % 2 ? 'yes' : 'no', peopleChoice: '2' }).then((r) => r.json())));
  check('10 одновременных анкет — все сохранены', many.every((r) => r.ok && r.status === 'saved'));
}

await browser.close();
const failed = results.filter((r) => !r).length;
console.log(`\nИтого: ${results.length - failed}/${results.length}`);
process.exit(failed ? 1 : 0);
