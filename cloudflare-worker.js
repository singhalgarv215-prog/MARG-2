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
  if (!/^Bearer\s+\S+/i.test(authorization)) return null;
  try {
    const response = await fetchWithWorkerTimeout(SUPABASE_URL + '/auth/v1/user', {
      headers:{ apikey:SUPABASE_PUBLISHABLE_KEY, Authorization:authorization },
      cache:'no-store'
    }, 7000);
    if (!response.ok) return null;
    const user = await response.json();
    return user && user.id ? user : null;
  } catch (_error) {
    return null;
  }
}

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
  technology:{ url:'https://www.thehindu.com/sci-tech/technology/feeder/default.rss', source:'The Hindu' },
  philosophy:{ url:'https://aeon.co/feed.rss', source:'Aeon' }
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
    return topic === 'philosophy' ? host === 'aeon.co' || host.endsWith('.aeon.co') : host === 'thehindu.com' || host.endsWith('.thehindu.com');
  } catch (_error) { return false; }
}

async function getDailyArticleSource(topic, offset) {
  const selectedTopic = Object.hasOwn(DAILY_ARTICLE_FEEDS, topic) ? topic : 'economy';
  const feed = DAILY_ARTICLE_FEEDS[selectedTopic];
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

function resolveMaxOutputTokens(payload, contents, requestedTokens) {
  const requested = Number(requestedTokens) || 0;
  const text = requestText(payload, contents);
  const systemText = systemRequestText(payload);
  const compactDecisionLab = systemText.includes('[marg_task: compact_decision_lab]');
  let floor = MIN_OUTPUT_TOKENS;
  if (contentsContainImages(contents)) floor = VISION_OUTPUT_TOKENS;
  if (/\b(?:complete roadmap|study plan|mock analysis|answer review|multi-step|full solution)\b/.test(text)) floor = Math.max(floor, LONG_OUTPUT_TOKENS);
  if (!compactDecisionLab && ((payload && hasJsonResponseFormat(payload.generationConfig)) ||
      /\b(?:return only valid json|generate only valid json)\b/.test(systemText) ||
      /\b(?:return only valid json|generate only valid json|question generator|sectional test|cat-style rc|cat style rc|dilr set|qa set|practice set|passage generation)\b/.test(text))) {
    floor = Math.max(floor, GENERATION_OUTPUT_TOKENS);
  }
  return Math.min(MAX_OUTPUT_TOKENS, Math.max(floor, requested));
}

function normalizeRequest(payload) {
  if (payload && Array.isArray(payload.contents)) {
    const wantsWebGrounding = payload.margWebGrounding === true;
    const nativePayload = Object.assign({}, payload, {
      contents:normalizeMessages(payload.contents),
      generationConfig:normalizeGenerationConfig(payload.generationConfig)
    });
    delete nativePayload.margWebGrounding;
    if (wantsWebGrounding && !hasJsonResponseFormat(nativePayload.generationConfig)) {
      const existingTools = Array.isArray(nativePayload.tools) ? nativePayload.tools.slice() : [];
      if (!existingTools.some((tool) => tool && (tool.google_search || tool.googleSearch))) existingTools.push({ google_search:{} });
      nativePayload.tools = existingTools;
    }
    nativePayload.generationConfig.maxOutputTokens = resolveMaxOutputTokens(
      nativePayload,
      nativePayload.contents,
      nativePayload.generationConfig.maxOutputTokens
    );
    if (systemRequestText(nativePayload).includes('[marg_task: compact_decision_lab]') && nativePayload.systemInstruction && Array.isArray(nativePayload.systemInstruction.parts)) {
      nativePayload.systemInstruction = {
        parts:nativePayload.systemInstruction.parts.map((part) => part && typeof part.text === 'string'
          ? Object.assign({}, part, { text:part.text.replace(/\s*\[MARG_TASK:\s*COMPACT_DECISION_LAB\]\s*/ig, '\n') })
          : part)
      };
    }
    return { payload:nativePayload, compatibilityMode:false };
  }
  if (!payload || !Array.isArray(payload.messages)) return { payload:null, compatibilityMode:false };
  const contents = normalizeMessages(payload.messages);
  const requestedOutputTokens = resolveMaxOutputTokens(payload, contents, payload.max_tokens);
  const geminiPayload = {
    contents,
    generationConfig:{
      maxOutputTokens:requestedOutputTokens,
      thinkingConfig:{ thinkingLevel:requestedOutputTokens > 4096 ? 'medium' : 'minimal' }
    }
  };
  if (payload.margWebGrounding === true || payload.web_search === true) geminiPayload.tools = [{ google_search:{} }];
  if (/\b(?:return|generate)\s+only\s+valid\s+json\b/i.test(String(payload.system || ''))) {
    geminiPayload.generationConfig.responseMimeType = 'application/json';
  }
  if (payload.system) geminiPayload.systemInstruction = { parts:[{ text:String(payload.system) }] };
  return { payload:geminiPayload, compatibilityMode:true };
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
    if (request.method !== 'POST') return jsonResponse({ error:{ code:405, status:'METHOD_NOT_ALLOWED', message:'Method not allowed', request_id:requestId } }, 405, responseHeaders);

    const contentLength = Number(request.headers && request.headers.get ? request.headers.get('Content-Length') || 0 : 0);
    if (contentLength > MAX_REQUEST_BYTES) return jsonResponse({ error:{ code:413, status:'PAYLOAD_TOO_LARGE', message:'This request is too large to process safely.', request_id:requestId } }, 413, responseHeaders);

    let payload;
    try {
      if (typeof request.text === 'function') {
        const rawBody = await request.text();
        const bodyBytes = typeof TextEncoder === 'function'
          ? new TextEncoder().encode(rawBody).byteLength
          : typeof Blob === 'function' ? new Blob([rawBody]).size : rawBody.length;
        if (bodyBytes > MAX_REQUEST_BYTES) {
          return jsonResponse({ error:{ code:413, status:'PAYLOAD_TOO_LARGE', message:'This request is too large to process safely.', request_id:requestId } }, 413, responseHeaders);
        }
        payload = JSON.parse(rawBody);
      } else payload = await request.json();
    } catch (error) {
      return jsonResponse({ error:{ code:400, status:'INVALID_JSON', message:'Request body must be valid JSON', request_id:requestId } }, 400, responseHeaders);
    }

    const authenticatedUser = await authenticateMargUser(request);
    const hasHeaderApi = !!(request.headers && typeof request.headers.get === 'function');
    const clientId = String(hasHeaderApi ? request.headers.get('X-Marg-Client-Id') || '' : 'worker-unit-request').replace(/[^a-zA-Z0-9._:-]/g, '').slice(0, 120);
    const cfAddress = String(hasHeaderApi ? request.headers.get('CF-Connecting-IP') || 'unknown' : 'unit-test');
    const rateKey = authenticatedUser && authenticatedUser.id ? 'user:' + authenticatedUser.id : clientId ? 'guest:' + clientId : 'guest-ip:' + cfAddress;
    const userAllowed = await workerRateAllowed(env, rateKey, 'MARG_RATE_LIMITER', authenticatedUser ? 60 : 20);
    const ipAllowed = await workerRateAllowed(env, 'ip:' + cfAddress, 'MARG_IP_LIMITER', 120);
    if (!userAllowed || !ipAllowed) {
      return jsonResponse({ error:{ code:429, status:'RATE_LIMITED', message:'Marg is receiving too many requests from this session. Wait a minute and continue.', request_id:requestId, retryable:true } }, 429, Object.assign({ 'Retry-After':'60' }, responseHeaders));
    }
    if (!authenticatedUser && !clientId) {
      return jsonResponse({ error:{ code:401, status:'CLIENT_ID_REQUIRED', message:'Open Marg in the app and try again.', request_id:requestId } }, 401, responseHeaders);
    }

    // Daily VARC source retrieval is deterministic and server-side. It avoids
    // browser CORS/rate-limit failures from the old rss2json dependency and
    // returns the exact publisher URL plus the best available article body.
    if (payload && payload.margAction === 'daily_article') {
      try {
        const article = await getDailyArticleSource(String(payload.topic || 'economy'), payload.offset);
        return jsonResponse({ article, marg_request:{ request_id:requestId } }, 200, responseHeaders);
      } catch (error) {
        console.error('Daily article retrieval failed', { requestId, topic:String(payload.topic || ''), message:String(error && error.message || error || '') });
        return jsonResponse({
          error:{ code:502, status:'ARTICLE_SOURCE_FAILURE', message:'The publisher article could not be retrieved just now.', request_id:requestId, retryable:true }
        }, 502, responseHeaders);
      }
    }

    if (!env.GEMINI_API_KEY) return jsonResponse({ error:{ code:500, status:'MISSING_API_KEY', message:'GEMINI_API_KEY is not configured', request_id:requestId } }, 500, responseHeaders);

    const normalized = normalizeRequest(payload);
    if (!normalized.payload || !Array.isArray(normalized.payload.contents) || normalized.payload.contents.length === 0) {
      return jsonResponse({ error:{ code:400, status:'MISSING_CONTENTS', message:'Gemini contents are required', request_id:requestId } }, 400, responseHeaders);
    }

    try {
      const clientBudget = Number(request.headers && request.headers.get('X-Marg-Timeout-Ms'));
      const generated = await generateWithControlledRetry(normalized.payload, env.GEMINI_API_KEY, request.signal, clientBudget);
      responseHeaders['X-Marg-Upstream-Calls'] = String(generated.upstreamCalls || 1);
      responseHeaders['X-Marg-Model-Fallback'] = generated.modelFallbackUsed ? '1' : '0';
      if (!generated.ok) {
        console.error('Gemini upstream rejected request', {
          requestId,
          httpStatus:generated.status,
          code:generated.error && generated.error.status || '',
          message:generated.error && generated.error.message || '',
          upstreamCalls:generated.upstreamCalls || 1
        });
        if (generated.retryAfter) responseHeaders['Retry-After'] = generated.retryAfter;
        return jsonResponse({
          error:Object.assign({}, generated.error, {
            message:generated.status === 429 ? 'Marg’s answer service is busy. Please wait briefly and retry.' : generated.status === 503 ? 'Marg’s answer service is temporarily unavailable.' : generated.status === 504 ? 'Marg’s answer service took too long on this request.' : 'Marg could not complete this request.',
            request_id:requestId,
            retryable:generated.retryable,
            attempts:generated.upstreamCalls
          })
        }, generated.status, responseHeaders);
      }
      if (normalized.compatibilityMode) {
        const compatibilityGrounding = generated.json && generated.json.candidates && generated.json.candidates[0] && generated.json.candidates[0].groundingMetadata || null;
        responseHeaders['X-Marg-Web-Grounded'] = compatibilityGrounding ? '1' : '0';
        return jsonResponse({
          content:[{ type:'text', text:generated.text }],
          stop_reason:generated.finishReason,
          usage_metadata:generated.usageMetadata,
          grounding_metadata:compatibilityGrounding,
          marg_request:{ request_id:requestId, upstream_calls:generated.upstreamCalls, truncated:generated.finishReason === 'MAX_TOKENS' }
        }, generated.status, responseHeaders);
      }
      const groundingMetadata = generated.json && generated.json.candidates && generated.json.candidates[0] && generated.json.candidates[0].groundingMetadata;
      responseHeaders['X-Marg-Web-Grounded'] = groundingMetadata ? '1' : '0';
      generated.json.margRequest = { requestId, upstreamCalls:generated.upstreamCalls, truncated:generated.finishReason === 'MAX_TOKENS' };
      return new Response(JSON.stringify(generated.json), {
        status:generated.status,
        headers:Object.assign({ 'Content-Type':'application/json; charset=utf-8' }, CORS_HEADERS, responseHeaders)
      });
    } catch (error) {
      console.error('Gemini Worker upstream failure', { requestId, message:String(error && error.message || error || '') });
      return jsonResponse({
        error:{ code:502, status:'WORKER_UPSTREAM_FAILURE', message:'Marg could not reach its answer service.', request_id:requestId, retryable:true }
      }, 502, responseHeaders);
    }
  }
};
