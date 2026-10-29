const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
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
    style: {},
    children: [],
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
      child.parentNode = el;
      el.children.push(child);
      return child;
    },
    remove() {
      if (this.parentNode && this.parentNode.children) {
        this.parentNode.children = this.parentNode.children.filter(function(child) { return child !== el; });
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
    dispatchEvent() {}
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
    clear() { Object.keys(data).forEach(function(key) { delete data[key]; }); }
  };
}

const documentElement = makeElement('html');
documentElement.style.setProperty = function() {};
const head = makeElement('head');
const body = makeElement('body');
const messages = makeElement('div');
messages.id = 'messages';
const userInput = makeElement('textarea');
userInput.id = 'user-input';
const sendButton = makeElement('button');
sendButton.id = 'send-btn';

const document = {
  hidden: false,
  visibilityState: 'visible',
  documentElement: documentElement,
  head: head,
  body: body,
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

const sandbox = {
  console: console,
  setTimeout: setTimeout,
  clearTimeout: clearTimeout,
  setInterval: setInterval,
  clearInterval: clearInterval,
  Intl: Intl,
  Date: Date,
  Math: Math,
  JSON: JSON,
  Promise: Promise,
  URL: URL,
  URLSearchParams: URLSearchParams,
  crypto: require('crypto'),
  navigator: { onLine: true, userAgent: 'MargTest' },
  location: { href: 'http://127.0.0.1:8877/', origin: 'http://127.0.0.1:8877' },
  document: document,
  localStorage: storage(),
  sessionStorage: storage(),
  fetch: function() { return Promise.reject(new Error('network disabled in local tests')); },
  addEventListener() {},
  removeEventListener() {}
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

['chat-topics.js', 'question-library.js', 'marg-app.js'].forEach(function(file) {
  const code = fs.readFileSync(path.join(root, file), 'utf8');
  vm.runInContext(code, sandbox, { filename: file });
});

function report(name, results) {
  const list = Array.isArray(results) ? results : [];
  let failed = 0;
  list.forEach(function(result) {
    const passed = !!(result && (result.passed === true || result.pass === true));
    const label = result && (result.name || result.input) || 'unnamed';
    if (!passed) {
      failed += 1;
      console.log('FAIL — ' + name + ' — ' + label + (result && result.detail ? '\n  ' + String(result.detail).slice(0, 500) : ''));
    }
  });
  console.log((list.length - failed) + '/' + list.length + ' ' + name);
  return failed;
}

(async function main() {
  let failed = 0;
  const suites = [
    ['conversation endings', sandbox.runConversationEndingTests],
    ['mentor behavior', sandbox.runMentorBehaviorTests],
    ['conversation memory', sandbox.runConversationMemoryTests],
    ['India time', sandbox.runIndiaTimeTests],
    ['diagnostic flow', sandbox.runDiagnosticFlowTests],
    ['product experience', sandbox.runProductExperienceTests],
    ['submission state', sandbox.runMargSubmissionStateTests]
  ];
  for (const pair of suites) {
    if (typeof pair[1] !== 'function') {
      failed += 1;
      console.log('FAIL — ' + pair[0] + ' — suite missing');
      continue;
    }
    try {
      failed += report(pair[0], await pair[1]());
    } catch (error) {
      failed += 1;
      console.log('FAIL — ' + pair[0] + ' — ' + (error && error.stack || error));
    }
  }
  if (typeof sandbox.runContextRoutingTests === 'function') {
    try {
      failed += report('context routing', await sandbox.runContextRoutingTests());
    } catch (error) {
      failed += 1;
      console.log('FAIL — context routing — ' + (error && error.stack || error));
    }
  }
  console.log(failed ? failed + ' failing test(s)' : 'all selected suites passed');
  process.exit(failed ? 1 : 0);
})();
