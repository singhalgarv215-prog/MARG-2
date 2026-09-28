(function () {
  'use strict';

  var LABEL_MAP = {
    'The answer was incorrect':'incorrect_answer',
    'Marg ignored my question':'ignored_question',
    'Marg lost the conversation context':'lost_context',
    'The response felt generic':'generic_response',
    'The diagnosis had no evidence':'unsupported_diagnosis',
    'The next step was not useful':'bad_next_action',
    'Responses were too long or confusing':'too_long',
    'The tone felt wrong':'tone',
    'Something else':'other',
    'Report a response':'other'
  };

  function stableRef(text) {
    if (typeof simpleStableHash === 'function') return String(simpleStableHash(String(text || '')));
    var hash = 2166136261, value = String(text || '');
    for (var i = 0; i < value.length; i++) { hash ^= value.charCodeAt(i); hash = Math.imul(hash, 16777619); }
    return (hash >>> 0).toString(16);
  }

  function activeConversationId() {
    try {
      if (typeof margActiveThreadId !== 'undefined' && margActiveThreadId) return String(margActiveThreadId);
    } catch (e) {}
    return 'legacy-main-chat';
  }

  function nearestUserMessage(assistantText) {
    if (typeof conversationHistory === 'undefined' || !Array.isArray(conversationHistory)) return '';
    var assistantIndex = -1;
    for (var i = conversationHistory.length - 1; i >= 0; i--) {
      var item = conversationHistory[i];
      if (item && item.role === 'assistant' && (!assistantText || String(item.content || '').indexOf(String(assistantText).slice(0, 80)) !== -1)) { assistantIndex = i; break; }
    }
    for (var j = (assistantIndex >= 0 ? assistantIndex - 1 : conversationHistory.length - 1); j >= 0; j--) {
      if (conversationHistory[j] && conversationHistory[j].role === 'user') return String(conversationHistory[j].content || '').slice(0, 12000);
    }
    return '';
  }

  function textForResponseRef(reference) {
    var result = '';
    Array.prototype.some.call(document.querySelectorAll('#messages .msg-wrap.marg'), function (wrap) {
      var bubble = wrap.querySelector('.bubble');
      var text = bubble ? String(bubble.innerText || bubble.textContent || '').trim() : '';
      if (text && stableRef(text) === String(reference || '')) { result = text; return true; }
      return false;
    });
    return result;
  }

  function labelFromFeedback(value) {
    return LABEL_MAP[String(value || '').trim()] || 'other';
  }

  async function captureMargResponseReview(options) {
    options = options || {};
    if (typeof currentUser === 'undefined' || !currentUser || typeof SUPABASE_TOKEN === 'undefined' || !SUPABASE_TOKEN || typeof sbFetch !== 'function') return false;
    var assistantText = String(options.assistantText || '').trim();
    var reference = String(options.assistantMessageRef || stableRef(assistantText || options.reference || '')).slice(0, 180);
    if (!reference) return false;
    var consent = options.allowModelImprovement === true;
    var row = {
      user_id:currentUser.id,
      conversation_id:String(options.conversationId || activeConversationId()).slice(0, 180),
      assistant_message_ref:reference,
      source:options.source || 'not_helpful',
      failure_label:options.failureLabel || null,
      user_message:consent ? String(options.userMessage || nearestUserMessage(assistantText)).slice(0, 12000) || null : null,
      assistant_message:consent ? assistantText.slice(0, 24000) || null : null,
      user_correction:consent ? String(options.userCorrection || '').slice(0, 12000) || null : null,
      allow_model_improvement:consent,
      metadata:{ client:'web', release:'20260928-training1' }
    };
    try {
      var ownedFilter = 'user_id=eq.' + encodeURIComponent(currentUser.id)
        + '&conversation_id=eq.' + encodeURIComponent(row.conversation_id)
        + '&assistant_message_ref=eq.' + encodeURIComponent(reference)
        + '&source=eq.' + encodeURIComponent(row.source);
      var previous = await sbFetch('marg_response_reviews?select=id&' + ownedFilter + '&limit=1', 'GET');
      if (previous && previous.data && previous.data[0]) {
        var updated = await sbFetch('marg_response_reviews?id=eq.' + encodeURIComponent(previous.data[0].id) + '&user_id=eq.' + encodeURIComponent(currentUser.id), 'PATCH', row);
        return !!(updated && updated.ok);
      }
      var result = await sbFetch('marg_response_reviews', 'POST', row);
      return !!(result && result.ok);
    } catch (error) {
      console.warn('Marg response review was not synced:', error);
      return false;
    }
  }

  function parseResponseReference(text) {
    var match = String(text || '').match(/Response reference:\s*([^\s]+)/i);
    return match ? match[1] : '';
  }

  async function captureDetailedFeedback(selected, note, consent) {
    var reference = parseResponseReference(note);
    if (!reference) return false;
    var assistantText = textForResponseRef(reference);
    return captureMargResponseReview({
      source:'report',
      assistantMessageRef:reference,
      assistantText:assistantText,
      failureLabel:labelFromFeedback(selected),
      userCorrection:String(note || '').replace(/Response reference:[^\n]*\n?/i, '').trim(),
      allowModelImprovement:consent === true
    });
  }

  window.MARG_REVIEW_FAILURE_LABELS = Object.assign({}, LABEL_MAP);
  window.captureMargResponseReview = captureMargResponseReview;
  window.captureDetailedMargFeedback = captureDetailedFeedback;
})();
