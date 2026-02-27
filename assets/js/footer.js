(function () {
  var footerEl = document.getElementById('site-footer');
  if (!footerEl) { return; }
  var auFlag = '\u{1F1E6}\u{1F1FA}';

  footerEl.innerHTML =
    '<div class="container footer-inner">' +
      '<a class="footer-brand" href="/index.html">' +
        '<img src="/images/CoveyWhiteLogo.png" alt="WorldFlight Team Covey logo" />' +
        '<span>WorldFlight Team Covey</span>' +
      '</a>' +
      '<div class="footer-meta">' +
        '<span class="footer-copy">\u00A9 2026 WorldFlight Team Covey</span>' +
        '<span class="footer-au" aria-label="Proudly Australian">' +
          '<span class="footer-flag" aria-hidden="true">' + auFlag + '</span>' +
          '<span>Proudly Australian</span>' +
        '</span>' +
      '</div>' +
      '<nav class="footer-nav" aria-label="Footer navigation">' +
        '<a href="/pages/about/">About</a>' +
        '<a href="/pages/worldflight/">WorldFlight</a>' +
        '<a href="/pages/contact/">Contact</a>' +
        '<a href="https://twitch.tv/teamcovey" target="_blank" rel="noopener noreferrer">Twitch</a>' +
      '</nav>' +
    '</div>';
})();
