import { validateRsvp, type RsvpInput } from './validate';
import { buildRow, saveRsvp, NotConfiguredError, type Env } from './excel';
import { diagnose } from './diagnose';

const MAX_BODY = 8 * 1024;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX = 10;
const hits = new Map<string, number[]>();

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return list.length > RATE_MAX;
}

export async function handleRsvp(request: Request, env: Env): Promise<Response> {
  if (request.method === 'GET' && new URL(request.url).searchParams.has('check')) {
    const ip = (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
    if (rateLimited(`check:${ip}`)) return json(429, { ok: false, error: 'too_many_requests' });
    return new Response(await diagnose(env), {
      status: 200,
      headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
    });
  }
  if (request.method !== 'POST') return json(405, { ok: false, error: 'method_not_allowed' });

  const type = request.headers.get('content-type') || '';
  if (!type.includes('application/json')) return json(415, { ok: false, error: 'unsupported_media_type' });

  const ip = (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
  if (rateLimited(ip)) return json(429, { ok: false, error: 'too_many_requests' });

  const text = await request.text();
  if (text.length > MAX_BODY) return json(413, { ok: false, error: 'payload_too_large' });

  let raw: Partial<RsvpInput>;
  try {
    raw = JSON.parse(text);
    if (!raw || typeof raw !== 'object') throw new Error('not an object');
  } catch {
    return json(400, { ok: false, error: 'invalid_json' });
  }

  // Бот заполнил скрытое поле — делаем вид, что всё хорошо, но ничего не сохраняем.
  if (typeof raw.website === 'string' && raw.website.trim()) return json(200, { ok: true, status: 'ignored' });

  const maxPeople = Number(env.RSVP_MAX_PEOPLE) || 30;
  const result = validateRsvp(raw, maxPeople);
  if (!result.ok) return json(400, { ok: false, error: 'validation', errors: result.errors });
  if (!result.data.submissionId) return json(400, { ok: false, error: 'missing_submission_id' });

  const row = buildRow(result.data, new Date(), env.RSVP_TIMEZONE || 'Europe/Moscow');
  try {
    const saved = await saveRsvp(row, env);
    return json(200, { ok: true, status: saved.status, attending: result.data.willAttend });
  } catch (e) {
    if (e instanceof NotConfiguredError) {
      console.error('[rsvp] storage is not configured:', e.message);
      return json(503, { ok: false, error: 'not_configured' });
    }
    console.error('[rsvp] storage error:', (e as Error).message);
    return json(502, { ok: false, error: 'storage_error' });
  }
}
