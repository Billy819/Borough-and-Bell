/* ==========================================================================
   BOROUGH & BELL — application
   The timer is wall-clock based: it stores the epoch millisecond at which the
   current session ends and derives everything from Date.now(). It never counts
   down by decrementing a variable, so throttled background tabs, sleeping
   laptops and closed browsers cannot make it drift.
   ========================================================================== */
(function () {
'use strict';

/* ---------- tiny helpers ---------- */
var $  = function (s, r) { return (r || document).querySelector(s); };
var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
var SVGNS = 'http://www.w3.org/2000/svg';
var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
var TOTAL_BOROUGHS = window.BOROUGHS.length;          // 33
var HOURS_PER_BOROUGH = 1;                            // one hour, one borough
var TOTAL_HOURS = TOTAL_BOROUGHS * HOURS_PER_BOROUGH; // 33

/* ---------- storage ---------- */
var KEY = 'boroughAndBell.v1';
var store = {
  read: function () {
    try { return JSON.parse(localStorage.getItem(KEY) || 'null'); }
    catch (e) { return null; }
  },
  write: function (v) {
    try { localStorage.setItem(KEY, JSON.stringify(v)); return true; }
    catch (e) { return false; }
  },
  clear: function () { try { localStorage.removeItem(KEY); } catch (e) {} }
};

/* ---------- state ---------- */
var DEFAULTS = {
  settings: {
    focus: 60, short: 10, long: 40, every: 4,
    autoBreak: false, autoFocus: false,
    sound: true, volume: 70, notify: false, titleCountdown: true
  },
  focusMs: 0,            // total credited focused milliseconds
  unlocked: 0,           // boroughs restored
  seen: [],              // borough ids already announced
  completedSittings: 0,  // lifetime finished focus sessions
  cycle: 0,              // sittings finished in the current set
  tasks: [],
  activeTask: null,
  victoryShown: false,
  timer: { mode: 'focus', running: false, endAt: null, leftMs: null, lastTick: null }
};

var S = load();

function load() {
  var saved = store.read();
  var s = JSON.parse(JSON.stringify(DEFAULTS));
  if (saved && typeof saved === 'object') {
    if (saved.settings) for (var k in DEFAULTS.settings) {
      if (saved.settings[k] !== undefined) s.settings[k] = saved.settings[k];
    }
    ['focusMs','unlocked','completedSittings','cycle','victoryShown'].forEach(function (k) {
      if (saved[k] !== undefined && saved[k] !== null) s[k] = saved[k];
    });
    if (saved.activeTask !== undefined) s.activeTask = saved.activeTask;
    if (Array.isArray(saved.tasks)) s.tasks = saved.tasks;
    if (Array.isArray(saved.seen)) s.seen = saved.seen;
    if (saved.timer) for (var t in DEFAULTS.timer) {
      if (saved.timer[t] !== undefined) s.timer[t] = saved.timer[t];
    }
  }
  s.focusMs = Math.max(0, Number(s.focusMs) || 0);
  s.unlocked = clamp(Math.floor(Number(s.unlocked) || 0), 0, TOTAL_BOROUGHS);
  if (s.timer.leftMs === null || s.timer.leftMs === undefined) s.timer.leftMs = durMs(s.timer.mode, s.settings);
  return s;
}

var saveTimer = null;
var wiping = false;

/* Progress is the one thing that must never go backwards. If another tab (or a
   later session) has banked more time than this copy knows about, adopt the
   higher figures before writing, so a stale tab cannot erase real work. */
function adoptHigherProgress() {
  var cur = store.read();
  if (!cur) return false;
  var moved = false;
  if ((Number(cur.focusMs) || 0) > S.focusMs) { S.focusMs = Number(cur.focusMs); moved = true; }
  if ((Number(cur.unlocked) || 0) > S.unlocked) { S.unlocked = Number(cur.unlocked); moved = true; }
  if ((Number(cur.completedSittings) || 0) > S.completedSittings) {
    S.completedSittings = Number(cur.completedSittings); moved = true;
  }
  if (Array.isArray(cur.seen)) {
    cur.seen.forEach(function (id) { if (S.seen.indexOf(id) === -1) { S.seen.push(id); moved = true; } });
  }
  if (cur.victoryShown) S.victoryShown = true;
  return moved;
}

function save() {
  if (saveTimer || wiping) return;
  saveTimer = setTimeout(function () { saveTimer = null; saveNow(); }, 220);
}
function saveNow() {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  if (wiping) return;
  adoptHigherProgress();
  store.write(S);
}

/* ---------- durations ---------- */
function durMs(mode, st) {
  st = st || S.settings;
  var m = mode === 'short' ? st.short : mode === 'long' ? st.long : st.focus;
  return Math.max(1, m) * 60000;
}
function hoursDone() { return S.focusMs / 3600000; }
/* 1 hour, 2 hours — one borough an hour makes the singular common now */
function hrs(n) { return n + (n === 1 ? ' hour' : ' hours'); }
function progress()  { return clamp(hoursDone() / TOTAL_HOURS, 0, 1); }

/* ==========================================================================
   AUDIO
   ========================================================================== */
var Audio_ = {
  files: {
    focus:  'assets/audio/chime-focus.mp3',
    break:  'assets/audio/chime-break.mp3',
    unlock: 'assets/audio/unlock.mp3',
    victory:'assets/audio/victory.mp3',
    tick:   'assets/audio/tick.mp3'
  },
  el: {}, primed: false,
  init: function () {
    var self = this;
    Object.keys(this.files).forEach(function (k) {
      var a = new Audio(self.files[k]);
      a.preload = 'auto';
      self.el[k] = a;
    });
  },
  /* Browsers block audio until the user interacts. Nudge each clip once. */
  prime: function () {
    if (this.primed) return;
    this.primed = true;
    var self = this;
    Object.keys(this.el).forEach(function (k) {
      var a = self.el[k];
      var v = a.volume;
      a.volume = 0;
      var p = a.play();
      if (p && p.then) p.then(function () {
        a.pause(); a.currentTime = 0; a.volume = v;
      }).catch(function () { a.volume = v; });
      else { try { a.pause(); a.currentTime = 0; } catch (e) {} a.volume = v; }
    });
  },
  play: function (k, force) {
    if (!S.settings.sound && !force) return;
    var a = this.el[k];
    if (!a) return;
    try {
      a.pause(); a.currentTime = 0;
      a.volume = clamp(S.settings.volume / 100, 0, 1);
      var p = a.play();
      if (p && p.catch) p.catch(function () {});
    } catch (e) {}
  },
  stopAll: function () {
    var self = this;
    Object.keys(this.el).forEach(function (k) {
      try { self.el[k].pause(); self.el[k].currentTime = 0; } catch (e) {}
    });
  }
};

/* ==========================================================================
   TIMER ENGINE
   ========================================================================== */
var Engine = {
  worker: null,
  interval: null,

  start: function () {
    var t = S.timer;
    if (t.running) return;
    Audio_.prime();
    Audio_.stopAll();
    var now = Date.now();
    var left = (t.leftMs !== null && t.leftMs > 0) ? t.leftMs : durMs(t.mode);
    t.endAt = now + left;
    t.lastTick = now;
    t.running = true;
    t.leftMs = left;
    this.spin();
    askNotify();
    render();
    saveNow();
  },

  pause: function () {
    var t = S.timer;
    if (!t.running) return;
    var now = Date.now();
    accrue(now);
    t.leftMs = Math.max(0, t.endAt - now);
    t.running = false;
    t.endAt = null;
    this.halt();
    render();
    dispatchUnlocks();
    saveNow();
  },

  toggle: function () { S.timer.running ? this.pause() : this.start(); },

  reset: function () {
    var t = S.timer;
    if (t.running) accrue(Date.now());
    t.running = false; t.endAt = null;
    t.leftMs = durMs(t.mode);
    t.lastTick = null;
    this.halt();
    render();
    saveNow();
  },

  setMode: function (mode, keepRunning) {
    var t = S.timer;
    if (t.running) { accrue(Date.now()); }
    t.mode = mode;
    t.leftMs = durMs(mode);
    t.running = false; t.endAt = null; t.lastTick = null;
    this.halt();
    document.body.setAttribute('data-mode', mode);
    render();
    if (keepRunning) this.start(); else saveNow();
  },

  /* the heartbeat: a worker interval plus a main-thread interval, both of
     which only ever ask the wall clock what time it is */
  spin: function () {
    var self = this;
    if (!this.worker) {
      try {
        var src = "var id=null;onmessage=function(e){if(e.data==='go'){" +
                  "if(id)clearInterval(id);id=setInterval(function(){postMessage(1);},250);}" +
                  "else{clearInterval(id);id=null;}};";
        var url = URL.createObjectURL(new Blob([src], { type: 'application/javascript' }));
        this.worker = new Worker(url);
        this.worker.onmessage = function () { self.tick(); };
      } catch (e) { this.worker = null; }
    }
    if (this.worker) this.worker.postMessage('go');
    if (this.interval) clearInterval(this.interval);
    this.interval = setInterval(function () { self.tick(); }, 250);
  },

  halt: function () {
    if (this.worker) { try { this.worker.postMessage('stop'); } catch (e) {} }
    if (this.interval) { clearInterval(this.interval); this.interval = null; }
  },

  tick: function () {
    var t = S.timer;
    if (!t.running || !t.endAt) return;
    var now = Date.now();
    accrue(now);
    if (now >= t.endAt) { this.finish(); return; }
    t.leftMs = t.endAt - now;
    paintClock();
    /* refresh the banked-hours chip and the Thames bar once a second, so
       progress visibly grows while the sitting runs */
    var sec = Math.floor(now / 1000);
    if (sec !== lastHeaderSec) { lastHeaderSec = sec; paintHeader(); }
    dispatchUnlocks();
  },

  finish: function () {
    var t = S.timer;
    accrue(Date.now());          // credits time up to endAt, never beyond
    var was = t.mode;
    t.running = false; t.endAt = null; t.leftMs = 0; t.lastTick = null;
    this.halt();

    if (was === 'focus') {
      S.completedSittings++;
      S.cycle++;
      creditActiveTask();
    }

    Audio_.play(was === 'focus' ? 'focus' : 'break');
    notify(
      was === 'focus' ? 'Sitting complete' : 'Break over',
      was === 'focus'
        ? 'That hour is banked. Stand up and take your break.'
        : 'Time to begin the next sitting.'
    );

    /* choose what comes next */
    var next;
    if (was === 'focus') {
      next = (S.cycle % S.settings.every === 0) ? 'long' : 'short';
    } else {
      next = 'focus';
      if (was === 'long') S.cycle = 0;
    }
    t.mode = next;
    t.leftMs = durMs(next);
    document.body.setAttribute('data-mode', next);

    render();
    dispatchUnlocks();
    saveNow();

    var auto = (next === 'focus') ? S.settings.autoFocus : S.settings.autoBreak;
    if (auto) setTimeout(function () { Engine.start(); }, 1200);
  },

  /* recompute after the tab was hidden, the machine slept, or the page reloaded */
  sync: function () {
    var t = S.timer;
    if (!t.running || !t.endAt) return;
    var now = Date.now();
    accrue(now);
    if (now >= t.endAt) this.finish();
    else { t.leftMs = t.endAt - now; this.spin(); paintClock(); }
  }
};

/* credit focused time — the only path by which hours are earned */
function accrue(now) {
  var t = S.timer;
  if (!t.lastTick) { t.lastTick = now; return; }
  /* If the system clock has moved backwards (NTP correction, manual change)
     hold the marker where it is. Advancing it would let the same stretch of
     time be credited twice once the clock catches up again. */
  if (now <= t.lastTick) return;
  if (t.running && t.mode === 'focus' && t.endAt) {
    var cap = Math.min(now, t.endAt);
    var delta = cap - t.lastTick;
    if (delta > 0 && delta < 6 * 3600000) {   // sanity bound on forward jumps
      S.focusMs += delta;
      checkUnlocks();
    }
  }
  t.lastTick = now;
}

/* ==========================================================================
   UNLOCKS
   ========================================================================== */
var pending = [];
var booted = false;

function checkUnlocks() {
  var target = clamp(Math.floor(hoursDone() / HOURS_PER_BOROUGH), 0, TOTAL_BOROUGHS);
  while (S.unlocked < target) {
    S.unlocked++;
    var b = window.BOROUGHS[S.unlocked - 1];
    if (S.seen.indexOf(b.id) === -1) { S.seen.push(b.id); pending.push(b); }
  }
}

/* Presentation is decided separately from queueing: by the time this runs at
   the end of a sitting the timer has already stopped, so the borough gets the
   full announcement rather than a toast. */
function dispatchUnlocks() {
  if (!booted) return;
  if (pending.length) {
    if (S.timer.running) flushAsToasts();
    else flushUnlocks();
  }
  if (S.unlocked >= TOTAL_BOROUGHS && !S.victoryShown) {
    S.victoryShown = true;
    setTimeout(showVictory, pending.length ? 2400 : 600);
  }
}

function regionComplete(region) {
  var list = window.BOROUGHS.filter(function (b) { return b.region === region; });
  return list.every(function (b) { return b.order <= S.unlocked; });
}

function flushAsToasts() {
  while (pending.length) {
    var b = pending.shift();
    Audio_.play('unlock');
    confetti(16, window.REGIONS[b.region].color);
    toast(b.name + ' restored — borough ' + b.order + ' of ' + TOTAL_BOROUGHS);
  }
  paintAll();
}

function flushUnlocks() {
  if (!pending.length) return;
  if ($('.veil.is-on')) return;          // don't stack modals
  var b = pending.shift();
  Audio_.play('unlock');
  $('#unlockPlaque').innerHTML = plaqueHTML(b, true);
  $('#unlockName').textContent = b.name;
  $('#unlockText').textContent = b.fact;
  var done = regionComplete(b.region);
  var box = $('#unlockRegion');
  if (done) {
    box.hidden = false;
    box.innerHTML = '<b>' + window.REGIONS[b.region].name + ' is complete.</b> Every borough in the region has been restored.';
  } else { box.hidden = true; }
  $('#btnSeeBorough').dataset.id = b.id;
  openVeil('#veilUnlock');
  confetti(38, window.REGIONS[b.region].color);
  paintAll();
}

/* ==========================================================================
   STATS
   ========================================================================== */
var STATS = [
  { key:'hdi',   name:'Human Development', short:'HDI', from:0.712, to:0.985, ease:0.85, dp:3, unit:'HDI' },
  { key:'qol',   name:'Quality of Life',   short:'Quality of Life', from:41, to:99, ease:0.95, dp:0, unit:'/ 100' },
  { key:'health',name:'Healthcare',        from:38,    to:98,    ease:1.10, dp:0, unit:'/ 100' },
  { key:'safety',name:'Safety',            from:36,    to:97,    ease:1.28, dp:0, unit:'/ 100' },
  { key:'edu',   name:'Education',         from:44,    to:99,    ease:0.80, dp:0, unit:'/ 100' },
  { key:'tour',  name:'Tourism',           from:11.2,  to:54.0,  ease:1.35, dp:1, unit:'m visitors' },
  { key:'pop',   name:'Population',        from:4.10,  to:9.85,  ease:0.90, dp:2, unit:'million' },
  { key:'gdp',   name:'Gross Domestic Product', short:'GDP', from:176, to:682, ease:1.20, dp:0, unit:'bn', pre:'£' }
];
var BANDS = [
  [0.10,'Basic',1],[0.28,'Fair',2],[0.48,'Good',3],
  [0.68,'Very Good',4],[0.88,'Excellent',5],[2,'World-Leading',6]
];
function bandOf(e) {
  for (var i = 0; i < BANDS.length; i++) if (e < BANDS[i][0]) return BANDS[i];
  return BANDS[BANDS.length - 1];
}
function statValue(st) {
  var e = Math.pow(progress(), st.ease);
  return { e: e, v: st.from + (st.to - st.from) * e };
}
function fmtStat(st, v) {
  var n = v.toFixed(st.dp);
  if (st.dp === 0) n = Number(n).toLocaleString('en-GB');
  return (st.pre || '') + n;
}

/* ==========================================================================
   RENDERING
   ========================================================================== */
function pad(n) { return (n < 10 ? '0' : '') + n; }
function mmss(ms) {
  var s = Math.max(0, Math.ceil(ms / 1000));
  /* a 60-minute sitting should read 60:00, not 1:00:00 — only very long
     sessions get an hours field, and they stay inside the dial */
  if (s < 6000) { return pad(Math.floor(s / 60)) + ':' + pad(s % 60); }
  var h = Math.floor(s / 3600); s -= h * 3600;
  return h + ':' + pad(Math.floor(s / 60)) + ':' + pad(s % 60);
}
var lastHeaderSec = 0;
var MODE_LABEL = { focus: 'Time to focus', short: 'Take ten', long: 'Rest properly' };
var RING_C = 578.05;

function paintClock() {
  var t = S.timer;
  var total = durMs(t.mode);
  var left = t.running && t.endAt ? Math.max(0, t.endAt - Date.now())
                                  : (t.leftMs === null ? total : t.leftMs);
  $('#digits').textContent = mmss(left);
  $('#dialLabel').textContent = t.running ? MODE_LABEL[t.mode] : (left <= 0 ? 'Session over' : 'Ready');
  var frac = total > 0 ? clamp(left / total, 0, 1) : 0;
  $('#ring').style.strokeDashoffset = String(RING_C * (1 - frac));
  $('#dial').classList.toggle('is-done', left <= 0 && !t.running);
  $('#dial').classList.toggle('is-running', !!t.running);
  $('#btnStart').textContent = t.running ? 'Pause' : (left < total && left > 0 ? 'Resume' : 'Start');
  $('#btnStart').classList.toggle('is-running', t.running);

  if (S.settings.titleCountdown && t.running) {
    document.title = mmss(left) + ' · ' + (t.mode === 'focus' ? 'Sitting' : 'Break') + ' — Borough & Bell';
  } else {
    document.title = 'Borough & Bell — Greater London Focus Chronometer';
  }
}

var lastWholeHour = -1;
function paintHeader() {
  var chip = $('.hours-chip');
  $('#chipHours').textContent = hoursDone().toFixed(1);
  var whole = Math.floor(hoursDone());
  if (lastWholeHour === -1) { lastWholeHour = whole; }
  else if (whole > lastWholeHour) {
    lastWholeHour = whole;
    chip.classList.add('is-bumped');
    setTimeout(function () { chip.classList.remove('is-bumped'); }, 420);
  }
  $('#thamesCount').textContent = String(S.unlocked);
  $('#thamesFill').style.width = (progress() * 100).toFixed(2) + '%';
  var n = (S.cycle % S.settings.every) + 1;
  $('#clockNote').innerHTML = S.timer.mode === 'focus'
    ? 'Sitting <b>' + n + '</b> of ' + S.settings.every + ' · a long break follows the last'
    : (S.timer.mode === 'long'
        ? 'Long break · <b>' + S.settings.long + '</b> minutes away from the desk'
        : 'Short break · back in <b>' + S.settings.short + '</b> minutes');
  $$('.mode-btn').forEach(function (b) {
    b.setAttribute('aria-selected', b.dataset.mode === S.timer.mode ? 'true' : 'false');
  });
}

/* ---------- tasks ---------- */
function paintTasks() {
  var wrap = $('#taskList');
  wrap.innerHTML = '';
  if (!S.tasks.length) {
    wrap.innerHTML = '<p style="color:var(--stone-3);font-size:.88rem;text-align:center;padding:.6rem 0">' +
      'Nothing listed yet. One honest task is a good start.</p>';
    return;
  }
  S.tasks.forEach(function (task) {
    var el = document.createElement('div');
    el.className = 'task' + (task.done ? ' is-done' : '') + (S.activeTask === task.id ? ' is-active' : '');
    el.innerHTML =
      '<button class="task-check" aria-label="Mark ' + esc(task.name) + ' as done">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>' +
      '</button>' +
      '<button class="task-body">' +
        '<span class="task-name">' + esc(task.name) + '</span>' +
        '<span class="task-meta">' + (task.done_est || 0) + ' / ' + task.est + ' sittings' +
          (S.activeTask === task.id ? ' · working on this' : '') + '</span>' +
      '</button>' +
      '<button class="task-x" aria-label="Delete ' + esc(task.name) + '">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>' +
      '</button>';
    el.querySelector('.task-check').onclick = function () {
      task.done = !task.done;
      if (task.done && S.activeTask === task.id) S.activeTask = null;
      paintTasks(); save();
    };
    el.querySelector('.task-body').onclick = function () {
      S.activeTask = (S.activeTask === task.id) ? null : task.id;
      paintTasks(); save();
    };
    el.querySelector('.task-x').onclick = function () {
      S.tasks = S.tasks.filter(function (x) { return x.id !== task.id; });
      if (S.activeTask === task.id) S.activeTask = null;
      paintTasks(); save();
    };
    wrap.appendChild(el);
  });
}
function creditActiveTask() {
  var t = S.tasks.filter(function (x) { return x.id === S.activeTask; })[0];
  if (!t) return;
  t.done_est = (t.done_est || 0) + 1;
  if (t.done_est >= t.est) t.done = true;
  paintTasks();
}
function esc(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c];
  });
}

