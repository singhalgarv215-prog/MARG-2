import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import vm from 'node:vm';

// Pre-beta CAT content checks: the answer-key manifest agrees with the bank that
// students can reach, and the Daily QA draft validator rejects self-contradicting
// drafts. These checks do not prove any key is right; the manifest says how each
// key was checked and by whom.
const ROOT = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const read = (name) => readFileSync(join(ROOT, name), 'utf8');
const manifest = JSON.parse(read('data/cat-pyq/answer-key-manifest.json'));
const verification = JSON.parse(read('data/cat-pyq/verification-status.json'));
const MargCATBank = require('./cat-bank-verification.js');

let failed = 0;
let checks = 0;
function check(name, passed, detail) {
  checks += 1;
  if (!passed) failed += 1;
  process.stdout.write((passed ? 'PASS ' : 'FAIL ') + name + (passed || !detail ? '' : ' :: ' + detail) + '\n');
}

const STATUSES = ['Author re-solved', 'Generator verified', 'Unverified', 'Conflicting answers', 'Quarantined'];
const entries = manifest.entries;
const byId = new Map();
entries.forEach((entry) => { byId.set(entry.id, entry); });
const canon = (value) => String(value || '').replace(/[−–—]/g, '-').replace(/[\u{1D400}-\u{1D7FF}]/gu, (ch) => {
  const cp = ch.codePointAt(0);
  if (cp >= 0x1D44E && cp <= 0x1D467) return String.fromCharCode(97 + cp - 0x1D44E);
  if (cp >= 0x1D434 && cp <= 0x1D44D) return String.fromCharCode(65 + cp - 0x1D434);
  return ch;
}).toLowerCase().replace(/\s+/g, '').replace(/[₹%]/g, '');

// Items that stay in the bank file with their content and key but are not served. If one is resolved
// and returned to exposure, this list and the withheld table in cat-bank-verification.js change together.
const WITHHELD = ['cat-2024-s1-varc-q11'];

check('M1 every entry uses one of the five statuses', entries.every((entry) => STATUSES.includes(entry.status)), entries.filter((entry) => !STATUSES.includes(entry.status)).map((entry) => entry.id).join(','));
check('M2 entry ids are unique', byId.size === entries.length);
const pyqIds = Object.keys(verification.statusById);
check('M3 every indexed PYQ question has exactly one entry', pyqIds.length === verification.examined && pyqIds.every((id) => byId.has(id)), pyqIds.filter((id) => !byId.has(id)).slice(0, 5).join(','));
check('M4 the manifest counts match its entries', manifest.counts.entries === entries.length && Object.keys(manifest.counts.by_status).every((status) => entries.filter((entry) => entry.status === status).length === manifest.counts.by_status[status]));
check('M5 every entry says how its key was checked, or why it is not', entries.every((entry) => typeof entry.verification_source === 'string' && entry.verification_source.length > 0 && typeof entry.uncertainty === 'string' && entry.uncertainty.length > 0));
check('M6 no entry claims verification by another person or against an official source', !entries.some((entry) => entry.verification_basis === 'authoritative_source' || entry.verification_basis === 'human_reviewed') && !entries.some((entry) => /^cat-\d{4}-/.test(entry.id) && entry.status === 'Generator verified'));
check('M7 no conflicting answers are recorded, and none is hidden as verified', !entries.some((entry) => entry.status === 'Conflicting answers') && entries.every((entry) => entry.status !== 'Author re-solved' || !/disagree|conflict/i.test(entry.uncertainty)));

