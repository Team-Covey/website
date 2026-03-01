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
  var isAbout = path.indexOf('/pages/about/') === 0;
  var isAboutWho = path === '/pages/about/';
  var isAboutTeam = path === '/pages/about/team/';
  var isAboutPartners = path === '/pages/about/partners/';
  var isOperations = path.indexOf('/pages/operations/') === 0;
  var isDispatch = path === '/pages/operations/dispatch/';
  var isWorldflight = path.indexOf('/pages/worldflight/') === 0;
  var isWorldflightOverview = path === '/pages/worldflight/';
  var isWorldflightRoute = path === '/pages/worldflight/route/';
  var isWorldflightRfds = path === '/pages/worldflight/rfds/';
  var isContact = path === '/pages/contact/';

  headerEl.className = 'site-header';
  headerEl.innerHTML =
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
            '<button class="nav-dropdown-toggle' + (isAbout ? ' active' : '') + '" type="button" aria-expanded="false" aria-haspopup="true">' +
              'About' +
            '</button>' +
            '<div class="nav-dropdown-menu" role="menu" aria-label="About">' +
              '<a href="/pages/about/" role="menuitem"' + activeClass(isAboutWho) + '>Who We Are</a>' +
              '<a href="/pages/about/team/" role="menuitem"' + activeClass(isAboutTeam) + '>Meet the Team</a>' +
              '<a href="/pages/about/partners/" role="menuitem"' + activeClass(isAboutPartners) + '>Partners</a>' +
            '</div>' +
          '</div>' +
          '<div class="nav-dropdown">' +
            '<button class="nav-dropdown-toggle' + (isOperations ? ' active' : '') + '" type="button" aria-expanded="false" aria-haspopup="true">' +
              'Operations' +
            '</button>' +
            '<div class="nav-dropdown-menu" role="menu" aria-label="Operations">' +
              '<a href="/pages/operations/dispatch/" role="menuitem"' + activeClass(isDispatch) + '>Dispatch Board</a>' +
              '<a href="#" role="menuitem" data-placeholder="true">Crew Roster (Soon)</a>' +
              '<a href="#" role="menuitem" data-placeholder="true">Simulator Status (Soon)</a>' +
            '</div>' +
          '</div>' +
          '<div class="nav-dropdown">' +
            '<button class="nav-dropdown-toggle' + (isWorldflight ? ' active' : '') + '" type="button" aria-expanded="false" aria-haspopup="true">' +
              'WorldFlight' +
            '</button>' +
            '<div class="nav-dropdown-menu" role="menu" aria-label="WorldFlight">' +
              '<a href="/pages/worldflight/" role="menuitem"' + activeClass(isWorldflightOverview) + '>Overview</a>' +
              '<a href="/pages/worldflight/route/" role="menuitem"' + activeClass(isWorldflightRoute) + '>Route</a>' +
              '<a href="/pages/worldflight/rfds/" role="menuitem"' + activeClass(isWorldflightRfds) + '>Our Charity</a>' +
            '</div>' +
          '</div>' +
          '<a href="/pages/contact/"' + activeClass(isContact) + '>Contact</a>' +
        '</nav>' +
        '<button class="theme-toggle" id="theme-toggle" aria-label="Toggle light/dark mode">' +
          '<svg class="icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>' +
          '<svg class="icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>' +
        '</button>' +
        '<a class="btn-live" href="https://twitch.tv/teamcovey" target="_blank" rel="noopener noreferrer">' +
          '<span class="live-dot" aria-hidden="true"></span>' +
          'Watch Live' +
        '</a>' +
        '<button class="nav-toggle" id="nav-toggle" aria-label="Toggle navigation" aria-expanded="false">' +
          '<span></span><span></span><span></span>' +
        '</button>' +
      '</div>' +
    '</div>';
})();
