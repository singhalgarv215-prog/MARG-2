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
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Marg-Timeout-Ms, X-Marg-Client-Id',
  'Access-Control-Expose-Headers': 'Retry-After, X-Marg-Request-Id, X-Marg-Upstream-Calls, X-Marg-Web-Grounded, X-Marg-Model-Fallback, X-Marg-Placement',
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
  return localRateAllowed(bindingName + ':' + key, fallbackLimit);
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

async function resolveCaller(request, env) {
  const hasHeaderApi = !!(request && request.headers && typeof request.headers.get === 'function');
  const clientId = String(hasHeaderApi ? request.headers.get('X-Marg-Client-Id') || '' : 'worker-unit-request').replace(/[^a-zA-Z0-9._:-]/g, '').slice(0, 120);
  const ip = String(hasHeaderApi ? request.headers.get('CF-Connecting-IP') || 'unknown' : 'unit-test');
  const bucket = ipBucket(ip);
  const auth = await authenticateMargUser(request);
  if (auth.authState === 'valid' && auth.user && auth.user.id) {
    return { kind:'user', subject:'user:' + auth.user.id, authState:'valid', ip, clientId, bucket };
  }
  const kind = auth.authState === 'none' && !clientId ? 'anonymous' : 'guest';
  return { kind, subject:'guest:' + bucket, authState:auth.authState, ip, clientId, bucket };
}

async function subjectHash(subject) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(subject || '')));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('').slice(0, 12);
}

function byteLength(value) {
  return new TextEncoder().encode(String(value || '')).length;
}

// The B3 seam test replaces these two declarations exactly. Quota checks run
// at the call sites in fetch, immediately before beforeUpstream and after
// afterUpstream, so those replacements still observe one call each.
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

