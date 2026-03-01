(function () {
  var toggle = document.getElementById('nav-toggle');
  var nav = document.getElementById('main-nav');
  var themeToggle = document.getElementById('theme-toggle');
  var dropdowns = document.querySelectorAll('.nav-dropdown');

  function setNavOpen(open) {
    if (!toggle || !nav) {
      return;
    }

    nav.classList.toggle('open', open);
    toggle.classList.toggle('open', open);
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    document.body.classList.toggle('nav-open', open);

    if (!open) {
      closeAllDropdowns();
    }
  }

  function closeNav() {
    setNavOpen(false);
  }

  function closeDropdown(dropdown) {
    if (!dropdown) {
      return;
    }

    dropdown.classList.remove('open');
    var dropdownToggle = dropdown.querySelector('.nav-dropdown-toggle');
    if (dropdownToggle) {
      dropdownToggle.setAttribute('aria-expanded', 'false');
    }
  }

  function closeAllDropdowns(exceptDropdown) {
    dropdowns.forEach(function (dropdown) {
      if (dropdown !== exceptDropdown) {
        closeDropdown(dropdown);
      }
    });
  }

  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      var open = !nav.classList.contains('open');
      setNavOpen(open);
    });

    nav.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        closeNav();
      });
    });

    document.addEventListener('click', function (event) {
      if (!nav.classList.contains('open')) {
        return;
      }

      if (event.target.closest('#main-nav') || event.target.closest('#nav-toggle')) {
        return;
      }

      closeNav();
    });

    window.addEventListener('resize', function () {
      if (window.innerWidth > 920 && nav.classList.contains('open')) {
        closeNav();
      }
    });
  }

  if (dropdowns.length) {
    dropdowns.forEach(function (dropdown) {
      var dropdownToggle = dropdown.querySelector('.nav-dropdown-toggle');
      if (!dropdownToggle) {
        return;
      }

      dropdownToggle.addEventListener('click', function (event) {
        event.preventDefault();

        var willOpen = !dropdown.classList.contains('open');
        closeAllDropdowns(dropdown);
        dropdown.classList.toggle('open', willOpen);
        dropdownToggle.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
      });
    });

    document.addEventListener('click', function (event) {
      if (!event.target.closest('.nav-dropdown')) {
        closeAllDropdowns();
      }
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        closeNav();
      }
    });
  }

  document.querySelectorAll('a[data-placeholder="true"]').forEach(function (link) {
    link.addEventListener('click', function (event) {
      event.preventDefault();
    });
  });

  if (themeToggle) {
    themeToggle.addEventListener('click', function () {
      var current = document.documentElement.getAttribute('data-theme');
      var next = current === 'light' ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('tcwf-theme', next);
    });
  }

  initHeroCarousel();
  initVatsimStatus();
  initWorldFlightCountdown();

  function initHeroCarousel() {
    var heroBg = document.querySelector('.hero-bg');
    if (!heroBg) {
      return;
    }

    var imageUrls = [
      '/images/carousel/background.JPG',
      '/images/carousel/1d93b494-fdc2-43cf-ada9-ad2e134f120e.jpg',
      '/images/carousel/4a9f85ba-851c-4018-9f3d-da28ba6244bd.jpg',
      '/images/carousel/68eda805-60f2-4537-85e1-7a89dbf30516.jpg',
      '/images/carousel/70ddfa56-19fe-4975-8ea4-1a047e0b49ff.jpg',
      '/images/carousel/de28a622-8b52-4cb3-95a9-9ef17df50a8b.jpg'
    ];

    if (!imageUrls.length) {
      return;
    }

    heroBg.innerHTML = '';

    var slides = [];
    imageUrls.forEach(function (url, index) {
      var slide = document.createElement('span');
      slide.className = 'hero-bg-slide';
      slide.style.backgroundImage = 'url("' + url + '")';
      if (index === 0) {
        slide.classList.add('is-active');
      }
      heroBg.appendChild(slide);
      slides.push(slide);
    });

    if (slides.length < 2) {
      return;
    }

    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }

    var activeIndex = 0;
    var rotateMs = 3000;

    window.setInterval(function () {
      activeIndex = (activeIndex + 1) % slides.length;
      slides.forEach(function (slide, index) {
        slide.classList.toggle('is-active', index === activeIndex);
      });
    }, rotateMs);
  }

  function initVatsimStatus() {
    if (!window.fetch) {
      return;
    }

    var headerRight = document.querySelector('.header-right');
    if (!headerRight) {
      return;
    }

    var callsign = 'CVY44N';
    var statusUrl = 'https://data.vatsim.net/v3/vatsim-data.json';
    var refreshMs = 60000;

    var statusNode = document.createElement('div');
    statusNode.className = 'vatsim-status is-loading';
    statusNode.setAttribute('role', 'status');
    statusNode.setAttribute('aria-live', 'polite');
    statusNode.innerHTML =
      '<span class="vatsim-status-dot" aria-hidden="true"></span>' +
      '<span class="vatsim-status-label"></span>' +
      '<span class="vatsim-status-route"></span>';

    var liveButton = headerRight.querySelector('.btn-live');
    var navToggleButton = headerRight.querySelector('.nav-toggle');
    if (liveButton && liveButton.parentNode === headerRight) {
      headerRight.insertBefore(statusNode, liveButton.nextSibling);
    } else {
      headerRight.insertBefore(statusNode, navToggleButton || null);
    }

    var labelNode = statusNode.querySelector('.vatsim-status-label');
    var routeNode = statusNode.querySelector('.vatsim-status-route');

    function setStatus(stateClass, labelText, routeText, titleText) {
      statusNode.classList.remove('is-loading', 'is-online', 'is-offline', 'is-error');
      statusNode.classList.add(stateClass);

      if (labelNode) {
        labelNode.textContent = labelText;
      }

      if (routeNode) {
        routeNode.textContent = routeText ? ' ' + routeText : '';
        routeNode.hidden = !routeText;
      }

      var summary = labelText + (routeText ? ' ' + routeText : '');
      statusNode.setAttribute('aria-label', summary);
      if (titleText) {
        statusNode.title = titleText;
      } else {
        statusNode.title = summary;
      }
    }

    function findPilotByCallsign(payload) {
      if (!payload || !Array.isArray(payload.pilots)) {
        return null;
      }

      for (var i = 0; i < payload.pilots.length; i += 1) {
        var pilot = payload.pilots[i];
        if (!pilot) {
          continue;
        }

        if (String(pilot.callsign || '').toUpperCase() === callsign) {
          return pilot;
        }
      }

      return null;
    }

    function routeForPilot(pilot) {
      var flightPlan = pilot && pilot.flight_plan ? pilot.flight_plan : null;
      if (!flightPlan) {
        return '';
      }

      var departure = String(flightPlan.departure || '').trim().toUpperCase();
      var arrival = String(flightPlan.arrival || '').trim().toUpperCase();

      if (!departure && !arrival) {
        return '';
      }

      return (departure || '----') + ' -> ' + (arrival || '----');
    }

    function updateStatus() {
      return fetch(statusUrl, { cache: 'no-cache' })
        .then(function (response) {
          if (!response.ok) {
            throw new Error('VATSIM request failed with status ' + response.status);
          }

          return response.json();
        })
        .then(function (payload) {
          var pilot = findPilotByCallsign(payload);
          if (!pilot) {
            setStatus(
              'is-offline',
              callsign + ' OFFLINE',
              '',
              callsign + ' is currently offline on VATSIM.'
            );
            return;
          }

          var route = routeForPilot(pilot);
          var routeText = route || 'Route unavailable';
          setStatus(
            'is-online',
            callsign + ' ONLINE',
            routeText,
            callsign + ' is online on VATSIM: ' + routeText + '.'
          );
        })
        .catch(function () {
          setStatus(
            'is-error',
            callsign + ' STATUS UNAVAILABLE',
            '',
            'Unable to load VATSIM status right now.'
          );
        });
    }

    setStatus('is-loading', callsign + ' CHECKING STATUS', '', 'Checking VATSIM status...');
    updateStatus();
    window.setInterval(updateStatus, refreshMs);
  }

  function initWorldFlightCountdown() {
    var countdowns = document.querySelectorAll('[data-worldflight-countdown]');
    if (!countdowns.length) {
      return;
    }

    function updateCountdown() {
      var nowMs = Date.now();

      countdowns.forEach(function (countdown) {
        var targetAttr = countdown.getAttribute('data-target-utc');
        var targetMs = Date.parse(targetAttr || '');
        if (Number.isNaN(targetMs)) {
          return;
        }

        var diffMs = targetMs - nowMs;
        var isFinished = diffMs <= 0;
        if (isFinished) {
          diffMs = 0;
        }

        var days = Math.floor(diffMs / 86400000);
        var hours = Math.floor((diffMs % 86400000) / 3600000);
        var minutes = Math.floor((diffMs % 3600000) / 60000);
        var seconds = Math.floor((diffMs % 60000) / 1000);

        setPart(countdown, 'days', String(days).padStart(3, '0'));
        setPart(countdown, 'hours', String(hours).padStart(2, '0'));
        setPart(countdown, 'minutes', String(minutes).padStart(2, '0'));
        setPart(countdown, 'seconds', String(seconds).padStart(2, '0'));

        var finishedNotice = countdown.querySelector('[data-countdown-finished]');
        if (finishedNotice) {
          finishedNotice.hidden = !isFinished;
        }
      });
    }

    updateCountdown();
    window.setInterval(updateCountdown, 1000);
  }

  function setPart(container, part, value) {
    var node = container.querySelector('[data-countdown-part="' + part + '"]');
    if (node) {
      node.textContent = value;
    }
  }
})();
