(function () {
  var headerEl = document.getElementById('site-header');
  if (!headerEl) {
    return;
  }

  function normalizePath(pathname) {
    var path = String(pathname || '/').split('?')[0].split('#')[0];

    if (path.slice(-11).toLowerCase() === '/index.html') {
      path = path.slice(0, -10);
    }

    if (!path) {
      path = '/';
    }

    if (path.charAt(path.length - 1) !== '/') {
      path += '/';
    }

    return path;
  }

  function activeClass(isActive) {
    return isActive ? ' class="active"' : '';
  }

  var path = normalizePath(window.location.pathname);

  var isHome = path === '/';
  var isAbout = path.indexOf('/about/') === 0;
  var isAboutWho = path === '/about/';
  var isAboutTeam = path === '/about/team/';
  var isAboutPartners = path === '/about/partners/';
  var isWorldflight = path.indexOf('/worldflight/') === 0;
  var isWorldflightOverview = path === '/worldflight/';
  var isWorldflightRoute = path === '/worldflight/route/';
  var isWorldflightSchedule = path === '/worldflight/schedule/';
  var isWorldflightRfds = path === '/worldflight/rfds/';
  var isJumboProject = path === '/jumbo-project/';
  var isContact = path === '/contact/';

  headerEl.className = 'site-header';
  headerEl.innerHTML =
    '<a class="skip-link" href="#main-content">Skip to main content</a>' +
    '<div class="container header-inner">' +
      '<a class="brand" href="/index.html">' +
        '<img src="/images/CoveyWhiteLogo.png" alt="WorldFlight Team Covey logo" />' +
        '<div class="brand-copy">' +
          '<strong>WorldFlight Team Covey</strong>' +
        '</div>' +
      '</a>' +
      '<div class="header-right">' +
        '<nav class="main-nav" id="main-nav" aria-label="Main navigation">' +
          '<a href="/index.html"' + activeClass(isHome) + '>Home</a>' +
          '<div class="nav-dropdown">' +
            '<button class="nav-dropdown-toggle' + (isAbout ? ' active' : '') + '" type="button" aria-expanded="false">' +
              'About' +
            '</button>' +
            '<div class="nav-dropdown-menu" aria-label="About">' +
              '<a href="/about/"' + activeClass(isAboutWho) + '>Who We Are</a>' +
              '<a href="/about/team/"' + activeClass(isAboutTeam) + '>Meet the Team</a>' +
              '<a href="/about/partners/"' + activeClass(isAboutPartners) + '>Partners</a>' +
            '</div>' +
          '</div>' +
          '<div class="nav-dropdown">' +
            '<button class="nav-dropdown-toggle' + (isWorldflight ? ' active' : '') + '" type="button" aria-expanded="false">' +
              'WorldFlight' +
            '</button>' +
            '<div class="nav-dropdown-menu" aria-label="WorldFlight">' +
              '<a href="/worldflight/"' + activeClass(isWorldflightOverview) + '>Overview</a>' +
              '<a href="/worldflight/route/"' + activeClass(isWorldflightRoute) + '>Route Map</a>' +
              '<a href="/worldflight/schedule/"' + activeClass(isWorldflightSchedule) + '>Schedule</a>' +
              '<a href="/worldflight/rfds/"' + activeClass(isWorldflightRfds) + '>Our Charity</a>' +
            '</div>' +
          '</div>' +
          '<a href="/jumbo-project/"' + activeClass(isJumboProject) + '>The Jumbo Project</a>' +
          '<a href="/contact/"' + activeClass(isContact) + '>Contact</a>' +
          '<div class="mobile-watch-actions" aria-label="Watch Team Covey">' +
            '<a class="mobile-watch-btn mobile-watch-twitch" href="https://twitch.tv/teamcovey" target="_blank" rel="noopener noreferrer">Watch Live on Twitch</a>' +
          '</div>' +
        '</nav>' +
        '<button class="theme-toggle" id="theme-toggle" aria-label="Toggle light/dark mode">' +
          '<svg class="icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>' +
          '<svg class="icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>' +
        '</button>' +
        '<div class="header-watch-actions" aria-label="Watch Team Covey">' +
          '<a class="header-watch-btn header-watch-twitch" href="https://twitch.tv/teamcovey" target="_blank" rel="noopener noreferrer" aria-label="Watch Team Covey on Twitch">' +
            '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z"/></svg>' +
            '<span>Watch Live</span>' +
          '</a>' +
        '</div>' +
        '<button class="nav-toggle" id="nav-toggle" aria-label="Toggle navigation" aria-expanded="false">' +
          '<span></span><span></span><span></span>' +
        '</button>' +
      '</div>' +
    '</div>';
})();