function normalizeMessageParts(message) {
  const source = Array.isArray(message && message.parts)
    ? message.parts
    : Array.isArray(message && message.content)
      ? message.content
      : [message && message.content];
  const parts = [];
  source.forEach((part) => {
    if (typeof part === 'string' && part.trim()) parts.push({ text:part });
    else if (part && typeof part.text === 'string' && part.text.trim()) parts.push({ text:part.text });
    else {
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

async function generateWithControlledRetry(initialPayload, apiKey, clientSignal, timeoutMs) {
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
    return await generateWithinDeadline(initialPayload, apiKey, controller.signal, deadline);
  } catch (error) {
    if (timedOut) return {
      ok:false, status:504,
      error:{ code:504, status:'UPSTREAM_TIMEOUT', message:'Marg’s answer service exceeded this request’s time limit.' },
      retryable:true, retryAfter:'', upstreamCalls:error.upstreamCalls || 1
    };
    throw error;
  } finally {
    clearTimeout(timer);
    if (clientSignal) clientSignal.removeEventListener('abort', relayAbort);
  }
}

async function generateWithinDeadline(initialPayload, apiKey, clientSignal, deadline) {
  let upstreamCalls = 0;
  let transientRetries = 0;
  let locationFallbacks = 0;
  let endpoint = GEMINI_ENDPOINT;
  while (true) {
    if (clientSignal && clientSignal.aborted) throw new DOMException('Client request was aborted', 'AbortError');
    if (Date.now() >= deadline) throw new DOMException('Upstream deadline exceeded', 'AbortError');
    upstreamCalls++;
    const upstream = await fetch(endpoint, {
      method:'POST',
      headers:{ 'Content-Type':'application/json', 'x-goog-api-key':apiKey },
      body:JSON.stringify(initialPayload),
      signal:clientSignal,
      cache:'no-store'
    });
    const responseBody = await upstream.text();
    if (!upstream.ok) {
      const parsedError = parseUpstreamError(responseBody, upstream.status);
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
        modelFallbackUsed:locationFallbacks > 0
      };
    }

    let responseJson;
    try {
      responseJson = JSON.parse(responseBody);
    } catch (error) {
      return {
        ok:false,
        status:502,
        contentType:'application/json; charset=utf-8',
        error:{ code:502, status:'INVALID_UPSTREAM_RESPONSE', message:'Gemini returned an invalid JSON response' },
        retryable:false,
        retryAfter:'',
        upstreamCalls
      };
    }
    return {
      ok:true,
      status:upstream.status,
      contentType:upstream.headers.get('Content-Type') || 'application/json; charset=utf-8',
      json:responseJson,
      text:extractText(responseJson),
      finishReason:getFinishReason(responseJson),
      usageMetadata:responseJson.usageMetadata || null,
      upstreamCalls,
      modelFallbackUsed:locationFallbacks > 0
    };
  }
}

// Mechanical stuck-reservation timeout, not a quota. B3 aborts upstream at the
// per-request deadline (at most MAX_UPSTREAM_TIME_MS). Settle or release is one
// Durable Object write after that abort; five seconds covers that write.
const RESERVATION_SETTLE_MARGIN_MS = 5000;
// Mechanical Retry-After for a live concurrency slot, not a daily reset.
// B3's shortest upstream budget is 1000ms, so two seconds is long enough for
// that shortest call to finish and free the slot.
const IN_FLIGHT_RETRY_AFTER_SECONDS = 2;
const QUOTA_METERED_CLASS = { chat:true, structured:true, vision:true, grounded:true };
let quotaBindingWarned = false;

function quotaLimit(value) {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function quotaModeValue(env) {
  const value = String(env && env.MARG_QUOTA_MODE || '').trim().toLowerCase();
  if (value === 'log' || value === 'enforce') return value;
  return 'off';
}

function quotaNamespace(env) {
  const binding = env && env.MARG_QUOTA;
  if (!binding || typeof binding.idFromName !== 'function' || typeof binding.get !== 'function') return null;
  return binding;
}

function warnQuotaBindingOnce() {
  if (quotaBindingWarned) return;
  quotaBindingWarned = true;
  console.warn('MARG_QUOTA binding is absent; usage quotas are off');
}

function quotaRuntime(env) {
  const binding = quotaNamespace(env);
  if (!binding) warnQuotaBindingOnce();
  const mode = binding ? quotaModeValue(env) : 'off';
  return { binding, mode, active:!!(binding && mode !== 'off') };
}

function parseQuotaLimits(raw) {
  const empty = { user:{}, guest:{}, global:{}, estimate:{} };
  if (raw == null || String(raw).trim() === '') return { ok:true, absent:true, limits:empty };
  let parsed;
  try { parsed = JSON.parse(String(raw)); }
  catch (_error) { return { ok:false, reason:'limits_json' }; }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { ok:false, reason:'limits_json' };
  const groups = {
    user:['calls_per_day', 'tokens_per_day', 'max_in_flight'],
    guest:['calls_per_day', 'tokens_per_day', 'max_in_flight'],
    global:['tokens_per_day', 'tokens_per_month', 'guest_tokens_per_day'],
    estimate:['image_tokens']
  };
  const limits = { user:{}, guest:{}, global:{}, estimate:{} };
  const names = Object.keys(groups);
  for (let index = 0; index < names.length; index++) {
    const name = names[index];
    if (!Object.prototype.hasOwnProperty.call(parsed, name) || parsed[name] == null) continue;
    const source = parsed[name];
    if (!source || typeof source !== 'object' || Array.isArray(source)) return { ok:false, reason:'limits_value' };
    const keys = groups[name];
    for (let keyIndex = 0; keyIndex < keys.length; keyIndex++) {
      const key = keys[keyIndex];
      if (!Object.prototype.hasOwnProperty.call(source, key)) continue;
      if (!quotaLimit(source[key])) return { ok:false, reason:'limits_value' };
      limits[name][key] = source[key];
    }
  }
  return { ok:true, absent:false, limits };
}

function parseDayOffset(raw) {
  if (raw == null || String(raw).trim() === '') return { ok:false, missing:true };
  const text = String(raw).trim();
  if (!/^-?\d+$/.test(text)) return { ok:false, missing:false };
  const value = Number(text);
  if (!Number.isSafeInteger(value)) return { ok:false, missing:false };
  return { ok:true, value };
}

function parseFailurePolicy(raw) {
  const value = String(raw == null ? '' : raw).trim();
  if (value === 'closed' || value === 'open_registered') return { ok:true, value };
  return { ok:false, missing:!value };
}

function quotaExempt(env, caller) {
  if (!caller || caller.kind !== 'user') return false;
  const id = String(caller.subject || '').slice(5);
  const list = String(env && env.MARG_QUOTA_EXEMPT || '').split(',');
  for (let index = 0; index < list.length; index++) if (list[index].trim() === id && id) return true;
  return false;
}

function upstreamTextBytes(payload) {
  let bytes = 0;
  (payload && payload.contents || []).forEach((message) => {
    (message && message.parts || []).forEach((part) => {
      if (part && typeof part.text === 'string') bytes += byteLength(part.text);
    });
  });
  const instruction = payload && payload.systemInstruction;
  (instruction && instruction.parts || []).forEach((part) => {
    if (part && typeof part.text === 'string') bytes += byteLength(part.text);
  });
  return bytes;
}

function upstreamImageCount(payload) {
  let count = 0;
  (payload && payload.contents || []).forEach((message) => {
    (message && message.parts || []).forEach((part) => {
      if (part && part.inlineData) count += 1;
    });
  });
  return count;
}

function estimateUpstreamTokens(payload, outputTokens, imageTokens) {
  return Math.ceil(upstreamTextBytes(payload) / 2) + upstreamImageCount(payload) * imageTokens + (Number(outputTokens) || 0);
}

function upstreamBudgetMilliseconds(timeoutMs) {
  const requestedTime = Number(timeoutMs);
  return Math.min(MAX_UPSTREAM_TIME_MS, Number.isFinite(requestedTime) && requestedTime > 0 ? Math.max(1000, requestedTime) : 55000);
}

function quotaPeriods(nowMs, offsetMinutes) {
  const shifted = nowMs + offsetMinutes * 60000;
  const dayIndex = Math.floor(shifted / 86400000);
  const date = new Date(shifted);
  return {
    day:String(dayIndex),
    month:date.getUTCFullYear() + '-' + String(date.getUTCMonth() + 1).padStart(2, '0'),
    dayResetAtMs:(dayIndex + 1) * 86400000 - offsetMinutes * 60000,
    monthResetAtMs:Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1) - offsetMinutes * 60000
  };
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value)));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function quotaObjectName(subject, env) {
  const salt = env && env.QUOTA_HASH_SALT != null ? String(env.QUOTA_HASH_SALT) : '';
  return sha256Hex(String(subject || '') + salt);
}

