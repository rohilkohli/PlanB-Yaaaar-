/* Runs before first paint (same-origin script, allowed by the CSP): applies a saved theme choice so it never flashes the other theme. */
(function () {
  try {
    var c = localStorage.getItem('planb_theme');
    if (c === 'light' || c === 'dark') document.documentElement.setAttribute('data-theme', c);
  } catch (e) { /* private mode: follow the system setting */ }
})();