/* ---------- map ---------- */
function buildMap() {
  var box = $('#mapBox');
  var svg = document.createElementNS(SVGNS, 'svg');
  svg.setAttribute('viewBox', window.MAP_VIEWBOX);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.setAttribute('role', 'group');
  svg.setAttribute('aria-label', 'Map of the 32 London boroughs and the City of London');
  svg.id = 'londonMap';

  window.BOROUGHS.slice().sort(function (a, b) { return a.order - b.order; }).forEach(function (b) {
    var p = document.createElementNS(SVGNS, 'path');
    p.setAttribute('d', window.MAP_PATHS[b.id]);
    p.setAttribute('class', 'boro');
    p.setAttribute('tabindex', '0');
    p.setAttribute('role', 'button');
    p.dataset.id = b.id;
    p.dataset.region = b.region;
    var open = function () { openBorough(b.id); };
    p.addEventListener('click', open);
    p.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
    });
    p.addEventListener('mousemove', function (e) {
      var r = box.getBoundingClientRect();
      var tip = $('#mapTip');
      tip.textContent = b.order <= S.unlocked ? b.name : b.name + ' · locked';
      tip.style.left = (e.clientX - r.left) + 'px';
      tip.style.top  = (e.clientY - r.top) + 'px';
      tip.classList.add('is-on');
    });
    p.addEventListener('mouseleave', function () { $('#mapTip').classList.remove('is-on'); });
    svg.appendChild(p);
  });
  box.appendChild(svg);

  var key = $('#mapKey');
  Object.keys(window.REGIONS).forEach(function (r) {
    var d = window.REGIONS[r];
    key.insertAdjacentHTML('beforeend',
      '<span class="key-item"><span class="key-dot" style="background:' + d.color + '"></span>' + d.name + '</span>');
  });
  key.insertAdjacentHTML('beforeend',
    '<span class="key-item"><span class="key-dot" style="background:rgba(243,238,226,.16)"></span>Not yet restored</span>');
}

