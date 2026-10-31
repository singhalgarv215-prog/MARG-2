const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent';
// Keep the requested 3.6 Flash model as the primary. Google occasionally
// rejects the execution region. A model fallback is bounded but is NOT a
// region fix: configure placement.region = gcp:asia-south1 on the Worker.
// It is never used for content-quality failures or ordinary 400 responses.
const GEMINI_LOCATION_FALLBACK_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent';
const MIN_OUTPUT_TOKENS = 1024;
const LONG_OUTPUT_TOKENS = 8192;
const VISION_OUTPUT_TOKENS = 4096;
// Small JSON exercises no longer inherit the old 16k Haiku-era floor. Full
// sectionals still request their own larger budgets from the frontend.
const GENERATION_OUTPUT_TOKENS = 8192;
const MAX_OUTPUT_TOKENS = 32768;
const MAX_TRANSIENT_RETRIES = 1;
const MAX_UPSTREAM_TIME_MS = 110000;

const CORS_HEADERS = {
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Marg-Timeout-Ms, X-Marg-Client-Id, X-Marg-Idempotency-Key, X-Marg-Guest-Token',
  'Access-Control-Expose-Headers': 'Retry-After, X-Marg-Request-Id, X-Marg-Upstream-Calls, X-Marg-Web-Grounded, X-Marg-Model-Fallback, X-Marg-Placement, X-Marg-Guest-Token, X-Marg-Idempotent-Replay',
  'Cache-Control': 'no-store'
};

const SUPABASE_URL = 'https://kduqtrumhveteyjkyltf.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtkdXF0cnVtaHZldGV5amt5bHRmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxNjc0MzMsImV4cCI6MjA5NDc0MzQzM30.iUmZLf_GaeTyv2xD0VYY7sYEiTgavQVbITmc-KC6ZPo';
const MAX_REQUEST_BYTES = 20 * 1024 * 1024;
// Caps are above the largest request the app actually builds. See the B3
// inventory: cleanHistory keeps 24 turns plus at most 4 retrieved (marg-app.js),
// image attachments stop at 4, and the largest client maxOutputTokens is 16384.
const MAX_TURNS = 32;
const MAX_TEXT_BYTES = 2 * 1024 * 1024;
const MAX_SYSTEM_BYTES = 256 * 1024;
const MAX_SCHEMA_BYTES = 64 * 1024;
const MAX_IMAGES = 4;
const MAX_IMAGE_BASE64_CHARS = 14 * 1024 * 1024;
const OUTPUT_CLASS_CEILING = 16384;
const GUEST_OUTPUT_CEILING = 8192;
const ALLOWED_THINKING_LEVELS = { minimal:true, low:true, medium:true };
const ALLOWED_IMAGE_MIME = { 'image/jpeg':true, 'image/png':true, 'image/webp':true };
const localRateWindows = new Map();

function requestCorsHeaders(request) {
  const origin = String(request && request.headers && typeof request.headers.get === 'function' ? request.headers.get('Origin') || '' : '');
  let allowed = '';
  try {
    const parsed = origin ? new URL(origin) : null;
    if (origin === 'https://trymarg.com' || origin === 'https://www.trymarg.com' ||
        parsed && ['localhost','127.0.0.1'].includes(parsed.hostname)) allowed = origin;
  } catch (_error) {}
  return allowed ? { 'Access-Control-Allow-Origin':allowed, 'Vary':'Origin' } : {};
}

function localRateAllowed(key, limit) {
  const now = Date.now();
  const current = localRateWindows.get(key);
  if (!current || now - current.startedAt >= 60000) {
    localRateWindows.set(key, { startedAt:now, count:1 });
    return true;
  }
  current.count++;
  return current.count <= limit;
}

async function workerRateAllowed(env, key, bindingName, fallbackLimit) {
  const limiter = env && env[bindingName];
  if (limiter && typeof limiter.limit === 'function') {
    try { return !!(await limiter.limit({ key })).success; } catch (_error) {}
  }
  // The limit is part of the key so a test or config change does not inherit
  // a counter that was filled under a different ceiling.
  return localRateAllowed(bindingName + ':' + key + ':' + fallbackLimit, fallbackLimit);
}

async function authenticateMargUser(request) {
  const authorization = String(request && request.headers && typeof request.headers.get === 'function' ? request.headers.get('Authorization') || '' : '');
  if (!/^Bearer\s+\S+/i.test(authorization)) return { user:null, authState:'none' };
  try {
    const response = await fetchWithWorkerTimeout(SUPABASE_URL + '/auth/v1/user', {
      headers:{ apikey:SUPABASE_PUBLISHABLE_KEY, Authorization:authorization },
      cache:'no-store'
    }, 7000);
    // A rejected credential is not an outage. 5xx and network failures are.
    if (response.status === 401 || response.status === 403) return { user:null, authState:'invalid' };
    if (!response.ok) return { user:null, authState:'unavailable' };
    const user = await response.json();
    return user && user.id ? { user, authState:'valid' } : { user:null, authState:'invalid' };
  } catch (_error) {
    return { user:null, authState:'unavailable' };
  }
}

function flagMode(env, name, fallback) {
  const value = String(env && env[name] || '').trim().toLowerCase();
  if (value === 'off' || value === 'log' || value === 'enforce') return value;
  return fallback;
}

function expandIPv6(input) {
  const value = String(input || '').toLowerCase().split('%')[0];
  if (!value || value.includes('.')) return null;
  const halves = value.split('::');
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(':').filter(Boolean) : [];
  const right = halves.length === 2 ? (halves[1] ? halves[1].split(':').filter(Boolean) : []) : [];
  if (halves.length === 1) {
    if (left.length !== 8) return null;
  } else if (8 - left.length - right.length < 0) return null;
  const missing = halves.length === 1 ? 0 : 8 - left.length - right.length;
  const parts = left.concat(Array(missing).fill('0'), right);
  if (parts.length !== 8 || parts.some((part) => !/^[0-9a-f]{1,4}$/.test(part))) return null;
  return parts.map((part) => parseInt(part, 16).toString(16));
}

function ipBucket(ip) {
  const raw = String(ip || '');
  if (!raw || raw === 'unknown' || raw === 'unit-test') return raw || 'unknown';
  const mapped = raw.match(/(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (raw.includes('.') && mapped) return mapped[1];
  const parts = expandIPv6(raw);
  if (!parts) return raw;
  return parts.slice(0, 4).join(':');
}

function bytesToHex(bytes) {
  return Array.from(new Uint8Array(bytes)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function safeEqual(left, right) {
  const a = String(left || '');
  const b = String(right || '');
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index++) diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return diff === 0;
}

async function hmacHex(secret, payload) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(String(secret || '')), { name:'HMAC', hash:'SHA-256' }, false, ['sign']);
  return bytesToHex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(String(payload || ''))));
}

function guestTokenTtlSeconds(env) {
  return configuredInt(env, 'MARG_GUEST_TOKEN_TTL_SECONDS', 30 * 24 * 60 * 60, false);
}

async function mintGuestToken(secret, env, now) {
  const sessionId = bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
  const exp = Math.floor(Number(now || Date.now()) / 1000) + guestTokenTtlSeconds(env);
  const payload = 'v1.' + sessionId + '.' + exp;
  return { sessionId, token:payload + '.' + await hmacHex(secret, payload) };
}

async function verifyGuestToken(token, secret, now) {
  const parts = String(token || '').split('.');
  if (parts.length !== 4 || parts[0] !== 'v1' || !/^[0-9a-f]{32}$/.test(parts[1])) return { ok:false };
  const exp = Number(parts[2]);
  if (!Number.isFinite(exp) || exp * 1000 <= Number(now || Date.now())) return { ok:false, expired:true };
  const payload = parts[0] + '.' + parts[1] + '.' + parts[2];
  const expected = await hmacHex(secret, payload);
  return safeEqual(expected, parts[3]) ? { ok:true, sessionId:parts[1] } : { ok:false };
}

async function resolveCaller(request, env) {
  const hasHeaderApi = !!(request && request.headers && typeof request.headers.get === 'function');
  const clientId = String(hasHeaderApi ? request.headers.get('X-Marg-Client-Id') || '' : 'worker-unit-request').replace(/[^a-zA-Z0-9._:-]/g, '').slice(0, 120);
  const ip = String(hasHeaderApi ? request.headers.get('CF-Connecting-IP') || 'unknown' : 'unit-test');
  const bucket = ipBucket(ip);
  const now = Date.now();
  const auth = await authenticateMargUser(request);
  if (auth.authState === 'valid' && auth.user && auth.user.id) {
    return { kind:'user', subject:'user:' + auth.user.id, authState:'valid', ip, clientId, bucket, guestToken:'', aggregate:'' };
  }
  if (auth.authState === 'invalid') {
    return { kind:'anonymous', subject:'invalid', authState:'invalid', ip, clientId, bucket, guestToken:'', aggregate:'' };
  }
  if (auth.authState === 'unavailable') {
    return { kind:'anonymous', subject:'unavailable', authState:'unavailable', ip, clientId, bucket, guestToken:'', aggregate:'' };
  }
  const secret = String(env && env.MARG_GUEST_SIGNING_KEY || '');
  const presented = String(hasHeaderApi ? request.headers.get('X-Marg-Guest-Token') || '' : '');
  if (secret) {
    if (presented) {
      const verified = await verifyGuestToken(presented, secret, now);
      if (!verified.ok) {
        return { kind:'guest', subject:'guest:invalid', authState:'guest_token_invalid', ip, clientId, bucket, guestToken:'', aggregate:'' };
      }
      return { kind:'guest', subject:'guest:' + verified.sessionId, authState:'none', ip, clientId, bucket, guestToken:presented, aggregate:'guest-ip:' + bucket };
    }
    const minted = await mintGuestToken(secret, env, now);
    return { kind:'guest', subject:'guest:' + minted.sessionId, authState:'none', ip, clientId, bucket, guestToken:minted.token, aggregate:'guest-ip:' + bucket };
  }
  // No signing key: one shared-network guest budget. Stricter than a signed
  // session, and still capped. The visitor id is not this key.
  return { kind:'guest', subject:'guest-ip:' + bucket, authState:'none', ip, clientId, bucket, guestToken:'', aggregate:'' };
}

async function subjectHash(subject) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(subject || '')));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('').slice(0, 12);
}

function byteLength(value) {
  return new TextEncoder().encode(String(value || '')).length;
}

function beforeUpstream(ctx) {}

function afterUpstream(ctx, result) {}

async function fetchWithWorkerTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const external = options && options.signal;
  const relay = () => controller.abort();
  if (external) {
    if (external.aborted) controller.abort();
    else external.addEventListener('abort', relay, { once:true });
  }
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(url, Object.assign({}, options, { signal:controller.signal })); }
  finally {
    clearTimeout(timer);
    if (external) external.removeEventListener('abort', relay);
  }
}

const DAILY_ARTICLE_FEEDS = {
  economy:{ url:'https://www.thehindu.com/business/feeder/default.rss', source:'The Hindu' },
  environment:{ url:'https://www.thehindu.com/sci-tech/feeder/default.rss', source:'The Hindu' },
  politics:{ url:'https://www.thehindu.com/opinion/editorial/feeder/default.rss', source:'The Hindu Editorial' },
  technology:{ url:'https://www.thehindu.com/sci-tech/technology/feeder/default.rss', source:'The Hindu' }
};

const AEON_TOPIC_FEEDS = {
  ideas:{ url:'https://aeon.co/philosophy/feed.rss', source:'Aeon' },
  science:{ url:'https://aeon.co/science/feed.rss', source:'Aeon' },
  economics:{ url:'https://aeon.co/society/feed.rss', source:'Aeon' },
  history:{ url:'https://aeon.co/culture/feed.rss', source:'Aeon' },
  surprise:{ url:'https://aeon.co/essays/feed.rss', source:'Aeon' },
  philosophy:{ url:'https://aeon.co/philosophy/feed.rss', source:'Aeon' }
};

function jsonResponse(body, status, extraHeaders) {
  return new Response(JSON.stringify(body), {
    status:status,
    headers:Object.assign({ 'Content-Type':'application/json; charset=utf-8' }, CORS_HEADERS, extraHeaders || {})
  });
}

function decodeArticleEntities(value) {
  return String(value || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#(\d+);/g, (_match, number) => String.fromCodePoint(Number(number)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, number) => String.fromCodePoint(parseInt(number, 16)))
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, '<').replace(/&gt;/gi, '>');
}

function stripArticleMarkup(value) {
  return decodeArticleEntities(String(value || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/p\s*>/gi, '\n\n')
    .replace(/<[^>]+>/g, ' '))
    .replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function xmlField(block, names) {
  for (const name of names) {
    const escaped = name.replace(':', '\\:');
    const match = String(block || '').match(new RegExp('<' + escaped + '\\b[^>]*>([\\s\\S]*?)<\\/' + escaped + '>', 'i'));
    if (match) return decodeArticleEntities(match[1]).trim();
  }
  return '';
}

function parseArticleFeed(xml, sourceName) {
  const blocks = String(xml || '').match(/<item\b[\s\S]*?<\/item>|<entry\b[\s\S]*?<\/entry>/gi) || [];
  return blocks.map((block) => {
    const title = stripArticleMarkup(xmlField(block, ['title']));
    let url = stripArticleMarkup(xmlField(block, ['link']));
    if (!/^https?:\/\//i.test(url)) {
      const linkMatch = block.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*>/i);
      url = linkMatch ? decodeArticleEntities(linkMatch[1]).trim() : '';
    }
    const feedContent = stripArticleMarkup(xmlField(block, ['content:encoded', 'content', 'description', 'summary']));
    const publishedAt = stripArticleMarkup(xmlField(block, ['pubDate', 'published', 'updated']));
    return { title, source:sourceName, url, feedContent, publishedAt };
  }).filter((item) => item.title && /^https:\/\//i.test(item.url));
}

function findArticleBodyInJson(value) {
  if (!value) return '';
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findArticleBodyInJson(item);
      if (found) return found;
    }
    return '';
  }
  if (typeof value !== 'object') return '';
  if (typeof value.articleBody === 'string' && value.articleBody.trim()) return value.articleBody.trim();
  if (value['@graph']) {
    const found = findArticleBodyInJson(value['@graph']);
    if (found) return found;
  }
  for (const key of Object.keys(value)) {
    if (key === '@graph' || key === 'articleBody') continue;
    if (value[key] && typeof value[key] === 'object') {
      const found = findArticleBodyInJson(value[key]);
      if (found) return found;
    }
  }
  return '';
}

