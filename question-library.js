/* Persistent, user-scoped source context for photographed CAT questions.
 * This file intentionally contains no credentials and uses the authenticated
 * Supabase session already owned by marg-app.js. */
var QUESTION_IMAGE_BUCKET = 'question-images';
var QUESTION_IMAGE_MAX_COUNT = 500;
var QUESTION_IMAGE_MAX_BYTES = 1024 * 1024 * 1024;
var margQuestionLibraryCache = { images:[], questions:[], loadedAt:0, userId:'' };
var margActiveQuestionContext = null;
var margQuestionLibraryBusy = false;

function normaliseQuestionSection(value) {
  var section = String(value || '').trim().toLowerCase();
  if (section === 'rc' || section === 'verbal' || section === 'varc/rc') return 'varc';
  if (section === 'lrdi' || section === 'di' || section === 'lr') return 'dilr';
  if (section === 'quant' || section === 'quants') return 'qa';
  return ['qa','dilr','varc'].indexOf(section) >= 0 ? section : 'unknown';
}

function classifyQuestionContent(question) {
  var value = String(question && (question.stem || question.text) || question || '');
  var lower = value.toLowerCase();
  var passageSignals = (lower.match(/\b(?:passage|author|paragraph|tone|inference|central idea|primary purpose|according to the passage)\b/g) || []).length;
  var setSignals = (lower.match(/\b(?:arranged|seated|ranked|schedule|slots?|constraints?|conditions?|table|chart|distribution|persons?|participants?)\b/g) || []).length;
  var qaSignals = (lower.match(/(?:\d|\b(?:equation|ratio|percent|profit|loss|speed|distance|area|integer|algebra|geometry|probability|value of [xy]|find [xy])\b)/g) || []).length;
  if (passageSignals >= 2 || /according to (?:the|this) passage|author'?s (?:tone|view|purpose)/i.test(value)) return 'varc';
  if (setSignals >= 2 && /\b(?:which|how many|what|determine|find)\b/i.test(value)) return 'dilr';
  if (qaSignals >= 2 || /[=+×÷]|\b\d+(?:\.\d+)?%/.test(value)) return 'qa';
  return 'unknown';
}

function getRequestedAnswerDepth(message) {
  var text = String(message || '').trim();
  if (/\b(?:just|only)\s+(?:give|tell|show)?\s*(?:me\s+)?(?:the\s+)?answer\b|\banswer only\b|\bno explanation\b/i.test(text)) return 'answer_only';
  if (/\b(?:best possible|deep(?:ly)?|detailed|complete|step[- ]by[- ]step|explain|why|walk me through|full solution)\b/i.test(text)) return 'deep';
  return 'standard';
}

function parseQuestionReference(message) {
  var text = String(message || '').trim();
  var numberMatch = text.match(/\bq(?:uestion)?\s*[-:#.]?\s*(\d{1,3})\b/i);
  var ordinalMatch = text.match(/\b(first|second|third|fourth|fifth|last|next)\s+(?:one|question)\b/i);
  var bareNext = /^next[?.!\s]*$/i.test(text);
  var shortFollowup = /^(?:why|how|this(?: one)?|that(?: one)?|the above(?: question)?|give (?:me )?the answer|explain|solve this|next)[?.!\s]*$/i.test(text);
  var optionFollowup = /\boption\s+([A-H])\b/i.exec(text);
  var earlierLibraryReference = /\b(?:that|the|my|earlier|previous|uploaded|saved|yesterday(?:'s)?)\b[\s\S]{0,80}\b(?:images?|photos?|pictures?|pages?|questions?|sets?|passages?|scorecards?)\b|\b(?:images?|photos?|pictures?|pages?|questions?|sets?|passages?|scorecards?)\b[\s\S]{0,80}\b(?:yesterday|earlier|previously|uploaded|saved)\b/i.test(text);
  if (!numberMatch && !ordinalMatch && !shortFollowup && !optionFollowup && !earlierLibraryReference) return null;
  var sectionMatch = text.match(/\b(VARC|RC|DILR|LRDI|QA|quant|quants)\b/i);
  return {
    number:numberMatch ? numberMatch[1] : '',
    ordinal:ordinalMatch ? ordinalMatch[1].toLowerCase() : (bareNext ? 'next' : ''),
    option:optionFollowup ? optionFollowup[1].toUpperCase() : '',
    continuation:shortFollowup || !!optionFollowup,
    libraryQuery:earlierLibraryReference,
    section:sectionMatch ? normaliseQuestionSection(sectionMatch[1]) : '',
    yesterday:/\byesterday/i.test(text),
    depth:getRequestedAnswerDepth(text)
  };
}

function questionCandidateLabel(question) {
  var number = question && question.question_number ? 'Q' + question.question_number : 'Question ' + String(question && question.ordinal || '');
  var label = String(question && (question.short_label || question.topic) || '').trim();
  return label ? number + ' — ' + label : number;
}

function resolveQuestionCandidates(reference, questions, activeContext) {
  var list = Array.isArray(questions) ? questions.filter(Boolean) : [];
  if (!reference) return { status:'none', candidates:[] };
  if (reference.number) {
    var numbered = list.filter(function(item) { return String(item.question_number || '') === reference.number; });
    if (numbered.length === 1) return { status:'resolved', question:numbered[0], candidates:numbered };
    if (numbered.length > 1) return { status:'ambiguous', candidates:numbered };
    return { status:'missing', candidates:[] };
  }
  if (reference.ordinal && list.length) {
    var map = { first:0, second:1, third:2, fourth:3, fifth:4, last:list.length - 1 };
    var index = reference.ordinal === 'next'
      ? Math.min(list.length - 1, Math.max(0, list.findIndex(function(item) { return activeContext && item.id === activeContext.question_id; }) + 1))
      : map[reference.ordinal];
    return list[index] ? { status:'resolved', question:list[index], candidates:[list[index]] } : { status:'missing', candidates:[] };
  }
  if (reference.continuation) {
    var activeInList = activeContext && activeContext.question_id
      ? list.find(function(item) { return item && item.id === activeContext.question_id; })
      : null;
    if (activeInList) return { status:'resolved', question:activeInList, candidates:[activeInList] };
    // A newly attached source is stronger than the previous turn. Never let
    // "this" silently reopen an older question when the current upload shows
    // a different question (or several candidates).
    if (list.length === 1) return { status:'resolved', question:list[0], candidates:[list[0]] };
    if (list.length > 1) return { status:'ambiguous', candidates:list };
    if (activeContext && activeContext.question) {
      return { status:'resolved', question:activeContext.question, candidates:[activeContext.question] };
    }
  }
  return { status:'missing', candidates:[] };
}

function parseQuestionExtractionPayload(raw) {
  var text = String(raw || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  var first = text.indexOf('{'), last = text.lastIndexOf('}');
  if (first < 0 || last <= first) return null;
  try {
    var value = JSON.parse(text.slice(first, last + 1));
    if (!value || typeof value !== 'object' || !Array.isArray(value.pages) || !Array.isArray(value.questions)) return null;
    value.readable = value.readable !== false;
    value.questions = value.questions.slice(0, 80).map(function(item, index) {
      var question = item && typeof item === 'object' ? item : {};
      var section = normaliseQuestionSection(question.section);
      var contentSection = classifyQuestionContent(question);
      if (contentSection !== 'unknown') section = contentSection;
      return {
        page_index:Math.max(1, Math.min(4, Number(question.page_index) || 1)),
        question_number:String(question.question_number || '').replace(/^Q/i, '').trim().slice(0, 20),
        ordinal:Math.max(1, Number(question.ordinal) || index + 1),
        short_label:String(question.short_label || question.topic || 'Question').replace(/\s+/g, ' ').trim().slice(0, 120),
        stem:String(question.stem || '').trim().slice(0, 30000),
        options:Array.isArray(question.options) ? question.options.map(function(option) { return String(option || '').trim().slice(0, 3000); }).filter(Boolean).slice(0, 8) : [],
        section:section,
        topic:String(question.topic || '').trim().slice(0, 160),
        set_or_passage_key:String(question.set_or_passage_key || '').trim().slice(0, 120),
        confidence:Math.max(0, Math.min(1, Number(question.confidence) || 0))
      };
    }).filter(function(question) { return question.stem && question.confidence >= 0.35; });
    value.pages = value.pages.slice(0, 4).map(function(page, index) {
      return {
        page_index:Math.max(1, Math.min(4, Number(page && page.page_index) || index + 1)),
        text:String(page && page.text || '').trim().slice(0, 50000),
        section:normaliseQuestionSection(page && page.section),
        topic:String(page && page.topic || '').trim().slice(0, 160),
        confidence:Math.max(0, Math.min(1, Number(page && page.confidence) || 0))
      };
    });
    return value;
  } catch(error) { return null; }
}

function dataUrlBytes(base64Data) {
  return Math.floor(String(base64Data || '').length * 3 / 4);
}

function base64ToBlob(base64Data, mimeType) {
  var binary = atob(String(base64Data || ''));
  var chunks = [];
  for (var offset = 0; offset < binary.length; offset += 8192) {
    var slice = binary.slice(offset, offset + 8192);
    var bytes = new Uint8Array(slice.length);
    for (var index = 0; index < slice.length; index++) bytes[index] = slice.charCodeAt(index);
    chunks.push(bytes);
  }
  return new Blob(chunks, { type:mimeType || 'image/jpeg' });
}

function blobToPreparedAttachment(blob, name, metadata) {
  return new Promise(function(resolve, reject) {
    var reader = new FileReader();
    reader.onerror = function() { reject(new Error('Could not reopen the saved image.')); };
    reader.onload = function() {
      var value = String(reader.result || ''), comma = value.indexOf(',');
      resolve(Object.assign({
        name:name || 'saved-question',
        mimeType:blob.type || metadata && metadata.mime_type || 'image/jpeg',
        data:comma >= 0 ? value.slice(comma + 1) : '',
        previewUrl:value,
        status:'attached',
        libraryId:metadata && metadata.id || '',
        storagePath:metadata && metadata.storage_path || ''
      }, metadata || {}));
    };
    reader.readAsDataURL(blob);
  });
}

function questionImageExtension(mimeType) {
  return ({'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/heic':'heic','image/heif':'heif'})[String(mimeType || '').toLowerCase()] || 'jpg';
}

async function getQuestionLibraryUsage() {
  if (!currentUser || !SUPABASE_TOKEN) return { count:0, bytes:0 };
  var result = await sbFetch('question_images?select=id,byte_size&user_id=eq.' + encodeURIComponent(currentUser.id) + '&deleted_at=is.null&limit=' + (QUESTION_IMAGE_MAX_COUNT + 1), 'GET');
  if (result.error || !Array.isArray(result.data)) throw new Error('The image library is not ready yet.');
  return { count:result.data.length, bytes:result.data.reduce(function(sum, item) { return sum + Number(item.byte_size || 0); }, 0) };
}

async function persistPreparedQuestionImage(attachment, pageOrder) {
  if (!attachment || !attachment.data) throw new Error('The selected image is not ready.');
  if (!currentUser || !SUPABASE_TOKEN) {
    attachment.status = 'local_ready';
    attachment.statusMessage = 'Ready for this message';
    return attachment;
  }
  var usage = await getQuestionLibraryUsage();
  var byteSize = attachment.byteSize || dataUrlBytes(attachment.data);
  if (usage.count >= QUESTION_IMAGE_MAX_COUNT || usage.bytes + byteSize > QUESTION_IMAGE_MAX_BYTES) {
    throw new Error('Your Question Library limit has been reached. Delete an older image and retry.');
  }
  var imageId = crypto.randomUUID();
  var threadId = typeof margActiveThreadId !== 'undefined' ? margActiveThreadId : 'legacy';
  var extension = questionImageExtension(attachment.mimeType);
  var storagePath = currentUser.id + '/' + threadId + '/' + imageId + '/source.' + extension;
  var thumbnailPath = attachment.thumbnailData ? currentUser.id + '/' + threadId + '/' + imageId + '/thumbnail.jpg' : null;
  var blob = base64ToBlob(attachment.data, attachment.mimeType);
  var upload = await authenticatedSupabaseFetch(SUPABASE_URL + '/storage/v1/object/' + QUESTION_IMAGE_BUCKET + '/' + storagePath.split('/').map(encodeURIComponent).join('/'), {
    method:'POST',
    headers:{ 'Content-Type':attachment.mimeType, 'x-upsert':'false', 'cache-control':'3600' },
    body:blob,
    margTimeoutMs:30000
  });
  if (!upload.ok) throw new Error('Library upload failed (' + upload.status + ').');
  if (thumbnailPath) {
    var thumbnailUpload = await authenticatedSupabaseFetch(SUPABASE_URL + '/storage/v1/object/' + QUESTION_IMAGE_BUCKET + '/' + thumbnailPath.split('/').map(encodeURIComponent).join('/'), {
      method:'POST', headers:{ 'Content-Type':'image/jpeg', 'x-upsert':'false', 'cache-control':'3600' },
      body:base64ToBlob(attachment.thumbnailData, 'image/jpeg'), margTimeoutMs:20000
    });
    if (!thumbnailUpload.ok) thumbnailPath = null;
  }
  var row = {
    id:imageId, user_id:currentUser.id, conversation_id:threadId,
    storage_path:storagePath, thumbnail_path:thumbnailPath, original_filename:String(attachment.name || 'question-image').slice(0, 240),
    mime_type:attachment.mimeType, byte_size:byteSize,
    width:attachment.width || null, height:attachment.height || null,
    status:'uploaded', page_order:Math.max(1, Number(pageOrder) || 1)
  };
  var saved = await sbFetch('question_images', 'POST', row);
  if (!saved.ok) {
    await authenticatedSupabaseFetch(SUPABASE_URL + '/storage/v1/object/' + QUESTION_IMAGE_BUCKET + '/' + storagePath.split('/').map(encodeURIComponent).join('/'), { method:'DELETE' }).catch(function() {});
    if (thumbnailPath) await authenticatedSupabaseFetch(SUPABASE_URL + '/storage/v1/object/' + QUESTION_IMAGE_BUCKET + '/' + thumbnailPath.split('/').map(encodeURIComponent).join('/'), { method:'DELETE' }).catch(function() {});
    throw new Error('Image metadata could not be saved (' + saved.status + ').');
  }
  attachment.libraryId = imageId;
  attachment.storagePath = storagePath;
  attachment.thumbnailPath = thumbnailPath;
  attachment.status = 'attached';
  attachment.statusMessage = 'Attached and saved';
  margQuestionLibraryCache.loadedAt = 0;
  return attachment;
}

async function linkQuestionImagesToMessage(attachments, messageId) {
  if (!currentUser || !SUPABASE_TOKEN || !messageId) return false;
  var ids = (Array.isArray(attachments) ? attachments : []).map(function(item) { return item && item.libraryId; }).filter(Boolean);
  for (var index = 0; index < ids.length; index++) {
    await sbFetch('question_images?id=eq.' + encodeURIComponent(ids[index]) + '&user_id=eq.' + encodeURIComponent(currentUser.id), 'PATCH', { source_message_id:messageId });
  }
  return true;
}

async function retryQuestionImageUpload(index) {
  var attachment = pendingImageAttachments[index];
  if (!attachment || !attachment.data || attachment.status === 'preparing' || attachment.status === 'uploading') return false;
  attachment.status = 'uploading'; attachment.error = '';
  renderPendingImageAttachments();
  try { await persistPreparedQuestionImage(attachment, index + 1); }
  catch(error) { attachment.status = 'local_ready'; attachment.error = error && error.message || 'Library sync failed.'; }
  renderPendingImageAttachments(); updateComposerControls();
  return attachment.status === 'attached';
}

async function extractQuestionImageContext(attachments, userText) {
  var list = Array.isArray(attachments) ? attachments.filter(function(item) { return item && item.data; }) : [];
  if (!list.length) return { status:'none', extraction:null, questions:[] };
  list.forEach(function(item) { item.status = 'processing'; });
  if (typeof renderPendingImageAttachments === 'function') renderPendingImageAttachments();
  var prompt = 'Inspect every supplied page in order. Transcribe only genuinely legible content and index every visible CAT question. Return JSON only with this exact shape: {"readable":true,"summary":"one short source description","pages":[{"page_index":1,"text":"full legible text","section":"qa|dilr|varc|unknown","topic":"short topic","confidence":0.0}],"questions":[{"page_index":1,"question_number":"4","ordinal":1,"short_label":"6-12 word identifying label","stem":"complete question stem and all required givens","options":["A...","B..."],"section":"qa|dilr|varc|unknown","topic":"short topic","set_or_passage_key":"shared set/passsage id or empty","confidence":0.0}]}. Classify from content, never from earlier chat. QA is numerical/algebraic/geometry; DILR is a shared set with constraints, arrangements or data; VARC is a passage with verbal questions. If text needed to solve is unreadable, set readable=false and explain the exact unreadable area in summary. Do not solve. User caption: ' + String(userText || '').slice(0, 500);
  var extractionRequest = buildGeminiRequest(
    'You are a careful document indexer. Never invent obscured text, question numbers, options or section labels. JSON only.',
    buildHistoryWithImageAttachment([{ role:'user', content:prompt }], list, prompt),
    8192
  );
  var response = await fetchWithTimeout(WORKER_URL, { method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify(extractionRequest) }, 75000);
  var payload = await response.json();
  var extraction = parseQuestionExtractionPayload(getGeminiText(payload));
  if (!extraction) throw new Error('Marg could not build a reliable question index from this image.');
  if (!extraction.readable) return { status:'unreadable', extraction:extraction, questions:[] };
  var savedQuestions = [];
  for (var pageIndex = 0; pageIndex < list.length; pageIndex++) {
    var attachment = list[pageIndex];
    var page = extraction.pages.find(function(item) { return item.page_index === pageIndex + 1; }) || {};
    var questions = extraction.questions.filter(function(item) { return item.page_index === pageIndex + 1; });
    attachment.extraction = extraction;
    attachment.questions = questions;
    attachment.status = attachment.libraryId ? 'attached' : 'local_ready';
    if (!attachment.libraryId || !currentUser || !SUPABASE_TOKEN) {
      questions.forEach(function(question) {
        savedQuestions.push(Object.assign({}, question, { id:'local-' + pageIndex + '-' + question.ordinal, image_id:attachment.libraryId || 'local-' + pageIndex, conversation_id:typeof margActiveThreadId !== 'undefined' ? margActiveThreadId : 'legacy' }));
      });
      continue;
    }
    await sbFetch('question_images?id=eq.' + encodeURIComponent(attachment.libraryId), 'PATCH', {
      status:'ready', ocr_text:String(page.text || '').slice(0, 50000),
      detected_section:normaliseQuestionSection(page.section), detected_topic:String(page.topic || '').slice(0, 160),
      extraction_confidence:Number(page.confidence || 0)
    });
    await sbFetch('image_questions?image_id=eq.' + encodeURIComponent(attachment.libraryId), 'DELETE');
    if (questions.length) {
      var rows = questions.map(function(question) {
        return {
          id:crypto.randomUUID(), image_id:attachment.libraryId, user_id:currentUser.id,
          conversation_id:typeof margActiveThreadId !== 'undefined' ? margActiveThreadId : 'legacy',
          question_number:question.question_number || null, ordinal:question.ordinal,
          short_label:question.short_label, stem:question.stem, options:question.options,
          section:question.section, topic:question.topic || null,
          set_or_passage_key:question.set_or_passage_key || null,
          extraction_confidence:question.confidence
        };
      });
      var inserted = await authenticatedSupabaseFetch(SUPABASE_URL + '/rest/v1/image_questions', {
        method:'POST', headers:{ 'Content-Type':'application/json', 'Prefer':'return=representation' }, body:JSON.stringify(rows)
      });
      if (inserted.ok) savedQuestions = savedQuestions.concat(await inserted.json());
      else throw new Error('The extracted question index could not be saved.');
    }
  }
  margQuestionLibraryCache.loadedAt = 0;
  return { status:'ready', extraction:extraction, questions:savedQuestions.length ? savedQuestions : extraction.questions };
}

async function fetchQuestionLibraryData(force, conversationOnly) {
  if (!currentUser || !SUPABASE_TOKEN) return { images:[], questions:[] };
  var threadId = typeof margActiveThreadId !== 'undefined' ? margActiveThreadId : 'legacy';
  if (!force && margQuestionLibraryCache.userId === currentUser.id && Date.now() - margQuestionLibraryCache.loadedAt < 30000) {
    return conversationOnly ? {
      images:margQuestionLibraryCache.images.filter(function(item) { return item.conversation_id === threadId; }),
      questions:margQuestionLibraryCache.questions.filter(function(item) { return item.conversation_id === threadId; })
    } : margQuestionLibraryCache;
  }
  var imageResult = await sbFetch('question_images?select=*&user_id=eq.' + encodeURIComponent(currentUser.id) + '&deleted_at=is.null&order=created_at.desc&limit=' + QUESTION_IMAGE_MAX_COUNT, 'GET');
  var questionResult = await sbFetch('image_questions?select=*&user_id=eq.' + encodeURIComponent(currentUser.id) + '&order=created_at.asc&limit=4000', 'GET');
  if (imageResult.error || questionResult.error) throw new Error('Question Library is not available yet.');
  margQuestionLibraryCache = { images:imageResult.data || [], questions:questionResult.data || [], loadedAt:Date.now(), userId:currentUser.id };
  return conversationOnly ? {
    images:margQuestionLibraryCache.images.filter(function(item) { return item.conversation_id === threadId; }),
    questions:margQuestionLibraryCache.questions.filter(function(item) { return item.conversation_id === threadId; })
  } : margQuestionLibraryCache;
}

async function loadConversationQuestionState() {
  if (!currentUser || !SUPABASE_TOKEN) return margActiveQuestionContext;
  var threadId = typeof margActiveThreadId !== 'undefined' ? margActiveThreadId : 'legacy';
  var result = await sbFetch('conversation_question_state?select=*&user_id=eq.' + encodeURIComponent(currentUser.id) + '&conversation_id=eq.' + encodeURIComponent(threadId) + '&limit=1', 'GET');
  if (result.error || !result.data || !result.data[0]) { margActiveQuestionContext = null; return null; }
  var state = result.data[0];
  var data = await fetchQuestionLibraryData(false, true);
  var question = data.questions.find(function(item) { return item.id === state.active_question_id; }) || null;
  margActiveQuestionContext = question ? { question_id:question.id, image_id:question.image_id, question:question, conversation_id:threadId } : null;
  return margActiveQuestionContext;
}

async function saveConversationQuestionState(question) {
  if (!question) return;
  var threadId = typeof margActiveThreadId !== 'undefined' ? margActiveThreadId : 'legacy';
  margActiveQuestionContext = { question_id:question.id, image_id:question.image_id, question:question, conversation_id:threadId };
  if (!currentUser || !SUPABASE_TOKEN || /^local-/.test(String(question.id || ''))) return;
  await authenticatedSupabaseFetch(SUPABASE_URL + '/rest/v1/conversation_question_state?on_conflict=user_id,conversation_id', {
    method:'POST',
    headers:{ 'Content-Type':'application/json', 'Prefer':'resolution=merge-duplicates,return=minimal' },
    body:JSON.stringify({
      user_id:currentUser.id, conversation_id:threadId,
      active_image_id:question.image_id, active_question_id:question.id,
      recent_question_ids:[question.id], updated_at:new Date().toISOString()
    })
  });
}

async function downloadQuestionImage(image) {
  if (!image || !image.storage_path) throw new Error('The saved source image is unavailable.');
  var response = await authenticatedSupabaseFetch(SUPABASE_URL + '/storage/v1/object/authenticated/' + QUESTION_IMAGE_BUCKET + '/' + image.storage_path.split('/').map(encodeURIComponent).join('/'), { method:'GET', margTimeoutMs:30000 });
  if (!response.ok) throw new Error('The saved source image could not be reopened.');
  return blobToPreparedAttachment(await response.blob(), image.original_filename, image);
}

function buildQuestionContextDirective(question, reference) {
  var options = Array.isArray(question.options) && question.options.length ? '\nOPTIONS:\n' + question.options.join('\n') : '';
  var depth = reference && reference.depth || 'standard';
  var depthRule = depth === 'answer_only'
    ? 'The student requested only the answer. Return only the identity line and final answer.'
    : depth === 'deep'
      ? 'Give the best complete explanation: final answer, clean derivation, useful shortcut or trap, and for an MCQ explain why the other options fail.'
      : 'Give the answer first, then a clear derivation and one useful CAT shortcut or trap. For an MCQ, explain briefly why each wrong option fails.';
  return '\n\nVERIFIED ACTIVE QUESTION CONTEXT:\nIdentity: ' + questionCandidateLabel(question) +
    '\nSection: ' + normaliseQuestionSection(question.section).toUpperCase() +
    '\nStem: ' + question.stem + options +
    '\nAnswer this exact question only. Begin with “' + questionCandidateLabel(question) + ':”. Do not substitute another question with the same number. ' + depthRule;
}

function buildImageConfirmation(extraction) {
  if (!extraction) return '';
  if (!Array.isArray(extraction.questions) || !extraction.questions.length) return extraction.summary ? 'I can see ' + String(extraction.summary).replace(/[.!]+$/, '') + '.' : 'I received and read the image.';
  var labels = extraction.questions.slice(0, 8).map(questionCandidateLabel);
  return 'I can see ' + extraction.questions.length + ' question' + (extraction.questions.length === 1 ? '' : 's') + ': ' + labels.join('; ') + '.';
}

async function prepareQuestionContextForTurn(message, currentAttachments) {
  var attachments = Array.isArray(currentAttachments) ? currentAttachments.filter(function(item) { return item && item.data; }) : [];
  var reference = parseQuestionReference(message);
  if (attachments.length) {
    var extracted;
    try { extracted = await extractQuestionImageContext(attachments, message); }
    catch(error) {
      attachments.forEach(function(item) { item.status = item.libraryId ? 'attached' : 'local_ready'; item.error = error && error.message || 'Question indexing failed.'; });
      return { blocked:true, reply:'I received the image, but I could not read and index it reliably. Please retry or send a closer crop containing the complete question and all options; I won’t guess what it says.', attachments:attachments };
    }
    if (extracted.status === 'unreadable') {
      return { blocked:true, reply:'I received the image, but this part is not readable enough to solve safely: ' + String(extracted.extraction.summary || 'the complete question or options') + '. Please send a closer crop.', attachments:attachments };
    }
    var questions = extracted.questions.length ? extracted.questions : extracted.extraction.questions;
    var resolution = reference ? resolveQuestionCandidates(reference, questions, margActiveQuestionContext) : { status:questions.length === 1 ? 'resolved' : 'none', question:questions.length === 1 ? questions[0] : null };
    if (resolution.status === 'ambiguous') {
      return { blocked:true, reply:'I found more than one match: ' + resolution.candidates.map(questionCandidateLabel).join('; ') + '. Which one do you mean?', attachments:attachments };
    }
    if (reference && resolution.status === 'missing') {
      return { blocked:true, reply:'I can read this upload, but I cannot find ' + (reference.number ? 'Q' + reference.number : 'that question') + ' in it. I can see: ' + questions.map(questionCandidateLabel).join('; ') + '.', attachments:attachments };
    }
    if (resolution.question) await saveConversationQuestionState(resolution.question);
    return {
      blocked:false, attachments:attachments, reference:reference,
      question:resolution.question || null,
      directive:resolution.question ? buildQuestionContextDirective(resolution.question, reference) : '',
      confirmation:buildImageConfirmation(extracted.extraction), extraction:extracted.extraction
    };
  }
  if (!reference) return { blocked:false, attachments:[], directive:'' };
  var threadData;
  try { threadData = await fetchQuestionLibraryData(false, true); }
  catch(error) { threadData = { images:[], questions:[] }; }
  if (!margActiveQuestionContext) await loadConversationQuestionState().catch(function() {});
  var resolved = resolveQuestionCandidates(reference, threadData.questions, margActiveQuestionContext);
  if (reference.libraryQuery && resolved.status !== 'resolved') {
    var allData;
    try { allData = await fetchQuestionLibraryData(false, false); }
    catch(error) { allData = { images:[], questions:[] }; }
    var imageCandidates = allData.images.filter(function(image) {
      if (reference.section && normaliseQuestionSection(image.detected_section) !== reference.section) return false;
      if (reference.yesterday) {
        var yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
        var created = new Date(image.created_at);
        if (created.toDateString() !== yesterday.toDateString()) return false;
      }
      return true;
    });
    if (imageCandidates.length === 1) {
      var imageQuestions = allData.questions.filter(function(question) { return question.image_id === imageCandidates[0].id; });
      var picked = reference.number ? imageQuestions.find(function(question) { return String(question.question_number || '') === reference.number; }) : imageQuestions[0];
      if (picked) { resolved = { status:'resolved', question:picked }; threadData = allData; }
    } else if (imageCandidates.length > 1) {
      var candidateLabels = imageCandidates.slice(0, 4).map(function(image) {
        var firstQuestion = allData.questions.find(function(question) { return question.image_id === image.id; });
        return firstQuestion ? questionCandidateLabel(firstQuestion) : String(image.detected_topic || 'saved ' + String(image.detected_section || 'question').toUpperCase() + ' page');
      });
      return { blocked:true, reply:'I found multiple saved sources that fit: ' + candidateLabels.join('; ') + '. Which one should I reopen?' };
    }
  }
  if (resolved.status === 'ambiguous') {
    return { blocked:true, reply:'I found multiple matches: ' + resolved.candidates.map(questionCandidateLabel).join('; ') + '. Which one do you mean?' };
  }
  if (resolved.status !== 'resolved' || !resolved.question) {
    return { blocked:true, reply:'I can help, but I cannot reliably access the source for ' + (reference.number ? 'Q' + reference.number : 'that question') + ' in this conversation. Please re-upload the relevant page; I won’t reconstruct it from memory.' };
  }
  var image = threadData.images.find(function(item) { return item.id === resolved.question.image_id; });
  if (!image) return { blocked:true, reply:'I found the question index, but its source image is unavailable. Please re-upload that page.' };
  try {
    var reopened = await downloadQuestionImage(image);
    await saveConversationQuestionState(resolved.question);
    return { blocked:false, attachments:[reopened], reference:reference, question:resolved.question, directive:buildQuestionContextDirective(resolved.question, reference), confirmation:'' };
  } catch(error) {
    return { blocked:true, reply:'I found ' + questionCandidateLabel(resolved.question) + ', but I could not reopen its source image. Please re-upload that page so I can answer without guessing.' };
  }
}

async function verifyQuestionResponseDraft(draft, userMessage, attachments, resolution) {
  if (!resolution || !resolution.question || !String(draft || '').trim()) return String(draft || '');
  var question = resolution.question;
  var verifierPrompt = 'Independently solve the exact question below and audit the draft line by line. Check every equation, intermediate calculation, option, and final result. Never approve a claim that a book or official key is wrong unless the complete visible stem proves it. Return JSON only: {"valid":true,"verified_section":"qa|dilr|varc|unknown","verified_question_number":"","issues":[],"corrected_answer":""}. If any step or conclusion is wrong, valid=false and corrected_answer must contain a complete clean replacement answer at the depth requested by the user. If the source is insufficient, valid=false and corrected_answer must ask for the missing crop rather than guess.\n\nQUESTION: ' + question.stem + '\nOPTIONS: ' + JSON.stringify(question.options || []) + '\nUSER REQUEST: ' + userMessage + '\nDRAFT: ' + draft;
  try {
    var requestHistory = [{ role:'user', content:verifierPrompt }];
    if (attachments && attachments.length) requestHistory = buildHistoryWithImageAttachment(requestHistory, attachments, verifierPrompt);
    var request = buildGeminiRequest('You are an independent CAT solution verifier. Recompute; do not trust the draft. JSON only.', requestHistory, 8192);
    var response = await fetchWithTimeout(WORKER_URL, { method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify(request) }, 75000);
    var payload = await response.json();
    var raw = String(getGeminiText(payload) || '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    var first = raw.indexOf('{'), last = raw.lastIndexOf('}');
    if (first < 0 || last <= first) return String(draft || '');
    var audit = JSON.parse(raw.slice(first, last + 1));
    if (audit.valid === true) return String(draft || '');
    var corrected = String(audit.corrected_answer || '').trim();
    return corrected || 'I could not independently verify this result from the available source, so I won’t present it as correct. Please send a closer crop of the complete question and options.';
  } catch(error) {
    return String(draft || '');
  }
}

function finaliseQuestionResponse(text, resolution) {
  var value = String(text || '').trim();
  if (!resolution) return value;
  if (resolution.question) {
    var identity = questionCandidateLabel(resolution.question) + ':';
    if (!new RegExp('^' + identity.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(value)) value = identity + ' ' + value;
  }
  if (resolution.confirmation && value.indexOf(resolution.confirmation) !== 0) value = resolution.confirmation + '\n\n' + value;
  return value;
}

async function getSignedQuestionImageUrl(path) {
  var response = await authenticatedSupabaseFetch(SUPABASE_URL + '/storage/v1/object/sign/' + QUESTION_IMAGE_BUCKET + '/' + String(path || '').split('/').map(encodeURIComponent).join('/'), {
    method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify({ expiresIn:300 })
  });
  if (!response.ok) return '';
  var data = await response.json();
  var signedPath = data.signedURL || data.signedUrl || data.signed_url || '';
  if (!signedPath) return '';
  return /^https?:/i.test(signedPath) ? signedPath : SUPABASE_URL + '/storage/v1' + (signedPath.charAt(0) === '/' ? signedPath : '/' + signedPath);
}

async function openQuestionLibrary() {
  if (!currentUser || !SUPABASE_TOKEN) { showComposerStatus('Sign in to use your Question Library.', 'info'); return false; }
  closeAppMenu();
  var backdrop = document.getElementById('question-library-backdrop');
  var grid = document.getElementById('question-library-grid');
  if (backdrop) backdrop.classList.add('open');
  if (grid) grid.innerHTML = '<div class="question-library-empty">Loading your saved question images…</div>';
  try {
    var data = await fetchQuestionLibraryData(true, false);
    if (!grid) return true;
    if (!data.images.length) { grid.innerHTML = '<div class="question-library-empty">Images you attach to CAT questions will appear here.</div>'; return true; }
    var cards = await Promise.all(data.images.map(async function(image) {
      var questions = data.questions.filter(function(question) { return question.image_id === image.id; });
      var url = await getSignedQuestionImageUrl(image.thumbnail_path || image.storage_path);
      var labels = questions.slice(0, 4).map(questionCandidateLabel).join(', ');
      return '<article class="question-library-card" data-image-id="' + escapeChatHtml(image.id) + '">' +
        (url ? '<img src="' + escapeChatHtml(url) + '" alt="Saved CAT question page">' : '<div class="question-library-placeholder">Image</div>') +
        '<div class="question-library-copy"><strong>' + escapeChatHtml(labels || image.detected_topic || 'Saved question page') + '</strong>' +
        '<span>' + escapeChatHtml(String(image.detected_section || 'unknown').toUpperCase()) + ' · ' + escapeChatHtml(new Date(image.created_at).toLocaleDateString('en-IN')) + '</span></div>' +
        '<div class="question-library-actions"><button type="button" onclick="openLibraryImageInChat(\'' + escapeChatHtml(image.id) + '\')">Open in chat</button>' +
        '<button type="button" class="danger" onclick="deleteQuestionLibraryImage(\'' + escapeChatHtml(image.id) + '\')">Delete</button></div></article>';
    }));
    grid.innerHTML = cards.join('');
  } catch(error) {
    if (grid) grid.innerHTML = '<div class="question-library-empty">The library could not load. Apply the Question Library migration, then retry.</div>';
  }
  return true;
}

function closeQuestionLibrary() {
  var backdrop = document.getElementById('question-library-backdrop');
  if (backdrop) backdrop.classList.remove('open');
}

async function openLibraryImageInChat(imageId) {
  var data = await fetchQuestionLibraryData(false, false);
  var image = data.images.find(function(item) { return item.id === imageId; });
  if (!image) return false;
  try {
    var attachment = await downloadQuestionImage(image);
    attachment.status = 'attached';
    pendingImageAttachments = [attachment];
    renderPendingImageAttachments();
    closeQuestionLibrary();
    switchTab('chat');
    showComposerStatus('Saved image attached. Ask for a question by number, or describe what you want checked.', 'success', true);
    focusComposer({ userInitiated:true });
    return true;
  } catch(error) {
    showComposerStatus(error && error.message || 'The saved image could not be opened.', 'error', true);
    return false;
  }
}

async function deleteQuestionLibraryImage(imageId) {
  if (!currentUser || !SUPABASE_TOKEN || !window.confirm('Delete this saved question image and its extracted questions?')) return false;
  var data = await fetchQuestionLibraryData(false, false);
  var image = data.images.find(function(item) { return item.id === imageId; });
  if (!image) return false;
  var deleted = await authenticatedSupabaseFetch(SUPABASE_URL + '/storage/v1/object/' + QUESTION_IMAGE_BUCKET + '/' + image.storage_path.split('/').map(encodeURIComponent).join('/'), { method:'DELETE' });
  if (!deleted.ok && deleted.status !== 404) { showComposerStatus('The image could not be deleted. Try again.', 'error', true); return false; }
  if (image.thumbnail_path) await authenticatedSupabaseFetch(SUPABASE_URL + '/storage/v1/object/' + QUESTION_IMAGE_BUCKET + '/' + image.thumbnail_path.split('/').map(encodeURIComponent).join('/'), { method:'DELETE' }).catch(function() {});
  var rowDelete = await sbFetch('question_images?id=eq.' + encodeURIComponent(imageId) + '&user_id=eq.' + encodeURIComponent(currentUser.id), 'DELETE');
  if (!rowDelete.ok) { showComposerStatus('The image file was removed, but its library card needs another delete attempt.', 'error', true); return false; }
  if (margActiveQuestionContext && margActiveQuestionContext.image_id === imageId) margActiveQuestionContext = null;
  margQuestionLibraryCache.loadedAt = 0;
  await openQuestionLibrary();
  showComposerStatus('Question image deleted.', 'info');
  return true;
}

async function deleteQuestionImagesForConversation(conversationId) {
  if (!currentUser || !SUPABASE_TOKEN || !conversationId) return true;
  var result = await sbFetch('question_images?select=id,storage_path,thumbnail_path&user_id=eq.' + encodeURIComponent(currentUser.id) + '&conversation_id=eq.' + encodeURIComponent(conversationId) + '&deleted_at=is.null&limit=500', 'GET');
  if (result.error === 404) return true;
  if (result.error) throw new Error('Could not read the chat image library before deletion.');
  for (var index = 0; index < result.data.length; index++) {
    var image = result.data[index];
    var response = await authenticatedSupabaseFetch(SUPABASE_URL + '/storage/v1/object/' + QUESTION_IMAGE_BUCKET + '/' + image.storage_path.split('/').map(encodeURIComponent).join('/'), { method:'DELETE' });
    if (!response.ok && response.status !== 404) throw new Error('A saved chat image could not be deleted.');
    if (image.thumbnail_path) await authenticatedSupabaseFetch(SUPABASE_URL + '/storage/v1/object/' + QUESTION_IMAGE_BUCKET + '/' + image.thumbnail_path.split('/').map(encodeURIComponent).join('/'), { method:'DELETE' }).catch(function() {});
  }
  var deleted = await sbFetch('question_images?user_id=eq.' + encodeURIComponent(currentUser.id) + '&conversation_id=eq.' + encodeURIComponent(conversationId), 'DELETE');
  if (!deleted.ok) throw new Error('Saved question metadata could not be deleted.');
  margQuestionLibraryCache.loadedAt = 0;
  return true;
}

function handleQuestionLibraryBackdrop(event) {
  if (event && event.target && event.target.id === 'question-library-backdrop') closeQuestionLibrary();
}
