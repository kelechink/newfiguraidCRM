{{-- Light / dark / system theme, shared with the staff app (same storage key Filament uses), applied before first paint. --}}
<script nonce="{{ app('csp-nonce') }}">
(function () {
  var KEY = 'filament:theme:mode', root = document.documentElement, mq = matchMedia('(prefers-color-scheme: dark)');
  function read() { try { return localStorage.getItem(KEY) || 'system'; } catch (e) { return 'system'; } }
  function apply(mode) {
    var dark = mode === 'dark' || (mode === 'system' && mq.matches);
    root.dataset.theme = dark ? 'dark' : 'light';
    root.dataset.themeMode = mode;
    root.style.colorScheme = dark ? 'dark' : 'light';
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = dark ? '#000000' : '#021e52';
    var labels = { system: 'Theme: match device', light: 'Theme: light', dark: 'Theme: dark' };
    document.querySelectorAll('[data-theme-toggle]').forEach(function (b) {
      b.dataset.mode = mode; b.setAttribute('aria-label', labels[mode] + '. Change theme'); b.title = labels[mode];
      var l = b.querySelector('[data-theme-label]'); if (l) l.textContent = labels[mode];
    });
  }
  window.fosTheme = {
    get: read,
    set: function (mode) { try { localStorage.setItem(KEY, mode); } catch (e) {} apply(mode); },
    cycle: function () { var o = ['system', 'light', 'dark']; this.set(o[(o.indexOf(read()) + 1) % 3]); }
  };
  apply(read());
  mq.addEventListener && mq.addEventListener('change', function () { if (read() === 'system') apply('system'); });
  addEventListener('storage', function (e) { if (e.key === KEY) apply(read()); });
  document.addEventListener('DOMContentLoaded', function () {
    apply(read());
    document.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-theme-toggle]');
      if (b) { e.preventDefault(); window.fosTheme.cycle(); }
    });
  });
})();
</script>
