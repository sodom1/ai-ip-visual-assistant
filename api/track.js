const EVENTS_KEY = 'lingou:usage-events';
const MAX_EVENTS = 5000;
const ALLOWED_EVENTS = new Set([
  'session_start',
  'session_exit',
  'topic_detected',
  'mode_change',
  'model_change',
  'new_session',
  'setting_card_completed'
]);

function getRedisConfig() {
  return {
    url: (process.env.UPSTASH_REDIS_REST_URL || process.env.UPSTASH_REDIS_REST_KV_REST_API_URL || process.env.KV_REST_API_URL || '').replace(/\/$/, ''),
    token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN || process.env.KV_REST_API_TOKEN || ''
  };
}

async function redisPipeline(commands) {
  const { url, token } = getRedisConfig();
  if (!url || !token) throw new Error('Usage storage is not configured');
  const response = await fetch(`${url}/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(commands)
  });
  if (!response.ok) throw new Error(`Usage storage returned ${response.status}`);
  return response.json();
}

function cleanText(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength);
}

function normalizeEvent(input) {
  const eventName = cleanText(input.eventName, 40);
  if (!ALLOWED_EVENTS.has(eventName)) return null;

  const mode = input.mode === 'professional' ? 'professional' : 'guided';
  const targetModel = ['doubao', 'gpt', 'jimeng'].includes(input.targetModel)
    ? input.targetModel
    : 'doubao';
  const occurredAt = new Date(input.occurredAt || Date.now());

  return {
    eventName,
    anonymousUserId: cleanText(input.anonymousUserId, 100),
    sessionId: cleanText(input.sessionId, 100),
    occurredAt: Number.isNaN(occurredAt.getTime()) ? new Date().toISOString() : occurredAt.toISOString(),
    mode,
    targetModel,
    topicType: cleanText(input.topicType || '未识别', 300),
    settingCardCompleted: Boolean(input.settingCardCompleted),
    exitStep: cleanText(input.exitStep || '未知步骤', 100),
    durationSeconds: Math.max(0, Math.min(Number(input.durationSeconds) || 0, 86400))
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const event = normalizeEvent(req.body || {});
    if (!event || !event.anonymousUserId || !event.sessionId) {
      return res.status(400).json({ error: 'Invalid usage event' });
    }

    await redisPipeline([
      ['LPUSH', EVENTS_KEY, JSON.stringify(event)],
      ['LTRIM', EVENTS_KEY, '0', String(MAX_EVENTS - 1)]
    ]);

    return res.status(204).end();
  } catch (error) {
    console.error('Usage tracking failed:', error.message);
    return res.status(503).json({ error: 'Usage tracking is unavailable' });
  }
};
