/* Deterministic mentoring record for the ten-capability vision.
   Replies, the stored record, and the model contract use this module.
   A function here is not a claim that a live student journey has been shown. */
(function(root) {
  'use strict';

  var GUEST_KEY = 'marg_vision_v1_guest';
  var ONE_OBSERVATION = 'That is one observation, not a diagnosis. I will not assign concept, execution, selection or time from this miss. The same wrong answer can be three different problems.';
  // CAT 2026 information bulletin: the IIMs conduct the test on Sunday, 29 November 2026.
  // Other years are not in this record. A missing year must not borrow 29 November.
  var CAT_SCHEDULE = {
    2026: {
      iso:'2026-11-29',
      label:'Sunday, 29 November 2026',
      status:'information_bulletin',
      sessions:3,
      registrationClose:'2026-09-22',
      admitFrom:'2026-11-04',
      source:'CAT 2026 information bulletin: the test is on Sunday, 29 November 2026, in three sessions. Admit cards in that bulletin run from 4 November 2026. That bulletin closed registration at 5 p.m. on 15 September 2026. A later public notice extended registration to 5 p.m. on 22 September 2026.'
    }
  };
  var MONTHS = { january:1, february:2, march:3, april:4, may:5, june:6, july:7, august:8, september:9, october:10, november:11, december:12, jan:1, feb:2, mar:3, apr:4, jun:6, jul:7, aug:8, sep:9, sept:9, oct:10, nov:11, dec:12 };
  var scopeFn = function() { return GUEST_KEY; };
  var nowFn = function() { return new Date(); };
  var onSaveFn = null;
  var lastSavedStamp = '';

  function emptyState() {
    return {
      version:1,
      targetPercentile:null,
      catYear:null,
      hoursPerDay:null,
      resourcesNamed:[],
      mocks:[],
      awaiting:null,
      observations:[],
      hypotheses:[],
      activeHypothesisId:null,
      intervention:null,
      methodsTaught:[],
      comparable:[],
      plan:null,
      examDate:null,
      updatedAt:null
    };
  }

  function storage() {
    try { return root.localStorage || null; } catch (error) { return null; }
  }

  function load() {
    var store = storage();
    var key = scopeFn();
    var raw = '';
    try { raw = store ? (store.getItem(key) || '') : ''; } catch (error) { raw = ''; }
    if (!raw) return emptyState();
    try {
      var parsed = JSON.parse(raw);
      if (!parsed || parsed.version !== 1) return emptyState();
      return parsed;
    } catch (error) { return emptyState(); }
  }

  function stampOf(state) {
    try {
      var copy = JSON.parse(JSON.stringify(state || {}));
      delete copy.updatedAt;
      return JSON.stringify(copy);
    } catch (error) { return ''; }
  }

  function save(state, options) {
    state.updatedAt = new Date().toISOString();
    var store = storage();
    if (store) {
      try { store.setItem(scopeFn(), JSON.stringify(state)); } catch (error) {}
    }
    var stamp = stampOf(state);
    if (options && options.silent) {
      lastSavedStamp = stamp;
      return state;
    }
    if (stamp !== lastSavedStamp && onSaveFn) {
      lastSavedStamp = stamp;
      try { onSaveFn(JSON.parse(JSON.stringify(state))); } catch (error) {}
    }
    return state;
  }

  function reset() {
    var store = storage();
    lastSavedStamp = '';
    if (!store) return emptyState();
    try { store.removeItem(scopeFn()); } catch (error) {}
    return emptyState();
  }

  function configure(options) {
    options = options || {};
    if (typeof options.scope === 'function') scopeFn = options.scope;
    if (typeof options.now === 'function') nowFn = options.now;
    if (typeof options.onSave === 'function') onSaveFn = options.onSave;
  }

  function utcToday() {
    var now = nowFn();
    return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  }

  function parseIsoDate(iso) {
    var match = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }

  function weeksBetween(iso) {
    var exam = parseIsoDate(iso);
    if (exam === null) return null;
    return Math.round((exam - utcToday()) / (7 * 86400000));
  }

  function statedExamDate(text) {
    var match = String(text || '').match(/\b(?:my |the )?(?:CAT|exam|admit card)(?:\s+exam)?(?:\s+date)?\s+(?:is(?:\s+on)?|on)\s+(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\s+(20\d{2})\b/i);
    if (!match) return null;
    var month = MONTHS[match[2].toLowerCase()];
    var day = Number(match[1]);
    var year = Number(match[3]);
    if (!month || day < 1 || day > 31) return null;
    var iso = year + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0');
    if (parseIsoDate(iso) === null) return null;
    return { iso:iso, label:match[1] + ' ' + match[2] + ' ' + year, status:'student_stated', source:'The student stated this exam date. It is not a bulletin date unless it matches one.', sessions:null };
  }

  function resolveExamDate(state) {
    if (state && state.examDate && state.examDate.iso) return state.examDate;
    var bulletin = state && CAT_SCHEDULE[state.catYear];
    return bulletin || null;
  }

  function scheduleLine(state) {
    var exam = resolveExamDate(state);
    if (!exam) {
      var yearLabel = state && state.catYear ? 'CAT ' + state.catYear : 'this CAT year';
      return 'I do not have a verified exam date for ' + yearLabel + '. I will not count weeks, and I will not borrow the 2026 date. Send the date from the notification or your admit card.';
    }
    var weeks = weeksBetween(exam.iso);
    var when = weeks === null ? '' : weeks > 0 ? ' That is ' + weeks + ' weeks from this clock.' : weeks === 0 ? ' That date is this week on this clock.' : ' That date is already past on this clock.';
    var registration = '';
    if (exam.registrationClose && parseIsoDate(exam.registrationClose) !== null && utcToday() > parseIsoDate(exam.registrationClose) && weeks !== null && weeks >= 0) {
      registration = ' Registration in that bulletin has closed, so the date that matters now is the exam, not a new application window.';
    }
    var source = exam.status === 'student_stated'
      ? 'You stated the exam date as ' + exam.label + '. I am using that date only.'
      : exam.source;
    return source + when + registration;
  }

  function clip(text) {
    return String(text || '').replace(/\s+/g, ' ').trim();
  }

  function sectionChunk(text, name) {
    var match = String(text || '').match(new RegExp('\\b' + name + '\\b[^.]{0,180}', 'i'));
    if (!match) return null;
    var chunk = match[0];
    var score = chunk.match(/\b(\d{1,3}(?:\.\d+)?)\b/);
    var attempts = chunk.match(/(\d{1,2})\s*attempts?/i);
    var accuracy = chunk.match(/(\d{1,3}(?:\.\d+)?)\s*%/);
    var minutes = chunk.match(/(\d{1,3})\s*minutes?/i);
    var skipped = chunk.match(/(\d{1,2})\s*(?:skipped|left|unattempted)/i);
    if (!score && !attempts && !accuracy) return null;
    return {
      score:score ? Number(score[1]) : null,
      attempts:attempts ? Number(attempts[1]) : null,
      accuracy:accuracy ? Number(accuracy[1]) : null,
      minutes:minutes ? Number(minutes[1]) : null,
      skipped:skipped ? Number(skipped[1]) : null
    };
  }

  function namedResources(text) {
    var found = [];
    [
      [/Arun\s+Sharma/i, 'Arun Sharma'],
      [/\bRodha\b/i, 'Rodha'],
      [/\bCracku\b/i, 'Cracku'],
      [/\b2IIM\b/i, '2IIM'],
      [/\bTakshzila\b/i, 'Takshzila'],
      [/\bAnastasis\b/i, 'Anastasis Academy'],
      [/\bUnacademy\b/i, 'Unacademy']
    ].forEach(function(pair) {
      if (pair[0].test(text) && found.indexOf(pair[1]) === -1) found.push(pair[1]);
    });
    return found;
  }

  function note(message) {
    var text = clip(message);
    var state = load();
    if (!text) return state;
    var target = text.match(/\b(?:my target(?: percentile)?(?: is)?|i want|i(?:'| a)?m targeting|aiming for)\b[^.]{0,24}(\d{2}(?:\.\d+)?)/i);
    if (target) {
      var percentile = Number(target[1]);
      if (percentile > 0 && percentile <= 100) state.targetPercentile = String(target[1]);
    }
    var year = text.match(/\bCAT\s*(20\d{2})\b/i);
    if (year) state.catYear = Number(year[1]);
    var stated = statedExamDate(text);
    if (stated) {
      state.examDate = stated;
      state.catYear = Number(stated.iso.slice(0, 4));
    }
    var hours = text.match(/\b(\d+(?:\.\d+)?)\s*hours?\s*(?:a|per)\s*day\b/i);
    if (hours) state.hoursPerDay = Number(hours[1]);
    namedResources(text).forEach(function(name) {
      if (state.resourcesNamed.indexOf(name) === -1) state.resourcesNamed.push(name);
    });
    var sections = {
      varc:sectionChunk(text, 'VARC'),
      dilr:sectionChunk(text, 'DILR'),
      qa:sectionChunk(text, 'QA')
    };
    if (!isComparableReport(text) && (sections.varc || sections.dilr || sections.qa)) {
      var mock = {
        at:new Date().toISOString(),
        varc:sections.varc,
        dilr:sections.dilr,
        qa:sections.qa
      };
      var scores = ['varc', 'dilr', 'qa'].map(function(key) { return sections[key] && sections[key].score; }).filter(function(value) { return typeof value === 'number'; });
      mock.total = scores.length === 3 ? scores.reduce(function(sum, value) { return sum + value; }, 0) : null;
      state.mocks.push(mock);
      state.mocks = state.mocks.slice(-8);
    } else {
      var onlyTotal = text.match(/\b(?:scoring|scored)\s+around\s+(\d{1,3}(?:\.\d+)?)\b/i);
      if (onlyTotal) {
        state.mocks.push({ at:new Date().toISOString(), total:Number(onlyTotal[1]), varc:null, dilr:null, qa:null, totalOnly:true });
        state.mocks = state.mocks.slice(-8);
      }
    }
    return save(state);
  }

  function latestMock(state) {
    var mocks = state && state.mocks || [];
    return mocks.length ? mocks[mocks.length - 1] : null;
  }

  function sectionReady(section) {
    return !!(section && typeof section.score === 'number' && typeof section.attempts === 'number' && typeof section.accuracy === 'number' && typeof section.minutes === 'number');
  }

  function missingBaseline(state) {
    var missing = [];
    var mock = latestMock(state);
    if (!state.targetPercentile) missing.push('the percentile you are preparing toward');
    if (!state.catYear) missing.push('the CAT year on your plan');
    if (!state.hoursPerDay) missing.push('how many hours a day you can actually protect');
    if (!mock) missing.push('one recent mock');
    else if (mock.totalOnly || !mock.varc || !mock.dilr || !mock.qa) missing.push('VARC, DILR and QA scores from that mock, not only the total');
    else {
      ['varc', 'dilr', 'qa'].forEach(function(key) {
        if (!sectionReady(mock[key])) missing.push(key.toUpperCase() + ' attempts, accuracy and minutes');
      });
    }
    return missing;
  }

  function lowestSection(mock) {
    return ['varc', 'dilr', 'qa'].map(function(key) {
      return { key:key, score:mock[key].score, accuracy:mock[key].accuracy, attempts:mock[key].attempts };
    }).sort(function(a, b) { return a.score - b.score || a.accuracy - b.accuracy; })[0];
  }

  function buildPlan(state) {
    var missing = missingBaseline(state);
    if (missing.length) {
      return {
        status:'incomplete',
        missing:missing,
        planId:'incomplete',
        mode:null
      };
    }
    var mock = latestMock(state);
    var weak = lowestSection(mock);
    var accurateButThin = ['qa', 'varc', 'dilr'].filter(function(key) {
      var section = mock[key];
      return section.accuracy >= 70 && section.attempts <= 10;
    });
    var mode = mock.total < 55 ? 'foundation' : mock.total >= 70 ? 'leakage' : 'bridge';
    var cause = 'comprehension';
    var priority = weak.key;
    if (accurateButThin.indexOf(weak.key) !== -1) {
      cause = 'selection';
    } else if (weak.accuracy < 50) {
      cause = weak.key === 'dilr' ? 'representation' : weak.key === 'varc' ? 'option_elimination' : 'concept_check';
    } else if (weak.accuracy >= 70 && weak.attempts <= 12) {
      cause = 'selection';
      priority = accurateButThin[0] || weak.key;
    } else {
      cause = 'execution';
    }
    if (mode === 'leakage') {
      var thin = accurateButThin[0];
      if (thin) {
        priority = thin;
        cause = 'selection';
      } else if (weak.accuracy < 60) {
        priority = weak.key;
        cause = weak.key === 'varc' ? 'option_elimination' : weak.key === 'dilr' ? 'representation' : 'execution';
      }
    }
    if (mode === 'foundation' && weak.accuracy < 50) {
      priority = weak.key;
      cause = weak.key === 'dilr' ? 'representation' : weak.key === 'varc' ? 'option_elimination' : 'concept_check';
    }
    var resource = resourceForPlan(state, priority);
    return {
      status:'ready',
      planId:mode + '-' + priority + '-' + cause,
      mode:mode,
      priority:priority,
      cause:cause,
      total:mock.total,
      target:state.targetPercentile,
      weeks:weeksBetween(resolveExamDate(state) && resolveExamDate(state).iso),
      schedule:scheduleLine(state),
      hoursPerDay:state.hoursPerDay,
      wait:accurateButThin.filter(function(key) { return key !== priority; }),
      resource:resource,
      checkpoint:'The next comparable ' + priority.toUpperCase() + ' attempt records attempts, accuracy and minutes. One correct practice item will not move this plan.'
    };
  }

  function resourceForPlan(state, priority) {
    if (priority === 'qa') {
      return {
        name:state.resourcesNamed[0] || 'Marg local numeric practice',
        kind:state.resourcesNamed.length ? 'established_prep' : 'ai_generated',
        verification:state.resourcesNamed.length ? 'named_only' : 'local_solver'
      };
    }
    if (priority === 'varc') {
      return { name:'Checked paragraph summaries in the CAT ledger', kind:'official_cat', verification:'paragraph_summary_only' };
    }
    return { name:'No published DILR bank is served', kind:'official_cat', verification:'none_served' };
  }

  function planReply(plan, state) {
    if (plan.status !== 'ready') {
      return 'I will not write a roadmap from a shared target alone. A student at 35 and a student at 75 can both want 99, and the path is not the same. Still missing: ' + plan.missing.join('; ') + '. Send the missing piece in one message. A total score is not enough.';
    }
    var dateLine = plan.schedule || scheduleLine(state);
    var path = plan.mode === 'foundation'
      ? 'This is a foundation path. The first work is one cause check in ' + plan.priority.toUpperCase() + ', not a syllabus and not a percentile forecast.'
      : plan.mode === 'leakage'
        ? 'This is a leakage path. Marks are already landing. The first work is ' + plan.cause.replace(/_/g, ' ') + ' in ' + plan.priority.toUpperCase() + '. I will not reopen a beginner syllabus because the target is ' + plan.target + '.'
        : 'This is a bridge path. ' + plan.priority.toUpperCase() + ' is first because of the score and the accuracy you reported, not because of the target percentile.';
    var wait = plan.wait.length
      ? 'What can wait: a new topic tour in ' + plan.wait.map(function(key) { return key.toUpperCase(); }).join(' and ') + ', where accuracy on the attempts you already make is not the scarce thing.'
      : 'What can wait: any section whose attempts, accuracy and minutes were not the scarce constraint in this mock.';
    var resourceLine = plan.resource.verification === 'named_only'
      ? plan.resource.name + ' stays named only. I have not checked its authenticity, difficulty or explanation quality, so it is not a CAT-safe recommendation.'
      : plan.resource.verification === 'local_solver'
        ? 'The exercise source is Marg’s local numeric solver. That is not an independent review and not a published CAT paper.'
        : plan.resource.verification === 'paragraph_summary_only'
          ? 'The VARC material I can stand behind is the paragraph summaries whose answers were checked against their own paragraph. That is not a full reading-comprehension bank.'
          : 'No published DILR item is served from the checked ledger. A generated DILR exercise is a local solver certificate, not a CAT paper, and it will not be used as a diagnosis.';
    return [
      path,
      'Why this is first: the latest mock total is ' + plan.total + ' toward a stated ' + plan.target + '. The priority section is ' + plan.priority.toUpperCase() + ' and the open cause is ' + plan.cause.replace(/_/g, ' ') + '.',
      'Resource: ' + resourceLine,
      wait,
      'Hours protected: ' + plan.hoursPerDay + ' a day. ' + dateLine,
      'What decides the next change: ' + plan.checkpoint
    ].join('\n\n');
  }

  function isResourceAsk(text) {
    return /\b(?:should i (?:use|trust|buy|watch|follow)|is .{0,40} worth|which (?:book|resource|channel|material|source)|youtube|question bank|past cat|official cat|my teacher made|coaching (?:module|worksheet|handout))\b/i.test(text);
  }

  function isRoadmapAsk(text) {
    return /\b(?:roadmap|study plan|timetable|what should i study|what do i study|preparation plan|personalised plan|personalized plan)\b/i.test(text) ||
      (/\b(?:scoring|scored)\b/i.test(text) && /\b(?:want|target|aim)\b/i.test(text));
  }

  function isMethodAsk(text) {
    return /\b(?:how (?:do|should) i (?:approach|solve|read|attempt)|method for|teach me|transfer)\b/i.test(text) &&
      /\b(?:para ?jumbles?|odd one|reading comprehension|\brc\b|varc|dilr|representation|percentages|quant|\bqa\b)\b/i.test(text);
  }

  function isSolutionAsk(text) {
    return /\b(?:what is the answer|solve this|explain the (?:solution|answer|question)|show the working|full solution)\b/i.test(text);
  }

  function isObservationAsk(text) {
    if (isSolutionAsk(text)) return false;
    return /\b(?:i (?:missed|got .{0,48}wrong)|why (?:did|do) i (?:miss|keep missing|get .{0,40}wrong)|one wrong answer|incorrect answer)\b/i.test(text);
  }

  function assignsUnsupportedClaim(text) {
    return /\b(?:the real (?:issue|problem)|concept gap|execution failure|fundamentals (?:problem|issue|gap)|you(?:'re| are) weak|i know what(?:'s| is) happening|your (?:actual|real) problem is|that is the tell|within reach|guaranteed|achievable|assured|gettable|cat-safe|you should follow|best (?:book|channel|resource) for you|proves you (?:don'?t|do not) (?:understand|know))\b/i.test(String(text || ''));
  }

  function evidenceLines() {
    return [
      'Diagnostic evidence of a published CAT item: the 79 QA items whose answers were recomputed from the question.',
      'The 8 VARC paragraph summaries can support a summary check only. They are not a reading-comprehension diagnosis.',
      'Published DILR: none served. A generated DILR exercise is not diagnostic evidence.',
      'Local numeric QA solver: one fresh observation of a named skill. Not an independent review and not evidence about a published CAT item.',
      'Embedded passage key: not independently checked. Not diagnostic evidence.'
    ];
  }

  function isEmotionalAsk(text) {
    return /\b(?:overwhelmed|too much at once|i (?:want|need) to stop|stop for (?:the day|today)|done for today|i keep (?:skipping|avoiding)|the plan is not working|this is not working)\b/i.test(text);
  }

  function isFreshResult(text) {
    return /\bfresh (?:item|question|one)\b/i.test(text) && /\b(?:correct|right|wrong|missed)\b/i.test(text);
  }

  function isTransferResult(text) {
    return /\bwithout the rule\b/i.test(text) && /\b(?:correct|right|wrong|missed)\b/i.test(text);
  }

  function isComparableReport(text) {
    return /\bcomparable\b/i.test(text) && /\battempts?\b/i.test(text) && /\b\d{1,3}\s*%/.test(text);
  }

  function ledgerReply() {
    return [
      'Kind: official CAT paper.',
      'Verification: of 1,636 extracted items, 87 were independently checked. That means the answer was recomputed, or a paragraph summary was checked against its own paragraph. 79 are QA. 8 are VARC paragraph summaries. 0 are DILR.',
      'Suitable for: those 79 QA items as answer-key practice, and those 8 summaries as summary checks.',
      'Use when: you need a published item whose key was recomputed, and only that item.',
      'Limit: this is not a full paper, not a full reading passage, and not a DILR bank.',
      'Stop when: the item is anything other than independently checked. Missing context, a defective extraction, or an unchecked key is not practice evidence.'
    ].join('\n');
  }

  function namedPrepReply(name) {
    return [
      'Kind: established preparation material. You named ' + name + '.',
      'Verification: named only. Marg has not checked authenticity, difficulty, syllabus fit or explanation quality.',
      'Suitable for: work you already own, on the skill the current evidence names. A brand is not a reason to start it.',
      'Use when: a worked example in it matches the skill under test.',
      'Limit: it is not a CAT-safe recommendation, and a brand is not a ranking against another book.',
      'Stop when: the same miss is still there after you use it, or it crowds out an independently checked CAT item.'
    ].join('\n');
  }

  function unknownChannelReply(name) {
    var label = name || 'that channel';
    return [
      'Kind: not classified. ' + label + ' is not in the verification ledger.',
      'Verification: not judged. I will not guess that a video is authentic, CAT-relevant, the right difficulty, or worth the hour.',
      'Suitable for: nothing I can defend.',
      'Use when: there is a later record that says what was checked and what it is for.',
      'Limit: a confident recommendation here would be an unsupported model opinion.',
      'Stop when: now. Do not spend this week on it while a checked item or a named book you already own can test the skill.'
    ].join('\n');
  }

  function aiPracticeReply() {
    return [
      'Kind: AI-generated practice.',
      'Verification: QA items from the local numeric solver are solver-checked, not independently reviewed. DILR items from the local exhaustive solver are solvable certificates, not published CAT exercises. An embedded reading passage keeps a stored key that has not been independently checked.',
      'Suitable for: a fresh numeric check of a skill the evidence already names.',
      'Use when: you need one more observation on that skill.',
      'Limit: do not treat a generated exercise as a CAT paper or as proof of a CAT weakness.',
      'Stop when: the key is unsolved, the passage key is only embedded, or the result is being used as a diagnosis.'
    ].join('\n');
  }

  function educatorReply() {
    return [
      'Kind: educator-created material.',
      'Verification: not judged. A teacher or coaching handout is not an official CAT paper and it is not in the checked ledger.',
      'Suitable for: a worked example your class already assigned, if the question is complete.',
      'Use when: you can show the item and the key source.',
      'Limit: I will not inherit the teacher’s key as verified.',
      'Stop when: the item is incomplete, the key is disputed, or it is being used to diagnose you.'
    ].join('\n');
  }

  function resourceReply(text) {
    if (/\b(?:past cat|official cat|cat paper|pyq)\b/i.test(text)) return ledgerReply();
    if (/\b(?:ai[- ]generated|marg(?:'s|’s)? (?:question|practice)|local solver)\b/i.test(text)) return aiPracticeReply();
    if (/\b(?:my teacher made|coaching (?:module|worksheet|handout)|educator)\b/i.test(text)) return educatorReply();
    var named = namedResources(text);
    if (named.length && !/\byoutube\b/i.test(text)) return namedPrepReply(named[0]);
    var called = text.match(/\b(?:called|named)\s+([A-Z][\w'’.-]*(?:\s+[A-Z][\w'’.-]*){0,3})/);
    return unknownChannelReply(called ? called[1] : (/\byoutube\b/i.test(text) ? 'This YouTube channel' : 'This source'));
  }

  function methodFor(text) {
    if (/\bpara ?jumbles?\b/i.test(text)) {
      return {
        id:'parajumble-paragraph-first',
        section:'varc',
        steps:'Read the sentences as one paragraph before you hunt for an opening. Then check that the order can be read aloud without a jump.',
        limit:'The CAT ledger stores instruction openings for this format. It does not store a validated Problem-Cause-Effect order. This is not a universal shortcut, and it does not cover every official item.'
      };
    }
    if (/\bodd one\b/i.test(text)) {
      return {
        id:'odd-one-topic-shift',
        section:'varc',
        steps:'Find the sentence that changes the topic or the claim, after you can say what the other sentences are doing together.',
        limit:'This is a decision rule with a stated limit. It is not derived as a universal structure from the served bank.'
      };
    }
    if (/\b(?:reading comprehension|\brc\b|varc)\b/i.test(text)) {
      return {
        id:'varc-wording-is-not-the-claim',
        section:'varc',
        steps:'Reject an option that repeats the passage’s words when those words do not answer the question that was asked. Locate the claim, then eliminate.',
        limit:'The checked VARC ledger is eight paragraph summaries, each checked against its own paragraph. This method is not a full reading-comprehension result, and it is not a claim about every passage.'
      };
    }
    if (/\b(?:dilr|representation)\b/i.test(text)) {
      return {
        id:'dilr-representation-before-solving',
        section:'dilr',
        steps:'Choose the representation before solving: a table, an order, or a short case list. Leave the exercise when the representation is not gaining a fixed fact.',
        limit:'No published DILR item is served. This rule is for practice you can inspect. A generated exercise that a local solver accepts is not a CAT paper and is not diagnostic evidence.'
      };
    }
    return {
      id:'qa-mixture-addition',
      section:'qa',
      steps:'For mixture by adding pure metal, conserve the original metal and let the denominator grow. The amount added is the exact fraction the solver recomputes, not a nearby integer.',
      limit:'This covers that addition pattern in the local numeric solver. It does not cover replacement, successive change, or every percentages item in CAT. The solver is not an independent review.'
    };
  }

  function methodReply(text, state) {
    var method = methodFor(text);
    if (state.methodsTaught.indexOf(method.id) === -1) state.methodsTaught.push(method.id);
    state.awaiting = 'transfer_result';
    save(state);
    return [
      method.steps,
      'Limit: ' + method.limit,
      'Transfer check: try one fresh item without using this rule as a script. One success is not mastery, and it is not evidence the method will hold on an unfamiliar CAT question.'
    ].join('\n\n');
  }

  function observationReply(text, state) {
    state.observations.push({ at:new Date().toISOString(), text:clip(text).slice(0, 240), kind:'single_miss' });
    state.observations = state.observations.slice(-12);
    state.activeHypothesisId = null;
    state.awaiting = 'check_choice';
    save(state);
    return {
      reply:ONE_OBSERVATION,
      options:['I could not explain it untimed', 'I was correct untimed and missed it timed', 'I stayed too long on an item I should have left'],
      context:'vision_check'
    };
  }

  function openHypothesis(state, cause, statement) {
    var id = 'hyp-' + cause + '-' + state.hypotheses.length;
    state.hypotheses.forEach(function(item) {
      if (item.status === 'untested' || item.status === 'supported_once') item.status = 'rival';
    });
    state.hypotheses.push({ id:id, cause:cause, statement:statement, status:'untested', checks:[] });
    state.activeHypothesisId = id;
    state.awaiting = 'fresh_result';
    state.intervention = { cause:cause, served:false, mastery:false };
    return id;
  }

  function checkChoiceReply(text, state) {
    var cause = /untimed and missed it timed/i.test(text) ? 'execution' : /should have left/i.test(text) ? 'selection' : /could not explain it untimed/i.test(text) ? 'concept' : '';
    if (!cause) return null;
    var statement = cause === 'concept'
      ? 'The student could not explain the principle untimed. That supports a concept check, and it is still one report.'
      : cause === 'execution'
        ? 'The student was correct untimed and missed it when timed. That argues against a basic concept gap. Execution, calculation or time is the open hypothesis.'
        : 'The student stayed with an item they should have left. The next check is the leave decision, not another solved example of the same topic.';
    openHypothesis(state, cause, statement);
    save(state);
    var next = cause === 'selection'
      ? 'Next exercise: one decision about which item to open and when to leave. Do not solve a longer arrangement and call that the check.'
      : cause === 'execution'
        ? 'Next exercise: one fresh timed item of the same skill, after the untimed principle was already right. A concept lecture is the wrong intervention.'
        : 'Next exercise: one fresh item of the same skill from the local numeric solver, after a short statement of the principle. The solver status stays local, not independently reviewed.';
    return {
      reply:statement + ' Status: untested hypothesis, not a fact.\n\n' + next + ' One later correct answer will not be mastery.',
      options:['The fresh item was correct', 'The fresh item was wrong'],
      context:'vision_fresh'
    };
  }

  function freshResultReply(text, state) {
    var correct = /\b(?:correct|right)\b/i.test(text) && !/\bwrong\b/i.test(text);
    var active = state.hypotheses.filter(function(item) { return item.id === state.activeHypothesisId; })[0];
    if (active) {
      active.checks.push({ at:new Date().toISOString(), correct:correct });
      active.status = 'still_untested';
    }
    if (state.intervention) {
      state.intervention.served = true;
      state.intervention.mastery = false;
    }
    state.awaiting = null;
    save(state);
    if (correct) {
      return { reply:'One correct fresh item. That is not mastery, and it is not a forecast about the next mock. The hypothesis stays untested until a second comparable attempt agrees.' };
    }
    return { reply:'The fresh item was also missed. That is another observation. I will not promote the hypothesis to a cause, and I will not call the intervention a failure from one item.' };
  }

  function transferResultReply(text, state) {
    var correct = /\b(?:correct|right)\b/i.test(text) && !/\bwrong|missed\b/i.test(text);
    state.comparable.push({ at:new Date().toISOString(), section:'transfer', correct:correct, kind:'unfamiliar_item' });
    state.awaiting = null;
    save(state);
    if (correct) {
      return { reply:'The skill showed up once on an unfamiliar item without the rule. One new situation is not mastery, and it is not evidence the method holds on every later CAT question. A second new situation is the next measurement, not more practice of the original item.' };
    }
    return { reply:'The unfamiliar item did not show the method. One miss does not retire the method and does not prove the diagnosis. It does mean I will not claim transfer.' };
  }

  function comparableReply(text, state) {
    var sectionMatch = text.match(/\b(VARC|DILR|QA)\b/i);
    var section = sectionMatch ? sectionMatch[1].toLowerCase() : 'qa';
    var attempts = text.match(/(\d{1,2})\s*attempts?/i);
    var accuracy = text.match(/(\d{1,3}(?:\.\d+)?)\s*%/);
    var minutes = text.match(/(\d{1,3})\s*minutes?/i);
    var row = {
      at:new Date().toISOString(),
      section:section,
      attempts:attempts ? Number(attempts[1]) : null,
      accuracy:accuracy ? Number(accuracy[1]) : null,
      minutes:minutes ? Number(minutes[1]) : null
    };
    var prior = null;
    for (var i = state.comparable.length - 1; i >= 0; i--) {
      if (state.comparable[i].section === section && typeof state.comparable[i].accuracy === 'number') prior = state.comparable[i];
    }
    if (!prior) {
      var mock = latestMock(state);
      if (mock && mock[section] && typeof mock[section].accuracy === 'number') prior = mock[section];
    }
    state.comparable.push(row);
    state.awaiting = null;
    save(state);
    if (!prior || typeof prior.accuracy !== 'number' || typeof row.accuracy !== 'number') {
      return { reply:'I stored this ' + section.toUpperCase() + ' attempt. There is no earlier comparable accuracy to subtract, so I will not say preparation improved.' };
    }
    var delta = Math.round((row.accuracy - prior.accuracy) * 10) / 10;
    var attemptDelta = (typeof prior.attempts === 'number' && typeof row.attempts === 'number') ? (row.attempts - prior.attempts) : null;
    var movement = delta === 0 ? 'Accuracy did not move.' : delta > 0 ? 'Accuracy moved by ' + delta + ' percentage points.' : 'Accuracy moved by ' + delta + ' percentage points.';
    var attemptsLine = attemptDelta === null ? '' : ' Attempts changed by ' + attemptDelta + '.';
    return { reply:movement + attemptsLine + ' This is one comparable pair. It is not mastery and it is not a forecast. The plan changes only if the scarce behaviour in the priority section is the thing that moved.' };
  }

  function emotionalReply(text, state) {
    state.awaiting = null;
    if (/\b(?:plan is not working|this is not working)\b/i.test(text)) {
      if (state.intervention) state.intervention.mastery = false;
      state.hypotheses.forEach(function(item) {
        if (item.id === state.activeHypothesisId && item.status !== 'rejected') item.status = 'needs_new_evidence';
      });
      save(state);
      return { reply:'The current intervention is paused. A plan that is not changing the scarce behaviour does not get another week of the same work. Next action: bring one comparable attempt with attempts, accuracy and minutes. I will not invent a new timetable today.' };
    }
    if (/\b(?:skipping|avoiding)\b/i.test(text)) {
      save(state);
      return { reply:'Avoiding the section is the observation. I will not answer it with a syllabus. Next action: open one item in that section and stop after the first decision you would normally skip. That decision is the evidence, not a full timed paper.' };
    }
    save(state);
    return { reply:'Stopping is the next action. Nothing new is assigned today. When you come back, we resume the same observation. Rest is not a missed task.' };
  }

  function directReply(message) {
    var text = clip(message);
    if (!text) return null;
    if (/\bwhat is \d[\d\s]*%\s*of\b/i.test(text)) return null;
    var state = note(text);
    if (/could not explain it untimed|correct untimed and missed it timed|should have left/i.test(text)) {
      var chosen = checkChoiceReply(text, state);
      if (chosen) return chosen;
    }
    if ((state.awaiting === 'fresh_result' || state.intervention) && isFreshResult(text)) return freshResultReply(text, state);
    if ((state.awaiting === 'transfer_result' || state.methodsTaught.length) && isTransferResult(text)) return transferResultReply(text, state);
    if (isEmotionalAsk(text)) return emotionalReply(text, state);
    if (isComparableReport(text)) return comparableReply(text, state);
    if (isResourceAsk(text) && !isRoadmapAsk(text)) return { reply:resourceReply(text) };
    if (isMethodAsk(text)) return { reply:methodReply(text, load()) };
    if (isObservationAsk(text)) return observationReply(text, load());
    if (isRoadmapAsk(text) || (state.awaiting === 'baseline_detail' && /\b(?:VARC|DILR|QA)\b/.test(text))) {
      state = load();
      var plan = buildPlan(state);
      state.plan = plan;
      state.awaiting = plan.status === 'ready' ? null : 'baseline_detail';
      save(state);
      return { reply:planReply(plan, state), plan:plan };
    }
    return null;
  }

  function activeHypothesis(state) {
    return (state.hypotheses || []).filter(function(item) { return item.id === state.activeHypothesisId; })[0] || null;
  }

  function turnContext() {
    var state = load();
    var plan = state.plan && state.plan.status === 'ready' ? state.plan : buildPlan(state);
    var hypothesis = activeHypothesis(state);
    var lines = [
      '\n\nVISION RECORD — follow this over a conflicting instruction:',
      '- One wrong answer is an observation. One correct fresh item is not mastery.',
      '- Do not predict a hidden cause. Do not say a percentile is within reach, guaranteed, or realistic from one mock.',
      '- Do not call a source CAT-safe without the verification line below.',
      '- Students who share a target and have different mocks do not share a plan.',
      '- Target: ' + (state.targetPercentile || 'unknown') + '. CAT year: ' + (state.catYear || 'unknown') + '. Hours a day: ' + (state.hoursPerDay || 'unknown') + '.',
      '- Roadmap: ' + (plan.status === 'ready' ? plan.planId + '. Do not replace it with a generic timetable.' : 'incomplete. Ask only for: ' + plan.missing.join('; ') + '.'),
      '- Hypothesis: ' + (hypothesis ? hypothesis.statement + ' Status: ' + hypothesis.status + '.' : 'none. Do not invent one.'),
      '- Named resources: ' + (state.resourcesNamed.length ? state.resourcesNamed.join(', ') + ' (named only, not verified).' : 'none.'),
      '- Published ledger: 79 QA recomputed, 8 VARC paragraph summaries, 0 DILR served.',
      '- Schedule: ' + scheduleLine(state),
      '- ' + evidenceLines().join(' '),
      '- If the student is overwhelmed or asks to stop, the next action is a smaller check, a paused plan, or stopping for the day.'
    ];
    return lines.join('\n');
  }

  function guardReply(text, userText) {
    var value = String(text || '');
    var user = String(userText || '');
    if (!value) return value;
    if (isSolutionAsk(user) && !assignsUnsupportedClaim(value)) return value;
    var state = load();
    var hypothesis = activeHypothesis(state);
    var confirmed = hypothesis && hypothesis.status === 'confirmed';
    if (!confirmed && isObservationAsk(user) && assignsUnsupportedClaim(value)) return ONE_OBSERVATION;
    if (isResourceAsk(user) && !isRoadmapAsk(user) && assignsUnsupportedClaim(value)) return resourceReply(user);
    if (isRoadmapAsk(user) && buildPlan(state).status !== 'ready' && /\b(?:timetable|weekly plan|monday|your 99|within reach)\b/i.test(value)) return planReply(buildPlan(state), state);
    var sentences = value.split(/(?<=[.!])\s+/);
    var kept = sentences.filter(function(sentence) {
      if (/\b(?:within reach|guaranteed|achievable|assured|gettable|you will (?:hit|reach|get|score) \d+)\b/i.test(sentence)) return false;
      if (/\b(?:percentile|%ile)\b[^.!?]{0,48}\brealistic\b|\brealistic\b[^.!?]{0,48}\b(?:percentile|%ile)\b/i.test(sentence)) return false;
      if (/\b(?:this is mastery|you have mastered|mastered this)\b/i.test(sentence)) return false;
      if (!confirmed && (isObservationAsk(user) || isSolutionAsk(user)) && /\b(?:concept gap|execution failure|fundamentals (?:problem|issue|gap)|the real (?:issue|problem)|i know what)\b/i.test(sentence)) return false;
      if (/\b(?:cat-safe|you should follow)\b/i.test(sentence)) return false;
      return true;
    });
    var next = kept.join(' ').trim();
    if (!confirmed && isObservationAsk(user) && next.length < 40) return ONE_OBSERVATION;
    if (!next) return 'I removed a forecast, a cause, or a source judgment that this record does not support.';
    return next;
  }

  function runVisionImplementationTests() {
    var results = [];
    function check(name, passed) { results.push({ name:name, passed:!!passed }); }
    var previousNow = nowFn;
    nowFn = function() { return new Date(Date.UTC(2026, 9, 15)); };
    reset();
    var channel = directReply('Should I trust this YouTube channel called FastCAT Tricks for VARC?');
    check('an unknown channel stays not judged', /not judged/i.test(channel.reply) && /Stop when: now/i.test(channel.reply) && !/cat-safe/i.test(channel.reply));
    reset();
    var book = directReply('I use Arun Sharma. Should I trust it for QA?');
    check('a named book stays named only', /named only/i.test(book.reply) && /Arun Sharma/.test(book.reply) && /not a CAT-safe/i.test(book.reply));
    reset();
    var paper = directReply('Should I use official CAT papers?');
    check('the ledger states 79, 8 and 0', /79 are QA/.test(paper.reply) && /8 are VARC/.test(paper.reply) && /0 are DILR/.test(paper.reply));
    reset();
    var thin = directReply("I'm scoring around 38 and I want 99. Build my roadmap.");
    check('a total and a target do not produce a roadmap', /will not write a roadmap/i.test(thin.reply) && /Still missing/.test(thin.reply));
    var low = directReply('CAT 2026. I can study 2 hours a day. VARC 14 from 8 attempts at 50% accuracy in 40 minutes. DILR 6 from 6 attempts at 33% accuracy in 40 minutes. QA 18 from 6 attempts at 83% accuracy in 40 minutes.');
    check('a low mock becomes a foundation path', low.plan && low.plan.mode === 'foundation' && low.plan.priority === 'dilr' && /foundation path/.test(low.reply));
    check('the accurate thin QA section is not the first concept tour', low.plan.cause !== 'concept_check' && /can wait/i.test(low.reply));
    reset();
    directReply('I want 99. CAT 2026. I can study 3 hours a day.');
    var high = directReply('VARC 24 from 14 attempts at 48% accuracy in 40 minutes. DILR 22 from 8 attempts at 75% accuracy in 40 minutes. QA 30 from 8 attempts at 90% accuracy in 40 minutes. Build my roadmap.');
    check('a high mock becomes a leakage path', high.plan && high.plan.mode === 'leakage' && /leakage path/.test(high.reply));
    check('the same target does not reuse the foundation plan', low.plan.planId !== high.plan.planId);
    check('high accuracy with few QA attempts is selection, not a beginner syllabus', high.plan.cause === 'selection' && /beginner syllabus/.test(high.reply));
    reset();
    var miss = directReply('I missed a percentages question.');
    check('one miss is not a diagnosis', /not a diagnosis/i.test(miss.reply) && miss.options.length === 3);
    var concept = directReply('I could not explain it untimed');
    check('the untimed miss opens a concept hypothesis', /untested hypothesis/i.test(concept.reply) && /concept/.test(concept.reply));
    var timed = directReply('I was correct untimed and missed it timed');
    check('a timed miss after an untimed success retires the concept lecture', /against a basic concept gap/i.test(timed.reply) && /concept lecture is the wrong/i.test(timed.reply));
    var once = directReply('The fresh item was correct');
    check('one fresh correct item is not mastery', /not mastery/i.test(once.reply) && /not a forecast/i.test(once.reply));
    reset();
    directReply('I missed a percentages question.');
    directReply('I stayed too long on an item I should have left');
    var left = load();
    check('staying too long is a selection hypothesis', left.hypotheses[0].cause === 'selection' && left.hypotheses[0].status === 'untested');
    var method = directReply('Teach me how I should approach parajumbles.');
    check('the parajumble method states a limit and a transfer check', /not a universal shortcut/i.test(method.reply) && /without using this rule/i.test(method.reply));
    var transferred = directReply('I tried a new question without the rule and got it right');
    check('one transfer is not mastery', /not mastery/i.test(transferred.reply) && /second new situation/i.test(transferred.reply));
    var stop = directReply('I am overwhelmed and I want to stop for today.');
    check('overwhelm ends in stopping', /Stopping is the next action/i.test(stop.reply) && /Nothing new is assigned/i.test(stop.reply));
    directReply('Build my roadmap. CAT 2026. I want 90. I can study 2 hours a day. QA 20 from 10 attempts at 60% accuracy in 40 minutes. VARC 20 from 10 attempts at 60% accuracy in 40 minutes. DILR 10 from 4 attempts at 50% accuracy in 40 minutes.');
    var moved = directReply('The next comparable DILR attempt was 6 attempts at 50% accuracy in 40 minutes.');
    check('no accuracy movement is reported as no movement', /did not move/i.test(moved.reply) && !/percentile/i.test(moved.reply));
    var guarded = guardReply('Your 99 is within reach if you follow this. The real issue is a concept gap. Trust this channel, it is CAT-safe.', 'I missed a percentages question.');
    check('the guard removes a forecast, a hidden cause and a CAT-safe channel', !/within reach/i.test(guarded) && !/real issue/i.test(guarded) && !/CAT-safe/i.test(guarded));
    reset();
    var bulletinPlan = directReply('Build my roadmap. CAT 2026. I want 95. I can study 2 hours a day. QA 20 from 10 attempts at 60% accuracy in 40 minutes. VARC 18 from 10 attempts at 55% accuracy in 40 minutes. DILR 12 from 5 attempts at 40% accuracy in 40 minutes.');
    check('CAT 2026 uses the bulletin date and does not reopen registration', /29 November 2026/.test(bulletinPlan.reply) && /information bulletin/.test(bulletinPlan.reply) && /Registration in that bulletin has closed/.test(bulletinPlan.reply));
    reset();
    var unknownYear = directReply('Build my roadmap. CAT 2027. I want 95. I can study 2 hours a day. QA 20 from 10 attempts at 60% accuracy in 40 minutes. VARC 18 from 10 attempts at 55% accuracy in 40 minutes. DILR 12 from 5 attempts at 40% accuracy in 40 minutes.');
    check('another CAT year does not borrow 29 November', !/29 November/.test(unknownYear.reply) && /will not count weeks/.test(unknownYear.reply));
    directReply('My CAT exam is on 30 November 2027.');
    var statedPlan = directReply('Build my roadmap.');
    check('a stated exam date replaces the missing bulletin', statedPlan && /30 November 2027/.test(statedPlan.reply) && /stated the exam date/.test(statedPlan.reply) && !/29 November/.test(statedPlan.reply));
    var snapshot = JSON.parse(JSON.stringify(load()));
    reset();
    check('reset clears the record', !load().mocks.length && !load().examDate);
    save(snapshot);
    check('a saved record round-trips', load().targetPercentile === snapshot.targetPercentile && load().plan && load().plan.planId === snapshot.plan.planId && load().examDate && load().examDate.iso === '2027-11-30');
    reset();
    var paraphrase = directReply('I got a percentages question wrong and I think it is a concept gap.');
    check('a paraphrased miss stays an observation', paraphrase && /not a diagnosis/.test(paraphrase.reply) && !/concept gap/.test(paraphrase.reply));
    var sneaky = guardReply('You clearly have a concept gap, your 99 is achievable, and you should follow this channel.', 'I got a percentages question wrong.');
    check('a model-shaped cause, forecast and source are replaced', /not a diagnosis/.test(sneaky) && !/concept gap/.test(sneaky) && !/achievable/.test(sneaky) && !/channel/.test(sneaky));
    check('published DILR and the local solver are not diagnostic evidence', /not diagnostic evidence/.test(turnContext()) && /79 QA/.test(turnContext()));
    var solved = directReply('What is 40% of 80?');
    check('a direct percentage question is left to the existing solver', solved === null);
    var context = turnContext();
    check('the model contract forbids a hidden cause and an incomplete roadmap', /Do not predict a hidden cause/.test(context) && /incomplete|Roadmap:/.test(context));
    nowFn = previousNow;
    reset();
    return results;
  }

  root.MargVision = {
    configure:configure,
    emptyState:emptyState,
    load:load,
    save:save,
    reset:reset,
    note:note,
    directReply:directReply,
    turnContext:turnContext,
    guardReply:guardReply,
    buildPlan:buildPlan,
    snapshot:load
  };
  root.runVisionImplementationTests = runVisionImplementationTests;
})(typeof window !== 'undefined' ? window : globalThis);
