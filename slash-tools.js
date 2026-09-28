(function () {
  'use strict';

  var activeIndex = 0;
  var visibleCommands = [];
  var commands = [
    { id:'diagnose', command:'/diagnose', title:'Find what is holding me back', description:'Investigate one real problem before deciding the fix.', icon:'⌖' },
    { id:'practice', command:'/practice', title:'Practice VARC, DILR or QA', description:'Start a checked practice session from this chat.', icon:'✍' },
    { id:'mock', command:'/mock', title:'Analyse a recent mock', description:'Enter scores or attach a scorecard without leaving the chat.', icon:'▥' },
    { id:'sectional', command:'/sectional', title:'Take a timed sectional', description:'Choose the section and topic, then start the timed interface.', icon:'◴' },
    { id:'today-varc', command:'/today-varc', title:'Open Today’s VARC', description:'Turn the current Aeon article into an RC experience.', icon:'▤' },
    { id:'progress', command:'/progress', title:'Review my evidence trail', description:'See the working pattern, evidence, intervention, result and next decision.', icon:'↗' }
  ];

  function inputElement() { return document.getElementById('user-input'); }
  function menuElement() { return document.getElementById('slash-command-menu'); }
  function buttonElement() { return document.getElementById('slash-tools-btn'); }

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
      row.addEventListener('mouseenter', function () { activeIndex = index; renderSlashCommandMenu(query); });
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

  function makeToolCard(id, title, subtitle) {
    var messages = document.getElementById('messages');
    if (!messages) return null;
    Array.prototype.forEach.call(messages.querySelectorAll('[data-marg-tool-card]'), function (card) {
      if (card.dataset.margToolCard === id) card.remove();
    });
    var wrap = document.createElement('div');
    wrap.className = 'slash-tool-wrap fade-in';
    wrap.dataset.margToolCard = id;
    var card = document.createElement('section'); card.className = 'slash-tool-card';
    var head = document.createElement('div'); head.className = 'slash-tool-card-head';
    var headCopy = document.createElement('div');
    var label = document.createElement('div'); label.className = 'slash-tool-label'; label.textContent = '/' + id;
    var heading = document.createElement('h3'); heading.textContent = title;
    var sub = document.createElement('p'); sub.textContent = subtitle;
    var close = document.createElement('button'); close.type = 'button'; close.className = 'slash-tool-close'; close.setAttribute('aria-label', 'Close tool'); close.textContent = '×'; close.addEventListener('click', function () { wrap.remove(); });
    headCopy.appendChild(label); headCopy.appendChild(heading); headCopy.appendChild(sub); head.appendChild(headCopy); head.appendChild(close);
    var body = document.createElement('div'); body.className = 'slash-tool-body';
    card.appendChild(head); card.appendChild(body); wrap.appendChild(card); messages.appendChild(wrap);
    if (typeof scrollChatToLatest === 'function') scrollChatToLatest(); else messages.scrollTop = messages.scrollHeight;
    return { wrap:wrap, card:card, body:body };
  }

  function toolButton(label, description, onClick, className) {
    var button = document.createElement('button'); button.type = 'button'; button.className = 'slash-tool-action ' + (className || '');
    var strong = document.createElement('strong'); strong.textContent = label;
    var span = document.createElement('span'); span.textContent = description;
    button.appendChild(strong); button.appendChild(span); button.addEventListener('click', onClick);
    return button;
  }

  function requireFunction(name) {
    return typeof window[name] === 'function';
  }

  function showUnavailable() {
    if (requireFunction('showComposerStatus')) window.showComposerStatus('This tool is still loading. Try once more in a moment.', 'info', true);
  }

  function openTodaysVarc() {
    if (requireFunction('closeAppMenu')) window.closeAppMenu();
    if (requireFunction('switchTab')) window.switchTab('chat');
    var card = document.getElementById('varc-card');
    if (card && card.classList.contains('visible')) {
      if (typeof card.scrollIntoView === 'function') card.scrollIntoView({ behavior:'smooth', block:'nearest' });
      return;
    }
    if (requireFunction('toggleVarcCard')) window.toggleVarcCard(); else showUnavailable();
  }

  function showPracticeCard() {
    var view = makeToolCard('practice', 'Choose the work, not another page', 'Practice begins from this chat. Your result returns to the same evidence trail.');
    if (!view) return;
    var grid = document.createElement('div'); grid.className = 'slash-tool-grid';
    grid.appendChild(toolButton('RC Lab', 'Article-based RC with clickable questions.', function () {
      view.wrap.remove();
      openTodaysVarc();
    }));
    grid.appendChild(toolButton('QA practice', 'Five mixed CAT-style questions with a timer.', function () {
      view.wrap.remove();
      if (requireFunction('startTimedTest')) window.startTimedTest('qa', 'Mixed QA', 5); else showUnavailable();
    }));
    grid.appendChild(toolButton('DILR practice', 'One checked set focused on selection and representation.', function () {
      view.wrap.remove();
      if (requireFunction('startTimedTest')) window.startTimedTest('dilr', 'Mixed Set Selection', 4); else showUnavailable();
    }));
    grid.appendChild(toolButton('Timed sectional', 'Choose a section and topic before starting.', function () { view.wrap.remove(); showSectionalCard(); }));
    view.body.appendChild(grid);
  }

  function createSelect(labelText, id, values) {
    var group = document.createElement('label'); group.className = 'slash-tool-field'; group.setAttribute('for', id);
    var label = document.createElement('span'); label.textContent = labelText;
    var select = document.createElement('select'); select.id = id;
    values.forEach(function (value) { var option = document.createElement('option'); option.value = value.value || value; option.textContent = value.label || value; select.appendChild(option); });
    group.appendChild(label); group.appendChild(select); return { group:group, select:select };
  }

  function showSectionalCard() {
    var view = makeToolCard('sectional', 'Start a timed sectional', 'Choose the section and focus. The existing checked test engine opens immediately.');
    if (!view) return;
    var section = createSelect('Section', 'slash-sectional-section', [
      {value:'varc',label:'VARC · timed RC'}, {value:'qa',label:'QA · 10 questions'}, {value:'dilr',label:'DILR · 3 sets'}
    ]);
    var topic = createSelect('Focus', 'slash-sectional-topic', ['Mixed / surprise','Arithmetic','Algebra','Geometry','Arrangements & Rankings','Scheduling & Allocation','Science & Society','Ideas & Philosophy']);
    function refreshTopics() {
      var sets = {
        varc:['Surprise theme','Ideas & Philosophy','Science & Society','Economics & Policy','History & Culture'],
        qa:['Percentages','Ratios & Proportions','Time-Speed-Distance','Profit & Loss','Linear Equations','Quadratic Equations','Functions & Inequalities','Geometry (Triangles, Circles)','Number Systems','Probability'],
        dilr:['Arrangements & Rankings','Scheduling & Allocation','Distribution & Grouping','Games & Tournaments','Routes & Networks','Tables, Charts & DI Caselets','Mixed Set Selection']
      };
      topic.select.innerHTML = '';
      sets[section.select.value].forEach(function (value) { var option = document.createElement('option'); option.textContent = value; option.value = value; topic.select.appendChild(option); });
    }
    section.select.addEventListener('change', refreshTopics); refreshTopics();
    var fields = document.createElement('div'); fields.className = 'slash-tool-fields'; fields.appendChild(section.group); fields.appendChild(topic.group);
    var start = document.createElement('button'); start.type = 'button'; start.className = 'slash-tool-primary'; start.textContent = 'Start timed sectional →';
    start.addEventListener('click', function () {
      if (!requireFunction('startSectionalFromHub')) { showUnavailable(); return; }
      var sectionValue = section.select.value;
      var legacySelect = document.getElementById('home-' + sectionValue + '-sectional-topic');
      if (legacySelect) {
        var desired = topic.select.value;
        Array.prototype.some.call(legacySelect.options, function (option) {
          if (option.textContent === desired || option.value === desired) { legacySelect.value = option.value; return true; }
          return false;
        });
      }
      view.wrap.remove();
      window.startSectionalFromHub(sectionValue);
    });
    view.body.appendChild(fields); view.body.appendChild(start);
  }

  function scoreInput(labelText, max) {
    var label = document.createElement('label'); label.className = 'slash-score-field';
    var span = document.createElement('span'); span.textContent = labelText;
    var input = document.createElement('input'); input.type = 'number'; input.min = '0'; input.max = String(max); input.inputMode = 'numeric'; input.placeholder = '—';
    label.appendChild(span); label.appendChild(input); return { label:label, input:input };
  }

  function showMockCard() {
    var view = makeToolCard('mock', 'Analyse a mock in this conversation', 'A score locates the outcome. Marg will still ask for execution evidence before diagnosing the cause.');
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
      view.wrap.remove();
      if (requireFunction('submitMockScores')) await window.submitMockScores(); else showUnavailable();
    });
    var upload = document.createElement('button'); upload.type = 'button'; upload.className = 'slash-tool-secondary'; upload.textContent = 'Attach scorecard';
    upload.addEventListener('click', function () { view.wrap.remove(); if (requireFunction('openMockScorecardUpload')) window.openMockScorecardUpload(); else showUnavailable(); });
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
      next.addEventListener('click', function () { view.wrap.remove(); if (requireFunction('runHomeRecommendation')) window.runHomeRecommendation(); });
      view.body.appendChild(next);
    } catch (error) {
      loading.textContent = 'Progress could not load. Your chat is unchanged; retry /progress.';
    }
  }

  function openMargTool(id) {
    closeSlashCommandMenu();
    var input = inputElement(); if (input && /^\s*\//.test(input.value)) { input.value = ''; input.dispatchEvent(new Event('input', { bubbles:true })); }
    if (requireFunction('switchTab')) window.switchTab('chat');
    if (id === 'diagnose') { if (requireFunction('launchHomeDiagnosis')) window.launchHomeDiagnosis(); else showUnavailable(); }
    else if (id === 'practice') showPracticeCard();
    else if (id === 'mock') showMockCard();
    else if (id === 'sectional' || id === 'sectionals') showSectionalCard();
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
      renderSlashCommandMenu(inputElement() ? inputElement().value : '');
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
      if (menu && !menu.contains(event.target) && button && !button.contains(event.target) && event.target !== input) closeSlashCommandMenu();
    });
  }

  window.MARG_SLASH_COMMANDS = commands;
  window.toggleSlashCommandMenu = toggleSlashCommandMenu;
  window.closeSlashCommandMenu = closeSlashCommandMenu;
  window.openSlashCommandMenuFromMenu = openSlashCommandMenuFromMenu;
  window.openMargTool = openMargTool;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
