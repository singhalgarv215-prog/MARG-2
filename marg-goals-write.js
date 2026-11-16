// Persistent goals: the WRITE side (P4.3). Separate from marg-goals.js, which stays read-only.
// Off unless the same flag is on (staging plus explicit opt-in). Goal-agnostic: no exam names here.
// Every write is an insert or a call to a database function that runs as the signed-in user (RLS applies).
// There is no update or delete of a goal or of a thread's goal: a conversation's goal is fixed when it is created.
(function (root) {
  'use strict';

  var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  var KINDS = ['exam', 'career', 'skill', 'other'];

  function validateGoalInput(input) {
    input = input || {};
    var title = String(input.title == null ? '' : input.title).trim();
    var kind = String(input.kind == null ? '' : input.kind).trim();
    var description = String(input.description == null ? '' : input.description).trim();
    var outcome = String(input.desiredOutcome == null ? '' : input.desiredOutcome).trim();
    if (!title) return { ok: false, error: 'Give the goal a title.' };
    if (title.length > 120) return { ok: false, error: 'The title can be at most 120 characters.' };
    if (!kind || kind.length > 40) return { ok: false, error: 'Choose what kind of goal this is.' };
    if (description.length > 1000) return { ok: false, error: 'The description can be at most 1000 characters.' };
    if (outcome.length > 500) return { ok: false, error: 'The desired outcome can be at most 500 characters.' };
    return { ok: true, value: { kind: kind, title: title, description: description || null, desired_outcome: outcome || null } };
  }

  // Nothing is pre-selected: adoption needs at least one id the student ticked.
  function cleanSelection(sel) {
    sel = sel || {};
    function ids(a) { return (Array.isArray(a) ? a : []).filter(function (x) { return typeof x === 'string' && UUID.test(x); }).map(function (x) { return x.toLowerCase(); }); }
    var out = { diagnoses: ids(sel.diagnosisIds), tasks: ids(sel.taskIds), attempts: ids(sel.attemptIds), evidence: ids(sel.evidenceIds) };
    out.total = out.diagnoses.length + out.tasks.length + out.attempts.length + out.evidence.length;
    return out;
  }

  function friendly(status, text) {
    var t = String(text || '');
    if (/at most 10|too many|Goal limit reached|live goals/i.test(t)) return 'You already have the most goals allowed (10). Finish or archive one first.';
    if (status === 401 || status === 403) return 'You need to sign in again.';
    return 'That did not save. Nothing on your account was changed.';
  }

  function createClient(deps) {
    var inFlight = false;
    var adoptKey = null; // reused across retries of the SAME adoption attempt so a retry can never adopt twice
    function headers(extra) { return Object.assign({ 'Content-Type': 'application/json', 'Accept': 'application/json' }, extra || {}); }
    function guard() {
      if (!deps.isEnabled()) return { state: 'off' };
      if (!deps.getUserId()) return { state: 'off' };
      return null;
    }
    async function call(url, opts) {
      var res = await deps.fetch(url, opts);
      var text = '';
      try { text = res.ok ? '' : await res.text(); } catch (e) { text = ''; }
      return { res: res, text: text };
    }

    async function createGoal(input) {
      var off = guard(); if (off) return off;
      var v = validateGoalInput(input);
      if (!v.ok) return { state: 'invalid', error: v.error };
      if (inFlight) return { state: 'busy' };
      inFlight = true;
      var startedFor = deps.getUserId();
      try {
        var body = Object.assign({ user_id: startedFor }, v.value);
        var r = await call(deps.baseUrl + '/rest/v1/goals', { method: 'POST', headers: headers({ Prefer: 'return=representation' }), body: JSON.stringify(body) });
        if (!r.res.ok) return { state: 'error', error: friendly(r.res.status, r.text) };
        var rows = await r.res.json();
        var goal = Array.isArray(rows) ? rows[0] : null;
        if (!goal || typeof goal.id !== 'string' || !UUID.test(goal.id)) return { state: 'error', error: friendly(0, '') };
        if (deps.getUserId() !== startedFor) return { state: 'stale' };
        return { state: 'ok', goalId: goal.id.toLowerCase(), title: String(goal.title || v.value.title) };
      } catch (e) {
        return { state: 'error', error: friendly(0, '') };
      } finally { inFlight = false; }
    }

    // Whole families are what move, so the choices are diagnoses (their tasks, attempts and evidence come with them).
    async function listUnassigned() {
      var off = guard(); if (off) return off;
      try {
        var r = await deps.fetch(deps.baseUrl + '/rest/v1/mentor_diagnoses?select=id,section,topic,mechanism,created_at&goal_id=is.null&order=created_at.desc&limit=50', { method: 'GET', headers: headers() });
        if (!r.ok) return { state: 'unavailable' };
        var rows = await r.json();
        if (!Array.isArray(rows)) return { state: 'unavailable' };
        return { state: 'ok', items: rows.filter(function (x) { return x && typeof x.id === 'string' && UUID.test(x.id); }).map(function (x) { return { id: x.id.toLowerCase(), section: String(x.section || '').slice(0, 40), topic: String(x.topic || '').slice(0, 120), summary: String(x.mechanism || '').slice(0, 200), createdAt: String(x.created_at || '').slice(0, 40) }; }) };
      } catch (e) { return { state: 'unavailable' }; }
    }

    async function adoptWorkspace(input, selection) {
      var off = guard(); if (off) return off;
      var v = validateGoalInput(input);
      if (!v.ok) return { state: 'invalid', error: v.error };
      var sel = cleanSelection(selection);
      if (!sel.total) return { state: 'invalid', error: 'Tick at least one item to bring into the goal. Nothing is selected for you.' };
      if (inFlight) return { state: 'busy' };
      inFlight = true;
      var startedFor = deps.getUserId();
      if (!adoptKey) adoptKey = 'adopt-' + (deps.random ? deps.random() : String(Date.now()) + '-' + Math.random().toString(36).slice(2, 10));
      try {
        var body = { p_idempotency_key: adoptKey, p_kind: v.value.kind, p_title: v.value.title, p_description: v.value.description, p_desired_outcome: v.value.desired_outcome,
          p_diagnosis_ids: sel.diagnoses, p_task_ids: sel.tasks, p_attempt_ids: sel.attempts, p_evidence_ids: sel.evidence, p_threads: [], p_mock_keys: [] };
        var r = await call(deps.baseUrl + '/rest/v1/rpc/adopt_workspace', { method: 'POST', headers: headers(), body: JSON.stringify(body) });
        if (!r.res.ok) return { state: 'error', error: friendly(r.res.status, r.text) }; // key kept: a retry is the same attempt
        var j = await r.res.json();
        adoptKey = null; // finished, so the next adoption is a new attempt
        if (!j || typeof j.goal_id !== 'string' || !UUID.test(j.goal_id)) return { state: 'error', error: friendly(0, '') };
        if (deps.getUserId() !== startedFor) return { state: 'stale' };
        var mv = j.moved || {};
        return { state: 'ok', repeat: !!j.repeat, goalId: j.goal_id.toLowerCase(), adoptionId: typeof j.adoption_id === 'string' ? j.adoption_id : null,
          moved: { diagnoses: +mv.diagnoses || 0, tasks: +mv.tasks || 0, attempts: +mv.attempts || 0, evidence: +mv.evidence || 0 } };
      } catch (e) {
        return { state: 'error', error: friendly(0, '') };
      } finally { inFlight = false; }
    }

    async function undoAdoption(adoptionId) {
      var off = guard(); if (off) return off;
      if (typeof adoptionId !== 'string' || !UUID.test(adoptionId)) return { state: 'invalid', error: 'Unknown adoption.' };
      try {
        var r = await call(deps.baseUrl + '/rest/v1/rpc/undo_adoption', { method: 'POST', headers: headers(), body: JSON.stringify({ p_adoption_id: adoptionId }) });
        if (!r.res.ok) return { state: 'error', error: /newer activity/i.test(r.text) ? 'This cannot be undone now: newer activity in the goal depends on those items.' : friendly(r.res.status, r.text) };
        return { state: 'ok' };
      } catch (e) { return { state: 'error', error: friendly(0, '') }; }
    }

    // A conversation's goal is chosen here, once. There is no function that changes it later.
    async function createGoalThread(goalId, clientThreadId, title) {
      var off = guard(); if (off) return off;
      if (typeof goalId !== 'string' || !UUID.test(goalId)) return { state: 'invalid', error: 'Unknown goal.' };
      if (typeof clientThreadId !== 'string' || clientThreadId.length < 8 || clientThreadId.length > 80) return { state: 'invalid', error: 'Bad conversation id.' };
      try {
        var body = { user_id: deps.getUserId(), goal_id: goalId.toLowerCase(), client_thread_id: clientThreadId, title: String(title || 'New chat').slice(0, 80) };
        var r = await call(deps.baseUrl + '/rest/v1/chat_threads', { method: 'POST', headers: headers({ Prefer: 'return=minimal' }), body: JSON.stringify(body) });
        if (!r.res.ok) return { state: 'error', error: friendly(r.res.status, r.text) };
        return { state: 'ok' };
      } catch (e) { return { state: 'error', error: friendly(0, '') }; }
    }

    // Map of conversation id -> goal id, from the server. Conversations with no entry are General.
    async function loadThreadScopes() {
      var off = guard(); if (off) return off;
      var startedFor = deps.getUserId();
      try {
        var r = await deps.fetch(deps.baseUrl + '/rest/v1/chat_threads?select=client_thread_id,goal_id&goal_id=not.is.null&archived_at=is.null&limit=500', { method: 'GET', headers: headers() });
        if (!r.ok) return { state: 'unavailable' };
        var rows = await r.json();
        if (!Array.isArray(rows)) return { state: 'unavailable' };
        if (deps.getUserId() !== startedFor) return { state: 'stale' };
        var map = {};
        rows.forEach(function (x) { if (x && typeof x.client_thread_id === 'string' && typeof x.goal_id === 'string' && UUID.test(x.goal_id)) map[x.client_thread_id] = x.goal_id.toLowerCase(); });
        return { state: 'ok', map: map };
      } catch (e) { return { state: 'unavailable' }; }
    }

    return { createGoal: createGoal, listUnassigned: listUnassigned, adoptWorkspace: adoptWorkspace, undoAdoption: undoAdoption, createGoalThread: createGoalThread, loadThreadScopes: loadThreadScopes };
  }

  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var LABELS = { exam: 'Exam preparation', career: 'Career', skill: 'Skill', other: 'Other' };
  var FIELD = 'display:block;width:100%;box-sizing:border-box;min-height:44px;font-size:16px;margin:4px 0 12px;padding:8px 10px';
  var BTN = 'min-height:44px;padding:10px 16px;font-size:16px;margin:4px 8px 8px 0;cursor:pointer';
  function kindSelect(id) { return '<select id="' + id + '" style="' + FIELD + '">' + KINDS.map(function (k) { return '<option value="' + k + '">' + esc(LABELS[k]) + '</option>'; }).join('') + '</select>'; }
  // Forms for creating a goal, saving earlier work as a goal (nothing ticked), and starting a conversation inside a goal.
  // goals: [{id,title}], unassigned: {state,items} or null.
  function actionsHtml(goals, unassigned) {
    var h = '<section class="saved-goals-actions" aria-label="Create or save a goal">';
    h += '<h2 class="goals-note"><strong>Create a goal</strong></h2><form onsubmit="return margGoalsCreateSubmit(event)">' +
      '<label>Title<input id="mg-title" maxlength="120" autocomplete="off" style="' + FIELD + '"></label>' +
      '<label>Kind of goal' + kindSelect('mg-kind') + '</label>' +
      '<label>Describe it (optional)<textarea id="mg-desc" maxlength="1000" rows="2" style="' + FIELD + '"></textarea></label>' +
      '<label>Outcome you want (optional)<input id="mg-outcome" maxlength="500" autocomplete="off" style="' + FIELD + '"></label>' +
      '<button type="submit" style="' + BTN + '">Create goal</button><div id="mg-msg" role="status" class="goals-note"></div></form>';
    if (unassigned && unassigned.state === 'ok' && unassigned.items.length) {
      h += '<h2 class="goals-note"><strong>Save my earlier work as a goal</strong></h2><p class="goals-note">Nothing is selected for you. Tick what belongs in this goal. Each diagnosis moves together with its tasks, attempts and evidence, and nothing is deleted.</p>' +
        '<form onsubmit="return margGoalsAdoptSubmit(event)"><ul style="list-style:none;padding:0;margin:0 0 12px">';
      unassigned.items.forEach(function (it) {
        h += '<li><label style="display:flex;gap:10px;align-items:flex-start;min-height:44px;padding:6px 0"><input type="checkbox" class="mg-pick" value="' + esc(it.id) + '" style="width:22px;height:22px;flex:none"><span>' + esc(it.topic || it.section || 'Diagnosis') + (it.summary ? ': ' + esc(it.summary) : '') + '</span></label></li>';
      });
      h += '</ul><label>Goal title<input id="mg-adopt-title" maxlength="120" autocomplete="off" style="' + FIELD + '"></label><label>Kind of goal' + kindSelect('mg-adopt-kind') + '</label>' +
        '<button type="submit" style="' + BTN + '">Save selected as a goal</button><div id="mg-adopt-msg" role="status" class="goals-note"></div></form>';
    }
    if (goals && goals.length) {
      h += '<h2 class="goals-note"><strong>Start a conversation in a goal</strong></h2><p class="goals-note">A conversation stays in the goal it starts in. To change goal, start a new conversation.</p>';
      goals.forEach(function (g) { h += '<button type="button" style="' + BTN + '" onclick="margGoalsNewChat(\'' + esc(g.id) + '\')">New chat in ' + esc(g.title) + '</button>'; });
    }
    return h + '</section>';
  }

  var api = { KINDS: KINDS, validateGoalInput: validateGoalInput, cleanSelection: cleanSelection, createClient: createClient, actionsHtml: actionsHtml };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.MargGoalsWrite = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
