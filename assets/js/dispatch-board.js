/* ============================================================
   DISPATCH BOARD — dispatch-board.js
   Reads from:
     1. localStorage  (runtime edits via the edit modal)
     2. #dispatch-config  (JSON script tag — default values)
   ============================================================ */

(function () {
  'use strict';

  var STORAGE_KEY  = 'tcwf-dispatch-override';
  var SIMBRIEF_KEY = 'tcwf-simbrief-user';
  var AUTH_KEY     = 'tcwf-dispatch-auth';

  /* These must be initialised before renderBoard() is called */
  var FLAP_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 /-.';
  var STATUS_CLASSES = [
    'dep-s-good', 'dep-s-warn', 'dep-s-bad',
    'dep-s-enroute', 'dep-s-boarding', 'dep-s-arrived'
  ];

  var configNode = document.getElementById('dispatch-config');
  if (!configNode) return;

  var baseConfig = parseConfig(configNode.textContent);
  var overlayMode = isOverlayMode();

  /* ── Overlay mode setup ──────────────────────────── */
  if (overlayMode) {
    document.documentElement.setAttribute('data-theme', 'dark');
    document.documentElement.classList.add('dispatch-overlay-mode');
    document.body.classList.add('dispatch-overlay-mode');
  }

  /* ── Merge localStorage overrides on top of base config ── */
  var state = mergeOverrides(baseConfig);

  /* ── Initial render ──────────────────────────────── */
  hydrateOverlayTools();
  renderBoard(state, false);
  updateClocks();
  updateLegTiming(state.currentLeg);

  /* ── Live ticking ────────────────────────────────── */
  setInterval(updateClocks, 1000);
  setInterval(function () { updateLegTiming(state.currentLeg); }, 1000);

  /* ── Controls ────────────────────────────────────── */
  bindPinModal();
  bindControls();
  bindModal();
  bindSimBrief();
  bindKeyboard();

  /* ============================================================
     PARSE / MERGE
  ============================================================ */

  function parseConfig(raw) {
    var fallback = {
      eventName: 'WorldFlight Team Covey',
      status: 'Standby',
      lastUpdatedUtc: null,
      currentLeg: {
        leg: '----', flight: '----',
        from: '----', fromName: '',
        to: '----', toName: '',
        aircraft: '----', aircraftName: '',
        distanceNm: null, cruiseAlt: '-----',
        route: '',
        pf: '---', pm: '---',
        etdUtc: null, etaUtc: null
      },
      nextLegs: [],
      crew: [],
      systems: [],
      notes: []
    };

    try {
      var parsed = JSON.parse(raw || '{}');
      return {
        eventName: parsed.eventName || fallback.eventName,
        pin: String(parsed.pin || '1234'),
        status: parsed.status || fallback.status,
        lastUpdatedUtc: parsed.lastUpdatedUtc || null,
        currentLeg: Object.assign({}, fallback.currentLeg, parsed.currentLeg || {}),
        nextLegs: Array.isArray(parsed.nextLegs) ? parsed.nextLegs : [],
        crew: Array.isArray(parsed.crew) ? parsed.crew : [],
        systems: Array.isArray(parsed.systems) ? parsed.systems : [],
        notes: Array.isArray(parsed.notes) ? parsed.notes : []
      };
    } catch (_) {
      return fallback;
    }
  }

  function mergeOverrides(base) {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return deepClone(base);
      var overrides = JSON.parse(raw);
      var merged = deepClone(base);
      if (overrides.status) merged.status = overrides.status;
      if (overrides.currentLeg) {
        merged.currentLeg = Object.assign({}, base.currentLeg, overrides.currentLeg);
      }
      return merged;
    } catch (_) {
      return deepClone(base);
    }
  }

  function saveOverrides() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        status: state.status,
        currentLeg: state.currentLeg
      }));
    } catch (_) {}
  }

  function clearOverrides() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
  }

  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  /* ============================================================
     BOARD RENDERING
  ============================================================ */

  function rndChar() {
    return FLAP_CHARS[Math.floor(Math.random() * FLAP_CHARS.length)];
  }

  function animateFlap(el, target) {
    if (!el) return;
    var upper = String(target || '---').toUpperCase();
    var steps = 10;
    var stepMs = 48;
    var step = 0;
    clearInterval(el._flap);
    el._flap = setInterval(function () {
      if (step >= steps) {
        el.textContent = upper;
        clearInterval(el._flap);
        return;
      }
      var progress = step / steps;
      el.textContent = upper.split('').map(function (ch, i) {
        if (i < Math.floor(progress * upper.length)) return ch;
        return ch === ' ' ? ' ' : rndChar();
      }).join('');
      step++;
    }, stepMs);
  }

  function setText(id, val) {
    var el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  function setFlap(id, val) {
    var el = document.getElementById(id);
    if (el) animateFlap(el, val);
  }

  function setFlapDirect(id, val) {
    var el = document.getElementById(id);
    if (el) el.textContent = String(val || '---').toUpperCase();
  }

  function renderBoard(data, animate) {
    var leg = data.currentLeg || {};
    var anim = animate ? setFlap : setFlapDirect;

    /* Board header */
    setText('dispatch-event-name', (data.eventName || 'WORLDFLIGHT TEAM COVEY').toUpperCase());

    /* Status badge */
    var statusEl = document.getElementById('dispatch-event-status');
    if (statusEl) {
      statusEl.textContent = (data.status || 'STANDBY').toUpperCase();
      applyStatusClass(statusEl, data.status);
    }

    /* Status select sync */
    var selectEl = document.getElementById('status-select');
    if (selectEl) selectEl.value = data.status || 'Standby';

    /* Main row */
    anim('d-flight',  leg.flight || leg.callsign || leg.leg || '----');
    anim('d-origin',  leg.from || '----');
    anim('d-dest',    leg.to   || '----');
    anim('d-aircraft', leg.aircraft || '----');

    setFlapDirect('d-origin-name',  leg.fromName || '');
    setFlapDirect('d-dest-name',    leg.toName   || '');
    setFlapDirect('d-aircraft-name', leg.aircraftName || '');

    /* Times row */
    anim('d-etd',  formatHHMM(leg.etdUtc));
    anim('d-eta',  formatHHMM(leg.etaUtc));
    anim('d-alt',  leg.cruiseAlt || '-----');
    anim('d-dist', leg.distanceNm ? leg.distanceNm + ' NM' : '----');

    /* Crew row */
    anim('d-pf', leg.pf || '---');
    anim('d-pm', leg.pm || '---');

    /* Route row */
    setFlapDirect('d-route', leg.route || '---');

    /* Secondary cards */
    renderSystemStrip(data.systems || []);
    renderNextLegs(data.nextLegs || []);
    renderCrew(data.crew || []);
    renderNotes(data.notes || []);

    /* Last updated */
    if (data.lastUpdatedUtc) {
      setText('dispatch-last-updated', 'Updated ' + formatUtcDate(data.lastUpdatedUtc));
    }
  }

  /* ── Status class helper ─────────────────────────── */
  function applyStatusClass(el, text) {
    STATUS_CLASSES.forEach(function (c) { el.classList.remove(c); });
    el.classList.remove('is-good', 'is-warn', 'is-bad');
    var cls = statusClassForText(text);
    if (cls) el.classList.add(cls);
  }

  function statusClassForText(text) {
    var v = String(text || '').toLowerCase();
    if (!v) return '';
    if (/arrived|landed/.test(v))                             return 'dep-s-arrived';
    if (/en.?route|airborne|cruise|departing|departed/.test(v)) return 'dep-s-enroute';
    if (/boarding|ready/.test(v))                             return 'dep-s-boarding';
    if (/delay|hold/.test(v))                                 return 'dep-s-bad';
    if (/live|online|connected|stable/.test(v))               return 'dep-s-good';
    if (/standby|soon/.test(v))                               return 'dep-s-warn';
    return '';
  }

  /* ── Secondary cards ─────────────────────────────── */
  function renderSystemStrip(items) {
    var el = document.getElementById('dispatch-system-strip');
    if (!el) return;
    el.innerHTML = '';
    if (!items.length) return;
    items.forEach(function (item) {
      var chip = document.createElement('span');
      chip.className = 'dispatch-system-chip ' + statusClassForText(item.state || '').replace('dep-s-', 'is-');
      chip.textContent = (item.label || 'System') + ': ' + (item.state || 'Unknown');
      el.appendChild(chip);
    });
  }

  function renderNextLegs(legs) {
    var el = document.getElementById('dispatch-next-legs');
    if (!el) return;
    el.innerHTML = '';
    if (!legs.length) { el.textContent = 'No upcoming legs configured.'; return; }
    legs.forEach(function (leg) {
      var row = document.createElement('div');
      row.className = 'dispatch-leg-row';
      var title = document.createElement('strong');
      title.textContent = (leg.leg ? leg.leg + '  ' : '') + (leg.from || '----') + ' → ' + (leg.to || '----');
      var time = document.createElement('span');
      time.textContent = leg.etdUtc ? 'ETD ' + formatHHMM(leg.etdUtc) + ' UTC' : '';
      row.appendChild(title);
      row.appendChild(time);
      el.appendChild(row);
    });
  }

  function renderCrew(crew) {
    var el = document.getElementById('dispatch-crew-list');
    if (!el) return;
    el.innerHTML = '';
    if (!crew.length) { el.textContent = 'Crew roster not configured.'; return; }
    crew.forEach(function (member) {
      var row = document.createElement('div');
      row.className = 'dispatch-crew-row';
      var role = document.createElement('span');
      role.textContent = member.role || 'Role';
      var name = document.createElement('strong');
      name.textContent = member.name || 'TBA';
      row.appendChild(role);
      row.appendChild(name);
      el.appendChild(row);
    });
  }

  function renderNotes(notes) {
    var list = document.getElementById('dispatch-notes-list');
    if (!list) return;
    list.innerHTML = '';
    if (!notes.length) {
      var empty = document.createElement('li');
      empty.textContent = 'No ops notes yet.';
      list.appendChild(empty);
      return;
    }
    notes.forEach(function (note) {
      var li = document.createElement('li');
      li.textContent = note;
      list.appendChild(li);
    });
  }

  /* ============================================================
     CLOCKS & TIMING
  ============================================================ */

  function updateClocks() {
    var now = new Date();
    var utcEl = document.querySelector('[data-dispatch-clock="utc"]');
    var aedtEl = document.querySelector('[data-dispatch-clock="aedt"]');
    if (utcEl)  utcEl.textContent  = formatClock(now, 'UTC');
    if (aedtEl) aedtEl.textContent = formatClock(now, 'Australia/Sydney');
  }

  function updateLegTiming(leg) {
    if (!leg) return;
    var nowMs  = Date.now();
    var etdMs  = parseUtcMs(leg.etdUtc);
    var etaMs  = parseUtcMs(leg.etaUtc);

    var deptState = '';
    if (etdMs !== null) {
      if (nowMs < etdMs) {
        deptState = '↑ ' + formatDuration(etdMs - nowMs);
      } else if (etaMs !== null && nowMs < etaMs) {
        deptState = '↑ Airborne ' + formatDuration(nowMs - etdMs);
      } else {
        deptState = '↑ Departed';
      }
    }

    var arrState = '';
    if (etaMs !== null) {
      if (nowMs < etaMs) {
        arrState = '↓ ' + formatDuration(etaMs - nowMs);
      } else {
        arrState = '↓ Arrived';
      }
    }

    setText('dispatch-leg-departure-state', deptState);
    setText('dispatch-leg-arrival-state', arrState);
  }

  /* ============================================================
     AUTH / PIN GATE
  ============================================================ */

  function isAuthed() {
    try { return sessionStorage.getItem(AUTH_KEY) === '1'; } catch (_) { return false; }
  }

  function setAuthed(val) {
    try {
      if (val) sessionStorage.setItem(AUTH_KEY, '1');
      else sessionStorage.removeItem(AUTH_KEY);
    } catch (_) {}
    updateAuthUi();
  }

  function updateAuthUi() {
    var lockBtn = document.getElementById('btn-lock');
    if (lockBtn) lockBtn.hidden = !isAuthed();
  }

  var _pinCallback = null;
  var _pinCancelCallback = null;

  function requireAuth(callback, onCancel) {
    if (isAuthed()) { callback(); return; }
    showPinModal(callback, onCancel || null);
  }

  function showPinModal(callback, onCancel) {
    _pinCallback = callback;
    _pinCancelCallback = onCancel || null;
    var modal = document.getElementById('dep-pin-modal');
    var input = document.getElementById('dep-pin-input');
    var error = document.getElementById('dep-pin-error');
    if (error) error.textContent = '';
    if (input) input.value = '';
    if (modal) modal.classList.add('open');
    setTimeout(function () { if (input) input.focus(); }, 60);
  }

  function hidePinModal() {
    var modal = document.getElementById('dep-pin-modal');
    if (modal) modal.classList.remove('open');
    _pinCallback = null;
    if (_pinCancelCallback) {
      var cb = _pinCancelCallback;
      _pinCancelCallback = null;
      cb();
    }
  }

  function confirmPin() {
    var input = document.getElementById('dep-pin-input');
    var error = document.getElementById('dep-pin-error');
    var entered = input ? input.value : '';
    if (entered !== baseConfig.pin) {
      if (error) error.textContent = 'Incorrect PIN. Try again.';
      if (input) { input.value = ''; input.focus(); }
      return;
    }
    _pinCancelCallback = null; /* Don't fire cancel on successful confirm */
    setAuthed(true);
    hidePinModal();
    if (_pinCallback) { var cb = _pinCallback; _pinCallback = null; cb(); }
  }

  function bindPinModal() {
    var closeBtn   = document.getElementById('dep-pin-close');
    var cancelBtn  = document.getElementById('dep-pin-cancel');
    var confirmBtn = document.getElementById('dep-pin-confirm');
    var overlay    = document.getElementById('dep-pin-modal');
    var input      = document.getElementById('dep-pin-input');
    var lockBtn    = document.getElementById('btn-lock');

    if (closeBtn)   closeBtn.addEventListener('click',   hidePinModal);
    if (cancelBtn)  cancelBtn.addEventListener('click',  hidePinModal);
    if (confirmBtn) confirmBtn.addEventListener('click', confirmPin);

    if (input) {
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter')  { confirmPin(); }
        if (e.key === 'Escape') { hidePinModal(); }
      });
    }

    if (overlay) {
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) hidePinModal();
      });
    }

    if (lockBtn) {
      lockBtn.addEventListener('click', function () { setAuthed(false); });
    }

    updateAuthUi();
  }

  /* ============================================================
     EDIT MODAL
  ============================================================ */

  function openModal(focusSb) {
    var leg = state.currentLeg;
    document.getElementById('f-flight').value        = leg.flight || leg.callsign || leg.leg || '';
    document.getElementById('f-origin-icao').value   = leg.from  || '';
    document.getElementById('f-origin-name').value   = leg.fromName || '';
    document.getElementById('f-dest-icao').value     = leg.to    || '';
    document.getElementById('f-dest-name').value     = leg.toName || '';
    document.getElementById('f-aircraft').value      = leg.aircraft || '';
    document.getElementById('f-aircraft-name').value = leg.aircraftName || '';
    document.getElementById('f-alt').value           = leg.cruiseAlt || '';
    document.getElementById('f-etd').value           = formatHHMM(leg.etdUtc);
    document.getElementById('f-eta').value           = formatHHMM(leg.etaUtc);
    document.getElementById('f-dist').value          = leg.distanceNm ? String(leg.distanceNm) : '';
    document.getElementById('f-route').value         = leg.route || '';
    document.getElementById('f-pf').value            = leg.pf || '';
    document.getElementById('f-pm').value            = leg.pm || '';
    clearFetchStatus();

    var modalEl = document.getElementById('dep-edit-modal');
    if (modalEl) modalEl.classList.add('open');

    setTimeout(function () {
      var target = focusSb
        ? document.getElementById('sb-username')
        : document.getElementById('f-flight');
      if (target) target.focus();
    }, 60);
  }

  function closeModal() {
    var modalEl = document.getElementById('dep-edit-modal');
    if (modalEl) modalEl.classList.remove('open');
  }

  function saveModal() {
    var leg = state.currentLeg;
    leg.flight       = v('f-flight').toUpperCase();
    leg.from         = v('f-origin-icao').toUpperCase();
    leg.fromName     = v('f-origin-name').toUpperCase();
    leg.to           = v('f-dest-icao').toUpperCase();
    leg.toName       = v('f-dest-name').toUpperCase();
    leg.aircraft     = v('f-aircraft').toUpperCase();
    leg.aircraftName = v('f-aircraft-name').toUpperCase();
    leg.cruiseAlt    = v('f-alt').toUpperCase();
    leg.distanceNm   = parseFloat(v('f-dist')) || null;
    leg.route        = v('f-route').toUpperCase();
    leg.pf           = v('f-pf').toUpperCase();
    leg.pm           = v('f-pm').toUpperCase();

    /* Parse time inputs — accepts "21:00" or ISO strings */
    var etdRaw = v('f-etd');
    var etaRaw = v('f-eta');
    leg.etdUtc = parseTimeInput(etdRaw, leg.etdUtc);
    leg.etaUtc = parseTimeInput(etaRaw, leg.etaUtc);

    closeModal();
    saveOverrides();
    renderBoard(state, true);
    updateLegTiming(leg);
  }

  function v(id) {
    var el = document.getElementById(id);
    return el ? el.value.trim() : '';
  }

  /* Convert "HH:MM" input to ISO string using today's date as base,
     or keep existing ISO if input already looks like one */
  function parseTimeInput(input, existing) {
    if (!input) return existing;
    /* Already ISO */
    if (input.indexOf('T') !== -1 || input.length > 8) {
      var ms = Date.parse(input);
      return isNaN(ms) ? existing : new Date(ms).toISOString();
    }
    /* HH:MM */
    var parts = input.split(':');
    if (parts.length >= 2) {
      var base = existing ? new Date(Date.parse(existing) || Date.now()) : new Date();
      base.setUTCHours(parseInt(parts[0], 10) || 0, parseInt(parts[1], 10) || 0, 0, 0);
      return base.toISOString();
    }
    return existing;
  }

  function bindModal() {
    var btnEdit   = document.getElementById('btn-edit');
    var btnSb     = document.getElementById('btn-simbrief');
    var btnClose  = document.getElementById('dep-modal-close');
    var btnCancel = document.getElementById('dep-btn-cancel');
    var btnSave   = document.getElementById('dep-btn-save');
    var overlay   = document.getElementById('dep-edit-modal');

    if (btnEdit) btnEdit.addEventListener('click', function () {
      requireAuth(function () { openModal(false); });
    });
    if (btnSb) btnSb.addEventListener('click', function () {
      requireAuth(function () { openModal(true); });
    });
    if (btnClose)  btnClose.addEventListener('click',  closeModal);
    if (btnCancel) btnCancel.addEventListener('click', closeModal);
    if (btnSave)   btnSave.addEventListener('click',   saveModal);

    if (overlay) {
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) closeModal();
      });
    }
  }

  /* ============================================================
     STATUS QUICK-CHANGE & RESET
  ============================================================ */

  function bindControls() {
    var selectEl  = document.getElementById('status-select');
    var lastStatus = state.status;
    if (selectEl) {
      selectEl.addEventListener('change', function (e) {
        var newVal = e.target.value;
        requireAuth(function () {
          state.status = newVal;
          lastStatus   = newVal;
          var statusEl = document.getElementById('dispatch-event-status');
          if (statusEl) {
            statusEl.textContent = (state.status || 'STANDBY').toUpperCase();
            applyStatusClass(statusEl, state.status);
          }
          saveOverrides();
        }, function () {
          /* Cancelled — revert select to previous value */
          selectEl.value = lastStatus;
        });
      });
    }

    var resetBtn = document.getElementById('btn-reset');
    if (resetBtn) {
      resetBtn.addEventListener('click', function () {
        requireAuth(function () {
          if (!window.confirm('Reset the board to the config file defaults?')) return;
          clearOverrides();
          state = mergeOverrides(baseConfig);
          renderBoard(state, true);
          updateLegTiming(state.currentLeg);
        });
      });
    }
  }

  /* ============================================================
     SIMBRIEF FETCH
  ============================================================ */

  function bindSimBrief() {
    /* Restore remembered username */
    try {
      var saved = localStorage.getItem(SIMBRIEF_KEY);
      if (saved) {
        var sbEl = document.getElementById('sb-username');
        if (sbEl) sbEl.value = saved;
      }
    } catch (_) {}

    var fetchBtn = document.getElementById('btn-fetch-sb');
    if (!fetchBtn) return;

    fetchBtn.addEventListener('click', function () {
      var username = (document.getElementById('sb-username') || {}).value || '';
      username = username.trim();
      if (!username) {
        setFetchStatus('error', '⚠ Enter a SimBrief username or pilot ID.');
        return;
      }
      fetchSimBrief(username);
    });
  }

  function fetchSimBrief(username) {
    var fetchBtn = document.getElementById('btn-fetch-sb');
    if (fetchBtn) fetchBtn.disabled = true;
    setFetchStatus('loading', '⟳  Connecting to SimBrief…');

    var isNumeric = /^\d+$/.test(username);
    var param = isNumeric ? 'userid=' : 'username=';
    var url = 'https://www.simbrief.com/api/xml.fetcher.php?' + param + encodeURIComponent(username) + '&json=1';

    fetch(url)
      .then(function (res) {
        if (!res.ok) throw new Error('SimBrief returned HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        if (!data || !data.general) throw new Error('No OFP data found. Is the username correct?');
        if (data.fetch && data.fetch.status && data.fetch.status !== 'Success') {
          throw new Error(data.fetch.status);
        }

        populateFormFromSimBrief(data);
        try { localStorage.setItem(SIMBRIEF_KEY, username); } catch (_) {}
        setFetchStatus('success', '✓  OFP imported — review below and click Save.');
      })
      .catch(function (err) {
        setFetchStatus('error', '⚠  ' + (err.message || 'Failed to fetch OFP.'));
      })
      .finally(function () {
        if (fetchBtn) fetchBtn.disabled = false;
      });
  }

  function populateFormFromSimBrief(data) {
    var g    = data.general     || {};
    var orig = data.origin      || {};
    var dest = data.destination || {};
    var acft = data.aircraft    || {};
    var atc  = data.atc         || {};
    var times = data.times      || {};

    /* Flight number */
    var flightNo = ((g.icao_airline || '') + (g.flight_number || '')).trim();
    setFormVal('f-flight', flightNo);

    /* Origin */
    setFormVal('f-origin-icao', (orig.icao_code || '').toUpperCase());
    setFormVal('f-origin-name', (orig.name || '').toUpperCase());

    /* Destination */
    setFormVal('f-dest-icao', (dest.icao_code || '').toUpperCase());
    setFormVal('f-dest-name', (dest.name || '').toUpperCase());

    /* Aircraft */
    setFormVal('f-aircraft',      (acft.icaocode || '').toUpperCase());
    setFormVal('f-aircraft-name', (acft.name || '').toUpperCase());

    /* Times — SimBrief provides Unix timestamps */
    if (times.sched_out) setFormVal('f-etd', unixToHHMM(times.sched_out));
    if (times.sched_in)  setFormVal('f-eta', unixToHHMM(times.sched_in));

    /* Altitude — initial_altitude is in feet */
    var altFt = parseInt(g.initial_altitude || g.cruise_altitude || '0', 10);
    if (altFt > 0) setFormVal('f-alt', 'FL' + Math.round(altFt / 100));

    /* Distance */
    var dist = (g.route_distance || g.air_distance || '').toString().trim();
    if (dist) setFormVal('f-dist', dist);

    /* Route */
    if (atc.route) setFormVal('f-route', atc.route.trim().toUpperCase());
  }

  function setFormVal(id, val) {
    var el = document.getElementById(id);
    if (el && val) el.value = val;
  }

  function setFetchStatus(type, msg) {
    var el = document.getElementById('dep-fetch-status');
    if (!el) return;
    el.textContent = msg;
    el.className = 'dep-fetch-status';
    if (type) el.classList.add('dep-fs-' + type);
  }

  function clearFetchStatus() {
    setFetchStatus('', '');
  }

  /* ============================================================
     KEYBOARD
  ============================================================ */

  function bindKeyboard() {
    document.addEventListener('keydown', function (e) {
      var modal = document.getElementById('dep-edit-modal');
      if (e.key === 'Escape' && modal && modal.classList.contains('open')) {
        closeModal();
        return;
      }
      if (e.key === 'e' && modal && !modal.classList.contains('open') && e.target === document.body) {
        requireAuth(function () { openModal(false); });
      }
    });
  }

  /* ============================================================
     OBS OVERLAY TOOLS
  ============================================================ */

  function hydrateOverlayTools() {
    var overlayInput = document.getElementById('dispatch-overlay-url');
    var copyBtn      = document.getElementById('dispatch-copy-overlay');
    var statusNode   = document.getElementById('dispatch-copy-status');

    if (!overlayInput) return;
    var overlayUrl = buildOverlayUrl();
    overlayInput.value = overlayUrl;

    if (!copyBtn) return;
    copyBtn.addEventListener('click', function () {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(overlayUrl).then(function () {
          if (statusNode) statusNode.textContent = 'Overlay URL copied.';
        }).catch(function () {
          overlayInput.select();
          if (statusNode) statusNode.textContent = 'Copy failed — URL selected instead.';
        });
      } else {
        overlayInput.select();
        if (statusNode) statusNode.textContent = 'Clipboard unavailable — URL selected.';
      }
    });
  }

  /* ============================================================
     FORMATTING HELPERS
  ============================================================ */

  function formatHHMM(value) {
    var ms = parseUtcMs(value);
    if (ms === null) return '--:--';
    var d = new Date(ms);
    return pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes());
  }

  function unixToHHMM(unix) {
    var t = parseInt(unix, 10);
    if (!t || t <= 0) return '';
    var d = new Date(t * 1000);
    return pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes());
  }

  function formatUtcDate(value) {
    var ms = parseUtcMs(value);
    if (ms === null) return '--';
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'UTC',
      day: '2-digit', month: 'short',
      hour: '2-digit', minute: '2-digit', hour12: false
    }).format(new Date(ms)).replace(',', '') + ' UTC';
  }

  function formatClock(date, zone) {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: zone,
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    }).format(date);
  }

  function formatDuration(ms) {
    var s = Math.max(0, Math.floor(ms / 1000));
    var h = Math.floor(s / 3600);
    var m = Math.floor((s % 3600) / 60);
    var sec = s % 60;
    if (h > 0) return h + 'h ' + pad(m) + 'm';
    if (m > 0) return m + 'm ' + pad(sec) + 's';
    return sec + 's';
  }

  function parseUtcMs(value) {
    var ms = Date.parse(value || '');
    return isNaN(ms) ? null : ms;
  }

  function pad(n) { return String(n).padStart(2, '0'); }

  function isOverlayMode() {
    var p = new URLSearchParams(window.location.search);
    return p.get('overlay') === '1' || p.get('mode') === 'overlay';
  }

  function buildOverlayUrl() {
    var url = new URL(window.location.href);
    url.searchParams.set('overlay', '1');
    url.searchParams.delete('mode');
    return url.toString();
  }

})();