function mapQuotaDenial(scope, reason) {
  if (reason === 'in_flight') return { status:'TOO_MANY_IN_FLIGHT', scope:scope === 'guest' ? 'guest' : 'user', retryable:true };
  if (reason === 'month') return { status:'GLOBAL_MONTHLY_BUDGET', scope:'global', retryable:false };
  if (reason === 'guest_tokens') return { status:'GUEST_DAILY_QUOTA', scope:'global', retryable:false };
  if (scope === 'global') return { status:'GLOBAL_DAILY_BUDGET', scope:'global', retryable:false };
  if (scope === 'guest') return { status:'GUEST_DAILY_QUOTA', scope:'guest', retryable:false };
  return { status:'USER_DAILY_QUOTA', scope:'user', retryable:false };
}

function quotaRejectionResponse(requestId, responseHeaders, scope, reason, resetAtMs, nowMs) {
  const mapped = mapQuotaDenial(scope, reason);
  const retrySeconds = mapped.retryable ? IN_FLIGHT_RETRY_AFTER_SECONDS : Math.max(1, Math.ceil((Number(resetAtMs) - nowMs) / 1000));
  const resetAt = mapped.retryable ? new Date(nowMs + IN_FLIGHT_RETRY_AFTER_SECONDS * 1000).toISOString() : new Date(Number(resetAtMs)).toISOString();
  return jsonResponse({
    error:{ code:429, status:mapped.status, scope:mapped.scope, retryable:mapped.retryable, reset_at:resetAt, request_id:requestId }
  }, 429, Object.assign({ 'Retry-After':String(retrySeconds) }, responseHeaders));
}

function servicePausedResponse(requestId, responseHeaders) {
  return jsonResponse({
    error:{ code:503, status:'SERVICE_PAUSED', message:'Marg\'s answer service is paused.', request_id:requestId, retryable:true }
  }, 503, responseHeaders);
}

function quotaUnavailableResponse(requestId, responseHeaders) {
  return jsonResponse({
    error:{ code:503, status:'QUOTA_UNAVAILABLE', message:'Marg could not check usage for this request.', request_id:requestId, retryable:true }
  }, 503, responseHeaders);
}

function stampQuota(record, fields) {
  record.quotaMode = fields.quotaMode;
  record.quotaOutcome = fields.quotaOutcome;
  record.reservedTokens = Object.prototype.hasOwnProperty.call(fields, 'reservedTokens') ? fields.reservedTokens : null;
  record.settledTokens = Object.prototype.hasOwnProperty.call(fields, 'settledTokens') ? fields.settledTokens : null;
  record.remainingCalls = Object.prototype.hasOwnProperty.call(fields, 'remainingCalls') ? fields.remainingCalls : null;
}

function logQuotaConfig(reason) {
  console.error('MARG_QUOTA configuration invalid: ' + reason + '; enforce mode is running as log');
}

