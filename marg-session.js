var MargSession = (function() {
  function jwtExpMs(token) {
    try {
      var parts = String(token).split('.');
      if (parts.length < 2 || !parts[1]) return null;
      var body = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      while (body.length % 4) body += '=';
      if (typeof atob !== 'function') return null;
      var payload = JSON.parse(atob(body));
      var exp = Number(payload && payload.exp);
      if (!Number.isFinite(exp) || exp <= 0) return null;
      return exp * 1000;
    } catch (error) {
      return null;
    }
  }

  function knownExpiryMs(raw, token) {
    if (raw != null && String(raw).trim() !== '') {
      var parsed = Number(raw);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
    return jwtExpMs(token);
  }

  function getMargAccessToken(storage, nowMs) {
    var store = storage || (typeof window !== 'undefined' ? window.localStorage : null);
    var now = typeof nowMs === 'number' ? nowMs : Date.now();
    var token = null;
    var expiryRaw = null;
    try {
      token = store.getItem('marg_token');
      expiryRaw = store.getItem('marg_token_expiry');
    } catch (error) {
      return { token: null, reason: 'signed_out' };
    }
    if (token == null || String(token) === '') return { token: null, reason: 'signed_out' };
    token = String(token);
    var expiry = knownExpiryMs(expiryRaw, token);
    if (expiry != null && now >= expiry - 60000) return { token: null, reason: 'expired' };
    return { token: token, reason: 'ok' };
  }

  return { getMargAccessToken: getMargAccessToken };
})();
if (typeof window !== 'undefined') window.MargSession = MargSession;
if (typeof module !== 'undefined' && module.exports) module.exports = MargSession;
