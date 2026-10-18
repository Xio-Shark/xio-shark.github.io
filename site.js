/* 站点交互：主题切换、移动导航、阅读进度、代码复制、入场动画、回到顶部。
   纯原生 JS，无依赖，无外部请求。 */
(function () {
  'use strict';

  var root = document.documentElement;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var en = (root.lang || '').toLowerCase().indexOf('en') === 0;
  var T = en
    ? { open: 'Open navigation menu', close: 'Close navigation menu',
        dark: 'Toggle dark mode', light: 'Toggle light mode',
        copy: 'Copy', copied: 'Copied', top: 'Back to top' }
    : { open: '打开导航菜单', close: '关闭导航菜单',
        dark: '切换深色模式', light: '切换浅色模式',
        copy: '复制', copied: '已复制', top: '回到页面顶部' };

  /* ---- 主题 ---- */
  function applyTheme(theme) {
    if (theme === 'light' || theme === 'dark') {
      root.setAttribute('data-theme', theme);
    } else {
      root.removeAttribute('data-theme');
    }
  }
  function currentTheme() {
    var saved = root.getAttribute('data-theme');
    if (saved) return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  applyTheme(root.getAttribute('data-theme'));

  var themeBtn = document.getElementById('themeToggle');
  if (themeBtn) {
    themeBtn.addEventListener('click', function () {
      var next = currentTheme() === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      try { localStorage.setItem('theme', next); } catch (e) {}
      themeBtn.setAttribute('aria-label', next === 'dark' ? T.light : T.dark);
    });
  }

  /* ---- 顶栏滚动状态 ---- */
  var header = document.getElementById('siteHeader');
  var toTop = null;
  var progress = null;

  function onScroll() {
    var y = window.scrollY || window.pageYOffset;
    if (header) header.classList.toggle('scrolled', y > 8);
    if (toTop) toTop.classList.toggle('on', y > 600);
    if (progress) {
      var doc = document.documentElement;
      var max = doc.scrollHeight - window.innerHeight;
      var pct = max > 0 ? Math.min(1, y / max) : 0;
      progress.style.width = (pct * 100).toFixed(2) + '%';
    }
  }
  window.addEventListener('scroll', onScroll, { passive: true });

  /* ---- 移动端导航 ---- */
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

  /* ---- 阅读进度条（仅长文页） ---- */
  if (document.querySelector('.article-body')) {
    progress = document.createElement('div');
    progress.className = 'progress';
    progress.setAttribute('aria-hidden', 'true');
    document.body.appendChild(progress);
    requestAnimationFrame(function () { progress.classList.add('on'); });
  }

  /* ---- 回到顶部 ---- */
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

  /* ---- 代码块复制 ---- */
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
        }, 1600);
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

  /* ---- 入场动画 ---- */
  if (!reduce && 'IntersectionObserver' in window) {
    var targets = document.querySelectorAll('.card, .proj, .callout, .table-scroll');
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });
    Array.prototype.forEach.call(targets, function (el) {
      el.classList.add('reveal');
      io.observe(el);
    });
  }

  onScroll();
})();
