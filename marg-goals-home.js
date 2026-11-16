// Persistent goals, P4.4: Home goal cards, the explicit Daily Loop focus, and the Journey goal picker.
// Off unless the goals flag is on (staging plus explicit opt-in). Goal-agnostic: no exam names in this file.
// Network: reads of goal rows, and one write: the student's own Daily Loop focus choice (an upsert of their single row).
(function (root) {
  'use strict';

  var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  var PREFIX = /^g[0-9a-f]{8}~/;
  var OPEN_STATUS = ['ready', 'generating', 'in_progress'];

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function stripRefs(rows) {
    return (Array.isArray(rows) ? rows : []).filter(Boolean).map(function (row) {
      if (typeof row.client_ref === 'string') row = Object.assign({}, row, { client_ref: row.client_ref.replace(PREFIX, '') });
      return row;
    });
  }
  function shortDate(value) {
    var d = value ? new Date(value) : null;
    if (!d || isNaN(d.getTime())) return '';
    try { return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }); } catch (e) { return ''; }
  }

  // For each goal: the time of its latest saved task update and its first open task. Never invented: no rows means no text.
  function pickActivity(rows) {
    var byGoal = {};
    (Array.isArray(rows) ? rows : []).forEach(function (row) { // rows arrive newest first
      if (!row || typeof row.goal_id !== 'string' || !UUID.test(row.goal_id)) return;
      var id = row.goal_id.toLowerCase(), slot = byGoal[id] || (byGoal[id] = { lastAt: '', next: null });
      if (!slot.lastAt && row.updated_at) slot.lastAt = String(row.updated_at).slice(0, 40);
      if (!slot.next && OPEN_STATUS.indexOf(row.status) >= 0 && row.title) slot.next = { title: String(row.title).slice(0, 140), status: row.status };
    });
    return byGoal;
  }

  function createClient(deps) {
    var focusInFlight = false;
    function headers(extra) { return Object.assign({ 'Content-Type': 'application/json', 'Accept': 'application/json' }, extra || {}); }
    function guard() { return !deps.isEnabled() || !deps.getUserId() ? { state: 'off' } : null; }
    async function getJson(path) {
      var r = await deps.fetch(deps.baseUrl + '/rest/v1/' + path, { method: 'GET', headers: headers() });
      if (!r.ok) throw new Error('status ' + r.status);
      return r.json();
    }

    // One goal's rows for the Journey, or the unassigned ones when goalId is null. Any failed part makes the whole answer
    // "unavailable": a partial answer is never shown as an empty journey.
    async function loadGoalLoop(goalId) {
      var off = guard(); if (off) return off;
      if (goalId !== null && !(typeof goalId === 'string' && UUID.test(goalId))) return { state: 'invalid' };
      var uid = deps.getUserId();
      var filter = goalId === null ? '&goal_id=is.null' : '&goal_id=eq.' + goalId.toLowerCase();
      var base = 'select=*&user_id=eq.' + encodeURIComponent(uid) + filter;
      try {
        var parts = await Promise.all([
          getJson('mentor_diagnoses?' + base + '&order=updated_at.desc&limit=20'),
          getJson('mentor_tasks?' + base + '&order=updated_at.desc&limit=30'),
          getJson('mentor_task_attempts?' + base + '&order=completed_at.desc&limit=30'),
          getJson('mentor_diagnosis_evidence?' + base + '&order=occurred_at.desc&limit=80')
        ]);
        if (!parts.every(Array.isArray)) return { state: 'unavailable' };
        if (deps.getUserId() !== uid) return { state: 'stale' };
        return { state: 'ok', loop: { diagnoses: stripRefs(parts[0]), tasks: stripRefs(parts[1]), attempts: stripRefs(parts[2]), evidence: stripRefs(parts[3]), loaded: true, unavailable: false, evidenceUnavailable: false } };
      } catch (e) { return { state: 'unavailable' }; }
    }

    async function loadActivity() {
      var off = guard(); if (off) return off;
      var uid = deps.getUserId();
      try {
        var rows = await getJson('mentor_tasks?select=goal_id,title,status,updated_at&goal_id=not.is.null&order=updated_at.desc&limit=300');
        if (!Array.isArray(rows)) return { state: 'unavailable' };
        if (deps.getUserId() !== uid) return { state: 'stale' };
        return { state: 'ok', byGoal: pickActivity(rows) };
      } catch (e) { return { state: 'unavailable' }; }
    }

    // "chosen" is false when the student has made no choice yet. A saved choice of "no goal" is a choice.
    async function loadFocus() {
      var off = guard(); if (off) return off;
      var uid = deps.getUserId();
      try {
        var rows = await getJson('daily_loop_focus?select=goal_id&limit=1');
        if (!Array.isArray(rows)) return { state: 'unavailable' };
        if (deps.getUserId() !== uid) return { state: 'stale' };
        if (!rows.length) return { state: 'ok', chosen: false, goalId: null };
        var g = rows[0] && rows[0].goal_id;
        return { state: 'ok', chosen: true, goalId: typeof g === 'string' && UUID.test(g) ? g.toLowerCase() : null };
      } catch (e) { return { state: 'unavailable' }; }
    }

    // Only ever called from a button the student pressed. goalId null = "no goal". knownGoalIds are the active goals on screen.
    async function setFocus(goalId, knownGoalIds) {
      var off = guard(); if (off) return off;
      if (goalId !== null && !(typeof goalId === 'string' && UUID.test(goalId) && (knownGoalIds || []).indexOf(goalId.toLowerCase()) >= 0)) return { state: 'invalid' };
      if (focusInFlight) return { state: 'busy' };
      focusInFlight = true;
      var uid = deps.getUserId();
      try {
        var r = await deps.fetch(deps.baseUrl + '/rest/v1/daily_loop_focus?on_conflict=user_id', { method: 'POST', headers: headers({ Prefer: 'resolution=merge-duplicates,return=minimal' }), body: JSON.stringify({ user_id: uid, goal_id: goalId === null ? null : goalId.toLowerCase() }) });
        if (!r.ok) return { state: 'error' };
        if (deps.getUserId() !== uid) return { state: 'stale' };
        return { state: 'ok', goalId: goalId === null ? null : goalId.toLowerCase() };
      } catch (e) { return { state: 'error' }; } finally { focusInFlight = false; }
    }

    return { loadGoalLoop: loadGoalLoop, loadActivity: loadActivity, loadFocus: loadFocus, setFocus: setFocus };
  }

  var NOTE = 'display:block;font-size:15px;line-height:1.5;color:var(--text-muted);margin:0 0 8px';
  var BTN = 'min-height:44px;padding:10px 16px;font-size:16px;margin:4px 8px 4px 0;cursor:pointer';

  // model: { goals:[{id,title,status}], activity:{state,byGoal}|null, focus:{state,chosen,goalId}|null }
  function cardsHtml(model) {
    model = model || {};
    var goals = model.goals || [], focus = model.focus || null, activity = model.activity && model.activity.state === 'ok' ? model.activity.byGoal : null;
    var h = '<section class="home-goals" aria-label="Your goals"><h2 class="home-section-title">Your goals</h2>';
    if (!goals.length) return h + '<p class="home-goal-note" style="' + NOTE + '">You have no saved goals yet. Create one in My Goals.</p></section>';
    // A focus on a goal that has since been archived or deleted is no longer a choice: the student is asked again.
    var focusGone = !!(focus && focus.state === 'ok' && focus.chosen && focus.goalId !== null && !goals.some(function (g) { return g.id === focus.goalId; }));
    if (focusGone) { focus = { state: 'ok', chosen: false, goalId: null }; h += '<p class="home-goal-note" style="' + NOTE + '">The goal you had chosen for your Daily Loop is archived or no longer available.</p>'; }
    if (!focus || focus.state === 'unavailable' || focus.state === 'error') h += '<p class="home-goal-note" style="' + NOTE + '">Could not load your Daily Loop focus right now. Nothing has changed.</p>';
    else if (!focus.chosen) h += '<p class="home-goal-note" style="' + NOTE + '"><strong>Which goal is your Daily Loop for?</strong> Marg does not guess. Choose one below, or choose no goal.</p>';
    else if (focus.goalId === null) h += '<p class="home-goal-note" style="' + NOTE + '">Your Daily Loop focus: <strong>no goal</strong> (General).</p>';
    goals.forEach(function (g) {
      var isFocus = !!(focus && focus.chosen && focus.goalId === g.id), info = activity && activity[g.id];
      var last = activity ? (info && info.lastAt ? 'Last saved activity: ' + esc(shortDate(info.lastAt) || 'earlier') : 'No saved activity yet.') : '';
      var next = activity ? (info && info.next ? 'Next step: ' + esc(info.next.title) : 'No next step saved yet. Start a conversation in this goal.') : '';
      h += '<article class="home-goal-card" style="border:1px solid var(--border,#444);border-radius:12px;padding:14px;margin:0 0 12px" aria-label="' + esc(g.title) + '">' +
        '<h3 style="margin:0 0 4px;font-size:17px">' + esc(g.title) + '</h3>' +
        '<div class="home-goal-note" style="' + NOTE + '">' + esc(g.status) + (isFocus ? ' \u00b7 <strong>Daily Loop focus</strong>' : '') + '</div>' +
        (last ? '<div class="home-goal-note" style="' + NOTE + '">' + last + '</div>' : '') + (next ? '<div class="home-goal-note" style="' + NOTE + '">' + next + '</div>' : '') +
        '<div style="margin-top:8px">' +
        '<button type="button" style="' + BTN + '" onclick="margHomeOpenJourney(\'' + esc(g.id) + '\')">Open journey</button>' +
        '<button type="button" style="' + BTN + '" onclick="margGoalsNewChat(\'' + esc(g.id) + '\')">New chat in this goal</button>' +
        '<button type="button" style="' + BTN + '" aria-pressed="' + (isFocus ? 'true' : 'false') + '"' + (isFocus ? ' disabled' : '') + ' onclick="margHomeSetFocus(\'' + esc(g.id) + '\')">' + (isFocus ? 'Daily Loop focus' : 'Use for my Daily Loop') + '</button>' +
        '</div></article>';
    });
    var noGoalChosen = !!(focus && focus.chosen && focus.goalId === null);
    h += '<button type="button" style="' + BTN + '" aria-pressed="' + (noGoalChosen ? 'true' : 'false') + '"' + (noGoalChosen ? ' disabled' : '') + ' onclick="margHomeSetFocus(\'\')">' + (noGoalChosen ? 'Daily Loop: no goal' : 'Use no goal for my Daily Loop') + '</button>';
    return h + '<div id="home-goals-msg" role="status" class="home-goal-note" style="' + NOTE + '"></div></section>';
  }

  // The Journey goal picker: which goal's journey is on screen. view: undefined = follow the open conversation.
  function pickerHtml(goals, activeKey) {
    var chips = [{ key: '', label: 'General workspace' }].concat((goals || []).map(function (g) { return { key: g.id, label: g.title }; }));
    var h = '<div class="jl-view" role="group" aria-label="Show the journey for" style="margin:0 0 12px">';
    chips.forEach(function (c) {
      var on = c.key === activeKey;
      h += '<button type="button" aria-pressed="' + (on ? 'true' : 'false') + '" style="min-height:44px;padding:8px 14px;font-size:16px;margin:0 8px 8px 0;cursor:pointer;' + (on ? 'font-weight:700' : '') + '" onclick="margJourneyShow(\'' + esc(c.key) + '\')">' + esc(c.label) + '</button>';
    });
    return h + '</div>';
  }

  var api = { stripRefs: stripRefs, pickActivity: pickActivity, createClient: createClient, cardsHtml: cardsHtml, pickerHtml: pickerHtml };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.MargGoalsHome = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
