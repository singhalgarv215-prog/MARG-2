/* MARG environment selector and staging network guard.
 *
 * Production behaviour is unchanged: with no staging config this file only sets
 * window.MARG_ENV = { name: 'production' } and the app keeps its built-in endpoints.
 *
 * Staging is opt-in. A staging page loads a local, git-ignored staging-config.local.js that sets
 * window.MARG_STAGING_CONFIG = { supabaseUrl, anonKey } BEFORE this file. Then:
 *   1. the config must point at a different Supabase project than production, and the anon key's own
 *      `ref` claim must match that project (so a production key cannot be pasted in by mistake);
 *   2. every outgoing request to the production Supabase host or the production Worker is refused
 *      (fetch, XMLHttpRequest, sendBeacon, WebSocket, EventSource, form posts are not used by the app);
 *   3. a banner says STAGING.
 * Limits: this guards the page's own network calls. It cannot stop a link or redirect that navigates the
 * whole page to production; staging pages must not contain such links, and the test suite checks that
 * the Google sign-in redirect uses the configured URL.
 */
(function (root) {
  'use strict';

  var PRODUCTION = {
    supabaseHost: 'kduqtrumhveteyjkyltf.supabase.co',
    workerHost: 'marg.singhalgarv215.workers.dev'
  };

  /* Only these page hostnames may run MARG against production: the three production domains listed in the Vercel
   * project (Settings, Domains). Exact matches only; *.vercel.app is NOT allowed as a pattern. Every other hostname
   * (Vercel preview URLs, unknown domains) is NOT production: it needs a valid staging config or it refuses to start.
   * Keep this list, the two page gates (marg-app.js, landing-bootstrap.js) and the vercel.json route identical. */
  var PRODUCTION_PAGE_HOSTS = ['trymarg.com', 'www.trymarg.com', 'marg-five.vercel.app'];

  function pageKind(hostname) {
    var h = String(hostname == null ? '' : hostname).toLowerCase().replace(/\.$/, '');
    if (PRODUCTION_PAGE_HOSTS.indexOf(h) !== -1) return 'production';
    if (h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h === '::1' || h.slice(-10) === '.localhost') return 'local';
    return 'other';
  }

  function blockedEnv(reason) { return { name: 'blocked', blocked: true, reason: String(reason) }; }

  function hostOf(url) {
    try { return new URL(String(url), 'https://placeholder.invalid/').hostname.toLowerCase(); }
    catch (e) { return ''; }
  }

  function isProductionUrl(url) {
    var h = hostOf(url);
    if (!h) return false;
    function matches(target) { return h === target || h.slice(-(target.length + 1)) === '.' + target; }
    return matches(PRODUCTION.supabaseHost) || matches(PRODUCTION.workerHost);
  }

  function decodeJwtPayload(token) {
    try {
      var part = String(token).split('.')[1];
      if (!part) return null;
      var b64 = part.replace(/-/g, '+').replace(/_/g, '/');
      while (b64.length % 4) b64 += '=';
      var json = typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('utf8');
      return JSON.parse(json);
    } catch (e) { return null; }
  }

  /* hostname is optional so direct callers (tests, tools) keep the old behaviour; the page bootstrap always passes it. */
  function resolveEnv(config, hostname) {
    var kind = hostname === undefined ? 'local' : pageKind(hostname);
    if (kind === 'production') return { name: 'production' }; // a staging config can never be injected into production
    if (!config) {
      if (kind === 'local') return { name: 'production' }; // local development keeps its existing behaviour
      throw new Error('MARG: no staging configuration on a host that is not production (' + String(hostname).slice(0, 80) + ')');
    }
    var url = String(config.supabaseUrl || '');
    var host = hostOf(url);
    if (!/^https:\/\/[a-z0-9]{20}\.supabase\.co\/?$/.test(url)) throw new Error('MARG staging: supabaseUrl must be https://<project-ref>.supabase.co');
    if (isProductionUrl(url)) throw new Error('MARG staging: refusing to start, supabaseUrl is the production project');
    var payload = decodeJwtPayload(config.anonKey);
    if (!payload) throw new Error('MARG staging: anonKey is missing or not a JWT');
    if (payload.role !== 'anon') throw new Error('MARG staging: anonKey must be the anon (publishable) key, not a service key');
    if (payload.ref !== host.split('.')[0]) throw new Error('MARG staging: anonKey does not belong to the configured project');
    if (payload.ref === PRODUCTION.supabaseHost.split('.')[0]) throw new Error('MARG staging: anonKey is the production key');
    return {
      name: 'staging',
      supabaseUrl: url.replace(/\/$/, ''),
      anonKey: String(config.anonKey),
      workerUrl: 'https://staging-model-stub.invalid/'
    };
  }

  /* Never throws. Any failure to resolve a safe environment becomes a blocked environment, never production. */
  function resolveSafely(config, hostname) {
    try { return resolveEnv(config, hostname === undefined || hostname === null ? '' : hostname); }
    catch (e) { return blockedEnv(e && e.message ? e.message : 'unknown environment error'); }
  }

  function installNetworkGuard(win) {
    var blocked = [];
    win.__margBlocked = blocked;
    function refuse(kind, url) {
      blocked.push({ kind: kind, host: hostOf(url) });
      throw new TypeError('MARG staging guard: blocked ' + kind + ' to production host ' + hostOf(url));
    }
    // Fail closed: a non-empty address whose host cannot be read is refused, never waved through.
    function check(kind, url) { if (isProductionUrl(url) || (String(url) !== '' && hostOf(url) === '')) refuse(kind, url); }

    if (typeof win.fetch === 'function') {
      var realFetch = win.fetch;
      win.fetch = function (input, init) {
        var url = input && typeof input === 'object' && 'url' in input ? input.url : input;
        try { check('fetch', url); } catch (e) { return Promise.reject(e); }
        return realFetch.call(this, input, init);
      };
    }
    if (win.XMLHttpRequest && win.XMLHttpRequest.prototype) {
      var realOpen = win.XMLHttpRequest.prototype.open;
      win.XMLHttpRequest.prototype.open = function (method, url) {
        check('xhr', url);
        return realOpen.apply(this, arguments);
      };
    }
    if (win.navigator && typeof win.navigator.sendBeacon === 'function') {
      var realBeacon = win.navigator.sendBeacon.bind(win.navigator);
      win.navigator.sendBeacon = function (url, data) { check('beacon', url); return realBeacon(url, data); };
    }
    if (typeof win.WebSocket === 'function') {
      var RealWS = win.WebSocket;
      var Guarded = function (url, protocols) { check('websocket', url); return new RealWS(url, protocols); };
      Guarded.prototype = RealWS.prototype;
      win.WebSocket = Guarded;
    }
    if (typeof win.EventSource === 'function') {
      var RealES = win.EventSource;
      var GuardedES = function (url, init) { check('eventsource', url); return new RealES(url, init); };
      GuardedES.prototype = RealES.prototype;
      win.EventSource = GuardedES;
    }
    return blocked;
  }

  function showBanner(win, env) {
    try {
      var doc = win.document;
      if (!doc || !doc.addEventListener) return;
      var put = function () {
        if (doc.getElementById('marg-staging-banner')) return;
        var bar = doc.createElement('div');
        bar.id = 'marg-staging-banner';
        if (env && env.blocked) {
          bar.textContent = 'MARG is switched off on this address. This is not the live site and has no test data configured, so nothing was loaded and nothing was sent. Open trymarg.com instead.';
          bar.setAttribute('style', 'position:fixed;left:0;right:0;top:0;bottom:0;z-index:2147483647;background:#111;color:#fff;font:600 17px/1.5 system-ui,sans-serif;padding:32px 20px;text-align:center;display:flex;align-items:center;justify-content:center');
        } else {
          bar.textContent = 'STAGING \u2014 test data only. Not the real MARG.';
          bar.setAttribute('style', 'position:fixed;left:0;right:0;bottom:0;z-index:2147483647;background:#b00020;color:#fff;font:600 15px/1.4 system-ui,sans-serif;padding:8px 16px;text-align:center');
        }
        doc.body.appendChild(bar);
      };
      if (doc.body) put(); else doc.addEventListener('DOMContentLoaded', put);
    } catch (e) { /* banner is cosmetic */ }
  }

  var api = { PRODUCTION: PRODUCTION, PRODUCTION_PAGE_HOSTS: PRODUCTION_PAGE_HOSTS, pageKind: pageKind, hostOf: hostOf, isProductionUrl: isProductionUrl, resolveEnv: resolveEnv, resolveSafely: resolveSafely, installNetworkGuard: installNetworkGuard };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;

  if (root && typeof root === 'object' && 'document' in root) {
    root.MARG_ENV_TOOLS = api;
    // Fail closed: an unsafe config, a missing config on a non-production host, or an unreadable hostname gives a
    // blocked environment (never production). The hostname comes from the page itself.
    var pageHost = root.location && typeof root.location.hostname === 'string' ? root.location.hostname : '';
    var env = resolveSafely(root.MARG_STAGING_CONFIG, pageHost);
    // Staging and blocked pages must not send page views to the production analytics property (Google's documented opt-out flag).
    if (env.name === 'staging' || env.blocked) { root['ga-disable-G-VZ0N5RH912'] = true; installNetworkGuard(root); showBanner(root, env); }
    root.MARG_ENV = env;
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
