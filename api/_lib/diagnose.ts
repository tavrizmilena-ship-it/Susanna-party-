/**
 * Самопроверка подключения анкеты: GET /api/rsvp?check=1
 * Проверяет переменные окружения и доступность скрипта Google, не показывая секретов
 * и ничего не записывая в таблицу (скрипту отправляется заведомо неверный секрет).
 */
import type { Env } from './excel.js';

type Step = { ok: boolean | null; title: string; detail: string };

const stripHtml = (t: string) =>
  t.replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();

/**
 * Запрос с НАСТОЯЩИМ секретом и пометкой action: 'ping'. Новая версия скрипта отвечает 'pong'
 * и ничего не записывает. Старая версия (без ping) запишет одну строку с пометкой «проверка» —
 * она одна (повтор отсекается по Submission ID) и её можно удалить.
 */
async function checkRealSecret(url: string, secret: string, add: (ok: boolean | null, t: string, d: string) => void) {
  const title = 'Ваше секретное слово';
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        secret,
        action: 'ping',
        timestamp: 'ПРОВЕРКА СВЯЗИ — эту строку можно удалить',
        guestName: 'Проверка связи (удалите строку)',
        willAttend: '—',
        totalPeople: 0,
        additionalGuests: 0,
        submissionId: 'diagnostic-ping',
      }),
      redirect: 'follow',
    });
    const text = await res.text();
    let json: { status?: string; error?: string; rows?: number } | null = null;
    try { json = JSON.parse(text); } catch { /* HTML-ошибка Google */ }
    if (json?.status === 'pong') {
      add(true, title, `Скрипт принимает ваше слово, лист «RSVP Responses» найден (ответов: ${json.rows ?? 0}). Анкета должна сохраняться.`);
    } else if (json?.status === 'saved' || json?.status === 'duplicate') {
      add(true, title, 'Скрипт принимает ваше слово и записывает строки — всё работает. В таблице появилась строка «Проверка связи» — её можно удалить. (Это старая версия кода скрипта; обновлять не обязательно.)');
    } else if (json?.status === 'unauthorized') {
      add(false, title, 'Скрипт НЕ принимает ваше слово. Причина одна из двух: (1) слово в Vercel и в строке const SECRET отличается хотя бы одним символом; (2) слово вписано в код ПОСЛЕ развёртывания — опубликована старая версия. Решение для (2): Apps Script → Начать развёртывание → Управление развёртываниями → карандаш → Версия: «Новая версия» → Начать развёртывание.');
    } else if (json?.error === 'no_spreadsheet') {
      add(false, title, 'Скрипт не привязан к таблице. Откройте именно таблицу → Расширения → Apps Script, вставьте код туда и разверните.');
    } else if (json) {
      add(false, title, `Скрипт ответил ошибкой: ${text.slice(0, 200)}`);
    } else {
      const msg = stripHtml(text).slice(0, 220);
      const hint = /getLastRow|getRange|null/i.test(msg)
        ? ' Похоже, в таблице нет листа «RSVP Responses»: в Apps Script выберите функцию setup и нажмите «Выполнить», затем разверните новую версию.'
        : /getActiveSpreadsheet|openById/i.test(msg)
          ? ' Похоже, скрипт создан отдельно от таблицы. Откройте таблицу → Расширения → Apps Script и вставьте код туда.'
          : '';
      add(false, title, `Скрипт упал с ошибкой (код ${res.status}): «${msg}».${hint}`);
    }
  } catch (e) {
    add(false, title, `Не удалось связаться со скриптом: ${(e as Error).message}`);
  }
}

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
        if (secret) await checkRealSecret(url, secret, add);
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
      ? 'Всё подключено: анкета должна сохранять ответы. Отправьте тестовую анкету на сайте и проверьте лист «RSVP Responses».'
      : 'Исправьте пункты с ❌. После изменения переменных в Vercel обязательно сделайте Deployments → ⋯ → Redeploy и откройте эту страницу снова.',
  ];
  return lines.join('\n');
}