function paintMap() {
  $$('#londonMap .boro').forEach(function (p) {
    var b = byId(p.dataset.id);
    p.classList.toggle('is-unlocked', b.order <= S.unlocked);
    p.setAttribute('aria-label', b.name + (b.order <= S.unlocked
      ? ', restored' : ', locked until ' + hrs(b.hours)));
  });
}
function byId(id) {
  return window.BOROUGHS.filter(function (b) { return b.id === id; })[0];
}

function openBorough(id) {
  var b = byId(id);
  if (!b) return;
  $$('#londonMap .boro').forEach(function (p) {
    p.classList.toggle('is-open', p.dataset.id === id);
  });
  var det = $('#detail');
  var reg = window.REGIONS[b.region];

  if (b.order > S.unlocked) {
    det.innerHTML =
      '<div class="detail-head">' +
        '<span class="detail-region" style="background:' + reg.color + '">' + reg.name + '</span>' +
        '<h3>' + esc(b.name) + '</h3>' +
        '<span class="detail-strap">Borough ' + b.order + ' of ' + TOTAL_BOROUGHS + '</span>' +
      '</div>' +
      '<div class="locked-note">' +
        '<div class="lock-ico">&#128274;</div>' +
        '<h4>Not yet restored</h4>' +
        '<p>' + esc(b.name) + ' joins the map at <b>' + hrs(b.hours) + '</b> of focused work.<br>' +
        'You have done ' + hoursDone().toFixed(1) + ' — that is ' +
        Math.max(0, b.hours - hoursDone()).toFixed(1) + ' hours to go.</p>' +
      '</div>';
    return;
  }

  var shots = b.photos.map(function (ph) {
    return '<figure class="shot"><img src="' + ph.src + '" alt="' + esc(ph.caption) +
           '" loading="lazy"><figcaption>' + esc(ph.caption) + '</figcaption></figure>';
  }).join('');
  var paras = b.text.map(function (p) { return '<p>' + esc(p) + '</p>'; }).join('');

  det.innerHTML =
    '<div class="detail-head">' +
      '<span class="detail-region" style="background:' + reg.color + '">' + reg.name + '</span>' +
      '<h3>' + esc(b.name) + '</h3>' +
      '<span class="detail-strap">' + esc(b.strapline) + '</span>' +
    '</div>' +
    '<div class="detail-scroll">' + shots + paras +
      '<div class="fact"><strong>Worth knowing</strong><span>' + esc(b.fact) + '</span></div>' +
    '</div>';
}

