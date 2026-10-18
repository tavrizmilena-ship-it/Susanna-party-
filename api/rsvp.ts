/**
 * Vercel Function: POST /api/rsvp
 * Принимает анкету, проверяет её на сервере и записывает строку в Excel.
 */
import { handleRsvp } from './_lib/handler.js';

export function POST(request: Request): Promise<Response> {
  return handleRsvp(request, process.env);
}

/** GET /api/rsvp?check=1 — самопроверка подключения (без секретов и без записи в таблицу) */
export function GET(request: Request): Promise<Response> {
  return handleRsvp(request, process.env);
}
