const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createServer } = require('../server');

const logsDir = path.join(process.cwd(), 'logs');

async function resetLogs() {
  await fs.rm(logsDir, { recursive: true, force: true });
}

test('stores and retrieves logs with Qualtrics + Prolific IDs', async () => {
  await resetLogs();

  const server = createServer();
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();

  const postResponse = await fetch(`http://127.0.0.1:${port}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      qualtricsId: 'Q-123',
      prolificId: 'P-456',
      messages: [
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'hi there' }
      ],
      metadata: { surveyVersion: 'v1' }
    })
  });

  assert.equal(postResponse.status, 200);
  const postData = await postResponse.json();
  assert.equal(postData.ok, true);
  assert.equal(postData.subjectId, 'Q-123__P-456');

  const getResponse = await fetch(`http://127.0.0.1:${port}/api/chat-logs/${postData.subjectId}`);
  assert.equal(getResponse.status, 200);
  const getData = await getResponse.json();

  assert.equal(getData.ok, true);
  assert.equal(getData.logs.length, 1);
  assert.equal(getData.logs[0].qualtricsId, 'Q-123');
  assert.equal(getData.logs[0].prolificId, 'P-456');
  assert.equal(getData.logs[0].messages[0].content, 'hello');

  await new Promise((resolve) => server.close(resolve));
  await resetLogs();
});