function extractArticleBody(html) {
  const source = String(html || '');
  const jsonScripts = source.match(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi) || [];
  for (const script of jsonScripts) {
    const body = script.replace(/^<script\b[^>]*>/i, '').replace(/<\/script>$/i, '').trim();
    try {
      const found = findArticleBodyInJson(JSON.parse(body));
      if (found && found.split(/\s+/).length >= 180) return stripArticleMarkup(found);
    } catch (_error) {}
  }

  const articleMatch = source.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i);
  const mainMatch = source.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
  const region = articleMatch ? articleMatch[1] : mainMatch ? mainMatch[1] : '';
  if (region) {
    const paragraphs = (region.match(/<p\b[^>]*>[\s\S]*?<\/p>/gi) || [])
      .map(stripArticleMarkup)
      .filter((paragraph) => paragraph.split(/\s+/).length >= 12 && !/^(?:read more|also read|related stories|comments?)\b/i.test(paragraph));
    const joined = paragraphs.join('\n\n').trim();
    if (joined.split(/\s+/).length >= 180) return joined;
  }
  return '';
}

function isAllowedArticleUrl(url, topic) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (Object.hasOwn(AEON_TOPIC_FEEDS, topic)) return host === 'aeon.co' || host.endsWith('.aeon.co');
    return host === 'thehindu.com' || host.endsWith('.thehindu.com');
  } catch (_error) { return false; }
}

async function getDailyArticleSource(topic, offset) {
  const aeonTopic = Object.hasOwn(AEON_TOPIC_FEEDS, topic);
  const selectedTopic = aeonTopic ? topic : (Object.hasOwn(DAILY_ARTICLE_FEEDS, topic) ? topic : 'economy');
  const feed = aeonTopic ? AEON_TOPIC_FEEDS[selectedTopic] : DAILY_ARTICLE_FEEDS[selectedTopic];
  const feedResponse = await fetchWithWorkerTimeout(feed.url, {
    headers:{ 'Accept':'application/rss+xml, application/atom+xml, text/xml;q=0.9, */*;q=0.5', 'User-Agent':'Marg-CAT-Reading/1.0 (+https://trymarg.com)' }
  }, 9000);
  if (!feedResponse.ok) throw new Error('Publisher feed returned ' + feedResponse.status);
  const items = parseArticleFeed(await feedResponse.text(), feed.source).sort((a, b) => {
    const aTime = Date.parse(a.publishedAt || '') || 0;
    const bTime = Date.parse(b.publishedAt || '') || 0;
    return bTime - aTime;
  });
  if (!items.length) throw new Error('Publisher feed contained no usable articles');
  if (aeonTopic) {
    const essays = items.filter((item) => /\/essays\//i.test(item.url));
    if (essays.length) items.splice(0, items.length, ...essays);
  }
  // Offset zero is always the newest publisher item. Mixing the calendar day
  // into a moving RSS array caused yesterday's item to reappear after the feed
  // changed. The browser now owns the per-day selection and uses this offset
  // only to request the next real Hindu/Aeon article.
  const position = Math.max(0, Number(offset) || 0) % items.length;
  const article = items[position];
  let pageText = '';
  if (isAllowedArticleUrl(article.url, selectedTopic)) {
    try {
      const pageResponse = await fetchWithWorkerTimeout(article.url, {
        redirect:'follow',
        headers:{ 'Accept':'text/html,application/xhtml+xml', 'User-Agent':'Mozilla/5.0 (compatible; Marg-CAT-Reading/1.0; +https://trymarg.com)' }
      }, 9000);
      if (pageResponse.ok) pageText = extractArticleBody(await pageResponse.text());
    } catch (_error) {}
  }
  const feedText = String(article.feedContent || '').trim();
  const content = (pageText.split(/\s+/).length >= feedText.split(/\s+/).length ? pageText : feedText).slice(0, 18000).trim();
  const wordCount = content ? content.split(/\s+/).filter(Boolean).length : 0;
  return {
    title:article.title,
    source:article.source,
    url:article.url,
    publishedAt:article.publishedAt,
    preview:(content || article.title).slice(0, 240).trim() + ((content || article.title).length > 240 ? '…' : ''),
    content,
    contentVerified:wordCount >= 180
  };
}

function normalizeInlineImage(part) {
  if (!part || typeof part !== 'object') return null;
  const inline = part.inlineData || part.inline_data || part.image ||
    (part.type === 'image' && part.source && part.source.type === 'base64' ? part.source : null);
  if (!inline || !inline.data) return null;
  const mimeType = inline.mimeType || inline.mime_type || inline.media_type || part.mimeType || part.mime_type;
  if (!mimeType || !/^image\//i.test(String(mimeType))) return null;
  return { inlineData:{ mimeType:String(mimeType), data:String(inline.data) } };
}

function textWithoutInternalMemory(text) {
  const value = String(text || '');
  const at = value.indexOf('[MARG_INTERNAL:');
  if (at < 0) return value;
  return value.slice(0, at).trim();
}

function normalizeMessageParts(message) {
  const source = Array.isArray(message && message.parts)
    ? message.parts
    : Array.isArray(message && message.content)
      ? message.content
      : [message && message.content];
  const parts = [];
  source.forEach((part) => {
    if (typeof part === 'string' && part.trim()) {
      const text = textWithoutInternalMemory(part);
      if (text) parts.push({ text });
    } else if (part && typeof part.text === 'string' && part.text.trim()) {
      const text = textWithoutInternalMemory(part.text);
      if (text) parts.push({ text });
    } else {
      const imagePart = normalizeInlineImage(part);
      if (imagePart) parts.push(imagePart);
    }
  });
  return parts;
}

function normalizeMessages(messages) {
  const contents = [];
  (messages || []).forEach((message) => {
    if (!message) return;
    const role = message.role === 'assistant' || message.role === 'model' ? 'model' : 'user';
    const parts = normalizeMessageParts(message);
    if (!parts.length) return;
    const previous = contents[contents.length - 1];
    if (previous && previous.role === role) {
      if (previous.parts.length && previous.parts[previous.parts.length - 1].text && parts[0].text) previous.parts.push({ text:'\n\n' });
      previous.parts.push(...parts);
    } else contents.push({ role, parts });
  });
  // generateContent expects an alternating chat ending in a user turn. The
  // frontend normally guarantees this, but enforce it again at the boundary
  // so old/cached clients cannot produce an INVALID_ARGUMENT failure.
  while (contents.length && contents[0].role !== 'user') contents.shift();
  while (contents.length && contents[contents.length - 1].role !== 'user') contents.pop();
  return contents;
}

function contentsContainImages(contents) {
  return (contents || []).some((message) => (message.parts || []).some((part) => part && part.inlineData));
}

function currentUserMessage(contents) {
  const list = contents || [];
  for (let index = list.length - 1; index >= 0; index--) {
    if (list[index] && list[index].role === 'user') return list[index];
  }
  return null;
}

function messageContainsImages(message) {
  return !!(message && (message.parts || []).some((part) => part && part.inlineData));
}

function requestText(payload, contents) {
  return (contents || []).flatMap((message) => message.parts || []).map((part) => part && part.text || '').join('\n').toLowerCase();
}

function systemRequestText(payload) {
  if (payload && payload.systemInstruction && Array.isArray(payload.systemInstruction.parts)) {
    return payload.systemInstruction.parts.map((part) => part && part.text || '').join('\n').toLowerCase();
  }
  return String(payload && payload.system || '').toLowerCase();
}

function hasJsonResponseFormat(generationConfig) {
  const config = generationConfig || {};
  const format = config.responseFormat && config.responseFormat.text;
  return normalizeTextResponseMimeType(format && format.mimeType || config.responseMimeType || '') === 'APPLICATION_JSON';
}

function normalizeTextResponseMimeType(value) {
  const normalized = String(value || '').trim().toUpperCase().replace(/[\/-]+/g, '_');
  if (normalized === 'APPLICATION_JSON') return 'APPLICATION_JSON';
  if (normalized === 'TEXT_PLAIN') return 'TEXT_PLAIN';
  return String(value || '').trim();
}

function normalizeResponseJsonSchema(value) {
  if (Array.isArray(value)) return value.map(normalizeResponseJsonSchema);
  if (!value || typeof value !== 'object') return value;
  const normalized = {};
  Object.keys(value).forEach((key) => {
    // TextResponseFormat accepts a deliberately small JSON Schema subset.
    // Older Marg bundles used string-length keywords, which make the entire
    // generateContent request fail before the model can write an RC.
    if (key === 'minLength' || key === 'maxLength' || key === 'pattern') return;
    normalized[key] = normalizeResponseJsonSchema(value[key]);
  });
  return normalized;
}

function normalizeGenerationConfig(generationConfig) {
  const config = Object.assign({}, generationConfig || {});
  const legacyMimeType = config.responseMimeType;
  const legacySchema = config.responseJsonSchema || config.responseSchema;
  const existingTextFormat = config.responseFormat && config.responseFormat.text;

  // Marg calls the v1beta GenerateContent endpoint, whose production JSON
  // mode uses responseMimeType/responseJsonSchema. Convert cached aliases
  // to that accepted wire contract. This normalization is not a remedy for
  // Google's independent execution-region restrictions.
  if (existingTextFormat || legacyMimeType || legacySchema) {
    const normalizedMimeType = normalizeTextResponseMimeType(existingTextFormat && existingTextFormat.mimeType || legacyMimeType || 'APPLICATION_JSON');
    config.responseMimeType = normalizedMimeType === 'APPLICATION_JSON' ? 'application/json' : normalizedMimeType === 'TEXT_PLAIN' ? 'text/plain' : String(legacyMimeType || 'text/plain');
    const selectedSchema = existingTextFormat && existingTextFormat.schema || legacySchema;
    if (selectedSchema) config.responseJsonSchema = normalizeResponseJsonSchema(selectedSchema);
  }
  delete config.responseFormat;
  delete config.responseSchema;
  return config;
}

function isPracticeGenerationRequest(payload, contents) {
  const systemText = systemRequestText(payload);
  if (systemText.includes('[marg_task: compact_decision_lab]')) return false;
  const current = currentUserMessage(contents);
  const currentText = current ? (current.parts || []).map((part) => part && part.text || '').join('\n').toLowerCase() : '';
  // JSON mode and an explicit generator instruction are practice generation.
  // Incidental wording in the mentor system instruction, including "DILR set",
  // is not a request to generate practice material.
  if (payload && hasJsonResponseFormat(payload.generationConfig)) return true;
  if (/\b(?:return only valid json|generate only valid json)\b/.test(systemText) ||
      /\b(?:return only valid json|generate only valid json)\b/.test(currentText)) return true;
  if (/\bquestion generator\b/.test(systemText) || /\bquestion generator\b/.test(currentText)) return true;
  return /\b(?:generate|write|create)\b[\s\S]{0,180}\b(?:sectional test|cat-style rc|cat style rc|dilr set|qa set|practice set|passage)\b/.test(currentText);
}

function resolveMaxOutputTokens(payload, contents, requestedTokens) {
  const requested = Number(requestedTokens) || 0;
  const text = requestText(payload, contents);
  // Practice and JSON generation keep their own floors. Those requests are not
  // mentor-chat shape ceilings.
  if (isPracticeGenerationRequest(payload, contents)) {
    let floor = MIN_OUTPUT_TOKENS;
    if (contentsContainImages(contents)) floor = VISION_OUTPUT_TOKENS;
    if (/\b(?:complete roadmap|study plan|mock analysis|answer review|multi-step|full solution)\b/.test(text)) floor = Math.max(floor, LONG_OUTPUT_TOKENS);
    floor = Math.max(floor, GENERATION_OUTPUT_TOKENS);
    return Math.min(MAX_OUTPUT_TOKENS, Math.max(floor, requested));
  }
  // Mentor chat: the client shape budget is the ceiling. Older history cannot
  // raise it through keywords or images. An image on the current user turn
  // still uses the vision floor.
  let ceiling = Math.max(MIN_OUTPUT_TOKENS, requested);
  if (messageContainsImages(currentUserMessage(contents))) ceiling = Math.max(ceiling, VISION_OUTPUT_TOKENS);
  return Math.min(MAX_OUTPUT_TOKENS, ceiling);
}

function listInputMessages(payload) {
  if (payload && Array.isArray(payload.contents)) return payload.contents;
  if (payload && Array.isArray(payload.messages)) return payload.messages;
  return null;
}

function messageParts(message) {
  if (!message || typeof message !== 'object') return [];
  if (Array.isArray(message.parts)) return message.parts;
  if (Array.isArray(message.content)) return message.content;
  if (message.content != null) return [message.content];
  return [];
}

function partImage(part) {
  return normalizeInlineImage(part);
}

function payloadRequestsGrounding(payload, compatibilityMode) {
  if (!payload) return false;
  if (payload.margWebGrounding === true) return true;
  return compatibilityMode && payload.web_search === true;
}

function allowListedGenerationConfig(generationConfig, dropped) {
  const normalized = normalizeGenerationConfig(generationConfig);
  const config = {};
  const rawLevel = normalized.thinkingConfig && normalized.thinkingConfig.thinkingLevel;
  if (ALLOWED_THINKING_LEVELS[rawLevel]) config.thinkingConfig = { thinkingLevel:rawLevel };
  else {
    config.thinkingConfig = { thinkingLevel:'low' };
    if (rawLevel != null && String(rawLevel) !== '') dropped.push('thinkingConfig.thinkingLevel');
  }
  if (normalized.thinkingConfig && typeof normalized.thinkingConfig === 'object') {
    Object.keys(normalized.thinkingConfig).forEach((key) => {
      if (key !== 'thinkingLevel') dropped.push('thinkingConfig.' + key);
    });
  }
  Object.keys(normalized).forEach((key) => {
    if (key === 'maxOutputTokens' || key === 'thinkingConfig' || key === 'responseMimeType' || key === 'responseJsonSchema') return;
    dropped.push('generationConfig.' + key);
  });
  if (Object.prototype.hasOwnProperty.call(normalized, 'maxOutputTokens')) config.maxOutputTokens = normalized.maxOutputTokens;
  const mime = normalized.responseMimeType;
  if (mime === 'application/json' || mime === 'text/plain') config.responseMimeType = mime;
  else if (mime) dropped.push('generationConfig.responseMimeType');
  if (normalized.responseJsonSchema) config.responseJsonSchema = normalized.responseJsonSchema;
  return config;
}

function allowListedSystemInstruction(systemInstruction, dropped) {
  if (!systemInstruction || typeof systemInstruction !== 'object') return null;
  Object.keys(systemInstruction).forEach((key) => {
    if (key !== 'parts') dropped.push('systemInstruction.' + key);
  });
  const parts = Array.isArray(systemInstruction.parts) ? systemInstruction.parts : [];
  const textParts = parts.map((part) => {
    if (!part || typeof part !== 'object') return null;
    Object.keys(part).forEach((key) => {
      if (key !== 'text') dropped.push('systemInstruction.part.' + key);
    });
    if (typeof part.text !== 'string') return null;
    return { text:part.text };
  }).filter(Boolean);
  if (!textParts.length) return null;
  const instruction = { parts:textParts };
  if (textParts.map((part) => part.text).join('\n').toLowerCase().includes('[marg_task: compact_decision_lab]')) {
    instruction.parts = textParts.map((part) => ({ text:part.text.replace(/\s*\[MARG_TASK:\s*COMPACT_DECISION_LAB\]\s*/ig, '\n') }));
  }
  return instruction;
}

function buildAllowListedPayload(payload) {
  const dropped = [];
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { payload:null, compatibilityMode:false, droppedFieldNames:dropped, requestedGrounding:false };
  }
  const compatibilityMode = !Array.isArray(payload.contents);
  if (compatibilityMode && !Array.isArray(payload.messages)) {
    return { payload:null, compatibilityMode:false, droppedFieldNames:dropped, requestedGrounding:false };
  }
  const consumed = {
    contents:true, messages:true, systemInstruction:true, system:true, generationConfig:true,
    max_tokens:true, margWebGrounding:true, web_search:true, margAction:true, topic:true, offset:true
  };
  Object.keys(payload).forEach((key) => {
    if (!consumed[key]) dropped.push(key);
  });
  const requestedGrounding = payloadRequestsGrounding(payload, compatibilityMode || payload.margWebGrounding === true);
  let upstream;
  if (!compatibilityMode) {
    const contents = normalizeMessages(payload.contents);
    const generationConfig = allowListedGenerationConfig(payload.generationConfig, dropped);
    upstream = { contents, generationConfig };
    const systemInstruction = allowListedSystemInstruction(payload.systemInstruction, dropped);
    if (systemInstruction) upstream.systemInstruction = systemInstruction;
    upstream.generationConfig.maxOutputTokens = resolveMaxOutputTokens(upstream, contents, upstream.generationConfig.maxOutputTokens);
  } else {
    const contents = normalizeMessages(payload.messages);
    const requestedOutputTokens = resolveMaxOutputTokens(payload, contents, payload.max_tokens);
    upstream = {
      contents,
      generationConfig:{
        maxOutputTokens:requestedOutputTokens,
        thinkingConfig:{ thinkingLevel:requestedOutputTokens > 4096 ? 'medium' : 'minimal' }
      }
    };
    if (/\b(?:return|generate)\s+only\s+valid\s+json\b/i.test(String(payload.system || ''))) {
      upstream.generationConfig.responseMimeType = 'application/json';
    }
    if (payload.system) upstream.systemInstruction = { parts:[{ text:String(payload.system) }] };
  }
  const structured = hasJsonResponseFormat(upstream.generationConfig) || !!(upstream.generationConfig && upstream.generationConfig.responseJsonSchema);
  if (requestedGrounding && !structured) upstream.tools = [{ google_search:{} }];
  return { payload:upstream, compatibilityMode, droppedFieldNames:uniqueNames(dropped), requestedGrounding, structured };
}

function uniqueNames(names) {
  const seen = {};
  return names.filter((name) => {
    if (!name || seen[name]) return false;
    seen[name] = true;
    return true;
  });
}

function classifyBuiltRequest(payload, built) {
  if (payload && payload.margAction === 'daily_article') return 'article';
  const contents = built && built.payload && built.payload.contents;
  if (contentsContainImages(contents) || rawImageCount(payload) > 0) return 'vision';
  if (built && built.structured) return 'structured';
  if (built && built.requestedGrounding) return 'grounded';
  return 'chat';
}

function rawImageCount(payload) {
  const messages = listInputMessages(payload) || [];
  let count = 0;
  messages.forEach((message) => {
    messageParts(message).forEach((part) => {
      if (partImage(part)) count += 1;
    });
  });
  return count;
}

function collectText(payload) {
  const chunks = [];
  const messages = listInputMessages(payload) || [];
  messages.forEach((message) => {
    messageParts(message).forEach((part) => {
      if (typeof part === 'string') chunks.push(part);
      else if (part && typeof part.text === 'string') chunks.push(part.text);
    });
  });
  if (payload && payload.systemInstruction && Array.isArray(payload.systemInstruction.parts)) {
    payload.systemInstruction.parts.forEach((part) => {
      if (part && typeof part.text === 'string') chunks.push(part.text);
    });
  }
  if (payload && payload.system) chunks.push(String(payload.system));
  return chunks;
}

function schemaByteLength(payload) {
  const config = payload && payload.generationConfig || {};
  const schema = config.responseJsonSchema || config.responseSchema || (config.responseFormat && config.responseFormat.text && config.responseFormat.text.schema);
  if (!schema) return 0;
  try { return byteLength(JSON.stringify(schema)); } catch (_error) { return MAX_SCHEMA_BYTES + 1; }
}

function systemByteLength(payload) {
  if (payload && payload.systemInstruction && Array.isArray(payload.systemInstruction.parts)) {
    return byteLength(payload.systemInstruction.parts.map((part) => part && part.text || '').join('\n'));
  }
  return byteLength(payload && payload.system || '');
}

function validBase64(value) {
  const text = String(value || '').replace(/\s+/g, '');
  if (!text || text.length % 4 !== 0) return false;
  return /^[A-Za-z0-9+/]+={0,2}$/.test(text);
}

function collectValidationReasons(payload) {
  const reasons = [];
  const sizeReasons = [];
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    reasons.push('BODY_NOT_OBJECT');
    return { reasons, sizeReasons };
  }
  if (payload.margAction === 'daily_article') return { reasons, sizeReasons };
  const messages = listInputMessages(payload);
  if (!messages) {
    reasons.push('CONTENTS_NOT_ARRAY');
    return { reasons, sizeReasons };
  }
  if (messages.length > MAX_TURNS) reasons.push('TOO_MANY_TURNS');
  messages.forEach((message) => {
    if (!message || typeof message !== 'object' || Array.isArray(message)) {
      reasons.push('MESSAGE_NOT_OBJECT');
      return;
    }
    const role = message.role;
    if (role !== 'user' && role !== 'model' && role !== 'assistant') reasons.push('ROLE_INVALID');
    messageParts(message).forEach((part) => {
      if (typeof part === 'string') return;
      if (!part || typeof part !== 'object' || Array.isArray(part)) {
        reasons.push('PART_INVALID');
        return;
      }
      const image = partImage(part);
      const hasText = typeof part.text === 'string';
      if (!hasText && !image) reasons.push('PART_INVALID');
      if (image) {
        const mime = String(image.inlineData.mimeType || '').toLowerCase();
        if (!ALLOWED_IMAGE_MIME[mime]) reasons.push('IMAGE_MIME');
        if (String(image.inlineData.data || '').length > MAX_IMAGE_BASE64_CHARS) sizeReasons.push('IMAGE_TOO_LARGE');
        if (!validBase64(image.inlineData.data)) reasons.push('IMAGE_ENCODING');
      }
      Object.keys(part).forEach((key) => {
        if (key === 'text' || key === 'inlineData' || key === 'inline_data' || key === 'image' || key === 'type' || key === 'source' || key === 'mimeType' || key === 'mime_type' || key === 'media_type' || key === 'data') return;
        reasons.push('PART_INVALID');
      });
    });
  });
  if (rawImageCount(payload) > MAX_IMAGES) reasons.push('IMAGE_COUNT');
  const textBytes = collectText(payload).reduce((total, chunk) => total + byteLength(chunk), 0);
  if (textBytes > MAX_TEXT_BYTES) sizeReasons.push('TEXT_TOO_LARGE');
  if (systemByteLength(payload) > MAX_SYSTEM_BYTES) sizeReasons.push('SYSTEM_TOO_LARGE');
  if (schemaByteLength(payload) > MAX_SCHEMA_BYTES) sizeReasons.push('SCHEMA_TOO_LARGE');
  if (!messages.length) reasons.push('EMPTY_CONTENTS');
  return { reasons:uniqueNames(reasons), sizeReasons:uniqueNames(sizeReasons) };
}

