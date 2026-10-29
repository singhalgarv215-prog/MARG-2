const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const byId = Object.create(null);
const created = [];

function makeElement(tag) {
  const el = {
    tagName: String(tag || 'div').toUpperCase(),
    _id: '',
    className: '',
    textContent: '',
    innerHTML: '',
    value: '',
    disabled: false,
    dataset: {},
    style: {
      setProperty() {},
      removeProperty() {},
      getPropertyValue() { return ''; }
    },
    children: [],
    childNodes: [],
    attributes: [],
    parentNode: null,
    scrollHeight: 40,
    scrollTop: 0,
    classList: {
      _c: [],
      add(name) { this._c.push(name); },
      remove(name) { this._c = this._c.filter(function(item) { return item !== name; }); },
      contains(name) { return this._c.indexOf(name) !== -1; },
      toggle(name, force) {
        const has = this._c.indexOf(name) !== -1;
        const next = typeof force === 'boolean' ? force : !has;
        if (next && !has) this._c.push(name);
        if (!next && has) this._c = this._c.filter(function(item) { return item !== name; });
        return next;
      }
    },
    appendChild(child) {
      if (child) child.parentNode = el;
      el.children.push(child);
      el.childNodes.push(child);
      return child;
    },
    remove() {
      if (this.parentNode && this.parentNode.children) {
        this.parentNode.children = this.parentNode.children.filter(function(child) { return child !== el; });
        this.parentNode.childNodes = this.parentNode.childNodes.filter(function(child) { return child !== el; });
      }
    },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener() {},
    removeEventListener() {},
    setAttribute(name, value) { this[name] = value; },
    getAttribute(name) { return this[name]; },
    removeAttribute() {},
    focus() {},
    click() { if (typeof this.onclick === 'function') this.onclick(); },
    dispatchEvent() {},
    getBoundingClientRect() { return { top:0, left:0, width:0, height:0 }; }
  };
  el.content = el;
  Object.defineProperty(el, 'id', {
    configurable: true,
    get() { return el._id; },
    set(value) {
      if (el._id && byId[el._id] === el) delete byId[el._id];
      el._id = String(value || '');
      if (el._id) byId[el._id] = el;
    }
  });
  created.push(el);
  return el;
}

function storage() {
  const data = Object.create(null);
  return {
    getItem(key) { return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null; },
    setItem(key, value) { data[key] = String(value); },
    removeItem(key) { delete data[key]; },
    clear() { Object.keys(data).forEach(function(key) { delete data[key]; }); },
    key() { return null; },
    get length() { return Object.keys(data).length; }
  };
}

function unrefTimer(timer) {
  if (timer && typeof timer.unref === 'function') timer.unref();
  return timer;
}

const documentElement = makeElement('html');
const head = makeElement('head');
const body = makeElement('body');
const messages = makeElement('div');
messages.id = 'messages';
const userInput = makeElement('textarea');
userInput.id = 'user-input';
const sendButton = makeElement('button');
sendButton.id = 'send-btn';
['loading-screen', 'landing-page', 'chat-app', 'guest-limit-banner', 'user-info', 'timed-test-overlay', 'messages-container', 'chat-panel'].forEach(function(id) {
  const node = makeElement('div');
  node.id = id;
});
body.appendChild(messages);

const documentTarget = {
  hidden: false,
  visibilityState: 'visible',
  readyState: 'complete',
  documentElement: documentElement,
  head: head,
  body: body,
  cookie: '',
  getElementById(id) { return byId[id] || null; },
  createElement: makeElement,
  querySelector() { return null; },
  querySelectorAll(selector) {
    if (selector === '[id^="conv-options-"]') {
      return created.filter(function(el) { return String(el.id || '').indexOf('conv-options-') === 0; });
    }
    return [];
  },
  addEventListener() {},
  removeEventListener() {}
};

const document = new Proxy(documentTarget, {
  get(target, prop) {
    if (prop in target) return target[prop];
    if (typeof prop === 'string') return makeElement(prop);
    return undefined;
  }
});

