/* ============================================================================
   BLAND & CO — shared site behaviour
   nav scroll state · progress bar · mobile menu · reveal · custom selects
   ========================================================================== */
(function () {
  'use strict';

  /* ---- Nav scroll state + progress hairline ---- */
  var nav = document.getElementById('nav');
  var progress = document.getElementById('progress');
  function onScroll() {
    var y = window.scrollY || document.documentElement.scrollTop;
    if (nav) nav.classList.toggle('scrolled', y > 40);
    if (progress) {
      var h = document.documentElement.scrollHeight - window.innerHeight;
      progress.style.width = (h > 0 ? (y / h) * 100 : 0) + '%';
    }
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---- Mobile menu ---- */
  window.toggleMenu = function () {
    var m = document.getElementById('mmenu');
    if (!m) return;
    m.classList.toggle('open');
    document.body.style.overflow = m.classList.contains('open') ? 'hidden' : '';
  };

  /* ---- Reveal on scroll ---- */
  var io = ('IntersectionObserver' in window)
    ? new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) { e.target.classList.add('v'); io.unobserve(e.target); }
        });
      }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' })
    : null;

  window.revealScan = function (root) {
    var scope = root || document;
    scope.querySelectorAll('.fi').forEach(function (el) {
      if (io) io.observe(el);
      else el.classList.add('v');
    });
    // anything already in view on load
    setTimeout(function () {
      scope.querySelectorAll('.fi').forEach(function (el) {
        if (el.getBoundingClientRect().top < window.innerHeight) el.classList.add('v');
      });
    }, 60);
  };
  document.addEventListener('DOMContentLoaded', function () { window.revealScan(document); });

  /* ---- Custom select component ----
     Markup:
       <div class="cselect" data-name="itemType">
         <button type="button" class="cselect-btn placeholder">
           <span data-label>Choose…</span>
           <svg class="chev" ...>chevron</svg>
         </button>
         <input type="hidden" name="itemType" id="itemType" value="">
         <div class="cselect-list">
           <div class="cselect-opt" data-value="watch">Watch</div> ...
         </div>
       </div>
  */
  function closeAll(except) {
    document.querySelectorAll('.cselect.open').forEach(function (s) {
      if (s !== except) s.classList.remove('open');
    });
  }
  document.addEventListener('click', function (e) {
    var sel = e.target.closest('.cselect');
    if (!sel) { closeAll(null); return; }

    var btn = e.target.closest('.cselect-btn');
    var opt = e.target.closest('.cselect-opt');

    if (btn) {
      var willOpen = !sel.classList.contains('open');
      closeAll(sel);
      sel.classList.toggle('open', willOpen);
      return;
    }
    if (opt) {
      var hidden = sel.querySelector('input[type=hidden]');
      var labelEl = sel.querySelector('[data-label]');
      var btnEl = sel.querySelector('.cselect-btn');
      sel.querySelectorAll('.cselect-opt').forEach(function (o) { o.classList.remove('active'); });
      opt.classList.add('active');
      if (hidden) hidden.value = opt.getAttribute('data-value');
      if (labelEl) labelEl.textContent = opt.textContent.trim();
      if (btnEl) btnEl.classList.remove('placeholder');
      sel.classList.remove('open');
      if (hidden) hidden.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeAll(null); });
})();