class MargQuota {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.memory = { days:{}, months:{}, reservations:{} };
    const loaded = state && state.blockConcurrencyWhile ? state.blockConcurrencyWhile(async () => {
      const stored = await state.storage.get('quota');
      if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return;
      this.memory = stored;
      if (!this.memory.days || typeof this.memory.days !== 'object') this.memory.days = {};
      if (!this.memory.months || typeof this.memory.months !== 'object') this.memory.months = {};
      if (!this.memory.reservations || typeof this.memory.reservations !== 'object') this.memory.reservations = {};
    }) : null;
    this.loaded = loaded && typeof loaded.then === 'function' ? loaded : Promise.resolve();
  }

  dropExpired(nowMs) {
    const ids = Object.keys(this.memory.reservations);
    for (let index = 0; index < ids.length; index++) {
      const reservation = this.memory.reservations[ids[index]];
      if (reservation && Number(reservation.expiresAt) <= nowMs) this.removeReservation(ids[index], true);
    }
  }

  removeReservation(id, keepCall) {
    const reservation = this.memory.reservations[id];
    if (!reservation) return;
    const dayState = this.memory.days[reservation.day];
    if (dayState) {
      dayState.reserved -= reservation.tokens;
      if (dayState.reserved < 0) dayState.reserved = 0;
      if (reservation.guestPool) {
        dayState.guestReserved -= reservation.tokens;
        if (dayState.guestReserved < 0) dayState.guestReserved = 0;
      }
      if (!keepCall) {
        dayState.calls -= 1;
        if (dayState.calls < 0) dayState.calls = 0;
      }
    }
    const monthState = reservation.month && this.memory.months[reservation.month];
    if (monthState) {
      monthState.reserved -= reservation.tokens;
      if (monthState.reserved < 0) monthState.reserved = 0;
    }
    delete this.memory.reservations[id];
  }

  prune(day, month) {
    const keepDays = {};
    keepDays[day] = true;
    const keepMonths = {};
    if (month) keepMonths[month] = true;
    Object.keys(this.memory.reservations).forEach((id) => {
      const reservation = this.memory.reservations[id];
      if (reservation && reservation.day) keepDays[reservation.day] = true;
      if (reservation && reservation.month) keepMonths[reservation.month] = true;
    });
    Object.keys(this.memory.days).forEach((key) => { if (!keepDays[key]) delete this.memory.days[key]; });
    Object.keys(this.memory.months).forEach((key) => { if (!keepMonths[key]) delete this.memory.months[key]; });
  }

  async reserve(body) {
    const nowMs = Number(body.nowMs);
    this.dropExpired(nowMs);
    const day = String(body.day || '');
    const month = body.month ? String(body.month) : '';
    this.prune(day, month);
    if (!this.memory.days[day]) this.memory.days[day] = { calls:0, tokens:0, reserved:0, guestTokens:0, guestReserved:0 };
    const dayState = this.memory.days[day];
    if (month && !this.memory.months[month]) this.memory.months[month] = { tokens:0, reserved:0 };
    const monthState = month ? this.memory.months[month] : null;
    const limits = body.limits && typeof body.limits === 'object' ? body.limits : {};
    const estimate = Math.max(0, Math.floor(Number(body.estimateTokens) || 0));
    const enforce = body.enforce === true;
    const scope = body.scope === 'global' ? 'global' : body.scope === 'guest' ? 'guest' : 'user';
    const guestPool = scope === 'global' && body.guestPool === true;
    const inFlight = Object.keys(this.memory.reservations).length;
    const calls = dayState.calls;
    const tokens = dayState.tokens;
    const reserved = dayState.reserved;
    const guestTokens = dayState.guestTokens || 0;
    const guestReserved = dayState.guestReserved || 0;
    const monthTokens = monthState ? monthState.tokens : 0;
    const monthReserved = monthState ? monthState.reserved : 0;
    let reason = '';
    if (scope !== 'global' && enforce && quotaLimit(limits.max_in_flight) && !(inFlight < limits.max_in_flight)) reason = 'in_flight';
    else if (scope !== 'global' && enforce && quotaLimit(limits.calls_per_day) && !(calls + 1 <= limits.calls_per_day)) reason = 'calls';
    else if (enforce && quotaLimit(limits.tokens_per_day) && !(tokens + reserved + estimate <= limits.tokens_per_day)) reason = 'tokens';
    else if (scope === 'global' && enforce && quotaLimit(limits.tokens_per_month) && !(monthTokens + monthReserved + estimate <= limits.tokens_per_month)) reason = 'month';
    else if (guestPool && enforce && quotaLimit(limits.guest_tokens_per_day) && !(guestTokens + guestReserved + estimate <= limits.guest_tokens_per_day)) reason = 'guest_tokens';
    const resetAtMs = reason === 'month' ? Number(body.monthResetAtMs) || 0 : Number(body.dayResetAtMs) || 0;
    const remainingCalls = quotaLimit(limits.calls_per_day) ? limits.calls_per_day - calls : null;
    if (reason) return { ok:false, reason, resetAtMs, scope, remainingCalls };
    const reservationId = crypto.randomUUID();
    dayState.calls = calls + 1;
    dayState.reserved = reserved + estimate;
    if (guestPool) dayState.guestReserved = guestReserved + estimate;
    if (monthState) monthState.reserved = monthReserved + estimate;
    this.memory.reservations[reservationId] = { tokens:estimate, expiresAt:Number(body.expiresAt) || 0, day, month, guestPool };
    return {
      ok:true,
      reservationId,
      resetAtMs:Number(body.dayResetAtMs) || 0,
      scope,
      remainingCalls:quotaLimit(limits.calls_per_day) ? limits.calls_per_day - (calls + 1) : null,
      reservedTokens:estimate
    };
  }

  async settle(body) {
    const nowMs = Number(body.nowMs);
    this.dropExpired(nowMs);
    const reservationId = String(body.reservationId || '');
    const reservation = this.memory.reservations[reservationId];
    if (!reservation) return { ok:false, reason:'missing' };
    const actual = body.actualTokens == null || !Number.isFinite(Number(body.actualTokens)) ? reservation.tokens : Number(body.actualTokens);
    const dayState = this.memory.days[reservation.day];
    if (dayState) {
      dayState.reserved -= reservation.tokens;
      if (dayState.reserved < 0) dayState.reserved = 0;
      dayState.tokens += actual;
      if (reservation.guestPool) {
        dayState.guestReserved -= reservation.tokens;
        if (dayState.guestReserved < 0) dayState.guestReserved = 0;
        dayState.guestTokens = (dayState.guestTokens || 0) + actual;
      }
    }
    const monthState = reservation.month && this.memory.months[reservation.month];
    if (monthState) {
      monthState.reserved -= reservation.tokens;
      if (monthState.reserved < 0) monthState.reserved = 0;
      monthState.tokens += actual;
    }
    const day = reservation.day;
    const month = reservation.month;
    delete this.memory.reservations[reservationId];
    this.prune(day, month || '');
    return { ok:true, charged:actual };
  }

  async release(body) {
    const nowMs = Number(body.nowMs);
    this.dropExpired(nowMs);
    this.removeReservation(String(body.reservationId || ''), body.keepCall === true);
    return { ok:true };
  }

  async fetch(request) {
    await this.loaded;
    let body;
    try { body = await request.json(); }
    catch (_error) { return new Response(JSON.stringify({ ok:false, reason:'bad_body' }), { status:400, headers:{ 'Content-Type':'application/json' } }); }
    let result;
    if (body && body.op === 'reserve') result = await this.reserve(body);
    else if (body && body.op === 'settle') result = await this.settle(body);
    else if (body && body.op === 'release') result = await this.release(body);
    else result = { ok:false, reason:'bad_op' };
    await this.state.storage.put('quota', this.memory);
    return new Response(JSON.stringify(result), { status:200, headers:{ 'Content-Type':'application/json' } });
  }
}

