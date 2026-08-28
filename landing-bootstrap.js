(function() {
  'use strict';

  var SUPABASE_URL = 'https://kduqtrumhveteyjkyltf.supabase.co';
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYXNlIiwicmVmIjoia2R1cXRydW1odmV0ZXlqa3lsdGYiLCJyb2xlIjoiYW5vbiIsImlhdCI6MTc3OTE2NzQzMywiZXhwIjoyMDk0NzQzNDMzfQ.iUmZLf_GaeTyv2xD0VYY7sYEiTgavQVbITmc-KC6ZPo';
  var APP_BUNDLE_URL = '/marg-app.js?v=20260828-2';
  var HOMEPAGE_INTENT_STORAGE_KEY = 'marg_pending_homepage_intent_v1';
  var HOMEPAGE_DESTINATION_STORAGE_KEY = 'marg_pending_homepage_destination_v1';
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
  var homepageTextTypedTracked = false;
  var homepagePlaceholderTimer = null;
  var HOMEPAGE_CHAT_PLACEHOLDERS = [
    'I understand RC but still get stuck between two options…',
    'I cannot figure out which DILR set to start with…',
    'I solve QA at home but freeze during timed mocks…',
    'One bad section ruins the rest of my mock…',
    'I keep changing my study plan and losing consistency…'
  ];

  var HOMEPAGE_DESTINATIONS = {
    practice:{
      kicker:'Targeted practice',
      title:'Open the Practice workspace.',
      copy:'Choose RC, DILR or QA inside Marg. The questions stay inside the dedicated practice interface instead of being dumped into chat.',
      outcome:'After Google: Marg opens Practice directly. No generic onboarding detour.'
    },
    mock:{
      kicker:'Mock analysis',
      title:'Separate the score from the execution problem.',
      copy:'Enter section scores or add the scorecard image. Marg will look for the decision pattern behind the collapse before changing your plan.',
      outcome:'After Google: Marg opens Mock Analysis directly with score and image inputs ready.'
    },
    sectionals:{
      kicker:'Timed tests',
      title:'Pressure-test a section properly.',
      copy:'Use the timed QA or DILR interface with navigation, submission and analysis—not a long list of questions inside chat.',
      outcome:'After Google: Marg opens Sectional Tests directly.'
    },
    chat:{
      kicker:'Mentor chat',
      title:'Bring Marg the problem that is actually on your mind.',
      copy:'Discuss your preparation, study plan, confidence, strategy or a question you cannot place neatly into one section.',
      outcome:'After Google: Marg opens Mentor Chat, ready to continue from what you chose here.'
    }
  };

  var PATTERNS = {
    rc_options:{
      intent:'In RC, I understand the passage but get stuck between the final two options.',
      context:'',
      question:'When you\'re stuck between two options, which one do you usually pick?',
      options:[
        { id:'coverage', label:'The one that covers more of the passage.' },
        { id:'confidence', label:'The one that sounds most confident.' },
        { id:'indistinguishable', label:'I genuinely cannot tell; both feel right.' }
      ],
      results:{
        coverage:{ code:'coverage_over_precision', title:'That is the tell—you reward an option for covering more, even when part of it reaches beyond the author.', body:'That is not a comprehension problem; it is a precision habit at the final choice.' },
        confidence:{ code:'tone_as_evidence', title:'That is the tell—you let certainty of tone substitute for textual support.', body:'You probably understand the passage; the mark is leaking when confidence feels like evidence.' },
        indistinguishable:{ code:'elimination_stops_early', title:'That is the tell—you compare how plausible both options sound instead of isolating the exact unsupported word.', body:'This may not be weak comprehension; your elimination process may be stopping one step early.' }
      }
    },
    dilr_start:{
      intent:'In DILR, I often do not know how to start a set.',
      context:'',
      question:'Two minutes into a set, no placement is forced. What do you usually do?',
      options:[
        { id:'reread', label:'Reread every clue, hoping I missed one.' },
        { id:'same_representation', label:'Keep building the same table because I started it.' },
        { id:'rescan', label:'Leave and scan for a set with clearer deductions.' }
      ],
      results:{
        reread:{ code:'rereading_without_representing', title:'That is the tell—you try to solve uncertainty by consuming the clues again without changing the representation.', body:'Your problem may not be knowing how to start; it may be staying inside a start that produced no deduction.' },
        same_representation:{ code:'representation_commitment', title:'That is the tell—the first table starts feeling like a commitment simply because you drew it.', body:'Your DILR issue may not be weak logic; it may be failing to abandon a representation that has stopped producing information.' },
        rescan:{ code:'entry_point_control', title:'That is the tell—you already protect the section when a set gives you no usable entry.', body:'Your DILR problem may not be set selection; we need to test what happens after you commit to a viable set.' }
      }
    },
    qa_freeze:{
      intent:'In QA, I can solve questions during practice but freeze in mocks.',
      context:'',
      question:'A mixed timed question looks unfamiliar, but its numbers are simple. What do you usually do first?',
      options:[
        { id:'formula_search', label:'Search my memory for the chapter or formula.' },
        { id:'relationship_test', label:'Test a relationship using the given information.' },
        { id:'topic_skip', label:'Skip because I cannot identify the topic.' }
      ],
      results:{
        formula_search:{ code:'topic_label_dependency', title:'That is the tell—you wait for a chapter label before allowing yourself to begin.', body:'Your concepts may not be weak; topic-wise practice may have trained recognition to depend on being told which method exists.' },
        relationship_test:{ code:'first_step_available', title:'That is the tell—you can begin without first naming the chapter.', body:'Your QA problem may not be the initial freeze you suspect; we need to test whether time, calculation or abandonment breaks the solution later.' },
        topic_skip:{ code:'uncertainty_as_inability', title:'That is the tell—you treat not recognising the topic immediately as evidence that you cannot solve the question.', body:'This may not be a concept gap; it may be an early-exit habit triggered by unfamiliar packaging.' }
      }
    },
    mock_collapse:{
      intent:'My overall mock score collapses even when preparation felt fine.',
      context:'',
      question:'One section goes badly with half the mock still left. What usually happens next?',
      options:[
        { id:'recover_marks', label:'I chase the lost marks in the same section.' },
        { id:'carry_frustration', label:'I carry the frustration into the next section.' },
        { id:'planned_reset', label:'I reset and follow my original section plan.' }
      ],
      results:{
        recover_marks:{ code:'loss_recovery_escalation', title:'That is the tell—you respond to lost marks by risking the time that still remains.', body:'Your mock may not be collapsing from low ability; one recovery decision may be converting a contained loss into a section-wide one.' },
        carry_frustration:{ code:'emotional_carryover', title:'That is the tell—the previous section keeps occupying working memory after the next one has begun.', body:'Your overall score may not reflect three weak sections; it may reflect one bad section being allowed to contaminate the next.' },
        planned_reset:{ code:'recovery_control', title:'That is the tell—you already know how to contain one bad section instead of trying to win it back immediately.', body:'Your mock problem may not be emotional recovery; we need to locate the earlier decision that caused the section to go bad.' }
      }
    },
    something_else:{
      intent:'Something else keeps disrupting my CAT preparation. Help me identify the real pattern.',
      context:'',
      question:'On a day your preparation collapses, what usually happens first?',
      options:[
        { id:'source_reset', label:'I compare plans or resources before starting.' },
        { id:'switching', label:'I switch topics when the work feels difficult.' },
        { id:'avoid_evidence', label:'I study, but avoid timed work or reviewing mistakes.' }
      ],
      results:{
        source_reset:{ code:'system_reset', title:'That is the tell—uncertainty about one source makes you reopen the design of your entire study system.', body:'Your problem may not be inconsistency; repeatedly rebuilding the plan may be what prevents consistency from starting.' },
        switching:{ code:'discomfort_switching', title:'That is the tell—the moment practice becomes diagnostic, you change the topic and remove the discomfort.', body:'Your problem may not be motivation; switching may be protecting you from staying with evidence of a weakness.' },
        avoid_evidence:{ code:'evaluation_avoidance', title:'That is the tell—you keep preparation active while avoiding the parts that can prove whether it is working.', body:'Your problem may not be insufficient effort; it may be an effort pattern designed to avoid measurement.' }
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
      visibleUserText:normalizeIntentText(intent.visibleUserText || ''),
      visibleDiagnosisText:normalizeIntentText(intent.visibleDiagnosisText || ''),
      handoffType:String(intent.handoffType || ''),
      funnel_intent_entered:!!intent.funnel_intent_entered,
      funnel_first_message_sent:!!intent.funnel_first_message_sent
    };
    safeSet(HOMEPAGE_INTENT_STORAGE_KEY, JSON.stringify(stored));
    return stored;
  }

  function setHomepageChatStatus(message, type) {
    var status = document.getElementById('homepage-chat-status');
    if (!status) return;
    status.textContent = message || '';
    status.style.color = type === 'error' ? '#E58A8A' : type === 'success' ? '#70C295' : '#D9B95B';
  }

  function resizeHomepageChatInput(input) {
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = Math.min(Math.max(input.scrollHeight, 46), 116) + 'px';
  }

  function homepageChatInputChanged(input) {
    resizeHomepageChatInput(input);
    var text = normalizeIntentText(input && input.value);
    setHomepageChatStatus('', '');
    if (text && !homepageTextTypedTracked) {
      homepageTextTypedTracked = true;
      sendAcquisitionEvent('homepage_text_typed', {
        source:'homepage_chat',
        length_bucket:text.length < 25 ? 'short' : text.length < 100 ? 'medium' : 'long'
      });
    }
  }

  function homepageChatKeydown(event) {
    if (!event || event.key !== 'Enter' || event.shiftKey) return;
    event.preventDefault();
    submitHomepageChat(event);
  }

  function useHomepageChatPrompt(text) {
    var input = document.getElementById('homepage-chat-input');
    if (!input) return false;
    input.value = normalizeIntentText(text);
    homepageChatInputChanged(input);
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
    return false;
  }

  function focusHomepageChat() {
    var shell = document.getElementById('homepage-chat-entry');
    var input = document.getElementById('homepage-chat-input');
    if (shell) shell.scrollIntoView({ behavior:'smooth', block:'center' });
    if (input) setTimeout(function() { input.focus({ preventScroll:true }); }, 260);
    return false;
  }

  function submitHomepageChat(event) {
    if (event && typeof event.preventDefault === 'function') event.preventDefault();
    var input = document.getElementById('homepage-chat-input');
    var text = normalizeIntentText(input && input.value);
    if (!text) {
      setHomepageChatStatus('Type the problem you want Marg to continue with.', 'error');
      if (input) input.focus();
      return false;
    }
    safeRemove(HOMEPAGE_DESTINATION_STORAGE_KEY);
    var existing = readIntent();
    var sameMessage = existing && normalizeIntentText(existing.visibleUserText || existing.text) === text;
    var intent = writeIntent({
      id:sameMessage ? existing.id : makeId('homepage-chat'),
      text:text,
      visibleUserText:text,
      visibleDiagnosisText:'',
      handoffType:'homepage_chat',
      pageViewId:sameMessage ? existing.pageViewId : pageViewId,
      createdAt:sameMessage ? existing.createdAt : Date.now(),
      status:'auth_started',
      funnel_intent_entered:sameMessage ? !!existing.funnel_intent_entered : true
    });
    if (!intent) {
      setHomepageChatStatus('That message could not be saved. Try once more.', 'error');
      return false;
    }
    if (!sameMessage || !existing.funnel_intent_entered) {
      sendAcquisitionEvent('homepage_intent_entered', { source:'homepage_chat' }, intent.pageViewId);
    }
    sendAcquisitionEvent('auth_started', { source:'homepage_chat' }, intent.pageViewId);
    var button = document.getElementById('homepage-chat-send');
    if (button) button.disabled = true;
    setHomepageChatStatus('Saved. Opening Google sign-in…', 'success');
    startLogin({ funnelAlreadyTracked:true });
    return false;
  }

  function startDirectHomepageLogin() {
    // Direct signup means exactly that: do not accidentally auto-send a stale
    // message or old workspace choice left behind by a cancelled OAuth trip.
    safeRemove(HOMEPAGE_INTENT_STORAGE_KEY);
    safeRemove(HOMEPAGE_DESTINATION_STORAGE_KEY);
    setHomepageChatStatus('Opening Google sign-in…', 'success');
    startLogin();
    return false;
  }

  function startHomepagePlaceholderRotation() {
    if (homepagePlaceholderTimer || window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var index = 0;
    homepagePlaceholderTimer = window.setInterval(function() {
      var input = document.getElementById('homepage-chat-input');
      if (!input || document.activeElement === input || normalizeIntentText(input.value)) return;
      index = (index + 1) % HOMEPAGE_CHAT_PLACEHOLDERS.length;
      input.placeholder = HOMEPAGE_CHAT_PLACEHOLDERS[index];
    }, 2800);
  }

  function restoreHomepageChatDraft(intent) {
    if (!intent || intent.problemKey || intent.handoffType !== 'homepage_chat') return false;
    var input = document.getElementById('homepage-chat-input');
    if (!input) return false;
    input.value = normalizeIntentText(intent.visibleUserText || intent.text);
    resizeHomepageChatInput(input);
    setHomepageChatStatus('Your message is still saved.', 'success');
    return true;
  }

  function readDestination() {
    try {
      var destination = JSON.parse(safeGet(HOMEPAGE_DESTINATION_STORAGE_KEY) || 'null');
      if (!destination || !HOMEPAGE_DESTINATIONS[destination.destination] || !destination.createdAt || Date.now() - Number(destination.createdAt) > INTENT_MAX_AGE_MS) {
        safeRemove(HOMEPAGE_DESTINATION_STORAGE_KEY);
        return null;
      }
      return destination;
    } catch(e) {
      safeRemove(HOMEPAGE_DESTINATION_STORAGE_KEY);
      return null;
    }
  }

  function writeDestination(destination) {
    if (!destination || !HOMEPAGE_DESTINATIONS[destination.destination]) return null;
    var stored = {
      id:String(destination.id || makeId('destination')),
      destination:String(destination.destination),
      source:'homepage_product',
      pageViewId:String(destination.pageViewId || pageViewId),
      createdAt:Number(destination.createdAt) || Date.now(),
      updatedAt:Date.now(),
      status:String(destination.status || 'selected'),
      funnel_intent_entered:!!destination.funnel_intent_entered
    };
    safeSet(HOMEPAGE_DESTINATION_STORAGE_KEY, JSON.stringify(stored));
    return stored;
  }

  function renderEntrySelection(entryKey) {
    var shell = document.getElementById('homepage-entry');
    var diagnostic = document.getElementById('homepage-diagnostic-entry');
    var preview = document.getElementById('landing-destination-preview');
    Array.prototype.forEach.call(document.querySelectorAll('.landing-entry-card'), function(card) {
      var selected = card.getAttribute('data-entry-key') === entryKey;
      card.classList.toggle('selected', selected);
      card.setAttribute('aria-pressed', selected ? 'true' : 'false');
    });
    if (shell) shell.classList.toggle('has-selection', !!entryKey);
    if (diagnostic) diagnostic.classList.toggle('entry-visible', entryKey === 'diagnosis');
    if (preview) preview.classList.toggle('visible', !!entryKey && entryKey !== 'diagnosis');
  }

  function renderDestinationPreview(destination) {
    var config = HOMEPAGE_DESTINATIONS[destination && destination.destination];
    if (!config) return false;
    renderEntrySelection(destination.destination);
    var kicker = document.getElementById('landing-destination-kicker');
    var title = document.getElementById('landing-destination-title');
    var copy = document.getElementById('landing-destination-copy');
    var outcome = document.getElementById('landing-destination-outcome');
    if (kicker) kicker.textContent = config.kicker;
    if (title) title.textContent = config.title;
    if (copy) copy.textContent = config.copy;
    if (outcome) outcome.textContent = config.outcome;
    return true;
  }

  function chooseEntry(entryKey, options) {
    if (entryKey === 'diagnosis') {
      safeRemove(HOMEPAGE_DESTINATION_STORAGE_KEY);
      renderEntrySelection('diagnosis');
      var diagnostic = document.getElementById('homepage-diagnostic-entry');
      if (!(options && options.restoring) && diagnostic) diagnostic.scrollIntoView({ behavior:'smooth', block:'nearest' });
      return true;
    }
    if (!HOMEPAGE_DESTINATIONS[entryKey]) return false;
    safeRemove(HOMEPAGE_INTENT_STORAGE_KEY);
    var existing = readDestination();
    var isNew = !existing || existing.destination !== entryKey;
    var destination = writeDestination({
      id:isNew ? makeId('destination') : existing.id,
      destination:entryKey,
      pageViewId:isNew ? pageViewId : existing.pageViewId,
      createdAt:isNew ? Date.now() : existing.createdAt,
      status:'selected',
      funnel_intent_entered:isNew ? false : existing.funnel_intent_entered
    });
    if (!destination) return false;
    renderDestinationPreview(destination);
    if (!(options && options.restoring) && !destination.funnel_intent_entered) {
      sendAcquisitionEvent('homepage_intent_entered', { source:'homepage_product', destination:entryKey }, destination.pageViewId);
      writeDestination(Object.assign({}, destination, { funnel_intent_entered:true }));
    }
    return true;
  }

  function changeEntry() {
    safeRemove(HOMEPAGE_DESTINATION_STORAGE_KEY);
    safeRemove(HOMEPAGE_INTENT_STORAGE_KEY);
    selectedProblemKey = '';
    var diagnostic = document.getElementById('homepage-diagnostic-entry');
    if (diagnostic) diagnostic.classList.remove('has-selection', 'entry-visible');
    var diagnosisPreview = document.getElementById('homepage-diagnosis-preview');
    if (diagnosisPreview) diagnosisPreview.classList.remove('visible');
    renderEntrySelection('');
    focusEntry();
  }

  function focusEntry() {
    var shell = document.getElementById('homepage-entry');
    if (!shell) return false;
    shell.scrollIntoView({ behavior:'smooth', block:'center' });
    var selected = shell.querySelector('.landing-entry-card.selected');
    var first = shell.querySelector('.landing-entry-card');
    var target = selected || first;
    if (target && typeof target.focus === 'function') setTimeout(function() { target.focus({ preventScroll:true }); }, 250);
    return false;
  }

  function continueDestination() {
    var destination = readDestination();
    if (!destination) return focusEntry();
    destination = writeDestination(Object.assign({}, destination, { status:'auth_started' }));
    sendAcquisitionEvent('auth_started', { source:'homepage_product', destination:destination.destination }, destination.pageViewId);
    var button = document.getElementById('landing-destination-google');
    if (button) { button.disabled = true; button.textContent = 'Opening Google…'; }
    startLogin({ funnelAlreadyTracked:true });
    return true;
  }

  var LANDING_PROOF_RESULTS = {
    A:{ title:'That answer turns criticism into rejection.', copy:'The author warns that metrics can hide choices, but explicitly says measurement is not useless. You strengthened a caution into “abandon it”—a classic RC scope jump.' },
    B:{ title:'You matched the vocabulary, but not the whole claim.', copy:'Comparability is mentioned, but the passage is really warning that apparent objectivity can hide construction choices. The option kept a detail and dropped the argument.' },
    C:{ title:'Correct—and the reason matters.', copy:'You preserved both halves of the argument: metrics remain useful, while their apparent objectivity can conceal what their construction leaves out.' },
    D:{ title:'That answer reverses the author’s position.', copy:'The author does not privilege unmeasurable outcomes. The claim is that metrics should be judged by what they hide as well as what they enable.' }
  };

  function answerProof(answer) {
    var result = LANDING_PROOF_RESULTS[String(answer || '').toUpperCase()];
    if (!result) return false;
    safeRemove(HOMEPAGE_DESTINATION_STORAGE_KEY);
    Array.prototype.forEach.call(document.querySelectorAll('.landing-proof-option'), function(button) {
      var selected = button.getAttribute('data-proof-answer') === String(answer).toUpperCase();
      button.classList.toggle('selected', selected);
      button.disabled = true;
    });
    var resultBox = document.getElementById('landing-proof-result');
    var title = document.getElementById('landing-proof-result-title');
    var copy = document.getElementById('landing-proof-result-copy');
    if (title) title.textContent = result.title;
    if (copy) copy.textContent = result.copy;
    if (resultBox) resultBox.classList.add('visible');
    var choice = String(answer).toUpperCase();
    var intent = writeIntent({
      id:makeId('homepage-proof'),
      text:'I tried Marg\'s public RC decision check. I chose option ' + choice + '; the correct answer was C. The observed evidence was: ' + result.title + ' ' + result.copy + '\n\nContinue from this evidence. Do not repeat generic onboarding and do not treat one answer as a confirmed diagnosis.',
      visibleUserText:'I tried the public RC check and chose option ' + choice + '.',
      visibleDiagnosisText:result.title + '\n\n' + result.copy,
      handoffType:'public_rc_proof',
      problemKey:'sample_rc',
      diagnosticAnswer:choice,
      diagnosticResult:choice === 'C' ? 'balanced_claim_preserved' : 'rc_option_selection_signal',
      diagnosticCompleted:true,
      pageViewId:pageViewId,
      createdAt:Date.now(),
      status:'diagnosed',
      funnel_intent_entered:true
    });
    sendAcquisitionEvent('homepage_intent_entered', { source:'public_rc_proof', problem_key:'sample_rc', selected_answer:choice, correct:choice === 'C' }, intent && intent.pageViewId);
    if (resultBox) resultBox.scrollIntoView({ behavior:'smooth', block:'nearest' });
    return true;
  }

  function continueProof() {
    var intent = readIntent();
    if (!intent || intent.problemKey !== 'sample_rc') return false;
    intent = writeIntent(Object.assign({}, intent, { status:'auth_started' }));
    sendAcquisitionEvent('auth_started', { source:'public_rc_proof', problem_key:'sample_rc', diagnostic_answer:intent.diagnosticAnswer }, intent.pageViewId);
    startLogin({ funnelAlreadyTracked:true });
    return true;
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

  function personalizeHomepageChatPlaceholder(problemKey) {
    var pattern = PATTERNS[problemKey];
    var input = document.getElementById('homepage-chat-input');
    if (!pattern || !input || normalizeIntentText(input.value)) return false;
    input.placeholder = pattern.intent.replace(/^In\s+/i, '').replace(/^My\s+/i, 'My ');
    return true;
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
      if (button.lastChild) button.lastChild.textContent = ' Continue with Google';
    }
    if (intent && intent.diagnosticCompleted) renderDiagnosticResult(pattern, intent);
    else setEntryStatus('Choose the option you would actually pick. No Gemini call is used here.', '');
    return true;
  }

  function selectProblem(problemKey, options) {
    var pattern = PATTERNS[problemKey];
    if (!pattern) return false;
    renderEntrySelection('diagnosis');
    safeRemove(HOMEPAGE_DESTINATION_STORAGE_KEY);
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
    var completedCta = diagnostic.querySelector('.homepage-diagnosis-actions.visible .homepage-google-cta');
    var activeChoice = diagnostic.querySelector('.homepage-check-option:not(:disabled)');
    var selectedProblem = diagnostic.querySelector('.homepage-problem-option.selected');
    var firstProblem = diagnostic.querySelector('.homepage-problem-option');
    var target = completedCta || activeChoice || selectedProblem || firstProblem || diagnostic;
    target.scrollIntoView({ behavior:'smooth', block:'center' });
    diagnostic.classList.remove('cta-focused');
    void diagnostic.offsetWidth;
    diagnostic.classList.add('cta-focused');
    setTimeout(function() { diagnostic.classList.remove('cta-focused'); }, 900);
    setTimeout(function() {
      if (target && typeof target.focus === 'function') target.focus({ preventScroll:true });
    }, 350);
    return true;
  }

  function startLogin(options) {
    var intent = readIntent();
    var destination = readDestination();
    if (!options || !options.funnelAlreadyTracked) {
      sendAcquisitionEvent('auth_started', {
        source:intent ? (intent.handoffType === 'public_rc_proof' ? 'public_rc_proof' : intent.handoffType === 'homepage_chat' ? 'homepage_chat' : 'homepage_diagnostic') : destination ? 'homepage_product' : 'direct_login',
        problem_key:intent && intent.problemKey || null,
        destination:destination && destination.destination || null
      }, intent && intent.pageViewId || destination && destination.pageViewId);
    }
    if (safeGet('marg_token')) {
      loadAuthenticatedApp().catch(function() {});
      return;
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
    personalizeHomepageChatPlaceholder(campaignKey);
    var intent = readIntent();
    var destination = readDestination();
    if (intent && intent.handoffType === 'homepage_chat') restoreHomepageChatDraft(intent);
    else if (destination) renderDestinationPreview(destination);
    else if (intent && intent.problemKey && PATTERNS[intent.problemKey]) selectProblem(intent.problemKey, { restoring:true });
    startHomepagePlaceholderRotation();
    window.__MARG_LANDING_VISIBLE_TRACKED__ = true;
    sendAcquisitionEvent('homepage_chat_visible', { campaign_match:campaignKey || null });
    document.documentElement.classList.add('marg-landing-ready');
    if (needsAuthenticatedApp()) loadAuthenticatedApp().catch(function() {});
  }

  window.selectHomepageProblem = selectProblem;
  window.submitHomepageChat = submitHomepageChat;
  window.homepageChatInputChanged = homepageChatInputChanged;
  window.homepageChatKeydown = homepageChatKeydown;
  window.useHomepageChatPrompt = useHomepageChatPrompt;
  window.focusHomepageChat = focusHomepageChat;
  window.startDirectHomepageLogin = startDirectHomepageLogin;
  window.chooseHomepageEntry = chooseEntry;
  window.changeHomepageEntry = changeEntry;
  window.focusHomepageEntry = focusEntry;
  window.continueHomepageDestination = continueDestination;
  window.answerLandingProof = answerProof;
  window.continueLandingProof = continueProof;
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
