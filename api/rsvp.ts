/**
 * Vercel Function: POST /api/rsvp
 * Принимает анкету, проверяет её на сервере и записывает строку в Excel.
 */
import { handleRsvp } from './_lib/handler';

export function POST(request: Request): Promise<Response> {
  return handleRsvp(request, process.env);
}

export function GET(): Response {
  return new Response(JSON.stringify({ ok: false, error: 'method_not_allowed' }), {
    status: 405,
    headers: { 'content-type': 'application/json', allow: 'POST' },
  });
}