function validateRequest(payload, caller, mode) {
  const validationMode = mode || 'log';
  const built = buildAllowListedPayload(payload);
  const requestClass = classifyBuiltRequest(payload, built);
  const collected = collectValidationReasons(payload);
  const reasons = collected.reasons.concat(collected.sizeReasons);
  const ceiling = requestClass === 'article' ? 0 : OUTPUT_CLASS_CEILING;
  const resolvedTokens = built.payload && built.payload.generationConfig ? Number(built.payload.generationConfig.maxOutputTokens) || 0 : 0;
  const clamps = [];
  if (requestClass !== 'article' && resolvedTokens > ceiling) {
    clamps.push({ field:'maxOutputTokens', from:resolvedTokens, to:ceiling, applied:validationMode === 'enforce' });
    if (validationMode === 'enforce' && built.payload && built.payload.generationConfig) built.payload.generationConfig.maxOutputTokens = ceiling;
  }
  let upstreamPayload = built.payload;
  if (upstreamPayload && built.requestedGrounding && requestClass === 'structured') {
    delete upstreamPayload.tools;
  }
  if (validationMode === 'enforce' && caller && caller.kind !== 'user' && upstreamPayload && upstreamPayload.tools) {
    delete upstreamPayload.tools;
  }
  const outputTokensSent = upstreamPayload && upstreamPayload.generationConfig ? Number(upstreamPayload.generationConfig.maxOutputTokens) || 0 : 0;
  const requested = payload && (Array.isArray(payload.contents) ? payload.generationConfig && payload.generationConfig.maxOutputTokens : payload.max_tokens);
  const limits = {
    maxTurns:MAX_TURNS,
    maxTextBytes:MAX_TEXT_BYTES,
    maxSystemBytes:MAX_SYSTEM_BYTES,
    maxSchemaBytes:MAX_SCHEMA_BYTES,
    maxImages:MAX_IMAGES,
    maxImageBase64Chars:MAX_IMAGE_BASE64_CHARS,
    maxOutputTokens:ceiling,
    guestOutputTokens:GUEST_OUTPUT_CEILING
  };
  const activeReasons = validationMode === 'off' ? [] : reasons;
  const ok = validationMode !== 'enforce' || (collected.reasons.length === 0 && collected.sizeReasons.length === 0);
  return {
    ok,
    reasons:activeReasons,
    sizeReasons:validationMode === 'off' ? [] : collected.sizeReasons,
    structuralReasons:validationMode === 'off' ? [] : collected.reasons,
    requestClass,
    limits,
    upstreamPayload,
    compatibilityMode:built.compatibilityMode,
    droppedFieldNames:built.droppedFieldNames,
    clamps:validationMode === 'off' ? [] : clamps,
    requestedGrounding:!!built.requestedGrounding,
    outputTokensRequested:Number(requested) || 0,
    outputTokensSent,
    hasImages:requestClass === 'vision'
  };
}

function guestCapabilityViolations(payload, caller, validation) {
  if (!caller || caller.kind === 'user') return [];
  const violations = [];
  if (payload && payload.margAction === 'daily_article') violations.push('daily_article');
  if (validation.hasImages || rawImageCount(payload) > 0) violations.push('image');
  if (validation.requestedGrounding) violations.push('web_grounding');
  if (validation.requestClass === 'structured') violations.push('structured');
  if (validation.requestClass !== 'article' && validation.outputTokensSent > GUEST_OUTPUT_CEILING) violations.push('output_tokens');
  return violations;
}

function extractText(payload) {
  const parts = payload && payload.candidates && payload.candidates[0] && payload.candidates[0].content && payload.candidates[0].content.parts;
  return Array.isArray(parts)
    ? parts.filter((part) => part && !part.thought && typeof part.text === 'string').map((part) => part.text).join('')
    : '';
}

function getFinishReason(payload) {
  return payload && payload.candidates && payload.candidates[0] && payload.candidates[0].finishReason || '';
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function getRetryDelayMilliseconds(response, attempt) {
  const retryAfter = Number(response && response.headers && response.headers.get('Retry-After'));
  if (Number.isFinite(retryAfter) && retryAfter > 0) return Math.min(10000, retryAfter * 1000);
  return Math.min(4000, 1000 * Math.pow(2, attempt));
}

function parseUpstreamError(responseBody, status) {
  let parsed = null;
  try { parsed = JSON.parse(responseBody); } catch (error) {}
  const upstreamError = parsed && parsed.error ? parsed.error : {};
  return {
    code:Number(upstreamError.code) || Number(status) || 502,
    status:String(upstreamError.status || ''),
    message:String(upstreamError.message || responseBody || 'Gemini request failed').slice(0, 800)
  };
}

function modelFromEndpoint(endpoint) {
  const match = String(endpoint || '').match(/models\/([^:/?]+)/);
  return match ? match[1] : 'gemini-3.6-flash';
}

function abortedAttempt(error, upstreamStarted, attempts) {
  error.upstreamStarted = !!upstreamStarted;
  error.attempts = attempts || [];
  return error;
}

async function generateWithControlledRetry(initialPayload, apiKey, clientSignal, timeoutMs, hooks) {
  const controller = new AbortController();
  const relayAbort = () => controller.abort();
  if (clientSignal) {
    if (clientSignal.aborted) controller.abort();
    else clientSignal.addEventListener('abort', relayAbort, { once:true });
  }
  const requestedTime = Number(timeoutMs);
  const budget = Math.min(MAX_UPSTREAM_TIME_MS, Number.isFinite(requestedTime) && requestedTime > 0 ? Math.max(1000, requestedTime) : 55000);
  const deadline = Date.now() + budget;
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, budget);
  try {
    return await generateWithinDeadline(initialPayload, apiKey, controller.signal, deadline, hooks);
  } catch (error) {
    const started = !!(error && error.upstreamStarted);
    const attempts = error && error.attempts || [];
    if (timedOut || (error && error.name === 'AbortError')) {
      return {
        ok:false,
        status:timedOut ? 504 : 499,
        error:timedOut
          ? { code:504, status:'UPSTREAM_TIMEOUT', message:'Marg’s answer service exceeded this request’s time limit.' }
          : { code:499, status:'CLIENT_CLOSED', message:'The request closed before Marg finished.' },
        retryable:!!timedOut,
        retryAfter:'',
        upstreamCalls:attempts.length || (started ? 1 : 0),
        attempts,
        upstreamStarted:started,
        uncertain:started,
        usageMetadata:null,
        modelFallbackUsed:attempts.some((attempt) => attempt && attempt.model === 'gemini-3.5-flash')
      };
    }
    throw error;
  } finally {
    clearTimeout(timer);
    if (clientSignal) clientSignal.removeEventListener('abort', relayAbort);
  }
}

