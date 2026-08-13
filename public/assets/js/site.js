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
      if (window.innerWidth > 1119 && nav.classList.contains('open')) {
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

  function syncThemeToggleLabel() {
    if (!themeToggle) {
      return;
    }

    var isLight = document.documentElement.getAttribute('data-theme') === 'light';
    var label = isLight ? 'Switch to dark mode' : 'Switch to light mode';
    themeToggle.setAttribute('aria-label', label);
    themeToggle.title = label;
  }

  if (themeToggle) {
    syncThemeToggleLabel();
    themeToggle.addEventListener('click', function () {
      var current = document.documentElement.getAttribute('data-theme');
      var next = current === 'light' ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('tcwf-theme', next);
      syncThemeToggleLabel();
    });
  }

  initJumboIntro();
  initInstagramEmbed();
  initTeamDirectory();
  initHeroCarousel();
  initVatsimStatus();
  initWorldFlightCountdown();

  function initJumboIntro() {
    var overlay = document.querySelector('[data-jumbo-intro]');
    if (!overlay) {
      return;
    }

    var video = overlay.querySelector('video');
    var skip = overlay.querySelector('button');
    var main = document.querySelector('main');
    var hasFinished = false;
    var removeTimer;
    var fallbackTimer;
    var prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function focusPage() {
      if (!main || typeof main.focus !== 'function') {
        return;
      }

      main.setAttribute('tabindex', '-1');
      main.focus({ preventScroll: true });
      main.addEventListener('blur', function () {
        main.removeAttribute('tabindex');
      }, { once: true });
    }

    function removeIntro() {
      window.clearTimeout(removeTimer);
      window.clearTimeout(fallbackTimer);
      document.removeEventListener('keydown', handleIntroKeydown);
      document.body.classList.remove('jumbo-transition-open');
      overlay.remove();
    }

    function finishIntro(immediate, moveFocus) {
      if (hasFinished) {
        return;
      }

      hasFinished = true;
      window.clearTimeout(fallbackTimer);
      document.removeEventListener('keydown', handleIntroKeydown);
      video.pause();
      if (moveFocus !== false) {
        focusPage();
      }

      if (immediate) {
        removeIntro();
        return;
      }

      overlay.setAttribute('aria-hidden', 'true');
      overlay.classList.add('is-leaving');
      removeTimer = window.setTimeout(removeIntro, 750);
    }

    function handleIntroKeydown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        finishIntro(false);
        return;
      }

      if (event.key === 'Tab') {
        event.preventDefault();
        skip.focus();
      }
    }

    document.body.classList.add('jumbo-transition-open');

    if (prefersReducedMotion) {
      finishIntro(true, false);
      return;
    }

    document.addEventListener('keydown', handleIntroKeydown);
    skip.addEventListener('click', function () { finishIntro(false); });
    video.addEventListener('ended', function () { finishIntro(false); });
    video.addEventListener('error', function () { finishIntro(false); });
    fallbackTimer = window.setTimeout(function () { finishIntro(false); }, 12000);
    window.requestAnimationFrame(function () { skip.focus({ preventScroll: true }); });

    video.muted = true;
    var playPromise = video.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(function () { finishIntro(false); });
    }
  }

  function initInstagramEmbed() {
    var viewport = document.querySelector('[data-instagram-embed-viewport]');
    if (!viewport) {
      return;
    }

    var mobileQuery = window.matchMedia('(max-width: 560px)');

    function sizeEmbed() {
      if (!mobileQuery.matches) {
        viewport.style.removeProperty('--instagram-embed-scale');
        return;
      }

      viewport.style.setProperty('--instagram-embed-scale', String(viewport.clientWidth / 500));
    }

    if ('ResizeObserver' in window) {
      new ResizeObserver(sizeEmbed).observe(viewport);
    } else {
      window.addEventListener('resize', sizeEmbed);
    }

    if (typeof mobileQuery.addEventListener === 'function') {
      mobileQuery.addEventListener('change', sizeEmbed);
    }

    sizeEmbed();
  }

  function initTeamDirectory() {
    var grid = document.querySelector('.team-grid');
    var search = document.querySelector('[data-team-search]');
    var count = document.querySelector('[data-team-count]');
    var empty = document.querySelector('[data-team-empty]');

    if (!grid) {
      return;
    }

    var cards = Array.prototype.slice.call(grid.querySelectorAll('.team-card'));
    cards.forEach(function (card) {
      card.setAttribute('role', 'listitem');
      var name = card.querySelector('.team-name');
      if (name) {
        name.setAttribute('role', 'heading');
        name.setAttribute('aria-level', '2');
      }
    });

    function updateDirectory() {
      var query = search ? search.value.trim().toLocaleLowerCase() : '';
      var visible = 0;

      cards.forEach(function (card) {
        var matches = !query || card.textContent.toLocaleLowerCase().indexOf(query) !== -1;
        card.hidden = !matches;
        if (matches) {
          visible += 1;
        }
      });

      if (count) {
        count.textContent = query
          ? visible + ' of ' + cards.length + ' team members'
          : cards.length + ' team members';
      }

      if (empty) {
        empty.hidden = visible !== 0;
      }
    }

    if (search) {
      search.addEventListener('input', updateDirectory);
    }

    updateDirectory();
  }

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

    if (window.matchMedia && window.matchMedia('(max-width: 1119px)').matches) {
      return;
    }

    var callsign = 'CVY44N';
    var statusUrl = '/api/vatsim/status';
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

    function routeForStatus(payload) {
      var departure = String(payload && payload.departure || '').trim().toUpperCase();
      var arrival = String(payload && payload.arrival || '').trim().toUpperCase();

      if (!departure && !arrival) {
        return '';
      }

      return (departure || '----') + ' → ' + (arrival || '----');
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
          if (!payload || !payload.online) {
            setStatus(
              'is-offline',
              callsign + ' OFFLINE',
              '',
              callsign + ' is currently offline on VATSIM.'
            );
            return;
          }

          var route = routeForStatus(payload);
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
    var refreshTimer = null;

    function scheduleRefresh() {
      window.clearTimeout(refreshTimer);
      if (!document.hidden) {
        refreshTimer = window.setTimeout(updateStatus, refreshMs);
      }
    }

    function refreshStatus() {
      if (document.hidden) {
        scheduleRefresh();
        return;
      }

      updateStatus().then(scheduleRefresh);
    }

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        window.clearTimeout(refreshTimer);
      } else {
        refreshStatus();
      }
    });

    refreshStatus();
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

        // Days read naturally (81, 9, 0); the clock units stay zero-padded.
        setPart(countdown, 'days', String(days));
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
