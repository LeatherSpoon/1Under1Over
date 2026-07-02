import http from 'node:http';

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type'
  });
  res.end(body);
}

export function createApiServer({ db, transactionService, telemetryService } = {}) {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');

      if (req.method === 'OPTIONS') {
        sendJson(res, 204, {});
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/health') {
        const database = db
          ? await db.health().catch(() => ({ ok: false }))
          : { ok: false };
        sendJson(res, 200, {
          ok: true,
          database: !!database.ok,
          mode: 'hybrid-local-first'
        });
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/bootstrap') {
        const playerId = url.searchParams.get('playerId') || 'local-player';
        const state = await db.getBootstrap(playerId);
        sendJson(res, 200, state);
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/transactions') {
        const tx = await readJson(req);
        const result = await transactionService.applyOne(tx);
        sendJson(res, result.ok ? 200 : 409, result);
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/sync') {
        const body = await readJson(req);
        const result = await transactionService.applyBatch(body.playerId, body.transactions || []);
        sendJson(res, 200, result);
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/save-snapshot') {
        const snapshot = await readJson(req);
        const result = await db.saveSnapshot(snapshot);
        sendJson(res, 200, result);
        return;
      }

      if (req.method === 'GET' && url.pathname.startsWith('/api/save-snapshot/')) {
        const playerId = decodeURIComponent(url.pathname.split('/').pop());
        const snapshot = await db.getLatestSnapshot(playerId);
        sendJson(res, snapshot ? 200 : 404, snapshot || { ok: false, reason: 'not_found' });
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/telemetry/sessions') {
        const report = await readJson(req);
        const result = await telemetryService.saveSession(report);
        sendJson(res, 200, result);
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/telemetry/events') {
        const event = await readJson(req);
        const result = await telemetryService.saveEvent(event);
        sendJson(res, 200, result);
        return;
      }

      sendJson(res, 404, { ok: false, reason: 'not_found' });
    } catch (error) {
      sendJson(res, 500, { ok: false, reason: 'server_error', message: error.message });
    }
  });
}