async function generateWithinDeadline(initialPayload, apiKey, clientSignal, deadline, hooks) {
  let upstreamCalls = 0;
  let transientRetries = 0;
  let locationFallbacks = 0;
  let endpoint = GEMINI_ENDPOINT;
  const attempts = [];
  let upstreamStarted = false;
  while (true) {
    if (clientSignal && clientSignal.aborted) throw abortedAttempt(new DOMException('Client request was aborted', 'AbortError'), upstreamStarted, attempts);
    if (Date.now() >= deadline) throw abortedAttempt(new DOMException('Upstream deadline exceeded', 'AbortError'), upstreamStarted, attempts);
    const model = modelFromEndpoint(endpoint);
    if (hooks && typeof hooks.beforeAttempt === 'function' && attempts.length > 0) {
      const decision = await hooks.beforeAttempt({ index:attempts.length, model });
      if (decision && decision.stop) {
        return {
          ok:false,
          status:decision.status || 429,
          contentType:'application/json; charset=utf-8',
          error:decision.error || { code:429, status:'QUOTA_EXCEEDED', message:'Marg paused the retry because it would pass the usage allowance.' },
          retryable:false,
          retryAfter:'',
          upstreamCalls,
          modelFallbackUsed:locationFallbacks > 0,
          attempts,
          upstreamStarted,
          usageMetadata:null
        };
      }
    }
    upstreamCalls++;
    upstreamStarted = true;
    let upstream;
    try {
      upstream = await fetch(endpoint, {
        method:'POST',
        headers:{ 'Content-Type':'application/json', 'x-goog-api-key':apiKey },
        body:JSON.stringify(initialPayload),
        signal:clientSignal,
        cache:'no-store'
      });
    } catch (error) {
      attempts.push({ model, uncertain:true, usage:null });
      throw abortedAttempt(error, true, attempts);
    }
    const responseBody = await upstream.text();
    if (!upstream.ok) {
      const parsedError = parseUpstreamError(responseBody, upstream.status);
      attempts.push({ model, uncertain:true, usage:null, status:upstream.status });
      const retryable = upstream.status === 429 || upstream.status === 503;
      const locationRejected = upstream.status === 400 &&
        String(parsedError.status || '').toUpperCase() === 'FAILED_PRECONDITION' &&
        /user location is not supported/i.test(parsedError.message || '');
      if (locationRejected && locationFallbacks < 1) {
        locationFallbacks++;
        endpoint = GEMINI_LOCATION_FALLBACK_ENDPOINT;
        await wait(250);
        continue;
      }
      const retryDelay = getRetryDelayMilliseconds(upstream, transientRetries);
      if (retryable && transientRetries < MAX_TRANSIENT_RETRIES && deadline - Date.now() > retryDelay + 4000) {
        await wait(retryDelay);
        transientRetries++;
        continue;
      }
      return {
        ok:false,
        status:upstream.status,
        contentType:'application/json; charset=utf-8',
        error:parsedError,
        retryable,
        retryAfter:upstream.headers.get('Retry-After') || '',
        upstreamCalls,
        modelFallbackUsed:locationFallbacks > 0,
        attempts,
        upstreamStarted:true,
        usageMetadata:null
      };
    }

    let responseJson;
    try {
      responseJson = JSON.parse(responseBody);
    } catch (error) {
      attempts.push({ model, uncertain:true, usage:null });
      return {
        ok:false,
        status:502,
        contentType:'application/json; charset=utf-8',
        error:{ code:502, status:'INVALID_UPSTREAM_RESPONSE', message:'Gemini returned an invalid JSON response' },
        retryable:false,
        retryAfter:'',
        upstreamCalls,
        attempts,
        upstreamStarted:true,
        usageMetadata:null
      };
    }
    const usage = responseJson.usageMetadata && typeof responseJson.usageMetadata === 'object' ? responseJson.usageMetadata : null;
    attempts.push({ model, uncertain:!usage, usage });
    return {
      ok:true,
      status:upstream.status,
      contentType:upstream.headers.get('Content-Type') || 'application/json; charset=utf-8',
      json:responseJson,
      text:extractText(responseJson),
      finishReason:getFinishReason(responseJson),
      usageMetadata:usage,
      upstreamCalls,
      modelFallbackUsed:locationFallbacks > 0,
      attempts,
      upstreamStarted:true
    };
  }
}

// Beta spending control. These numbers are initial defaults, not a permanent
// policy. Every one is overridden by a Worker variable. Monetary checks use
// integer micro-dollars (1 dollar = 1,000,000). Token caps still apply when
// pricing is turned off or a price is missing.
//
// Prices below are the Gemini Developer API introductory rates published for
// 31 Oct 2026 and valid through 31 Dec 2026. gemini-3.6-flash: input $0.75 /
// 1M, output including thinking $3.75 / 1M, cache $0.075 / 1M. gemini-3.5-flash
// (location fallback): input $1.50 / 1M, output including thinking $9.00 / 1M,
// cache $0.15 / 1M. From 1 Jan 2027 the 3.6 list price rises to $1.50 / $7.50
// and stays below 3.5, so the reservation still uses 3.5 unless the variables
// are changed. Grounding with Google Search is not inside those token rates
// (5,000 prompts free, then $14 / 1,000). MARG_GROUNDING_MICROS_PER_REQUEST has
// no built-in price. When it is unset or 0, a grounded request is refused
// before Gemini. Guests are never grounded.
//
// UsageLedger is one Durable Object, but it does not store one growing blob.
// Counters, reservations, minute slots and stored replies are separate keys.
// A normal reserve reads and writes only the keys for that subject. The object
// still serialises every call, so it becomes a hotspot when concurrent model
// calls queue on it. Do not shard in this change. Scale later by sharding
// personal counters with idFromName(subject) and keeping one global object.
// Always lock the subject first and the global object second.
//
// IDEMPOTENCY_PER_SUBJECT_CAP and IDEMPOTENCY_TOTAL_CAP are storage bounds.
// They are not student or guest allowances. They keep one replay index small
// and stop stored replies from growing without limit. The oldest stored reply
// is dropped first. IDEMPOTENCY_VALUE_CAP keeps one stored reply under the
// key-value Durable Object value limit. LEDGER_SQLITE_VALUE_BYTES is
// Cloudflare's documented 2 MiB limit for one SQLite-backed value.
const RESERVE_MODEL = 'gemini-3.5-flash';
const BUILTIN_MODEL_PRICES = {
  'gemini-3.6-flash':{ input:750000, output:3750000, cached:75000 },
  'gemini-3.5-flash':{ input:1500000, output:9000000, cached:150000 }
};
const IDEMPOTENCY_REPLAY_BYTES = 512 * 1024;
const IDEMPOTENCY_PER_SUBJECT_CAP = 32;
const IDEMPOTENCY_TOTAL_CAP = 4096;
const IDEMPOTENCY_VALUE_CAP = 96 * 1024;
const LEDGER_SQLITE_VALUE_BYTES = 2 * 1024 * 1024;
// 128-bit storage-key hash. Not an allowance. A shorter hash would make collisions plausible.
const LEDGER_KEY_HASH_HEX = 32;
// Cloudflare documents 128 as the maximum keys in one storage.get/delete array call.
// Pages use that size so a prefix is never loaded in one call. Not an allowance.
const LEDGER_LIST_PAGE = 128;

function configuredInt(env, name, fallback, allowZero) {
  const raw = env && env[name];
  if (raw == null || String(raw).trim() === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0 || (value === 0 && !allowZero)) {
    try { console.log(JSON.stringify({ configuredIntRejected:name })); } catch (_error) {}
    return fallback;
  }
  return value;
}

function optionalPositiveInt(env, name) {
  const raw = env && env[name];
  if (raw == null || String(raw).trim() === '') return null;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    try { console.log(JSON.stringify({ configuredIntRejected:name })); } catch (_error) {}
    return null;
  }
  if (value === 0) return null;
  return value;
}

function guestPoolFromEnv(env) {
  const tokens = optionalPositiveInt(env, 'MARG_GLOBAL_GUEST_TOKENS_PER_DAY');
  const micros = optionalPositiveInt(env, 'MARG_GLOBAL_GUEST_SPEND_MICROS_PER_DAY');
  if (tokens == null && micros == null) return null;
  return { tokens:tokens || 0, micros:micros || 0, partial:(tokens == null) !== (micros == null) };
}

function groundingMicrosPerQuery(env) {
  const raw = env && env.MARG_GROUNDING_MICROS_PER_REQUEST;
  if (raw == null || String(raw).trim() === '' || String(raw).trim() === '0') return null;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    try { console.log(JSON.stringify({ configuredIntRejected:'MARG_GROUNDING_MICROS_PER_REQUEST' })); } catch (_error) {}
    return null;
  }
  return value;
}

function pricingEnabled(env) {
  return String(env && env.MARG_PRICING_ENABLED || 'on').trim().toLowerCase() !== 'off';
}

function modelPrices(env, model) {
  const primary = model === 'gemini-3.6-flash';
  const builtin = primary ? BUILTIN_MODEL_PRICES['gemini-3.6-flash'] : BUILTIN_MODEL_PRICES['gemini-3.5-flash'];
  const prefix = primary ? 'MARG_PRICE_36_' : 'MARG_PRICE_35_';
  return {
    input:configuredInt(env, prefix + 'INPUT_PER_MILLION', builtin.input, false),
    output:configuredInt(env, prefix + 'OUTPUT_PER_MILLION', builtin.output, false),
    cached:configuredInt(env, prefix + 'CACHED_PER_MILLION', builtin.cached, false)
  };
}

function microsForTokens(tokens, perMillion) {
  const count = Math.max(0, Math.round(Number(tokens) || 0));
  const rate = Math.max(0, Math.round(Number(perMillion) || 0));
  if (!count || !rate) return 0;
  return Math.ceil((count * rate) / 1000000);
}

function spendLimits(env, guestPool) {
  const guest = {
    minute:configuredInt(env, 'MARG_GUEST_REQUESTS_PER_MINUTE', 10, false),
    calls:configuredInt(env, 'MARG_GUEST_CALLS_PER_DAY', 5, false),
    tokens:configuredInt(env, 'MARG_GUEST_TOKENS_PER_DAY', 40000, false),
    micros:configuredInt(env, 'MARG_GUEST_SPEND_MICROS_PER_DAY', 100000, false)
  };
  const factor = configuredInt(env, 'MARG_GUEST_IP_SHARE_FACTOR', 8, false);
  return {
    pricing:pricingEnabled(env),
    user:{
      minute:configuredInt(env, 'MARG_USER_REQUESTS_PER_MINUTE', 30, false),
      calls:configuredInt(env, 'MARG_USER_CALLS_PER_DAY', 100, false),
      tokens:configuredInt(env, 'MARG_USER_TOKENS_PER_DAY', 750000, false),
      micros:configuredInt(env, 'MARG_USER_SPEND_MICROS_PER_DAY', 1500000, false)
    },
    guest,
    guestIp:{ calls:guest.calls * factor, tokens:guest.tokens * factor, micros:guest.micros * factor },
    ipMinute:configuredInt(env, 'MARG_IP_REQUESTS_PER_MINUTE', 120, false),
    global:{
      tokens:configuredInt(env, 'MARG_GLOBAL_TOKENS_PER_DAY', 5000000, false),
      micros:configuredInt(env, 'MARG_GLOBAL_SPEND_MICROS_PER_DAY', 10000000, false)
    },
    guestPool:guestPool === undefined ? guestPoolFromEnv(env) : guestPool,
    ttl:configuredInt(env, 'MARG_RESERVATION_TTL_MS', 180000, false),
    idemTtl:configuredInt(env, 'MARG_IDEMPOTENCY_TTL_MS', 600000, false),
    replayMax:configuredInt(env, 'MARG_IDEMPOTENCY_MAX_BYTES', IDEMPOTENCY_REPLAY_BYTES, false),
    zone:String(env && env.MARG_USAGE_TIMEZONE || 'Asia/Kolkata') || 'Asia/Kolkata'
  };
}

function usageDay(now, zone) {
  const timeZone = zone || 'Asia/Kolkata';
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date(now));
  } catch (_error) {
    return new Intl.DateTimeFormat('en-CA', { timeZone:'Asia/Kolkata', year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date(now));
  }
}

function resetsAtFor(now, zone, minute) {
  if (minute) return new Date((Math.floor(now / 60000) + 1) * 60000).toISOString();
  const day = usageDay(now, zone);
  let lo = now;
  let hi = now + 36 * 60 * 60 * 1000;
  while (hi - lo > 1000) {
    const mid = Math.floor((lo + hi) / 2);
    if (usageDay(mid, zone) === day) lo = mid;
    else hi = mid;
  }
  return new Date(hi).toISOString();
}

function estimateAttempt(env, payload, outputTokens, grounded) {
  const textTokens = Math.ceil(collectText(payload).reduce((total, chunk) => total + byteLength(chunk), 0) / 4);
  const schemaTokens = Math.ceil(schemaByteLength(payload) / 4);
  const imageTokens = rawImageCount(payload) * configuredInt(env, 'MARG_IMAGE_INPUT_TOKENS', 1024, false);
  const inputTokens = textTokens + schemaTokens + imageTokens;
  const output = Math.max(0, Math.round(Number(outputTokens) || 0));
  let micros = 0;
  if (pricingEnabled(env)) {
    const prices = modelPrices(env, RESERVE_MODEL);
    micros = microsForTokens(inputTokens, prices.input) + microsForTokens(output, prices.output);
    if (grounded) {
      const grounding = groundingMicrosPerQuery(env);
      if (grounding) micros += grounding;
    }
  }
  return { tokens:inputTokens + output, micros, inputTokens, outputTokens:output };
}

// Gemini 3 reports each executed Google Search query in
// candidates[0].groundingMetadata.webSearchQueries. Billing counts unique
// non-empty queries. Source: https://ai.google.dev/gemini-api/docs/google-search
// A grounded attempt with no reported queries still costs one.
function searchQueryCount(responseJson) {
  const candidate = responseJson && responseJson.candidates && responseJson.candidates[0];
  const queries = candidate && candidate.groundingMetadata && candidate.groundingMetadata.webSearchQueries;
  if (!Array.isArray(queries)) return 1;
  const unique = new Set();
  queries.forEach((query) => {
    const text = String(query == null ? '' : query).trim();
    if (text) unique.add(text);
  });
  return Math.max(1, unique.size);
}

