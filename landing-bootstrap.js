(function() {
  'use strict';

  var SUPABASE_URL = 'https://kduqtrumhveteyjkyltf.supabase.co';
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYXNlIiwicmVmIjoia2R1cXRydW1odmV0ZXlqa3lsdGYiLCJyb2xlIjoiYW5vbiIsImlhdCI6MTc3OTE2NzQzMywiZXhwIjoyMDk0NzQzNDMzfQ.iUmZLf_GaeTyv2xD0VYY7sYEiTgavQVbITmc-KC6ZPo';
  var APP_BUNDLE_URL = '/marg-app.js?v=20260818-3';
  var HOMEPAGE_INTENT_STORAGE_KEY = 'marg_pending_homepage_intent_v1';
  var DEEP_LINK_QUESTION_STORAGE_KEY = 'marg_pending_deep_link_question_v1';
  var VISITOR_STORAGE_KEY = 'marg_acquisition_visitor_v1';
  var CHALLENGE_VISITOR_STORAGE_KEY = 'marg_challenge_visitor_v1';
  var PENDING_REFERRAL_STORAGE_KEY = 'marg_pending_referral_v1';
  var INTENT_MAX_AGE_MS = 86400000;
  var pageViewId = makeId('page-view');
  var appLoadPromise = null;
  var selectedProblemKey = '';
  var publicChallenge = null;
  var publicChallengeAnswered = false;

  var PATTERNS = {
    rc_options:{
      intent:'In RC, I understand the passage but get stuck between the final two options.',
      context:'An author says wider roads may invite more driving. Road expansion can still help, but traffic speed alone may hide whether people can reach work, school and services.',
      question:'Which conclusion is best supported?',
      options:[
        { id:'extreme', label:'New roads always make congestion worse.' },
        { id:'evidence', label:'Traffic speed alone is an incomplete measure of success.' },
        { id:'invented', label:'Cities should replace roads with public transport.' },
        { id:'cause', label:'Congestion exists only because planners use the wrong metric.' }
      ],
      results:{
        evidence:{ code:'scope_control', title:'You stayed inside the author\'s scope.', body:'That is the strongest reading here. One choice cannot prove RC is fine, but it suggests we should test you with genuinely close options, not reteach comprehension.' },
        invented:{ code:'invented_next_step', title:'You completed the author\'s argument for them.', body:'The author questioned one measure; they never prescribed public transport. This is the exact over-interpretation that makes a tempting final option feel correct.' },
        extreme:{ code:'extreme_language', title:'You turned a qualified claim into an absolute one.', body:'The passage explicitly leaves room for road expansion to help. Words like “always” erased that qualification.' },
        cause:{ code:'causal_overreach', title:'You promoted one criticism into the only cause.', body:'The author questioned how success is measured; they did not claim that the metric itself causes all congestion.' }
      }
    },
    dilr_start:{
      intent:'In DILR, I often do not know how to start a set.',
      context:'Set A is familiar seating: nine conditional clues, no fixed slot. Set B is an unfamiliar table: fixed row totals and two constraints that immediately interact. After two minutes on A, you still have no forced placement.',
      question:'What is the best next move?',
      options:[
        { id:'sunk_cost', label:'Stay with A because two minutes are already invested.' },
        { id:'entry', label:'Switch to B and build the table from the fixed totals.' },
        { id:'reread', label:'Read A again without changing the representation.' },
        { id:'surface', label:'Choose whichever set has fewer words.' }
      ],
      results:{
        entry:{ code:'entry_point_selection', title:'You selected structure over familiarity.', body:'That is the useful DILR instinct: begin where constraints can produce deductions. A full set will tell us whether you act on this under pressure.' },
        sunk_cost:{ code:'commitment_escalation', title:'Your entry problem may actually be a leaving problem.', body:'Once time is invested, you treat leaving as waste—even when the set has produced nothing. That commitment can consume the section.' },
        reread:{ code:'representation_delay', title:'You are trying to read your way into a representation.', body:'A second reading without changing the table, grid or variables usually repeats confusion instead of creating an entry point.' },
        surface:{ code:'surface_set_selection', title:'You are using length as a shortcut for solvability.', body:'Short wording can still hide weak constraints. CAT set selection should follow usable structure, not appearance.' }
      }
    },
    qa_freeze:{
      intent:'In QA, I can solve questions during practice but freeze in mocks.',
      context:'A shop\'s total revenue rises by 20%, while the number of units sold falls by 20%.',
      question:'What happens to the average price per unit?',
      options:[
        { id:'cancel', label:'It stays unchanged.' },
        { id:'multiply', label:'It decreases by 4%.' },
        { id:'ratio', label:'It increases by 50%.' },
        { id:'uncertain', label:'It cannot be determined.' }
      ],
      results:{
        ratio:{ code:'explicit_recognition', title:'You recognised the hidden ratio.', body:'Revenue = price × quantity, so average price changes by 1.20 ÷ 0.80 = 1.50. This is only a miniature check; a mixed timed set must test whether recognition survives without a topic label.' },
        cancel:{ code:'equal_percentage_cancellation', title:'Equal percentages pulled you into a cancellation trap.', body:'A 20% rise and 20% fall act on different bases. The missing first step was preserving Revenue = price × quantity.' },
        multiply:{ code:'wrong_quantity_tracking', title:'You tracked the percentage chain, but not the quantity asked.', body:'0.8 × 1.2 = 0.96 does not give price. Price is revenue divided by units, so the relevant operation is 1.20 ÷ 0.80.' },
        uncertain:{ code:'relationship_not_recalled', title:'The blank may begin before calculation.', body:'The data is sufficient once Revenue = price × quantity is retrieved. We should test whether mixed wording blocks that relationship under time.' }
      }
    },
    mock_collapse:{
      intent:'My overall mock score collapses even when preparation felt fine.',
      context:'In DILR, 14 minutes have gone. You have a representation but no answer, and 26 minutes remain.',
      question:'What do you do next?',
      options:[
        { id:'finish', label:'Finish it because too much time is already invested.' },
        { id:'reset', label:'Leave, reset briefly, then scan for a cleaner entry.' },
        { id:'rush', label:'Rush into the easiest-looking set immediately.' },
        { id:'replay', label:'Keep replaying the clue you may have missed.' }
      ],
      results:{
        reset:{ code:'controlled_recovery', title:'You protected the rest of the section.', body:'Leaving is only half the skill; the brief reset prevents one failed set from contaminating the next decision. We should test whether you can execute this in a timed set.' },
        finish:{ code:'missing_kill_switch', title:'The collapse may begin with commitment escalation.', body:'Past time cannot be recovered, yet it starts controlling the next decision. A clear exit rule matters more here than simply “managing time better.”' },
        rush:{ code:'panic_carryover', title:'You left the set, but carried its panic forward.', body:'An immediate rushed choice often turns one bad set into two. Recovery needs a deliberate rescan, not just an exit.' },
        replay:{ code:'error_rumination', title:'You are trying to repair sunk time instead of protecting future marks.', body:'Replaying an uncertain clue can feel responsible while silently consuming the choices still available.' }
      }
    },
    something_else:{
      intent:'Something else keeps disrupting my CAT preparation. Help me identify the real pattern.',
      context:'Think about the first moment a bad preparation day begins—not how it looks by the end.',
      question:'What usually happens first?',
      options:[
        { id:'source_reset', label:'I compare sources or timetables before beginning.' },
        { id:'switching', label:'I start, then switch topics when one feels difficult.' },
        { id:'avoid_timed', label:'I study, but avoid timed work or mocks.' },
        { id:'no_review', label:'I finish work but rarely review why I was wrong.' }
      ],
      results:{
        source_reset:{ code:'system_reset', title:'Uncertainty may be resetting your whole study system.', body:'The day is lost before practice begins: choosing a source becomes a substitute for using one. We should test whether a fixed source rule restores consistency.' },
        switching:{ code:'discomfort_switching', title:'Difficulty may be deciding your timetable for you.', body:'Switching brings immediate relief, but prevents sustained contact with the exact topic that needs work.' },
        avoid_timed:{ code:'evaluation_avoidance', title:'Preparation may feel safer than measurement.', body:'You are still working, but avoiding the conditions that could challenge your current self-image. A small timed check is more useful than another long worksheet.' },
        no_review:{ code:'missing_feedback_loop', title:'Your effort is not becoming evidence.', body:'Without reviewing the decision behind an error, question volume records activity but does not update the next attempt.' }
      }
    }
  };
  // The authenticated bundle reuses the exact same locally scored checks after
  // OAuth/BFCache restoration. Keeping one runtime source prevents the public
  // and signed-in handoff from drifting apart.
  window.__MARG_PREAUTH_PATTERNS__ = PATTERNS;

  // Meta currently places the ad ID in utm_term and the ad-set ID in
  // utm_content. Keeping this map in the landing shell makes creative matching
  // adjustable without touching the authenticated application.
  var CAMPAIGN_DIAGNOSIS_MAP = {
    '120249376433710069':'something_else',
    '120249376433720069':'something_else',
    '120249376433750069':'qa_freeze',
    '120249376433700069':'qa_freeze'
  };

  function makeId(prefix) {
    try {
      if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    } catch(e) {}
    return String(prefix || 'event') + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
  }

  function isChallengeRoute() {
    return /^\/challenge\/?$/.test(String(window.location.pathname || ''));
  }

  function getChallengeToken() {
    try {
      return String(new URLSearchParams(window.location.search || '').get('c') || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
    } catch(e) { return ''; }
  }

  function getChallengeVisitorId() {
    var existing = safeGet(CHALLENGE_VISITOR_STORAGE_KEY);
    if (existing && /^[a-zA-Z0-9_-]{8,120}$/.test(existing)) return existing;
    var created = makeId('challenge-visitor').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 120);
    safeSet(CHALLENGE_VISITOR_STORAGE_KEY, created);
    return created;
  }

  async function challengeRpc(name, body) {
    var response = await fetch(SUPABASE_URL + '/rest/v1/rpc/' + name, {
      method:'POST',
      headers:{ 'Content-Type':'application/json', 'apikey':SUPABASE_ANON_KEY },
      body:JSON.stringify(body || {})
    });
    if (!response.ok) throw new Error('Challenge request failed (' + response.status + ')');
    return response.json();
  }

  function firstRpcRow(payload) {
    return Array.isArray(payload) ? (payload[0] || null) : (payload || null);
  }

  function buildChallengeHelpText(challenge) {
    var parts = ['Help me solve this ' + String(challenge.section || 'CAT').toUpperCase() + ' challenge a friend sent me.'];
    if (challenge.context_text) parts.push(challenge.context_text);
    parts.push(challenge.question_text);
    if (Array.isArray(challenge.options)) parts.push(challenge.options.join('\n'));
    return parts.join('\n\n').slice(0, 12000);
  }

  function setChallengeUnavailable(message) {
    var loading = document.getElementById('challenge-loading');
    var content = document.getElementById('challenge-content');
    var error = document.getElementById('challenge-error');
    if (loading) loading.style.display = 'none';
    if (content) content.style.display = 'none';
    if (error) {
      error.textContent = message || 'This challenge is unavailable or has expired.';
      error.style.display = 'block';
    }
  }

  function renderPublicChallenge(challenge) {
    var loading = document.getElementById('challenge-loading');
    var content = document.getElementById('challenge-content');
    var section = document.getElementById('challenge-section');
    var context = document.getElementById('challenge-context');
    var question = document.getElementById('challenge-question');
    var options = document.getElementById('challenge-options');
    if (!content || !question || !options) return false;
    if (loading) loading.style.display = 'none';
    if (section) section.textContent = String(challenge.section || 'CAT').toUpperCase();
    if (context) {
      context.textContent = challenge.context_text || '';
      context.style.display = challenge.context_text ? 'block' : 'none';
    }
    question.textContent = challenge.question_text || '';
    options.innerHTML = '';
    (challenge.options || []).forEach(function(option, index) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'challenge-option';
      button.textContent = option;
      button.setAttribute('data-answer-index', String(index));
      button.onclick = function() { submitPublicChallengeAnswer(index); };
      options.appendChild(button);
    });
    content.style.display = 'block';
    return true;
  }

  async function submitPublicChallengeAnswer(answerIndex) {
    if (publicChallengeAnswered || !publicChallenge) return;
    publicChallengeAnswered = true;
    var buttons = Array.prototype.slice.call(document.querySelectorAll('.challenge-option'));
    buttons.forEach(function(button) { button.disabled = true; });
    var result = document.getElementById('challenge-result');
    try {
      var payload = await challengeRpc('answer_referral_challenge', {
        p_token:publicChallenge.share_token,
        p_visitor_id:getChallengeVisitorId(),
        p_answer_index:answerIndex
      });
      var answer = firstRpcRow(payload);
      if (!answer) throw new Error('Challenge answer unavailable');
      buttons.forEach(function(button, index) {
        if (index === Number(answer.correct_index)) button.classList.add('correct');
        else if (index === answerIndex && !answer.is_correct) button.classList.add('wrong');
      });
      if (result) {
        result.className = 'challenge-result visible ' + (answer.is_correct ? 'correct' : 'wrong');
        result.innerHTML = '';
        var resultTitle = document.createElement('strong');
        resultTitle.textContent = answer.is_correct ? 'You got it. Send the trap back 😄' : 'That was the trap.';
        var resultCopy = document.createElement('div');
        resultCopy.textContent = String(answer.explanation || '') + (answer.insight ? '\n\n' + String(answer.insight) : '');
        resultCopy.style.whiteSpace = 'pre-wrap';
        result.appendChild(resultTitle);
        result.appendChild(resultCopy);
      }
    } catch(error) {
      publicChallengeAnswered = false;
      buttons.forEach(function(button) { button.disabled = false; });
      if (result) {
        result.className = 'challenge-result visible wrong';
        result.innerHTML = '';
        var errorTitle = document.createElement('strong');
        errorTitle.textContent = 'Could not check that answer.';
        result.appendChild(errorTitle);
        result.appendChild(document.createTextNode('Your choice is still here. Tap it once more in a moment.'));
      }
    }
  }

  function storeChallengeHandoff(challenge) {
    var visitorId = getChallengeVisitorId();
    safeSet(DEEP_LINK_QUESTION_STORAGE_KEY, JSON.stringify({ text:buildChallengeHelpText(challenge), createdAt:Date.now() }));
    safeSet(PENDING_REFERRAL_STORAGE_KEY, JSON.stringify({ token:challenge.share_token, visitorId:visitorId, createdAt:Date.now() }));
    return visitorId;
  }

  function askMargFromChallenge() {
    if (!publicChallenge) return;
    var visitorId = storeChallengeHandoff(publicChallenge);
    challengeRpc('track_referral_challenge_event', {
      p_token:publicChallenge.share_token,
      p_visitor_id:visitorId,
      p_event_type:'ask_marg_clicked'
    }).catch(function() {});
    var destination = window.location.origin + '/?challenge=' + encodeURIComponent(publicChallenge.share_token);
    if (safeGet('marg_token')) {
      window.location.href = destination;
      return;
    }
    window.location.href = SUPABASE_URL + '/auth/v1/authorize?provider=google&redirect_to=' + encodeURIComponent(destination);
  }

  async function resharePublicChallenge() {
    if (!publicChallenge) return;
    var shareUrl = window.location.origin + '/challenge?c=' + encodeURIComponent(publicChallenge.share_token);
    var shareData = { title:'One CAT question. Can you beat it?', text:'I think this CAT question might trap you 😄', url:shareUrl };
    try {
      if (navigator.share) await navigator.share(shareData);
      else if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(shareData.text + '\n' + shareUrl);
        var button = document.getElementById('challenge-reshare');
        if (button) button.textContent = 'Link copied ✓';
      }
      challengeRpc('track_referral_challenge_event', {
        p_token:publicChallenge.share_token,
        p_visitor_id:getChallengeVisitorId(),
        p_event_type:'reshared'
      }).catch(function() {});
    } catch(error) {
      if (!error || error.name !== 'AbortError') {
        var fallbackButton = document.getElementById('challenge-reshare');
        if (fallbackButton) fallbackButton.textContent = 'Share unavailable';
      }
    }
  }

  async function initializePublicChallenge() {
    var token = getChallengeToken();
    var landing = document.getElementById('landing-page');
    var loading = document.getElementById('loading-screen');
    if (landing) landing.style.display = 'none';
    if (loading) loading.style.display = 'none';
    document.documentElement.classList.add('marg-challenge-route');
    if (!token) { setChallengeUnavailable('This challenge link is incomplete. Ask your friend to share it again.'); return; }
    try {
      var payload = await challengeRpc('get_referral_challenge', { p_token:token, p_visitor_id:getChallengeVisitorId() });
      publicChallenge = firstRpcRow(payload);
      if (!publicChallenge || !Array.isArray(publicChallenge.options) || publicChallenge.options.length !== 4) {
        setChallengeUnavailable('This challenge is unavailable or has expired.');
        return;
      }
      renderPublicChallenge(publicChallenge);
      var askButton = document.getElementById('challenge-ask-marg');
      var reshareButton = document.getElementById('challenge-reshare');
      if (askButton) askButton.onclick = askMargFromChallenge;
      if (reshareButton) reshareButton.onclick = resharePublicChallenge;
    } catch(error) {
      setChallengeUnavailable('Marg could not open this challenge right now. Please try the link again in a moment.');
    }
  }

  function safeGet(key) {
    try { return localStorage.getItem(key); } catch(e) { return null; }
  }

  function safeSet(key, value) {
    try { localStorage.setItem(key, value); return true; } catch(e) { return false; }
  }

  function safeRemove(key) {
    try { localStorage.removeItem(key); } catch(e) {}
  }

  function getVisitorId() {
    var existing = safeGet(VISITOR_STORAGE_KEY);
    if (existing) return existing;
    var created = makeId('visitor');
    safeSet(VISITOR_STORAGE_KEY, created);
    return created;
  }

  function getAttribution() {
    var result = { entry_path:String(window.location.pathname || '/').slice(0, 120) };
    try {
      var params = new URLSearchParams(window.location.search || '');
      ['utm_source','utm_medium','utm_campaign','utm_content','utm_term','campaign_id','adset_id','ad_id','fbclid'].forEach(function(key) {
        var value = params.get(key);
        if (value) result[key] = String(value).slice(0, 160);
      });
    } catch(e) {}
    return result;
  }

  function sendAcquisitionEvent(eventType, metadata, eventPageViewId) {
    var safeMetadata = Object.assign({ entry_point:'homepage_chat_intent' }, getAttribution(), metadata || {});
    delete safeMetadata.text;
    delete safeMetadata.email;
    var payload = {
      id:makeId(eventType),
      visitor_id:getVisitorId(),
      page_view_id:String(eventPageViewId || pageViewId),
      user_id:null,
      event_type:eventType,
      occurred_at:new Date().toISOString(),
      metadata:safeMetadata
    };
    try {
      fetch(SUPABASE_URL + '/rest/v1/acquisition_funnel_events', {
        method:'POST',
        headers:{ 'Content-Type':'application/json', 'apikey':SUPABASE_ANON_KEY, 'Prefer':'return=minimal' },
        body:JSON.stringify(payload),
        keepalive:true
      }).catch(function() {});
    } catch(e) {}
    try {
      if (typeof window.gtag === 'function') window.gtag('event', eventType, safeMetadata);
    } catch(e) {}
    return payload;
  }

  function normalizeIntentText(value) {
    return String(value || '').replace(/\u0000/g, '').trim().slice(0, 12000);
  }

  function readIntent() {
    try {
      var intent = JSON.parse(safeGet(HOMEPAGE_INTENT_STORAGE_KEY) || 'null');
      if (!intent || !intent.text || !intent.createdAt || Date.now() - Number(intent.createdAt) > INTENT_MAX_AGE_MS) {
        safeRemove(HOMEPAGE_INTENT_STORAGE_KEY);
        return null;
      }
      return intent;
    } catch(e) {
      safeRemove(HOMEPAGE_INTENT_STORAGE_KEY);
      return null;
    }
  }

  function writeIntent(intent) {
    if (!intent || !normalizeIntentText(intent.text)) return null;
    var stored = {
      id:String(intent.id || makeId('homepage')),
      text:normalizeIntentText(intent.text),
      source:'homepage',
      pageViewId:String(intent.pageViewId || pageViewId),
      createdAt:Number(intent.createdAt) || Date.now(),
      updatedAt:Date.now(),
      status:String(intent.status || 'previewed'),
      failureMessage:String(intent.failureMessage || ''),
      problemKey:String(intent.problemKey || ''),
      diagnosticAnswer:String(intent.diagnosticAnswer || ''),
      diagnosticResult:String(intent.diagnosticResult || ''),
      diagnosticCompleted:!!intent.diagnosticCompleted,
      funnel_intent_entered:!!intent.funnel_intent_entered,
      funnel_first_message_sent:!!intent.funnel_first_message_sent
    };
    safeSet(HOMEPAGE_INTENT_STORAGE_KEY, JSON.stringify(stored));
    return stored;
  }

  function captureDeepLinkQuestion() {
    try {
      var params = new URLSearchParams(window.location.search || '');
      if (!params.has('q')) return false;
      var question = normalizeIntentText(params.get('q'));
      if (question) safeSet(DEEP_LINK_QUESTION_STORAGE_KEY, JSON.stringify({ text:question, createdAt:Date.now() }));
      params.delete('q');
      var query = params.toString();
      window.history.replaceState({}, document.title, window.location.pathname + (query ? '?' + query : '') + window.location.hash);
      return !!question;
    } catch(e) { return false; }
  }

  function getCampaignDiagnosisKey() {
    var values = [];
    try {
      var params = new URLSearchParams(window.location.search || '');
      ['ad_id','utm_term','adset_id','utm_content','utm_campaign','utm_source'].forEach(function(key) {
        var value = params.get(key);
        if (value) values.push(String(value));
      });
    } catch(e) {}
    for (var i = 0; i < values.length; i++) {
      if (CAMPAIGN_DIAGNOSIS_MAP[values[i]]) return CAMPAIGN_DIAGNOSIS_MAP[values[i]];
    }
    var semantic = values.join(' ').toLowerCase();
    if (/\b(?:rc|varc|reading|option)\b/.test(semantic)) return 'rc_options';
    if (/\b(?:dilr|lrdi|set|arrangement)\b/.test(semantic)) return 'dilr_start';
    if (/\b(?:qa|quant|quants|arithmetic|algebra)\b/.test(semantic)) return 'qa_freeze';
    if (/\b(?:mock|score|percentile|collapse)\b/.test(semantic)) return 'mock_collapse';
    return '';
  }

  function prioritizeCampaignOption() {
    var key = getCampaignDiagnosisKey();
    if (!key) return '';
    var container = document.querySelector('.homepage-problem-options');
    var matched = container && container.querySelector('[data-problem-key="' + key + '"]');
    if (!container || !matched) return '';
    container.insertBefore(matched, container.firstElementChild);
    matched.classList.add('campaign-match');
    matched.setAttribute('data-campaign-priority', 'first');
    var note = document.getElementById('homepage-campaign-note');
    if (note) note.classList.add('visible');
    document.documentElement.setAttribute('data-campaign-diagnosis', key);
    return key;
  }

  function setEntryStatus(message, type) {
    var status = document.getElementById('homepage-preview-note');
    if (!status) return;
    status.textContent = message || '';
    status.className = 'homepage-preview-note' + (type ? ' ' + type : '');
  }

  function buildDiagnosticMessage(pattern, option, result) {
    return [
      pattern.intent,
      'In Marg\'s 20-second check, I chose: "' + option.label + '"',
      'That points to a working hypothesis: ' + result.title + ' ' + result.body,
      'Treat this as a hypothesis, not a confirmed diagnosis. Continue from this evidence and test it with the smallest relevant CAT exercise; do not restart generic onboarding.'
    ].join('\n\n');
  }

  function renderDiagnosticResult(pattern, intent) {
    var answerId = String(intent && intent.diagnosticAnswer || '');
    var option = pattern.options.filter(function(item) { return item.id === answerId; })[0];
    var result = pattern.results[answerId];
    var resultBox = document.getElementById('homepage-diagnostic-result');
    var title = document.getElementById('homepage-diagnosis-title');
    var body = document.getElementById('homepage-diagnosis-body');
    var actions = document.getElementById('homepage-diagnosis-actions');
    if (!option || !result || !resultBox || !title || !body) return false;
    Array.prototype.forEach.call(document.querySelectorAll('.homepage-check-option'), function(button) {
      var selected = button.getAttribute('data-answer-id') === answerId;
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-pressed', selected ? 'true' : 'false');
      button.disabled = true;
    });
    title.textContent = result.title;
    body.textContent = result.body;
    resultBox.classList.add('visible');
    if (actions) actions.classList.add('visible');
    setEntryStatus('One choice is not a diagnosis. Sign in to test this pattern properly—your result is already saved.', '');
    return true;
  }

  function renderDiagnosis(problemKey, intent) {
    var pattern = PATTERNS[problemKey];
    var diagnostic = document.getElementById('homepage-diagnostic-entry');
    var preview = document.getElementById('homepage-diagnosis-preview');
    var context = document.getElementById('homepage-check-context');
    var question = document.getElementById('homepage-check-question');
    var options = document.getElementById('homepage-check-options');
    var resultBox = document.getElementById('homepage-diagnostic-result');
    var actions = document.getElementById('homepage-diagnosis-actions');
    var button = document.getElementById('homepage-google-cta');
    if (!pattern || !preview || !context || !question || !options) return false;
    selectedProblemKey = problemKey;
    if (diagnostic) diagnostic.classList.add('has-selection');
    Array.prototype.forEach.call(document.querySelectorAll('.homepage-problem-option'), function(option) {
      var selected = option.getAttribute('data-problem-key') === problemKey;
      option.classList.toggle('selected', selected);
      option.setAttribute('aria-pressed', selected ? 'true' : 'false');
    });
    context.textContent = pattern.context;
    question.textContent = pattern.question;
    options.innerHTML = '';
    pattern.options.forEach(function(option, index) {
      var choice = document.createElement('button');
      choice.type = 'button';
      choice.className = 'homepage-check-option';
      choice.setAttribute('data-answer-id', option.id);
      choice.setAttribute('aria-pressed', 'false');
      choice.setAttribute('onclick', "answerHomepageDiagnostic('" + option.id + "')");
      choice.textContent = String.fromCharCode(65 + index) + '. ' + option.label;
      options.appendChild(choice);
    });
    if (resultBox) resultBox.classList.remove('visible');
    if (actions) actions.classList.remove('visible');
    preview.classList.add('visible');
    if (button) {
      button.disabled = false;
      if (button.lastChild) button.lastChild.textContent = ' Save this pattern with Google';
    }
    if (intent && intent.diagnosticCompleted) renderDiagnosticResult(pattern, intent);
    else setEntryStatus('Choose the option you would actually pick. No Gemini call is used here.', '');
    return true;
  }

  function selectProblem(problemKey, options) {
    var pattern = PATTERNS[problemKey];
    if (!pattern) return false;
    var restoring = !!(options && options.restoring);
    var existing = readIntent();
    var isNew = !existing || existing.problemKey !== problemKey;
    var intent = restoring && existing ? existing : writeIntent({
      id:isNew ? makeId('homepage') : existing.id,
      text:pattern.intent,
      problemKey:problemKey,
      pageViewId:isNew ? pageViewId : existing.pageViewId,
      createdAt:isNew ? Date.now() : existing.createdAt,
        status:'checking',
        diagnosticAnswer:'',
        diagnosticResult:'',
        diagnosticCompleted:false,
        funnel_intent_entered:isNew ? false : existing.funnel_intent_entered
    });
    if (!intent) return false;
    renderDiagnosis(problemKey, intent);
    if (!restoring && !intent.funnel_intent_entered) {
      sendAcquisitionEvent('homepage_intent_entered', { problem_key:problemKey, source:'homepage_diagnostic', campaign_match:getCampaignDiagnosisKey() || null }, intent.pageViewId);
      writeIntent(Object.assign({}, intent, { funnel_intent_entered:true }));
    }
    return true;
  }

  function answerDiagnostic(answerId) {
    var intent = readIntent();
    var pattern = intent && PATTERNS[intent.problemKey];
    if (!pattern || intent.diagnosticCompleted) return false;
    var option = pattern.options.filter(function(item) { return item.id === String(answerId || ''); })[0];
    var result = option && pattern.results[option.id];
    if (!option || !result) return false;
    var completed = writeIntent(Object.assign({}, intent, {
      text:buildDiagnosticMessage(pattern, option, result),
      status:'diagnosed',
      diagnosticAnswer:option.id,
      diagnosticResult:result.code,
      diagnosticCompleted:true
    }));
    if (!completed) return false;
    renderDiagnosticResult(pattern, completed);
    return true;
  }

  function resetDiagnosis() {
    selectedProblemKey = '';
    safeRemove(HOMEPAGE_INTENT_STORAGE_KEY);
    var diagnostic = document.getElementById('homepage-diagnostic-entry');
    if (diagnostic) diagnostic.classList.remove('has-selection');
    Array.prototype.forEach.call(document.querySelectorAll('.homepage-problem-option'), function(option) {
      option.classList.remove('selected');
      option.setAttribute('aria-pressed', 'false');
    });
    var preview = document.getElementById('homepage-diagnosis-preview');
    if (preview) preview.classList.remove('visible');
    focusDiagnosis();
  }

  function focusDiagnosis() {
    var diagnostic = document.getElementById('homepage-diagnostic-entry');
    if (!diagnostic) return false;
    diagnostic.scrollIntoView({ behavior:'smooth', block:'center' });
    return true;
  }

  function startLogin(options) {
    var intent = readIntent();
    if (!options || !options.funnelAlreadyTracked) {
      sendAcquisitionEvent('auth_started', { source:intent ? 'homepage_diagnostic' : 'direct_login', problem_key:intent && intent.problemKey || null }, intent && intent.pageViewId);
    }
    var redirectUrl = window.location.origin + window.location.pathname + window.location.search;
    window.location.href = SUPABASE_URL + '/auth/v1/authorize?provider=google&redirect_to=' + encodeURIComponent(redirectUrl);
  }

  function continueDiagnosis() {
    var intent = readIntent();
    if (!intent) return focusDiagnosis();
    if (!intent.diagnosticCompleted) {
      setEntryStatus('Choose one answer first—Marg needs one real decision before it makes a read.', 'error');
      var firstChoice = document.querySelector('.homepage-check-option');
      if (firstChoice) firstChoice.focus();
      return false;
    }
    writeIntent(Object.assign({}, intent, { status:'auth_started' }));
    sendAcquisitionEvent('auth_started', { source:'homepage_diagnostic', problem_key:intent.problemKey || null, diagnostic_result:intent.diagnosticResult || null, diagnostic_answer:intent.diagnosticAnswer || null }, intent.pageViewId);
    var button = document.getElementById('homepage-google-cta');
    if (button) {
      button.disabled = true;
      if (button.lastChild) button.lastChild.textContent = ' Opening Google…';
    }
    setEntryStatus('Saved. Opening Google sign-in…', 'success');
    startLogin({ funnelAlreadyTracked:true });
    return true;
  }

  function showLegalPage(id) {
    Array.prototype.forEach.call(document.querySelectorAll('.legal-section'), function(section) { section.classList.remove('active'); });
    Array.prototype.forEach.call(document.querySelectorAll('#landing-page > section:not(.legal-section), #landing-page > footer'), function(section) { section.style.display = 'none'; });
    var selected = document.getElementById(id);
    if (selected) selected.classList.add('active');
    window.scrollTo(0, 0);
  }

  function showLandingMain() {
    Array.prototype.forEach.call(document.querySelectorAll('.legal-section'), function(section) { section.classList.remove('active'); });
    Array.prototype.forEach.call(document.querySelectorAll('#landing-page > section:not(.legal-section), #landing-page > footer'), function(section) { section.style.display = ''; });
    window.scrollTo(0, 0);
  }

  function loadAuthenticatedApp() {
    if (appLoadPromise) return appLoadPromise;
    appLoadPromise = new Promise(function(resolve, reject) {
      var loading = document.getElementById('loading-screen');
      var landing = document.getElementById('landing-page');
      if (loading) loading.style.display = 'flex';
      if (landing) landing.style.display = 'none';
      var script = document.createElement('script');
      script.src = APP_BUNDLE_URL;
      script.async = true;
      script.onload = function() {
        if (typeof window.__MARG_AUTH_APP_INIT__ !== 'function') {
          reject(new Error('Authenticated app did not expose its initializer'));
          return;
        }
        Promise.resolve(window.__MARG_AUTH_APP_INIT__()).then(resolve, reject);
      };
      script.onerror = function() {
        if (loading) loading.style.display = 'none';
        if (landing) landing.style.display = 'flex';
        setEntryStatus('Marg could not finish loading. Check your connection and try again.', 'error');
        reject(new Error('Authenticated app bundle failed to load'));
      };
      document.body.appendChild(script);
    });
    return appLoadPromise;
  }

  function needsAuthenticatedApp() {
    return /(?:^|[#&])access_token=/.test(window.location.hash || '') || !!safeGet('marg_token');
  }

  function initializeLandingShell() {
    if (isChallengeRoute()) {
      initializePublicChallenge();
      return;
    }
    captureDeepLinkQuestion();
    var loading = document.getElementById('loading-screen');
    var landing = document.getElementById('landing-page');
    if (loading) loading.style.display = 'none';
    if (landing) landing.style.display = 'flex';
    var campaignKey = prioritizeCampaignOption();
    var intent = readIntent();
    if (intent && intent.problemKey && PATTERNS[intent.problemKey]) selectProblem(intent.problemKey, { restoring:true });
    window.__MARG_LANDING_VISIBLE_TRACKED__ = true;
    sendAcquisitionEvent('homepage_chat_visible', { campaign_match:campaignKey || null });
    document.documentElement.classList.add('marg-landing-ready');
    if (needsAuthenticatedApp()) loadAuthenticatedApp().catch(function() {});
  }

  window.selectHomepageProblem = selectProblem;
  window.answerHomepageDiagnostic = answerDiagnostic;
  window.resetHomepageDiagnosis = resetDiagnosis;
  window.focusHomepageDiagnosis = focusDiagnosis;
  window.continueHomepageDiagnosis = continueDiagnosis;
  window.startLogin = startLogin;
  window.showLegalPage = showLegalPage;
  window.showLandingMain = showLandingMain;
  window.getCampaignDiagnosisKey = getCampaignDiagnosisKey;
  window.prioritizeCampaignOption = prioritizeCampaignOption;
  window.loadAuthenticatedMargApp = loadAuthenticatedApp;
  window.initializePublicChallenge = initializePublicChallenge;
  window.__MARG_LANDING_BOOTSTRAP__ = { initialize:initializeLandingShell, loadAuthenticatedApp:loadAuthenticatedApp };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initializeLandingShell, { once:true });
  else initializeLandingShell();
})();
