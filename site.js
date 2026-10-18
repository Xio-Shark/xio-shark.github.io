/* Xio-Shark site interactions.
   Vanilla JS, no dependencies, no network requests.
   theme toggle, mobile nav, scroll reveal, reading progress, TOC highlighting,
   code copy, back to top, pointer spotlight on cards. */
(function () {
  'use strict';

  var root = document.documentElement;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var en = (root.lang || '').toLowerCase().indexOf('en') === 0;
  var T = en
    ? { open: 'Open menu', close: 'Close menu', dark: 'Switch to dark theme',
        light: 'Switch to light theme', copy: 'Copy', copied: 'Copied',
        top: 'Back to top' }
    : { open: '打开导航菜单', close: '关闭导航菜单', dark: '切换到深色主题',
        light: '切换到浅色主题', copy: '复制', copied: '已复制',
        top: '回到页面顶部' };

  /* ---------- theme ---------- */
  var mq = window.matchMedia('(prefers-color-scheme: dark)');

  function resolvedTheme() {
    var set = root.getAttribute('data-theme');
    if (set === 'light' || set === 'dark') return set;
    return mq.matches ? 'dark' : 'light';
  }

  function paint(theme) {
    root.setAttribute('data-theme', theme);
    var meta = document.querySelectorAll('meta[name="theme-color"]');
    Array.prototype.forEach.call(meta, function (m) {
      m.setAttribute('content', theme === 'dark' ? '#08080a' : '#fbfaf7');
    });
    var btn = document.getElementById('themeToggle');
    if (btn) btn.setAttribute('aria-label', theme === 'dark' ? T.light : T.dark);
  }

  if (root.getAttribute('data-theme')) paint(root.getAttribute('data-theme'));

  var themeBtn = document.getElementById('themeToggle');
  if (themeBtn) {
    themeBtn.addEventListener('click', function () {
      var next = resolvedTheme() === 'dark' ? 'light' : 'dark';
      var commit = function () {
        paint(next);
        try { localStorage.setItem('theme', next); } catch (e) {}
      };
      if (reduce || !document.startViewTransition) { commit(); return; }
      document.startViewTransition(commit);
    });
  }

  /* ---------- header state + progress + back to top ---------- */
  var header = document.getElementById('siteHeader');
  var toTop = null;
  var progress = null;
  var ticking = false;

  function frame() {
    ticking = false;
    var y = window.scrollY || window.pageYOffset;
    if (header) header.classList.toggle('scrolled', y > 6);
    if (toTop) toTop.classList.toggle('on', y > 640);
    if (progress) {
      var max = root.scrollHeight - window.innerHeight;
      progress.style.width = (max > 0 ? Math.min(1, y / max) * 100 : 0).toFixed(2) + '%';
    }
  }

  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(frame);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });

  /* ---------- mobile nav ---------- */
  var navToggle = document.getElementById('navToggle');
  var nav = document.getElementById('siteNav');
  if (navToggle && nav) {
    var setNav = function (open) {
      nav.classList.toggle('open', open);
      navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      navToggle.setAttribute('aria-label', open ? T.close : T.open);
    };
    navToggle.addEventListener('click', function (e) {
      e.stopPropagation();
      setNav(!nav.classList.contains('open'));
    });
    nav.addEventListener('click', function (e) {
      if (e.target.tagName === 'A') setNav(false);
    });
    document.addEventListener('click', function (e) {
      if (nav.classList.contains('open') && !nav.contains(e.target) && e.target !== navToggle) setNav(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') setNav(false);
    });
  }

  /* ---------- reading progress (long-form pages only) ---------- */
  if (document.querySelector('.article-body')) {
    progress = document.createElement('div');
    progress.className = 'progress';
    progress.setAttribute('aria-hidden', 'true');
    document.body.appendChild(progress);
    requestAnimationFrame(function () { progress.classList.add('on'); });
  }

  /* ---------- back to top ---------- */
  toTop = document.createElement('button');
  toTop.className = 'to-top';
  toTop.type = 'button';
  toTop.setAttribute('aria-label', T.top);
  toTop.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M12 19V5M5 12l7-7 7 7"/></svg>';
  toTop.addEventListener('click', function () {
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
  });
  document.body.appendChild(toTop);

  /* ---------- code copy ---------- */
  Array.prototype.forEach.call(document.querySelectorAll('pre'), function (pre) {
    var code = pre.querySelector('code');
    if (!code) return;
    var btn = document.createElement('button');
    btn.className = 'copy-btn';
    btn.type = 'button';
    btn.textContent = T.copy;
    btn.setAttribute('aria-label', T.copy);
    btn.addEventListener('click', function () {
      var text = code.innerText;
      var done = function () {
        btn.textContent = T.copied;
        btn.classList.add('done');
        setTimeout(function () {
          btn.textContent = T.copy;
          btn.classList.remove('done');
        }, 1500);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, function () {});
      } else {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); done(); } catch (e) {}
        document.body.removeChild(ta);
      }
    });
    pre.appendChild(btn);
  });

  /* ---------- scroll reveal with stagger ---------- */
  if (!reduce && 'IntersectionObserver' in window) {
    var groups = new Map();
    var targets = document.querySelectorAll('.card, .proj, .callout, .table-scroll, .work-item, .stat, .article-body h2');
    Array.prototype.forEach.call(targets, function (el) {
      el.classList.add('reveal');
      var parent = el.parentNode;
      var n = groups.get(parent) || 0;
      el.style.setProperty('--i', Math.min(n, 6));
      groups.set(parent, n + 1);
    });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('in');
        io.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -6% 0px', threshold: 0.08 });
    Array.prototype.forEach.call(targets, function (el) { io.observe(el); });
  }

  /* ---------- TOC active tracking ---------- */
  var toc = document.querySelector('.toc');
  if (toc && 'IntersectionObserver' in window) {
    var links = {};
    Array.prototype.forEach.call(toc.querySelectorAll('a[href^="#"]'), function (a) {
      links[a.getAttribute('href').slice(1)] = a;
    });
    var heads = document.querySelectorAll('.article-body h2[id]');
    if (Object.keys(links).length && heads.length) {
      var visible = new Set();
      var tocIO = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) visible.add(entry.target.id);
          else visible.delete(entry.target.id);
        });
        var current = null;
        Array.prototype.some.call(heads, function (h) {
          if (visible.has(h.id)) { current = h.id; return true; }
          return false;
        });
        Array.prototype.forEach.call(toc.querySelectorAll('a'), function (a) {
          a.classList.remove('active');
        });
        if (current && links[current]) links[current].classList.add('active');
      }, { rootMargin: '-88px 0px -62% 0px', threshold: 0 });
      Array.prototype.forEach.call(heads, function (h) { tocIO.observe(h); });
    }
  }

  /* ---------- pointer spotlight on cards ---------- */
  if (!reduce && window.matchMedia('(pointer: fine)').matches) {
    Array.prototype.forEach.call(document.querySelectorAll('.card'), function (card) {
      card.addEventListener('pointermove', function (e) {
        var r = card.getBoundingClientRect();
        card.style.setProperty('--mx', ((e.clientX - r.left) / r.width * 100).toFixed(1) + '%');
        card.style.setProperty('--my', ((e.clientY - r.top) / r.height * 100).toFixed(1) + '%');
      });
    });
  }

  /* ---------- hero parallax (pointer) ---------- */
  var visual = document.querySelector('.hero-visual');
  if (visual && !reduce && window.matchMedia('(pointer: fine)').matches) {
    var hero = visual.parentNode;
    hero.addEventListener('pointermove', function (e) {
      var r = hero.getBoundingClientRect();
      var dx = (e.clientX - r.left) / r.width - 0.5;
      var dy = (e.clientY - r.top) / r.height - 0.5;
      visual.style.transform = 'perspective(1000px) rotateX(' + (-dy * 3).toFixed(2) +
        'deg) rotateY(' + (dx * 3).toFixed(2) + 'deg)';
    });
    hero.addEventListener('pointerleave', function () { visual.style.transform = ''; });
  }

  frame();
})();