function queryCount(value) {
  if (value === true) return 1;
  if (!value) return 0;
  const count = Math.round(Number(value) || 0);
  return count > 0 ? count : 0;
}

function priceUsage(env, model, usage, groundingQueries) {
  const prompt = Math.max(0, Math.round(Number(usage && usage.promptTokenCount) || 0));
  const cached = Math.min(prompt, Math.max(0, Math.round(Number(usage && usage.cachedContentTokenCount) || 0)));
  const candidates = Math.max(0, Math.round(Number(usage && usage.candidatesTokenCount) || 0));
  const thoughts = Math.max(0, Math.round(Number(usage && usage.thoughtsTokenCount) || 0));
  const tool = Math.max(0, Math.round(Number(usage && usage.toolUsePromptTokenCount) || 0));
  const total = Math.max(0, Math.round(Number(usage && usage.totalTokenCount) || 0));
  const explained = prompt + candidates + thoughts + tool;
  const tokens = total > 0 ? total : explained;
  let micros = 0;
  if (pricingEnabled(env)) {
    const prices = modelPrices(env, model || RESERVE_MODEL);
    micros = microsForTokens(prompt - cached, prices.input) + microsForTokens(cached, prices.cached) + microsForTokens(tool, prices.input) + microsForTokens(candidates, prices.output) + microsForTokens(thoughts, prices.output);
    if (total > explained) micros += microsForTokens(total - explained, prices.output);
    const queries = queryCount(groundingQueries);
    const grounding = groundingMicrosPerQuery(env);
    if (queries > 0 && grounding) micros += grounding * queries;
  }
  return { tokens, micros };
}

function usageIsKnown(usage) {
  if (!usage || typeof usage !== 'object') return false;
  return ['totalTokenCount', 'promptTokenCount', 'candidatesTokenCount', 'thoughtsTokenCount', 'toolUsePromptTokenCount'].some((key) => Number.isFinite(Number(usage[key])));
}

function billAttempts(env, attempts, perAttempt, groundingQueries) {
  if (!attempts || !attempts.length) return { tokens:perAttempt.tokens, micros:perAttempt.micros };
  let tokens = 0;
  let micros = 0;
  const queries = queryCount(groundingQueries);
  attempts.forEach((attempt, index) => {
    if (!attempt || attempt.uncertain || !usageIsKnown(attempt.usage)) {
      tokens += perAttempt.tokens;
      micros += perAttempt.micros;
      return;
    }
    const priced = priceUsage(env, attempt.model || RESERVE_MODEL, attempt.usage, index === attempts.length - 1 ? queries : (queries > 0 ? 1 : 0));
    tokens += priced.tokens;
    micros += priced.micros;
  });
  return { tokens, micros };
}

function emptySpend(day) {
  return { day:day || '', calls:0, tokens:0, micros:0, heldCalls:0, heldTokens:0, heldMicros:0 };
}

function emptyDay(day) {
  return {
    day:day || '',
    tokens:0, micros:0, heldTokens:0, heldMicros:0,
    guestTokens:0, guestMicros:0, guestHeldTokens:0, guestHeldMicros:0,
    idemCount:0, iseq:0, ihead:0, itail:0, open:[], oldestOpenAt:0, cleanupPending:''
  };
}

const ledgerHmacKeys = new Map();
const ledgerHashCache = new Map();

async function ledgerKeyMaterial(value, salt) {
  const text = String(value || '');
  if (!text) return '';
  const cacheKey = String(salt || '') + '\u0000' + text;
  const cached = ledgerHashCache.get(cacheKey);
  if (cached) return cached;
  const encoded = new TextEncoder().encode(text);
  let bytes;
  if (salt) {
    let key = ledgerHmacKeys.get(String(salt));
    if (!key) {
      key = await crypto.subtle.importKey('raw', new TextEncoder().encode(String(salt)), { name:'HMAC', hash:'SHA-256' }, false, ['sign']);
      ledgerHmacKeys.set(String(salt), key);
    }
    bytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoded));
  } else bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', encoded));
  const hex = Array.from(bytes).map((byte) => byte.toString(16).padStart(2, '0')).join('').slice(0, LEDGER_KEY_HASH_HEX);
  if (ledgerHashCache.size > 250000) ledgerHashCache.clear();
  ledgerHashCache.set(cacheKey, hex);
  return hex;
}

function balanceKey(day, subject) { return 'bal:' + day + ':' + subject; }
function minuteKey(day, window, scope) { return 'min:' + day + ':' + window + ':' + scope; }
function idemStorageKey(subject, clientKey) { return 'idem:' + subject + '\u0000' + clientKey; }

function overCap(spent, held, add, cap) {
  return cap > 0 && spent + held + add > cap;
}

function addHeld(spend, calls, tokens, micros) {
  spend.heldCalls += calls;
  spend.heldTokens += tokens;
  spend.heldMicros += micros;
}

function subHeld(spend, calls, tokens, micros) {
  spend.heldCalls = Math.max(0, spend.heldCalls - calls);
  spend.heldTokens = Math.max(0, spend.heldTokens - tokens);
  spend.heldMicros = Math.max(0, spend.heldMicros - micros);
}

function addGlobalHold(dayState, reservation, tokens, micros) {
  dayState.heldTokens += tokens;
  dayState.heldMicros += micros;
  if (reservation && reservation.guestPool) {
    dayState.guestHeldTokens += tokens;
    dayState.guestHeldMicros += micros;
  }
}

function subGlobalHold(dayState, reservation, tokens, micros) {
  dayState.heldTokens = Math.max(0, dayState.heldTokens - tokens);
  dayState.heldMicros = Math.max(0, dayState.heldMicros - micros);
  if (reservation && reservation.guestPool) {
    dayState.guestHeldTokens = Math.max(0, dayState.guestHeldTokens - tokens);
    dayState.guestHeldMicros = Math.max(0, dayState.guestHeldMicros - micros);
  }
}

function addGlobalSpent(dayState, reservation, tokens, micros) {
  dayState.tokens += tokens;
  dayState.micros += micros;
  if (reservation && reservation.guestPool) {
    dayState.guestTokens += tokens;
    dayState.guestMicros += micros;
  }
}

async function readSpend(storage, day, subject) {
  if (!subject) return emptySpend(day);
  const raw = await storage.get(balanceKey(day, subject));
  if (!raw || raw.day !== day) return emptySpend(day);
  return raw;
}

async function readMinute(storage, day, window, scope) {
  const raw = await storage.get(minuteKey(day, window, scope));
  if (!raw || raw.window !== window) return 0;
  return Math.max(0, Math.round(Number(raw.count) || 0));
}

async function writeMinute(storage, day, window, scope, count) {
  await storage.put(minuteKey(day, window, scope), { day, window, count });
  if (window > 0) await storage.delete(minuteKey(day, window - 1, scope));
}

function namesFromList(page) {
  if (!page) return [];
  if (typeof Map === 'function' && page instanceof Map) return Array.from(page.keys());
  if (typeof page.forEach === 'function' && typeof page.size === 'number' && typeof page.keys === 'function') {
    const names = [];
    page.forEach((_value, key) => { names.push(key); });
    return names;
  }
  if (Array.isArray(page)) return page.map((item) => typeof item === 'string' ? item : item && item.name).filter(Boolean);
  if (Array.isArray(page.keys)) return page.keys.map((item) => typeof item === 'string' ? item : item && item.name).filter(Boolean);
  return [];
}

async function listPrefixPage(storage, prefix, startAfter) {
  if (!storage || typeof storage.list !== 'function') return [];
  const options = { prefix, limit:LEDGER_LIST_PAGE };
  if (startAfter) options.startAfter = startAfter;
  const page = await storage.list(options);
  return namesFromList(page);
}

async function prefixNames(storage, prefix) {
  const names = [];
  let startAfter = '';
  let guard = 0;
  while (guard < 100000) {
    guard += 1;
    const pageNames = await listPrefixPage(storage, prefix, startAfter);
    if (!pageNames.length) return names;
    let advanced = false;
    for (const name of pageNames) {
      if (!name || String(name).indexOf(prefix) !== 0) continue;
      if (startAfter && String(name) <= String(startAfter)) continue;
      names.push(name);
      if (!startAfter || String(name) > String(startAfter)) {
        startAfter = name;
        advanced = true;
      }
    }
    if (!advanced) return names;
    if (pageNames.length < LEDGER_LIST_PAGE) return names;
  }
  return names;
}

async function deletePrefix(storage, prefix) {
  const names = await prefixNames(storage, prefix);
  for (const name of names) await storage.delete(name);
}

async function deletePrefixBatch(storage, prefix) {
  const names = await listPrefixPage(storage, prefix, '');
  let deleted = 0;
  for (const name of names) {
    if (!name || String(name).indexOf(prefix) !== 0) continue;
    await storage.delete(name);
    deleted += 1;
  }
  return names.length >= LEDGER_LIST_PAGE && deleted > 0;
}

async function creditExisting(storage, dayState, reservation) {
  const calls = reservation.calls || 0;
  const tokens = reservation.tokens || 0;
  const micros = reservation.micros || 0;
  const spend = await readSpend(storage, dayState.day, reservation.subject);
  addHeld(spend, calls, tokens, micros);
  spend.day = dayState.day;
  await storage.put(balanceKey(dayState.day, reservation.subject), spend);
  if (reservation.aggregate) {
    const aggregate = await readSpend(storage, dayState.day, reservation.aggregate);
    addHeld(aggregate, calls, tokens, micros);
    aggregate.day = dayState.day;
    await storage.put(balanceKey(dayState.day, reservation.aggregate), aggregate);
  }
  addGlobalHold(dayState, reservation, tokens, micros);
}

async function takeHold(storage, dayState, reservation, calls, tokens, micros) {
  reservation.calls += calls;
  reservation.tokens += tokens;
  reservation.micros += micros;
  const spend = await readSpend(storage, dayState.day, reservation.subject);
  addHeld(spend, calls, tokens, micros);
  spend.day = dayState.day;
  await storage.put(balanceKey(dayState.day, reservation.subject), spend);
  if (reservation.aggregate) {
    const aggregate = await readSpend(storage, dayState.day, reservation.aggregate);
    addHeld(aggregate, calls, tokens, micros);
    aggregate.day = dayState.day;
    await storage.put(balanceKey(dayState.day, reservation.aggregate), aggregate);
  }
  addGlobalHold(dayState, reservation, tokens, micros);
}

async function releaseHold(storage, dayState, reservation) {
  const calls = reservation.calls || 0;
  const tokens = reservation.tokens || 0;
  const micros = reservation.micros || 0;
  const spend = await readSpend(storage, dayState.day, reservation.subject);
  subHeld(spend, calls, tokens, micros);
  spend.day = dayState.day;
  await storage.put(balanceKey(dayState.day, reservation.subject), spend);
  if (reservation.aggregate) {
    const aggregate = await readSpend(storage, dayState.day, reservation.aggregate);
    subHeld(aggregate, calls, tokens, micros);
    aggregate.day = dayState.day;
    await storage.put(balanceKey(dayState.day, reservation.aggregate), aggregate);
  }
  subGlobalHold(dayState, reservation, tokens, micros);
}

async function moveHoldToSpent(storage, dayState, reservation, billedTokens, billedMicros) {
  const calls = reservation.calls || 0;
  const tokens = reservation.tokens || 0;
  const micros = reservation.micros || 0;
  const spentTokens = Math.max(0, Math.round(Number(billedTokens) || 0));
  const spentMicros = Math.max(0, Math.round(Number(billedMicros) || 0));
  const spend = await readSpend(storage, dayState.day, reservation.subject);
  subHeld(spend, calls, tokens, micros);
  spend.calls += calls;
  spend.tokens += spentTokens;
  spend.micros += spentMicros;
  spend.day = dayState.day;
  await storage.put(balanceKey(dayState.day, reservation.subject), spend);
  if (reservation.aggregate) {
    const aggregate = await readSpend(storage, dayState.day, reservation.aggregate);
    subHeld(aggregate, calls, tokens, micros);
    aggregate.calls += calls;
    aggregate.tokens += spentTokens;
    aggregate.micros += spentMicros;
    aggregate.day = dayState.day;
    await storage.put(balanceKey(dayState.day, reservation.aggregate), aggregate);
  }
  subGlobalHold(dayState, reservation, tokens, micros);
  addGlobalSpent(dayState, reservation, spentTokens, spentMicros);
}

async function quotaHit(storage, dayState, op, addCalls, addTokens, addMicros, checkMinute, now) {
  const caps = op.caps || {};
  const subjectCaps = caps.subject || {};
  if (checkMinute) {
    const window = Math.floor(now / 60000);
    const subjectMinute = await readMinute(storage, dayState.day, window, 's:' + op.subject);
    const ipMinute = await readMinute(storage, dayState.day, window, 'ip:' + (op.network || ''));
    if (subjectCaps.minute && subjectMinute + 1 > subjectCaps.minute) return 'subject_minute';
    if (caps.ipMinute && ipMinute + 1 > caps.ipMinute) return 'ip_minute';
  }
  const spend = await readSpend(storage, dayState.day, op.subject);
  if (overCap(spend.calls, spend.heldCalls, addCalls, subjectCaps.calls || 0)) return 'subject_calls';
  if (overCap(spend.tokens, spend.heldTokens, addTokens, subjectCaps.tokens || 0)) return 'subject_tokens';
  if (caps.pricing !== false && overCap(spend.micros, spend.heldMicros, addMicros, subjectCaps.micros || 0)) return 'subject_spend';
  if (op.aggregate && caps.aggregate) {
    const aggregate = await readSpend(storage, dayState.day, op.aggregate);
    if (overCap(aggregate.calls, aggregate.heldCalls, addCalls, caps.aggregate.calls || 0)) return 'aggregate_calls';
    if (overCap(aggregate.tokens, aggregate.heldTokens, addTokens, caps.aggregate.tokens || 0)) return 'aggregate_tokens';
    if (caps.pricing !== false && overCap(aggregate.micros, aggregate.heldMicros, addMicros, caps.aggregate.micros || 0)) return 'aggregate_spend';
  }
  if (caps.guestPool) {
    if (overCap(dayState.guestTokens, dayState.guestHeldTokens, addTokens, caps.guestPool.tokens || 0)) return 'guest_global_tokens';
    if (caps.pricing !== false && overCap(dayState.guestMicros, dayState.guestHeldMicros, addMicros, caps.guestPool.micros || 0)) return 'guest_global_spend';
  }
  const globalCaps = caps.global || {};
  if (overCap(dayState.tokens, dayState.heldTokens, addTokens, globalCaps.tokens || 0)) return 'global_tokens';
  if (caps.pricing !== false && overCap(dayState.micros, dayState.heldMicros, addMicros, globalCaps.micros || 0)) return 'global_spend';
  return '';
}