// Served bank vs manifest.
const served = MargCATBank.servedIds();
check('S1 every item students can reach has a manifest entry marked served', served.every((id) => byId.has(id) && byId.get(id).served_today === true), served.filter((id) => !byId.has(id) || byId.get(id).served_today !== true).join(','));
check('S2 everything the bank serves is marked Author re-solved in the manifest', served.every((id) => byId.get(id).status === 'Author re-solved'), served.filter((id) => byId.get(id).status !== 'Author re-solved').join(','));
check('S3 withheld items are not served, are marked unverified and withheld, and keep their content in the bank file', WITHHELD.every((id) => !served.includes(id) && byId.get(id).status === 'Unverified' && byId.get(id).beta_exposure === 'withheld' && byId.get(id).served_today === false && MargCATBank.items().some((item) => item.id === id)));
check('S4 no entry marked served is quarantined', !entries.some((entry) => entry.served_today && entry.status === 'Quarantined'));
check('S5 the manifest marks exactly the served PYQ items as served', entries.filter((entry) => /^cat-\d{4}-/.test(entry.id) && entry.served_today).length === served.length && entries.filter((entry) => /^cat-\d{4}-/.test(entry.id) && entry.served_today).every((entry) => served.includes(entry.id)));
const items = MargCATBank.items();
check('S6 each served key in the manifest equals the served bank key', items.every((item) => byId.get(item.id).current_key.letter === 'ABCD'[item.correct]), items.filter((item) => byId.get(item.id).current_key.letter !== 'ABCD'[item.correct]).map((item) => item.id).join(','));
check('S7 each reviewer answer matches the keyed option of the served QA item', items.filter((item) => item.section === 'qa').every((item) => {
  const entry = byId.get(item.id);
  const keyed = item.options[item.correct].replace(/^[A-D]\.\s*/, '');
  return entry.reviewer_answer !== undefined && (canon(entry.reviewer_answer) === canon(keyed) || (item.id === 'cat-2022-s3-qa-q19' && /≤/.test(keyed)));
}));
const papers = {};
readdirSync(join(ROOT, 'data/cat-pyq/papers')).forEach((file) => JSON.parse(read('data/cat-pyq/papers/' + file)).questions.forEach((question) => { papers[question.id] = question; }));
check('S8 each served key equals the key in the source paper file where the paper file has one', items.every((item) => papers[item.id] && (papers[item.id].correct_index === null || papers[item.id].correct_index === item.correct)));
check('S9 the indexed DILR and the 2017 papers stay out of the served bank', served.every((id) => !/-dilr-/.test(id) && id.indexOf('2017') === -1));

