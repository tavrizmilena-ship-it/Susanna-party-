import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleRsvp } from './api/_lib/handler';

/** Локальная разработка: /api/rsvp обрабатывается тем же кодом, что и на Vercel */
function devApi(env: Record<string, string>): Plugin {
  return {
    name: 'dev-api',
    configureServer(server) {
      server.middlewares.use('/api/rsvp', async (req: IncomingMessage, res: ServerResponse) => {
        const chunks: Buffer[] = [];
        for await (const c of req) chunks.push(c as Buffer);
        const headers = new Headers();
        for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
        const request = new Request('http://localhost/api/rsvp', {
          method: req.method,
          headers,
          body: req.method === 'POST' ? Buffer.concat(chunks) : undefined,
        });
        const response = await handleRsvp(request, { ...process.env, ...env });
        res.statusCode = response.status;
        response.headers.forEach((v, k) => res.setHeader(k, v));
        res.end(await response.text());
      });
    },
  };
}

/** Подставляет публичный адрес сайта в Open Graph-теги (нужно для превью в Telegram/WhatsApp) */
function siteUrl(url: string): Plugin {
  return {
    name: 'site-url',
    transformIndexHtml: (html) => html.replaceAll('%SITE_URL%', url.replace(/\/$/, '')),
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const url =
    env.SITE_URL ||
    (env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}` : '') ||
    (env.VERCEL_URL ? `https://${env.VERCEL_URL}` : '');
  // Режим предпросмотра: весь сайт в одном HTML-файле, анкета ничего не отправляет
  if (process.env.VITE_PREVIEW === '1') {
    return {
      plugins: [react(), siteUrl(''), viteSingleFile()],
      build: { target: 'es2019', outDir: 'dist-preview', assetsInlineLimit: 100_000_000 },
    };
  }
  return {
    plugins: [react(), devApi(env), siteUrl(url)],
    build: { target: 'es2019', cssCodeSplit: false, assetsInlineLimit: 0 },
  };
});