async function unlinkNode(storage, dayState, seq) {
  if (!seq) return;
  const node = await storage.get('inode:' + seq);
  if (!node) {
    if (dayState.ihead === seq) dayState.ihead = 0;
    if (dayState.itail === seq) dayState.itail = 0;
    return;
  }
  if (node.prev) {
    const prev = await storage.get('inode:' + node.prev);
    if (prev) {
      prev.next = node.next || 0;
      await storage.put('inode:' + node.prev, prev);
    }
  } else dayState.ihead = node.next || 0;
  if (node.next) {
    const next = await storage.get('inode:' + node.next);
    if (next) {
      next.prev = node.prev || 0;
      await storage.put('inode:' + node.next, next);
    }
  } else dayState.itail = node.prev || 0;
  await storage.delete('inode:' + seq);
}

async function linkTail(storage, dayState, seq, idem, subject, clientKey, expiresAt) {
  const node = { seq, idem, subject, clientKey, prev:dayState.itail || 0, next:0, expiresAt };
  if (dayState.itail) {
    const tail = await storage.get('inode:' + dayState.itail);
    if (tail) {
      tail.next = seq;
      await storage.put('inode:' + dayState.itail, tail);
    } else dayState.ihead = seq;
  } else dayState.ihead = seq;
  dayState.itail = seq;
  await storage.put('inode:' + seq, node);
}

async function removeFromIndex(storage, subject, seq) {
  const key = 'iidx:' + subject;
  const index = await storage.get(key);
  if (!Array.isArray(index)) return;
  const next = index.filter((item) => item !== seq);
  if (next.length) await storage.put(key, next);
  else await storage.delete(key);
}

async function deleteIdem(storage, dayState, subject, clientKey, row) {
  if (row && row.seq) {
    await removeFromIndex(storage, subject, row.seq);
    await unlinkNode(storage, dayState, row.seq);
    dayState.idemCount = Math.max(0, (dayState.idemCount || 0) - 1);
  }
  if (clientKey) await storage.delete(idemStorageKey(subject, clientKey));
}

async function evictOldest(storage, dayState) {
  const seq = dayState.ihead;
  if (!seq) {
    dayState.idemCount = 0;
    return;
  }
  const node = await storage.get('inode:' + seq);
  if (!node) {
    dayState.ihead = 0;
    dayState.itail = 0;
    dayState.idemCount = 0;
    return;
  }
  await removeFromIndex(storage, node.subject, seq);
  if (node.idem) await storage.delete(node.idem);
  await unlinkNode(storage, dayState, seq);
  dayState.idemCount = Math.max(0, (dayState.idemCount || 0) - 1);
}

async function evictSubjectOverflow(storage, dayState, subject) {
  const key = 'iidx:' + subject;
  let index = await storage.get(key);
  if (!Array.isArray(index)) return;
  let guard = index.length + 1;
  while (index.length > IDEMPOTENCY_PER_SUBJECT_CAP && guard > 0) {
    guard -= 1;
    let chosen = 0;
    for (let i = 0; i < index.length; i += 1) {
      const node = await storage.get('inode:' + index[i]);
      const row = node && node.idem ? await storage.get(node.idem) : null;
      if (!row || row.status !== 'running') { chosen = i; break; }
    }
    const seq = index[chosen];
    index.splice(chosen, 1);
    const node = await storage.get('inode:' + seq);
    if (node && node.idem) await storage.delete(node.idem);
    await unlinkNode(storage, dayState, seq);
    dayState.idemCount = Math.max(0, (dayState.idemCount || 0) - 1);
  }
  if (index.length) await storage.put(key, index);
  else await storage.delete(key);
}

async function rememberRunning(storage, dayState, subject, clientKey, bodyHash, reservationId, now, ttl) {
  const idem = idemStorageKey(subject, clientKey);
  const seq = (dayState.iseq = (dayState.iseq || 0) + 1);
  const expiresAt = now + ttl;
  await storage.put(idem, { bodyHash, status:'running', httpStatus:0, response:null, expiresAt, reservationId, seq });
  await linkTail(storage, dayState, seq, idem, subject, clientKey, expiresAt);
  const indexKey = 'iidx:' + subject;
  const index = (await storage.get(indexKey)) || [];
  index.push(seq);
  await storage.put(indexKey, index);
  dayState.idemCount = (dayState.idemCount || 0) + 1;
  await evictSubjectOverflow(storage, dayState, subject);
  let guard = (dayState.idemCount || 0) + 1;
  while ((dayState.idemCount || 0) > IDEMPOTENCY_TOTAL_CAP && guard > 0) {
    guard -= 1;
    await evictOldest(storage, dayState);
  }
}

async function loadIdem(storage, dayState, subject, clientKey, now) {
  if (!clientKey) return null;
  const row = await storage.get(idemStorageKey(subject, clientKey));
  if (!row) return null;
  if (Number(row.expiresAt || 0) <= now) {
    await deleteIdem(storage, dayState, subject, clientKey, row);
    return null;
  }
  return row;
}

async function rollToDay(storage, previous, day) {
  const next = emptyDay(day);
  next.idemCount = previous.idemCount || 0;
  next.iseq = previous.iseq || 0;
  next.ihead = previous.ihead || 0;
  next.itail = previous.itail || 0;
  next.oldestOpenAt = previous.oldestOpenAt || 0;
  next.cleanupPending = previous.cleanupPending || '';
  const ids = Array.isArray(previous.open) ? previous.open.slice() : [];
  for (const id of ids) {
    const reservation = await storage.get('res:' + id);
    if (!reservation) continue;
    await creditExisting(storage, next, reservation);
    next.open.push(id);
  }
  // The new day is stored before cleanup. A cleanup failure must not roll it back.
  await storage.put('day', next);
  const days = [];
  if (next.cleanupPending) days.push(next.cleanupPending);
  if (previous.day && previous.day !== day && days.indexOf(previous.day) < 0) days.push(previous.day);
  let pending = '';
  for (let index = 0; index < days.length; index += 1) {
    try {
      await deletePrefix(storage, 'bal:' + days[index] + ':');
      await deletePrefix(storage, 'min:' + days[index] + ':');
    } catch (_error) {
      if (!pending) pending = days[index];
    }
  }
  if ((pending || '') !== (next.cleanupPending || '')) {
    next.cleanupPending = pending;
    await storage.put('day', next);
  }
  return next;
}

async function recoverStale(storage, dayState, now, ttl) {
  const ids = Array.isArray(dayState.open) ? dayState.open : [];
  if (!ids.length) {
    if (dayState.oldestOpenAt) {
      dayState.oldestOpenAt = 0;
      return true;
    }
    return false;
  }
  // A fresh oldest reservation cannot be stale, so a begin does not read
  // every open id. The read count stays flat as the number of subjects grows.
  const oldest = Number(dayState.oldestOpenAt || 0);
  if (oldest && now - oldest < ttl) return false;
  let changed = false;
  const keep = [];
  let nextOldest = 0;
  for (const id of ids) {
    const reservation = await storage.get('res:' + id);
    if (!reservation) { changed = true; continue; }
    const created = Number(reservation.createdAt || 0);
    if (now - created < ttl) {
      keep.push(id);
      if (!nextOldest || created < nextOldest) nextOldest = created;
      continue;
    }
    await moveHoldToSpent(storage, dayState, reservation, reservation.tokens, reservation.micros);
    await storage.delete('res:' + id);
    changed = true;
  }
  if (changed || nextOldest !== oldest) {
    dayState.open = keep;
    dayState.oldestOpenAt = nextOldest;
    return true;
  }
  return false;
}

async function applyLedgerOp(storage, op) {
  const salt = op && op.ledgerSalt || '';
  op = Object.assign({}, op, {
    subject:await ledgerKeyMaterial(op && op.subject, salt),
    aggregate:await ledgerKeyMaterial(op && op.aggregate, salt),
    network:await ledgerKeyMaterial(op && op.network, salt)
  });
  const now = Number(op && op.now) || Date.now();
  const day = String(op && op.day || '');
  const ttl = Number(op && op.ttl) > 0 ? Number(op.ttl) : 180000;
  const idemTtl = Number(op && op.idemTtl) > 0 ? Number(op.idemTtl) : 600000;
  const replayMax = Number(op && op.replayMax) > 0 ? Number(op.replayMax) : IDEMPOTENCY_REPLAY_BYTES;
  let dayState = await storage.get('day');
  if (!dayState || typeof dayState !== 'object') dayState = emptyDay(day);
  let changed = false;
  if (dayState.day && day !== dayState.day) {
    dayState = await rollToDay(storage, dayState, day);
    changed = true;
  } else if (dayState.cleanupPending) {
    const pendingDay = dayState.cleanupPending;
    try {
      const moreBalances = await deletePrefixBatch(storage, 'bal:' + pendingDay + ':');
      const moreMinutes = await deletePrefixBatch(storage, 'min:' + pendingDay + ':');
      if (!moreBalances && !moreMinutes) dayState.cleanupPending = '';
    } catch (_error) {}
    changed = true;
  }
  if (!dayState.day) dayState.day = day;
  if (await recoverStale(storage, dayState, now, ttl)) changed = true;
  const action = String(op && op.action || '');
  let result = { ok:false, unavailable:true };
  if (action === 'begin') {
    const key = String(op.idempotencyKey || '');
    const subject = String(op.subject || '');
    const idemBefore = dayState.idemCount || 0;
    const existing = await loadIdem(storage, dayState, subject, key, now);
    if (existing || (dayState.idemCount || 0) !== idemBefore) changed = true;
    if (existing && existing.bodyHash !== op.bodyHash) result = { ok:false, mode:'conflict' };
    else if (existing && existing.status === 'running') result = { ok:false, mode:'in_progress' };
    else if (existing && existing.status === 'completed' && existing.httpStatus === 200 && typeof existing.response === 'string') {
      result = { ok:true, mode:'replay', httpStatus:200, response:existing.response };
    } else if (existing && existing.status === 'completed') result = { ok:false, mode:'completed_unreplayable', httpStatus:existing.httpStatus || 409 };
    else {
      const add = op.add || {};
      const hit = await quotaHit(storage, dayState, op, add.calls || 0, add.tokens || 0, add.micros || 0, true, now);
      if (hit) result = { ok:false, mode:'quota', quota:hit };
      else {
        const reservation = {
          id:String(op.reservationId || ''),
          subject,
          aggregate:String(op.aggregate || ''),
          network:String(op.network || ''),
          calls:0, tokens:0, micros:0,
          createdAt:now,
          visitorHash:String(op.visitorHash || ''),
          guestPool:!!(op.caps && op.caps.guestPool)
        };
        await takeHold(storage, dayState, reservation, add.calls || 0, add.tokens || 0, add.micros || 0);
        await storage.put('res:' + reservation.id, reservation);
        dayState.open = (dayState.open || []).concat([reservation.id]);
        if (!dayState.oldestOpenAt) dayState.oldestOpenAt = now;
        const window = Math.floor(now / 60000);
        await writeMinute(storage, day, window, 's:' + subject, (await readMinute(storage, day, window, 's:' + subject)) + 1);
        await writeMinute(storage, day, window, 'ip:' + reservation.network, (await readMinute(storage, day, window, 'ip:' + reservation.network)) + 1);
        if (key) await rememberRunning(storage, dayState, subject, key, op.bodyHash, reservation.id, now, ttl);
        changed = true;
        result = { ok:true, mode:'owner', reservationId:reservation.id, reservedTokens:reservation.tokens, reservedMicros:reservation.micros };
      }
    }
  } else if (action === 'extend') {
    const reservation = await storage.get('res:' + String(op.reservationId || ''));
    if (!reservation) result = { ok:false, missing:true };
    else {
      const add = op.add || {};
      const hit = await quotaHit(storage, dayState, {
        subject:reservation.subject,
        aggregate:reservation.aggregate,
        network:reservation.network,
        caps:op.caps || {}
      }, 0, add.tokens || 0, add.micros || 0, false, now);
      if (hit) result = { ok:false, mode:'quota', quota:hit };
      else {
        await takeHold(storage, dayState, reservation, 0, add.tokens || 0, add.micros || 0);
        await storage.put('res:' + reservation.id, reservation);
        changed = true;
        result = { ok:true, reservedTokens:reservation.tokens, reservedMicros:reservation.micros };
      }
    }
  } else if (action === 'release') {
    const id = String(op.reservationId || '');
    const reservation = await storage.get('res:' + id);
    if (reservation) {
      await releaseHold(storage, dayState, reservation);
      await storage.delete('res:' + id);
      dayState.open = (dayState.open || []).filter((item) => item !== id);
      if (!dayState.open.length) dayState.oldestOpenAt = 0;
      changed = true;
    }
    result = { ok:true, released:!!reservation };
  } else if (action === 'settle') {
    const id = String(op.reservationId || '');
    const reservation = await storage.get('res:' + id);
    if (!reservation) result = { ok:true, already:true };
    else {
      await moveHoldToSpent(storage, dayState, reservation, op.billedTokens, op.billedMicros);
      await storage.delete('res:' + id);
      dayState.open = (dayState.open || []).filter((item) => item !== id);
      if (!dayState.open.length) dayState.oldestOpenAt = 0;
      changed = true;
      result = { ok:true, settledTokens:Math.max(0, Math.round(Number(op.billedTokens) || 0)), settledMicros:Math.max(0, Math.round(Number(op.billedMicros) || 0)) };
    }
  } else if (action === 'complete') {
    const key = String(op.idempotencyKey || '');
    const subject = String(op.subject || '');
    const idem = key ? idemStorageKey(subject, key) : '';
    const row = idem ? await storage.get(idem) : null;
    const status = Number(op.httpStatus) || 0;
    const storeCap = Math.min(replayMax, IDEMPOTENCY_VALUE_CAP);
    if (!row) result = { ok:true, stored:false };
    else if (status === 200 && typeof op.response === 'string' && byteLength(op.response) <= storeCap) {
      row.status = 'completed';
      row.httpStatus = 200;
      row.response = op.response;
      row.expiresAt = now + idemTtl;
      row.reservationId = String(op.reservationId || row.reservationId || '');
      await storage.put(idem, row);
      result = { ok:true, stored:true };
    } else if (status === 200) {
      row.status = 'completed';
      row.httpStatus = 200;
      row.response = null;
      row.expiresAt = now + idemTtl;
      row.reservationId = String(op.reservationId || row.reservationId || '');
      await storage.put(idem, row);
      result = { ok:true, stored:false };
    } else {
      await deleteIdem(storage, dayState, subject, key, row);
      changed = true;
      result = { ok:true, stored:false };
    }
  }
  if (changed) await storage.put('day', dayState);
  return result;
}