/* ---------- plaques ---------- */
function plaqueHTML(b, forceOpen) {
  var open = forceOpen || b.order <= S.unlocked;
  if (!open) {
    return '<div class="plaque is-locked"><span class="pl-no">No. ' + b.order + '</span>' +
           '<span class="pl-name">Locked</span>' +
           '<span class="pl-hours">' + hrs(b.hours) + '</span></div>';
  }
  return '<div class="plaque" data-id="' + b.id + '">' +
         '<span class="pl-no">No. ' + b.order + '</span>' +
         '<span class="pl-name">' + esc(b.name) + '</span>' +
         '<span class="pl-strap">' + esc(b.strapline) + '</span></div>';
}
var plaquesDrawnAt = -1;
function paintPlaques() {
  var g = $('#plaqueGrid');
  if (plaquesDrawnAt !== S.unlocked || !g.children.length) {
    plaquesDrawnAt = S.unlocked;
    g.innerHTML = window.BOROUGHS.map(function (b) { return plaqueHTML(b); }).join('');
    $$('.plaque[data-id]', g).forEach(function (el) {
      el.onclick = function () { goto('map'); openBorough(el.dataset.id); };
    });
  }
  $('#plaqueCount').textContent = S.unlocked + ' of ' + TOTAL_BOROUGHS +
    ' restored · next at ' + (S.unlocked < TOTAL_BOROUGHS
      ? hrs(window.BOROUGHS[S.unlocked].hours) : 'complete');
}