async function quotaPost(binding, name, body) {
  const stub = binding.get(binding.idFromName(name));
  const response = await stub.fetch(new Request('https://marg-quota.invalid/', {
    method:'POST',
    headers:{ 'Content-Type':'application/json' },
    body:JSON.stringify(body)
  }));
  if (!response || !response.ok) throw new Error('quota unreachable');
  return response.json();
}

async function quotaRelease(binding, name, reservationId, nowMs, keepCall) {
  if (!binding || !reservationId) return;
  await quotaPost(binding, name, { op:'release', reservationId, nowMs, keepCall:keepCall === true });
}

function quotaFailureResult(policy, caller, requestId, responseHeaders, record, modeLabel) {
  if (policy === 'open_registered' && caller && caller.kind === 'user') {
    stampQuota(record, { quotaMode:modeLabel, quotaOutcome:'failed_open' });
    return { blocked:false, hold:null };
  }
  stampQuota(record, { quotaMode:modeLabel, quotaOutcome:'failed_closed' });
  return { blocked:true, response:quotaUnavailableResponse(requestId, responseHeaders), hold:null };
}

async function acquireQuota(env, request, caller, validation, record, requestId, responseHeaders) {
  try {
    const runtime = quotaRuntime(env);
    if (!QUOTA_METERED_CLASS[validation.requestClass]) {
      if (runtime.active) stampQuota(record, { quotaMode:runtime.mode, quotaOutcome:'skipped' });
      return { blocked:false, hold:null };
    }
    if (String(env && env.MARG_GEMINI_PAUSED || '') === '1' || (caller.kind !== 'user' && String(env && env.MARG_GUESTS_PAUSED || '') === '1')) {
      if (runtime.active) stampQuota(record, { quotaMode:runtime.mode, quotaOutcome:'rejected_SERVICE_PAUSED' });
      else stampQuota(record, { quotaMode:'off', quotaOutcome:'rejected_SERVICE_PAUSED' });
      return { blocked:true, response:servicePausedResponse(requestId, responseHeaders), hold:null };
    }
    if (!runtime.active) return { blocked:false, hold:null };
    const limitsParsed = parseQuotaLimits(env && env.MARG_QUOTA_LIMITS);
    const offsetParsed = parseDayOffset(env && env.MARG_QUOTA_DAY_OFFSET_MINUTES);
    const failureParsed = parseFailurePolicy(env && env.MARG_QUOTA_FAILURE);
    const limits = limitsParsed.ok ? limitsParsed.limits : { user:{}, guest:{}, global:{}, estimate:{} };
    const images = upstreamImageCount(validation.upstreamPayload);
    const imageTokens = limits.estimate && limits.estimate.image_tokens;
    const imageProblem = images > 0 && !quotaLimit(imageTokens);
    let configError = '';
    if (!limitsParsed.ok) configError = limitsParsed.reason;
    else if (runtime.mode === 'enforce' && limitsParsed.absent) configError = 'limits_json';
    else if (!offsetParsed.ok && (runtime.mode === 'enforce' || !offsetParsed.missing)) configError = 'day_offset';
    else if (runtime.mode === 'enforce' && !failureParsed.ok) configError = 'failure_policy';
    else if (imageProblem && runtime.mode === 'enforce') configError = 'image_estimate';
    if (configError) logQuotaConfig(configError);
    const enforcing = runtime.mode === 'enforce' && !configError;
    const modeLabel = enforcing ? 'enforce' : 'log';
    const estimate = estimateUpstreamTokens(validation.upstreamPayload, validation.outputTokensSent, quotaLimit(imageTokens) ? imageTokens : 0);
    if (!offsetParsed.ok) {
      stampQuota(record, { quotaMode:modeLabel, quotaOutcome:'allowed', reservedTokens:estimate, settledTokens:null, remainingCalls:null });
      return { blocked:false, hold:{ binding:null, reservedTokens:estimate, local:true } };
    }
    const nowMs = Date.now();
    const periods = quotaPeriods(nowMs, offsetParsed.value);
    const timeoutHeader = request && request.headers && request.headers.get ? request.headers.get('X-Marg-Timeout-Ms') : '';
    const expiresAt = nowMs + upstreamBudgetMilliseconds(timeoutHeader) + RESERVATION_SETTLE_MARGIN_MS;
    const subjectScope = caller.kind === 'user' ? 'user' : 'guest';
    const subjectName = await quotaObjectName(caller.subject, env);
    const globalName = await quotaObjectName('global', env);
    const subjectLimits = enforcing || !configError ? (subjectScope === 'user' ? limits.user : limits.guest) : {};
    const globalLimits = enforcing || !configError ? limits.global : {};
    let subjectResult;
    try {
      subjectResult = await quotaPost(runtime.binding, subjectName, {
        op:'reserve', day:periods.day, month:'', estimateTokens:estimate, limits:subjectLimits, nowMs,
        scope:subjectScope, guestPool:false, expiresAt, enforce:enforcing && !quotaExempt(env, caller),
        dayResetAtMs:periods.dayResetAtMs, monthResetAtMs:periods.monthResetAtMs
      });
    } catch (_error) {
      if (!enforcing) {
        stampQuota(record, { quotaMode:modeLabel, quotaOutcome:'failed_open', reservedTokens:estimate });
        return { blocked:false, hold:null };
      }
      return quotaFailureResult(failureParsed.value, caller, requestId, responseHeaders, record, modeLabel);
    }
    if (!subjectResult || !subjectResult.ok) {
      const denial = subjectResult || { reason:'calls', scope:subjectScope, resetAtMs:periods.dayResetAtMs, remainingCalls:null };
      const mapped = mapQuotaDenial(denial.scope || subjectScope, denial.reason || 'calls');
      stampQuota(record, {
        quotaMode:modeLabel,
        quotaOutcome:'rejected_' + mapped.status,
        remainingCalls:denial.remainingCalls == null ? null : denial.remainingCalls
      });
      return { blocked:true, response:quotaRejectionResponse(requestId, responseHeaders, denial.scope || subjectScope, denial.reason || 'calls', denial.resetAtMs, nowMs), hold:null };
    }
    let globalResult;
    try {
      globalResult = await quotaPost(runtime.binding, globalName, {
        op:'reserve', day:periods.day, month:periods.month, estimateTokens:estimate, limits:globalLimits, nowMs,
        scope:'global', guestPool:caller.kind !== 'user', expiresAt, enforce:enforcing,
        dayResetAtMs:periods.dayResetAtMs, monthResetAtMs:periods.monthResetAtMs
      });
    } catch (_error) {
      try { await quotaRelease(runtime.binding, subjectName, subjectResult.reservationId, nowMs, false); } catch (_releaseError) {}
      if (!enforcing) {
        stampQuota(record, { quotaMode:modeLabel, quotaOutcome:'failed_open', reservedTokens:estimate });
        return { blocked:false, hold:null };
      }
      return quotaFailureResult(failureParsed.value, caller, requestId, responseHeaders, record, modeLabel);
    }
    if (!globalResult || !globalResult.ok) {
      try { await quotaRelease(runtime.binding, subjectName, subjectResult.reservationId, nowMs, false); } catch (_releaseError) {}
      const denial = globalResult || { reason:'tokens', scope:'global', resetAtMs:periods.dayResetAtMs };
      const mapped = mapQuotaDenial('global', denial.reason || 'tokens');
      stampQuota(record, { quotaMode:modeLabel, quotaOutcome:'rejected_' + mapped.status, remainingCalls:subjectResult.remainingCalls == null ? null : subjectResult.remainingCalls });
      return { blocked:true, response:quotaRejectionResponse(requestId, responseHeaders, 'global', denial.reason || 'tokens', denial.resetAtMs, nowMs), hold:null };
    }
    stampQuota(record, {
      quotaMode:modeLabel,
      quotaOutcome:'allowed',
      reservedTokens:estimate,
      settledTokens:null,
      remainingCalls:subjectResult.remainingCalls == null ? null : subjectResult.remainingCalls
    });
    return {
      blocked:false,
      hold:{
        binding:runtime.binding,
        subjectName,
        globalName,
        subjectReservationId:subjectResult.reservationId,
        globalReservationId:globalResult.reservationId,
        reservedTokens:estimate
      }
    };
  } catch (_error) {
    console.error('MARG_QUOTA configuration invalid: unexpected');
    return { blocked:false, hold:null };
  }
}

