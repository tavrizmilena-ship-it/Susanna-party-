import { afterEach, describe, expect, it, vi } from 'vitest';
import { diagnose } from '../api/_lib/diagnose';

const URL_OK = 'https://script.google.com/macros/s/AKfycbTEST_123-abc/exec';
const good = { EXCEL_DRIVER: 'google-sheets', GOOGLE_SCRIPT_URL: URL_OK, RSVP_SHARED_SECRET: 'Rozovye-piony-4-noyabrya-7Kq2xW9mZ' };
const reply = (body: string, status = 200) => vi.fn(async () => new Response(body, { status }));

afterEach(() => vi.unstubAllGlobals());

describe('самопроверка /api/rsvp?check=1', () => {
  it('всё верно: первый запрос — с неверным словом, второй — ping с настоящим', async () => {
    const bodies = ['{"status":"unauthorized"}', '{"status":"pong","rows":0}'];
    let i = 0;
    const f = vi.fn(async (_u: string, init: RequestInit) => { void init; return new Response(bodies[i++]); });
    vi.stubGlobal('fetch', f);
    const out = await diagnose(good);
    expect(out).not.toContain('❌');
    expect(out).toContain('Всё подключено');
    const first = JSON.parse(String(f.mock.calls[0][1].body));
    const second = JSON.parse(String(f.mock.calls[1][1].body));
    expect(first.secret).not.toBe(good.RSVP_SHARED_SECRET);
    expect(second).toMatchObject({ secret: good.RSVP_SHARED_SECRET, action: 'ping', submissionId: 'diagnostic-ping' });
    expect(out).not.toContain(good.RSVP_SHARED_SECRET);
  });

  it('секрет вставлен целой строкой с const и кавычками', async () => {
    vi.stubGlobal('fetch', reply('{"status":"unauthorized"}'));
    const out = await diagnose({ ...good, RSVP_SHARED_SECRET: "const SECRET = 'Rozovye-piony-4-noyabrya-7Kq2xW9mZ';" });
    expect(out).toMatch(/❌ RSVP_SHARED_SECRET: .*const SECRET/);
    expect(out).not.toContain('Rozovye'); // значение секрета не раскрывается
  });

  it('неверный драйвер и ссылка /dev', async () => {
    const out = await diagnose({ ...good, EXCEL_DRIVER: 'power-automate', GOOGLE_SCRIPT_URL: URL_OK.replace('/exec', '/dev') });
    expect(out).toMatch(/❌ EXCEL_DRIVER/);
    expect(out).toMatch(/❌ GOOGLE_SCRIPT_URL: Это тестовая ссылка/);
  });

  it('переменные не заданы', async () => {
    const out = await diagnose({});
    expect(out.match(/^❌/gm)?.length).toBe(3);
  });

  it('доступ к скрипту не «Все» — Google просит войти', async () => {
    vi.stubGlobal('fetch', reply('<html>https://accounts.google.com/ServiceLogin</html>'));
    expect(await diagnose(good)).toMatch(/❌ Скрипт Google: Google требует вход/);
  });

  it('ссылка ведёт в никуда (404)', async () => {
    vi.stubGlobal('fetch', reply('<html>Not Found</html>', 404));
    expect(await diagnose(good)).toMatch(/❌ Скрипт Google: По ссылке ничего нет/);
  });

  it('пробел в конце значения', async () => {
    vi.stubGlobal('fetch', reply('{"status":"unauthorized"}'));
    expect(await diagnose({ ...good, EXCEL_DRIVER: 'google-sheets ' })).toMatch(/❌ EXCEL_DRIVER: В значении есть лишние пробелы/);
  });
});

describe('шаг «Ваше секретное слово»', () => {
  const seq = (...bodies: [string, number?][]) => {
    let i = 0;
    return vi.fn(async () => { const [b, s] = bodies[Math.min(i++, bodies.length - 1)]; return new Response(b, { status: s ?? 200 }); });
  };
  it('новая версия скрипта: pong', async () => {
    vi.stubGlobal('fetch', seq(['{"status":"unauthorized"}'], ['{"status":"pong","rows":3}']));
    const out = await diagnose(good);
    expect(out).toMatch(/✅ Ваше секретное слово: Скрипт принимает ваше слово.*ответов: 3/);
    expect(out).toContain('Всё подключено');
  });
  it('слово не совпадает или скрипт не развёрнут заново', async () => {
    vi.stubGlobal('fetch', seq(['{"status":"unauthorized"}'], ['{"status":"unauthorized"}']));
    expect(await diagnose(good)).toMatch(/❌ Ваше секретное слово: Скрипт НЕ принимает ваше слово.*Новая версия/);
  });
  it('старая версия скрипта записала проверочную строку', async () => {
    vi.stubGlobal('fetch', seq(['{"status":"unauthorized"}'], ['{"status":"saved"}']));
    expect(await diagnose(good)).toMatch(/✅ Ваше секретное слово: .*Проверка связи/);
  });
  it('нет листа — понятная подсказка из HTML-ошибки Google', async () => {
    vi.stubGlobal('fetch', seq(['{"status":"unauthorized"}'], ['<html><body><div>TypeError: Cannot read properties of null (reading \'getLastRow\')</div></body></html>']));
    expect(await diagnose(good)).toMatch(/❌ Ваше секретное слово: Скрипт упал.*getLastRow.*setup/);
  });
});
