(function () {
  var configNode = document.getElementById('dispatch-config');
  if (!configNode) {
    return;
  }

  var config = parseConfig(configNode.textContent);
  var overlayMode = isOverlayMode();

  if (overlayMode) {
    document.documentElement.setAttribute('data-theme', 'dark');
    document.documentElement.classList.add('dispatch-overlay-mode');
    document.body.classList.add('dispatch-overlay-mode');
  }

  hydrateOverlayTools();
  renderBoard(config);

  updateClocks();
  updateLegTiming(config.currentLeg);

  window.setInterval(updateClocks, 1000);
  window.setInterval(function () {
    updateLegTiming(config.currentLeg);
  }, 1000);

  function parseConfig(raw) {
    var fallback = {
      eventName: 'WorldFlight Team Covey',
      status: 'Standby',
      lastUpdatedUtc: null,
      currentLeg: {
        leg: '----',
        from: '----',
        to: '----',
        callsign: '----',
        aircraft: '----',
        distanceNm: null,
        etdUtc: null,
        etaUtc: null
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
        status: parsed.status || fallback.status,
        lastUpdatedUtc: parsed.lastUpdatedUtc || fallback.lastUpdatedUtc,
        currentLeg: Object.assign({}, fallback.currentLeg, parsed.currentLeg || {}),
        nextLegs: Array.isArray(parsed.nextLegs) ? parsed.nextLegs : fallback.nextLegs,
        crew: Array.isArray(parsed.crew) ? parsed.crew : fallback.crew,
        systems: Array.isArray(parsed.systems) ? parsed.systems : fallback.systems,
        notes: Array.isArray(parsed.notes) ? parsed.notes : fallback.notes
      };
    } catch (error) {
      return fallback;
    }
  }

  function renderBoard(data) {
    setText('dispatch-event-name', data.eventName);
    setText('dispatch-event-status', data.status);
    setStatusClass(data.status);

    var route = [data.currentLeg.from, data.currentLeg.to].filter(Boolean).join(' -> ');
    setText('dispatch-leg-route', route || '----');
    setText('dispatch-leg-number', data.currentLeg.leg || '----');
    setText('dispatch-leg-callsign', data.currentLeg.callsign || '----');
    setText('dispatch-leg-aircraft', data.currentLeg.aircraft || '----');
    setText('dispatch-leg-distance', formatDistance(data.currentLeg.distanceNm));
    setText('dispatch-leg-etd', formatUtcDate(data.currentLeg.etdUtc));
    setText('dispatch-leg-eta', formatUtcDate(data.currentLeg.etaUtc));

    renderSystemStrip(data.systems);
    renderNextLegs(data.nextLegs);
    renderCrew(data.crew);
    renderNotes(data.notes);

    if (data.lastUpdatedUtc) {
      setText('dispatch-last-updated', 'Updated ' + formatUtcDate(data.lastUpdatedUtc));
    }
  }

  function renderSystemStrip(items) {
    var container = document.getElementById('dispatch-system-strip');
    if (!container) {
      return;
    }

    container.innerHTML = '';

    if (!items.length) {
      var empty = document.createElement('span');
      empty.className = 'dispatch-system-chip';
      empty.textContent = 'No systems reported';
      container.appendChild(empty);
      return;
    }

    items.forEach(function (item) {
      var chip = document.createElement('span');
      chip.className = 'dispatch-system-chip ' + statusClassForText(item.state || '');
      chip.textContent = (item.label || 'System') + ': ' + (item.state || 'Unknown');
      container.appendChild(chip);
    });
  }

  function renderNextLegs(legs) {
    var container = document.getElementById('dispatch-next-legs');
    if (!container) {
      return;
    }

    container.innerHTML = '';

    if (!legs.length) {
      container.textContent = 'No upcoming legs configured yet.';
      return;
    }

    legs.forEach(function (leg) {
      var row = document.createElement('div');
      row.className = 'dispatch-leg-row';

      var title = document.createElement('strong');
      title.textContent = (leg.leg || '--') + '  ' + (leg.from || '----') + ' -> ' + (leg.to || '----');

      var time = document.createElement('span');
      time.textContent = 'ETD ' + formatUtcDate(leg.etdUtc);

      row.appendChild(title);
      row.appendChild(time);
      container.appendChild(row);
    });
  }

  function renderCrew(crew) {
    var container = document.getElementById('dispatch-crew-list');
    if (!container) {
      return;
    }

    container.innerHTML = '';

    if (!crew.length) {
      container.textContent = 'Crew roster not configured yet.';
      return;
    }

    crew.forEach(function (member) {
      var row = document.createElement('div');
      row.className = 'dispatch-crew-row';

      var role = document.createElement('span');
      role.textContent = member.role || 'Role';

      var name = document.createElement('strong');
      name.textContent = member.name || 'TBA';

      row.appendChild(role);
      row.appendChild(name);
      container.appendChild(row);
    });
  }

  function renderNotes(notes) {
    var list = document.getElementById('dispatch-notes-list');
    if (!list) {
      return;
    }

    list.innerHTML = '';

    if (!notes.length) {
      var li = document.createElement('li');
      li.textContent = 'No operations notes yet.';
      list.appendChild(li);
      return;
    }

    notes.forEach(function (note) {
      var li = document.createElement('li');
      li.textContent = note;
      list.appendChild(li);
    });
  }

  function hydrateOverlayTools() {
    var overlayInput = document.getElementById('dispatch-overlay-url');
    var copyButton = document.getElementById('dispatch-copy-overlay');
    var statusNode = document.getElementById('dispatch-copy-status');

    if (!overlayInput) {
      return;
    }

    var overlayUrl = buildOverlayUrl();
    overlayInput.value = overlayUrl;

    if (!copyButton) {
      return;
    }

    copyButton.addEventListener('click', function () {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(overlayUrl).then(function () {
          if (statusNode) {
            statusNode.textContent = 'Overlay URL copied.';
          }
        }).catch(function () {
          overlayInput.select();
          if (statusNode) {
            statusNode.textContent = 'Copy failed. URL selected instead.';
          }
        });
      } else {
        overlayInput.select();
        if (statusNode) {
          statusNode.textContent = 'Clipboard unavailable. URL selected.';
        }
      }
    });
  }

  function updateClocks() {
    var now = new Date();
    var utcNode = document.querySelector('[data-dispatch-clock="utc"]');
    var aedtNode = document.querySelector('[data-dispatch-clock="aedt"]');

    if (utcNode) {
      utcNode.textContent = formatClock(now, 'UTC');
    }

    if (aedtNode) {
      aedtNode.textContent = formatClock(now, 'Australia/Sydney');
    }
  }

  function updateLegTiming(leg) {
    if (!leg) {
      return;
    }

    var nowMs = Date.now();
    var etdMs = parseUtcMs(leg.etdUtc);
    var etaMs = parseUtcMs(leg.etaUtc);

    var departureState = 'Departure time unavailable';
    if (etdMs !== null) {
      if (nowMs < etdMs) {
        departureState = 'Departs in ' + formatDuration(etdMs - nowMs);
      } else if (etaMs !== null && nowMs < etaMs) {
        departureState = 'Airborne for ' + formatDuration(nowMs - etdMs);
      } else {
        departureState = 'Departed';
      }
    }

    var arrivalState = 'Arrival time unavailable';
    if (etaMs !== null) {
      if (nowMs < etaMs) {
        arrivalState = 'ETA in ' + formatDuration(etaMs - nowMs);
      } else {
        arrivalState = 'Arrived';
      }
    }

    setText('dispatch-leg-departure-state', departureState);
    setText('dispatch-leg-arrival-state', arrivalState);
  }

  function setStatusClass(text) {
    var node = document.getElementById('dispatch-event-status');
    if (!node) {
      return;
    }

    node.classList.remove('is-good', 'is-warn', 'is-bad');
    var cls = statusClassForText(text);
    if (cls) {
      node.classList.add(cls);
    }
  }

  function statusClassForText(text) {
    var value = String(text || '').toLowerCase();

    if (!value) {
      return '';
    }

    if (
      value.indexOf('live') !== -1 ||
      value.indexOf('online') !== -1 ||
      value.indexOf('ready') !== -1 ||
      value.indexOf('connected') !== -1 ||
      value.indexOf('stable') !== -1
    ) {
      return 'is-good';
    }

    if (
      value.indexOf('delay') !== -1 ||
      value.indexOf('hold') !== -1 ||
      value.indexOf('standby') !== -1
    ) {
      return 'is-warn';
    }

    if (
      value.indexOf('down') !== -1 ||
      value.indexOf('offline') !== -1 ||
      value.indexOf('issue') !== -1 ||
      value.indexOf('critical') !== -1
    ) {
      return 'is-bad';
    }

    return '';
  }

  function setText(id, value) {
    var node = document.getElementById(id);
    if (node) {
      node.textContent = value;
    }
  }

  function formatDistance(value) {
    var num = Number(value);
    if (!Number.isFinite(num) || num <= 0) {
      return '----';
    }

    return num.toLocaleString('en-US') + ' NM';
  }

  function parseUtcMs(value) {
    var ms = Date.parse(value || '');
    return Number.isNaN(ms) ? null : ms;
  }

  function formatUtcDate(value) {
    var ms = parseUtcMs(value);
    if (ms === null) {
      return '--';
    }

    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'UTC',
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(new Date(ms)).replace(',', '') + ' UTC';
  }

  function formatClock(date, zone) {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: zone,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).format(date);
  }

  function formatDuration(ms) {
    var totalSeconds = Math.max(0, Math.floor(ms / 1000));
    var hours = Math.floor(totalSeconds / 3600);
    var minutes = Math.floor((totalSeconds % 3600) / 60);
    var seconds = totalSeconds % 60;

    if (hours > 0) {
      return hours + 'h ' + String(minutes).padStart(2, '0') + 'm';
    }

    if (minutes > 0) {
      return minutes + 'm ' + String(seconds).padStart(2, '0') + 's';
    }

    return seconds + 's';
  }

  function isOverlayMode() {
    var params = new URLSearchParams(window.location.search);
    return params.get('overlay') === '1' || params.get('mode') === 'overlay';
  }

  function buildOverlayUrl() {
    var url = new URL(window.location.href);
    url.searchParams.set('overlay', '1');
    url.searchParams.delete('mode');
    return url.toString();
  }
})();

