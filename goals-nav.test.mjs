import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Source-level checks for goals-first navigation. Behaviour is tested in the harness
// suite runGoalsNavTests; these checks cover markup the harness cannot load.
const ROOT = dirname(fileURLToPath(import.meta.url));
const read = (name) => readFileSync(join(ROOT, name), 'utf8');
const app = read('marg-app.js');
const html = read('index.html');

let failed = 0;
let checks = 0;
function check(name, passed) {
  checks += 1;
  if (!passed) failed += 1;
  process.stdout.write((passed ? 'PASS ' : 'FAIL ') + name + '\n');
}

const sidebar = html.slice(html.indexOf('<div class="desktop-nav-items">'), html.indexOf('</nav>', html.indexOf('<div class="desktop-nav-items">')));
const menu = html.slice(html.indexOf('<div class="app-menu-items">'), html.indexOf('</aside>', html.indexOf('<div class="app-menu-items">')));
const order = (text, needles) => needles.map((needle) => text.indexOf(needle)).every((at, i, all) => at !== -1 && (i === 0 || at > all[i - 1]));
const css = app.slice(app.indexOf("style.id = 'goals-tab-styles';"), app.indexOf('document.head.appendChild(style);', app.indexOf("style.id = 'goals-tab-styles';")));
const sizes = [...css.matchAll(/font-size:(\d+(?:\.\d+)?)px/g)].map((match) => Number(match[1]));

check('P1 the sidebar lists Home, Ask MARG, My Goals, Journey, Profile & Help in that order', order(sidebar, ["switchTab('home')", "switchTab('chat')", "switchTab('goals')", "switchTab('journey')", 'Profile &amp; Help']));
check('P2 the sidebar has no Practice, Progress, Mock or Sectionals entry', !/dnav-(practice|progress|mock|sectionals)|switchTab\('(practice|progress|mock|sectionals)'\)/.test(sidebar));
check('P3 the phone menu lists My Goals and Journey after Ask MARG and has no Practice or Progress entry', order(menu, ["appMenuSwitchTab('chat')", "appMenuSwitchTab('goals')", "appMenuSwitchTab('journey')"]) && !/appMenuSwitchTab\('(practice|progress|mock|sectionals)'\)/.test(menu));
check('P4 no exam-specific entry is left in the shared menu or sidebar', !/VARC|DILR|\bQA\b|\bCAT\b/.test(sidebar) && !/VARC|DILR|\bQA\b|\bCAT\b/.test(menu));
check('P5 the My Goals screen exists with a content host', /<section id="goals-tab" class="tab-section destination-shell"/.test(html) && /id="goals-content"/.test(html));
check('P6 the Practice, Mock, Sectionals and Progress screens are still in the page', ['id="practice-tab"', 'id="mock-tab"', 'id="sectionals-tab"', 'id="progress-tab"'].every((needle) => html.includes(needle)));
check('P7 goals navigation is switched on as shipped', /var BETA_GOALS_NAV = true;/.test(app));
check('P8 the address-bar entry points both go through the redirect', (app.match(/resolveLegacyTab\(/g) || []).length >= 4 && /requestedInitialTab = resolveLegacyTab\(requestedInitialTab\)/.test(app) && /resolveLegacyTab\('practice'\)/.test(app));
check('P9 switchTab accepts goals and journey, and journey shows the Progress section', /'progress','goals','journey'\]\.indexOf\(tab\)/.test(app) && /if \(tab === 'journey'\) tab = 'progress';/.test(app) && /tab === 'goals'\) \{\s*document\.getElementById\('goals-tab'\)/.test(app));
check('P10 the goals styles use 15px or larger text and buttons at least 44px tall', sizes.length >= 5 && sizes.every((size) => size >= 15) && /min-height:48px/.test(css));
check('P12 the sidebar highlight maps Practice, Mock, Sectionals and Goals to My Goals, and Progress to Journey', /\['practice', 'mock', 'sectionals', 'goals'\]\.indexOf\(tab\) !== -1\) navTab = 'goals';/.test(app) && /else if \(tab === 'progress'\) navTab = 'journey';/.test(app));
const cssAll = html.slice(html.indexOf('<style>:root'));
const menuRule = (name) => (cssAll.match(new RegExp('\\.' + name + '\\{[^}]*\\}')) || [''])[0];
const menuSizes = [menuRule('app-menu-item'), menuRule('app-menu-user-name'), menuRule('app-menu-user-note'), menuRule('app-menu-title')].map((rule) => Number((rule.match(/(?:font-size:|font:)(\d+)px/) || [])[1]));
check('P13 the phone menu items, account name and note are 15px or larger', menuSizes.length === 4 && menuSizes.every((size) => size >= 15), JSON.stringify(menuSizes));
check('P14 a goal workspace is shown only when its adapter finds existing records', /filter\(function\(key\) \{[\s\S]{0,200}adapter\.hasHistory\(\)/.test(app) && !/Object\.keys\(goalWorkspaceAdapters\)\.map/.test(app));
check('P11 the older Practice and Progress functions are still defined', ['function loadDailyPractice(', 'async function loadProgressDashboard(', 'function renderMentorHome('].every((needle) => app.includes(needle)));

process.stdout.write((failed ? 'FAIL ' : 'PASS ') + (checks - failed) + '/' + checks + ' goals navigation source checks passed\n');
process.exit(failed ? 1 : 0);
