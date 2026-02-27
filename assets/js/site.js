(function () {
  var toggle = document.getElementById('nav-toggle');
  var nav = document.getElementById('main-nav');
  var themeToggle = document.getElementById('theme-toggle');

  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      toggle.classList.toggle('open', open);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });

    nav.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        nav.classList.remove('open');
        toggle.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  if (themeToggle) {
    themeToggle.addEventListener('click', function () {
      var current = document.documentElement.getAttribute('data-theme');
      var next = current === 'light' ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('tcwf-theme', next);
    });
  }

  initWorldFlightCountdown();

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
