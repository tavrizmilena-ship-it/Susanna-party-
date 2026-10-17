/**
 * Только для варианта EXCEL_DRIVER=graph.
 * Получает refresh token владельца таблицы через вход по коду устройства (device code flow).
 * Запускать на своём компьютере; токен никому не пересылать и не коммитить.
 *
 *   GRAPH_CLIENT_ID=... GRAPH_TENANT=consumers node scripts/get-graph-token.mjs
 */
const tenant = process.env.GRAPH_TENANT || 'consumers';
const clientId = process.env.GRAPH_CLIENT_ID;
if (!clientId) {
  console.error('Укажите GRAPH_CLIENT_ID (Application (client) ID из регистрации приложения).');
  process.exit(1);
}
const scope = 'Files.ReadWrite offline_access';
const base = `https://login.microsoftonline.com/${tenant}/oauth2/v2.0`;

const dc = await (await fetch(`${base}/devicecode`, {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ client_id: clientId, scope }),
})).json();
if (!dc.device_code) {
  console.error('Ошибка:', dc);
  process.exit(1);
}
console.log(`\n${dc.message}\n`);

const deadline = Date.now() + dc.expires_in * 1000;
while (Date.now() < deadline) {
  await new Promise((r) => setTimeout(r, (dc.interval || 5) * 1000));
  const res = await fetch(`${base}/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:device_code', client_id: clientId, device_code: dc.device_code }),
  });
  const json = await res.json();
  if (json.refresh_token) {
    console.log('Готово. Сохраните это значение в переменную GRAPH_REFRESH_TOKEN на Vercel:\n');
    console.log(json.refresh_token);
    process.exit(0);
  }
  if (json.error !== 'authorization_pending' && json.error !== 'slow_down') {
    console.error('Ошибка:', json.error, json.error_description);
    process.exit(1);
  }
}
console.error('Время ожидания истекло, запустите скрипт ещё раз.');
process.exit(1);
