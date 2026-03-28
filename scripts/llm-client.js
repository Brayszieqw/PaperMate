const https = require('node:https');
const http = require('node:http');

function detectBackend() {
  if (process.env.OPENAI_API_KEY || process.env.OPENAI_BASE_URL) {
    const apiKey = process.env.OPENAI_API_KEY || '';
    if (!apiKey && process.env.OPENAI_BASE_URL) {
      process.stderr.write('Note: OPENAI_BASE_URL set without OPENAI_API_KEY; assuming key-less local endpoint.\n');
    }
    return {
      type: 'openai',
      baseUrl: (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, ''),
      apiKey: apiKey || 'no-key',
      model: process.env.LLM_CLIENT_MODEL || 'gpt-5.4',
    };
  }
  if (process.env.OPENROUTER_API_KEY) {
    return {
      type: 'openai',
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKey: process.env.OPENROUTER_API_KEY,
      model: process.env.LLM_CLIENT_MODEL || 'openai/gpt-5.4',
    };
  }
  if (process.env.ANTHROPIC_API_KEY) {
    return {
      type: 'anthropic',
      apiKey: process.env.ANTHROPIC_API_KEY,
      model: process.env.LLM_CLIENT_MODEL || 'claude-opus-4-6',
    };
  }
  return null;
}

function httpRequest(url, options, body) {
  const timeoutMs = options.timeout || 30000;
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const mod = parsed.protocol === 'https:' ? https : http;
    const req = mod.request({
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: options.method || 'POST',
      headers: options.headers || {},
      timeout: timeoutMs,
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode >= 400) {
          const err = new Error(`HTTP ${res.statusCode}: ${text.slice(0, 400)}`);
          err.statusCode = res.statusCode;
          err.body = text;
          reject(err);
          return;
        }
        resolve(text);
      });
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`HTTP request timed out after ${timeoutMs}ms: ${url}`));
    });
    if (body) req.write(body);
    req.end();
  });
}

async function callOpenAI(backend, systemPrompt, userMessage) {
  const body = JSON.stringify({
    model: backend.model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    temperature: 0.1,
    max_tokens: 2000,
    response_format: { type: 'json_object' },
  });

  const text = await httpRequest(`${backend.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${backend.apiKey}`,
      'Content-Length': Buffer.byteLength(body),
    },
  }, body);

  const data = JSON.parse(text);
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error(`Unexpected OpenAI response shape: ${text.slice(0, 400)}`);
  return content;
}

async function callAnthropic(backend, systemPrompt, userMessage) {
  const body = JSON.stringify({
    model: backend.model,
    max_tokens: 2000,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  });

  const text = await httpRequest('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': backend.apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Length': Buffer.byteLength(body),
    },
  }, body);

  const data = JSON.parse(text);
  const content = data?.content?.[0]?.text;
  if (!content) throw new Error(`Unexpected Anthropic response shape: ${text.slice(0, 400)}`);
  return content;
}

function extractJSON(raw) {
  const trimmed = raw.trim();
  // Already valid JSON object
  if (trimmed.startsWith('{')) {
    try { return JSON.parse(trimmed); } catch {}
  }
  // JSON inside code fences
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]+?)```/);
  if (fenceMatch) {
    try { return JSON.parse(fenceMatch[1].trim()); } catch {}
  }
  // First { to last }
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try { return JSON.parse(trimmed.slice(start, end + 1)); } catch {}
  }
  throw new Error(`Could not parse JSON from LLM response:\n${raw.slice(0, 600)}`);
}

async function callLLM(backend, systemPrompt, userMessage) {
  if (backend.type === 'anthropic') {
    return callAnthropic(backend, systemPrompt, userMessage);
  }
  return callOpenAI(backend, systemPrompt, userMessage);
}

module.exports = {
  detectBackend,
  callOpenAI,
  callAnthropic,
  callLLM,
  extractJSON,
  httpRequest,
};
