// Expand all Just the Docs left-nav groups so Parts/Chapters are always visible
(function () {
  function expandAll() {
    try {
      // Expand any collapsible nav groups
      document.querySelectorAll('button.nav-list-expander').forEach(function (btn) {
        if (btn.getAttribute('aria-expanded') === 'false') {
          btn.click();
        }
      });
    } catch (e) {
      // no-op
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', expandAll);
  } else {
    expandAll();
  }
})();

