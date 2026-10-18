/**
 * Самопроверка подключения анкеты: GET /api/rsvp?check=1
 * Проверяет переменные окружения и доступность скрипта Google, не показывая секретов
 * и ничего не записывая в таблицу (скрипту отправляется заведомо неверный секрет).
 */
import type { Env } from './excel.js';

type Step = { ok: boolean | null; title: string; detail: string };

export async function diagnose(env: Env): Promise<string> {
  const steps: Step[] = [];
  const add = (ok: boolean | null, title: string, detail: string) => steps.push({ ok, title, detail });

  // 1. EXCEL_DRIVER
  const driverRaw = env.EXCEL_DRIVER;
  const driver = (driverRaw || '').trim();
  if (!driverRaw) add(false, 'EXCEL_DRIVER', 'Переменная не задана (или сайт не перезапущен после добавления). Значение должно быть: google-sheets');
  else if (driver !== 'google-sheets') add(false, 'EXCEL_DRIVER', `Сейчас значение «${driver.slice(0, 40)}», а должно быть ровно: google-sheets`);
  else if (driverRaw !== driver) add(false, 'EXCEL_DRIVER', 'В значении есть лишние пробелы или перенос строки. Должно быть ровно: google-sheets');
  else add(true, 'EXCEL_DRIVER', 'google-sheets — верно');

  // 2. RSVP_SHARED_SECRET (значение не показываем)
  const secret = env.RSVP_SHARED_SECRET || '';
  if (!secret) add(false, 'RSVP_SHARED_SECRET', 'Переменная не задана (или сайт не перезапущен после добавления).');
  else {
    const problems: string[] = [];
    if (/const|SECRET\s*=/.test(secret)) problems.push('в значении есть «const SECRET =» — нужно только само слово');
    if (/['"‘’“”;]/.test(secret)) problems.push('в значении есть кавычки или точка с запятой — их быть не должно');
    if (/\s/.test(secret)) problems.push('в значении есть пробелы или перенос строки');
    if (/ВСТАВЬТЕ/.test(secret)) problems.push('это заглушка из инструкции, а не ваше слово');
    if (problems.length) add(false, 'RSVP_SHARED_SECRET', problems.join('; ') + '.');
    else add(true, 'RSVP_SHARED_SECRET', `задано, ${secret.length} символов, лишних знаков нет`);
  }

  // 3. GOOGLE_SCRIPT_URL
  const urlRaw = env.GOOGLE_SCRIPT_URL || '';
  const url = urlRaw.trim();
  let urlOk = false;
  if (!url) add(false, 'GOOGLE_SCRIPT_URL', 'Переменная не задана (или сайт не перезапущен после добавления).');
  else if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(url)) {
    let hint = 'Ссылка должна выглядеть так: https://script.google.com/macros/s/…/exec';
    if (/\/dev$/.test(url)) hint = 'Это тестовая ссылка (…/dev), она работает только у вас. Нужна ссылка веб-приложения, оканчивающаяся на /exec.';
    else if (/docs\.google\.com/.test(url)) hint = 'Это ссылка на саму таблицу. Нужна ссылка веб-приложения из Apps Script (Начать развёртывание → Управление развёртываниями).';
    else if (/script\.google\.com\/home|\/edit/.test(url)) hint = 'Это ссылка на редактор скрипта. Нужна ссылка веб-приложения, оканчивающаяся на /exec.';
    add(false, 'GOOGLE_SCRIPT_URL', hint);
  } else if (urlRaw !== url) add(false, 'GOOGLE_SCRIPT_URL', 'В значении есть лишние пробелы или перенос строки в начале/конце.');
  else { urlOk = true; add(true, 'GOOGLE_SCRIPT_URL', 'формат ссылки верный'); }

  // 4. Ответ скрипта (заведомо неверный секрет — строка не запишется)
  if (urlOk) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 20000);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ secret: `__diagnostic_${Date.now()}__` }),
        redirect: 'follow',
        signal: ctrl.signal,
      });
      clearTimeout(t);
      const text = await res.text();
      let json: { status?: string } | null = null;
      try { json = JSON.parse(text); } catch { /* не JSON */ }
      if (json?.status === 'unauthorized') {
        add(true, 'Скрипт Google', 'Скрипт опубликован, доступен всем и отвечает. Проверочный запрос с неверным словом он правильно отклонил.');
      } else if (json) {
        add(false, 'Скрипт Google', `Скрипт ответил неожиданно: ${text.slice(0, 120)}. Проверьте, что в Apps Script вставлен код целиком.`);
      } else if (res.status === 404) {
        add(false, 'Скрипт Google', 'По ссылке ничего нет (404). Скопируйте ссылку заново: Начать развёртывание → Управление развёртываниями → URL веб-приложения.');
      } else if (/accounts\.google\.com|ServiceLogin|signin/i.test(text) || res.status === 401 || res.status === 403) {
        add(false, 'Скрипт Google', 'Google требует вход. В развёртывании должно быть: «Выполнять от имени: Я» и «У кого есть доступ: Все». Измените и разверните новую версию.');
      } else if (/doPost/i.test(text)) {
        add(false, 'Скрипт Google', 'В опубликованной версии нет функции doPost — вставьте код целиком, сохраните и разверните новую версию.');
      } else {
        add(false, 'Скрипт Google', `Скрипт вернул не тот ответ (код ${res.status}). Начало ответа: ${text.replace(/\s+/g, ' ').slice(0, 120)}`);
      }
    } catch (e) {
      add(false, 'Скрипт Google', `Не удалось связаться со скриптом: ${(e as Error).message}`);
    }
  } else {
    add(null, 'Скрипт Google', 'не проверялся — сначала исправьте ссылку');
  }

  const allOk = steps.every((s) => s.ok === true);
  const lines = [
    'Самопроверка анкеты — Susánna’s birthday party',
    '',
    ...steps.map((s) => `${s.ok === true ? '✅' : s.ok === false ? '❌' : '⏸'} ${s.title}: ${s.detail}`),
    '',
    allOk
      ? 'Всё подключено. Если анкета всё равно пишет, что ответ не сохранён, значит секретное слово в Vercel и в скрипте Google отличается (сравните по буквам) или после правки кода скрипт не развёрнут заново (Управление развёртываниями → карандаш → Новая версия).'
      : 'Исправьте пункты с ❌. После изменения переменных в Vercel обязательно сделайте Deployments → ⋯ → Redeploy и откройте эту страницу снова.',
  ];
  return lines.join('\n');
}
