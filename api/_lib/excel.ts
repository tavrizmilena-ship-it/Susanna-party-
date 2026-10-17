/**
 * Запись ответа в Excel. Два способа (выбирается переменной окружения EXCEL_DRIVER):
 *
 *  - "power-automate" (рекомендуется): сервер отправляет ответ в поток Power Automate
 *    «When an HTTP request is received» → «Add a row into a table» (Excel Online).
 *  - "graph": сервер сам пишет строку через Microsoft Graph API (OneDrive / SharePoint).
 *
 * Все секреты (адрес потока, токены) хранятся только в переменных окружения сервера.
 */
import type { RsvpClean } from './validate';
import { excelSafe } from './validate';

export type Env = Record<string, string | undefined>;
export type SaveResult = { status: 'saved' | 'duplicate' };

export class NotConfiguredError extends Error {}
export class StorageError extends Error {}

export const COLUMNS = [
  'Timestamp',
  'Guest name',
  'Will attend?',
  'Total people',
  'Additional guests',
  'Submission ID',
] as const;

export function formatTimestamp(date: Date, timeZone: string): string {
  // Формат «2026-10-15 17:04:09», удобный для сортировки в Excel
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).format(date);
  return parts.replace('T', ' ');
}

export function buildRow(data: RsvpClean, now: Date, timeZone: string): (string | number)[] {
  return [
    formatTimestamp(now, timeZone),
    excelSafe(data.name),
    data.willAttend ? 'Да' : 'Нет',
    data.totalPeople,
    data.additionalGuests,
    data.submissionId,
  ];
}

async function fetchWithTimeout(url: string, init: RequestInit, ms = 15000): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ---------------------------- Power Automate ---------------------------- */

async function saveViaPowerAutomate(row: (string | number)[], env: Env): Promise<SaveResult> {
  const url = env.POWER_AUTOMATE_URL;
  const secret = env.RSVP_SHARED_SECRET;
  if (!url || !secret) throw new NotConfiguredError('POWER_AUTOMATE_URL / RSVP_SHARED_SECRET are not set');

  const body = {
    timestamp: row[0],
    guestName: row[1],
    willAttend: row[2],
    totalPeople: row[3],
    additionalGuests: row[4],
    submissionId: row[5],
  };

  let lastError = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    let res: Response;
    try {
      res = await fetchWithTimeout(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-rsvp-secret': secret },
        body: JSON.stringify(body),
      }, 25000);
    } catch (e) {
      lastError = `network: ${(e as Error).message}`;
      await sleep(600 * (attempt + 1));
      continue;
    }
    const text = await res.text();
    if (res.ok) {
      let parsed: { status?: string } = {};
      try { parsed = JSON.parse(text); } catch { /* ниже — ошибка */ }
      if (parsed.status === 'saved' || parsed.status === 'duplicate') return { status: parsed.status };
      // Поток ответил 200, но не подтвердил запись — считаем это ошибкой, а не успехом.
      throw new StorageError(`Flow responded ${res.status} without confirmation: ${text.slice(0, 200)}`);
    }
    lastError = `flow ${res.status}: ${text.slice(0, 200)}`;
    if (res.status === 429 || res.status >= 500) {
      await sleep(800 * (attempt + 1));
      continue;
    }
    break;
  }
  throw new StorageError(lastError);
}

/* ---------------------------- Microsoft Graph ---------------------------- */

let tokenCache: { token: string; expires: number } | null = null;

async function graphToken(env: Env): Promise<string> {
  if (tokenCache && tokenCache.expires > Date.now() + 60_000) return tokenCache.token;
  const tenant = env.GRAPH_TENANT || 'consumers';
  const params = new URLSearchParams({
    client_id: env.GRAPH_CLIENT_ID!,
    grant_type: 'refresh_token',
    refresh_token: env.GRAPH_REFRESH_TOKEN!,
    scope: 'Files.ReadWrite offline_access',
  });
  if (env.GRAPH_CLIENT_SECRET) params.set('client_secret', env.GRAPH_CLIENT_SECRET);
  const res = await fetchWithTimeout(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: params,
  });
  const json = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string };
  if (!res.ok || !json.access_token) throw new StorageError(`token error ${res.status}: ${json.error ?? ''}`);
  tokenCache = { token: json.access_token, expires: Date.now() + (json.expires_in ?? 3600) * 1000 };
  return json.access_token;
}

async function graphCall(env: Env, path: string, init: RequestInit = {}): Promise<Response> {
  const base = env.GRAPH_DRIVE_ITEM_ID
    ? `https://graph.microsoft.com/v1.0/me/drive/items/${env.GRAPH_DRIVE_ITEM_ID}`
    : `https://graph.microsoft.com/v1.0/me/drive/root:${encodeURI(env.EXCEL_FILE_PATH || '/Susanna_Birthday_Party_RSVP.xlsx')}:`;
  for (let attempt = 0; ; attempt++) {
    const token = await graphToken(env);
    const res = await fetchWithTimeout(`${base}${path}`, {
      ...init,
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(init.headers || {}) },
    });
    if ((res.status === 429 || res.status === 409 || res.status >= 500) && attempt < 3) {
      const retry = Number(res.headers.get('retry-after')) || attempt + 1;
      await sleep(Math.min(retry, 5) * 1000);
      continue;
    }
    if (res.status === 401 && attempt === 0) { tokenCache = null; continue; }
    return res;
  }
}

async function saveViaGraph(row: (string | number)[], env: Env): Promise<SaveResult> {
  if (!env.GRAPH_CLIENT_ID || !env.GRAPH_REFRESH_TOKEN) {
    throw new NotConfiguredError('GRAPH_CLIENT_ID / GRAPH_REFRESH_TOKEN are not set');
  }
  const table = encodeURIComponent(env.EXCEL_TABLE || 'RSVP');
  const submissionId = String(row[5]);

  if (submissionId) {
    const col = await graphCall(env, `/workbook/tables/${table}/columns/${encodeURIComponent('Submission ID')}?$select=values`);
    if (col.ok) {
      const json = (await col.json()) as { values?: unknown[][] };
      if (json.values?.some((v) => v[0] === submissionId)) return { status: 'duplicate' };
    }
  }

  const res = await graphCall(env, `/workbook/tables/${table}/rows`, {
    method: 'POST',
    body: JSON.stringify({ index: null, values: [row] }),
  });
  if (res.status !== 201 && res.status !== 200) {
    throw new StorageError(`graph add row ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  return { status: 'saved' };
}

export async function saveRsvp(row: (string | number)[], env: Env): Promise<SaveResult> {
  const driver = (env.EXCEL_DRIVER || 'power-automate').trim();
  if (driver === 'power-automate') return saveViaPowerAutomate(row, env);
  if (driver === 'graph') return saveViaGraph(row, env);
  throw new NotConfiguredError(`Unknown EXCEL_DRIVER "${driver}"`);
}
