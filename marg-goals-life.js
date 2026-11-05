// Persistent goals, P4.6: archive and restore, "bring in", and permanent deletion (client side).
// Off unless the goals flag is on (staging plus explicit opt-in). Goal-agnostic: no exam names in this file.
// Every change goes through one named database function; nothing here deletes a row directly.
(function (root) {
  'use strict';

  var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  var COUNT_KEYS = ['diagnoses', 'tasks', 'attempts', 'evidence', 'threads', 'messages', 'shares', 'consents'];

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function clean(s, max) { return String(s == null ? '' : s).replace(/<[^>]*>/g, ' ').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max); }
  function shortDate(value) {
    var d = value ? new Date(value) : null;
    if (!d || isNaN(d.getTime())) return '';
    try { return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }); } catch (e) { return ''; }
  }
  function validPreview(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var out = { archived: raw.archived === 1 };
    for (var i = 0; i < COUNT_KEYS.length; i++) {
      var n = raw[COUNT_KEYS[i]];
      if (typeof n !== 'number' || !isFinite(n) || n < 0 || Math.floor(n) !== n) return null;
      out[COUNT_KEYS[i]] = n;
    }
    // uploaded question pages: newer databases report it; an older one does not (then it is 0, never invented)
    out.images = (typeof raw.images === 'number' && isFinite(raw.images) && raw.images >= 0 && Math.floor(raw.images) === raw.images) ? raw.images : 0;
    return out;
  }

  // The text a student sees, and approves, before it is added to a conversation. Facts from saved rows only; evidence levels kept.
  function buildBringInSummary(title, loop) {
    loop = loop || {};
    var diagnoses = (Array.isArray(loop.diagnoses) ? loop.diagnoses : []).filter(function (d) { return d && d.status !== 'superseded' && d.status !== 'rejected' && d.mechanism; });
    var attempts = Array.isArray(loop.attempts) ? loop.attempts.length : 0, tasks = Array.isArray(loop.tasks) ? loop.tasks.length : 0;
    var lines = ['Progress brought in from my goal "' + clean(title, 120) + '" (I asked Marg to add this; it is a summary of what was saved there, not new evidence):'];
    lines.push('- Saved there: ' + attempts + ' observed attempt' + (attempts === 1 ? '' : 's') + ', ' + tasks + ' saved check' + (tasks === 1 ? '' : 's') + ', ' + diagnoses.length + ' working read' + (diagnoses.length === 1 ? '' : 's') + '.');
    diagnoses.slice(0, 3).forEach(function (d) {
      var level = d.status === 'confirmed' ? 'confirmed by repeated evidence' : d.status === 'supported' ? 'supported once' : d.status === 'inconclusive' ? 'inconclusive' : 'a working hypothesis, not confirmed';
      lines.push('- Working read (' + level + '): ' + clean(d.mechanism, 200));
    });
    if (!diagnoses.length) lines.push('- No working read has been saved there yet.');
    return lines.join('\n').slice(0, 1800);
  }

  function createClient(deps) {
    var inFlight = false;
    function headers(extra) { return Object.assign({ 'Content-Type': 'application/json', 'Accept': 'application/json' }, extra || {}); }
    function guard() { return !deps.isEnabled() || !deps.getUserId() ? { state: 'off' } : null; }
    async function rpc(name, body) {
      var r = await deps.fetch(deps.baseUrl + '/rest/v1/rpc/' + name, { method: 'POST', headers: headers(), body: JSON.stringify(body) });
      var text = '', json = null;
      if (r.ok) { try { json = await r.json(); } catch (e) { json = null; } } else { try { text = await r.text(); } catch (e) { text = ''; } }
      return { ok: r.ok, status: r.status, json: json, text: text };
    }
    function known(goalId, list) { return typeof goalId === 'string' && UUID.test(goalId) && (list || []).indexOf(goalId.toLowerCase()) >= 0; }
    function why(text, fallback) {
      var t = String(text || '');
      if (/Goal limit reached|live goals/i.test(t)) return 'You already have the most live goals allowed (10). Archive or finish one first.';
      if (/typed title/i.test(t)) return 'The title you typed does not match this goal.';
      if (/archive the goal/i.test(t)) return 'Archive this goal first.';
      if (/uploaded pages/i.test(t)) return 'Some uploaded pages of this goal are still saved. Nothing was deleted. Try again.';
      if (/changed while it was being deleted/i.test(t)) return 'This goal changed on another device while it was being deleted. Nothing was deleted.';
      if (/is archived/i.test(t)) return 'This goal is archived. Restore it first.';
      return fallback;
    }

    async function archive(goalId, knownIds) {
      var off = guard(); if (off) return off;
      if (!known(goalId, knownIds)) return { state: 'invalid' };
      if (inFlight) return { state: 'busy' };
      inFlight = true;
      try { var r = await rpc('archive_goal', { p_goal: goalId.toLowerCase() }); return r.ok ? { state: 'ok' } : { state: 'error', error: why(r.text, 'That did not save. Nothing changed.') }; }
      catch (e) { return { state: 'error', error: 'That did not save. Nothing changed.' }; } finally { inFlight = false; }
    }
    async function restore(goalId, knownIds) {
      var off = guard(); if (off) return off;
      if (!known(goalId, knownIds)) return { state: 'invalid' };
      if (inFlight) return { state: 'busy' };
      inFlight = true;
      try { var r = await rpc('unarchive_goal', { p_goal: goalId.toLowerCase() }); return r.ok ? { state: 'ok' } : { state: 'error', error: why(r.text, 'That did not save. Nothing changed.') }; }
      catch (e) { return { state: 'error', error: 'That did not save. Nothing changed.' }; } finally { inFlight = false; }
    }

    // Archived goals, read-only. A failed read is "unavailable", never an empty list.
    async function loadArchived() {
      var off = guard(); if (off) return off;
      var uid = deps.getUserId();
      try {
        var r = await deps.fetch(deps.baseUrl + '/rest/v1/goals?select=id,kind,title,status,origin,archived_at&archived_at=not.is.null&order=archived_at.desc&limit=50', { method: 'GET', headers: headers() });
        if (!r.ok) return { state: 'unavailable' };
        var rows = await r.json();
        if (!Array.isArray(rows)) return { state: 'unavailable' };
        if (deps.getUserId() !== uid) return { state: 'stale' };
        return { state: 'ok', goals: rows.filter(function (g) { return g && typeof g.id === 'string' && UUID.test(g.id); }).map(function (g) { return { id: g.id.toLowerCase(), title: String(g.title || '').slice(0, 120), status: String(g.status || ''), origin: g.origin === 'adopted_workspace' ? 'adopted_workspace' : 'created', archivedAt: String(g.archived_at || '').slice(0, 40) }; }) };
      } catch (e) { return { state: 'unavailable' }; }
    }

    // The dry run: counts of what permanent deletion would remove. Counts only.
    async function deletionPreview(goalId, knownIds) {
      var off = guard(); if (off) return off;
      if (!known(goalId, knownIds)) return { state: 'invalid' };
      try {
        var r = await rpc('goal_deletion_preview', { p_goal: goalId.toLowerCase() });
        var p = r.ok ? validPreview(r.json) : null;
        return p ? { state: 'ok', preview: p } : { state: 'unavailable' };
      } catch (e) { return { state: 'unavailable' }; }
    }

    // Only from the delete screen, after the student typed the goal's title. The database checks again.
    async function deletePermanently(goalId, typedTitle, knownIds) {
      var off = guard(); if (off) return off;
      if (!known(goalId, knownIds)) return { state: 'invalid' };
      if (typeof typedTitle !== 'string' || !typedTitle.trim()) return { state: 'invalid', error: 'Type the goal\'s title to confirm.' };
      if (inFlight) return { state: 'busy' };
      inFlight = true;
      var uid = deps.getUserId();
      try {
        var r = await rpc('delete_goal_permanently', { p_goal: goalId.toLowerCase(), p_typed_title: typedTitle });
        if (!r.ok) return { state: 'error', error: why(r.text, 'That did not complete. Nothing was deleted.') };
        if (deps.getUserId() !== uid) return { state: 'stale' };
        return { state: 'ok', counts: r.json && typeof r.json === 'object' ? r.json : {} };
      } catch (e) { return { state: 'error', error: 'That did not complete. Nothing was deleted.' }; } finally { inFlight = false; }
    }

    // Content-free records of goals deleted on any device, so this device can remove its own copies.
    async function loadTombstones() {
      var off = guard(); if (off) return off;
      var uid = deps.getUserId();
      try {
        var r = await deps.fetch(deps.baseUrl + '/rest/v1/goal_tombstones?select=goal_id&limit=500', { method: 'GET', headers: headers() });
        if (!r.ok) return { state: 'unavailable' };
        var rows = await r.json();
        if (!Array.isArray(rows)) return { state: 'unavailable' };
        if (deps.getUserId() !== uid) return { state: 'stale' };
        return { state: 'ok', goalIds: rows.map(function (x) { return x && typeof x.goal_id === 'string' && UUID.test(x.goal_id) ? x.goal_id.toLowerCase() : null; }).filter(Boolean) };
      } catch (e) { return { state: 'unavailable' }; }
    }

    async function bringIn(fromId, toId, summary, knownIds) {
      var off = guard(); if (off) return off;
      if (!known(fromId, knownIds) || !known(toId, knownIds) || fromId.toLowerCase() === toId.toLowerCase()) return { state: 'invalid' };
      if (typeof summary !== 'string' || !summary.trim() || summary.length > 2000) return { state: 'invalid' };
      if (inFlight) return { state: 'busy' };
      inFlight = true;
      try { var r = await rpc('bring_in_progress', { p_from: fromId.toLowerCase(), p_to: toId.toLowerCase(), p_summary: summary }); return r.ok ? { state: 'ok', shareId: typeof r.json === 'string' && UUID.test(r.json) ? r.json.toLowerCase() : null } : { state: 'error', error: 'That did not save. Nothing was added.' }; }
      catch (e) { return { state: 'error', error: 'That did not save. Nothing was added.' }; } finally { inFlight = false; }
    }

    // Takes back a bring-in: the record is marked revoked. The text already added to the conversation stays there (it is the student's
    // own conversation); deleting that message or conversation removes it.
    async function revokeBringIn(shareId) {
      var off = guard(); if (off) return off;
      if (typeof shareId !== 'string' || !UUID.test(shareId)) return { state: 'invalid' };
      if (inFlight) return { state: 'busy' };
      inFlight = true;
      try { var r = await rpc('revoke_bring_in', { p_share: shareId.toLowerCase() }); return r.ok ? { state: 'ok' } : { state: 'error', error: 'That did not save. Nothing changed.' }; }
      catch (e) { return { state: 'error', error: 'That did not save. Nothing changed.' }; } finally { inFlight = false; }
    }

    // Links a conversation's earlier messages to its registered thread, so deletion can find them.
    async function linkThread(clientThreadId) {
      var off = guard(); if (off) return off;
      if (typeof clientThreadId !== 'string' || clientThreadId.length < 3 || clientThreadId.length > 80) return { state: 'invalid' };
      try { var r = await rpc('link_thread_messages', { p_client_thread_id: clientThreadId }); return r.ok ? { state: 'ok' } : { state: 'error' }; } catch (e) { return { state: 'error' }; }
    }

    return { archive: archive, restore: restore, loadArchived: loadArchived, deletionPreview: deletionPreview, deletePermanently: deletePermanently, loadTombstones: loadTombstones, bringIn: bringIn, revokeBringIn: revokeBringIn, linkThread: linkThread };
  }

  var NOTE = 'display:block;font-size:15px;line-height:1.5;color:var(--text-muted);margin:0 0 8px';
  var BTN = 'min-height:44px;padding:10px 16px;font-size:16px;margin:4px 8px 4px 0;cursor:pointer';
  var FIELD = 'display:block;width:100%;box-sizing:border-box;min-height:44px;font-size:16px;margin:4px 0 12px;padding:8px 10px';

  // goals: archived goals; view: { goalId, preview:{state,preview}|null } for the one whose delete screen is open.
  function archivedHtml(goals, view) {
    var h = '<section class="goal-archive" aria-label="Archived goals"><h2 style="font-size:17px;margin:0 0 6px">Archived goals</h2>' +
      '<p style="' + NOTE + '">Archived goals keep all their history and are not shown on Home or recommended. You can restore one at any time. Permanent deletion is a separate step, below an archived goal.</p>';
    if (!goals.length) return h + '<p style="' + NOTE + '">No archived goals.</p></section>';
    goals.forEach(function (g) {
      h += '<div class="goal-archive-row" style="border-top:1px solid var(--border,#444);padding:10px 0"><div style="font-size:16px"><strong>' + esc(g.title) + '</strong></div>' +
        '<div style="' + NOTE + '">Archived ' + esc(shortDate(g.archivedAt) || 'earlier') + '</div>' +
        '<button type="button" style="' + BTN + '" onclick="margLifeRestore(\'' + esc(g.id) + '\')">Restore</button>' +
        '<button type="button" style="' + BTN + '" onclick="margLifeOpenDelete(\'' + esc(g.id) + '\')">Delete permanently\u2026</button>';
      if (view && view.goalId === g.id) h += deleteScreenHtml(g, view.preview);
      h += '</div>';
    });
    return h + '<div id="goal-archive-msg" role="status" style="' + NOTE + '"></div></section>';
  }

  // One button per live goal. Archiving is reversible: nothing is deleted.
  function manageHtml(goals) {
    var h = '<section class="goal-manage" aria-label="Archive a goal"><h2 style="font-size:17px;margin:0 0 6px">Archive a goal</h2><p style="' + NOTE + '">Archiving hides a goal from Home and recommendations and keeps all of its history. You can restore it later.</p>';
    if (!goals.length) return h + '<p style="' + NOTE + '">You have no live goals to archive.</p></section>';
    goals.forEach(function (g) { h += '<button type="button" style="' + BTN + '" onclick="margLifeArchive(\'' + esc(g.id) + '\')">Archive ' + esc(g.title) + '</button>'; });
    return h + '<div id="goal-life-msg" role="status" style="' + NOTE + '"></div></section>';
  }

  function deleteScreenHtml(goal, previewResult) {
    var h = '<div class="goal-delete" role="group" aria-label="Delete ' + esc(goal.title) + ' permanently" style="border:1px solid var(--border,#444);border-radius:12px;padding:14px;margin:10px 0">' +
      '<div style="font-size:16px"><strong>Delete \u201c' + esc(goal.title) + '\u201d permanently</strong></div>';
    if (!previewResult || previewResult.state !== 'ok') {
      return h + '<p style="' + NOTE + '">' + (previewResult ? 'Could not check what would be deleted right now. Nothing has changed.' : 'Checking what would be deleted\u2026') + '</p></div>';
    }
    var p = previewResult.preview;
    h += '<p style="' + NOTE + '"><strong>This cannot be undone.</strong> It permanently deletes, for this goal only: ' +
      p.diagnoses + ' diagnoses, ' + p.tasks + ' saved checks, ' + p.attempts + ' attempts, ' + p.evidence + ' evidence items, ' + p.threads + ' conversations with ' + p.messages + ' messages, ' + (p.images ? p.images + ' uploaded question page' + (p.images === 1 ? '' : 's') + ' (and the text read from them), ' : '') + p.shares + ' progress summaries brought in or out, and ' + p.consents + ' sharing choices.</p>' +
      '<p style="' + NOTE + '">Your other goals and General Chat are not touched, except that anything you brought into another goal from this one is removed from it. Copies kept on your devices are removed here now and on your other devices the next time you sign in there.</p>' +
      '<p style="' + NOTE + '">Not removed by this step: your account profile; reminders and shared question links made from this goal; scorecard or page uploads that are not attached to one of its conversations; check-ins; feedback you sent; text already sent to the AI provider, and copies you allowed for model improvement; and backups until they expire. Marg keeps a content-free record (the goal\'s id, the date and these counts) so your other devices can clean up.</p>' +
      '<label style="' + NOTE + '">Type the goal\'s title to confirm<input id="goal-delete-typed" autocomplete="off" style="' + FIELD + '" oninput="margLifeDeleteTyped(this.value, \'' + esc(goal.id) + '\')"></label>' +
      '<button type="button" id="goal-delete-confirm" disabled style="' + BTN + '" onclick="margLifeConfirmDelete(\'' + esc(goal.id) + '\')">Delete permanently</button>' +
      '<button type="button" style="' + BTN + '" onclick="margLifeCloseDelete()">Cancel</button><div id="goal-delete-msg" role="status" style="' + NOTE + '"></div></div>';
    return h;
  }

  // Bring in: from one other goal into the goal that is open. The text is shown first and nothing is added until the student confirms.
  function bringInHtml(target, sources, draft) {
    var h = '<section class="goal-bring-in" aria-label="Bring in progress"><h2 style="font-size:17px;margin:0 0 6px">Bring in progress from another goal</h2>' +
      '<p style="' + NOTE + '">Goals keep their own memory. If you want, you can bring a short summary of another goal into this conversation (' + esc(target.title) + ') once. You will see the exact text first. It is added as a visible message and recorded.</p>';
    if (!sources.length) return h + '<p style="' + NOTE + '">You have no other active goal to bring progress from.</p></section>';
    sources.forEach(function (s) { h += '<button type="button" style="' + BTN + '" onclick="margLifeBringInPreview(\'' + esc(s.id) + '\')">Preview progress from ' + esc(s.title) + '</button>'; });
    if (draft) {
      h += '<div class="goal-bring-in-draft" style="border:1px solid var(--border,#444);border-radius:12px;padding:14px;margin:10px 0"><div style="' + NOTE + '">This is exactly what will be added to this conversation:</div>' +
        '<div style="white-space:pre-wrap;overflow-wrap:anywhere;font-size:15px;line-height:1.5;margin:0 0 10px">' + esc(draft.text) + '</div>' +
        '<button type="button" style="' + BTN + '" onclick="margLifeBringInConfirm()">Add to this conversation</button>' +
        '<button type="button" style="' + BTN + '" onclick="margLifeBringInCancel()">Cancel</button></div>';
    }
    return h + '<div id="goal-bring-in-msg" role="status" style="' + NOTE + '"></div></section>';
  }

  var api = { manageHtml: manageHtml, buildBringInSummary: buildBringInSummary, createClient: createClient, archivedHtml: archivedHtml, deleteScreenHtml: deleteScreenHtml, bringInHtml: bringInHtml, validPreview: validPreview };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.MargGoalsLife = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
