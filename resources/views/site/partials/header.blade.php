<header class="site-header" data-tone="dark" data-scrolled="false" id="site-header">
  <div class="wrap bar">
    <a href="/" aria-label="Figuraid home">@include('site.partials.wordmark')</a>
    <nav class="site-nav" aria-label="Main">
      <a href="/#services">Services</a><a href="/#coverage">Coverage</a><a href="/#industries">Industries</a>
    </nav>
    <div class="header-actions">
      @include('partials.theme-toggle')
      <a href="/app/login" class="signin">Staff sign in</a>
      <a href="/request?intent=sales" class="btn btn-signal" data-tone-btn>Talk to sales</a>
      <button type="button" class="menu-btn" aria-label="Open menu" aria-expanded="false" aria-controls="mobile-menu" id="menu-btn">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path class="i-open" d="M4 6h16M4 12h16M4 18h16"/><path class="i-close" d="M18 6 6 18M6 6l12 12" style="display:none"/></svg>
      </button>
    </div>
  </div>
</header>
<nav id="mobile-menu" class="mobile-menu" aria-label="Main" hidden>
  <a href="/#services">Services</a><a href="/#coverage">Coverage</a><a href="/#industries">Industries</a><a href="/#request">Request a service</a>
  <a href="/app/login" style="font-size:17px;font-weight:500;opacity:.7;margin-top:24px">Staff sign in</a>
  @include('partials.theme-toggle', ['class' => 'theme-toggle-menu', 'label' => 'Change theme'])
</nav>
