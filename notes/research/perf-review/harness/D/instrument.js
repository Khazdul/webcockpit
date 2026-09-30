// Init script (perf review D): counts live timers, intervals, rAF callbacks,
// global event listeners, ResizeObservers, MessageChannels and workers, so a
// test can see whether they accumulate. `window.__inst.counts()` returns the
// live numbers; `window.__inst.intervalSites()` the call sites of live
// intervals (first frames of the stack).
(() => {
  const live = {
    timeouts: new Set(),
    intervals: new Map(),
    listeners: new Map(), // "Kind:type" -> count (adds − removes) on global-ish targets
    ro: 0,
    roObserving: 0,
    workers: 0,
    workersTerminated: 0,
    channels: 0,
  };
  const st = window.setTimeout.bind(window);
  const ct = window.clearTimeout.bind(window);
  const si = window.setInterval.bind(window);
  const ci = window.clearInterval.bind(window);
  window.setTimeout = function (fn, ms, ...a) {
    let id;
    const wrapped = typeof fn === 'function' ? (...x) => { live.timeouts.delete(id); return fn(...x); } : fn;
    id = st(wrapped, ms, ...a);
    live.timeouts.add(id);
    return id;
  };
  window.clearTimeout = function (id) {
    live.timeouts.delete(id);
    return ct(id);
  };
  window.setInterval = function (fn, ms, ...a) {
    const id = si(fn, ms, ...a);
    const stack = (new Error().stack || '').split('\n').slice(2, 4).map((s) => s.trim()).join(' < ');
    live.intervals.set(id, `${ms}ms ${stack}`);
    return id;
  };
  window.clearInterval = function (id) {
    live.intervals.delete(id);
    return ci(id);
  };
  const GLOBAL = (t) => t === window || t === document || (typeof MediaQueryList !== 'undefined' && t instanceof MediaQueryList) || (typeof FontFaceSet !== 'undefined' && t instanceof FontFaceSet) || (typeof Worker !== 'undefined' && t instanceof Worker) || (typeof MessagePort !== 'undefined' && t instanceof MessagePort) || (typeof IDBDatabase !== 'undefined' && t instanceof IDBDatabase);
  const kind = (t) => (t === window ? 'window' : t === document ? 'document' : t && t.constructor ? t.constructor.name : '?');
  const add = EventTarget.prototype.addEventListener;
  const rem = EventTarget.prototype.removeEventListener;
  EventTarget.prototype.addEventListener = function (type, fn, opts) {
    if (GLOBAL(this)) {
      const k = `${kind(this)}:${type}`;
      live.listeners.set(k, (live.listeners.get(k) || 0) + 1);
    }
    return add.call(this, type, fn, opts);
  };
  EventTarget.prototype.removeEventListener = function (type, fn, opts) {
    if (GLOBAL(this)) {
      const k = `${kind(this)}:${type}`;
      live.listeners.set(k, (live.listeners.get(k) || 0) - 1);
    }
    return rem.call(this, type, fn, opts);
  };
  if (typeof ResizeObserver !== 'undefined') {
    const RO = ResizeObserver;
    window.ResizeObserver = class extends RO {
      constructor(cb) {
        super(cb);
        live.ro++;
        this.__n = 0;
      }
      observe(t, o) {
        this.__n++;
        live.roObserving++;
        return super.observe(t, o);
      }
      unobserve(t) {
        if (this.__n > 0) {
          this.__n--;
          live.roObserving--;
        }
        return super.unobserve(t);
      }
      disconnect() {
        live.roObserving -= this.__n;
        this.__n = 0;
        return super.disconnect();
      }
    };
  }
  if (typeof Worker !== 'undefined') {
    const W = Worker;
    window.Worker = class extends W {
      constructor(...a) {
        super(...a);
        live.workers++;
      }
      terminate() {
        live.workersTerminated++;
        return super.terminate();
      }
    };
  }
  if (typeof MessageChannel !== 'undefined') {
    const MC = MessageChannel;
    window.MessageChannel = class extends MC {
      constructor() {
        super();
        live.channels++;
      }
    };
  }
  // IndexedDB transactions and Web Storage writes (counts and bytes).
  const io = { idbTx: {}, storage: {}, storageBytes: 0 };
  if (typeof IDBDatabase !== 'undefined') {
    const tx = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (stores, mode, ...a) {
      const k = `${mode || 'readonly'}:${[].concat(stores).join('+')}`;
      io.idbTx[k] = (io.idbTx[k] || 0) + 1;
      return tx.call(this, stores, mode, ...a);
    };
  }
  if (typeof Storage !== 'undefined') {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      const k = `${this === window.sessionStorage ? 'session' : 'local'}:${key}`;
      io.storage[k] = (io.storage[k] || 0) + 1;
      io.storageBytes += String(value).length;
      return set.call(this, key, value);
    };
  }
  window.__inst = {
    io() {
      return JSON.parse(JSON.stringify(io));
    },
    counts() {
      const l = {};
      for (const [k, v] of live.listeners) if (v !== 0) l[k] = v;
      return {
        timeouts: live.timeouts.size,
        intervals: live.intervals.size,
        listeners: l,
        ro: live.ro,
        roObserving: live.roObserving,
        workers: live.workers,
        workersAlive: live.workers - live.workersTerminated,
        channels: live.channels,
      };
    },
    intervalSites() {
      return [...live.intervals.values()];
    },
  };
})();
