// In-memory Durable Object storage for tests. Not loaded by the Worker.
// list() follows https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/
// ctx.storage.list resolves to a Map. get returns undefined when missing.
// delete(key) resolves to a boolean. put enforces the value-size limit.
// transaction() follows the legacy transactional method on the same page's
// predecessor https://developers.cloudflare.com/durable-objects/api/legacy-kv-storage-api/ :
// the closure receives get/put/delete/list, a throw rolls back, and another
// request cannot see the uncommitted overlay.

const DEFAULT_VALUE_BYTES = 2 * 1024 * 1024;
const encoder = new TextEncoder();

function compareUtf8(left, right) {
  const a = encoder.encode(String(left));
  const b = encoder.encode(String(right));
  const length = Math.min(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return a.length - b.length;
}

function hasOption(options, name) {
  return !!options && Object.prototype.hasOwnProperty.call(options, name) && options[name] != null;
}

export function createMemoryUsageLedger(UsageLedger, options) {
  const maxValueBytes = options && Number(options.maxValueBytes) > 0 ? Number(options.maxValueBytes) : DEFAULT_VALUE_BYTES;
  const strict = !options || options.strict !== false;
  const map = new Map();
  let reads = 0;
  let writes = 0;
  let maxSerialized = 0;
  let maxList = 0;
  let failPuts = 0;
  let failLists = 0;

  function acceptPut(value) {
    const serial = JSON.stringify(value);
    if (serial.length > maxValueBytes) {
      const error = new Error('VALUE_TOO_LARGE');
      error.code = 'VALUE_TOO_LARGE';
      throw error;
    }
    if (failPuts > 0) {
      failPuts -= 1;
      throw new Error('PUT_FAILED');
    }
    writes += 1;
    if (serial.length > maxSerialized) maxSerialized = serial.length;
    return JSON.parse(serial);
  }

  function listKeys(overlay, deleted, listOptions) {
    if (strict && hasOption(listOptions, 'start') && hasOption(listOptions, 'startAfter')) {
      const error = new Error('LIST_SHAPE');
      error.code = 'LIST_SHAPE';
      throw error;
    }
    if (strict && listOptions && listOptions.returnShape && listOptions.returnShape !== 'map') {
      const error = new Error('LIST_SHAPE');
      error.code = 'LIST_SHAPE';
      throw error;
    }
    if (failLists > 0) {
      failLists -= 1;
      throw new Error('LIST_FAILED');
    }
    const prefix = listOptions && listOptions.prefix || '';
    const keys = [];
    const seen = new Set();
    const add = (key) => {
      if (seen.has(key)) return;
      if (deleted && deleted.has(key) && !(overlay && overlay.has(key))) return;
      if (prefix && String(key).indexOf(prefix) !== 0) return;
      if (hasOption(listOptions, 'start') && compareUtf8(key, listOptions.start) < 0) return;
      if (hasOption(listOptions, 'startAfter') && compareUtf8(key, listOptions.startAfter) <= 0) return;
      if (hasOption(listOptions, 'end') && compareUtf8(key, listOptions.end) >= 0) return;
      seen.add(key);
      keys.push(key);
    };
    if (overlay) overlay.forEach((_value, key) => add(key));
    map.forEach((_value, key) => add(key));
    keys.sort(compareUtf8);
    if (listOptions && listOptions.reverse) keys.reverse();
    const limit = listOptions && listOptions.limit > 0 ? listOptions.limit : keys.length;
    return keys.slice(0, limit);
  }

  function cloneOf(overlay, deleted, key) {
    if (deleted && deleted.has(key)) return undefined;
    if (overlay && overlay.has(key)) return JSON.parse(JSON.stringify(overlay.get(key)));
    if (!map.has(key)) return undefined;
    return JSON.parse(JSON.stringify(map.get(key)));
  }

  function makeView(overlay, deleted) {
    return {
      async get(key) {
        reads += 1;
        return cloneOf(overlay, deleted, key);
      },
      async put(key, value) {
        const stored = acceptPut(value);
        if (overlay) {
          overlay.set(key, stored);
          if (deleted) deleted.delete(key);
        } else map.set(key, stored);
      },
      async delete(key) {
        writes += 1;
        const existed = !!(deleted && deleted.has(key) ? false : overlay && overlay.has(key) ? true : map.has(key));
        if (overlay) {
          overlay.delete(key);
          deleted.add(key);
        } else map.delete(key);
        return existed;
      },
      async list(listOptions) {
        reads += 1;
        const names = listKeys(overlay, deleted, listOptions);
        const page = new Map();
        names.forEach((key) => page.set(key, cloneOf(overlay, deleted, key)));
        if (page.size > maxList) maxList = page.size;
        if (strict && !(page instanceof Map)) {
          const error = new Error('LIST_SHAPE');
          error.code = 'LIST_SHAPE';
          throw error;
        }
        if (strict && (Array.isArray(page) || Array.isArray(page.keys))) {
          const error = new Error('LIST_SHAPE');
          error.code = 'LIST_SHAPE';
          throw error;
        }
        return page;
      }
    };
  }

  const storage = makeView(null, null);
  storage.keys = () => Array.from(map.keys());
  storage.transaction = async (fn) => {
    const overlay = new Map();
    const deleted = new Set();
    const tx = makeView(overlay, deleted);
    const result = await fn(tx);
    deleted.forEach((key) => { if (!overlay.has(key)) map.delete(key); });
    overlay.forEach((value, key) => map.set(key, value));
    return result;
  };
  const ledger = new UsageLedger({ storage });
  let chain = Promise.resolve();
  return {
    fetch(request) {
      const run = chain.then(() => ledger.fetch(request));
      chain = run.then(() => undefined, () => undefined);
      return run;
    },
    storage,
    stats() { return { reads, writes, maxSerialized, maxList }; },
    failNextPut(count) { failPuts += Number(count) || 0; },
    failNextList(count) { failLists = Number(count) || 0; }
  };
}
