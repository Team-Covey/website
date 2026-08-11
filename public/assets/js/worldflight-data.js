/*
 * Shared WorldFlight data layer.
 *
 * Loads the live schedule (proxied through the Worker at /api/worldflight/schedule
 * because the upstream planning API sends no CORS headers), resolves each sector
 * against the airport reference table below, and derives everything the map and
 * the flight board both need: real UTC timestamps, distances, bearings and
 * live status.
 *
 * Exposes a single global: window.TCWF
 */
(function (global) {
  'use strict';

  var SCHEDULE_ENDPOINT = '/api/worldflight/schedule';
  var REQUEST_TIMEOUT_MS = 12000;

  /* ── Airport reference data ──────────────────────────────────────────
   * Coordinates sourced from the OurAirports public dataset.
   * Any ICAO missing here still renders on the board; it is simply
   * skipped on the map and reported through model.missingAirports.
   */
  var AIRPORTS = {
    YSSY: { name: 'Sydney Kingsford Smith International Airport', city: 'Sydney', country: 'Australia', lat: -33.946098, lng: 151.177002 },
    WAAA: { name: 'Sultan Hasanuddin International Airport', city: 'Makassar', country: 'Indonesia', lat: -5.075539, lng: 119.553702 },
    WSSS: { name: 'Singapore Changi Airport', city: 'Singapore', country: 'Singapore', lat: 1.35019, lng: 103.994003 },
    VVDN: { name: 'Da Nang International Airport', city: 'Da Nang', country: 'Vietnam', lat: 16.0439, lng: 108.198997 },
    VHHH: { name: 'Hong Kong International Airport', city: 'Hong Kong', country: 'Hong Kong', lat: 22.31184, lng: 113.914862 },
    RCYU: { name: 'Hualien Chiashan Airport', city: 'Hualien', country: 'Taiwan', lat: 24.023163, lng: 121.617991 },
    RJGG: { name: 'Chubu Centrair International Airport', city: 'Nagoya', country: 'Japan', lat: 34.858398, lng: 136.804993 },
    ZKPY: { name: 'Pyongyang Sunan International Airport', city: 'Pyongyang', country: 'North Korea', lat: 39.224098, lng: 125.669998 },
    ZYHB: { name: 'Harbin Taiping International Airport', city: 'Harbin', country: 'China', lat: 45.623402, lng: 126.25 },
    UHHH: { name: 'Khabarovsk Novy Airport', city: 'Khabarovsk', country: 'Russia', lat: 48.528338, lng: 135.188588 },
    UHPP: { name: 'Yelizovo Airport', city: 'Petropavlovsk-Kamchatsky', country: 'Russia', lat: 53.168716, lng: 158.451068 },
    PADQ: { name: 'Kodiak Airport', city: 'Kodiak', country: 'United States', lat: 57.75, lng: -152.494003 },
    CYKA: { name: 'Kamloops Airport', city: 'Kamloops', country: 'Canada', lat: 50.703038, lng: -120.448641 },
    CYVR: { name: 'Vancouver International Airport', city: 'Vancouver', country: 'Canada', lat: 49.193901, lng: -123.183998 },
    KSLC: { name: 'Salt Lake City International Airport', city: 'Salt Lake City', country: 'United States', lat: 40.78886, lng: -111.979866 },
    MMMY: { name: 'Monterrey International Airport', city: 'Monterrey', country: 'Mexico', lat: 25.778521, lng: -100.106989 },
    MMGL: { name: 'Guadalajara International Airport', city: 'Guadalajara', country: 'Mexico', lat: 20.523342, lng: -103.310108 },
    MSLP: { name: 'El Salvador International Airport', city: 'San Salvador', country: 'El Salvador', lat: 13.44447, lng: -89.055784 },
    SKBO: { name: 'El Dorado International Airport', city: 'Bogota', country: 'Colombia', lat: 4.70159, lng: -74.1469 },
    TBPB: { name: 'Grantley Adams International Airport', city: 'Bridgetown', country: 'Barbados', lat: 13.074667, lng: -59.491034 },
    GVAC: { name: 'Amilcar Cabral International Airport', city: 'Sal', country: 'Cape Verde', lat: 16.7414, lng: -22.9494 },
    DNMM: { name: 'Murtala Muhammed International Airport', city: 'Lagos', country: 'Nigeria', lat: 6.57737, lng: 3.32116 },
    FKKD: { name: 'Douala International Airport', city: 'Douala', country: 'Cameroon', lat: 4.00608, lng: 9.71948 },
    FNBJ: { name: 'Dr. Antonio Agostinho Neto International Airport', city: 'Luanda', country: 'Angola', lat: -9.050734, lng: 13.499078 },
    HUEN: { name: 'Entebbe International Airport', city: 'Entebbe', country: 'Uganda', lat: 0.042386, lng: 32.443501 },
    HAAB: { name: 'Addis Ababa Bole International Airport', city: 'Addis Ababa', country: 'Ethiopia', lat: 8.97789, lng: 38.799301 },
    HESN: { name: 'Aswan International Airport', city: 'Aswan', country: 'Egypt', lat: 23.961075, lng: 32.820382 },
    OLBA: { name: 'Beirut Rafic Hariri International Airport', city: 'Beirut', country: 'Lebanon', lat: 33.819833, lng: 35.487443 },
    GMMN: { name: 'Mohammed V International Airport', city: 'Casablanca', country: 'Morocco', lat: 33.3675, lng: -7.58997 },
    LEMD: { name: 'Adolfo Suarez Madrid-Barajas Airport', city: 'Madrid', country: 'Spain', lat: 40.493407, lng: -3.572249 },
    EINN: { name: 'Shannon Airport', city: 'Shannon', country: 'Ireland', lat: 52.702, lng: -8.92482 },
    EGSS: { name: 'London Stansted Airport', city: 'London', country: 'United Kingdom', lat: 51.884998, lng: 0.235 },
    EHAM: { name: 'Amsterdam Airport Schiphol', city: 'Amsterdam', country: 'Netherlands', lat: 52.308601, lng: 4.76389 },
    LROP: { name: 'Henri Coanda International Airport', city: 'Bucharest', country: 'Romania', lat: 44.571792, lng: 26.103285 },
    LUKK: { name: 'Chisinau International Airport', city: 'Chisinau', country: 'Moldova', lat: 46.92774, lng: 28.931704 },
    ULLI: { name: 'Pulkovo Airport', city: 'St Petersburg', country: 'Russia', lat: 59.800301, lng: 30.262501 },
    UWWW: { name: 'Kurumoch International Airport', city: 'Samara', country: 'Russia', lat: 53.504902, lng: 50.164299 },
    OMDB: { name: 'Dubai International Airport', city: 'Dubai', country: 'United Arab Emirates', lat: 25.24979, lng: 55.370992 },
    ZULS: { name: 'Lhasa Gonggar International Airport', city: 'Lhasa', country: 'China', lat: 29.298001, lng: 90.911951 },
    VYYY: { name: 'Yangon International Airport', city: 'Yangon', country: 'Myanmar', lat: 16.907301, lng: 96.133202 },
    WIII: { name: 'Soekarno-Hatta International Airport', city: 'Jakarta', country: 'Indonesia', lat: -6.12557, lng: 106.655998 },
    YPKA: { name: 'Karratha Airport', city: 'Karratha', country: 'Australia', lat: -20.71222, lng: 116.773003 },
    YBAS: { name: 'Alice Springs Airport', city: 'Alice Springs', country: 'Australia', lat: -23.806588, lng: 133.903427 }
  };

  var MONTHS = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
  };

  var WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

  var EARTH_RADIUS_KM = 6371.0088;
  var KM_PER_NM = 1.852;
  var HOUR_MS = 3600000;
  var DAY_MS = 86400000;

  /* ── Geo helpers ─────────────────────────────────────────────────── */

  function toRadians(value) {
    return value * Math.PI / 180;
  }

  function toDegrees(value) {
    return value * 180 / Math.PI;
  }

  function haversineKm(from, to) {
    var dLat = toRadians(to.lat - from.lat);
    var dLng = toRadians(to.lng - from.lng);
    var lat1 = toRadians(from.lat);
    var lat2 = toRadians(to.lat);
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);
    return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function bearingDegrees(from, to) {
    var lat1 = toRadians(from.lat);
    var lat2 = toRadians(to.lat);
    var dLng = toRadians(to.lng - from.lng);
    var y = Math.sin(dLng) * Math.cos(lat2);
    var x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
    return (toDegrees(Math.atan2(y, x)) + 360) % 360;
  }

  function compassPoint(bearingDeg) {
    var points = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
      'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    return points[Math.round(((bearingDeg % 360) + 360) % 360 / 22.5) % 16];
  }

  /**
   * Point at `fraction` along the great circle from `from` to `to`.
   * Longitudes are returned unwrapped relative to `from` so a path can run
   * continuously across the antimeridian instead of snapping back across the map.
   */
  function interpolate(from, to, fraction) {
    var lat1 = toRadians(from.lat);
    var lng1 = toRadians(from.lng);
    var lat2 = toRadians(to.lat);
    var lng2 = toRadians(to.lng);

    var d = 2 * Math.asin(Math.sqrt(
      Math.pow(Math.sin((lat1 - lat2) / 2), 2) +
      Math.cos(lat1) * Math.cos(lat2) * Math.pow(Math.sin((lng1 - lng2) / 2), 2)
    ));

    if (!d) {
      return { lat: from.lat, lng: from.lng };
    }

    var a = Math.sin((1 - fraction) * d) / Math.sin(d);
    var b = Math.sin(fraction * d) / Math.sin(d);
    var x = a * Math.cos(lat1) * Math.cos(lng1) + b * Math.cos(lat2) * Math.cos(lng2);
    var y = a * Math.cos(lat1) * Math.sin(lng1) + b * Math.cos(lat2) * Math.sin(lng2);
    var z = a * Math.sin(lat1) + b * Math.sin(lat2);

    var lat = toDegrees(Math.atan2(z, Math.sqrt(x * x + y * y)));
    var lng = toDegrees(Math.atan2(y, x));

    return { lat: lat, lng: unwrapLongitude(from.lng, lng) };
  }

  /** Shift `lng` by whole turns so it stays within 180 degrees of `reference`. */
  function unwrapLongitude(reference, lng) {
    var out = lng;
    while (out - reference > 180) { out -= 360; }
    while (out - reference < -180) { out += 360; }
    return out;
  }

  /** Great-circle polyline between two airports, safe to hand straight to Leaflet. */
  function greatCirclePoints(from, to, segments) {
    var count = Math.max(8, segments || 64);
    var points = [];
    var previousLng = from.lng;

    for (var i = 0; i <= count; i += 1) {
      var point = interpolate(from, to, i / count);
      point.lng = unwrapLongitude(previousLng, point.lng);
      previousLng = point.lng;
      points.push([point.lat, point.lng]);
    }

    return points;
  }

  /* ── Formatting helpers ──────────────────────────────────────────── */

  function formatKm(km) {
    return Math.round(km).toLocaleString('en-AU') + ' km';
  }

  function formatNm(km) {
    return Math.round(km / KM_PER_NM).toLocaleString('en-AU') + ' nm';
  }

  /** Milliseconds to `H:MM`, or `D d H h` once past a day. */
  function formatDuration(ms) {
    if (!isFinite(ms) || ms < 0) {
      return '--';
    }

    var totalMinutes = Math.floor(ms / 60000);
    var days = Math.floor(totalMinutes / 1440);
    var hours = Math.floor((totalMinutes % 1440) / 60);
    var minutes = totalMinutes % 60;

    if (days > 0) {
      return days + 'd ' + hours + 'h';
    }

    return hours + ':' + pad2(minutes);
  }

  function pad2(value) {
    return String(value).padStart(2, '0');
  }

  function formatUtcTime(timestamp) {
    if (!timestamp) {
      return '--:--';
    }
    var date = new Date(timestamp);
    return pad2(date.getUTCHours()) + ':' + pad2(date.getUTCMinutes());
  }

  function formatLocalTime(timestamp) {
    if (!timestamp) {
      return '--:--';
    }
    var date = new Date(timestamp);
    return pad2(date.getHours()) + ':' + pad2(date.getMinutes());
  }

  /* ── Schedule parsing ────────────────────────────────────────────── */

  /** "Sat 31st Oct" -> { weekday: 6, day: 31, month: 9 } */
  function parseDateLabel(label) {
    var text = String(label || '').toLowerCase();
    var dayMatch = text.match(/(\d{1,2})\s*(?:st|nd|rd|th)?/);
    var monthMatch = text.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/);
    var weekdayMatch = text.match(/(sun|mon|tue|wed|thu|fri|sat)/);

    if (!dayMatch || !monthMatch) {
      return null;
    }

    return {
      day: parseInt(dayMatch[1], 10),
      month: MONTHS[monthMatch[1]],
      weekday: weekdayMatch ? WEEKDAYS.indexOf(weekdayMatch[1]) : -1
    };
  }

  /** "06:40" -> minutes since midnight. */
  function parseClock(value) {
    var match = String(value || '').match(/^(\d{1,2}):(\d{2})$/);
    if (!match) {
      return null;
    }
    return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
  }

  function parseDurationMs(value) {
    var minutes = parseClock(value);
    return minutes === null ? null : minutes * 60000;
  }

  /**
   * The API dates carry no year, so infer one and sanity-check it against the
   * weekday the API reports. Tries the event title first, then generatedAt.
   */
  function resolveBaseYear(payload, firstDate) {
    var candidates = [];
    var eventYear = String(payload && payload.event || '').match(/(20\d{2})/);
    if (eventYear) {
      candidates.push(parseInt(eventYear[1], 10));
    }

    var generatedYear = Date.parse(String(payload && payload.generatedAt || ''));
    if (!isNaN(generatedYear)) {
      var year = new Date(generatedYear).getUTCFullYear();
      candidates.push(year, year + 1);
    }

    candidates.push(new Date().getUTCFullYear());

    if (!firstDate || firstDate.weekday < 0) {
      return candidates[0];
    }

    for (var i = 0; i < candidates.length; i += 1) {
      var probe = new Date(Date.UTC(candidates[i], firstDate.month, firstDate.day));
      if (probe.getUTCDay() === firstDate.weekday) {
        return candidates[i];
      }
    }

    return candidates[0];
  }

  /**
   * Turns a raw API sector into a fully derived leg: real UTC timestamps for
   * both windows, resolved airports, distance and bearing.
   */
  function buildLeg(raw, index, context) {
    var parsedDate = parseDateLabel(raw.dateUtc);
    var depOpenMinutes = parseClock(raw.departureWindow && raw.departureWindow.open);
    var depCloseMinutes = parseClock(raw.departureWindow && raw.departureWindow.close);
    var arrOpenMinutes = parseClock(raw.arrivalWindow && raw.arrivalWindow.open);
    var arrCloseMinutes = parseClock(raw.arrivalWindow && raw.arrivalWindow.close);

    var depOpen = null;
    var depClose = null;
    var arrOpen = null;
    var arrClose = null;

    if (parsedDate && depOpenMinutes !== null) {
      var year = context.baseYear;
      // Roll into the next calendar year once the month wraps (Dec -> Jan).
      if (context.firstMonth !== null && parsedDate.month < context.firstMonth) {
        year += 1;
      }

      depOpen = Date.UTC(year, parsedDate.month, parsedDate.day) + depOpenMinutes * 60000;

      // Sectors are published in order; keep departures monotonic even if a
      // date label is malformed.
      while (context.previousDeparture && depOpen < context.previousDeparture) {
        depOpen += DAY_MS;
      }
      context.previousDeparture = depOpen;

      depClose = advanceTo(depOpen, depCloseMinutes);
      arrOpen = advanceTo(depOpen, arrOpenMinutes);
      arrClose = advanceTo(arrOpen === null ? depOpen : arrOpen, arrCloseMinutes);
    }

    var from = resolveAirport(raw.from);
    var to = resolveAirport(raw.to);
    var distanceKm = from.located && to.located ? haversineKm(from, to) : null;

    return {
      index: index,
      sector: String(raw.sector || '').trim() || 'WF' + pad2(index + 1),
      dateLabel: String(raw.dateUtc || '').trim(),
      from: from,
      to: to,
      departureWindow: windowStrings(raw.departureWindow),
      arrivalWindow: windowStrings(raw.arrivalWindow),
      departureOpen: depOpen,
      departureClose: depClose,
      arrivalOpen: arrOpen,
      arrivalClose: arrClose,
      blockTime: String(raw.blockTime || '').trim() || null,
      flightTime: String(raw.flightTime || '').trim() || null,
      blockTimeMs: parseDurationMs(raw.blockTime),
      flightTimeMs: parseDurationMs(raw.flightTime),
      atcRoute: typeof raw.atcRoute === 'string' && raw.atcRoute.trim() ? raw.atcRoute.trim() : null,
      isChallenge: raw.isWfChallenge === true,
      flowType: String(raw.flowType || 'NONE').trim().toUpperCase(),
      flowRate: typeof raw.flowRate === 'number' ? raw.flowRate : null,
      distanceKm: distanceKm,
      bearing: from.located && to.located ? bearingDegrees(from, to) : null,
      // Filled in by applyStatus()
      status: null,
      progress: 0
    };
  }

  /** First timestamp at or after `fromTimestamp` whose UTC clock reads `minutes`. */
  function advanceTo(fromTimestamp, minutes) {
    if (fromTimestamp === null || minutes === null) {
      return null;
    }

    var dayStart = Math.floor(fromTimestamp / DAY_MS) * DAY_MS;
    var candidate = dayStart + minutes * 60000;
    while (candidate < fromTimestamp) {
      candidate += DAY_MS;
    }
    return candidate;
  }

  function windowStrings(win) {
    return {
      open: win && typeof win.open === 'string' ? win.open : '--:--',
      close: win && typeof win.close === 'string' ? win.close : '--:--'
    };
  }

  function resolveAirport(icao) {
    var code = String(icao || '').trim().toUpperCase();
    var reference = AIRPORTS[code];

    if (!reference) {
      return { icao: code || '????', name: code || 'Unknown', city: '', country: '', lat: null, lng: null, located: false };
    }

    return {
      icao: code,
      name: reference.name,
      city: reference.city,
      country: reference.country,
      lat: reference.lat,
      lng: reference.lng,
      located: true
    };
  }

  var STATUS = {
    SCHEDULED: { key: 'scheduled', label: 'Scheduled', tone: 'idle' },
    BOARDING: { key: 'boarding', label: 'Boarding', tone: 'soon' },
    DEPARTING: { key: 'departing', label: 'Departing', tone: 'active' },
    ENROUTE: { key: 'enroute', label: 'En Route', tone: 'active' },
    ARRIVING: { key: 'arriving', label: 'Arriving', tone: 'active' },
    ARRIVED: { key: 'arrived', label: 'Arrived', tone: 'done' },
    UNKNOWN: { key: 'unknown', label: 'Scheduled', tone: 'idle' }
  };

  var BOARDING_LEAD_MS = HOUR_MS;

  /** Recomputes live status for every leg. Cheap enough to run on a timer. */
  function applyStatus(model, nowMs) {
    var now = typeof nowMs === 'number' ? nowMs : Date.now();
    var activeLeg = null;
    var nextLeg = null;
    var completed = 0;

    model.legs.forEach(function (leg) {
      if (leg.departureOpen === null) {
        leg.status = STATUS.UNKNOWN;
        leg.progress = 0;
        return;
      }

      var depClose = leg.departureClose === null ? leg.departureOpen : leg.departureClose;
      var arrOpen = leg.arrivalOpen === null ? depClose : leg.arrivalOpen;
      var arrClose = leg.arrivalClose === null ? arrOpen : leg.arrivalClose;

      if (now >= arrClose) {
        leg.status = STATUS.ARRIVED;
        leg.progress = 1;
        completed += 1;
      } else if (now >= arrOpen) {
        leg.status = STATUS.ARRIVING;
        leg.progress = 0.95;
      } else if (now >= depClose) {
        leg.status = STATUS.ENROUTE;
        leg.progress = clamp01((now - depClose) / Math.max(1, arrOpen - depClose)) * 0.9 + 0.05;
      } else if (now >= leg.departureOpen) {
        leg.status = STATUS.DEPARTING;
        leg.progress = 0.02;
      } else if (now >= leg.departureOpen - BOARDING_LEAD_MS) {
        leg.status = STATUS.BOARDING;
        leg.progress = 0;
      } else {
        leg.status = STATUS.SCHEDULED;
        leg.progress = 0;
      }

      if (!activeLeg && leg.status.tone === 'active') {
        activeLeg = leg;
      }
      if (!nextLeg && leg.status !== STATUS.ARRIVED) {
        nextLeg = leg;
      }
    });

    model.now = now;
    model.activeLeg = activeLeg;
    model.nextLeg = nextLeg;
    model.completedLegs = completed;
    model.isComplete = completed === model.legs.length && model.legs.length > 0;
    model.hasStarted = completed > 0 || Boolean(activeLeg);

    return model;
  }

  function clamp01(value) {
    if (!isFinite(value)) { return 0; }
    return Math.min(1, Math.max(0, value));
  }

  /** Raw API payload -> the model every page renders from. */
  function buildModel(payload) {
    var sectors = Array.isArray(payload && payload.sectors) ? payload.sectors : [];
    var firstDate = sectors.length ? parseDateLabel(sectors[0].dateUtc) : null;

    var context = {
      baseYear: resolveBaseYear(payload, firstDate),
      firstMonth: firstDate ? firstDate.month : null,
      previousDeparture: null
    };

    var legs = sectors.map(function (raw, index) {
      return buildLeg(raw, index, context);
    });

    var airports = [];
    var seen = {};
    var countries = {};
    var missingAirports = [];
    var totalDistanceKm = 0;
    var totalBlockMs = 0;

    legs.forEach(function (leg) {
      [leg.from, leg.to].forEach(function (airport) {
        if (!seen[airport.icao]) {
          seen[airport.icao] = true;
          airports.push(airport);
          if (airport.located) {
            countries[airport.country] = true;
          } else {
            missingAirports.push(airport.icao);
          }
        }
      });

      if (leg.distanceKm) {
        totalDistanceKm += leg.distanceKm;
      }
      if (leg.blockTimeMs) {
        totalBlockMs += leg.blockTimeMs;
      }
    });

    var days = [];
    var dayIndex = {};
    legs.forEach(function (leg) {
      if (!dayIndex[leg.dateLabel]) {
        dayIndex[leg.dateLabel] = { label: leg.dateLabel, legs: [] };
        days.push(dayIndex[leg.dateLabel]);
      }
      dayIndex[leg.dateLabel].legs.push(leg);
    });

    var model = {
      event: String(payload && payload.event || 'WorldFlight').trim(),
      generatedAt: payload && payload.generatedAt ? Date.parse(payload.generatedAt) || null : null,
      fetchedAt: payload && payload.fetchedAt ? Date.parse(payload.fetchedAt) || null : null,
      stale: Boolean(payload && payload.stale),
      legs: legs,
      days: days,
      airports: airports,
      missingAirports: missingAirports,
      countryCount: Object.keys(countries).length,
      totalDistanceKm: totalDistanceKm,
      totalBlockMs: totalBlockMs,
      startsAt: legs.length ? legs[0].departureOpen : null,
      endsAt: legs.length ? legs[legs.length - 1].arrivalClose : null,
      origin: legs.length ? legs[0].from : null,
      destination: legs.length ? legs[legs.length - 1].to : null
    };

    return applyStatus(model);
  }

  /* ── Loading ─────────────────────────────────────────────────────── */

  function loadSchedule(options) {
    var settings = options || {};

    if (!global.fetch) {
      return Promise.reject(new Error('This browser does not support fetch().'));
    }

    var controller = typeof AbortController === 'function' ? new AbortController() : null;
    var timeoutId = controller ? global.setTimeout(function () {
      controller.abort();
    }, REQUEST_TIMEOUT_MS) : null;

    var request = {
      cache: settings.forceFresh ? 'reload' : 'default',
      headers: { Accept: 'application/json' }
    };
    if (controller) {
      request.signal = controller.signal;
    }

    return global.fetch(SCHEDULE_ENDPOINT, request)
      .then(function (response) {
        if (!response.ok) {
          return response.json()
            .catch(function () { return {}; })
            .then(function (body) {
              throw new Error(body && body.message ? body.message : 'Schedule request failed (' + response.status + ').');
            });
        }
        return response.json();
      })
      .then(function (payload) {
        if (!payload || !Array.isArray(payload.sectors) || !payload.sectors.length) {
          throw new Error('The schedule feed returned no sectors.');
        }
        return buildModel(payload);
      })
      .finally(function () {
        if (timeoutId) {
          global.clearTimeout(timeoutId);
        }
      });
  }

  global.TCWF = {
    AIRPORTS: AIRPORTS,
    STATUS: STATUS,
    KM_PER_NM: KM_PER_NM,
    loadSchedule: loadSchedule,
    buildModel: buildModel,
    applyStatus: applyStatus,
    resolveAirport: resolveAirport,
    haversineKm: haversineKm,
    bearingDegrees: bearingDegrees,
    compassPoint: compassPoint,
    greatCirclePoints: greatCirclePoints,
    interpolate: interpolate,
    unwrapLongitude: unwrapLongitude,
    formatKm: formatKm,
    formatNm: formatNm,
    formatDuration: formatDuration,
    formatUtcTime: formatUtcTime,
    formatLocalTime: formatLocalTime,
    pad2: pad2
  };
})(window);