const sandbox = {
  console: console,
  setTimeout(fn, ms) {
    const args = Array.prototype.slice.call(arguments, 2);
    return unrefTimer(setTimeout(function() { if (typeof fn === 'function') fn.apply(null, args); }, ms || 0));
  },
  clearTimeout: clearTimeout,
  setInterval(fn, ms) {
    const args = Array.prototype.slice.call(arguments, 2);
    return unrefTimer(setInterval(function() { if (typeof fn === 'function') fn.apply(null, args); }, ms || 0));
  },
  clearInterval: clearInterval,
  Intl: Intl,
  Date: Date,
  Math: Math,
  JSON: JSON,
  Promise: Promise,
  URL: URL,
  URLSearchParams: URLSearchParams,
  AbortController: AbortController,
  TextEncoder: TextEncoder,
  TextDecoder: TextDecoder,
  crypto: require('crypto'),
  navigator: { onLine: true, userAgent: 'MargTest', language: 'en' },
  location: { href: 'http://127.0.0.1:8877/', origin: 'http://127.0.0.1:8877', pathname: '/', search: '', hash: '', hostname: '127.0.0.1' },
  document: document,
  localStorage: storage(),
  sessionStorage: storage(),
  fetch: function() { return Promise.reject(new Error('network disabled in local tests')); },
  requestAnimationFrame() { return 0; },
  cancelAnimationFrame() {},
  matchMedia() { return { matches: false, addEventListener() {}, removeEventListener() {}, addListener() {} }; },
  getComputedStyle() { return {}; },
  performance: { now: function() { return Date.now(); } },
  atob: function(value) { return Buffer.from(String(value), 'base64').toString('binary'); },
  btoa: function(value) { return Buffer.from(String(value), 'binary').toString('base64'); },
  addEventListener() {},
  removeEventListener() {}
};
sandbox.window = sandbox;
sandbox.self = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

const files = (process.env.MARG_FILES || [
  'chat-topics.js',
  'study-context.js',
  'question-library.js',
  'marg-training.js',
  'slash-tools.js',
  'time-mock-blueprints.js',
  'cloudflare-worker.js',
  'qa-engine.js',
  'dilr-engine.js',
  'cat-bank-verification.js',
  'marg-vision.js',
  'marg-app.js'
].join(',')).split(',');

for (const file of files) {
  const full = path.join(root, file);
  if (!fs.existsSync(full)) continue;
  try {
    let source = fs.readFileSync(full, 'utf8');
    if (file === 'cloudflare-worker.js') {
      source = 'globalThis.resolveMaxOutputTokens=(function(){' +
        source.replace(/export\s*\{[^}]*\};?/g, '').replace(/export default/g, 'var __workerDefault =') +
        ';return resolveMaxOutputTokens;})();';
    }
    vm.runInContext(source, sandbox, { filename: file });
  } catch (error) {
    console.log('LOAD ERR', file, error && error.stack || error);
    process.exit(1);
  }
}

function report(name, results) {
  const list = Array.isArray(results) ? results : [];
  let failed = 0;
  list.forEach(function(result) {
    const passed = !!(result && (result.passed === true || result.pass === true));
    const label = result && (result.name || result.input) || 'unnamed';
    if (!passed) {
      failed += 1;
      const detail = result && result.detail ? '\n  ' + String(result.detail).slice(0, 500) : '';
      console.log('FAIL — ' + name + ' — ' + label + detail);
    }
  });
  console.log((list.length - failed) + '/' + list.length + ' ' + name);
  return failed;
}

(async function main() {
  let failed = 0;
  const preferred = [
    'runConversationEndingTests',
    'runMentorBehaviorTests',
    'runConversationMemoryTests',
    'runIndiaTimeTests',
    'runDiagnosticFlowTests',
    'runProductExperienceTests',
    'runMargSubmissionStateTests',
    'runContextRoutingTests'
  ];
  const discovered = Object.keys(sandbox).filter(function(name) {
    return (/^run.*Tests$/.test(name) || /^runMarg.*Tests$/.test(name)) && typeof sandbox[name] === 'function';
  });
  const selected = process.argv.slice(2);
  const names = selected.length ? selected : preferred.concat(discovered.filter(function(name) { return preferred.indexOf(name) === -1; }));
  for (const name of names) {
    if (typeof sandbox[name] !== 'function') {
      failed += 1;
      console.log('FAIL — ' + name + ' — suite missing');
      continue;
    }
    try {
      failed += report(name, await sandbox[name]());
    } catch (error) {
      failed += 1;
      console.log('FAIL — ' + name + ' — ' + (error && error.stack || error));
    }
  }
  console.log(failed ? failed + ' failing test(s)' : 'all selected suites passed');
  process.exit(failed ? 1 : 0);
})();