async function completeQuota(hold, generated, record) {
  if (!hold || hold.done) return;
  hold.done = true;
  const usage = generated && generated.usageMetadata;
  const actual = usage && Number.isFinite(Number(usage.totalTokenCount)) ? Number(usage.totalTokenCount) : null;
  if (!hold.binding) {
    record.settledTokens = generated && generated.ok ? (actual == null ? hold.reservedTokens : actual) : null;
    return;
  }
  const nowMs = Date.now();
  try {
    if (generated && generated.ok) {
      const payload = { op:'settle', actualTokens:actual, nowMs };
      if (hold.subjectReservationId) await quotaPost(hold.binding, hold.subjectName, Object.assign({ reservationId:hold.subjectReservationId }, payload));
      if (hold.globalReservationId) await quotaPost(hold.binding, hold.globalName, Object.assign({ reservationId:hold.globalReservationId }, payload));
      record.settledTokens = actual == null ? hold.reservedTokens : actual;
    } else {
      if (hold.subjectReservationId) await quotaRelease(hold.binding, hold.subjectName, hold.subjectReservationId, nowMs, true);
      if (hold.globalReservationId) await quotaRelease(hold.binding, hold.globalName, hold.globalReservationId, nowMs, true);
      record.settledTokens = null;
    }
  } catch (_error) {
    record.settledTokens = generated && generated.ok ? (actual == null ? hold.reservedTokens : actual) : null;
  }
}

