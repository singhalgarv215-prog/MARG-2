import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Source-level checks for the Journey log. Behaviour is tested in the harness suite
// runJourneyLogTests; these checks cover files the harness cannot load.
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

const cssStart = app.indexOf("style.id = 'journey-log-styles';");
const css = app.slice(cssStart, app.indexOf('document.head.appendChild(style);', cssStart));
const sizes = [...css.matchAll(/font-size:(\d+(?:\.\d+)?)px/g)].map((match) => Number(match[1]));
const progressTab = html.slice(html.indexOf('id="progress-tab"'), html.indexOf('id="cognitive-card"'));

check('N1 the journey view is switched on as shipped', /var BETA_JOURNEY_LOG = true;/.test(app));
check('N2 the Progress screen has a journey host above the older cards', progressTab.indexOf('id="journey-log"') !== -1 && progressTab.indexOf('id="journey-log"') < progressTab.indexOf('id="progress-stats"'));
check('N3 the older stat cards, mock chart and journey card are all still in the markup', ['id="progress-stats"', 'id="stat-sessions"', 'id="mock-chart-card"', 'id="chart-bars"', 'id="marg-journey-card"', 'id="marg-journey-steps"'].every((needle) => progressTab.includes(needle)));
check('N4 with the view on, the older stat cards, mock chart, journey card and its own empty message are hidden (the challenge trail and cognitive profile stay)', /journey-log-on \.progress-stats,#progress-tab\.journey-log-on #mock-chart-card,#progress-tab\.journey-log-on #marg-journey-card,#progress-tab\.journey-log-on #progress-empty\{display:none!important\}/.test(css) && !/journey-log-on[^{]*(?:referral-progress-card|cognitive-card)/.test(css));
check('N5 every font size in the journey styles is 15px or larger', sizes.length >= 10 && sizes.every((size) => size >= 15), JSON.stringify(sizes));
check('N6 nothing in the journey styles is a fixed width that could overflow a phone, and long words wrap', !/[^-]width:\d{3,}px/.test(css) && /overflow-wrap:anywhere/.test(css));
check('N7 the call button is at least 44px tall and full width on a phone', /\.jl-cta\{min-height:44px/.test(css) && /\.jl-cta\{[^}]*width:100%/.test(css));
check('N8 /progress reads the same builder, with the older card kept as the fallback', /window\.buildJourneyLog\(\)/.test(slash) && /window\.BETA_JOURNEY_LOG !== false/.test(slash) && /getProgressJourneyData/.test(slash));
check('N9 /progress no longer marks a planned task as observed', !/Intervention', journey\.task \? \(journey\.task\.title[^;]*'observed'/.test(slash.slice(slash.indexOf('if (requireFunction(\'buildJourneyLog\')'), slash.indexOf("if (!requireFunction('getProgressJourneyData'))"))));
check('N10 the older progress functions and the Practice screen are still defined', ['function renderProgressJourney(', 'function renderMockChart(', 'function getProgressJourneyData(', 'async function loadProgressDashboard(', 'function loadDailyPractice('].every((needle) => app.includes(needle)));

process.stdout.write((failed ? 'FAIL ' : 'PASS ') + (checks - failed) + '/' + checks + ' journey log source checks passed\n');
process.exit(failed ? 1 : 0);