/* ---------- report ---------- */
function paintReport() {
  $('#statGrid').innerHTML = STATS.map(function (st) {
    var r = statValue(st), band = bandOf(r.e);
    return '<div class="panel stat">' +
      '<div class="stat-top"><span class="stat-name">' + st.name + '</span></div>' +
      '<div class="stat-top"><span class="stat-val">' + fmtStat(st, r.v) +
        '<span class="stat-unit">' + st.unit + '</span></span></div>' +
      '<div class="stat-bed"><div class="stat-bar" style="width:' + (r.e * 100).toFixed(1) + '%"></div></div>' +
      '<div class="stat-rate rate-' + band[2] + '">' + band[1] + '</div>' +
    '</div>';
  }).join('');

  $('#regionGrid').innerHTML = Object.keys(window.REGIONS).map(function (k) {
    var d = window.REGIONS[k];
    var list = window.BOROUGHS.filter(function (b) { return b.region === k; });
    var got = list.filter(function (b) { return b.order <= S.unlocked; }).length;
    var done = got === list.length;
    return '<div class="panel region' + (done ? ' is-done' : '') + '" style="--rc:' + d.color + '">' +
      '<h4>' + d.name + '</h4>' +
      '<div class="region-state">' + (done ? 'Complete' : got + ' of ' + list.length + ' boroughs') + '</div>' +
      '<p>' + d.blurb + '</p>' +
      '<div class="region-bed"><div class="region-bar" style="width:' + (got / list.length * 100) + '%"></div></div>' +
    '</div>';
  }).join('');
}

