const EVENTS_KEY = 'lingou:usage-events';
const MAX_EVENTS = 5000;

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

function isAuthorized(req) {
  const configuredKey = process.env.STATS_ADMIN_KEY;
  const suppliedKey = req.headers['x-stats-key'] || req.query?.key || '';
  return Boolean(configuredKey && suppliedKey && suppliedKey === configuredKey);
}

function parseEvents(result) {
  const rows = Array.isArray(result) ? result : [];
  return rows
    .map((row) => {
      try { return JSON.parse(row); } catch { return null; }
    })
    .filter(Boolean);
}

function buildSummary(events) {
  const sessions = new Map();
  const modeCounts = { guided: 0, professional: 0 };
  const modelCounts = { doubao: 0, gpt: 0, jimeng: 0 };
  const topicCounts = {};

  events.forEach((event) => {
    const sessionKey = event.sessionId || event.anonymousUserId;
    const current = sessions.get(sessionKey) || {
      sessionId: sessionKey,
      anonymousUserId: event.anonymousUserId,
      startedAt: event.occurredAt,
      lastSeenAt: event.occurredAt,
      mode: event.mode,
      targetModel: event.targetModel,
      topicType: event.topicType,
      settingCardCompleted: false,
      exitStep: event.exitStep,
      durationSeconds: event.durationSeconds,
      eventCount: 0
    };
    current.startedAt = current.startedAt < event.occurredAt ? current.startedAt : event.occurredAt;
    current.lastSeenAt = current.lastSeenAt > event.occurredAt ? current.lastSeenAt : event.occurredAt;
    current.mode = event.mode || current.mode;
    current.targetModel = event.targetModel || current.targetModel;
    if (event.topicType && event.topicType !== '未识别') current.topicType = event.topicType;
    current.settingCardCompleted = current.settingCardCompleted || event.settingCardCompleted || event.eventName === 'setting_card_completed';
    if (event.eventName === 'session_exit') current.exitStep = event.exitStep;
    current.durationSeconds = Math.max(current.durationSeconds || 0, event.durationSeconds || 0);
    current.eventCount += 1;
    sessions.set(sessionKey, current);

    if (event.eventName === 'session_start') {
      modeCounts[event.mode] = (modeCounts[event.mode] || 0) + 1;
      modelCounts[event.targetModel] = (modelCounts[event.targetModel] || 0) + 1;
    }
    if (event.topicType && event.topicType !== '未识别') {
      event.topicType.split(' / ').forEach((topic) => {
        topicCounts[topic] = (topicCounts[topic] || 0) + 1;
      });
    }
  });

  return {
    totalEvents: events.length,
    totalSessions: sessions.size,
    completedSessions: [...sessions.values()].filter((item) => item.settingCardCompleted).length,
    modeCounts,
    modelCounts,
    topicCounts,
    sessions: [...sessions.values()].sort((a, b) => new Date(b.lastSeenAt) - new Date(a.lastSeenAt))
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const result = await redisPipeline([['LRANGE', EVENTS_KEY, '0', String(MAX_EVENTS - 1)]]);
    const rows = Array.isArray(result) && result[0] ? result[0].result : [];
    const events = parseEvents(rows);
    return res.status(200).json({ generatedAt: new Date().toISOString(), ...buildSummary(events) });
  } catch (error) {
    console.error('Usage stats failed:', error.message);
    return res.status(503).json({ error: 'Usage storage is unavailable' });
  }
};
