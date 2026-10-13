const themeToggle = document.querySelector('[data-theme-toggle]');
if (themeToggle) {
  const root = document.documentElement;
  const label = themeToggle.querySelector('.theme-toggle-label');
  const setTheme = (theme, persist = true) => {
    const isNight = theme === 'night';
    root.dataset.theme = isNight ? 'night' : 'day';
    themeToggle.setAttribute('aria-pressed', String(isNight));
    themeToggle.setAttribute('aria-label', 'Switch to ' + (isNight ? 'day' : 'night') + ' mode');
    if (label) label.textContent = isNight ? 'Night' : 'Day';
    const themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) themeColor.content = isNight ? '#101923' : '#f4f0e8';
    if (persist) {
      try { localStorage.setItem('design-evolution-lab-round-4-theme', isNight ? 'night' : 'day'); } catch { /* Theme still changes for this page view. */ }
    }
  };
  setTheme(root.dataset.theme || 'day', false);
  themeToggle.addEventListener('click', () => setTheme(root.dataset.theme === 'night' ? 'day' : 'night'));
}