function paintAll() { paintHeader(); paintMap(); paintPlaques(); paintReport(); }
function render() { paintClock(); paintHeader(); paintMap(); paintPlaques(); paintReport(); }

/* ==========================================================================
   VICTORY
   ========================================================================== */
function showVictory() {
  Audio_.play('victory');
  $('#vicStats').innerHTML = STATS.map(function (st) {
    var r = statValue(st);
    return '<div class="vic-stat"><b>' + fmtStat(st, r.v) + '</b><span>' + (st.short || st.name) + '</span></div>';
  }).join('');
  closeAllVeils();
  openVeil('#veilVictory');
  confetti(140);
  setTimeout(function () { confetti(90); }, 900);
}

/* ---------- confetti: blue-plaque roundels and brass sparks ---------- */
function confetti(count, accent) {
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var colours = ['#14498C', '#F0C64B', '#F5F1E6', '#5FB0EC'];
  if (accent) colours.push(accent, accent);
  var box = document.createElement('div');
  box.className = 'confetti';
  var html = '';
  for (var i = 0; i < count; i++) {
    var roundel = Math.random() < 0.4;
    var size = roundel ? 9 + Math.random() * 9 : 5 + Math.random() * 7;
    html += '<i class="' + (roundel ? 'roundel' : 'spark') + '" style="' +
      'left:' + (Math.random() * 100).toFixed(2) + 'vw;' +
      '--sz:' + size.toFixed(1) + 'px;' +
      '--cf:' + colours[(Math.random() * colours.length) | 0] + ';' +
      '--dx:' + (Math.random() * 200 - 100).toFixed(0) + 'px;' +
      '--spin:' + (Math.random() * 1080 - 540).toFixed(0) + 'deg;' +
      '--dur:' + (2.4 + Math.random() * 2.2).toFixed(2) + 's;' +
      '--del:' + (Math.random() * 0.7).toFixed(2) + 's"></i>';
  }
  box.innerHTML = html;
  document.body.appendChild(box);
  setTimeout(function () { box.remove(); }, 6000);
}

/* ==========================================================================
   NOTIFICATIONS & TOASTS
   ========================================================================== */
