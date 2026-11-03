import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Source-level checks for the inline question cards and their entry points.
// The behaviour is tested in the harness suite runInlineQuestionCardTests;
// these checks cover files the harness cannot load (index.html, slash-tools.js).
const ROOT = dirname(fileURLToPath(import.meta.url));
const read = (name) => readFileSync(join(ROOT, name), 'utf8');
const app = read('marg-app.js');
const html = read('index.html');
const slash = read('slash-tools.js');

let failed = 0;
let checks = 0;
function check(name, passed) {
  checks += 1;
  if (!passed) failed += 1;
  process.stdout.write((passed ? 'PASS ' : 'FAIL ') + name + '\n');
}

const cssStart = app.indexOf("style.id = 'qcard-styles';");
const css = app.slice(cssStart, app.indexOf('document.head.appendChild(style);', cssStart));
const sizes = [...css.matchAll(/font-size:(\d+(?:\.\d+)?)px/g)].map((match) => Number(match[1]));
const chipCss = html.slice(html.indexOf('#composer-chips{'), html.indexOf('</style>', html.indexOf('#composer-chips{')));

check('C1 the card is switched on as shipped', /var BETA_INLINE_CARDS = true;/.test(app));
check('C2 every font size in the card styles is 15px or larger', sizes.length >= 8 && sizes.every((size) => size >= 15), JSON.stringify(sizes));
check('C3 the chip text is 15px or larger and the chip is a tappable size', /font-size:15px/.test(chipCss) && /min-height:4\d px|min-height:40px/.test(chipCss.replace(/\s/g, '')));
check('C4 the card cannot be wider than the screen: it is capped at 100%, wraps long words and has no fixed pixel width except the 24px letter badge', /\.qcard\{[^}]*max-width:560px/.test(css) && /@media\(max-width:600px\)\{\.qcard\{max-width:100%/.test(css) && /overflow-wrap:anywhere/.test(css) && [...css.matchAll(/[^-]width:(\d+)px/g)].every((match) => Number(match[1]) <= 24));
check('C5 options are buttons with a tap height of at least 44px and the check button too', /\.qcard-opt\{[^}]*min-height:48px/.test(css) && /\.qcard-check,\.qcard-action\{[^}]*min-height:44px/.test(css));
check('C6 the "Give me a question" chip sits beside the composer and opens the card chooser', /id="composer-chips"/.test(html) && /id="question-chip"[^>]*onclick="openQuestionChip\(\)"/.test(html) && html.indexOf('id="composer-chips"') > html.indexOf('id="input-row"') && html.indexOf('id="composer-chips"') < html.indexOf('id="composer-status"'));
check('C7 the question tool is registered as a slash command and in the tool opener', /id:'question', command:'\/question'/.test(slash) && /id === 'question'\) showQuestionCardConfigurator/.test(slash) && /requestQuestionCard\(\{ topic:topic\.select\.value \}\)/.test(slash));
check('C8 the older Practice screen and its entry points are all still present', ['id="practice-tab"', 'id="ptab-rc"', 'id="ptab-qa"'].every((needle) => html.includes(needle)) && ['function loadDailyPractice(', 'function renderPractice(', 'function selectAnswer(', 'function showPracticeSummary('].every((needle) => app.includes('async ' + needle) || app.includes('\n' + needle)) && /get\('tab'\) === 'practice'/.test(app));
check('C9 the /practice command and its timed-test forms are untouched', /id:'practice', command:'\/practice'/.test(slash) && /window\.startTimedTest\('qa'/.test(slash) && /window\.startTimedTest\('dilr'/.test(slash));
check('C10 the switch decides the surface: off opens the older practice tool', /openMargTool\(BETA_INLINE_CARDS \? 'question' : 'practice'\)/.test(app));
check('C11 the card has no way to start itself: it is built from a stored question, not from a model reply', !/buildGeminiRequest|fetchWithTimeout/.test(app.slice(app.indexOf('async function pickQuestionForCard'), app.indexOf('function buildQuestionCardExercise'))));

process.stdout.write((failed ? 'FAIL ' : 'PASS ') + (checks - failed) + '/' + checks + ' inline card source checks passed\n');
process.exit(failed ? 1 : 0);
