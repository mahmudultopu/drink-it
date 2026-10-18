/* Runs before first paint: restores the chosen layout (1 = default home, 2 = home V2) and enables JS-only styles. */
(function () {
  const d = document.documentElement;
  try {
    const forced = d.getAttribute('data-force-layout');
    if (forced) localStorage.setItem('drinkit.layout', forced);
    const l = localStorage.getItem('drinkit.layout');
    d.setAttribute('data-layout', l === '2' ? '2' : '1');
  } catch {
    /* storage blocked: keep the default layout */
  }
  d.classList.remove('no-js');
})();
