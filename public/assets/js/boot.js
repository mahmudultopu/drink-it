/* Runs before first paint: restores the chosen layout (1 = default home, 2 = home V2) and enables JS-only styles. */
(function () {
  var d = document.documentElement;
  try {
    var forced = d.getAttribute('data-force-layout');
    if (forced) localStorage.setItem('drinkit.layout', forced);
    var l = localStorage.getItem('drinkit.layout');
    d.setAttribute('data-layout', l === '2' ? '2' : '1');
  } catch (e) { /* storage blocked: keep default */ }
  d.classList.remove('no-js');
})();
