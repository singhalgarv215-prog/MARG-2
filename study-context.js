/* Marg study context.
 *
 * One small, dependency-free module that owns everything about *material the
 * student is studying right now*:
 *   - recognising pasted passages / question sets / DILR sets as material
 *   - keeping that material as the active study context across turns
 *   - classifying each turn against it (claim evaluation, "now do questions")
 *   - telling the saved-question library when it must stay out of the way
 *   - near-duplicate detection for generated practice (names/numbers changed)
 *   - CAT-style layout parsing/rendering and continuation stitching
 *
 * It has no network or DOM dependency except where an adapter is injected, so
 * the same code runs in the browser and in the Node regression harness. */
(function (root) {
  'use strict';

  var STORAGE_KEY = 'marg_study_context';
  var MEMORY_KEY = 'marg_practice_memory';
  var MAX_MATERIAL_CHARS = 24000;
  var CONTEXT_TTL_MS = 36 * 60 * 60 * 1000;
  var RECENT_STUDY_MS = 3 * 60 * 60 * 1000;
  var MAX_STEPS = 24;
  var MEMORY_PER_SECTION = 40;

  var STOP = {};
  ('a an and are as at be but by for from has have in is it its of on or that the their there these they this to was were which while with not no nor so than then thus we you your i he she his her our can could may might must should would will do does did if into over under out up also more most such only other any each both between about after before during per via who whom what when where why how been being them his hers one two three four five six seven eight nine ten').split(' ').forEach(function (word) { STOP[word] = true; });

  var cfg = {
    scope: function (name) { return name; },
    storage: typeof root.localStorage !== 'undefined' ? root.localStorage : null,
    now: function () { return Date.now(); }
  };
  var state = null;
  var stateLoadedFor = '';

  function configure(options) {
    options = options || {};
    if (typeof options.scope === 'function') cfg.scope = options.scope;
    if (options.storage !== undefined) cfg.storage = options.storage;
    if (typeof options.now === 'function') cfg.now = options.now;
    state = null;
    stateLoadedFor = '';
  }

  function str(value) { return value === null || value === undefined ? '' : String(value); }
  function wordList(text) { return str(text).toLowerCase().replace(/[’‘]/g, "'").match(/[a-z0-9]+(?:'[a-z]+)?/g) || []; }
  function wordCount(text) { return (str(text).trim().match(/\S+/g) || []).length; }
  function hashString(value) {
    var h = 2166136261, s = str(value);
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(36);
  }
  function clip(text, max) { var s = str(text); return s.length > max ? s.slice(0, max) : s; }

  /* ------------------------------------------------------------------ */
  /* Framing: the student's own instruction around pasted material       */
  /* ------------------------------------------------------------------ */

  var FRAMING_SENTENCE = /^\s*(?:(?:ok(?:ay)?|so|alright|right|now|hi|hey|hello)\b[\s,.:;!-]*)*(?:this is|these are|here(?:'s| is| are)|below (?:is|are)|i(?:'m| am| have| 'll| will)\s+(?:pasting|sharing|sending|giving|attaching|going to (?:paste|share|send))|(?:let'?s|lets)\b|we(?:'ll| will| are going to|'re going to| shall| should (?:first|now|then))\b|after (?:that|this)\b|then (?:we|let'?s|i|you)\b|first(?:ly)?,?\s+(?:let|we|you|identify|find|tell|mark)|i want (?:you )?to\b|i'?d like (?:you )?to\b|(?:can|could|will|would) (?:you|we)\b|please\b|for each (?:passage|paragraph|para|text)\b|identify\b|tell me\b|my task\b|the task is\b|our task\b|read (?:this|these|the)\b|before (?:we|you|that)\b|once (?:we|you|that)\b|when (?:we|you)(?:'re| are)? (?:done|finished)\b)/i;
  var FRAMING_CUES = {
    intro: /\b(?:this is|these are|here(?:'s| is| are)|below (?:is|are))\s+(?:the |an? |my |our |some )?(?:\w+\s+){0,2}(?:article|passage|passages|paragraph|paragraphs|text|texts|rc|reading|set|question|questions|extract|excerpt)s?\b/i,
    activity: /\b(?:let'?s|lets|we(?:'ll| will| shall| are going to|'re going to)|i want to|i'?d like to)\s+(?:first\s+|now\s+|then\s+)?(?:identify|find|mark|note|map|analy[sz]e|break down|read|go through|work through|do|solve|discuss|dissect|evaluate|look at|practi[sc]e|attempt)\b/i,
    claims: /\b(?:claims?|main (?:idea|claim|point)|central (?:idea|claim|theme)|thesis|author'?s (?:claim|view|stance|position)|gist|summary of)\b/i,
    questionsLater: /\b(?:after (?:that|this)|then|later|next|once (?:we|that|this)[^.?!]{0,30}(?:done|finish\w*))\b[^.?!\n]{0,60}\b(?:questions?|options?|mcqs?)\b|\bquestions?\b[^.?!\n]{0,30}\b(?:after (?:that|this)|later|next)\b/i,
    eachPassage: /\b(?:each|every|all|the)\s+(?:of the\s+)?(?:passages?|paragraphs?|paras?|texts?)\b|\bfor each\b/i
  };

  function detectFraming(text) {
    var value = str(text);
    return {
      intro: FRAMING_CUES.intro.test(value),
      activity: FRAMING_CUES.activity.test(value),
      claims: FRAMING_CUES.claims.test(value),
      questionsLater: FRAMING_CUES.questionsLater.test(value),
      eachPassage: FRAMING_CUES.eachPassage.test(value)
    };
  }

  function splitSentences(text) {
    return str(text).match(/[^.!?\n]+(?:[.!?]+["”’)]*|$)\s*|\n+/g) || [];
  }

  // Moves the student's own instruction sentences out of the material body.
  // Material that starts with "This is the article. Let's ..." must be stored
  // without that lead-in, but a body paragraph is never removed.
  function separateInstruction(text) {
    var body = str(text).replace(/\r/g, '').trim();
    var lead = [], tail = [];
    var paragraphs = body.split(/\n\s*\n/);
    function paragraphIsInstruction(paragraph) {
      var sentences = splitSentences(paragraph).filter(function (s) { return s.trim(); });
      return sentences.length > 0 && wordCount(paragraph) <= 70 && sentences.every(function (s) { return FRAMING_SENTENCE.test(s) || wordCount(s) <= 5; });
    }
    while (paragraphs.length > 1 && paragraphIsInstruction(paragraphs[0])) lead.push(paragraphs.shift());
    while (paragraphs.length > 1 && paragraphIsInstruction(paragraphs[paragraphs.length - 1])) tail.unshift(paragraphs.pop());
    // Instruction sentences glued to the start/end of a single block.
    var first = paragraphs[0];
    var sentences = splitSentences(first);
    var cut = 0;
    while (cut < sentences.length - 1 && cut < 3 && FRAMING_SENTENCE.test(sentences[cut]) && wordCount(sentences[cut]) <= 40) cut++;
    if (cut > 0) { lead.push(sentences.slice(0, cut).join('').trim()); paragraphs[0] = sentences.slice(cut).join('').trim(); }
    var lastIndex = paragraphs.length - 1;
    var lastSentences = splitSentences(paragraphs[lastIndex]).filter(function (s) { return s.trim(); });
    var tailCut = 0;
    while (tailCut < lastSentences.length - 1 && tailCut < 3 && FRAMING_SENTENCE.test(lastSentences[lastSentences.length - 1 - tailCut]) && wordCount(lastSentences[lastSentences.length - 1 - tailCut]) <= 40) tailCut++;
    if (tailCut > 0) {
      tail.unshift(lastSentences.slice(lastSentences.length - tailCut).join('').trim());
      paragraphs[lastIndex] = lastSentences.slice(0, lastSentences.length - tailCut).join('').trim();
    }
    return { instruction: lead.concat(tail).join('\n').trim(), body: paragraphs.filter(function (p) { return p.trim(); }).join('\n\n').trim() };
  }

  /* ------------------------------------------------------------------ */
  /* Material analysis                                                   */
  /* ------------------------------------------------------------------ */

  var PASSAGE_LABEL = /^\s*(?:\*\*)?\s*(?:p|para(?:graph)?|passage|text|extract|excerpt|article)\s*[-#.:]?\s*(\d{1,2}|[A-Ea-e])\s*(?:\*\*)?\s*[:.)\-–—]?\s*/i;
  var OPTION_LINE = /^\s*(?:\*\*)?\(?([A-Ea-e])(?:\)|\.|:)(?:\*\*)?\s+\S/;

  function countOptionLines(text) {
    var lines = str(text).split('\n');
    var count = 0;
    lines.forEach(function (line) { if (OPTION_LINE.test(line)) count++; });
    if (count < 3) {
      var inline = str(text).match(/\(?\bA[).]\s+\S[^\n]*?\s\(?B[).]\s+\S[^\n]*?\s\(?C[).]\s+\S/);
      if (inline) count = Math.max(count, 3);
    }
    return count;
  }

  function splitLabelledPassages(text) {
    var lines = str(text).split('\n');
    var passages = [];
    var current = null;
    lines.forEach(function (line) {
      var match = line.match(PASSAGE_LABEL);
      var looksLikeLabel = match && (line.length - match[0].length === 0 || /^[:.)\-–—]|^\s*\S/.test(line.slice(match[0].length - 1)));
      // "P1", "Passage 2" at the start of a line; "Paragraph" prose such as
      // "Text of the argument" is excluded because it needs a number/letter.
      if (looksLikeLabel && /^\s*(?:\*\*)?\s*(?:p|para(?:graph)?|passage|text|extract|excerpt|article)\s*[-#.:]?\s*(?:\d{1,2}|[A-E])\b/i.test(line)) {
        current = { label: 'P' + match[1].toUpperCase(), text: line.slice(match[0].length).trim() };
        passages.push(current);
      } else if (current) current.text += (current.text ? '\n' : '') + line;
    });
    passages.forEach(function (passage) { passage.text = passage.text.trim(); passage.words = wordCount(passage.text); });
    return passages.filter(function (passage) { return passage.words >= 15; });
  }

  function classifySection(text) {
    var value = str(text).toLowerCase();
    var dilr = (value.match(/\b(?:clues?|conditions?|constraints?|arranged|seated|ranked|rank|schedule[ds]?|slots?|tournament|matches|table|chart|bar graph|pie chart|line graph|each (?:person|participant|team|employee)|exactly one|at most|at least|immediately (?:left|right|next))\b/g) || []).length;
    var qa = (value.match(/\b(?:ratio|percent(?:age)?|profit|loss|speed|distance|average|integer|remainder|triangle|circle|area|volume|probability|equation|roots?|sum of|product of|value of|how many (?:integers|numbers)|\d+\s*[x×*/+\-=^]\s*\d+)\b|%|₹|rs\./g) || []).length;
    var varc = (value.match(/\b(?:author|passage|argues?|suggests?|claims?|however|moreover|whereas|therefore|although|nevertheless|central idea|primary purpose|inference|tone|according to)\b/g) || []).length;
    if (qa >= 3 && qa >= dilr && qa >= varc) return 'qa';
    if (dilr >= 3 && dilr > varc) return 'dilr';
    if (varc >= 2 || wordCount(text) >= 100) return 'varc';
    if (qa >= 1) return 'qa';
    return 'unknown';
  }

  function firstPersonDensity(text) {
    var tokens = wordList(text);
    if (!tokens.length) return 0;
    var count = 0;
    tokens.forEach(function (token) { if (token === 'i' || token === 'my' || token === 'me' || token === "i'm" || token === "i've" || token === "i'd" || token === "i'll" || token === 'mine') count++; });
    return count / tokens.length;
  }

  function looksLikeProse(text) {
    var words = wordCount(text);
    if (words < 40) return false;
    var sentences = splitSentences(text).filter(function (s) { return wordCount(s) >= 4; });
    if (sentences.length < 3) return false;
    var average = words / Math.max(1, sentences.length);
    if (average < 8 || average > 70) return false;
    var tokens = wordList(text);
    var digits = tokens.filter(function (t) { return /^\d+$/.test(t); }).length;
    return digits / Math.max(1, tokens.length) < 0.08;
  }

  function analyzeMaterial(text) {
    var raw = str(text).replace(/\r/g, '').trim();
    var result = {
      isMaterial: false, kind: '', section: 'unknown', words: wordCount(raw), body: raw, instruction: '',
      passages: [], optionCount: 0, questionCount: 0, framing: detectFraming(raw), hasQuestions: false
    };
    if (!raw) return result;
    var split = separateInstruction(raw);
    var body = split.body || raw;
    result.instruction = split.instruction;
    result.body = body;
    var optionCount = countOptionLines(body);
    var questionMarks = (body.match(/\?/g) || []).length;
    var numbered = (body.match(/(?:^|\n)\s*(?:\*\*)?(?:Q(?:uestion)?\.?\s*)?\d{1,2}\s*[).:]\s+\S/gi) || []).length;
    result.optionCount = optionCount;
    result.questionCount = Math.max(numbered, optionCount >= 3 ? Math.round(optionCount / 4) : 0);
    result.hasQuestions = optionCount >= 3 && (questionMarks >= 1 || numbered >= 1);
    var labelled = splitLabelledPassages(body);
    var bodyWords = wordCount(body);
    var density = firstPersonDensity(body);
    var framing = result.framing;
    var statedMaterial = framing.intro || framing.activity || framing.claims || framing.questionsLater;
    var prose = looksLikeProse(body);

    if (result.hasQuestions && bodyWords >= 20) {
      var beforeQuestions = body.split(/\n\s*(?:\*\*)?(?:Q(?:uestion)?\.?\s*)?1\s*[).:]/i)[0];
      result.kind = wordCount(beforeQuestions) >= 120 && beforeQuestions !== body ? 'passage_with_questions' : 'question_set';
      result.section = classifySection(body);
      result.isMaterial = true;
    } else if (labelled.length >= 2) {
      result.kind = 'passage_set';
      result.passages = labelled;
      result.section = 'varc';
      result.isMaterial = true;
    } else if (prose && bodyWords >= 120 && (density <= 0.03 || statedMaterial)) {
      var paragraphs = body.split(/\n\s*\n/).map(function (p) { return p.trim(); }).filter(function (p) { return wordCount(p) >= 25; });
      if (framing.eachPassage && paragraphs.length >= 2 && paragraphs.length <= 8) {
        result.kind = 'passage_set';
        result.passages = paragraphs.map(function (p, index) { return { label: 'P' + (index + 1), text: p, words: wordCount(p) }; });
      } else {
        result.kind = 'passage';
        result.passages = [{ label: 'P1', text: body, words: bodyWords }];
      }
      result.section = classifySection(body) === 'unknown' ? 'varc' : classifySection(body);
      if (result.section !== 'varc' && result.section !== 'dilr') result.section = 'varc';
      result.isMaterial = true;
    } else if (prose && bodyWords >= 60 && framing.intro && density <= 0.05) {
      result.kind = 'passage';
      result.passages = [{ label: 'P1', text: body, words: bodyWords }];
      result.section = 'varc';
      result.isMaterial = true;
    } else if (bodyWords >= 60 && classifySection(body) === 'dilr' && ((body.match(/\b(?:clue|condition|constraint|table|data)\b/gi) || []).length >= 2 || /\|.+\|/.test(body))) {
      result.kind = 'dilr_set';
      result.section = 'dilr';
      result.isMaterial = true;
    }
    if (result.isMaterial && !result.passages.length && result.kind !== 'question_set' && result.kind !== 'dilr_set' && result.kind !== 'passage_with_questions') {
      result.passages = [{ label: 'P1', text: body, words: bodyWords }];
    }
    return result;
  }

  /* ------------------------------------------------------------------ */
  /* Persistent active study context                                     */
  /* ------------------------------------------------------------------ */

  function storageKey() { return cfg.scope(STORAGE_KEY); }

  function loadState() {
    var key = storageKey();
    if (state && stateLoadedFor === key) return state;
    state = null;
    stateLoadedFor = key;
    try {
      var raw = cfg.storage && cfg.storage.getItem(key);
      var parsed = raw ? JSON.parse(raw) : null;
      if (parsed && parsed.text && parsed.setAt) state = parsed;
    } catch (e) { state = null; }
    return state;
  }

  function persist() {
    var key = storageKey();
    stateLoadedFor = key;
    try {
      if (!cfg.storage) return;
      if (state) cfg.storage.setItem(key, JSON.stringify(state));
      else cfg.storage.removeItem(key);
    } catch (e) { /* storage full or blocked: the in-memory context still works */ }
  }

  function getContext() {
    var ctx = loadState();
    if (!ctx) return null;
    if (cfg.now() - Number(ctx.updatedAt || ctx.setAt || 0) > CONTEXT_TTL_MS) return null;
    return ctx;
  }

  function clearContext() { state = null; persist(); }

  function setContext(analysis, rawMessage) {
    var existing = getContext();
    var body = clip(analysis.body, MAX_MATERIAL_CHARS);
    var now = cfg.now();
    var sameMaterial = existing && existing.hash === hashString(body);
    if (sameMaterial) {
      existing.updatedAt = now;
      state = existing;
      persist();
      return existing;
    }
    // A newly labelled passage ("P2: ...") extends the same study session.
    var appendLabel = existing && analysis.kind === 'passage' && /^\s*(?:\*\*)?\s*(?:p|passage|para(?:graph)?|text)\s*[-#.:]?\s*\d{1,2}\b/i.test(str(rawMessage)) &&
      existing.passages && existing.passages.length && now - existing.updatedAt < RECENT_STUDY_MS;
    if (appendLabel) {
      var labelMatch = str(rawMessage).match(PASSAGE_LABEL);
      var label = labelMatch ? 'P' + labelMatch[1].toUpperCase() : 'P' + (existing.passages.length + 1);
      if (!existing.passages.some(function (p) { return p.label === label; })) {
        existing.passages.push({ label: label, text: analysis.body.replace(PASSAGE_LABEL, '').trim() });
        existing.text = clip(existing.passages.map(function (p) { return p.label + '\n' + p.text; }).join('\n\n'), MAX_MATERIAL_CHARS);
        existing.hash = hashString(existing.text);
        existing.updatedAt = now;
        state = existing;
        persist();
        return existing;
      }
    }
    state = {
      id: 'study-' + now.toString(36) + '-' + hashString(body).slice(0, 5),
      version: 1,
      kind: analysis.kind,
      section: analysis.section,
      text: body,
      hash: hashString(body),
      passages: (analysis.passages || []).map(function (p) { return { label: p.label, text: clip(p.text, 9000) }; }),
      instruction: clip(analysis.instruction, 600),
      framing: analysis.framing,
      setAt: now,
      updatedAt: now,
      pendingTask: analysis.framing && analysis.framing.claims ? 'claims' : (analysis.framing && analysis.framing.questionsLater ? 'questions' : ''),
      questionsGenerated: 0,
      steps: []
    };
    persist();
    return state;
  }

  function recordStep(role, label, text) {
    var ctx = getContext();
    if (!ctx) return null;
    ctx.steps = ctx.steps || [];
    ctx.steps.push({ role: role, label: clip(label, 24), text: clip(str(text).replace(/\s+/g, ' ').trim(), 520), at: cfg.now() });
    if (ctx.steps.length > MAX_STEPS) ctx.steps = ctx.steps.slice(-MAX_STEPS);
    ctx.updatedAt = cfg.now();
    state = ctx;
    persist();
    return ctx;
  }

  function updateContext(patch) {
    var ctx = getContext();
    if (!ctx) return null;
    Object.keys(patch || {}).forEach(function (key) { ctx[key] = patch[key]; });
    ctx.updatedAt = cfg.now();
    state = ctx;
    persist();
    return ctx;
  }

  /* ------------------------------------------------------------------ */
  /* Turn classification                                                 */
  /* ------------------------------------------------------------------ */

  var QUESTION_VERBS = '(?:do|start|begin|move (?:on )?to|go (?:on )?to|get (?:to|into)|try|attempt|give me|give us|make|create|generate|frame|set|write|ask|prepare|build|draft|send)';
  var QUESTION_REQUEST = new RegExp('\\b' + QUESTION_VERBS + '\\s+(?:me\\s+|us\\s+)?(?:the\\s+|some\\s+|a few\\s+|a couple of\\s+|a set of\\s+|\\d{1,2}\\s+|one\\s+|two\\s+|three\\s+|four\\s+|five\\s+|six\\s+|more\\s+)?(?:cat[- ]?(?:style|level)\\s+|rc\\s+|varc\\s+|fresh\\s+|new\\s+|actual\\s+)*(?:questions?|mcqs?|qs)\\b', 'i');
  var QUESTION_ASKING_HOW = /^\s*(?:how|why|what|when|where|which|should|is|are|does|do i|can i|am i)\b|\b(?:how|why) (?:do|should|can|to)\b/i;
  var QUESTION_REQUEST_DIRECT = /^\s*(?:ok(?:ay)?|alright|so|now|next)?[\s,.]*(?:questions?|mcqs?)(?:\s+(?:now|please|next|time))?\s*[.!?]*\s*$|\b(?:questions?\s+(?:now|time|next)|ready for (?:the\s+)?questions?|move to (?:the\s+)?questions?|on to (?:the\s+)?questions?)\b/i;
  var QUESTION_COUNT = /\b(\d{1,2}|one|two|three|four|five|six|seven|eight)\s+(?:cat[- ]?(?:style|level)\s+|rc\s+|varc\s+|fresh\s+|new\s+)*(?:questions?|mcqs?)\b/i;
  var NUMBER_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8 };
  var NEW_PRACTICE_REQUEST = /\b(?:fresh|new|another|different|next)\s+(?:cat[- ]?(?:style|length|level)\s+)?(?:passage|rc|set|test|sectional)\b|\b(?:qa|quant|quants|dilr|lrdi|sectional|mock|percentages?|ratios?|algebra|geometry|probability|permutation|combinations?|profit|number systems?|mensuration|logarithms?|time[- ]speed)\b/i;
  var MATERIAL_DEIXIS = /\b(?:this|the same|same|these|above|that|our|the)\s+(?:article|passage|passages|paragraphs?|text|extract|material|set)\b|\bfrom (?:it|them|that|this)\b/i;
  var ANALYSIS_LABEL = /^\s*(?:\*\*)?\s*(?:p|para(?:graph)?|passage|text|article)\s*[-#.:]?\s*\d{1,2}\b/i;
  var ANALYSIS_KEYWORD = /^\s*(?:\*\*)?\s*(?:claim|main (?:idea|claim|point)|central (?:idea|claim|theme)|thesis|author'?s (?:claim|view|stance|position)|the (?:claim|main idea|central idea|author)|i think (?:the )?(?:claim|author|passage)|my (?:claim|answer|summary|reading)|tone|purpose|conclusion)\b/i;
  var EVALUATE_CUE = /\b(?:is (?:this|my|that|the) (?:claim|answer|summary|reading|understanding) (?:right|correct|good|fine|ok(?:ay)?)|(?:check|evaluate|review|assess|rate|mark)\s+(?:my|this)\b|am i (?:right|correct|on track)|did i (?:get|miss)|how(?:'s| is) (?:this|my))/i;
  var FOLLOWUP_DEIXIS = /\b(?:this|that|the|these)\s+(?:passage|article|claim|paragraph|para|question|option|answer|set)\b|\bP\s*\d\b|\bpara(?:graph)?\s*\d|\bq\s*\d{1,2}\b|\bnext (?:one|passage|question|paragraph)\b|\boption\s+[A-E]\b/i;
  var CONTINUE_CUE = /^\s*(?:ok(?:ay)?[\s,.]*)?(?:continue|go on|carry on|next|next one|proceed|keep going|go ahead)[.!\s]*$/i;

  function contentTokens(text) {
    return wordList(text).filter(function (token) { return token.length > 2 && !STOP[token] && !/^\d+$/.test(token); });
  }

  function overlapWithMaterial(message, material) {
    var messageTokens = contentTokens(message);
    if (messageTokens.length < 4) return 0;
    var set = {};
    contentTokens(material).forEach(function (token) { set[token] = true; });
    var seen = {}, unique = 0, hits = 0;
    messageTokens.forEach(function (token) {
      if (seen[token]) return;
      seen[token] = true; unique++;
      if (set[token]) hits++;
    });
    return unique ? hits / unique : 0;
  }

  function requestedQuestionCount(message) {
    var match = str(message).match(QUESTION_COUNT);
    if (!match) return 0;
    var raw = match[1].toLowerCase();
    var value = NUMBER_WORDS[raw] || Number(raw);
    return value >= 1 && value <= 12 ? value : 0;
  }

  function isExplicitSavedReference(message) {
    var text = str(message);
    return /\b(?:saved|uploaded|earlier|previous|yesterday(?:'s)?|last week(?:'s)?)\s+(?:[\w-]+\s+){0,4}(?:pages?|images?|photos?|pictures?|screenshots?|library)\b/i.test(text) ||
      /\b(?:pages?|images?|photos?|pictures?|screenshots?)\b[\s\S]{0,40}\b(?:yesterday|uploaded|saved|earlier)\b/i.test(text) ||
      /\b(?:from|in|out of)\s+(?:my\s+)?(?:question\s+)?library\b/i.test(text) ||
      /\b(?:the|those|these|my|first|last|previous|earlier|uploaded|shared)\s+(?:(?:\d+|one|two|three|four|five|six)\s+)?(?:pictures?|photos?|images?|pages?|screenshots?)\b/i.test(text);
  }

  /* Returns { type, owns, analysis?, count?, label? }.
   *   owns: this turn belongs to the study-context flow (so the saved-source
   *         library, practice launchers and intake gates must stay out).
   * Types: material | analysis_step | generate_questions | followup | continue | none */
  function classifyTurn(message, options) {
    options = options || {};
    var text = str(message).trim();
    var none = { type: 'none', owns: false };
    if (!text || options.hasImages) return none;
    var ctx = options.context === undefined ? getContext() : options.context;
    var analysis = analyzeMaterial(text);
    var words = wordCount(text);
    var framing = analysis.framing;

    if (analysis.isMaterial) {
      var hasStatedPurpose = framing.intro || framing.activity || framing.claims || framing.questionsLater;
      var proseMaterial = analysis.kind === 'passage' || analysis.kind === 'passage_set';
      return {
        type: 'material', analysis: analysis,
        // A raw question set keeps its established attempt-first flow unless
        // the student framed it as a study activity.
        owns: proseMaterial || analysis.kind === 'dilr_set' && hasStatedPurpose || hasStatedPurpose
      };
    }
    if (!ctx) return none;
    if (isExplicitSavedReference(text) && words <= 40) return none;
    var recent = cfg.now() - Number(ctx.updatedAt || ctx.setAt || 0) < RECENT_STUDY_MS;

    var asksQuestions = (QUESTION_REQUEST.test(text) && !QUESTION_ASKING_HOW.test(text)) || QUESTION_REQUEST_DIRECT.test(text);
    if (asksQuestions && words <= 60) {
      var wantsOtherPractice = NEW_PRACTICE_REQUEST.test(text) && !MATERIAL_DEIXIS.test(text);
      var otherSection = /\b(?:qa|quant|quants|dilr|lrdi|percentages?|ratios?|algebra|geometry|probability|permutation|profit|number systems?)\b/i.test(text) && ctx.section === 'varc' && !MATERIAL_DEIXIS.test(text);
      if (!wantsOtherPractice && !otherSection) {
        return { type: 'generate_questions', owns: true, count: requestedQuestionCount(text), context: ctx };
      }
    }
    if (words <= 260 && (ANALYSIS_LABEL.test(text) || ANALYSIS_KEYWORD.test(text) || EVALUATE_CUE.test(text) && recent)) {
      var labelMatch = text.match(ANALYSIS_LABEL);
      var idMatch = labelMatch && labelMatch[0].match(/(\d{1,2})/);
      return { type: 'analysis_step', owns: true, label: idMatch ? 'P' + idMatch[1] : '', context: ctx };
    }
    if (recent && words >= 6 && words <= 200 && ctx.pendingTask === 'claims' && overlapWithMaterial(text, ctx.text) >= 0.25) {
      return { type: 'analysis_step', owns: true, label: '', context: ctx };
    }
    if (recent && CONTINUE_CUE.test(text) && ctx.pendingTask) return { type: 'continue', owns: true, context: ctx };
    if (recent && words <= 80 && FOLLOWUP_DEIXIS.test(text)) return { type: 'followup', owns: true, context: ctx };
    return none;
  }

  /* Saved-question retrieval must never run on a turn that is about material
   * the student supplied in this conversation. Genuine library requests are
   * short and explicit ("reopen yesterday's saved page"), so those still pass. */
  function shouldBypassSavedRetrieval(message, options) {
    options = options || {};
    var text = str(message).trim();
    if (!text) return false;
    var words = wordCount(text);
    var explicit = isExplicitSavedReference(text);
    if (analyzeMaterial(text).isMaterial) return true;
    if (explicit && words <= 120) return false;
    if (words > 70) return true;
    var ctx = options.context === undefined ? getContext() : options.context;
    var studyAt = ctx ? Number(ctx.updatedAt || ctx.setAt || 0) : 0;
    var newest = Math.max(studyAt, Number(options.activeExerciseAt || 0));
    if (!newest) return false;
    // A saved question that was opened after the current study material (or
    // generated exercise) is the newer subject of conversation.
    if (options.savedSetAt && Number(options.savedSetAt) > newest) return false;
    if (ctx && classifyTurn(text, { context: ctx }).owns) return true;
    var recent = cfg.now() - newest < RECENT_STUDY_MS;
    var numberedReference = /\b(?:q(?:uestion)?\s*[-:#.]?\s*\d{1,3}|option\s+[A-E]|(?:first|second|third|fourth|fifth|last)\s+question)\b/i.test(text);
    var shortFollowup = /^(?:why|how|this(?: one)?|that(?: one)?|the above(?: question)?|explain|next|give (?:me )?the answer|solve this)[?.!\s]*$/i.test(text);
    return recent && (numberedReference || shortFollowup);
  }

  /* ------------------------------------------------------------------ */
  /* Prompt blocks                                                       */
  /* ------------------------------------------------------------------ */

  var STUDY_LAYOUT_CONTRACT =
    'LAYOUT CONTRACT (the app renders this as a CAT-style page, so follow it exactly):\n' +
    '- Passages: a line "Passage 1" (or "Passage" for a single one), then short paragraphs separated by blank lines.\n' +
    '- Questions: blank line, then "Q1. <stem>" on one line, then four option lines "A. ...", "B. ...", "C. ...", "D. ..." — one option per line, never inline.\n' +
    '- Keep each question visually separate from the next with a blank line. Never merge two questions into one paragraph.\n' +
    '- Solutions, only when requested: "Answer: B" on its own line, then "Explanation: ..." (2-4 short sentences).\n' +
    '- DILR: a "Set" or "Data" label, the setup in short blocks (or a table using | separators), then Q1., Q2. in the same form.\n' +
    '- No markdown headings, no horizontal rules, no emoji.';

  var QUALITY_BRIEF = {
    varc: 'CAT VARC QUALITY BAR: write like Indian-exam RC sources (essays and long-form from philosophy, economics, history of science, linguistics, art, anthropology). Passage 450-520 words, 4 paragraphs, with a central claim, a qualification or counter-move, and a shift in the author\'s position; no list of facts, no textbook neutrality. Questions test structure and stance (primary purpose, what an example is used for, what the author would most likely agree with, how paragraph 3 relates to paragraph 1, tone, inference), not fact lookup. Every wrong option must be a believable misreading: scope stretched, force exaggerated, author\'s view confused with a view the author reports, true-to-the-world but not in the passage, or a reversal of the qualification. Two options should be genuinely close. Exactly one is defensible from the text alone.',
    qa: 'CAT QA QUALITY BAR: statements are concise; the work is in finding the representation (hidden ratio, conservation, bounds, symmetry, remainder structure, similarity) rather than in long calculation or ugly numbers. No direct formula substitution, no school-level one-step problems, no textbook word problems about "a man buys a cow". Include at least one question whose route is a short non-obvious insight. Wrong options are results of identifiable slips (missed constraint, wrong base for percentage, off-by-one, using sum for product). Every needed fact is in the stem; the answer is unique.',
    dilr: 'CAT DILR QUALITY BAR: a set has 6-8 entities (or an equivalent table/graph) and 6-9 interacting clues; the first representation should be findable but not trivial; at least three real deductions come from combining clues; cases narrow only through a decisive bound. Questions vary: must-be-true / cannot-be, count of cases, exact value or optimum, and a local "if X then ..." hypothetical. Setup is unambiguous and self-contained; no brute-force enumeration; every clue is necessary; options are plausible outcomes of partial reasoning.',
    study: 'EXPLANATION QUALITY BAR: state the verdict first, then the decisive evidence (quote or point to the exact sentence), then the precise gap — scope, ownership, strength of claim, or missing qualification. Name what to do differently next time in one sentence. No generic encouragement, no restating the passage.'
  };

  function qualityBrief(section) {
    var key = section === 'rc' || section === 'varc' || section === 'va' ? 'varc' : section === 'lrdi' ? 'dilr' : section;
    return (QUALITY_BRIEF[key] || '') + ' Original writing only: the library below calibrates difficulty and style and must never be copied, paraphrased or number-swapped.';
  }

  function materialForPrompt(ctx, limit) {
    var text = str(ctx && ctx.text);
    limit = limit || 14000;
    if (text.length <= limit) return text;
    return text.slice(0, Math.floor(limit * 0.7)) + '\n[... middle of the material omitted for length ...]\n' + text.slice(-Math.floor(limit * 0.3));
  }

  function stepsForPrompt(ctx, count) {
    var steps = (ctx && ctx.steps || []).slice(-(count || 10));
    if (!steps.length) return '';
    return steps.map(function (step) { return '- ' + (step.role === 'student' ? 'Student' : 'Marg') + (step.label ? ' (' + step.label + ')' : '') + ': ' + step.text; }).join('\n');
  }

  function buildStudyDirective(turn, ctx, options) {
    options = options || {};
    if (!ctx) return '';
    var type = turn && turn.type || 'followup';
    var kind = ctx.kind === 'passage_set' ? 'a set of ' + (ctx.passages || []).length + ' passages (' + (ctx.passages || []).map(function (p) { return p.label; }).join(', ') + ')'
      : ctx.kind === 'passage' ? 'a single passage' : ctx.kind === 'passage_with_questions' ? 'a passage with its questions'
        : ctx.kind === 'dilr_set' ? 'a DILR set' : 'a question set';
  var out = '\n\nACTIVE STUDY MATERIAL — the student supplied this in THIS conversation. It is the only source for this turn.\n' +
      'Material: ' + kind + ' (section: ' + str(ctx.section).toUpperCase() + ').\n' +
      '<<<MATERIAL\n' + materialForPrompt(ctx) + '\nMATERIAL>>>\n';
    var history = stepsForPrompt(ctx, 12);
    if (history) out += 'Study activity so far on this material:\n' + history + '\n';
    if (ctx.instruction) out += 'The student\'s own plan for this material: ' + ctx.instruction + '\n';
    out += '\nSTUDY TURN CONTRACT:\n' +
      '- Work from the material above. Never say you found several saved sources, never ask the student to re-send, re-upload or paste it again, and never search saved questions or earlier pages.\n' +
      '- This is a study session, not a diagnosis. Do not open a diagnostic intake, mention a weakness hypothesis, or end with a generic engagement question.\n' +
      '- Be as long as the task needs and finish every sentence and every option; do not compress to a short reply, and never stop mid-question.\n';
    if (type === 'material') {
      out += '- The student has just supplied the material. Do exactly what they asked of it. If they described a plan (for example, "identify the claim for each passage, then do questions"), confirm it in one short sentence and start step one: name the first passage to work on and ask for their claim in one sentence. Do not summarise or analyse the material unprompted, and do not give the claim yourself.\n';
    } else if (type === 'analysis_step') {
      out += '- The student is giving their reading of ' + (turn.label || 'a passage') + '. Evaluate it against that passage only: verdict first (right / partly right / off), then the decisive sentence or phrase from the passage, then the precise gap (scope, ownership, strength, missing qualification). If their claim is off, give the best one-sentence claim; if it is right, do not add padding. Then name the next passage in the sequence. Do not reveal claims for passages they have not attempted.\n';
    } else if (type === 'generate_questions') {
      out += '- The student is ready for questions on this same material. Write original CAT-style questions only from this material (do not switch to another passage or the saved library).\n';
    } else if (type === 'continue') {
      out += '- Continue the study sequence from where the last Marg reply stopped, using the study activity above.\n';
    } else {
      out += '- Answer the student\'s newest message using this material and the study activity so far.\n';
    }
    out += '\n' + qualityBrief(ctx.section === 'dilr' ? 'dilr' : ctx.section === 'qa' ? 'qa' : 'study') + '\n' + STUDY_LAYOUT_CONTRACT;
    return out;
  }

  function buildQuestionsFromMaterialPrompt(ctx, options) {
    options = options || {};
    var count = Math.max(1, Math.min(8, Number(options.count) || (ctx && ctx.passages && ctx.passages.length > 1 ? Math.min(8, ctx.passages.length * 2) : 4)));
    var avoid = options.avoidBlock ? '\n' + options.avoidBlock : '';
    var exemplars = options.exemplars ? '\n' + options.exemplars : '';
    var section = ctx && ctx.section === 'dilr' ? 'dilr' : ctx && ctx.section === 'qa' ? 'qa' : 'varc';
    var passageLine = ctx && ctx.passages && ctx.passages.length > 1
      ? 'The material has ' + ctx.passages.length + ' labelled passages (' + ctx.passages.map(function (p) { return p.label; }).join(', ') + '). Each question must name which passage it is on when more than one passage could apply, and the set should cover every passage.'
      : 'The material is a single passage.';
    var contextLine = options.stepsBlock ? '\nStudy activity so far (use it: do not test what the student already got right in the same way; probe what they got wrong or half right):\n' + options.stepsBlock : '';
    return 'Create exactly ' + count + ' original CAT-style multiple-choice questions strictly on the material below. Every question must be answerable from the material alone, with exactly one defensible option.\n' +
      passageLine + '\n' +
      'Mix question types across: primary purpose / central claim, what an example or detail is used to show, inference the author would accept, relationship between parts, tone or stance, and one close-option question that turns on scope or qualification. No fact-lookup question, no question that repeats another\'s skeleton.\n' +
      qualityBrief(section) + avoid + exemplars + contextLine + '\n\n' +
      '<<<MATERIAL\n' + materialForPrompt(ctx, 12000) + '\nMATERIAL>>>\n\n' +
      'Silently solve every question and verify the key before answering. Return only valid JSON of this exact shape: {"questions":[{"passage":"P1 or empty","q":"complete question ending with ? or an explicit task","options":["A. ...","B. ...","C. ...","D. ..."],"correct":0,"explanation":"2-3 sentences: why the key is right and the specific trap in the closest wrong option","trap_type":"short label","sufficiency_check":"evidence sentence from the material that fixes the key","option_check":"why each other option fails"}]}. Options must be four distinct strings that each begin with "A. ", "B. ", "C. ", "D. ". "correct" is the zero-based index.';
  }

  /* ------------------------------------------------------------------ */
  /* Similarity / novelty                                                */
  /* ------------------------------------------------------------------ */

  // Names and numbers carry no structural identity. A question that differs
  // only in them is the same question.
  function maskedWords(text) {
    var value = str(text).replace(/[’‘]/g, "'");
    value = value.replace(/(?:₹|rs\.?\s*)?\d[\d,]*(?:\.\d+)?%?/gi, ' # ');
    value = value.replace(/([.!?]\s+|^|\n)([A-Z][a-z]+)/g, '$1\u0001$2');
    value = value.replace(/\b[A-Z][a-z]{2,}\b/g, ' @ ').replace(/\b[A-Z]\b/g, ' @ ').replace(/\u0001/g, '');
    return (value.toLowerCase().match(/[a-z#@]+/g) || []).filter(function (w) { return w !== '#' && w !== '@'; });
  }

  function shingleSet(words, n) {
    var set = {}, count = 0;
    for (var i = 0; i + n <= words.length; i++) { set[words.slice(i, i + n).join(' ')] = true; count++; }
    if (!count && words.length) set[words.join(' ')] = true;
    return set;
  }

  function jaccard(a, b) {
    var keysA = Object.keys(a), keysB = Object.keys(b);
    if (!keysA.length || !keysB.length) return 0;
    var inter = 0;
    keysA.forEach(function (key) { if (b[key]) inter++; });
    return inter / (keysA.length + keysB.length - inter);
  }

  function keywordSet(text, limit) {
    var freq = {};
    contentTokens(text).forEach(function (token) { freq[token] = (freq[token] || 0) + 1; });
    var tokens = Object.keys(freq).sort(function (x, y) { return freq[y] - freq[x] || (x < y ? -1 : 1); }).slice(0, limit || 30);
    var set = {};
    tokens.forEach(function (token) { set[token] = true; });
    return set;
  }

  function normalizedForMemory(text, limit) { return maskedWords(text).join(' ').slice(0, limit || 600); }

  function similarity(a, b) {
    var wa = maskedWords(a), wb = maskedWords(b);
    if (!wa.length || !wb.length) return { lexical: 0, topical: 0, exact: false };
    var exact = wa.join(' ') === wb.join(' ');
    var n = Math.min(wa.length, wb.length) < 8 ? 2 : 3;
    return { lexical: jaccard(shingleSet(wa, n), shingleSet(wb, n)), topical: jaccard(keywordSet(a, 24), keywordSet(b, 24)), exact: exact };
  }

  var THRESHOLDS = {
    stem: { lexical: 0.55, topical: 0.8 },
    passage: { lexical: 0.28, topical: 0.55 },
    setup: { lexical: 0.45, topical: 0.65 }
  };

  function isNearDuplicate(a, b, kind) {
    var limit = THRESHOLDS[kind] || THRESHOLDS.stem;
    var s = similarity(a, b);
    if (s.exact) return true;
    if (s.lexical >= limit.lexical) return true;
    // Rewording with the same ingredients (same topic, same words) is a repeat
    // for long text, but short stems on one topic legitimately overlap.
    if (kind !== 'stem' && s.topical >= limit.topical && wordCount(a) > 80 && wordCount(b) > 80) return true;
    if (kind === 'stem' && s.topical >= limit.topical && s.lexical >= 0.3) return true;
    return false;
  }

  function extractPracticeItems(section, data) {
    var sec = section === 'varc' ? 'rc' : section === 'lrdi' ? 'dilr' : section;
    var out = { section: sec, passages: [], stems: [], setups: [], traits: [] };
    if (!data || typeof data !== 'object') return out;
    var sets = Array.isArray(data.sets) ? data.sets : [];
    function addQuestions(list) { (list || []).forEach(function (q) { if (q && (q.q || q.stem)) out.stems.push(str(q.q || q.stem)); }); }
    if (typeof data.passage === 'string' && data.passage) out.passages.push(data.passage);
    sets.forEach(function (set) {
      if (!set) return;
      if (typeof set.passage === 'string' && set.passage) out.passages.push(set.passage);
      if (Array.isArray(set.paragraphs) && set.paragraphs.length) out.passages.push(set.paragraphs.join('\n\n'));
      if (typeof set.setup === 'string' && set.setup) out.setups.push(set.setup);
      var trait = [].concat(set.constraint_types || [], (set.questions || []).map(function (q) { return q && q.reasoning_type; })).filter(Boolean).map(function (t) { return str(t).toLowerCase(); });
      if (trait.length) out.traits.push(trait.join('|'));
      addQuestions(set.questions);
    });
    addQuestions(data.questions);
    return out;
  }

  function readMemory() {
    try {
      var raw = cfg.storage && cfg.storage.getItem(cfg.scope(MEMORY_KEY));
      var parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) { return []; }
  }

  function writeMemory(entries) {
    try { if (cfg.storage) cfg.storage.setItem(cfg.scope(MEMORY_KEY), JSON.stringify(entries)); } catch (e) { /* ignore */ }
  }

  function recordPractice(section, data) {
    var items = extractPracticeItems(section, data);
    if (!items.stems.length && !items.passages.length && !items.setups.length) return null;
    var entry = {
      section: items.section,
      at: cfg.now(),
      passages: items.passages.map(function (p) { return { norm: normalizedForMemory(p, 1800), raw: clip(p, 900) }; }),
      setups: items.setups.map(function (p) { return { norm: normalizedForMemory(p, 1400), raw: clip(p, 600) }; }),
      stems: items.stems.map(function (p) { return { norm: normalizedForMemory(p, 420), raw: clip(p, 220) }; }),
      traits: items.traits
    };
    var all = readMemory();
    var signature = hashString(entry.passages.concat(entry.setups, entry.stems).map(function (p) { return p.norm; }).join('|'));
    entry.signature = signature;
    all = all.filter(function (item) { return item && item.signature !== signature; });
    all.push(entry);
    var perSection = {};
    var kept = [];
    for (var i = all.length - 1; i >= 0; i--) {
      var sectionKey = all[i].section;
      perSection[sectionKey] = (perSection[sectionKey] || 0) + 1;
      if (perSection[sectionKey] <= MEMORY_PER_SECTION) kept.unshift(all[i]);
    }
    writeMemory(kept);
    return entry;
  }

  // Returns the list of ways the candidate repeats earlier material. An empty
  // list means the candidate is new in wording AND structure.
  function findRepeats(section, data, extraMemory) {
    var items = extractPracticeItems(section, data);
    var memory = readMemory().filter(function (entry) { return entry && entry.section === items.section; }).concat(extraMemory || []);
    var issues = [];
    function norm(text) { return maskedWords(text).join(' '); }
    items.passages.forEach(function (passage) {
      memory.forEach(function (entry) {
        (entry.passages || []).forEach(function (old) {
          if (isNearDuplicate(passage, old.norm, 'passage')) issues.push('passage repeats an earlier passage (' + clip(old.raw, 60).replace(/\s+/g, ' ') + '...)');
        });
      });
    });
    items.setups.forEach(function (setup, index) {
      memory.forEach(function (entry) {
        (entry.setups || []).forEach(function (old) {
          if (isNearDuplicate(setup, old.norm, 'setup')) issues.push('set repeats an earlier DILR set (' + clip(old.raw, 60).replace(/\s+/g, ' ') + '...)');
        });
        // Same family + same reasoning pattern + overlapping setup vocabulary
        // is the same structure with new names.
        var trait = items.traits[index];
        if (trait && (entry.traits || []).indexOf(trait) !== -1) {
          (entry.setups || []).forEach(function (old) {
            var s = similarity(setup, old.norm);
            if (s.lexical >= 0.3 || s.topical >= 0.5) issues.push('set reuses the structure of an earlier DILR set');
          });
        }
      });
    });
    var stemRepeats = 0;
    items.stems.forEach(function (stem) {
      var repeated = memory.some(function (entry) { return (entry.stems || []).some(function (old) { return isNearDuplicate(norm(stem), old.norm, 'stem'); }); });
      if (repeated) stemRepeats++;
    });
    if (stemRepeats) issues.push(stemRepeats + ' question' + (stemRepeats === 1 ? '' : 's') + ' repeat an earlier question with only names, numbers or a few words changed');
    // Duplicates inside the candidate itself.
    for (var i = 0; i < items.stems.length; i++) {
      for (var j = i + 1; j < items.stems.length; j++) {
        if (isNearDuplicate(items.stems[i], items.stems[j], 'stem') && items.section === 'qa') issues.push('questions ' + (i + 1) + ' and ' + (j + 1) + ' share the same template');
      }
    }
    return issues.filter(function (issue, index, list) { return list.indexOf(issue) === index; });
  }

  function avoidBlock(section, limit) {
    var sec = section === 'varc' ? 'rc' : section === 'lrdi' ? 'dilr' : section;
    var memory = readMemory().filter(function (entry) { return entry && entry.section === sec; }).slice(-(limit || 5));
    if (!memory.length) return '';
    var lines = [];
    memory.forEach(function (entry) {
      var summary = '';
      if (sec === 'rc' && entry.passages[0]) summary = clip(entry.passages[0].raw.replace(/\s+/g, ' '), 110);
      else if (sec === 'dilr' && entry.setups[0]) summary = clip(entry.setups[0].raw.replace(/\s+/g, ' '), 110) + (entry.traits[0] ? ' [' + clip(entry.traits[0], 60) + ']' : '');
      else if (entry.stems[0]) summary = entry.stems.slice(0, 3).map(function (s) { return clip(s.raw.replace(/\s+/g, ' '), 70); }).join(' / ');
      if (summary) lines.push('- ' + summary);
    });
    if (!lines.length) return '';
    return 'ALREADY SHOWN TO THIS STUDENT (do not reuse these themes, settings, entity types, sentence frames or solution skeletons; changing names, numbers or a few words does NOT make an item new — change the situation and the reasoning route):\n' + lines.join('\n');
  }

  /* ------------------------------------------------------------------ */
  /* Content library as a style reference (never copied)                 */
  /* ------------------------------------------------------------------ */

  var library = { qa: [], loaded: false, loading: null };

  function cleanLibraryQuestion(record) {
    if (!record || record.section !== 'qa' || record.direct_use_status !== 'answer_key_ready') return null;
    var stem = str(record.stem).replace(/\s*\n\s*/g, ' ').replace(/\s+/g, ' ').trim();
    var options = (record.options || []).map(function (o) { return str(o); });
    if (stem.length < 50 || stem.length > 330 || options.length !== 4) return null;
    if (options.some(function (o) { return /\n|\bA\)|\bB\)|DIRECTIONS/i.test(o) || o.length > 40; })) return null;
    if (/[�]|\bwh\s+ere\b/.test(stem)) return null;
    return { stem: stem, options: options, correct: record.correct_index };
  }

  function loadLibrary(fetchJson) {
    if (library.loaded) return Promise.resolve(library);
    if (library.loading) return library.loading;
    var fetcher = fetchJson || (typeof root.fetch === 'function' ? function (url) { return root.fetch(url).then(function (r) { if (!r.ok) throw new Error('status ' + r.status); return r.json(); }); } : null);
    if (!fetcher) return Promise.resolve(library);
    library.loading = fetcher('/data/cat-pyq/manifest.json').then(function (manifest) {
      var papers = (manifest.papers || []).filter(function (paper) { return paper && paper.asset && (paper.answer_key_ready_counts && paper.answer_key_ready_counts.qa) > 0; });
      papers = papers.slice(-6);
      return Promise.all(papers.map(function (paper) {
        return fetcher('/data/cat-pyq/' + paper.asset).then(function (payload) { return payload.questions || []; }).catch(function () { return []; });
      }));
    }).then(function (lists) {
      var seen = {};
      lists.forEach(function (list) {
        list.forEach(function (record) {
          var clean = cleanLibraryQuestion(record);
          if (clean && !seen[clean.stem]) { seen[clean.stem] = true; library.qa.push(clean); }
        });
      });
      library.loaded = true;
      return library;
    }).catch(function () { library.loaded = true; return library; });
    return library.loading;
  }

  function seededPick(list, count, seed) {
    var picked = [], used = {};
    var h = parseInt(hashString(seed), 36) || 1;
    for (var i = 0; i < list.length * 2 && picked.length < count; i++) {
      h = (Math.imul(h, 1103515245) + 12345) >>> 0;
      var index = h % list.length;
      if (!used[index]) { used[index] = true; picked.push(list[index]); }
    }
    return picked;
  }

  function exemplarBlock(section, seed) {
    var sec = section === 'varc' ? 'rc' : section;
    if (sec !== 'qa' || !library.qa.length) return '';
    var picks = seededPick(library.qa, 2, str(seed) + cfg.now());
    if (!picks.length) return '';
    return 'STYLE REFERENCE from real CAT papers (calibrate length, directness and option design only; your items must have a different situation, different numbers and a different solution route):\n' +
      picks.map(function (q, i) { return (i + 1) + '. ' + q.stem + ' [' + q.options.join(' | ') + ']'; }).join('\n');
  }

  function libraryOverlap(section, data) {
    var sec = section === 'varc' ? 'rc' : section;
    if (sec !== 'qa' || !library.qa.length) return [];
    var items = extractPracticeItems(sec, data);
    var issues = [];
    items.stems.forEach(function (stem, index) {
      var hit = library.qa.some(function (record) { return isNearDuplicate(stem, record.stem, 'stem'); });
      if (hit) issues.push('question ' + (index + 1) + ' is too close to a published CAT question');
    });
    return issues;
  }

  /* ------------------------------------------------------------------ */
  /* Continuation of cut-off replies                                     */
  /* ------------------------------------------------------------------ */

  function looksCutOff(text) {
    var value = str(text).replace(/\s+$/, '');
    if (!value) return false;
    var lines = value.split('\n');
    var last = lines[lines.length - 1].trim();
    if ((value.match(/\*\*/g) || []).length % 2 === 1) return true;
    if (/^(?:\*\*)?\(?[A-E](?:[).:])(?:\*\*)?\s*$/.test(last)) return true;
    if (/(?:\b(?:and|or|but|the|a|an|of|to|in|that|which|with|for|as|is|are|because|than|by|from|on|at|its|their)|[,;:(\-–—])$/i.test(last)) return true;
    // A final Q block that has fewer than four options has been cut mid-block.
    var blocks = value.split(/\n(?=\s*(?:\*\*)?(?:Q(?:uestion)?\s*)?\d{1,2}\s*[).:])/i);
    var tail = blocks[blocks.length - 1];
    if (/^\s*(?:\*\*)?(?:Q(?:uestion)?\s*)?\d{1,2}\s*[).:]/i.test(tail) && countOptionLines(tail) >= 1 && countOptionLines(tail) < 4) return true;
    return !/[.!?)"”’'\]:]$/.test(last) && wordCount(last) >= 4 && !OPTION_LINE.test(last) ? true : false;
  }

  function buildContinuationPrompt(partial) {
    var tail = str(partial).slice(-1400);
    return 'Your previous reply stopped before it was finished. Continue it from the exact point where it stopped. Do not repeat anything already written, do not apologise, do not add an introduction or a new heading, and keep the same layout. If the last sentence, option or question was cut mid-way, complete it first, then carry on until the whole answer is finished.\n\nTHE END OF YOUR PREVIOUS REPLY (continue directly after it):\n<<<\n' + tail + '\n>>>';
  }

  function stitchContinuation(previous, next) {
    var a = str(previous), b = str(next).replace(/^\s*(?:\.\.\.|…)\s*/, '');
    if (!b.trim()) return a;
    var window = a.slice(-240);
    var best = 0;
    var maxOverlap = Math.min(window.length, b.length, 240);
    for (var size = maxOverlap; size >= 12; size--) {
      if (window.slice(window.length - size) === b.slice(0, size)) { best = size; break; }
    }
    if (best) b = b.slice(best);
    else {
      // The model sometimes restarts at the beginning of the last line.
      var lastLine = a.split('\n').pop().trim();
      if (lastLine.length >= 12 && b.trimStart().indexOf(lastLine) === 0) b = b.trimStart().slice(lastLine.length);
    }
    var endsMidWord = /[A-Za-z]$/.test(a) && /^[a-z]/.test(b) && !/\s$/.test(a);
    var joiner = endsMidWord && b.charAt(0) !== ' ' ? (/^[a-z]{1,3}\b/.test(b) ? ' ' : '') : (/\s$/.test(a) || /^\s/.test(b) ? '' : ' ');
    if (/\n$/.test(a) || /^\n/.test(b)) joiner = '';
    return (a + joiner + b).replace(/\n{3,}/g, '\n\n');
  }

  /* ------------------------------------------------------------------ */
  /* CAT-style layout: normalise, parse, render                          */
  /* ------------------------------------------------------------------ */

  var Q_START = /^\s*(?:#{1,3}\s*)?(?:\*\*)?\s*(?:(Q(?:uestion)?)\s*\.?\s*)?(\d{1,2})\s*[).:]\s*(?:\*\*)?\s*(.*)$/i;
  var OPT_PARSE = /^\s*(?:[-•*]\s*)?(?:\*\*)?\(?([A-Ea-e])(?:\)|\.|:)(?:\*\*)?\s+(.*)$/;
  var ANSWER_LINE = /^\s*(?:#{1,3}\s*)?(?:\*\*)?\s*(?:correct\s+)?(?:answer|ans|key)\s*(?:is)?\s*(?:\*\*)?\s*[:\-–]?\s*(?:\*\*)?\s*\(?([A-Ea-e])\)?(?:[).:]|\b)\s*(.*)$/i;
  var EXPLANATION_LINE = /^\s*(?:#{1,3}\s*)?(?:\*\*)?\s*(explanation|solution|reasoning|rationale|working|why)\s*(?:\*\*)?\s*[:\-–]\s*(?:\*\*)?\s*(.*)$/i;
  var PASSAGE_HEADER = /^\s*(?:#{1,3}\s*)?(?:\*\*)?\s*(?:PASSAGE|Passage|Para(?:graph)?|Extract|Article|Text)\s*(?:\d{1,2}|[A-E]|[IVX]{1,4})?\s*(?:[:·|—–-]\s*[^\n]{0,90})?\s*(?:\*\*)?:?\s*$/;
  var SET_HEADER = /^\s*(?:#{1,3}\s*)?(?:\*\*)?\s*(?:(?:DILR\s+|LRDI\s+)?(?:SET|Set)\s*\d{0,2}\b[^\n]{0,80}|(?:DATA|Data|Directions?|Setup|SETUP|Data table|Case|Information)\s*:?)\s*(?:\*\*)?:?\s*$/;
  var PAGE_HEADER = /^\s*(?:#{1,3}\s*)?(?:\*\*)?\s*CAT\s+(?:RC|DILR|QA|VARC|STRATEGY|EXECUTION)\b[^\n]*$/;
  var QUESTIONS_HEADER = /^\s*(?:#{1,3}\s*)?(?:\*\*)?\s*QUESTIONS?\s*:?\s*(?:\*\*)?\s*$/i;
  var TABLE_ROW = /^\s*\|?[^|\n]+(?:\|[^|\n]*){1,}\|?\s*$/;
  var TABLE_RULE = /^\s*\|?\s*:?-{2,}:?\s*(?:\|\s*:?-{2,}:?\s*)+\|?\s*$/;

  function stripMarks(text) { return str(text).replace(/^\*\*|\*\*$/g, '').trim(); }

  // Models often emit options inline or as "(A)" / "a)". Lay them out in the
  // one canonical form the parser and the student both expect.
  function normalizeLayout(text) {
    var value = str(text).replace(/\r/g, '').replace(/[ \t]+\n/g, '\n');
    var lines = value.split('\n');
    var out = [];
    lines.forEach(function (line) {
      var inline = line.match(/^(\s*)(.*?)(\(?[Aa][).]\s+\S.*?)\s+(\(?[Bb][).]\s+\S.*?)\s+(\(?[Cc][).]\s+\S.*?)(?:\s+(\(?[Dd][).]\s+\S.*?))?(?:\s+(\(?[Ee][).]\s+\S.*?))?\s*$/);
      if (inline && !OPT_PARSE.test(line) && (inline[2] === '' || /[?:]\s*$/.test(inline[2]) || /^\s*(?:Q\s*)?\d{1,2}[).:]/i.test(inline[2]))) {
        if (inline[2].trim()) out.push(inline[2].trim());
        [inline[3], inline[4], inline[5], inline[6], inline[7]].forEach(function (option) {
          if (!option) return;
          var parsed = option.trim().match(OPT_PARSE);
          out.push(parsed ? parsed[1].toUpperCase() + '. ' + parsed[2].trim() : option.trim());
        });
        return;
      }
      if (OPT_PARSE.test(line)) {
        var m = line.match(OPT_PARSE);
        out.push(m[1].toUpperCase() + '. ' + m[2].trim());
        return;
      }
      out.push(line.replace(/\s+$/, ''));
    });
    // Blank line before structural markers so blocks never fuse.
    var spaced = [];
    out.forEach(function (line, index) {
      var previous = spaced.length ? spaced[spaced.length - 1] : '';
      var startsBlock = Q_START.test(line) && (/^\s*(?:\*\*)?\s*Q/i.test(line) || /\?\s*$/.test(line)) || PASSAGE_HEADER.test(line) || SET_HEADER.test(line) || ANSWER_LINE.test(line) && previous.trim() && !ANSWER_LINE.test(previous) || EXPLANATION_LINE.test(line) && previous.trim() && !ANSWER_LINE.test(previous) && !EXPLANATION_LINE.test(previous);
      if (startsBlock && previous.trim() && !OPT_PARSE.test(line) && !(ANSWER_LINE.test(line) && OPT_PARSE.test(previous) && false)) spaced.push('');
      spaced.push(line);
    });
    return spaced.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  function parseBlocks(text) {
    var lines = str(text).replace(/\r/g, '').split('\n');
    var blocks = [];
    var para = [];
    var mode = '';
    var i = 0;
    function flush() {
      if (!para.length) return;
      var joined = para.join('\n');
      blocks.push({ type: mode === 'passage' && wordCount(joined) >= 18 ? 'passage' : mode === 'data' ? 'data' : 'para', lines: para.slice() });
      para = [];
    }
    function nextNonBlank(from) { var j = from; while (j < lines.length && !lines[j].trim()) j++; return j; }
    function optionsAhead(from) {
      var count = 0, j = from;
      while (j < lines.length && count < 6) {
        var l = lines[j];
        if (!l.trim()) { j++; continue; }
        if (OPT_PARSE.test(l)) { count++; j++; continue; }
        if (count === 0 && j < from + 4 && !Q_START.test(l) && !ANSWER_LINE.test(l)) { j++; continue; }
        break;
      }
      return count;
    }
    while (i < lines.length) {
      var line = lines[i];
      var trimmed = line.trim();
      if (!trimmed) { flush(); i++; continue; }
      var visual = trimmed.match(/^@@MARG_VISUAL_(\d+)@@$/);
      if (visual) { flush(); blocks.push({ type: 'raw', index: Number(visual[1]) }); i++; continue; }
      if (/^(?:-{3,}|\*{3,}|_{3,})$/.test(trimmed)) { flush(); i++; continue; }
      if (TABLE_ROW.test(trimmed) && (trimmed.match(/\|/g) || []).length >= 2 && (i + 1 < lines.length && (TABLE_RULE.test(lines[i + 1]) || TABLE_ROW.test(lines[i + 1].trim()) && (lines[i + 1].match(/\|/g) || []).length >= 2))) {
        flush();
        var rows = [];
        while (i < lines.length && lines[i].trim() && TABLE_ROW.test(lines[i].trim()) && (lines[i].match(/\|/g) || []).length >= 2) {
          if (!TABLE_RULE.test(lines[i])) rows.push(lines[i].trim().replace(/^\||\|$/g, '').split('|').map(function (cell) { return cell.trim(); }));
          i++;
        }
        blocks.push({ type: 'table', rows: rows });
        continue;
      }
      if (PAGE_HEADER.test(trimmed)) { flush(); blocks.push({ type: 'label', text: stripMarks(trimmed.replace(/^#{1,3}\s*/, '')), level: 'page' }); mode = /\bRC\b|VARC/i.test(trimmed) ? 'passage' : /DILR/i.test(trimmed) ? 'data' : ''; i++; continue; }
      if (PASSAGE_HEADER.test(trimmed) && !Q_START.test(trimmed)) { flush(); blocks.push({ type: 'label', text: stripMarks(trimmed.replace(/^#{1,3}\s*/, '').replace(/\*\*/g, '')).replace(/:$/, ''), level: 'passage' }); mode = 'passage'; i++; continue; }
      if (SET_HEADER.test(trimmed) && !Q_START.test(trimmed)) { flush(); blocks.push({ type: 'label', text: stripMarks(trimmed.replace(/^#{1,3}\s*/, '').replace(/\*\*/g, '')).replace(/:$/, ''), level: 'set' }); mode = 'data'; i++; continue; }
      if (QUESTIONS_HEADER.test(trimmed)) { flush(); blocks.push({ type: 'label', text: 'Questions', level: 'questions' }); mode = ''; i++; continue; }
      var q = trimmed.match(Q_START);
      var explicitQ = q && q[1];
      if (q && (explicitQ || optionsAhead(i + 1) >= 2 || (/\?\s*$/.test(q[3]) && optionsAhead(i + 1) >= 1))) {
        flush();
        mode = '';
        var stem = [q[3]];
        i++;
        while (i < lines.length && lines[i].trim() && !OPT_PARSE.test(lines[i]) && !Q_START.test(lines[i]) && !ANSWER_LINE.test(lines[i]) && !EXPLANATION_LINE.test(lines[i])) { stem.push(lines[i].trim()); i++; }
        var options = [];
        while (i < lines.length) {
          if (!lines[i].trim()) {
            var peek = nextNonBlank(i);
            if (peek < lines.length && OPT_PARSE.test(lines[peek]) && options.length) { i = peek; continue; }
            break;
          }
          var om = lines[i].match(OPT_PARSE);
          if (om) { options.push({ key: om[1].toUpperCase(), text: om[2].trim() }); i++; continue; }
          if (options.length && !Q_START.test(lines[i]) && !ANSWER_LINE.test(lines[i]) && !EXPLANATION_LINE.test(lines[i]) && !PASSAGE_HEADER.test(lines[i].trim()) && !SET_HEADER.test(lines[i].trim())) { options[options.length - 1].text += ' ' + lines[i].trim(); i++; continue; }
          break;
        }
        blocks.push({ type: 'question', number: Number(q[2]), stem: stem.join(' ').replace(/\s+/g, ' ').trim(), options: options });
        continue;
      }
      var a = trimmed.match(ANSWER_LINE);
      if (a && (a[2] === '' || /^[-–:.)]|^[A-Za-z(]/.test(a[2]) || true) && !OPT_PARSE.test(trimmed)) {
        flush();
        blocks.push({ type: 'answer', key: a[1].toUpperCase(), rest: a[2].replace(/^[-–:.)\s]+/, '').trim() });
        i++;
        continue;
      }
      var e = trimmed.match(EXPLANATION_LINE);
      if (e) {
        flush();
        var body = [e[2]];
        i++;
        while (i < lines.length && lines[i].trim() && !Q_START.test(lines[i]) && !ANSWER_LINE.test(lines[i]) && !PASSAGE_HEADER.test(lines[i].trim()) && !SET_HEADER.test(lines[i].trim()) && !EXPLANATION_LINE.test(lines[i])) { body.push(lines[i].trim()); i++; }
        blocks.push({ type: 'explanation', label: e[1].charAt(0).toUpperCase() + e[1].slice(1).toLowerCase(), lines: body.filter(Boolean) });
        continue;
      }
      var heading = trimmed.match(/^#{1,3}\s+(.+)$/);
      if (heading) { flush(); blocks.push({ type: 'heading', text: heading[1] }); i++; continue; }
      var bullet = trimmed.match(/^(?:[-•*])\s+(.+)$/);
      if (bullet) { flush(); blocks.push({ type: 'bullet', text: bullet[1] }); i++; continue; }
      var numbered = trimmed.match(/^(\d+)[.)]\s+(.+)$/);
      if (numbered) { flush(); blocks.push({ type: 'numbered', number: numbered[1], text: numbered[2] }); i++; continue; }
      para.push(trimmed);
      i++;
    }
    flush();
    return blocks;
  }

  function hasCatStructure(text) {
    var value = str(text);
    if (value.length < 40) return false;
    var blocks = parseBlocks(normalizeLayout(value));
    var questions = blocks.filter(function (b) { return b.type === 'question' && b.options.length >= 3; }).length;
    if (questions) return true;
    if (blocks.some(function (b) { return b.type === 'label' && b.level === 'passage'; }) && blocks.some(function (b) { return b.type === 'passage'; })) return true;
    return blocks.some(function (b) { return b.type === 'table' && b.rows.length >= 3; });
  }

  function defaultInline(source) {
    var escaped = str(source).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    escaped = escaped.replace(/\*\*([^*\n]{1,220})\*\*/g, '<strong>$1</strong>');
    escaped = escaped.replace(/(^|[^*])\*([^*\n]{1,220})\*/g, '$1<em>$2</em>');
    return escaped;
  }

  function renderBlocks(text, options) {
    options = options || {};
    var inline = options.inline || defaultInline;
    var raw = options.raw || [];
    var blocks = parseBlocks(normalizeLayout(text));
    var html = [];
    blocks.forEach(function (block) {
      if (block.type === 'raw') html.push(raw[block.index] || '');
      else if (block.type === 'label') html.push('<div class="study-label study-label-' + block.level + '">' + inline(block.text) + '</div>');
      else if (block.type === 'passage') html.push('<div class="study-passage">' + block.lines.map(function (l) { return inline(l); }).join('<br>') + '</div>');
      else if (block.type === 'data') html.push('<div class="study-data">' + block.lines.map(function (l) { return inline(l); }).join('<br>') + '</div>');
      else if (block.type === 'table') {
        var head = block.rows[0] || [];
        html.push('<div class="study-table-wrap"><table class="study-table"><thead><tr>' + head.map(function (c) { return '<th>' + inline(c) + '</th>'; }).join('') + '</tr></thead><tbody>' + block.rows.slice(1).map(function (row) { return '<tr>' + head.map(function (_, idx) { return '<td>' + inline(row[idx] || '') + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>');
      } else if (block.type === 'question') {
        html.push('<div class="study-question"><div class="study-qstem"><span class="study-qnum">' + block.number + '.</span> ' + inline(block.stem) + '</div>' +
          (block.options.length ? '<div class="study-options">' + block.options.map(function (o) { return '<div class="study-option"><span class="study-optkey">' + o.key + '.</span> <span class="study-opttext">' + inline(o.text) + '</span></div>'; }).join('') + '</div>' : '') + '</div>');
      } else if (block.type === 'answer') {
        html.push('<div class="study-answer"><span class="study-sublabel">Answer</span> <strong>' + block.key + '</strong>' + (block.rest ? ' <span class="study-answer-note">' + inline(block.rest) + '</span>' : '') + '</div>');
      } else if (block.type === 'explanation') {
        html.push('<div class="study-explanation"><span class="study-sublabel">' + inline(block.label) + '</span> ' + block.lines.map(function (l) { return inline(l); }).join('<br>') + '</div>');
      } else if (block.type === 'heading') html.push('<div class="mentor-heading">' + inline(block.text) + '</div>');
      else if (block.type === 'bullet') html.push('<div class="mentor-list-item"><span class="mentor-list-mark">•</span><span>' + inline(block.text) + '</span></div>');
      else if (block.type === 'numbered') html.push('<div class="mentor-list-item"><span class="mentor-list-mark">' + block.number + '.</span><span>' + inline(block.text) + '</span></div>');
      else html.push('<div class="mentor-paragraph">' + block.lines.map(function (l) { return inline(l); }).join('<br>') + '</div>');
    });
    return html.join('');
  }

  var STUDY_CSS =
    '.mentor-rich.study-rich{line-height:1.6}' +
    '.study-rich .study-label{font-size:.74em;letter-spacing:.09em;text-transform:uppercase;color:var(--gold-light,#d9b95c);font-weight:650;margin:16px 0 8px}' +
    '.study-rich .study-label:first-child{margin-top:0}' +
    '.study-rich .study-passage{border-left:2px solid rgba(201,168,76,.45);padding:2px 0 2px 14px;margin:0 0 12px;color:#f2eee7;line-height:1.78}' +
    '.study-rich .study-data{background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:10px 12px;margin:0 0 12px;line-height:1.7}' +
    '.study-rich .study-question{margin:16px 0 6px;padding:12px 14px;border:1px solid rgba(255,255,255,.09);border-radius:12px;background:rgba(255,255,255,.025)}' +
    '.study-rich .study-qstem{font-weight:600;color:var(--text,#f0ede6);margin-bottom:8px}' +
    '.study-rich .study-qnum{color:var(--gold-light,#d9b95c);margin-right:2px}' +
    '.study-rich .study-options{display:grid;gap:6px}' +
    '.study-rich .study-option{padding:7px 10px;border-radius:8px;background:rgba(255,255,255,.035);line-height:1.5}' +
    '.study-rich .study-optkey{font-weight:650;color:var(--gold-light,#d9b95c);margin-right:4px}' +
    '.study-rich .study-answer{margin:8px 0 4px;padding:8px 12px;border-radius:8px;background:rgba(76,175,125,.12);border:1px solid rgba(76,175,125,.28)}' +
    '.study-rich .study-sublabel{font-size:.74em;letter-spacing:.08em;text-transform:uppercase;font-weight:650;color:var(--text-muted,#aaa69e);margin-right:6px}' +
    '.study-rich .study-explanation{margin:6px 0 12px;padding:2px 0 2px 14px;border-left:2px solid rgba(255,255,255,.14);color:var(--text-muted,#d8d4cc);line-height:1.62}' +
    '.study-rich .study-table-wrap{overflow-x:auto;margin:0 0 12px}' +
    '.study-rich .study-table{border-collapse:collapse;min-width:60%;font-size:.94em}' +
    '.study-rich .study-table th,.study-rich .study-table td{border:1px solid rgba(255,255,255,.14);padding:6px 10px;text-align:left}' +
    '.study-rich .study-table th{background:rgba(201,168,76,.12);font-weight:650}';

  root.MargStudy = {
    version: 1,
    configure: configure,
    analyzeMaterial: analyzeMaterial,
    separateInstruction: separateInstruction,
    detectFraming: detectFraming,
    classifyTurn: classifyTurn,
    shouldBypassSavedRetrieval: shouldBypassSavedRetrieval,
    isExplicitSavedReference: isExplicitSavedReference,
    requestedQuestionCount: requestedQuestionCount,
    overlapWithMaterial: overlapWithMaterial,
    getContext: getContext,
    setContext: setContext,
    clearContext: clearContext,
    recordStep: recordStep,
    updateContext: updateContext,
    buildStudyDirective: buildStudyDirective,
    buildQuestionsFromMaterialPrompt: buildQuestionsFromMaterialPrompt,
    stepsForPrompt: stepsForPrompt,
    qualityBrief: qualityBrief,
    layoutContract: STUDY_LAYOUT_CONTRACT,
    similarity: similarity,
    isNearDuplicate: isNearDuplicate,
    extractPracticeItems: extractPracticeItems,
    recordPractice: recordPractice,
    findRepeats: findRepeats,
    avoidBlock: avoidBlock,
    loadLibrary: loadLibrary,
    exemplarBlock: exemplarBlock,
    libraryOverlap: libraryOverlap,
    looksCutOff: looksCutOff,
    buildContinuationPrompt: buildContinuationPrompt,
    stitchContinuation: stitchContinuation,
    normalizeLayout: normalizeLayout,
    parseBlocks: parseBlocks,
    hasCatStructure: hasCatStructure,
    renderBlocks: renderBlocks,
    styles: STUDY_CSS,
    _library: library
  };
})(typeof window !== 'undefined' ? window : globalThis);
