// P4.3 source-level contract checks for rule I2: memory keys are only reached through the scoped accessor.
// (The behavioural checks for I1 to I10 run inside the harness as runGoalsContractTests.)
// Run: node goals-contract.test.mjs
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const G = require('./marg-goals.js');

let pass = 0, fail = 0;
function check(name, ok, detail) { if (ok) { pass++; console.log('PASS', name); } else { fail++; console.log('FAIL', name, detail || ''); } }

// Every place a literal memory key name appears outside getUserScopedKey(...), with the reason it is allowed.
const ALLOWED = [
  [/^marg-app\.js$/, /if \(name === 'marg_active_exercise' \|\| name === 'marg_study_context'\) return;/, 'adoption copy skips per-conversation keys'],
  [/^marg-app\.js$/, /\['marg_practice_memory', 'marg_active_exercise', 'marg_exercise_archive', 'marg_study_context'\]\.forEach\(function\(name\)/, 'loop that calls getUserScopedKey(name)'],
  [/^marg-app\.js$/, /'marg_goal_save_queue_' \+ uid/, 'the retry queue key is built for the goal a save belongs to, not the open one'],
  [/^marg-app\.js$/, /var accountKey = 'marg_vision_v1_'|var guestKey = 'marg_vision_v1_guest'/, 'one-off guest to account vision hand-over (General)'],
  [/^marg-app\.js$/, /\['marg_progressive_profile_guest', 'marg_personal_goal_guest'/, 'guest-session cleanup (no account, no goal)'],
  [/^study-context\.js$/, /var (STORAGE_KEY|MEMORY_KEY) = /, 'names handed to the configured scope function (getUserScopedKey)'],
  [/^marg-vision\.js$/, /var GUEST_KEY = /, 'guest key; the account key comes from the configured scope function'],
  [/^chat-topics\.js$/, /'marg_active_exercise_'\+userId|var archiveKey='marg_exercise_archive_'\+userId/, 'thread deletion cleanup (General keys); goal conversations: see P4.6'],
  // test fixtures and test assertions
  [/^marg-app\.js$/, /acct-|account-[ab]|_guest'|check\(|results\.push|put\(keyIn|var keys = \[|logoutKeys|seeded|others = \[|\bput\('marg_|\bhas\('marg_|var kA = \[|localStorage\.removeItem\('marg_learning_record_|margGoalScopes\[TG\] = A; put\(|\['marg_learning_record_goals-life-user'/, 'tests'],
];

export function scan(files, readSource) {
  const unexpected = [];
  for (const f of files) {
    readSource(f).split('\n').forEach((line, i) => {
      for (const k of G.MEMORY_KEYS) {
        const at = line.indexOf("'" + k);
        if (at < 0) continue;
        const before = line.slice(Math.max(0, at - 30), at);
        if (/getUserScopedKey\(\s*$/.test(before)) continue;
        if (/margGoalKeySuffix/.test(line)) continue;
        if (ALLOWED.some(([fileRe, lineRe]) => fileRe.test(f) && lineRe.test(line))) continue;
        unexpected.push(f + ':' + (i + 1) + ': ' + line.trim().slice(0, 120));
        break;
      }
    });
  }
  return unexpected;
}

const files = ['marg-app.js', 'study-context.js', 'marg-vision.js', 'chat-topics.js', 'question-library.js', 'slash-tools.js', 'marg-training.js'];
const unexpected = scan(files, (f) => fs.readFileSync(f, 'utf8'));
check('I2 no memory key is read or written outside the scoped accessor (except the listed, reasoned cases)', unexpected.length === 0, '\n  ' + unexpected.join('\n  '));
check('I2 the scanner catches a new direct read (self-check)', scan(['marg-app.js'], () => "x = localStorage.getItem('marg_learning_record_' + uid);").length === 1);
check('I2 the scanner accepts the accessor (self-check)', scan(['marg-app.js'], () => "x = localStorage.getItem(getUserScopedKey('marg_learning_record'));").length === 0);

const app = fs.readFileSync('marg-app.js', 'utf8');
const keyFns = ['function getUserScopedKey(name)', 'function getDiagnosticStorageKey()', 'function topicProgressionStorageKey()'];
check('I2 all three key builders add the goal suffix', keyFns.every((sig) => { const i = app.indexOf(sig); return i > 0 && app.slice(i, i + 420).includes('margGoalKeySuffix('); }));

// I5: the only places that assign a conversation's goal are creating it, loading it from the server, and the account reset.
const testStart = app.indexOf('async function runGoalsContractTests'), testEnd = app.indexOf('async function runContextRoutingTests');
const appNoTests = app.slice(0, testStart) + app.slice(testEnd);
const assigns = [...appNoTests.matchAll(/margGoalScopes(\[[^\]]+\])?\s*=[^=]/g)].map((m) => appNoTests.slice(m.index, m.index + 60).replace(/\s+/g, ' '));
const okAssign = [/^margGoalScopes\[threadId\] = other;/, /^margGoalScopes\[id\] = latestLocal\[id\]/, /^margGoalScopes = \{\}; margGoalCache/, /^margGoalScopes\[id\] = local\[id\]/, /^margGoalScopes\[id\] = res\.map\[id\]/, /^margGoalScopes\[id\] = goalId;/, /^margGoalScopes = \{\}; \/\/ conversation id/];
const bad = assigns.filter((a) => !okAssign.some((re) => re.test(a)));
check('I5 conversation goals are assigned only on creation, load, reset and declaration', assigns.length === 7 && bad.length === 0, JSON.stringify(assigns));

// I7: the only code that copies memory between scopes is the explicit adoption copy (General into the new goal).
const copies = (app.match(/localStorage\.setItem\(to, raw\)/g) || []).length;
check('I7 memory is copied between scopes in exactly one place: the adoption copy, General into a new goal', copies === 1 && /function margCopyMemoryToGoal/.test(app));

// I10: no client code sets goal_id on mentor rows; rows move only through the adoption function.
const writeSrc = fs.readFileSync('marg-goals-write.js', 'utf8');
check('I10 the client never writes goal_id on mentor tables', !/goal_id\s*:/.test(app.slice(app.indexOf('async function persistMentorDiagnosis'), app.indexOf('async function reconcileInterruptedMentorTasks')).replace('goal_id:exercise.goalId || null,', '')) && !/p_goal_id|goal_id\s*:\s*[^g]/.test(writeSrc.replace(/goal_id: goalId\.toLowerCase\(\)/, '')));

check('I10 the only place the app stamps a goal on a mentor row is the scoped-write boundary', (app.match(/row\.goal_id = goalId;/g) || []).length === 1 && /function margClassifyGoalRows/.test(app));
check('I10 the old "pause saves in a goal" guard is gone (saves are scoped, not skipped)', !/margBlocksGoalWrite/.test(app));

// P4.7: both chat lists (dropdown and sidebar) are drawn from the filtered list, so an archived goal's conversations are hidden everywhere
const topics = fs.readFileSync('chat-topics.js', 'utf8');
const toolbar = topics.slice(topics.indexOf('function renderTopicChatToolbar()'), topics.indexOf('function applyTopicChatState'));
check('P4.7 the dropdown and the sidebar lists both use the filtered list (none reads margChatThreads directly)', /margThreadIsArchived/.test(toolbar) && !/margChatThreads\.(map|slice)/.test(toolbar) && (toolbar.match(/shownThreads\./g) || []).length === 2);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
