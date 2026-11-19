/* Figuraid public site: motion, header, hero frame scrub, pinned services, coverage map, assistant. No framework. */
(() => {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const hasGsap = typeof window.gsap !== "undefined";
  if (hasGsap) gsap.registerPlugin(ScrollTrigger);

  // Smooth scroll + one quiet reveal on section heads
  let lenis = null;
  if (!reduced && hasGsap && typeof window.Lenis !== "undefined") {
    document.documentElement.classList.add("js-motion");
    lenis = new Lenis({ autoRaf: false, lerp: 0.11 });
    window.__lenis = lenis;
    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add((t) => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
    $$("[data-reveal]").forEach((el) => gsap.to(el, { opacity: 1, y: 0, duration: 1.1, ease: "power3.out", scrollTrigger: { trigger: el, start: "top 86%", once: true } }));
  }
  document.addEventListener("click", (e) => {
    const a = e.target.closest('a[href^="/#"], a[href^="#"]');
    if (!a || location.pathname !== "/") return;
    const id = a.getAttribute("href").split("#")[1];
    const el = document.getElementById(id);
    if (!el) return;
    e.preventDefault();
    closeMenu();
    if (lenis) lenis.scrollTo(el, { offset: -64 });
    else el.scrollIntoView({ behavior: reduced ? "auto" : "smooth" });
    el.focus({ preventScroll: true });
    history.replaceState(null, "", "#" + id);
  });

  // Header: transparent over dark sections, frosted over light ones
  const header = $("#site-header");
  const toneBtn = $("[data-tone-btn]");
  const setTone = (t) => {
    header.dataset.tone = t;
    if (toneBtn) toneBtn.className = "btn " + (t === "light" ? "btn-ink" : "btn-signal");
  };
  const toned = $$("[data-tone]").filter((s) => s !== header);
  if (toned.length) {
    const io = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && setTone(e.target.dataset.tone === "light" ? "light" : "dark")), { rootMargin: "-32px 0px -94% 0px" });
    toned.forEach((s) => io.observe(s));
  } else setTone("light");
  const onScroll = () => (header.dataset.scrolled = String(scrollY > 8));
  onScroll();
  addEventListener("scroll", onScroll, { passive: true });

  // Mobile menu
  const menu = $("#mobile-menu"), btn = $("#menu-btn");
  function closeMenu() {
    if (!menu || menu.hidden) return;
    menu.hidden = true; btn.setAttribute("aria-expanded", "false"); btn.setAttribute("aria-label", "Open menu");
    $(".i-open", btn).style.display = ""; $(".i-close", btn).style.display = "none"; document.body.style.overflow = "";
  }
  btn?.addEventListener("click", () => {
    if (!menu.hidden) return closeMenu();
    menu.hidden = false; btn.setAttribute("aria-expanded", "true"); btn.setAttribute("aria-label", "Close menu");
    $(".i-open", btn).style.display = "none"; $(".i-close", btn).style.display = ""; document.body.style.overflow = "hidden"; header.dataset.tone = "dark";
  });
  addEventListener("keydown", (e) => e.key === "Escape" && closeMenu());

  // Hero: scroll scrubs the rendered globe sequence
  const hero = $("#hero");
  if (hero) {
    const still = $("#hero-still"), cvs = $("#hero-canvas");
    if (reduced || !hasGsap) {
      hero.dataset.mode = "still";
      $("source", still).srcset = "/site/hero/m/064.webp";
      $("img", still).src = "/site/hero/d/127.webp";
    } else {
      hero.dataset.mode = "scrub";
      const set = matchMedia("(max-width: 767px)").matches ? { count: 64, dir: "m" } : { count: 127, dir: "d" };
      const src = (i) => `/site/hero/${set.dir}/${String(i + 1).padStart(3, "0")}.webp`;
      const frames = new Array(set.count).fill(null);
      const ctx = cvs.getContext("2d", { alpha: false });
      let current = 0, drawn = -1, raf = 0;
      const nearest = (i) => { for (let d = 0; d < set.count; d++) { if (frames[i - d]) return frames[i - d]; if (frames[i + d]) return frames[i + d]; } return null; };
      const paint = () => {
        raf = 0;
        const img = nearest(current);
        if (!img || (drawn === current && img === frames[current])) return;
        const W = cvs.width, H = cvs.height, s = Math.max(W / img.naturalWidth, H / img.naturalHeight);
        ctx.drawImage(img, (W - img.naturalWidth * s) / 2, (H - img.naturalHeight * s) / 2, img.naturalWidth * s, img.naturalHeight * s);
        drawn = frames[current] ? current : -1;
        cvs.style.opacity = 1; still.style.opacity = 0;
      };
      const request = () => { if (!raf) raf = requestAnimationFrame(paint); };
      const fit = () => { const dpr = Math.min(devicePixelRatio || 1, 2); cvs.width = Math.round(cvs.clientWidth * dpr); cvs.height = Math.round(cvs.clientHeight * dpr); drawn = -1; paint(); };
      const load = (i) => new Promise((res) => { if (frames[i]) return res(); const im = new Image(); im.decoding = "async"; im.onload = () => { frames[i] = im; if (Math.abs(i - current) < 3) request(); res(); }; im.onerror = res; im.src = src(i); });
      (async () => {
        await load(0); fit();
        const idx = [...Array(set.count).keys()];
        const q = [...idx.filter((i) => i % 8 === 0), ...idx.filter((i) => i % 8 !== 0)];
        const worker = async () => { while (q.length) await load(q.shift()); };
        await Promise.all([worker(), worker(), worker(), worker()]);
      })();
      ScrollTrigger.create({ trigger: hero, start: "top top", end: "bottom bottom", scrub: true, onUpdate: (self) => { const n = Math.min(set.count - 1, Math.round(self.progress * (set.count - 1))); if (n !== current) { current = n; request(); } } });
      gsap.timeline({ scrollTrigger: { trigger: hero, start: "top top", end: "bottom bottom", scrub: 0.6 } })
        .to("#scroll-cue", { opacity: 0, duration: 0.05 }, 0)
        .to("#hero-copy", { opacity: 0, y: -48, duration: 0.18, ease: "power1.in" }, 0.22)
        .fromTo("#hero-coda", { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.16, ease: "power2.out" }, 0.74)
        .to({}, { duration: 0.1 });
      gsap.from($("#hero-copy").children, { opacity: 0, y: 26, duration: 1.2, ease: "power3.out", stagger: 0.09, delay: 0.15 });
      addEventListener("resize", fit);
    }
  }

  // Services: pinned chapters on large screens
  const track = $("#services-track");
  if (track) {
    const n = Number(track.dataset.count), panel = $("#services-panel"), tabs = $("#chapter-tabs"), pin = $("#services-pin");
    const chapters = $$(".chapter", track), buttons = $$("button", tabs);
    let st = null, active = 0;
    const show = (i, pinned) => {
      active = i;
      chapters.forEach((c, k) => {
        const on = !pinned || k === i;
        c.dataset.active = String(on);
        c.setAttribute("aria-hidden", String(pinned && !on));
        c.style.opacity = pinned ? (on ? 1 : 0) : "";
        c.style.transform = pinned ? (on ? "none" : `translateY(${k < i ? -18 : 18}px)`) : "";
      });
      buttons.forEach((b, k) => b.setAttribute("aria-selected", String(k === i)));
    };
    const mq = matchMedia("(min-width: 1024px) and (min-height: 760px) and (prefers-reduced-motion: no-preference)");
    const setup = () => {
      st?.kill(); st = null;
      const pinned = mq.matches && hasGsap;
      track.style.height = pinned ? `${n * 85 + 40}vh` : "";
      Object.assign(panel.style, pinned ? { position: "sticky", top: "64px", paddingBlock: "56px 0", minHeight: "calc(100vh - 64px)" } : { position: "", top: "", paddingBlock: "", minHeight: "" });
      tabs.hidden = !pinned; pin.classList.toggle("is-pinned", pinned);
      chapters.forEach((c) => { c.setAttribute("role", pinned ? "tabpanel" : ""); c.style.transition = pinned ? "opacity .55s cubic-bezier(.22,1,.36,1), transform .55s cubic-bezier(.22,1,.36,1)" : ""; });
      show(0, pinned);
      if (pinned) st = ScrollTrigger.create({ trigger: track, start: "top top+=64", end: "bottom bottom", onUpdate: (s) => { const i = Math.min(n - 1, Math.floor(s.progress * n * 0.999)); if (i !== active) show(i, true); } });
      if (hasGsap) ScrollTrigger.refresh();
    };
    buttons.forEach((b) => b.addEventListener("click", () => {
      const i = Number(b.dataset.i), top = track.getBoundingClientRect().top + scrollY - 64;
      const y = top + ((track.offsetHeight - innerHeight + 64) * (i + 0.5)) / n;
      lenis ? lenis.scrollTo(y) : scrollTo({ top: y, behavior: "smooth" });
    }));
    setup(); mq.addEventListener("change", setup);
  }

  // Coverage: region picker + lazy looping video
  const map = $("#map");
  if (map) {
    const pick = (key, focus) => {
      $$("[data-region]", document).forEach((el) => el.tagName === "BUTTON" ? el.setAttribute("aria-pressed", String(el.dataset.region === key)) : el.setAttribute("data-on", String(el.dataset.region === key)));
      $$("[data-region-detail]").forEach((d) => (d.hidden = d.dataset.regionDetail !== key));
      if (focus !== undefined) map.dataset.focus = String(focus);
    };
    $$(".regions button").forEach((b) => { b.addEventListener("click", () => pick(b.dataset.region)); b.addEventListener("focus", () => pick(b.dataset.region)); });
    $$("path[data-region]", map).forEach((p) => { p.addEventListener("mouseenter", () => pick(p.dataset.region, true)); p.addEventListener("click", () => pick(p.dataset.region)); });
    map.addEventListener("mouseleave", () => (map.dataset.focus = "false"));
    const box = $("#coverage-video");
    if (!reduced && box) {
      let video = null;
      new IntersectionObserver(([e]) => {
        if (e.isIntersecting) {
          if (!video) { video = Object.assign(document.createElement("video"), { src: "/site/coverage.mp4", poster: "/site/coverage-poster.webp", muted: true, loop: true, playsInline: true, autoplay: true, preload: "none" }); box.replaceChildren(video); }
          video.play().catch(() => {});
        } else video?.pause();
      }, { rootMargin: "200px 0px" }).observe(box);
    }
  }

  // Living scenes: animate only while on screen (saves battery), draw lines in once
  const scenes = $$("[data-scene]");
  if ("IntersectionObserver" in window && !reduced) {
    const sceneIo = new IntersectionObserver((es) => es.forEach((e) => {
      e.target.classList.toggle("is-live", e.isIntersecting);
      if (e.isIntersecting) e.target.classList.add("is-drawn");
    }), { rootMargin: "60px 0px", threshold: 0.15 });
    scenes.forEach((s) => sceneIo.observe(s));
  } else scenes.forEach((s) => s.classList.add("is-drawn"));

  // Website assistant (Ada): replies from the public knowledge base, turns visitors into leads
  const chat = $("#assistant");
  if (chat) {
    const panel = $("#assistant-panel"), log = $("#assistant-log"), form = $("#assistant-form"), input = $("#assistant-input");
    const token = document.querySelector('meta[name="csrf-token"]')?.content || form.querySelector('[name="_token"]').value;
    const add = (who, text) => { const p = document.createElement("p"); p.className = "msg " + who; p.textContent = text; log.appendChild(p); log.scrollTop = log.scrollHeight; };
    $("#assistant-toggle").addEventListener("click", () => { panel.hidden = !panel.hidden; if (!panel.hidden) input.focus(); });
    $("#assistant-close").addEventListener("click", () => (panel.hidden = true));
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      add("me", text); input.value = ""; input.disabled = true;
      try {
        const r = await fetch("/chat", { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-TOKEN": token, Accept: "application/json" }, body: JSON.stringify({ message: text, page: location.pathname }) });
        const j = await r.json();
        add("ada", r.ok ? j.reply : (j.message || "Sorry — please try again in a minute."));
      } catch { add("ada", "Sorry — the connection dropped. Please try again."); }
      input.disabled = false; input.focus();
    });
  }
})();
