import { afterEach, describe, expect, it, vi } from 'vitest';
import { diagnose } from '../api/_lib/diagnose';

const URL_OK = 'https://script.google.com/macros/s/AKfycbTEST_123-abc/exec';
const good = { EXCEL_DRIVER: 'google-sheets', GOOGLE_SCRIPT_URL: URL_OK, RSVP_SHARED_SECRET: 'Rozovye-piony-4-noyabrya-7Kq2xW9mZ' };
const reply = (body: string, status = 200) => vi.fn(async () => new Response(body, { status }));

afterEach(() => vi.unstubAllGlobals());

describe('самопроверка /api/rsvp?check=1', () => {
  it('всё верно: скрипт отклоняет проверочный секрет', async () => {
    const f = reply('{"status":"unauthorized"}');
    vi.stubGlobal('fetch', f);
    const out = await diagnose(good);
    expect(out).not.toContain('❌');
    expect(out).toContain('Всё подключено');
    // в скрипт уходит НЕ настоящий секрет — строка не будет записана
    expect(String((f.mock.calls[0] as unknown[])[1] && JSON.stringify((f.mock.calls[0] as any)[1].body))).not.toContain(good.RSVP_SHARED_SECRET);
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
