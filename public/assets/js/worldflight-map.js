/*
 * WorldFlight route map.
 *
 * Draws the live schedule as great-circle legs on a Leaflet map, colour-coded
 * by live status, with a synced leg list beside it. Requires worldflight-data.js
 * and Leaflet to be loaded first.
 */
(function () {
  'use strict';

  var root = document.getElementById('wf-map-root');
  if (!root) {
    return;
  }

  var TCWF = window.TCWF;
  if (!TCWF || typeof window.L === 'undefined') {
    showFatal('The map could not start because a required library failed to load.');
    return;
  }

  var L = window.L;

  var TILES = {
    dark: {
      url: 'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png',
      labels: 'https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png'
    },
    light: {
      url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png',
      labels: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png'
    }
  };

  var ATTRIBUTION =
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> ' +
    '&copy; <a href="https://carto.com/attributions">CARTO</a>';

  /*
   * The map wraps infinitely, so the route is drawn in the neighbouring world
   * copies as well — otherwise panning past the date line runs into empty
   * ocean. Min zoom is clamped (see clampMinZoom) so no more than one world is
   * ever on screen at once; without that clamp these copies would all be
   * visible together and read as the route drawn three times over.
   */
  var WORLD_OFFSETS = [-360, 0, 360];

  var REFRESH_MS = 120000;   // re-fetch the schedule
  var TICK_MS = 20000;       // recompute live status

  var elements = {
    mapHost: root.querySelector('#wf-map-canvas'),
    legList: root.querySelector('#wf-map-leg-list'),
    legSearch: root.querySelector('#wf-map-search'),
    legCount: root.querySelector('#wf-map-leg-count'),
    detail: root.querySelector('#wf-map-detail'),
    statusPill: root.querySelector('#wf-map-status'),
    updated: root.querySelector('#wf-map-updated'),
    eventName: root.querySelector('#wf-map-event'),
    progressBar: root.querySelector('#wf-map-progress-bar'),
    progressText: root.querySelector('#wf-map-progress-text'),
    error: root.querySelector('#wf-map-error'),
    stats: {
      distance: root.querySelector('#wf-stat-distance'),
      legs: root.querySelector('#wf-stat-legs'),
      airports: root.querySelector('#wf-stat-airports'),
      countries: root.querySelector('#wf-stat-countries'),
      airtime: root.querySelector('#wf-stat-airtime')
    },
    buttons: {
      fit: root.querySelector('#wf-map-fit'),
      live: root.querySelector('#wf-map-live'),
      labels: root.querySelector('#wf-map-labels')
    }
  };

  var state = {
    model: null,
    selectedIndex: null,
    filter: '',
    labelsVisible: true,
    legLayers: [],
    rows: [],
    aircraftMarkers: []
  };

  /* ── Map setup ───────────────────────────────────────────────────── */

  var map = L.map(elements.mapHost, {
    zoomControl: false,
    attributionControl: true,
    worldCopyJump: true,
    minZoom: 1,
    maxZoom: 10,
    // Full pan/zoom interaction. Wheel zoom is the one exception: it stays off
    // until the pointer is over the map so the page can still be scrolled past.
    dragging: true,
    touchZoom: true,
    doubleClickZoom: true,
    boxZoom: true,
    keyboard: true,
    inertia: true,
    scrollWheelZoom: false
  }).setView([15, 30], 2);

  L.control.zoom({ position: 'bottomright' }).addTo(map);
  map.attributionControl.setPrefix('');

  /*
   * Never let the viewport show more than one copy of the world. Below that
   * zoom the repeated route copies all come into view at once and the map
   * reads as though the route has been drawn several times.
   */
  function clampMinZoom() {
    var width = elements.mapHost.clientWidth || 1;
    var height = elements.mapHost.clientHeight || 1;
    var zoomForWidth = Math.log(width / 256) / Math.LN2;
    var floor = Math.max(1, Math.ceil(zoomForWidth * 100) / 100);

    map.setMinZoom(floor);
    if (map.getZoom() < floor) {
      map.setZoom(floor);
    }
    return { floor: floor, width: width, height: height };
  }

  clampMinZoom();
  window.addEventListener('resize', function () {
    map.invalidateSize();
    clampMinZoom();
  });

  var baseLayer = null;
  var labelLayer = null;

  function currentThemeKey() {
    return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  }

  function applyTiles() {
    var theme = TILES[currentThemeKey()];

    if (baseLayer) { map.removeLayer(baseLayer); }
    if (labelLayer) { map.removeLayer(labelLayer); }

    baseLayer = L.tileLayer(theme.url, { attribution: ATTRIBUTION, maxZoom: 10 }).addTo(map);
    labelLayer = L.tileLayer(theme.labels, { maxZoom: 10, pane: 'shadowPane' });

    if (state.labelsVisible) {
      labelLayer.addTo(map);
    }
  }

  applyTiles();

  // Keep the basemap in step with the site-wide theme toggle.
  new MutationObserver(function (mutations) {
    for (var i = 0; i < mutations.length; i += 1) {
      if (mutations[i].attributeName === 'data-theme') {
        applyTiles();
        return;
      }
    }
  }).observe(document.documentElement, { attributes: true });

  // Scroll should page the site until the user commits to the map.
  elements.mapHost.addEventListener('mouseenter', function () { map.scrollWheelZoom.enable(); });
  elements.mapHost.addEventListener('mouseleave', function () { map.scrollWheelZoom.disable(); });

  // Touch devices never fire mouseenter, so give them wheel/trackpad zoom once
  // they have interacted with the map directly.
  map.once('touchstart dragstart', function () { map.scrollWheelZoom.enable(); });

  var routeGroup = L.layerGroup().addTo(map);
  var markerGroup = L.layerGroup().addTo(map);
  var aircraftGroup = L.layerGroup().addTo(map);

  /* ── Rendering ───────────────────────────────────────────────────── */

  function segmentCount(distanceKm) {
    if (!distanceKm) { return 16; }
    return Math.max(16, Math.min(96, Math.round(distanceKm / 100)));
  }

  function drawRoute(model) {
    routeGroup.clearLayers();
    markerGroup.clearLayers();
    state.legLayers = [];

    model.legs.forEach(function (leg) {
      if (!leg.from.located || !leg.to.located) {
        state.legLayers.push(null);
        return;
      }

      var points = TCWF.greatCirclePoints(leg.from, leg.to, segmentCount(leg.distanceKm));
      var record = { leg: leg, casings: [], lines: [] };

      WORLD_OFFSETS.forEach(function (offset) {
        var shifted = points.map(function (point) {
          return [point[0], point[1] + offset];
        });

        var casing = L.polyline(shifted, {
          className: 'wf-leg-casing',
          weight: 9,
          opacity: 0.001,
          interactive: true,
          bubblingMouseEvents: false
        });

        var line = L.polyline(shifted, {
          weight: 2.4,
          opacity: 0.9,
          lineCap: 'round',
          lineJoin: 'round',
          interactive: false
        });

        casing.on('click', function () {
          // The sticky hover tooltip would otherwise hang around over the panel.
          casing.closeTooltip();
          selectLeg(leg.index, { fly: false });
        });
        casing.on('mouseover', function () { emphasise(leg.index, true); });
        casing.on('mouseout', function () { emphasise(leg.index, false); });
        casing.bindTooltip(
          leg.sector + ' &middot; ' + leg.from.icao + ' &rarr; ' + leg.to.icao,
          { sticky: true, className: 'wf-map-tooltip' }
        );

        casing.addTo(routeGroup);
        line.addTo(routeGroup);
        record.casings.push(casing);
        record.lines.push(line);
      });

      state.legLayers.push(record);
    });

    model.airports.forEach(function (airport) {
      if (!airport.located) { return; }

      var isOrigin = model.origin && airport.icao === model.origin.icao;

      WORLD_OFFSETS.forEach(function (offset) {
        var latlng = [airport.lat, airport.lng + offset];

        if (isOrigin) {
          L.marker(latlng, {
            icon: L.divIcon({
              className: 'wf-map-pin wf-map-pin--home',
              html: '<span>' + escapeHtml(airport.icao) + '</span>',
              iconSize: null
            }),
            keyboard: false
          }).bindPopup(airportPopup(airport, model)).addTo(markerGroup);
          return;
        }

        // Stroke and fill are restated in CSS so the nodes follow the theme.
        L.circleMarker(latlng, {
          radius: 3.5,
          weight: 1.5,
          color: '#e2e8f0',
          fillColor: '#ffffff',
          fillOpacity: 1,
          className: 'wf-map-node'
        })
          .bindTooltip(airport.icao, { direction: 'top', offset: [0, -4], className: 'wf-map-tooltip' })
          .bindPopup(airportPopup(airport, model))
          .addTo(markerGroup);
      });
    });

    paintLegStyles();
  }

  function airportPopup(airport, model) {
    var visits = model.legs.filter(function (leg) {
      return leg.from.icao === airport.icao || leg.to.icao === airport.icao;
    });

    var lines = visits.map(function (leg) {
      var direction = leg.from.icao === airport.icao ? 'Departs' : 'Arrives';
      var time = leg.from.icao === airport.icao ? leg.departureWindow.open : leg.arrivalWindow.open;
      return '<li><b>' + escapeHtml(leg.sector) + '</b> ' + direction + ' ' + escapeHtml(time) + 'z &middot; ' +
        escapeHtml(leg.dateLabel) + '</li>';
    });

    return '<div class="wf-map-popup">' +
      '<p class="wf-map-popup-code">' + escapeHtml(airport.icao) + '</p>' +
      '<p class="wf-map-popup-name">' + escapeHtml(airport.name) + '</p>' +
      '<p class="wf-map-popup-meta">' + escapeHtml(airport.city) + ', ' + escapeHtml(airport.country) + '</p>' +
      (lines.length ? '<ul class="wf-map-popup-list">' + lines.join('') + '</ul>' : '') +
      '</div>';
  }

  /** Applies status/selection styling to every drawn leg. */
  function paintLegStyles() {
    state.legLayers.forEach(function (record, index) {
      if (!record) { return; }

      var leg = record.leg;
      var tone = leg.status ? leg.status.tone : 'idle';
      var selected = state.selectedIndex === index;

      // Mirrors the --tone-* ramp in CSS: monochrome, green only when airborne.
      var isLight = document.documentElement.getAttribute('data-theme') === 'light';
      var style = {
        done:   { color: isLight ? '#9a9a9a' : '#6f6f6f', weight: 2,   opacity: 0.9, dashArray: null },
        active: { color: '#22c55e',                      weight: 3.6, opacity: 1,   dashArray: null },
        soon:   { color: isLight ? '#000000' : '#ffffff', weight: 2.8, opacity: 1,   dashArray: null },
        idle:   { color: isLight ? '#767676' : '#c8c8c8', weight: 1.6, opacity: 0.8, dashArray: '3 6' }
      }[tone];

      if (selected) {
        style = { color: isLight ? '#000000' : '#ffffff', weight: 4, opacity: 1, dashArray: null };
      }

      record.lines.forEach(function (line) {
        line.setStyle(style);
        var element = line.getElement();
        if (element) {
          element.classList.toggle('wf-leg-active', tone === 'active' && !selected);
        }
      });
    });
  }

  function emphasise(index, on) {
    var record = state.legLayers[index];
    if (!record) { return; }

    record.lines.forEach(function (line) {
      var element = line.getElement();
      if (element) {
        element.classList.toggle('wf-leg-hover', on);
      }
    });

    var row = state.rows[index];
    if (row) {
      row.classList.toggle('is-hover', on);
    }
  }

  function drawAircraft(model) {
    aircraftGroup.clearLayers();
    state.aircraftMarkers = [];

    var leg = model.activeLeg;
    if (!leg || !leg.from.located || !leg.to.located) {
      return;
    }

    var position = TCWF.interpolate(leg.from, leg.to, leg.progress);
    var heading = TCWF.bearingDegrees(
      TCWF.interpolate(leg.from, leg.to, Math.max(0, leg.progress - 0.01)),
      TCWF.interpolate(leg.from, leg.to, Math.min(1, leg.progress + 0.01))
    );

    // Normalise back into [-180, 180] so the aircraft sits on the drawn route.
    var lng = position.lng;
    while (lng > 180) { lng -= 360; }
    while (lng < -180) { lng += 360; }

    var marker = L.marker([position.lat, lng], {
      icon: L.divIcon({
        className: 'wf-map-aircraft',
        html: '<svg viewBox="0 0 24 24" style="transform:rotate(' + Math.round(heading) + 'deg)" aria-hidden="true">' +
          '<path d="M12 2 14.2 10.2 22 12.6v1.8l-7.8-1.6L13.4 19l2.4 1.6V22L12 20.8 8.2 22v-1.4L10.6 19 9.8 12.8 2 14.4v-1.8l7.8-2.4z"/></svg>',
        iconSize: [34, 34],
        iconAnchor: [17, 17]
      }),
      zIndexOffset: 1000,
      keyboard: false
    }).bindTooltip(
      leg.sector + ' &middot; ' + leg.from.icao + ' &rarr; ' + leg.to.icao + ' &middot; ' + leg.status.label,
      { direction: 'top', offset: [0, -14], className: 'wf-map-tooltip' }
    );

    marker.addTo(aircraftGroup);
    state.aircraftMarkers.push(marker);
  }

  /* ── Leg list ────────────────────────────────────────────────────── */

  function renderLegList(model) {
    // The list is re-rendered on every status tick; keep the reading position.
    var scrollTop = elements.legList.scrollTop;
    elements.legList.innerHTML = '';
    state.rows = [];

    var filter = state.filter.trim().toUpperCase();
    var shown = 0;

    model.legs.forEach(function (leg, index) {
      var haystack = [leg.sector, leg.from.icao, leg.to.icao, leg.from.city, leg.to.city, leg.dateLabel]
        .join(' ').toUpperCase();

      if (filter && haystack.indexOf(filter) === -1) {
        state.rows.push(null);
        return;
      }

      shown += 1;

      var row = document.createElement('button');
      row.type = 'button';
      row.className = 'wf-leg-row';
      row.setAttribute('data-index', String(index));
      row.setAttribute('aria-pressed', state.selectedIndex === index ? 'true' : 'false');

      row.innerHTML =
        '<span class="wf-leg-row-sector">' + escapeHtml(leg.sector) + '</span>' +
        '<span class="wf-leg-row-route">' +
          '<b>' + escapeHtml(leg.from.icao) + '</b>' +
          '<span class="wf-leg-row-arrow" aria-hidden="true">&rarr;</span>' +
          '<b>' + escapeHtml(leg.to.icao) + '</b>' +
        '</span>' +
        '<span class="wf-leg-row-meta">' +
          escapeHtml(leg.dateLabel) + ' &middot; ' + escapeHtml(leg.departureWindow.open) + 'z' +
          (leg.distanceKm ? ' &middot; ' + escapeHtml(TCWF.formatKm(leg.distanceKm)) : '') +
        '</span>' +
        '<span class="wf-leg-row-status wf-tone-' + (leg.status ? leg.status.tone : 'idle') + '">' +
          escapeHtml(leg.status ? leg.status.label : 'Scheduled') +
        '</span>';

      row.addEventListener('click', function () { selectLeg(index, { fly: true }); });
      row.addEventListener('mouseenter', function () { emphasise(index, true); });
      row.addEventListener('mouseleave', function () { emphasise(index, false); });

      elements.legList.appendChild(row);
      state.rows.push(row);
    });

    if (!shown) {
      var empty = document.createElement('p');
      empty.className = 'wf-leg-empty';
      empty.textContent = 'No legs match "' + state.filter.trim() + '".';
      elements.legList.appendChild(empty);
    }

    if (elements.legCount) {
      elements.legCount.textContent = filter
        ? shown + ' of ' + model.legs.length + ' legs'
        : model.legs.length + ' legs';
    }

    elements.legList.scrollTop = scrollTop;
    syncRowSelection();
  }

  function syncRowSelection() {
    state.rows.forEach(function (row, index) {
      if (!row) { return; }
      var selected = state.selectedIndex === index;
      row.classList.toggle('is-selected', selected);
      row.setAttribute('aria-pressed', selected ? 'true' : 'false');
    });
  }

  function selectLeg(index, options) {
    var settings = options || {};
    var model = state.model;
    if (!model || !model.legs[index]) { return; }

    state.selectedIndex = state.selectedIndex === index && settings.toggle ? null : index;
    paintLegStyles();
    syncRowSelection();
    renderDetail();

    var row = state.rows[index];
    if (row && row.scrollIntoView) {
      row.scrollIntoView({ block: 'nearest' });
    }

    var record = state.legLayers[index];
    if (settings.fly !== false && record && record.lines.length) {
      // Middle copy is the unshifted one.
      map.fitBounds(record.lines[1].getBounds().pad(0.35), { animate: true, maxZoom: 6 });
    }
  }

  function renderDetail() {
    var model = state.model;
    var leg = model && state.selectedIndex !== null ? model.legs[state.selectedIndex] : null;

    if (!leg) {
      elements.detail.hidden = true;
      elements.detail.innerHTML = '';
      return;
    }

    var rows = [
      ['Date', leg.dateLabel],
      ['Departure window', leg.departureWindow.open + 'z - ' + leg.departureWindow.close + 'z'],
      ['Arrival window', leg.arrivalWindow.open + 'z - ' + leg.arrivalWindow.close + 'z'],
      ['Block time', leg.blockTime || '--'],
      ['Flight time', leg.flightTime || '--'],
      ['Distance', leg.distanceKm ? TCWF.formatKm(leg.distanceKm) + ' / ' + TCWF.formatNm(leg.distanceKm) : '--'],
      ['Initial track', leg.bearing === null ? '--' : Math.round(leg.bearing) + '° ' + TCWF.compassPoint(leg.bearing)],
      ['Flow control', leg.flowType === 'NONE' ? 'None' : leg.flowType + (leg.flowRate ? ' @ ' + leg.flowRate + '/hr' : '')]
    ];

    elements.detail.hidden = false;
    elements.detail.innerHTML =
      '<div class="wf-detail-head">' +
        '<div>' +
          '<p class="wf-detail-sector">' + escapeHtml(leg.sector) +
            (leg.isChallenge ? ' <span class="wf-detail-badge">Challenge</span>' : '') +
          '</p>' +
          '<p class="wf-detail-route">' + escapeHtml(leg.from.city || leg.from.icao) +
            ' <span aria-hidden="true">&rarr;</span> ' + escapeHtml(leg.to.city || leg.to.icao) + '</p>' +
          '<p class="wf-detail-airports">' + escapeHtml(leg.from.name) + ' &middot; ' + escapeHtml(leg.to.name) + '</p>' +
        '</div>' +
        '<button type="button" class="wf-detail-close" aria-label="Close leg details">&times;</button>' +
      '</div>' +
      '<dl class="wf-detail-grid">' +
        rows.map(function (pair) {
          return '<div><dt>' + escapeHtml(pair[0]) + '</dt><dd>' + escapeHtml(pair[1]) + '</dd></div>';
        }).join('') +
      '</dl>' +
      (leg.atcRoute
        ? '<div class="wf-detail-route-string"><dt>Filed route</dt><dd>' + escapeHtml(leg.atcRoute) + '</dd></div>'
        : '');

    var close = elements.detail.querySelector('.wf-detail-close');
    if (close) {
      close.addEventListener('click', function () {
        state.selectedIndex = null;
        paintLegStyles();
        syncRowSelection();
        renderDetail();
      });
    }
  }

  /* ── Header / stats ──────────────────────────────────────────────── */

  function renderSummary(model) {
    if (elements.eventName) {
      elements.eventName.textContent = model.event + ' route';
    }

    setText(elements.stats.distance, TCWF.formatKm(model.totalDistanceKm));
    setText(elements.stats.legs, String(model.legs.length));
    setText(elements.stats.airports, String(model.airports.length));
    setText(elements.stats.countries, String(model.countryCount));
    setText(elements.stats.airtime, TCWF.formatDuration(model.totalBlockMs));

    var percent = model.legs.length ? Math.round(model.completedLegs / model.legs.length * 100) : 0;
    if (elements.progressBar) {
      elements.progressBar.style.width = percent + '%';
      elements.progressBar.parentNode.setAttribute('aria-valuenow', String(percent));
    }
    if (elements.progressText) {
      elements.progressText.textContent = model.completedLegs + ' of ' + model.legs.length +
        ' legs complete (' + percent + '%)';
    }

    if (elements.statusPill) {
      var tone = 'idle';
      var label = 'Scheduled';

      if (model.isComplete) {
        tone = 'done';
        label = 'Event complete';
      } else if (model.activeLeg) {
        tone = 'active';
        label = model.activeLeg.status.label + ' · ' + model.activeLeg.sector;
      } else if (model.hasStarted) {
        tone = 'soon';
        label = 'Between sectors';
      } else if (model.nextLeg && model.nextLeg.departureOpen) {
        var untilMs = model.nextLeg.departureOpen - Date.now();
        label = 'Starts in ' + TCWF.formatDuration(untilMs);
      }

      elements.statusPill.className = 'wf-map-status-pill wf-tone-' + tone;
      elements.statusPill.textContent = label;
    }

    if (elements.updated) {
      var stamp = model.fetchedAt || model.generatedAt;
      elements.updated.textContent = stamp
        ? 'Schedule updated ' + TCWF.formatUtcTime(stamp) + 'z' + (model.stale ? ' (cached)' : '')
        : '';
    }
  }

  /* ── Controls ────────────────────────────────────────────────────── */

  function fitWholeRoute() {
    var model = state.model;
    if (!model) { return; }

    var located = model.airports.filter(function (airport) { return airport.located; });
    if (!located.length) { return; }

    map.fitBounds(L.latLngBounds(located.map(function (airport) {
      return [airport.lat, airport.lng];
    })).pad(0.08), { animate: true });
  }

  if (elements.buttons.fit) {
    elements.buttons.fit.addEventListener('click', function () {
      state.selectedIndex = null;
      paintLegStyles();
      syncRowSelection();
      renderDetail();
      fitWholeRoute();
    });
  }

  if (elements.buttons.live) {
    elements.buttons.live.addEventListener('click', function () {
      var model = state.model;
      if (!model) { return; }
      var target = model.activeLeg || model.nextLeg;
      if (target) {
        selectLeg(target.index, { fly: true });
      }
    });
  }

  if (elements.buttons.labels) {
    elements.buttons.labels.addEventListener('click', function () {
      state.labelsVisible = !state.labelsVisible;
      elements.buttons.labels.setAttribute('aria-pressed', state.labelsVisible ? 'true' : 'false');
      if (state.labelsVisible) {
        labelLayer.addTo(map);
      } else {
        map.removeLayer(labelLayer);
      }
    });
  }

  if (elements.legSearch) {
    elements.legSearch.addEventListener('input', function () {
      state.filter = elements.legSearch.value || '';
      if (state.model) {
        renderLegList(state.model);
      }
    });
  }

  /* ── Load / refresh ──────────────────────────────────────────────── */

  function setError(message) {
    if (!elements.error) { return; }

    if (!message) {
      elements.error.hidden = true;
      elements.error.textContent = '';
      return;
    }

    elements.error.hidden = false;
    elements.error.textContent = message;
  }

  function refreshLiveState() {
    if (!state.model) { return; }

    TCWF.applyStatus(state.model);
    paintLegStyles();
    drawAircraft(state.model);
    renderSummary(state.model);
    renderLegList(state.model);
  }

  function load(isInitial) {
    if (isInitial) {
      root.classList.add('is-loading');
    }

    return TCWF.loadSchedule({ forceFresh: !isInitial })
      .then(function (model) {
        state.model = model;
        root.classList.remove('is-loading');
        setError(model.missingAirports.length
          ? 'No coordinates on file for ' + model.missingAirports.join(', ') + '. Those legs are listed but not drawn.'
          : '');

        drawRoute(model);
        drawAircraft(model);
        renderSummary(model);
        renderLegList(model);
        renderDetail();

        if (isInitial) {
          fitWholeRoute();
        }
      })
      .catch(function (error) {
        root.classList.remove('is-loading');
        if (!state.model) {
          showFatal(error && error.message ? error.message : 'The schedule feed is unavailable.');
        } else {
          setError('Could not refresh the schedule: ' + (error && error.message ? error.message : 'unknown error') + '.');
        }
      });
  }

  function showFatal(message) {
    root.classList.remove('is-loading');
    root.classList.add('is-failed');
    var host = root.querySelector('#wf-map-fallback');
    if (host) {
      host.hidden = false;
      var text = host.querySelector('[data-fallback-message]');
      if (text) {
        text.textContent = message;
      }
    }
  }

  load(true);
  window.setInterval(function () { load(false); }, REFRESH_MS);
  window.setInterval(refreshLiveState, TICK_MS);

  // Leaflet needs a nudge if the card was laid out before fonts settled.
  window.addEventListener('load', function () { map.invalidateSize(); });

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
