const fs = require('node:fs/promises');
const path = require('node:path');

const LOG_DIR = path.join(process.cwd(), 'logs');

function sanitizeSegment(value) {
  return String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 120);
}

function buildSubjectId({ qualtricsId, prolificId }) {
  const q = sanitizeSegment(qualtricsId);
  const p = sanitizeSegment(prolificId);

  if (!q && !p) {
    throw new Error('At least one of qualtricsId or prolificId is required.');
  }

  return q && p ? `${q}__${p}` : q || p;
}

async function ensureLogDir() {
  await fs.mkdir(LOG_DIR, { recursive: true });
}

function logPath(subjectId) {
  return path.join(LOG_DIR, `${subjectId}.jsonl`);
}

async function appendChatLog({ qualtricsId, prolificId, messages, metadata = {} }) {
  const subjectId = buildSubjectId({ qualtricsId, prolificId });
  const record = {
    subjectId,
    qualtricsId: qualtricsId || null,
    prolificId: prolificId || null,
    messages: Array.isArray(messages) ? messages : [],
    metadata,
    savedAt: new Date().toISOString()
  };

  await ensureLogDir();
  await fs.appendFile(logPath(subjectId), `${JSON.stringify(record)}\n`, 'utf8');

  return record;
}

async function getChatLogs(subjectId) {
  const safeSubjectId = sanitizeSegment(subjectId);
  if (!safeSubjectId) return [];

  try {
    const raw = await fs.readFile(logPath(safeSubjectId), 'utf8');
    return raw
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

module.exports = {
  appendChatLog,
  buildSubjectId,
  getChatLogs,
  sanitizeSegment
};
