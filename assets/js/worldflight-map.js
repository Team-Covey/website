(function () {
  var mapElement = document.getElementById('worldflight-route-map');
  if (!mapElement || typeof window.L === 'undefined') {
    return;
  }

  // Configure the route here in ICAO order.
  // Base route loaded from WorldFlight 2025 map.
  var routeCodes = [
    'YSSY', // Sydney
    'NZAA', // Auckland
    'NZCH', // Christchurch
    'NZFX', // Phoenix Airfield
    'SCGC', // Union Glacier
    'SCCI', // Punta Arenas
    'SCEL', // Santiago
    'SBGR', // Sao Paulo
    'SBPV', // Porto Velho
    'SKBO', // Bogota
    'MPTO', // Tocumen
    'MMUN', // Cancun
    'KDTW', // Detroit
    'KEWR', // Newark
    'CYHZ', // Halifax
    'CYYR', // Goose Bay
    'BGTL', // Thule / Pituffik
    'EGPF', // Glasgow
    'LFPG', // Paris
    'LIRU', // Rome
    'DAAG', // Algiers
    'LIMC', // Milan
    'LBSF', // Sofia
    'LTFM', // Istanbul
    'OJAI', // Amman
    'UBBB', // Baku
    'OAKB', // Kabul
    'VABB', // Mumbai
    'VNKT', // Kathmandu
    'UNNT', // Novosibirsk
    'UEEE', // Yakutsk
    'ZBAD', // Beijing
    'RKSI', // Incheon
    'RJBB', // Osaka
    'ROAH', // Naha
    'VHHH', // Hong Kong
    'VTBD', // Bangkok
    'WSSS', // Singapore
    'WIII', // Jakarta
    'WALL', // Balikpapan
    'WADD', // Bali
    'YPDN', // Darwin
    'WAJJ', // Jayapura
    'YBCS', // Cairns
    'YBBN', // Brisbane
    'YSSY'  // Sydney
  ];

  // Airport reference data keyed by ICAO code.
  var airportData = {
    YSSY: { name: 'Sydney Kingsford Smith International', city: 'Sydney, AU', lat: -33.946098, lng: 151.177002 },
    NZAA: { name: 'Auckland International', city: 'Auckland, NZ', lat: -37.01199, lng: 174.786331 },
    NZCH: { name: 'Christchurch International', city: 'Christchurch, NZ', lat: -43.489029, lng: 172.532065 },
    NZFX: { name: 'Phoenix Airfield', city: 'McMurdo Station, AQ', lat: -77.956389, lng: 166.766667 },
    SCGC: { name: 'Union Glacier Blue-Ice Runway', city: 'Union Glacier, AQ', lat: -79.777778, lng: -83.320833 },
    SCCI: { name: 'Pres. Carlos Ibanez Intl', city: 'Punta Arenas, CL', lat: -53.002602, lng: -70.854599 },
    SCEL: { name: 'Arturo Merino Benitez Intl', city: 'Santiago, CL', lat: -33.393002, lng: -70.785797 },
    SBGR: { name: 'Sao Paulo Guarulhos Intl', city: 'Sao Paulo, BR', lat: -23.431274, lng: -46.469954 },
    SBPV: { name: 'Gov. Jorge Teixeira Intl', city: 'Porto Velho, BR', lat: -8.708491, lng: -63.902338 },
    SKBO: { name: 'El Dorado International', city: 'Bogota, CO', lat: 4.70159, lng: -74.1469 },
    MPTO: { name: 'Tocumen International', city: 'Panama City, PA', lat: 9.07136, lng: -79.383499 },
    MMUN: { name: 'Cancun International', city: 'Cancun, MX', lat: 21.040817, lng: -86.87347 },
    KDTW: { name: 'Detroit Metropolitan Wayne County', city: 'Detroit, US', lat: 42.21377, lng: -83.353786 },
    KEWR: { name: 'Newark Liberty International', city: 'Newark, US', lat: 40.6894, lng: -74.170545 },
    CYHZ: { name: 'Halifax Stanfield International', city: 'Halifax, CA', lat: 44.880798, lng: -63.508598 },
    CYYR: { name: 'Goose Bay Airport', city: 'Goose Bay, CA', lat: 53.319199, lng: -60.4258 },
    BGTL: { name: 'Pituffik Space Base', city: 'Pituffik, GL', lat: 76.53063, lng: -68.700541 },
    EGPF: { name: 'Glasgow Airport', city: 'Glasgow, GB', lat: 55.871899, lng: -4.43306 },
    LFPG: { name: 'Charles de Gaulle International', city: 'Paris, FR', lat: 49.00896, lng: 2.554117 },
    LIRU: { name: 'Rome Urbe Airport', city: 'Rome, IT', lat: 41.952096, lng: 12.502231 },
    DAAG: { name: 'Houari Boumediene Airport', city: 'Algiers, DZ', lat: 36.693886, lng: 3.214531 },
    LIMC: { name: 'Milan Malpensa International', city: 'Milan, IT', lat: 45.6306, lng: 8.72811 },
    LBSF: { name: 'Sofia Airport', city: 'Sofia, BG', lat: 42.696357, lng: 23.417671 },
    LTFM: { name: 'Istanbul Airport', city: 'Istanbul, TR', lat: 41.274874, lng: 28.732136 },
    OJAI: { name: 'Queen Alia International', city: 'Amman, JO', lat: 31.722601, lng: 35.993198 },
    UBBB: { name: 'Heydar Aliyev International', city: 'Baku, AZ', lat: 40.467499, lng: 50.0467 },
    OAKB: { name: 'Kabul International', city: 'Kabul, AF', lat: 34.565899, lng: 69.212303 },
    VABB: { name: 'Chhatrapati Shivaji Maharaj Intl', city: 'Mumbai, IN', lat: 19.088699, lng: 72.867897 },
    VNKT: { name: 'Tribhuvan International', city: 'Kathmandu, NP', lat: 27.6966, lng: 85.3591 },
    UNNT: { name: 'Novosibirsk Tolmachevo Airport', city: 'Novosibirsk, RU', lat: 55.019756, lng: 82.618675 },
    UEEE: { name: 'Yakutsk International', city: 'Yakutsk, RU', lat: 62.0933, lng: 129.770996 },
    ZBAD: { name: 'Beijing Daxing International', city: 'Beijing, CN', lat: 39.501289, lng: 116.413967 },
    RKSI: { name: 'Incheon International Airport', city: 'Incheon, KR', lat: 37.469101, lng: 126.450996 },
    RJBB: { name: 'Kansai International', city: 'Osaka, JP', lat: 34.427299, lng: 135.244003 },
    ROAH: { name: 'Naha International Airport', city: 'Naha, JP', lat: 26.192437, lng: 127.639804 },
    VHHH: { name: 'Hong Kong International', city: 'Hong Kong, HK', lat: 22.31184, lng: 113.914862 },
    VTBD: { name: 'Don Mueang International', city: 'Bangkok, TH', lat: 13.9126, lng: 100.607002 },
    WSSS: { name: 'Singapore Changi Airport', city: 'Singapore, SG', lat: 1.35019, lng: 103.994003 },
    WIII: { name: 'Soekarno-Hatta International', city: 'Jakarta, ID', lat: -6.12557, lng: 106.655998 },
    WALL: { name: 'SAMS Sepinggan International', city: 'Balikpapan, ID', lat: -1.268342, lng: 116.89452 },
    WADD: { name: 'I Gusti Ngurah Rai International', city: 'Bali, ID', lat: -8.748409, lng: 115.167123 },
    YPDN: { name: 'Darwin International Airport', city: 'Darwin, AU', lat: -12.41497, lng: 130.88185 },
    WAJJ: { name: 'Dortheys Hiyo Eluay International', city: 'Jayapura, ID', lat: -2.579627, lng: 140.519857 },
    YBCS: { name: 'Cairns International Airport', city: 'Cairns, AU', lat: -16.878921, lng: 145.74948 },
    YBBN: { name: 'Brisbane International Airport', city: 'Brisbane, AU', lat: -27.384199, lng: 153.117004 }
  };

  var resolvedRoute = [];
  var missingIcaos = [];

  routeCodes.forEach(function (icao) {
    var airport = airportData[icao];
    if (!airport) {
      missingIcaos.push(icao);
      return;
    }
    resolvedRoute.push({
      icao: icao,
      name: airport.name,
      city: airport.city,
      lat: airport.lat,
      lng: airport.lng
    });
  });

  if (resolvedRoute.length < 2) {
    mapElement.innerHTML = '<p class="wf-route-warning">Not enough mapped airports to draw a route.</p>';
    return;
  }

  var map = L.map(mapElement, {
    scrollWheelZoom: false,
    worldCopyJump: true
  });

  var isDark = document.documentElement.getAttribute('data-theme') !== 'light';
  var tileUrl = isDark
    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';

  L.tileLayer(tileUrl, {
    maxZoom: 8,
    minZoom: 2,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
  }).addTo(map);

  var routeLatLngs = resolvedRoute.map(function (airport) {
    return [airport.lat, airport.lng];
  });

  var routePolyline = L.polyline(routeLatLngs, {
    color: '#2b7de9',
    weight: 3,
    opacity: 0.95
  }).addTo(map);

  resolvedRoute.forEach(function (airport, index) {
    var marker = L.marker([airport.lat, airport.lng], {
      icon: L.divIcon({
        className: 'wf-route-marker',
        html: '<span>' + (index + 1) + '</span>',
        iconSize: [26, 26],
        iconAnchor: [13, 13],
        popupAnchor: [0, -12]
      })
    }).addTo(map);

    var next = resolvedRoute[index + 1];
    var legLabel = next
      ? 'Leg ' + (index + 1) + ': ' + airport.icao + ' to ' + next.icao
      : 'Final destination';

    marker.bindPopup(
      '<strong>' + airport.icao + '</strong><br>' +
      airport.name + '<br>' +
      airport.city + '<br><small>' + legLabel + '</small>'
    );
  });

  map.fitBounds(routePolyline.getBounds().pad(0.18));

  mapElement.addEventListener('mouseenter', function () {
    map.scrollWheelZoom.enable();
  });

  mapElement.addEventListener('mouseleave', function () {
    map.scrollWheelZoom.disable();
  });

  var totalDistanceKm = 0;
  for (var i = 0; i < resolvedRoute.length - 1; i += 1) {
    totalDistanceKm += haversineKm(resolvedRoute[i], resolvedRoute[i + 1]);
  }

  setText('wf-route-legs', String(Math.max(0, resolvedRoute.length - 1)));
  setText('wf-route-airports', String(resolvedRoute.length));
  setText('wf-route-distance', formatKm(totalDistanceKm));
  fillLegList(resolvedRoute);
  showMissingWarning(missingIcaos);

  function setText(id, value) {
    var node = document.getElementById(id);
    if (node) {
      node.textContent = value;
    }
  }

  function fillLegList(route) {
    var list = document.getElementById('wf-route-list');
    if (!list) {
      return;
    }
    list.innerHTML = '';

    for (var legIndex = 0; legIndex < route.length - 1; legIndex += 1) {
      var fromAirport = route[legIndex];
      var toAirport = route[legIndex + 1];
      var legDistanceKm = haversineKm(fromAirport, toAirport);

      var item = document.createElement('li');

      var codes = document.createElement('span');
      codes.className = 'wf-leg-codes';
      codes.innerHTML =
        '<strong>' + fromAirport.icao + '</strong> to <strong>' + toAirport.icao + '</strong>';

      var distance = document.createElement('span');
      distance.className = 'wf-leg-distance';
      distance.textContent = formatKm(legDistanceKm);

      item.appendChild(codes);
      item.appendChild(distance);
      list.appendChild(item);
    }
  }

  function showMissingWarning(codes) {
    var warning = document.getElementById('wf-route-warning');
    if (!warning) {
      return;
    }

    if (!codes.length) {
      warning.hidden = true;
      return;
    }

    warning.hidden = false;
    warning.textContent = 'Missing airport data for: ' + codes.join(', ');
  }

  function haversineKm(fromAirport, toAirport) {
    var earthRadiusKm = 6371;
    var dLat = toRadians(toAirport.lat - fromAirport.lat);
    var dLng = toRadians(toAirport.lng - fromAirport.lng);
    var lat1 = toRadians(fromAirport.lat);
    var lat2 = toRadians(toAirport.lat);

    var a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return earthRadiusKm * c;
  }

  function toRadians(value) {
    return value * (Math.PI / 180);
  }

  function formatKm(distanceKm) {
    return Math.round(distanceKm).toLocaleString() + ' km';
  }
})();
