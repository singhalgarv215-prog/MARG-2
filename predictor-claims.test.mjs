import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.join(root, 'cat-percentile-predictor.html');
const html = fs.readFileSync(htmlPath, 'utf8');

const checks = [];
function check(name, passed) {
  checks.push([name, !!passed]);
}

const banned = [
  '±',
  'within ±',
  'reliable estimate',
  'accurate estimate',
  'exact IIM',
  'instantly know',
  'Helps us give accurate',
  'closable in',
  '2-4 more points',
  'BLACKI',
  'IIM ABC needs 99',
  'diagnoses exactly',
  'Marg will diagnose exactly',
  'tell you exactly',
  'Focus 50%',
  'could add 3-4 percentile',
  'YOUR TARGET PERCENTILE',
  'Predicted Overall Percentile',
  'Range: ${'
];
for (const phrase of banned) {
  check('banned claim is absent: ' + phrase, !html.includes(phrase));
}

function occurrences(haystack, needle) {
  let count = 0;
  let index = 0;
  while (index !== -1) {
    index = haystack.indexOf(needle, index);
    if (index === -1) break;
    count += 1;
    index += needle.length;
  }
  return count;
}

const required = [
  '⚠️ This estimate comes from a table compiled by Marg that has not been validated against official results. The error is unknown and may be large. Mock scores are not CAT scores, and your slot\'s paper and normalisation change the real result.',
  'Based on indicative, unsourced cut-offs and adjustments. This is not a prediction of any shortlist.',
  'Indicative IIM cut-offs by category (not official; source and year not documented)',
  'Rough estimate (not validated)',
  'Accuracy not measured, so no range is shown',
  'We have not measured its accuracy'
];
for (const phrase of required) {
  check('required text appears once: ' + phrase.slice(0, 48), occurrences(html, phrase) === 1);
}

// Hashes from git show a5fdc9a6faae30dd9cef191996c1ad603ee80b6e:cat-percentile-predictor.html
// (origin/main at authoring time).
const expectedHashes = {
  getSectionPercentile: '506eaf6bad8df8e987369ebd67ceb7a374ef15adbffe71ffe39d09c85a4e55f6',
  getOverallPercentile: '3a855df23cffb5b4a119a9af7f44a5424800ff6383b283b13937ff5917bf33bb',
  getColleges: 'e7133a107452ed1d9ab13086f03d40ec0f72ffddda8642d3a1eac2f64f052f30',
  getIIMShortlistAnalysis: 'e4c9e4a0bdda5705f7567e182fa8e07aa7df0a5ac68598e345c989e2e0d47745'
};