class UsageLedger {
  constructor(state) {
    this.storage = state && state.storage;
  }

  async fetch(request) {
    let op = {};
    try { op = await request.json(); } catch (_error) { op = {}; }
    const storage = this.storage;
    if (!storage || typeof storage.get !== 'function' || typeof storage.put !== 'function') {
      return new Response(JSON.stringify({ ok:false, unavailable:true }), { status:500, headers:{ 'Content-Type':'application/json' } });
    }
    try {
      const result = typeof storage.transaction === 'function'
        ? await storage.transaction((tx) => applyLedgerOp(tx, op))
        : await applyLedgerOp(storage, op);
      return new Response(JSON.stringify(result), { status:200, headers:{ 'Content-Type':'application/json' } });
    } catch (_error) {
      return new Response(JSON.stringify({ ok:false, unavailable:true }), { status:500, headers:{ 'Content-Type':'application/json' } });
    }
  }
}

function callerSpendMode(caller) {
  if (caller && caller.kind === 'user') return 'user';
  if (caller && caller.aggregate) return 'guest-session';
  return 'guest-ip';
}

function ledgerCaps(limits, mode) {
  const personal = mode === 'user' ? limits.user : limits.guest;
  return {
    pricing:limits.pricing,
    subject:{ minute:personal.minute, calls:personal.calls, tokens:personal.tokens, micros:personal.micros },
    ipMinute:limits.ipMinute,
    aggregate:mode === 'guest-session' ? limits.guestIp : null,
    global:limits.global,
    guestPool:mode === 'user' ? null : limits.guestPool
  };
}

function publicQuota(mode, code) {
  const guest = mode !== 'user';
  const names = {
    subject_minute:guest ? 'guest_minute' : 'user_minute',
    ip_minute:'ip_minute',
    subject_calls:guest ? 'guest_daily_calls' : 'user_daily_calls',
    subject_tokens:guest ? 'guest_daily_tokens' : 'user_daily_tokens',
    subject_spend:guest ? 'guest_daily_spend' : 'user_daily_spend',
    aggregate_calls:'guest_network_calls',
    aggregate_tokens:'guest_network_tokens',
    aggregate_spend:'guest_network_spend',
    global_tokens:'global_daily_tokens',
    global_spend:'global_daily_spend',
    guest_global_tokens:'guest_global_daily_tokens',
    guest_global_spend:'guest_global_daily_spend'
  };
  return names[code] || 'usage';
}

function quotaCopy(quota, resetsAt, signInRequired) {
  const label = {
    user_minute:'the signed-in per-minute request limit',
    guest_minute:'the guest per-minute request limit',
    ip_minute:'the shared-network per-minute request limit',
    user_daily_calls:'today’s signed-in answer limit',
    guest_daily_calls:'today’s guest answer limit',
    user_daily_tokens:'today’s signed-in token limit',
    guest_daily_tokens:'today’s guest token limit',
    user_daily_spend:'today’s signed-in model allowance',
    guest_daily_spend:'today’s guest model allowance',
    guest_network_calls:'today’s shared-network guest answer limit',
    guest_network_tokens:'today’s shared-network guest token limit',
    guest_network_spend:'today’s shared-network guest model allowance',
    global_daily_tokens:'today’s shared Marg token allowance',
    global_daily_spend:'today’s shared Marg model allowance',
    guest_global_daily_tokens:'today’s shared guest token allowance',
    guest_global_daily_spend:'today’s shared guest model allowance'
  }[quota] || 'today’s usage allowance';
  return 'Marg paused this request because it would pass ' + label + '.' + (resetsAt ? ' It resets at ' + resetsAt + '.' : '') + (signInRequired ? ' Sign in to continue as a student.' : '');
}

function idempotencyKeyFrom(request) {
  const hasHeaderApi = !!(request && request.headers && typeof request.headers.get === 'function');
  const cleaned = String(hasHeaderApi ? request.headers.get('X-Marg-Idempotency-Key') || '' : '').replace(/[^a-zA-Z0-9._:-]/g, '').slice(0, 80);
  return cleaned.length >= 8 ? cleaned : '';
}

function servicePaused(env, caller) {
  if (String(env && env.MARG_GEMINI_PAUSED || '') === '1') return true;
  if (String(env && env.MARG_GUESTS_PAUSED || '') === '1' && (!caller || caller.kind !== 'user')) return true;
  return false;
}

async function ledgerFetch(env, op) {
  const payload = Object.assign({}, op || {}, { ledgerSalt:env && env.MARG_LEDGER_HASH_SALT ? String(env.MARG_LEDGER_HASH_SALT) : '' });
  try {
    const namespace = env && env.MARG_USAGE_LEDGER;
    if (!namespace || typeof namespace.idFromName !== 'function' || typeof namespace.get !== 'function') return { ok:false, unavailable:true };
    const stub = namespace.get(namespace.idFromName('marg-usage-ledger'));
    const response = await stub.fetch(new Request('https://ledger.internal/', { method:'POST', body:JSON.stringify(payload) }));
    if (!response || !response.ok) return { ok:false, unavailable:true };
    return await response.json();
  } catch (_error) {
    return { ok:false, unavailable:true };
  }
}

async function rememberIdempotent(env, limits, key, bodyHash, reservationId, response, subject) {
  if (!key) return { stored:false };
  let text = '';
  try { text = await response.clone().text(); } catch (_error) { text = ''; }
  return ledgerFetch(env, {
    action:'complete',
    now:Date.now(),
    day:usageDay(Date.now(), limits.zone),
    ttl:limits.ttl,
    idemTtl:limits.idemTtl,
    replayMax:limits.replayMax,
    idempotencyKey:key,
    subject:subject || '',
    bodyHash,
    reservationId:reservationId || '',
    httpStatus:response.status,
    response:text
  });
}


export { resolveMaxOutputTokens, UsageLedger };

function usageCounts(usage) {
  if (!usage || typeof usage !== 'object') return null;
  const counts = {};
  ['promptTokenCount', 'candidatesTokenCount', 'thoughtsTokenCount', 'totalTokenCount', 'cachedContentTokenCount', 'toolUsePromptTokenCount'].forEach((key) => {
    if (Number.isFinite(Number(usage[key]))) counts[key] = Number(usage[key]);
  });
  return Object.keys(counts).length ? counts : null;
}

async function readBoundedBody(request) {
  if (request && request.body && typeof request.body.getReader === 'function') {
    const reader = request.body.getReader();
    const chunks = [];
    let total = 0;
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      const value = next.value;
      total += value ? value.byteLength : 0;
      if (total > MAX_REQUEST_BYTES) {
        try { await reader.cancel(); } catch (_error) {}
        return { tooLarge:true };
      }
      if (value) chunks.push(value);
    }
    const merged = new Uint8Array(total);
    let offset = 0;
    chunks.forEach((chunk) => {
      merged.set(chunk, offset);
      offset += chunk.byteLength;
    });
    return { text:new TextDecoder().decode(merged) };
  }
  if (request && typeof request.text === 'function') {
    const rawBody = await request.text();
    const bodyBytes = typeof TextEncoder === 'function' ? new TextEncoder().encode(rawBody).byteLength : rawBody.length;
    if (bodyBytes > MAX_REQUEST_BYTES) return { tooLarge:true };
    return { text:rawBody };
  }
  return { json:await request.json() };
}