export { resolveMaxOutputTokens, MargQuota };

function usageCounts(usage) {
  if (!usage || typeof usage !== 'object') return null;
  const counts = {};
  ['promptTokenCount', 'candidatesTokenCount', 'thoughtsTokenCount', 'totalTokenCount', 'cachedContentTokenCount'].forEach((key) => {
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
    // MARG_AUTH_STRICT stays off unless the operator sets it. When it is on,
    // a Worker 401 is SESSION_INVALID. The app shows that as a generic
    // "could not finish" error, not a sign-in screen.
    const authStrict = String(env && env.MARG_AUTH_STRICT || '').trim().toLowerCase() === 'on';
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
      httpStatus:0
    };
    let logged = false;
    const finish = async (response, patch) => {
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
    record.callerKind = caller.kind;
    record.authState = caller.authState;
    record.subjectHash = await subjectHash(caller.subject);
    const rateKey = caller.kind === 'user' ? caller.subject : 'guest:' + caller.bucket;
    const userAllowed = await workerRateAllowed(env, rateKey, 'MARG_RATE_LIMITER', caller.kind === 'user' ? 60 : 20);
    const ipAllowed = await workerRateAllowed(env, 'ip:' + caller.bucket, 'MARG_IP_LIMITER', 120);
    if (!userAllowed || !ipAllowed) {
      return finish(jsonResponse({ error:{ code:429, status:'RATE_LIMITED', message:'Marg is receiving too many requests from this session. Wait a minute and continue.', request_id:requestId, retryable:true } }, 429, Object.assign({ 'Retry-After':'60' }, responseHeaders)));
    }
    if (authStrict && caller.authState === 'invalid') {
      return finish(jsonResponse({ status:'SESSION_INVALID' }, 401, responseHeaders), { rejectReasons:['SESSION_INVALID'] });
    }
    if (authStrict && caller.authState === 'unavailable') {
      return finish(jsonResponse({ status:'AUTH_UNAVAILABLE', retryable:true }, 503, responseHeaders), { rejectReasons:['AUTH_UNAVAILABLE'] });
    }
    if (caller.kind !== 'user' && !caller.clientId) {
      return finish(jsonResponse({ error:{ code:401, status:'CLIENT_ID_REQUIRED', message:'Open Marg in the app and try again.', request_id:requestId } }, 401, responseHeaders), { rejectReasons:['CLIENT_ID_REQUIRED'] });
    }

    let payload;
    try {
      const body = await readBoundedBody(request);
      if (body.tooLarge) {
        return finish(jsonResponse({ error:{ code:413, status:'PAYLOAD_TOO_LARGE', message:'This request is too large to process safely.', request_id:requestId } }, 413, responseHeaders), { rejectReasons:['PAYLOAD_TOO_LARGE'] });
      }
      payload = Object.prototype.hasOwnProperty.call(body, 'json') ? body.json : JSON.parse(body.text);
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
      const articleRuntime = quotaRuntime(env);
      if (articleRuntime.active) stampQuota(record, { quotaMode:articleRuntime.mode, quotaOutcome:'skipped' });
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
    if (!env || !env.GEMINI_API_KEY) return finish(jsonResponse({ error:{ code:500, status:'MISSING_API_KEY', message:'GEMINI_API_KEY is not configured', request_id:requestId } }, 500, responseHeaders));

    const quotaGate = await acquireQuota(env, request, caller, validation, record, requestId, responseHeaders);
    if (quotaGate.blocked) return finish(quotaGate.response);
    const quotaHold = quotaGate.hold;

    beforeUpstream(seamContext);
    try {
      const clientBudget = Number(request.headers && request.headers.get('X-Marg-Timeout-Ms'));
      const generated = await generateWithControlledRetry(validation.upstreamPayload, env.GEMINI_API_KEY, request.signal, clientBudget);
      record.upstreamCalls = generated.upstreamCalls || 1;
      record.usageMetadata = usageCounts(generated.usageMetadata);
      afterUpstream(seamContext, {
        usageMetadata:record.usageMetadata,
        upstreamCalls:record.upstreamCalls,
        ok:!!generated.ok,
        status:generated.status
      });
      await completeQuota(quotaHold, { ok:!!generated.ok, usageMetadata:record.usageMetadata }, record);
      responseHeaders['X-Marg-Upstream-Calls'] = String(generated.upstreamCalls || 1);
      responseHeaders['X-Marg-Model-Fallback'] = generated.modelFallbackUsed ? '1' : '0';
      if (!generated.ok) {
        console.error('Gemini upstream rejected request', {
          requestId,
          httpStatus:generated.status,
          code:generated.error && generated.error.status || '',
          upstreamCalls:generated.upstreamCalls || 1
        });
        if (generated.retryAfter) responseHeaders['Retry-After'] = generated.retryAfter;
        return finish(jsonResponse({
          error:Object.assign({}, generated.error, {
            message:generated.status === 429 ? 'Marg’s answer service is busy. Please wait briefly and retry.' : generated.status === 503 ? 'Marg’s answer service is temporarily unavailable.' : generated.status === 504 ? 'Marg’s answer service took too long on this request.' : 'Marg could not complete this request.',
            request_id:requestId,
            retryable:generated.retryable,
            attempts:generated.upstreamCalls
          })
        }, generated.status, responseHeaders));
      }
      if (validation.compatibilityMode) {
        const compatibilityGrounding = generated.json && generated.json.candidates && generated.json.candidates[0] && generated.json.candidates[0].groundingMetadata || null;
        responseHeaders['X-Marg-Web-Grounded'] = compatibilityGrounding ? '1' : '0';
        return finish(jsonResponse({
          content:[{ type:'text', text:generated.text }],
          stop_reason:generated.finishReason,
          usage_metadata:generated.usageMetadata,
          grounding_metadata:compatibilityGrounding,
          marg_request:{ request_id:requestId, upstream_calls:generated.upstreamCalls, truncated:generated.finishReason === 'MAX_TOKENS' }
        }, generated.status, responseHeaders));
      }
      const groundingMetadata = generated.json && generated.json.candidates && generated.json.candidates[0] && generated.json.candidates[0].groundingMetadata;
      responseHeaders['X-Marg-Web-Grounded'] = groundingMetadata ? '1' : '0';
      generated.json.margRequest = { requestId, upstreamCalls:generated.upstreamCalls, truncated:generated.finishReason === 'MAX_TOKENS' };
      return finish(new Response(JSON.stringify(generated.json), {
        status:generated.status,
        headers:Object.assign({ 'Content-Type':'application/json; charset=utf-8' }, CORS_HEADERS, responseHeaders)
      }));
    } catch (_error) {
      afterUpstream(seamContext, { usageMetadata:null, upstreamCalls:record.upstreamCalls || 0, ok:false, status:502 });
      await completeQuota(quotaHold, { ok:false, usageMetadata:null }, record);
      console.error('Gemini Worker upstream failure', { requestId });
      return finish(jsonResponse({
        error:{ code:502, status:'WORKER_UPSTREAM_FAILURE', message:'Marg could not reach its answer service.', request_id:requestId, retryable:true }
      }, 502, responseHeaders));
    }
  }
};
