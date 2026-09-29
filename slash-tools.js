(function () {
  'use strict';

  var activeIndex = 0;
  var visibleCommands = [];
  var commands = [
    { id:'diagnose', command:'/diagnose', title:'Find what is holding me back', description:'Investigate one real problem before deciding the fix.', icon:'⌖' },
    { id:'practice', command:'/practice', title:'Practice VARC, DILR or QA', description:'Start a checked practice session from this chat.', icon:'✍' },
    { id:'mock-analysis', command:'/analyse-mock', title:'Analyse a mock I already took', description:'Enter existing scores or attach a scorecard. Marg does not provide a mock test.', icon:'▥' },
    { id:'today-varc', command:'/today-varc', title:'Open Today’s VARC', description:'Turn the current Aeon article into an RC experience.', icon:'▤' },
    { id:'progress', command:'/progress', title:'Review my evidence trail', description:'See the working pattern, evidence, intervention, result and next decision.', icon:'↗' }
  ];

  function inputElement() { return document.getElementById('user-input'); }
  function menuElement() { return document.getElementById('slash-command-menu'); }
  function buttonElement() { return document.getElementById('slash-tools-btn'); }
  function surfaceElement() { return document.getElementById('slash-tool-surface'); }

  function isMenuOpen() {
    var menu = menuElement();
    return !!(menu && !menu.hidden);
  }

  function closeSlashCommandMenu(options) {
    var menu = menuElement();
    var button = buttonElement();
    if (menu) { menu.hidden = true; menu.innerHTML = ''; }
    if (button) button.setAttribute('aria-expanded', 'false');
    activeIndex = 0;
    visibleCommands = [];
    if (options && options.focus && inputElement()) inputElement().focus();
  }

  function normalizeSearch(value) {
    return String(value || '').toLowerCase().replace(/^\s*\//, '').trim();
  }

  function updateActiveCommandRows() {
    var menu = menuElement();
    if (!menu) return;
    Array.prototype.forEach.call(menu.querySelectorAll('.slash-command-row'), function (row, index) {
      var active = index === activeIndex;
      row.classList.toggle('active', active);
      row.setAttribute('aria-selected', active ? 'true' : 'false');
    });
  }

  function renderSlashCommandMenu(search) {
    var menu = menuElement();
    var button = buttonElement();
    if (!menu) return;
    var query = normalizeSearch(search);
    visibleCommands = commands.filter(function (item) {
      return !query || [item.id, item.command, item.title, item.description].join(' ').toLowerCase().indexOf(query) !== -1;
    });
    if (activeIndex >= visibleCommands.length) activeIndex = 0;
    menu.innerHTML = '';
    var heading = document.createElement('div');
    heading.className = 'slash-command-heading';
    heading.textContent = 'MARG tools';
    menu.appendChild(heading);
    if (!visibleCommands.length) {
      var empty = document.createElement('div');
      empty.className = 'slash-command-empty';
      empty.textContent = 'No matching tool. Keep typing to send this as a normal message.';
      menu.appendChild(empty);
    }
    visibleCommands.forEach(function (item, index) {
      var row = document.createElement('button');
      row.type = 'button';
      row.className = 'slash-command-row' + (index === activeIndex ? ' active' : '');
      row.setAttribute('role', 'option');
      row.setAttribute('aria-selected', index === activeIndex ? 'true' : 'false');
      row.dataset.commandId = item.id;
      var icon = document.createElement('span'); icon.className = 'slash-command-icon'; icon.textContent = item.icon;
      var copy = document.createElement('span'); copy.className = 'slash-command-copy';
      var title = document.createElement('span'); title.className = 'slash-command-title';
      var code = document.createElement('code'); code.textContent = item.command;
      title.appendChild(code); title.appendChild(document.createTextNode(' ' + item.title));
      var description = document.createElement('span'); description.className = 'slash-command-description'; description.textContent = item.description;
      copy.appendChild(title); copy.appendChild(description); row.appendChild(icon); row.appendChild(copy);
      // Never rebuild the menu on pointer entry. Replacing the hovered button
      // before mouseup cancels the click in real browsers.
      row.addEventListener('mouseenter', function () { activeIndex = index; updateActiveCommandRows(); });
      row.addEventListener('click', function () { openMargTool(item.id); });
      menu.appendChild(row);
    });
    menu.hidden = false;
    if (button) button.setAttribute('aria-expanded', 'true');
  }

  function toggleSlashCommandMenu() {
    if (isMenuOpen()) closeSlashCommandMenu({ focus:true });
    else { renderSlashCommandMenu(''); if (inputElement()) inputElement().focus(); }
  }

  function closeMargToolSurface() {
    var surface = surfaceElement();
    if (!surface) return;
    surface.hidden = true;
    surface.classList.remove('visible');
    surface.innerHTML = '';
  }

  function makeToolCard(id, title, subtitle) {
    var surface = surfaceElement();
    if (!surface) return null;
    var varcCard = document.getElementById('varc-card');
    if (varcCard) { varcCard.classList.remove('visible'); varcCard.style.display = 'none'; }
    surface.innerHTML = '';
    surface.hidden = false;
    surface.classList.add('visible');
    var wrap = document.createElement('div');
    wrap.className = 'slash-tool-wrap fade-in';
    wrap.dataset.margToolCard = id;
    var card = document.createElement('section'); card.className = 'slash-tool-card';
    var head = document.createElement('div'); head.className = 'slash-tool-card-head';
    var headCopy = document.createElement('div');
    var label = document.createElement('div'); label.className = 'slash-tool-label'; label.textContent = '/' + id;
    var heading = document.createElement('h3'); heading.textContent = title;
    var sub = document.createElement('p'); sub.textContent = subtitle;
    var close = document.createElement('button'); close.type = 'button'; close.className = 'slash-tool-close'; close.setAttribute('aria-label', 'Close tool'); close.textContent = 'Close ×'; close.addEventListener('click', closeMargToolSurface);
    headCopy.appendChild(label); headCopy.appendChild(heading); headCopy.appendChild(sub); head.appendChild(headCopy); head.appendChild(close);
    var body = document.createElement('div'); body.className = 'slash-tool-body';
    card.appendChild(head); card.appendChild(body); wrap.appendChild(card); surface.appendChild(wrap);
    if (typeof surface.scrollIntoView === 'function') surface.scrollIntoView({ behavior:'smooth', block:'nearest' });
    return { wrap:wrap, card:card, body:body };
  }

  function toolButton(label, description, onClick, className) {
    var button = document.createElement('button'); button.type = 'button'; button.className = 'slash-tool-action ' + (className || '');
    var strong = document.createElement('strong'); strong.textContent = label;
    var span = document.createElement('span'); span.textContent = description;
    button.appendChild(strong); button.appendChild(span); button.addEventListener('click', onClick);
    return button;
  }

  function selectField(labelText, options, selectedValue) {
    var label = document.createElement('label'); label.className = 'slash-tool-field';
    var span = document.createElement('span'); span.textContent = labelText;
    var select = document.createElement('select');
    (options || []).forEach(function (item) {
      var option = document.createElement('option');
      option.value = item.value;
      option.textContent = item.label;
      if (String(item.value) === String(selectedValue)) option.selected = true;
      select.appendChild(option);
    });
    label.appendChild(span); label.appendChild(select);
    return { label:label, select:select };
  }

  function appendPracticeBack(body) {
    var back = document.createElement('button');
    back.type = 'button';
    back.className = 'slash-tool-secondary slash-tool-back';
    back.textContent = '← Change section';
    back.addEventListener('click', showPracticeCard);
    body.appendChild(back);
  }

  function requireFunction(name) {
    return typeof window[name] === 'function';
  }

  function showUnavailable() {
    if (requireFunction('showComposerStatus')) window.showComposerStatus('This tool is still loading. Try once more in a moment.', 'info', true);
  }

  function openTodaysVarc() {
    closeMargToolSurface();
    if (requireFunction('closeAppMenu')) window.closeAppMenu();
    if (requireFunction('switchTab')) window.switchTab('chat');
    var card = document.getElementById('varc-card');
    if (card && card.classList.contains('visible')) {
      if (typeof card.scrollIntoView === 'function') card.scrollIntoView({ behavior:'smooth', block:'nearest' });
      return;
    }
    if (requireFunction('openTodaysVarcExperience')) window.openTodaysVarcExperience();
    else if (requireFunction('toggleVarcCard')) window.toggleVarcCard();
    else showUnavailable();
  }

  function showDiagnosisCard() {
    var view = makeToolCard('diagnose', 'What should Marg investigate?', 'Choose the area. Marg will use one real behaviour before deciding what is actually holding you back.');
    if (!view) return;
    var grid = document.createElement('div'); grid.className = 'slash-tool-grid slash-tool-grid-three';
    ['VARC','DILR','QA','Mock Analysis','Confidence','Strategy'].forEach(function (topic) {
      grid.appendChild(toolButton(topic, topic === 'Mock Analysis' ? 'Investigate a decision from a mock you already took.' : 'Start with evidence from your real experience.', function () {
        closeMargToolSurface();
        if (requireFunction('dispatchConversationalQuickReply')) window.dispatchConversationalQuickReply(topic, 'home_diagnosis_topic', null);
        else if (requireFunction('launchHomeDiagnosis')) window.launchHomeDiagnosis();
        else showUnavailable();
      }));
    });
    view.body.appendChild(grid);
  }

  function showPracticeCard() {
    var view = makeToolCard('practice', 'What do you want to practise?', 'Choose a section first. Marg will ask for the focus and level before starting anything.');
    if (!view) return;
    var grid = document.createElement('div'); grid.className = 'slash-tool-grid';
    grid.appendChild(toolButton('VARC', 'Configure a targeted RC by weakness, question type, level and reading world.', function () { showPracticeConfigurator('varc'); }));
    grid.appendChild(toolButton('DILR', 'Choose the set family and CAT difficulty before the timer begins.', function () { showPracticeConfigurator('dilr'); }));
    grid.appendChild(toolButton('QA', 'Choose the exact topic, CAT difficulty and number of questions.', function () { showPracticeConfigurator('qa'); }));
    view.body.appendChild(grid);
    var note = document.createElement('div'); note.className = 'slash-tool-note';
    note.textContent = 'Today’s Aeon-based RC remains separate under /today-varc.';
    view.body.appendChild(note);
  }

  function showPracticeConfigurator(section) {
    if (section === 'varc') { showVARCPracticeConfigurator(); return; }
    if (section === 'dilr') { showDILRPracticeConfigurator(); return; }
    showQAPracticeConfigurator();
  }

  function showVARCPracticeConfigurator() {
    var view = makeToolCard('practice · varc', 'Build a targeted RC', 'This is original targeted practice. It does not silently open Today’s VARC.');
    if (!view) return;
    var focus = selectField('What should this RC train?', [
      { value:'need:diagnose', label:'Not sure — diagnose me' },
      { value:'need:passage', label:'Passage structure and central claim' },
      { value:'need:two_options', label:'Two options look correct' },
      { value:'need:claim', label:'Finding the exact supporting claim' },
      { value:'need:tone', label:'Author tone and purpose' },
      { value:'need:time', label:'Pacing under a mixed RC' },
      { value:'skill:main_idea', label:'Question type — main idea' },
      { value:'skill:inference', label:'Question type — inference' },
      { value:'skill:paragraph_role', label:'Question type — paragraph role' },
      { value:'skill:detail', label:'Question type — detail/reference' },
      { value:'skill:tone', label:'Question type — tone/purpose' }
    ], 'need:diagnose');
    var difficulty = selectField('Difficulty', [
      { value:'build_up', label:'Build-up' },
      { value:'cat', label:'CAT-level' },
      { value:'hard', label:'Hard CAT' }
    ], 'cat');
    var topic = selectField('Reading world', [
      { value:'surprise', label:'Surprise me' },
      { value:'ideas', label:'Ideas & Philosophy' },
      { value:'science', label:'Science & Society' },
      { value:'economics', label:'Economics & Policy' },
      { value:'history', label:'History & Culture' }
    ], 'surprise');
    var fields = document.createElement('div'); fields.className = 'slash-tool-fields slash-practice-fields';
    fields.appendChild(focus.label); fields.appendChild(difficulty.label); fields.appendChild(topic.label);
    var summary = document.createElement('div'); summary.className = 'slash-tool-summary';
    summary.textContent = '1 original passage · 4 checked questions · answers stay hidden until submission';
    var start = document.createElement('button'); start.type = 'button'; start.className = 'slash-tool-primary'; start.textContent = 'Start targeted RC →';
    start.addEventListener('click', function () {
      var parts = focus.select.value.split(':');
      closeMargToolSurface();
      if (requireFunction('startConfiguredRCPractice')) {
        window.startConfiguredRCPractice({
          mode:parts[0] === 'skill' ? 'specific' : 'diagnose',
          focus:parts[1], difficulty:difficulty.select.value, topic:topic.select.value
        });
      } else showUnavailable();
    });
    appendPracticeBack(view.body); view.body.appendChild(fields); view.body.appendChild(summary); view.body.appendChild(start);
  }

  function showDILRPracticeConfigurator() {
    var view = makeToolCard('practice · dilr', 'Configure one complete DILR set', 'Choose the structure and level before Marg builds the set.');
    if (!view) return;
    var topic = selectField('Set family', [
      { value:'Mixed Set Selection', label:'Mixed — surprise me' },
      { value:'Arrangements & Rankings', label:'Arrangements & Rankings' },
      { value:'Scheduling & Allocation', label:'Scheduling & Allocation' },
      { value:'Distribution & Grouping', label:'Distribution & Grouping' },
      { value:'Games & Tournaments', label:'Games & Tournaments' },
      { value:'Routes & Networks', label:'Routes & Networks' },
      { value:'Tables, Charts & DI Caselets', label:'Tables, Charts & DI Caselets' },
      { value:'Venn Diagrams & Set Data', label:'Venn Diagrams & Set Data' }
    ], 'Mixed Set Selection');
    var difficulty = selectField('Difficulty', [
      { value:'cat', label:'CAT-level — medium to medium-hard' },
      { value:'hard', label:'Hard CAT — difficult but fair' }
    ], 'cat');
    var fields = document.createElement('div'); fields.className = 'slash-tool-fields slash-practice-fields';
    fields.appendChild(topic.label); fields.appendChild(difficulty.label);
    var summary = document.createElement('div'); summary.className = 'slash-tool-summary';
    summary.textContent = '1 complete set · 4 linked questions · 16-minute timer · independently checked';
    var start = document.createElement('button'); start.type = 'button'; start.className = 'slash-tool-primary'; start.textContent = 'Build my DILR set →';
    start.addEventListener('click', function () {
      closeMargToolSurface();
      if (requireFunction('startTimedTest')) window.startTimedTest('dilr', topic.select.value, 4, null, 0, { difficulty:difficulty.select.value, source:'slash-practice' });
      else showUnavailable();
    });
    appendPracticeBack(view.body); view.body.appendChild(fields); view.body.appendChild(summary); view.body.appendChild(start);
  }

  function showQAPracticeConfigurator() {
    var view = makeToolCard('practice · qa', 'Configure targeted QA practice', 'Choose the topic and level; Marg will not send an unrelated mixed set.');
    if (!view) return;
    var topic = selectField('Topic', [
      { value:'Mixed QA', label:'Mixed QA — no chapter label' },
      { value:'Arithmetic', label:'Arithmetic — mixed' },
      { value:'Percentages', label:'Percentages' },
      { value:'Ratios & Proportions', label:'Ratios & Proportions' },
      { value:'Time-Speed-Distance', label:'Time, Speed & Distance' },
      { value:'Profit & Loss', label:'Profit & Loss' },
      { value:'Algebra', label:'Algebra — mixed' },
      { value:'Linear Equations', label:'Linear Equations' },
      { value:'Quadratic Equations', label:'Quadratic Equations' },
      { value:'Functions & Inequalities', label:'Functions & Inequalities' },
      { value:'Logarithms & Exponents', label:'Logarithms & Exponents' },
      { value:'Geometry & Mensuration', label:'Geometry & Mensuration — mixed' },
      { value:'Geometry (Triangles, Circles)', label:'Triangles & Circles' },
      { value:'Mensuration (2D & 3D)', label:'Mensuration' },
      { value:'Coordinate Geometry', label:'Coordinate Geometry' },
      { value:'Number Systems', label:'Number Systems' },
      { value:'Modern Math', label:'Modern Math — mixed' },
      { value:'Permutation & Combination', label:'Permutation & Combination' },
      { value:'Probability', label:'Probability' },
      { value:'Set Theory', label:'Set Theory' }
    ], 'Mixed QA');
    var difficulty = selectField('Difficulty', [
      { value:'cat', label:'CAT-level — mixed difficulty' },
      { value:'hard', label:'Hard CAT — difficult but fair' }
    ], 'cat');
    var count = selectField('Session size', [
      { value:'3', label:'3 questions · about 6 minutes' },
      { value:'5', label:'5 questions · about 10 minutes' }
    ], '5');
    var fields = document.createElement('div'); fields.className = 'slash-tool-fields slash-practice-fields';
    fields.appendChild(topic.label); fields.appendChild(difficulty.label); fields.appendChild(count.label);
    var summary = document.createElement('div'); summary.className = 'slash-tool-summary';
    summary.textContent = 'Questions stay locked to your chosen topic and are checked before they appear.';
    var start = document.createElement('button'); start.type = 'button'; start.className = 'slash-tool-primary'; start.textContent = 'Build my QA practice →';
    start.addEventListener('click', function () {
      closeMargToolSurface();
      if (requireFunction('startTimedTest')) window.startTimedTest('qa', topic.select.value, Number(count.select.value), null, 0, { difficulty:difficulty.select.value, source:'slash-practice' });
      else showUnavailable();
    });
    appendPracticeBack(view.body); view.body.appendChild(fields); view.body.appendChild(summary); view.body.appendChild(start);
  }

  function scoreInput(labelText, max) {
    var label = document.createElement('label'); label.className = 'slash-score-field';
    var span = document.createElement('span'); span.textContent = labelText;
    var input = document.createElement('input'); input.type = 'number'; input.min = '0'; input.max = String(max); input.inputMode = 'numeric'; input.placeholder = '—';
    label.appendChild(span); label.appendChild(input); return { label:label, input:input };
  }

  function showMockCard() {
    var view = makeToolCard('mock-analysis', 'Analyse a mock you already took', 'Enter existing scores or attach the scorecard. This analyses your attempt; Marg does not provide a mock test.');
    if (!view) return;
    var scoreRow = document.createElement('div'); scoreRow.className = 'slash-score-row';
    var varc = scoreInput('VARC', 72), dilr = scoreInput('DILR', 60), qa = scoreInput('QA', 60);
    scoreRow.appendChild(varc.label); scoreRow.appendChild(dilr.label); scoreRow.appendChild(qa.label);
    var actions = document.createElement('div'); actions.className = 'slash-tool-inline-actions';
    var analyse = document.createElement('button'); analyse.type = 'button'; analyse.className = 'slash-tool-primary'; analyse.textContent = 'Analyse these scores →';
    analyse.addEventListener('click', async function () {
      var values = [varc.input.value, dilr.input.value, qa.input.value];
      if (!values.some(function (value) { return String(value).trim() !== ''; })) {
        var note = view.body.querySelector('.slash-tool-error');
        if (!note) { note = document.createElement('div'); note.className = 'slash-tool-error'; view.body.appendChild(note); }
        note.textContent = 'Enter at least one section score. Blank means unknown; 0 is a valid score.';
        return;
      }
      var ids = ['mac-varc','mac-dilr','mac-qa'];
      values.forEach(function (value, index) { var target = document.getElementById(ids[index]); if (target) target.value = value; });
      closeMargToolSurface();
      if (requireFunction('submitMockScores')) await window.submitMockScores(); else showUnavailable();
    });
    var upload = document.createElement('button'); upload.type = 'button'; upload.className = 'slash-tool-secondary'; upload.textContent = 'Attach scorecard';
    upload.addEventListener('click', function () { closeMargToolSurface(); if (requireFunction('openMockScorecardUpload')) window.openMockScorecardUpload(); else showUnavailable(); });
    actions.appendChild(analyse); actions.appendChild(upload);
    view.body.appendChild(scoreRow); view.body.appendChild(actions);
    appendPreviousMockAnalyses(view.body);
  }

  function appendPreviousMockAnalyses(body) {
    if (!requireFunction('buildPreviousMockAnalyses')) return;
    var analyses = window.buildPreviousMockAnalyses();
    var section = document.createElement('div'); section.className = 'slash-tool-history';
    var title = document.createElement('div'); title.className = 'slash-tool-history-title'; title.textContent = 'Previous analyses'; section.appendChild(title);
    if (!analyses.length) {
      var empty = document.createElement('p'); empty.textContent = 'No earlier mock analysis yet.'; section.appendChild(empty); body.appendChild(section); return;
    }
    window.previousMockAnalyses = analyses;
    analyses.slice(0, 4).forEach(function (item, index) {
      var button = document.createElement('button'); button.type = 'button'; button.className = 'slash-history-row';
      var total = item.scores ? item.scores.total + ' total · VARC ' + item.scores.varc + ' · DILR ' + item.scores.dilr + ' · QA ' + item.scores.qa : 'Scorecard analysis';
      button.textContent = (requireFunction('formatMockHistoryDate') ? window.formatMockHistoryDate(item.createdAt) : 'Earlier mock') + ' — ' + total;
      button.addEventListener('click', function () { if (requireFunction('openPreviousMockAnalysis')) window.openPreviousMockAnalysis(index); });
      section.appendChild(button);
    });
    body.appendChild(section);
  }

  function progressLine(label, value, state) {
    var row = document.createElement('div'); row.className = 'slash-progress-row ' + (state || '');
    var key = document.createElement('span'); key.textContent = label;
    var copy = document.createElement('strong'); copy.textContent = value;
    row.appendChild(key); row.appendChild(copy); return row;
  }

  async function showProgressCard() {
    var view = makeToolCard('progress', 'Your Marg evidence trail', 'This separates what is known, what is still a working read and what should happen next.');
    if (!view) return;
    var loading = document.createElement('div'); loading.className = 'slash-tool-loading'; loading.textContent = 'Loading your latest evidence…'; view.body.appendChild(loading);
    try {
      if (typeof mentorExecutionLoop !== 'undefined' && mentorExecutionLoop && !mentorExecutionLoop.loaded && requireFunction('loadMentorExecutionLoop')) await window.loadMentorExecutionLoop();
      view.body.innerHTML = '';
      if (!requireFunction('getProgressJourneyData')) { showUnavailable(); return; }
      var journey = window.getProgressJourneyData();
      var recommendation = requireFunction('buildHomeRecommendation') ? window.buildHomeRecommendation() : { title:'Bring Marg one real attempt.', copy:'Marg needs observable work before confirming a pattern.' };
      if (!journey.diagnosis && !journey.task && !journey.attempt) {
        view.body.appendChild(progressLine('Current state', 'No reliable pattern yet', 'current'));
        view.body.appendChild(progressLine('Needed next', 'One real question, set or mock decision to investigate', 'unknown'));
      } else {
        var diagnosis = journey.diagnosis;
        view.body.appendChild(progressLine('Working pattern', diagnosis && diagnosis.mechanism ? diagnosis.mechanism : 'Cause is still unknown', diagnosis && diagnosis.status === 'confirmed' ? 'confirmed' : 'current'));
        var evidence = journey.evidence && journey.evidence.length ? journey.evidence.slice(0, 2).map(function (item) { return item.claim; }).filter(Boolean).join(' · ') : 'No supporting signal saved yet';
        view.body.appendChild(progressLine('Evidence', evidence, journey.evidence && journey.evidence.length ? 'observed' : 'unknown'));
        view.body.appendChild(progressLine('Intervention', journey.task ? (journey.task.title || journey.task.objective || 'Saved check') : 'Not selected yet', journey.task ? 'observed' : 'unknown'));
        var attemptText = 'Not measured yet';
        if (journey.attempt) {
          var total = Number(journey.attempt.correct || 0) + Number(journey.attempt.wrong || 0) + Number(journey.attempt.skipped || 0);
          attemptText = Number(journey.attempt.correct || 0) + '/' + total + ' correct';
        }
        view.body.appendChild(progressLine('Re-test result', attemptText, journey.attempt ? 'observed' : 'unknown'));
      }
      view.body.appendChild(progressLine('Next decision', recommendation.title || recommendation.copy || 'Continue with Marg', 'next'));
      var next = document.createElement('button'); next.type = 'button'; next.className = 'slash-tool-primary'; next.textContent = recommendation.cta || 'Continue with Marg →';
      next.addEventListener('click', function () { closeMargToolSurface(); if (requireFunction('runHomeRecommendation')) window.runHomeRecommendation(); });
      view.body.appendChild(next);
    } catch (error) {
      loading.textContent = 'Progress could not load. Your chat is unchanged; retry /progress.';
    }
  }

  function openMargTool(id) {
    closeSlashCommandMenu();
    var input = inputElement(); if (input && /^\s*\//.test(input.value)) { input.value = ''; input.dispatchEvent(new Event('input', { bubbles:true })); }
    if (requireFunction('switchTab')) window.switchTab('chat');
    if (id === 'diagnose') showDiagnosisCard();
    else if (id === 'practice') showPracticeCard();
    else if (id === 'mock' || id === 'mock-analysis') showMockCard();
    else if (id === 'today-varc' || id === 'varc') openTodaysVarc();
    else if (id === 'progress') showProgressCard();
  }

  function openSlashCommandMenuFromMenu() {
    if (requireFunction('closeAppMenu')) window.closeAppMenu();
    if (requireFunction('switchTab')) window.switchTab('chat');
    setTimeout(function () { renderSlashCommandMenu(''); if (inputElement()) inputElement().focus(); }, 40);
  }

  function handleInput() {
    var input = inputElement(); if (!input) return;
    if (/^\s*\//.test(input.value) && !/\s/.test(input.value.trim().slice(1))) renderSlashCommandMenu(input.value);
    else if (isMenuOpen()) closeSlashCommandMenu();
  }

  function handleKeydown(event) {
    if (!isMenuOpen()) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault(); event.stopImmediatePropagation();
      var delta = event.key === 'ArrowDown' ? 1 : -1;
      activeIndex = visibleCommands.length ? (activeIndex + delta + visibleCommands.length) % visibleCommands.length : 0;
      updateActiveCommandRows();
    } else if (event.key === 'Enter' && !event.shiftKey && visibleCommands[activeIndex]) {
      event.preventDefault(); event.stopImmediatePropagation(); openMargTool(visibleCommands[activeIndex].id);
    } else if (event.key === 'Escape') {
      event.preventDefault(); event.stopImmediatePropagation(); closeSlashCommandMenu({ focus:true });
    }
  }

  function init() {
    var input = inputElement();
    if (!input || input.dataset.slashToolsReady === '1') return;
    input.dataset.slashToolsReady = '1';
    input.addEventListener('input', handleInput);
    input.addEventListener('keydown', handleKeydown, true);
    document.addEventListener('click', function (event) {
      if (!isMenuOpen()) return;
      var menu = menuElement(), button = buttonElement();
      if (menu && !menu.contains(event.target) && (!button || !button.contains(event.target)) && event.target !== input) closeSlashCommandMenu();
    });
  }

  window.MARG_SLASH_COMMANDS = commands;
  window.toggleSlashCommandMenu = toggleSlashCommandMenu;
  window.closeSlashCommandMenu = closeSlashCommandMenu;
  window.openSlashCommandMenuFromMenu = openSlashCommandMenuFromMenu;
  window.openMargTool = openMargTool;
  window.closeMargToolSurface = closeMargToolSurface;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
