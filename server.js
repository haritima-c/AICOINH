const http = require('node:http');
const { URL } = require('node:url');
const { appendChatLog, getChatLogs } = require('./lib/chatLogStore');

function sendJson(res, code, body) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

async function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        req.socket.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('Invalid JSON payload.'));
      }
    });
    req.on('error', reject);
  });
}

function createServer() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    if (req.method === 'POST' && url.pathname === '/api/chat') {
      try {
        const payload = await readJsonBody(req);
        const { qualtricsId, prolificId, messages, metadata } = payload;

        const record = await appendChatLog({
          qualtricsId,
          prolificId,
          messages,
          metadata: {
            ...metadata,
            receivedFrom: 'chatkit-starter-template'
          }
        });

        return sendJson(res, 200, {
          ok: true,
          subjectId: record.subjectId,
          savedAt: record.savedAt
        });
      } catch (error) {
        return sendJson(res, 400, { ok: false, error: error.message });
      }
    }

    if (req.method === 'GET' && url.pathname.startsWith('/api/chat-logs/')) {
      const subjectId = url.pathname.replace('/api/chat-logs/', '');
      const logs = await getChatLogs(subjectId);
      return sendJson(res, 200, { ok: true, subjectId, logs });
    }

    return sendJson(res, 404, { ok: false, error: 'Not found' });
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT || 3000);
  createServer().listen(port, () => {
    console.log(`Server listening on http://localhost:${port}`);
  });
}

module.exports = { createServer };