// Packs and generators that are shown by default must be listed, and model-generated drafts must not be.
const generated = entries.filter((entry) => /^generated:/.test(entry.id));
check('G1 model-generated practice is recorded as unverified and disabled, not served', generated.every((entry) => entry.served_today === false) && generated.filter((entry) => /daily-qa|daily-rc|chat-rc/.test(entry.id)).every((entry) => entry.status === 'Unverified' && entry.beta_exposure === 'disabled'), JSON.stringify(generated.map((entry) => [entry.id, entry.status, entry.beta_exposure])));
check('G2 hand-checked packs record the reviewer answer or the method used', entries.filter((entry) => /^pack:/.test(entry.id)).every((entry) => /Reviewer/.test(entry.verification_source)));
check('G3 the QA and DILR generators are recorded as computed, not external', entries.filter((entry) => /^engine:/.test(entry.id)).every((entry) => entry.status === 'Generator verified' && entry.verification_basis === 'deterministic_generator' && /not external|Not external/i.test(entry.uncertainty)));
check('G4 the checked bank still builds its "solvers" from typed constants (this finding is why PYQ items rely on the reviewer re-solve, not on the solver)', (read('cat-bank-verification.js').match(/^solvers\[[^\]]+\] = \(\) => '[^']*';/gm) || []).length >= 70);

// Beta restrictions: withheld, unserved and terminology.
const withheldItem = MargCATBank.items().find((item) => item.id === 'cat-2024-s1-varc-q11');
const everyPack = [];
for (let count = 1; count <= 6; count += 1) { MargCATBank.verbalPacks(count).forEach((pack) => everyPack.push(pack)); }
check('B1 the disputed VARC item is in no verbal pack of any size', everyPack.length > 0 && everyPack.every((pack) => pack.sets.every((setObj) => setObj.questions.every((question) => question.sourceId !== 'cat-2024-s1-varc-q11'))));
check('B2 a pack built by hand around the disputed item is not accepted as checked', (() => {
  const pack = { sets: [{ passage: withheldItem.passage, questions: [{ sourceId: withheldItem.id, q: withheldItem.question, options: withheldItem.options.slice(), correct: withheldItem.correct }] }] };
  return MargCATBank.isCheckedVerbalPack(pack, 1) === false;
})());
check('B3 the disputed item keeps its content and its key B in the bank file and the manifest', withheldItem && withheldItem.correct === 1 && byId.get(withheldItem.id).current_key.letter === 'B' && Array.isArray(byId.get(withheldItem.id).answer_key_history) && byId.get(withheldItem.id).answer_key_history.some((row) => row.key === 'C'));
check('B4 the manifest records that the B versus C disagreement is unresolved', /unresolved/i.test(byId.get(withheldItem.id).withheld.reason) && /Open/.test(byId.get(withheldItem.id).withheld.resolution) && MargCATBank.withheld()[withheldItem.id]);
check('B5 classify refuses the disputed item', MargCATBank.classify({ id: 'cat-2024-s1-varc-q11', section: 'varc', stem: 'x', options: ['a', 'b', 'c', 'd'], correct_index: 1 }) === 'withheld_unresolved');
const unservedQA = entries.filter((entry) => /^cat-\d{4}-/.test(entry.id) && entry.section === 'qa' && entry.status === 'Unverified' && !entry.served_today);
check('B6 the unserved extracted-key QA items are all marked withheld_until_checked, with their data kept', unservedQA.length === 92 && unservedQA.every((entry) => entry.beta_exposure === 'withheld_until_checked' && entry.current_key) && unservedQA.every((entry) => papers[entry.id] && papers[entry.id].options && papers[entry.id].options.length));
const qaPackIds = new Set();
for (let count = 1; count <= 6; count += 1) { MargCATBank.qaPacks(count, '').forEach((pack) => pack.questions.forEach((question) => qaPackIds.add(question.sourceId))); }
['Percentages', 'Number Systems', 'Geometry', 'Algebra', 'Profit & Loss', 'Averages', 'Time and Work'].forEach((topic) => { for (let count = 1; count <= 6; count += 1) MargCATBank.qaPacks(count, topic).forEach((pack) => pack.questions.forEach((question) => qaPackIds.add(question.sourceId))); });
check('B7 no QA pack of any size or topic contains an unserved item', qaPackIds.size > 0 && unservedQA.every((entry) => !qaPackIds.has(entry.id) && !served.includes(entry.id)));
check('B8 the verified QA packs stay available', [3].every((count) => MargCATBank.qaPacks(count, '').length > 0 && MargCATBank.isCheckedQAPack(MargCATBank.qaPacks(count, '')[0])) && served.length === 86);
check('B9 the verified paragraph-summary packs stay available without the disputed item', MargCATBank.verbalPacks(3).length > 0 && MargCATBank.isCheckedVerbalPack(MargCATBank.verbalPacks(3)[0], 3));
const bases = manifest.counts.by_basis;
check('B10 no entry has a human-review or authoritative-source basis, and the legend says so', !bases.human_reviewed && !bases.authoritative_source && /NO entry/.test(manifest.verification_basis_legend.human_reviewed) && /NO entry/.test(manifest.verification_basis_legend.authoritative_source));
check('B11 each status maps to one honest basis', entries.every((entry) => ({ 'Author re-solved': 'author_re_solve', 'Generator verified': 'deterministic_generator', 'Quarantined': 'quarantined' }[entry.status] || 'unverified') === entry.verification_basis));
check('B12 the legend does not call author re-solves independent review or official verification', !JSON.stringify(manifest).includes('Independently verified') && /NOT review by another qualified person/.test(manifest.legend['Author re-solved']) && /independent human review/.test(manifest.reviewer_caveat) && /official/.test(manifest.reviewer_caveat) && !JSON.stringify(manifest).includes('Source verified'));
check('B13 the bank file header no longer says answers are recomputed', !/answer recomputed from the question/.test(read('cat-bank-verification.js')));
check('B14 the manifest records every beta switch', ['daily_qa', 'daily_rc', 'chat_rc', 'disputed_varc', 'unserved_qa'].every((key) => typeof manifest.beta_restrictions[key] === 'string'));

// Graded-practice restrictions: shipped switches, Daily DILR, and the DILR packs.
const appSource = read('marg-app.js');
check('H1 both beta switches ship on', /var BETA_VERIFIED_GRADED_ONLY = true;/.test(appSource) && /var BETA_VERIFIED_RC_ONLY = true;/.test(appSource));
['daily-dilr.html', 'daily-dilr/index.html'].forEach((file) => {
  const html = read(file);
  const start = html.indexOf('async function generateDILR()');
  const body = html.slice(start, html.indexOf('function renderDILR', start));
  const redirect = body.indexOf("window.location.replace('/?q='");
  check('H2 ' + file + ' redirects to the main app before any request or stored read', redirect > 0 && redirect < body.indexOf('return;') && body.indexOf('return;') < body.indexOf('fetch(') && body.indexOf('return;') < body.indexOf('localStorage'));
  const calls = html.split('\n').filter((line) => /renderDILR\(/.test(line) && !/function renderDILR/.test(line));
  check('H3 ' + file + ' renders a set only from code that sits after the redirect', calls.length > 0 && calls.every((line) => html.indexOf(line) > html.indexOf("window.location.replace('/?q='")) && /^\s*generateDILR\(\);\s*$/m.test(html));
});
const dilrKeys = { 'pack:dilr-schedule': 'ADDC', 'pack:dilr-distribution': 'ABAA', 'pack:dilr-games': 'ABCB', 'pack:dilr-tables': 'BBCA' };
check('H4 the manifest keys for every hand-checked DILR set match the re-derived keys', Object.keys(dilrKeys).every((prefix) => [1, 2, 3, 4].map((n) => byId.get(prefix + ':q' + n).current_key.letter).join('') === dilrKeys[prefix]));
check('H5 the model-written graded paths are recorded as disabled', ['chat-questions', 'guided-verbal-check', 'study-material-questions', 'hypothesis-experiment', 'guided-qa-model-draft'].every((id) => byId.get('generated:' + id) && byId.get('generated:' + id).beta_exposure === 'disabled' && byId.get('generated:' + id).served_today === false));
check('H6 the strategy lab is recorded as an unmarked judgement check, not a verified key', byId.get('strategy:decision-lab').status === 'Unverified' && /ungraded/.test(byId.get('strategy:decision-lab').recommended_exposure));
check('H7 the harness runner turns the restriction off only for the older suites, and says so', /BETA_VERIFIED_GRADED_ONLY = false;/.test(read('scripts/run-marg-tests.cjs')) && /runBetaGradedRestrictionTests/.test(read('scripts/run-marg-tests.cjs')));

// Daily QA draft validator (extracted from the page).
const page = read('daily-qa.html');
const context = {};
vm.createContext(context);
vm.runInContext(page.slice(page.indexOf('var VERIFIED_QA_FALLBACK'), page.indexOf('function showDailyPanel')), context);
vm.runInContext('var __clean = hasCleanQASolutions;', context);
const question = (solution, options, correct) => ({ q: 'What is the value of the expression that is described here?', topics: ['Arithmetic'], options: options || ['A. 24', 'B. 36', 'C. 42', 'D. 48'], correct: correct === undefined ? 0 : correct, solution });
const draft = (first, second) => ({ questions: [first, second || question('We add the parts and then double the result to reach 24 in total.')] });
const solutionOk = 'Add the two parts, then double the total of the parts to reach 24 in total.';
check('D1 the hand-checked fallback pack passes its own validator', context.__clean(context.VERIFIED_QA_FALLBACK) === true);
check('D2 a consistent draft is accepted', context.__clean(draft(question(solutionOk))) === true);
check('D3 a solution containing a false sum is rejected', context.__clean(draft(question('First 12 + 15 = 28, then we double it and reach 24 as the answer in the end.'))) === false);
check('D4 a false product with precedence is rejected', context.__clean(draft(question('First 2 + 3 × 4 = 20 so the value is 24 as the answer in the end of this.'))) === false);
check('D5 a solution that ends on a different option than the key is rejected', context.__clean(draft(question('We compute carefully and the final value that results from this working is 36.'))) === false);
check('D6 true arithmetic, units, algebra and rounding are not rejected', ['First 12 + 15 = 27 so we double it to reach 24 as the answer.', 'Then 8 × 9 = 72 km are covered so the answer reached is 24 here.', 'Solve 2x + 3 = 11 so x = 4 and then the value is 24 here.', 'About 7 / 3 = 2.33 so the answer we reach in the end is 24.'].every((text) => context.__clean(draft(question(text))) === true));
check('D7 the validator rejects but never rewrites a draft', (() => { const before = JSON.stringify(draft(question(solutionOk))); const d = JSON.parse(before); context.__clean(d); return JSON.stringify(d) === before; })());

process.stdout.write((failed ? 'FAIL ' : 'PASS ') + (checks - failed) + '/' + checks + ' CAT correctness checks passed\n');
process.exit(failed ? 1 : 0);