export default {
  async fetch(request, env) {
    const cors = requestCorsHeaders(request);
    if (request.method === 'OPTIONS') {
      if (request.headers && request.headers.get && request.headers.get('Origin') && !cors['Access-Control-Allow-Origin']) return new Response(null, { status:403 });
      return new Response(null, { status:204, headers:Object.assign({}, CORS_HEADERS, cors) });
    }
    const requestId = crypto.randomUUID();
    const responseHeaders = Object.assign({ 'X-Marg-Request-Id':requestId }, cors);
    // Reflect placement metadata if present on the execution request.
    // Cloudflare may instead add cf-placement directly to its response.
    // No IP address, student text or credential is exposed.
    if (request.headers && request.headers.get('cf-placement')) responseHeaders['X-Marg-Placement'] = request.headers.get('cf-placement');
    const validationMode = flagMode(env, 'MARG_WORKER_VALIDATION', 'log');
    const guestMode = flagMode(env, 'MARG_GUEST_CAPABILITIES', 'log');
    // Kept on the log line so older dashboards still have the field. Invalid
    // and unavailable sessions are rejected above, whether or not this is set.
    const authStrict = String(env && env.MARG_AUTH_STRICT || '').trim().toLowerCase() === 'on';
    const guestPool = guestPoolFromEnv(env);
    let issuedGuestToken = '';
    const record = {
      event:'marg_worker_request',
      requestId,
      callerKind:'anonymous',
      authState:'none',
      subjectHash:'',
      requestClass:'unknown',
      validationMode,
      guestCapabilityMode:guestMode,
      authStrict,
      clamps:[],
      droppedFieldNames:[],
      rejectReasons:[],
      outputTokensRequested:0,
      outputTokensSent:0,
      upstreamCalls:0,
      usageMetadata:null,
      reservedTokens:0,
      reservedMicros:0,
      settledTokens:0,
      settledMicros:0,
      guestPoolConfigured:guestPool != null,
      guestPoolPartial:!!(guestPool && guestPool.partial),
      ledgerSaltConfigured:!!(env && String(env.MARG_LEDGER_HASH_SALT || '').trim()),
      httpStatus:0
    };
    let logged = false;
    const finish = async (response, patch) => {
      if (issuedGuestToken) {
        try { response.headers.set('X-Marg-Guest-Token', issuedGuestToken); } catch (_error) {}
      }
      if (patch) Object.assign(record, patch);
      record.httpStatus = response.status;
      if (!record.subjectHash) record.subjectHash = await subjectHash('guest:unknown');
      if (!logged) {
        logged = true;
        console.log(JSON.stringify(record));
      }
      return response;
    };
    if (request.method !== 'POST') return finish(jsonResponse({ error:{ code:405, status:'METHOD_NOT_ALLOWED', message:'Method not allowed', request_id:requestId } }, 405, responseHeaders));

    const contentLength = Number(request.headers && request.headers.get ? request.headers.get('Content-Length') || 0 : 0);
    if (contentLength > MAX_REQUEST_BYTES) return finish(jsonResponse({ error:{ code:413, status:'PAYLOAD_TOO_LARGE', message:'This request is too large to process safely.', request_id:requestId } }, 413, responseHeaders));

    const caller = await resolveCaller(request, env);
    issuedGuestToken = caller.guestToken || '';
    record.callerKind = caller.kind;
    record.authState = caller.authState;
    record.subjectHash = await subjectHash(caller.subject);
    if (caller.authState === 'invalid') {
      return finish(jsonResponse({ status:'SESSION_INVALID', error:{ code:401, status:'SESSION_INVALID', message:'That sign-in is not valid. Sign in again. This request was not sent to the model.', request_id:requestId, retryable:false } }, 401, responseHeaders), { rejectReasons:['SESSION_INVALID'] });
    }
    if (caller.authState === 'unavailable') {
      return finish(jsonResponse({ status:'AUTH_UNAVAILABLE', retryable:true, error:{ code:503, status:'AUTH_UNAVAILABLE', message:'Sign-in could not be checked, so this request was not sent to the model.', request_id:requestId, retryable:true } }, 503, responseHeaders), { rejectReasons:['AUTH_UNAVAILABLE'] });
    }
    if (caller.authState === 'guest_token_invalid') {
      return finish(jsonResponse({ error:{ code:401, status:'GUEST_SESSION_INVALID', message:'This guest session is not valid. Open Marg again. The request was not sent to the model.', request_id:requestId, retryable:false } }, 401, responseHeaders), { rejectReasons:['GUEST_SESSION_INVALID'] });
    }
    if (caller.kind !== 'user' && !caller.clientId) {
      return finish(jsonResponse({ error:{ code:401, status:'CLIENT_ID_REQUIRED', message:'Open Marg in the app and try again.', request_id:requestId } }, 401, responseHeaders), { rejectReasons:['CLIENT_ID_REQUIRED'] });
    }
    const userMinute = configuredInt(env, 'MARG_USER_REQUESTS_PER_MINUTE', 30, false);
    const ipMinute = configuredInt(env, 'MARG_IP_REQUESTS_PER_MINUTE', 120, false);
    // Outer guest key stays the IP bucket, at the network ceiling. The 10/min
    // guest burst is enforced per signed session inside the ledger, so a
    // hostel does not share one person's minute allowance.
    const rateKey = caller.kind === 'user' ? caller.subject : 'guest:' + caller.bucket;
    const userAllowed = await workerRateAllowed(env, rateKey, 'MARG_RATE_LIMITER', caller.kind === 'user' ? userMinute : ipMinute);
    const ipAllowed = await workerRateAllowed(env, 'ip:' + caller.bucket, 'MARG_IP_LIMITER', ipMinute);
    if (!userAllowed || !ipAllowed) {
      return finish(jsonResponse({ error:{ code:429, status:'RATE_LIMITED', message:'Marg is receiving too many requests from this session. Wait a minute and continue.', request_id:requestId, retryable:true } }, 429, Object.assign({ 'Retry-After':'60' }, responseHeaders)));
    }

    let payload;
    let rawBodyText = '';
    try {
      const body = await readBoundedBody(request);
      if (body.tooLarge) {
        return finish(jsonResponse({ error:{ code:413, status:'PAYLOAD_TOO_LARGE', message:'This request is too large to process safely.', request_id:requestId } }, 413, responseHeaders), { rejectReasons:['PAYLOAD_TOO_LARGE'] });
      }
      if (Object.prototype.hasOwnProperty.call(body, 'json')) {
        payload = body.json;
        rawBodyText = JSON.stringify(payload);
      } else {
        rawBodyText = String(body.text || '');
        payload = JSON.parse(rawBodyText);
      }
    } catch (_error) {
      return finish(jsonResponse({ error:{ code:400, status:'INVALID_JSON', message:'Request body must be valid JSON', request_id:requestId } }, 400, responseHeaders), { rejectReasons:['INVALID_JSON'] });
    }

    const validation = validateRequest(payload, caller, validationMode);
    record.requestClass = validation.requestClass;
    record.droppedFieldNames = validation.droppedFieldNames;
    record.clamps = validation.clamps;
    record.outputTokensRequested = validation.outputTokensRequested;
    record.outputTokensSent = validation.outputTokensSent;
    record.rejectReasons = validation.reasons.slice();
    const guestViolations = guestCapabilityViolations(payload, caller, validation);
    if (guestMode !== 'off' && guestViolations.length) record.rejectReasons = record.rejectReasons.concat(guestViolations.map((name) => 'CAPABILITY_NOT_AVAILABLE:' + name));
    if (validationMode === 'enforce' && validation.sizeReasons.length) {
      return finish(jsonResponse({ status:'PAYLOAD_TOO_LARGE', reasons:validation.sizeReasons }, 413, responseHeaders));
    }
    if (validationMode === 'enforce' && validation.structuralReasons.length) {
      return finish(jsonResponse({ status:'INVALID_REQUEST', reasons:validation.structuralReasons }, 400, responseHeaders));
    }
    if (guestMode === 'enforce' && guestViolations.length) {
      return finish(jsonResponse({ status:'CAPABILITY_NOT_AVAILABLE', capability:guestViolations[0] }, 403, responseHeaders));
    }

    const seamContext = {
      requestId,
      caller:{ kind:caller.kind, subject:caller.subject, authState:caller.authState, ip:caller.ip },
      requestClass:validation.requestClass,
      limits:validation.limits,
      upstreamPayload:validation.upstreamPayload,
      estimatedInputBytes:validation.upstreamPayload ? byteLength(JSON.stringify(validation.upstreamPayload)) : byteLength(JSON.stringify(payload || {}))
    };

    if (payload && payload.margAction === 'daily_article') {
      beforeUpstream(seamContext);
      try {
        const article = await getDailyArticleSource(String(payload.topic || 'economy'), payload.offset);
        afterUpstream(seamContext, { usageMetadata:null, upstreamCalls:1, ok:true, status:200 });
        record.upstreamCalls = 1;
        return finish(jsonResponse({ article, marg_request:{ request_id:requestId } }, 200, responseHeaders));
      } catch (_error) {
        afterUpstream(seamContext, { usageMetadata:null, upstreamCalls:0, ok:false, status:502 });
        console.error('Daily article retrieval failed', { requestId });
        return finish(jsonResponse({
          error:{ code:502, status:'ARTICLE_SOURCE_FAILURE', message:'The publisher article could not be retrieved just now.', request_id:requestId, retryable:true }
        }, 502, responseHeaders));
      }
    }

    if (!validation.upstreamPayload || !Array.isArray(validation.upstreamPayload.contents) || validation.upstreamPayload.contents.length === 0) {
      return finish(jsonResponse({ error:{ code:400, status:'MISSING_CONTENTS', message:'Gemini contents are required', request_id:requestId } }, 400, responseHeaders), { rejectReasons:record.rejectReasons.concat(['MISSING_CONTENTS']) });
    }
    if (servicePaused(env, caller)) {
      return finish(jsonResponse({ error:{ code:503, status:'SERVICE_PAUSED', message:'Marg is paused. This request was not sent to the model.', request_id:requestId, retryable:false } }, 503, responseHeaders), { upstreamCalls:0, rejectReasons:['SERVICE_PAUSED'] });
    }
    if (!env || !env.GEMINI_API_KEY) return finish(jsonResponse({ error:{ code:500, status:'MISSING_API_KEY', message:'GEMINI_API_KEY is not configured', request_id:requestId } }, 500, responseHeaders));

    const limits = spendLimits(env, guestPool);
    const mode = callerSpendMode(caller);
    const idemKey = idempotencyKeyFrom(request);
    const bodyHash = bytesToHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rawBodyText)));
    const grounded = !!validation.requestedGrounding;
    if (grounded && (caller.kind !== 'user' || !groundingMicrosPerQuery(env))) {
      return finish(jsonResponse({ error:{ code:503, status:'GROUNDING_UNAVAILABLE', message:'Web lookup is unavailable right now. Check the official source.', request_id:requestId, retryable:false } }, 503, responseHeaders), { upstreamCalls:0, rejectReasons:['GROUNDING_UNAVAILABLE'] });
    }
    const perAttempt = estimateAttempt(env, validation.upstreamPayload || payload, validation.outputTokensSent, grounded);
    const now = Date.now();
    const began = await ledgerFetch(env, {
      action:'begin',
      now,
      day:usageDay(now, limits.zone),
      ttl:limits.ttl,
      idemTtl:limits.idemTtl,
      replayMax:limits.replayMax,
      idempotencyKey:idemKey,
      bodyHash,
      subject:caller.subject,
      aggregate:caller.aggregate || '',
      network:caller.bucket,
      caps:ledgerCaps(limits, mode),
      add:{ calls:1, tokens:perAttempt.tokens, micros:perAttempt.micros },
      reservationId:crypto.randomUUID(),
      visitorHash:caller.clientId ? await subjectHash('visitor:' + caller.clientId) : ''
    });
    record.reservedTokens = began && began.reservedTokens || 0;
    record.reservedMicros = began && began.reservedMicros || 0;
    if (!began || began.unavailable) {
      return finish(jsonResponse({ error:{ code:503, status:'SPENDING_CONTROL_UNAVAILABLE', message:'Marg could not check the usage allowance, so this request was not sent to the model.', request_id:requestId, retryable:true } }, 503, responseHeaders), { rejectReasons:['SPENDING_CONTROL_UNAVAILABLE'] });
    }
    if (began.mode === 'replay') {
      responseHeaders['X-Marg-Idempotent-Replay'] = '1';
      return finish(new Response(began.response, {
        status:began.httpStatus || 200,
        headers:Object.assign({ 'Content-Type':'application/json; charset=utf-8' }, CORS_HEADERS, responseHeaders)
      }), { upstreamCalls:0 });
    }
    if (began.mode === 'conflict') {
      return finish(jsonResponse({ error:{ code:409, status:'IDEMPOTENCY_CONFLICT', message:'This idempotency key was already used for a different request.', request_id:requestId, retryable:false, replayed:false } }, 409, responseHeaders), { rejectReasons:['IDEMPOTENCY_CONFLICT'] });
    }
    if (began.mode === 'in_progress') {
      return finish(jsonResponse({ error:{ code:409, status:'DUPLICATE_IN_PROGRESS', message:'This request is already running. It was not sent to the model again.', request_id:requestId, retryable:false, replayed:false } }, 409, responseHeaders), { rejectReasons:['DUPLICATE_IN_PROGRESS'] });
    }
    if (began.mode === 'completed_unreplayable') {
      return finish(jsonResponse({ error:{ code:409, status:'ALREADY_COMPLETED', message:'This request already finished. The original response was not stored, so it cannot be replayed.', request_id:requestId, retryable:false, replayed:false } }, 409, responseHeaders), { rejectReasons:['ALREADY_COMPLETED'] });
    }
    if (began.mode === 'quota' || began.quota) {
      const quota = publicQuota(mode, began.quota);
      const minute = /minute/.test(quota);
      const resetsAt = resetsAtFor(now, limits.zone, minute);
      const signInRequired = quota.indexOf('guest_') === 0;
      const denied = jsonResponse({ error:{ code:429, status:'QUOTA_EXCEEDED', quota, message:quotaCopy(quota, resetsAt, signInRequired), resetsAt, retryable:minute, signInRequired, request_id:requestId } }, 429, Object.assign(minute ? { 'Retry-After':String(Math.max(1, Math.ceil((new Date(resetsAt).getTime() - now) / 1000))) } : {}, responseHeaders));
      if (idemKey) await rememberIdempotent(env, limits, idemKey, bodyHash, '', denied, caller.subject);
      return finish(denied, { rejectReasons:[quota] });
    }
    if (began.mode !== 'owner' || !began.reservationId) {
      return finish(jsonResponse({ error:{ code:503, status:'SPENDING_CONTROL_UNAVAILABLE', message:'Marg could not check the usage allowance, so this request was not sent to the model.', request_id:requestId, retryable:true } }, 503, responseHeaders), { rejectReasons:['SPENDING_CONTROL_UNAVAILABLE'] });
    }

    const reservationId = began.reservationId;
    record.reservedTokens = began.reservedTokens || perAttempt.tokens;
    record.reservedMicros = began.reservedMicros || perAttempt.micros;
    const settleOrRelease = async (generated) => {
      const started = !!(generated && (generated.upstreamStarted || (generated.attempts && generated.attempts.length)));
      if (!started) {
        await ledgerFetch(env, { action:'release', now:Date.now(), day:usageDay(Date.now(), limits.zone), ttl:limits.ttl, reservationId });
        record.settledTokens = 0;
        return { tokens:0, micros:0 };
      }
      const billed = billAttempts(env, generated.attempts, perAttempt, grounded ? searchQueryCount(generated && generated.json) : 0);
      await ledgerFetch(env, {
        action:'settle',
        now:Date.now(),
        day:usageDay(Date.now(), limits.zone),
        ttl:limits.ttl,
        reservationId,
        billedTokens:billed.tokens,
        billedMicros:billed.micros
      });
      record.settledTokens = billed.tokens;
      record.settledMicros = billed.micros;
      return billed;
    };

    beforeUpstream(seamContext);
    try {
      const clientBudget = Number(request.headers && request.headers.get('X-Marg-Timeout-Ms'));
      const generated = await generateWithControlledRetry(validation.upstreamPayload, env.GEMINI_API_KEY, request.signal, clientBudget, {
        beforeAttempt:async () => {
          const extra = await ledgerFetch(env, {
            action:'extend',
            now:Date.now(),
            day:usageDay(Date.now(), limits.zone),
            ttl:limits.ttl,
            reservationId,
            caps:ledgerCaps(limits, mode),
            add:{ tokens:perAttempt.tokens, micros:perAttempt.micros }
          });
          if (!extra || extra.unavailable) {
            return { stop:true, status:503, error:{ code:503, status:'SPENDING_CONTROL_UNAVAILABLE', message:'Marg could not reserve the retry, so it was not sent.', retryable:true } };
          }
          if (!extra.ok) {
            const quota = publicQuota(mode, extra.quota);
            const resetsAt = resetsAtFor(Date.now(), limits.zone, /minute/.test(quota));
            return { stop:true, status:429, error:{ code:429, status:'QUOTA_EXCEEDED', quota, message:quotaCopy(quota, resetsAt, quota.indexOf('guest_') === 0), resetsAt, retryable:false, signInRequired:quota.indexOf('guest_') === 0 } };
          }
          record.reservedTokens = extra.reservedTokens || record.reservedTokens;
          record.reservedMicros = extra.reservedMicros || record.reservedMicros;
          return { ok:true };
        }
      });
      await settleOrRelease(generated);
      record.upstreamCalls = generated.upstreamCalls || (generated.attempts ? generated.attempts.length : 0);
      record.usageMetadata = usageCounts(generated.usageMetadata);
      afterUpstream(seamContext, {
        usageMetadata:record.usageMetadata,
        upstreamCalls:record.upstreamCalls,
        ok:!!generated.ok,
        status:generated.status
      });
      responseHeaders['X-Marg-Upstream-Calls'] = String(record.upstreamCalls || 0);
      responseHeaders['X-Marg-Model-Fallback'] = generated.modelFallbackUsed ? '1' : '0';
      let response;
      if (!generated.ok) {
        console.error('Gemini upstream rejected request', {
          requestId,
          httpStatus:generated.status,
          code:generated.error && generated.error.status || '',
          upstreamCalls:record.upstreamCalls
        });
        if (generated.retryAfter) responseHeaders['Retry-After'] = generated.retryAfter;
        const failure = generated.error || {};
        response = jsonResponse({
          error:Object.assign({}, failure, {
            message:failure.status === 'QUOTA_EXCEEDED' || failure.status === 'SPENDING_CONTROL_UNAVAILABLE' ? failure.message : generated.status === 429 ? 'Marg’s answer service is busy. Please wait briefly and retry.' : generated.status === 503 ? 'Marg’s answer service is temporarily unavailable.' : generated.status === 504 ? 'Marg’s answer service took too long on this request.' : generated.status === 499 ? 'The request closed before Marg finished.' : 'Marg could not complete this request.',
            request_id:requestId,
            retryable:failure.status === 'QUOTA_EXCEEDED' ? false : generated.retryable,
            attempts:record.upstreamCalls
          })
        }, generated.status, responseHeaders);
      } else if (validation.compatibilityMode) {
        const compatibilityGrounding = generated.json && generated.json.candidates && generated.json.candidates[0] && generated.json.candidates[0].groundingMetadata || null;
        responseHeaders['X-Marg-Web-Grounded'] = compatibilityGrounding ? '1' : '0';
        response = jsonResponse({
          content:[{ type:'text', text:generated.text }],
          stop_reason:generated.finishReason,
          usage_metadata:generated.usageMetadata,
          grounding_metadata:compatibilityGrounding,
          marg_request:{ request_id:requestId, upstream_calls:generated.upstreamCalls, truncated:generated.finishReason === 'MAX_TOKENS' }
        }, generated.status, responseHeaders);
      } else {
        const groundingMetadata = generated.json && generated.json.candidates && generated.json.candidates[0] && generated.json.candidates[0].groundingMetadata;
        responseHeaders['X-Marg-Web-Grounded'] = groundingMetadata ? '1' : '0';
        generated.json.margRequest = { requestId, upstreamCalls:generated.upstreamCalls, truncated:generated.finishReason === 'MAX_TOKENS' };
        response = new Response(JSON.stringify(generated.json), {
          status:generated.status,
          headers:Object.assign({ 'Content-Type':'application/json; charset=utf-8' }, CORS_HEADERS, responseHeaders)
        });
      }
      if (idemKey) await rememberIdempotent(env, limits, idemKey, bodyHash, reservationId, response, caller.subject);
      return finish(response);
    } catch (_error) {
      const started = !!(_error && _error.upstreamStarted);
      await settleOrRelease({ upstreamStarted:started, attempts:_error && _error.attempts || (started ? [{ uncertain:true, usage:null }] : []) });
      afterUpstream(seamContext, { usageMetadata:null, upstreamCalls:record.upstreamCalls || 0, ok:false, status:502 });
      console.error('Gemini Worker upstream failure', { requestId });
      const failure = jsonResponse({
        error:{ code:502, status:'WORKER_UPSTREAM_FAILURE', message:'Marg could not reach its answer service.', request_id:requestId, retryable:true }
      }, 502, responseHeaders);
      if (idemKey) await rememberIdempotent(env, limits, idemKey, bodyHash, reservationId, failure, caller.subject);
      return finish(failure);
    }
  }
};