function extractFunction(source, name) {
  const token = 'function ' + name + '(';
  const start = source.indexOf(token);
  if (start < 0) throw new Error('missing function ' + name);
  let i = source.indexOf('{', start);
  let depth = 0;
  let quote = null;
  let escape = false;
  let lineComment = false;
  let blockComment = false;
  const templateExpr = [];
  for (; i < source.length; i++) {
    const c = source[i];
    const next = source[i + 1];
    if (lineComment) {
      if (c === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (c === '*' && next === '/') {
        blockComment = false;
        i += 1;
      }
      continue;
    }
    if (quote) {
      if (escape) {
        escape = false;
        continue;
      }
      if (c === '\\') {
        escape = true;
        continue;
      }
      if (quote === '`' && c === '$' && next === '{') {
        templateExpr.push(depth);
        quote = null;
        depth += 1;
        i += 1;
        continue;
      }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '/' && next === '/') {
      lineComment = true;
      i += 1;
      continue;
    }
    if (c === '/' && next === '*') {
      blockComment = true;
      i += 1;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      quote = c;
      continue;
    }
    if (c === '{') depth += 1;
    else if (c === '}') {
      depth -= 1;
      if (templateExpr.length && depth === templateExpr[templateExpr.length - 1]) {
        templateExpr.pop();
        quote = '`';
        continue;
      }
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error('unclosed function ' + name);
}

for (const name of Object.keys(expectedHashes)) {
  const body = extractFunction(html, name);
  const hash = crypto.createHash('sha256').update(body).digest('hex');
  check(name + ' is unchanged', hash === expectedHashes[name]);
}

const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(function(match) { return match[1]; });
const mainScript = scripts.find(function(script) { return script.includes('function predictPercentile'); });
check('main predictor script is present', !!mainScript);

const elements = new Map();
function makeElement(id) {
  return {
    id: id,
    value: '',
    textContent: '',
    innerHTML: '',
    style: {},
    className: '',
    classList: {
      add() {},
      remove() {},
      toggle() {},
      contains() { return false; }
    },
    scrollIntoView() {},
    addEventListener() {},
    setAttribute() {},
    querySelector() { return null; },
    querySelectorAll() { return []; }
  };
}

const sandbox = {
  console: console,
  Math: Math,
  parseInt: parseInt,
  parseFloat: parseFloat,
  alert() {},
  gtag() {},
  dataLayer: [],
  setTimeout() { return 0; },
  localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
  sessionStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
  document: {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, makeElement(id));
      return elements.get(id);
    }
  }
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(mainScript, sandbox, { filename: 'cat-percentile-predictor.html' });

function elementText(id) {
  return sandbox.document.getElementById(id).textContent;
}

const pinnedOverall = {
  A: '80.4',
  B: '95.0',
  C: '97.5',
  D: '99.3'
};

const cases = [
  {
    id: 'A',
    scores: [20, 15, 18],
    sub: 'Marg can look at where you are losing marks and suggest a plan. It cannot promise a result.',
    button: 'Build my plan on Marg — free →'
  },
  {
    id: 'B',
    scores: [30, 25, 25],
    sub: 'Marg can help you work out which section to look at first.',
    button: 'Get my personalised plan on Marg — free →'
  },
  {
    id: 'C',
    scores: [35, 28, 27],
    sub: 'At this level small errors matter. Marg can help you find where marks are leaking.',
    button: 'Find my score leaks on Marg — free →'
  },
  {
    id: 'D',
    scores: [40, 33, 32],
    sub: 'Marg can help you prepare for the interview stage.',
    button: 'Prepare my PI strategy on Marg — free →'
  }
];

delete sandbox._hasMock;
sandbox.document.getElementById('category').value = 'general';
sandbox.document.getElementById('gender').value = 'male';
sandbox.document.getElementById('tenth').value = '';
sandbox.document.getElementById('twelfth').value = '';
sandbox.document.getElementById('grad').value = '';

for (const item of cases) {
  sandbox.document.getElementById('varc-score').value = String(item.scores[0]);
  sandbox.document.getElementById('dilr-score').value = String(item.scores[1]);
  sandbox.document.getElementById('qa-score').value = String(item.scores[2]);
  sandbox.predictPercentile();
  const overall = elementText('overall-percentile');
  const range = elementText('percentile-range');
  const title = elementText('cta-title');
  const sub = elementText('cta-sub');
  const button = elementText('cta-btn');
  const number = overall.replace('%ile', '');
  check('case ' + item.id + ' overall stays ' + pinnedOverall[item.id], overall === pinnedOverall[item.id] + '%ile');
  check('case ' + item.id + ' shows no numeric range', range === 'Accuracy not measured, so no range is shown' && !/\d/.test(range));
  check('case ' + item.id + ' title shows the estimate', title === 'Your rough estimate is ' + number + '%ile (not validated).' && !/\bneed\b/i.test(title));
  check('case ' + item.id + ' subtitle matches its branch', sub === item.sub);
  check('case ' + item.id + ' button matches its branch', button === item.button);
  const cta = title + '\n' + sub + '\n' + button;
  check('case ' + item.id + ' CTA avoids outcome promises', !/weeks|territory|exactly|IIM ABC/.test(cta));
}

sandbox._hasMock = false;
sandbox.predictPercentile();
const noMock = sandbox.document.getElementById('results').innerHTML;
check('no-mock branch says NEXT STEP', noMock.includes('NEXT STEP') && !noMock.includes('YOUR TARGET PERCENTILE'));

function improvementCase(varcP, dilrP, qaP) {
  return sandbox.getImprovements(10, 20, 30, varcP, dilrP, qaP);
}

const mixed = improvementCase(69.9, 70, 84.9);
check('improvements sort lowest percentile first', mixed[0].text.includes('VARC') && mixed[1].text.includes('DILR') && mixed[2].text.includes('QA'));
check('69.9 is the urgent colour and uses the new leak sentence', mixed[0].color === '#E05C5C' && mixed[0].text.includes('VARC') && mixed[0].text.includes('70th percentile') && mixed[0].text.includes('This section is your biggest score leak in this estimate. Consider giving it more of your prep time.') && !mixed[0].text.includes('Focus 50%'));
check('70 and 84.9 use the middle colour and the new improvement sentence', mixed[1].color === '#C9A84C' && mixed[2].color === '#C9A84C' && mixed[1].text.includes('70th percentile') && mixed[2].text.includes('85th percentile') && mixed[1].text.includes('Improving it would help your overall score; this tool cannot say by how much.') && mixed[2].text.includes('Improving it would help your overall score; this tool cannot say by how much.') && !mixed[1].text.includes('could add 3-4 percentile') && !mixed[2].text.includes('could add 3-4 percentile'));

const strong = improvementCase(85, 69.9, 70);
check('85 is the strength colour and is sorted last', strong[0].text.includes('DILR') && strong[1].text.includes('QA') && strong[2].text.includes('VARC') && strong[2].color === '#4CAF7D' && strong[2].text.includes('85th percentile') && strong[2].text.includes('is your strength') && !strong[2].text.includes('biggest score leak') && !strong[2].text.includes('cannot say by how much'));

let failed = 0;
for (const [name, passed] of checks) {
  console.log((passed ? 'PASS' : 'FAIL') + ' — ' + name);
  if (!passed) failed += 1;
}
console.log('\n' + (checks.length - failed) + '/' + checks.length + ' predictor claim checks passed.');
if (failed) process.exit(1);
