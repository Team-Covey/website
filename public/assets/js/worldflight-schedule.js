/*
 * WorldFlight schedule board.
 *
 * Renders the live sector schedule as an airport departures board.
 * Requires worldflight-data.js to be loaded first.
 */
(function () {
  'use strict';

  var root = document.getElementById('wf-board-root');
  if (!root) {
    return;
  }

  var TCWF = window.TCWF;
  if (!TCWF) {
    return;
  }

  var REFRESH_MS = 120000;  // re-fetch the schedule
  var TICK_MS = 1000;       // countdown + status tick

  var elements = {
    body: root.querySelector('#wf-board-body'),
    dayFilter: root.querySelector('#wf-board-days'),
    search: root.querySelector('#wf-board-search'),
    clockUtc: root.querySelector('#wf-board-clock-utc'),
    clockLocal: root.querySelector('#wf-board-clock-local'),
    localZone: root.querySelector('#wf-board-zone'),
    updated: root.querySelector('#wf-board-updated'),
    eventName: root.querySelector('#wf-board-event'),
    timebase: root.querySelectorAll('[data-timebase]'),
    resultCount: root.querySelector('#wf-board-count'),
    error: root.querySelector('#wf-board-error')
  };

  var state = {
    model: null,
    day: 'ALL',
    filter: '',
    timebase: 'utc',
    expanded: {}
  };

  /* ── Toolbar wiring ──────────────────────────────────────────────── */

  if (elements.search) {
    elements.search.addEventListener('input', function () {
      state.filter = elements.search.value || '';
      renderBoard();
    });
  }

  Array.prototype.forEach.call(elements.timebase, function (button) {
    button.addEventListener('click', function () {
      state.timebase = button.getAttribute('data-timebase');
      Array.prototype.forEach.call(elements.timebase, function (other) {
        var active = other === button;
        other.classList.toggle('is-active', active);
        other.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
      if (state.model) {
        renderDayFilter(state.model);
      }
      renderBoard();
      updateZoneLabels();
    });
  });

  /** Keeps the column heading honest about which clock the board is showing. */
  function updateZoneLabels() {
    var label = state.timebase === 'local' ? 'Time (local)' : 'Time (UTC)';
    var node = root.querySelector('.wf-col-time');
    if (node) {
      node.textContent = label;
    }
  }

  if (elements.localZone) {
    try {
      elements.localZone.textContent = Intl.DateTimeFormat().resolvedOptions().timeZone || 'local';
    } catch (_error) {
      elements.localZone.textContent = 'local';
    }
  }

  /* ── Rendering ───────────────────────────────────────────────────── */

  /*
   * Every leg is grouped and labelled by the day it falls on *in the selected
   * time base*. In local mode a 22:00z departure can land on the next calendar
   * day for the viewer, so the day chips regroup rather than just relabel.
   */
  function dayKeyFor(leg) {
    if (state.timebase === 'local' && leg.departureOpen) {
      return localDateLabel(leg.departureOpen);
    }
    return leg.dateLabel;
  }

  function localDateLabel(timestamp) {
    var date = new Date(timestamp);
    try {
      return date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
    } catch (_error) {
      return date.toDateString().slice(0, 10);
    }
  }

  function dayGroups(model) {
    var order = [];
    var counts = {};

    model.legs.forEach(function (leg) {
      var key = dayKeyFor(leg);
      if (!counts[key]) {
        counts[key] = 0;
        order.push(key);
      }
      counts[key] += 1;
    });

    return order.map(function (key) {
      return { key: key, label: key, count: counts[key] };
    });
  }

  function renderDayFilter(model) {
    if (!elements.dayFilter) { return; }

    var groups = dayGroups(model);

    // A day that no longer exists after a time-base switch falls back to "all".
    if (state.day !== 'ALL' && !groups.some(function (g) { return g.key === state.day; })) {
      state.day = 'ALL';
    }

    var days = [{ label: 'All days', key: 'ALL', count: model.legs.length }].concat(groups);

    elements.dayFilter.innerHTML = '';

    days.forEach(function (day) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'wf-board-chip' + (state.day === day.key ? ' is-active' : '');
      chip.setAttribute('aria-pressed', state.day === day.key ? 'true' : 'false');
      chip.innerHTML = escapeHtml(day.label) + '<span>' + day.count + '</span>';
      chip.addEventListener('click', function () {
        state.day = day.key;
        renderDayFilter(model);
        renderBoard();
      });
      elements.dayFilter.appendChild(chip);
    });
  }

  function visibleLegs() {
    var model = state.model;
    if (!model) { return []; }

    var filter = state.filter.trim().toUpperCase();

    return model.legs.filter(function (leg) {
      if (state.day !== 'ALL' && dayKeyFor(leg) !== state.day) {
        return false;
      }
      if (!filter) {
        return true;
      }
      return [leg.sector, leg.from.icao, leg.to.icao, leg.from.city, leg.to.city, leg.from.country, leg.to.country]
        .join(' ').toUpperCase().indexOf(filter) !== -1;
    });
  }

  function timeCell(timestamp, published) {
    if (state.timebase === 'local' && timestamp) {
      return TCWF.formatLocalTime(timestamp);
    }
    return published;
  }

  function dateCell(leg) {
    if (state.timebase === 'local' && leg.departureOpen) {
      return localDateLabel(leg.departureOpen);
    }
    return leg.dateLabel;
  }

  function renderBoard() {
    var model = state.model;
    if (!model || !elements.body) { return; }

    var legs = visibleLegs();
    elements.body.innerHTML = '';

    if (!legs.length) {
      var empty = document.createElement('p');
      empty.className = 'wf-board-empty';
      empty.textContent = 'No sectors match the current filter.';
      elements.body.appendChild(empty);
    }

    legs.forEach(function (leg) {
      elements.body.appendChild(buildRow(leg));
    });

    if (elements.resultCount) {
      elements.resultCount.textContent = legs.length === model.legs.length
        ? model.legs.length + ' sectors'
        : legs.length + ' of ' + model.legs.length + ' sectors';
    }
  }

  function buildRow(leg) {
    var wrapper = document.createElement('div');
    var tone = leg.status ? leg.status.tone : 'idle';
    var isExpanded = Boolean(state.expanded[leg.sector]);

    wrapper.className = 'wf-board-row wf-tone-' + tone +
      (isExpanded ? ' is-expanded' : '') +
      (leg.isChallenge ? ' is-challenge' : '');

    var toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'wf-board-row-main';
    toggle.setAttribute('aria-expanded', isExpanded ? 'true' : 'false');

    var flags =
      (leg.isChallenge ? '<span class="wf-board-flag">WF Challenge</span>' : '') +
      (leg.flowType && leg.flowType !== 'NONE'
        ? '<span class="wf-board-flag wf-board-flag-flow">' + escapeHtml(leg.flowType) + '</span>'
        : '');

    toggle.innerHTML =
      '<span class="wf-board-cell wf-cell-time">' +
        escapeHtml(timeCell(leg.departureOpen, leg.departureWindow.open)) +
      '</span>' +
      '<span class="wf-board-cell wf-cell-dest">' +
        escapeHtml(leg.to.city || leg.to.icao) +
        '<span class="wf-board-icao">' + escapeHtml(leg.to.icao) + '</span>' +
        '<small class="wf-board-via">' +
          'from ' + escapeHtml(leg.from.city || leg.from.icao) + ' (' + escapeHtml(leg.from.icao) + ')' +
          ' &middot; ' + escapeHtml(dateCell(leg)) +
        '</small>' +
      '</span>' +
      '<span class="wf-board-cell wf-cell-flight">' + escapeHtml(leg.sector) + '</span>' +
      '<span class="wf-board-cell wf-cell-remark">' + escapeHtml(remarkFor(leg)) + flags + '</span>' +
      '<span class="wf-board-cell wf-cell-block">' + escapeHtml(leg.blockTime || '--:--') + '</span>' +
      '<span class="wf-board-chevron" aria-hidden="true"></span>';

    toggle.addEventListener('click', function () {
      state.expanded[leg.sector] = !state.expanded[leg.sector];
      renderBoard();
    });

    wrapper.appendChild(toggle);

    if (isExpanded) {
      wrapper.appendChild(buildDetail(leg));
    }

    return wrapper;
  }

  /** Board-style remark, in the spirit of "Go to gate" / "Departed". */
  function remarkFor(leg) {
    var key = leg.status ? leg.status.key : 'scheduled';
    var arrival = timeCell(leg.arrivalOpen, leg.arrivalWindow.open);
    var closes = timeCell(leg.departureClose, leg.departureWindow.close);

    if (key === 'boarding')  { return 'Boarding'; }
    if (key === 'departing') { return 'Window open until ' + closes; }
    if (key === 'enroute')   { return 'En route - due ' + arrival; }
    if (key === 'arriving')  { return 'Arriving'; }
    if (key === 'arrived')   { return 'Arrived'; }

    return 'Window ' + timeCell(leg.departureOpen, leg.departureWindow.open) + ' - ' + closes;
  }

  function buildDetail(leg) {
    var detail = document.createElement('div');
    detail.className = 'wf-board-detail';

    var zone = state.timebase === 'local' ? 'local' : 'UTC';

    var facts = [
      ['Date (' + zone + ')', dateCell(leg)],
      ['Departure window (' + zone + ')',
        timeCell(leg.departureOpen, leg.departureWindow.open) + ' - ' + timeCell(leg.departureClose, leg.departureWindow.close)],
      ['Arrival window (' + zone + ')',
        timeCell(leg.arrivalOpen, leg.arrivalWindow.open) + ' - ' + timeCell(leg.arrivalClose, leg.arrivalWindow.close)],
      ['Flight time', leg.flightTime || '--'],
      ['Block time', leg.blockTime || '--'],
      ['Great-circle distance', leg.distanceKm ? TCWF.formatKm(leg.distanceKm) + ' / ' + TCWF.formatNm(leg.distanceKm) : 'Unknown'],
      ['Initial track', leg.bearing === null ? 'Unknown' : Math.round(leg.bearing) + '° ' + TCWF.compassPoint(leg.bearing)],
      ['Flow control', leg.flowType === 'NONE'
        ? 'None'
        : leg.flowType + (leg.flowRate ? ' at ' + leg.flowRate + ' movements/hour' : '')],
      ['Departure airport', leg.from.name + (leg.from.country ? ' (' + leg.from.country + ')' : '')],
      ['Arrival airport', leg.to.name + (leg.to.country ? ' (' + leg.to.country + ')' : '')]
    ];

    detail.innerHTML =
      '<dl class="wf-board-facts">' +
        facts.map(function (pair) {
          return '<div><dt>' + escapeHtml(pair[0]) + '</dt><dd>' + escapeHtml(pair[1]) + '</dd></div>';
        }).join('') +
      '</dl>' +
      (leg.atcRoute
        ? '<div class="wf-board-atc"><p class="wf-board-atc-label">Filed ATC route</p>' +
          '<p class="wf-board-atc-value">' + escapeHtml(leg.atcRoute) + '</p></div>'
        : '<p class="wf-board-atc-none">No ATC route published for this sector yet.</p>');

    return detail;
  }

  function renderSummary(model) {
    setText(elements.eventName, model.event);

    if (elements.updated) {
      var stamp = model.fetchedAt || model.generatedAt;
      elements.updated.textContent = stamp
        ? 'Feed updated ' + TCWF.formatUtcTime(stamp) + 'z' + (model.stale ? ' (cached copy)' : '')
        : '';
    }
  }

  function tickClocks() {
    var now = new Date();
    setText(elements.clockUtc, TCWF.pad2(now.getUTCHours()) + ':' + TCWF.pad2(now.getUTCMinutes()) + ':' + TCWF.pad2(now.getUTCSeconds()));
    setText(elements.clockLocal, TCWF.pad2(now.getHours()) + ':' + TCWF.pad2(now.getMinutes()) + ':' + TCWF.pad2(now.getSeconds()));
  }

  /* ── Load / refresh ──────────────────────────────────────────────── */

  function setError(message, fatal) {
    if (!elements.error) { return; }

    if (!message) {
      elements.error.hidden = true;
      elements.error.textContent = '';
      root.classList.remove('is-failed');
      return;
    }

    elements.error.hidden = false;
    elements.error.textContent = message;
    root.classList.toggle('is-failed', Boolean(fatal));
  }

  var lastStatusSignature = '';

  function tick() {
    tickClocks();

    if (!state.model) { return; }

    TCWF.applyStatus(state.model);

    // Only redraw the board when a status actually flips.
    var signature = state.model.legs.map(function (leg) {
      return leg.status ? leg.status.key : '?';
    }).join('|');

    if (signature !== lastStatusSignature) {
      lastStatusSignature = signature;
      renderSummary(state.model);
      renderBoard();
    }
  }

  function load(isInitial) {
    if (isInitial) {
      root.classList.add('is-loading');
    }

    return TCWF.loadSchedule({ forceFresh: !isInitial })
      .then(function (model) {
        state.model = model;
        lastStatusSignature = '';
        root.classList.remove('is-loading');

        setError(model.stale
          ? 'Showing a cached copy of the schedule; the planning API is not responding right now.'
          : '');

        renderDayFilter(model);
        renderSummary(model);
        renderBoard();
        lastStatusSignature = model.legs.map(function (leg) {
          return leg.status ? leg.status.key : '?';
        }).join('|');
      })
      .catch(function (error) {
        root.classList.remove('is-loading');
        var message = error && error.message ? error.message : 'The schedule feed is unavailable.';

        if (state.model) {
          setError('Could not refresh the schedule: ' + message);
        } else {
          setError('The schedule could not be loaded. ' + message, true);
        }
      });
  }

  load(true);
  window.setInterval(function () { load(false); }, REFRESH_MS);
  window.setInterval(tick, TICK_MS);
  tickClocks();
  updateZoneLabels();

  /* ── Utilities ───────────────────────────────────────────────────── */

  function setText(node, value) {
    if (node) {
      node.textContent = value;
    }
  }

  function escapeHtml(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
})();