function askNotify() {
  if (!S.settings.notify || !('Notification' in window)) return;
  if (Notification.permission === 'default') {
    try { Notification.requestPermission(); } catch (e) {}
  }
}
function notify(title, body) {
  if (!S.settings.notify || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  try { new Notification(title, { body: body, icon: 'assets/apple-touch-icon.png', tag: 'bandb' }); }
  catch (e) {}
}
function toast(msg) {
  var rail = $('#toastRail');
  var el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>' +
    '<path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg><span>' + esc(msg) + '</span>';
  rail.appendChild(el);
  setTimeout(function () {
    el.classList.add('is-out');
    setTimeout(function () { el.remove(); }, 320);
  }, 4600);
}

/* ==========================================================================
   VEILS / NAV
   ========================================================================== */
function openVeil(sel) { $(sel).classList.add('is-on'); }
function closeVeil(el) { if (el) el.classList.remove('is-on'); }
function closeAllVeils() { $$('.veil.is-on').forEach(closeVeil); }

var VIEWS = ['timer','map','plaque','report','guide'];
function goto(name) {
  VIEWS.forEach(function (v) {
    var on = v === name;
    var view = $('#view-' + v), tab = $('#tab-' + v);
    view.classList.toggle('is-on', on);
    view.hidden = !on;
    tab.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ==========================================================================
   SETTINGS
   ========================================================================== */
var STEP_LIMITS = { focus:[1,180], short:[1,60], long:[1,120], every:[1,12] };
var STEP_INPUT  = { focus:'#setFocus', short:'#setShort', long:'#setLong', every:'#setEvery' };

function fillSettings() {
  $('#setFocus').value  = S.settings.focus;
  $('#setShort').value  = S.settings.short;
  $('#setLong').value   = S.settings.long;
  $('#setEvery').value  = S.settings.every;
  $('#setVolume').value = S.settings.volume;
  setToggle('#setAutoBreak', S.settings.autoBreak);
  setToggle('#setAutoFocus', S.settings.autoFocus);
  setToggle('#setSound',     S.settings.sound);
  setToggle('#setNotify',    S.settings.notify);
  setToggle('#setTitle2',    S.settings.titleCountdown);
}
function setToggle(sel, on) { $(sel).setAttribute('aria-pressed', on ? 'true' : 'false'); }

function applyDuration(key, value) {
  var lim = STEP_LIMITS[key];
  value = clamp(Math.round(Number(value) || lim[0]), lim[0], lim[1]);
  S.settings[key] = value;
  $(STEP_INPUT[key]).value = value;
  /* a length change refreshes the current session only when it is not running */
  if (!S.timer.running && key !== 'every' && key === S.timer.mode) {
    S.timer.leftMs = durMs(key);
  }
  render(); saveNow();
}

function wireSettings() {
  $$('.stepper').forEach(function (st) {
    var key = st.dataset.step;
    var input = st.querySelector('input');
    $$('button', st).forEach(function (btn) {
      btn.addEventListener('click', function () {
        var dir = Number(btn.dataset.dir);
        var cur = Number(input.value) || 0;
        var stepBy = 1;
        if (key !== 'every') stepBy = (cur >= 10 || (dir > 0 && cur >= 5)) ? 5 : 1;
        applyDuration(key, cur + dir * stepBy);
        Audio_.play('tick');
      });
    });
    input.addEventListener('change', function () { applyDuration(key, input.value); });
    input.addEventListener('blur',   function () { applyDuration(key, input.value); });
  });

  $$('.preset').forEach(function (p) {
    p.addEventListener('click', function () {
      var v = p.dataset.preset.split(',').map(Number);
      S.settings.focus = v[0]; S.settings.short = v[1];
      S.settings.long = v[2];  S.settings.every = v[3];
      if (!S.timer.running) S.timer.leftMs = durMs(S.timer.mode);
      fillSettings(); render(); saveNow();
      toast('Lengths set to ' + v[0] + ' / ' + v[1] + ' / ' + v[2] + ' minutes');
    });
  });

  function toggle(sel, key, after) {
    $(sel).addEventListener('click', function () {
      S.settings[key] = !S.settings[key];
      setToggle(sel, S.settings[key]);
      if (after) after(S.settings[key]);
      saveNow();
    });
  }
  toggle('#setAutoBreak', 'autoBreak');
  toggle('#setAutoFocus', 'autoFocus');
  toggle('#setSound', 'sound', function (on) { if (on) { Audio_.prime(); Audio_.play('tick'); } });
  toggle('#setNotify', 'notify', function (on) {
    if (on && 'Notification' in window) {
      try {
        Notification.requestPermission().then(function (r) {
          if (r !== 'granted') {
            S.settings.notify = false; setToggle('#setNotify', false);
            toast('Your browser blocked notifications'); saveNow();
          } else toast('Notifications on');
        }).catch(function () {});
      } catch (e) {}
    }
  });
  toggle('#setTitle2', 'titleCountdown', function () { paintClock(); });

  $('#setVolume').addEventListener('input', function () {
    S.settings.volume = Number(this.value); save();
  });
  $('#setVolume').addEventListener('change', function () { Audio_.prime(); Audio_.play('tick', true); });
  $('#btnTestBell').addEventListener('click', function () { Audio_.prime(); Audio_.play('focus', true); });

  $('#btnWipe').addEventListener('click', function () {
    if (!confirm('Clear all 33 hours of progress, every borough and every task?\n\nThis cannot be undone.')) return;
    wiping = true;                 // block every later save, including beforeunload
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    Engine.halt();
    store.clear();
    location.reload();
  });
}

/* ==========================================================================
   WIRING
   ========================================================================== */
function wire() {
  VIEWS.forEach(function (v) {
    $('#tab-' + v).addEventListener('click', function () { goto(v); });
  });

  $('#btnStart').addEventListener('click', function () { Engine.toggle(); });
  $('#btnReset').addEventListener('click', function () { Engine.reset(); });
  $('#btnSkip').addEventListener('click', function () {
    if (confirm('Skip the rest of this session?\n\nOnly the minutes you have actually worked will be counted.')) {
      if (S.timer.running) { S.timer.endAt = Date.now(); Engine.finish(); }
      else { Engine.finish(); }
    }
  });
  $$('.mode-btn').forEach(function (b) {
    b.addEventListener('click', function () {
      if (S.timer.running && !confirm('The timer is running. Switch anyway?')) return;
      Engine.setMode(b.dataset.mode, false);
    });
  });

  var form = $('#taskForm'), addBtn = $('#btnAddTask');
  function openForm(on) {
    form.classList.toggle('is-on', on);
    addBtn.style.display = on ? 'none' : '';
    if (on) $('#taskName').focus();
  }
  addBtn.addEventListener('click', function () { openForm(true); });
  $('#btnTaskCancel').addEventListener('click', function () {
    $('#taskName').value = ''; $('#taskEst').value = 1; openForm(false);
  });
  function saveTask() {
    var name = $('#taskName').value.trim();
    if (!name) { $('#taskName').focus(); return; }
    var est = clamp(Math.round(Number($('#taskEst').value) || 1), 1, 20);
    var id = 't' + Date.now() + Math.floor(Math.random() * 1000);
    S.tasks.push({ id:id, name:name, est:est, done_est:0, done:false });
    if (!S.activeTask) S.activeTask = id;
    $('#taskName').value = ''; $('#taskEst').value = 1;
    openForm(false); paintTasks(); saveNow();
  }
  $('#btnTaskSave').addEventListener('click', saveTask);
  $('#taskName').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); saveTask(); }
    if (e.key === 'Escape') { openForm(false); }
  });
  $('#btnClearDone').addEventListener('click', function () {
    S.tasks = S.tasks.filter(function (t) { return !t.done; });
    paintTasks(); saveNow();
  });

  $('#btnSettings').addEventListener('click', function () { fillSettings(); openVeil('#veilSettings'); });
  $$('[data-close]').forEach(function (b) {
    b.addEventListener('click', function () {
      closeVeil(b.closest('.veil'));
      setTimeout(dispatchUnlocks, 240);
    });
  });
  $$('.veil').forEach(function (v) {
    v.addEventListener('click', function (e) {
      if (e.target === v) { closeVeil(v); setTimeout(dispatchUnlocks, 240); }
    });
  });
  $('#btnSeeBorough').addEventListener('click', function () {
    closeAllVeils(); goto('map'); openBorough(this.dataset.id);
    setTimeout(dispatchUnlocks, 400);
  });
  $('#btnVicReport').addEventListener('click', function () { closeAllVeils(); goto('report'); });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { closeAllVeils(); return; }
    var t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if ($('.veil.is-on')) return;
    if (e.key === ' ') { e.preventDefault(); Engine.toggle(); }
    else if (e.key === 'r' || e.key === 'R') Engine.reset();
    else if (e.key === 's' || e.key === 'S') { if (S.timer.running) { S.timer.endAt = Date.now(); Engine.finish(); } }
    else if (e.key === '1') Engine.setMode('focus');
    else if (e.key === '2') Engine.setMode('short');
    else if (e.key === '3') Engine.setMode('long');
  });

  /* keep honest across sleep, tab switches and reloads */
  window.addEventListener('storage', function (e) {
    if (e.key !== KEY || wiping) return;
    if (adoptHigherProgress()) { checkUnlocks(); render(); }
  });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) Engine.sync(); });
  window.addEventListener('focus', function () { Engine.sync(); });
  window.addEventListener('pageshow', function () { Engine.sync(); });
  window.addEventListener('online',  function () { Engine.sync(); });
  window.addEventListener('beforeunload', function () {
    if (S.timer.running) accrue(Date.now());
    saveNow();
  });
  ['click','keydown','touchstart'].forEach(function (ev) {
    window.addEventListener(ev, function () { Audio_.prime(); }, { once: true, passive: true });
  });
}

/* ==========================================================================
   BOOT
   ========================================================================== */
function boot() {
  Audio_.init();
  document.body.setAttribute('data-mode', S.timer.mode);
  buildMap();
  wire();
  wireSettings();
  fillSettings();
  paintTasks();

  /* catch up on anything that elapsed while the page was closed */
  if (S.timer.running && S.timer.endAt) {
    var now = Date.now();
    accrue(now);
    if (now >= S.timer.endAt) { booted = true; Engine.finish(); }
    else { Engine.spin(); }
  } else {
    checkUnlocks();
  }
  booted = true;
  render();
  setTimeout(dispatchUnlocks, 700);
  setInterval(saveNow, 15000);   // periodic safety save
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();

})();
