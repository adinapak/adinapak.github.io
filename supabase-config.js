window.SUPABASE_URL = "https://hyjisnphsenerleqnkys.supabase.co";
window.SUPABASE_ANON_KEY = "sb_publishable_2dxutx-0VyA8OnUwfX2Bpg_cSSeuA0D";

(function () {
  const originalFetch = window.fetch ? window.fetch.bind(window) : null;
  if (!originalFetch || window.__publicSupabasePatchInstalled) return;

  window.__publicSupabasePatchInstalled = true;

  function getRequestUrl(input) {
    if (typeof input === 'string') return input;
    if (input && typeof input.url === 'string') return input.url;
    return '';
  }

  function isMealLogsRequest(requestUrl) {
    return requestUrl.includes('/rest/v1/meal_logs');
  }

  function emptyJsonResponse() {
    return new Response(JSON.stringify([]), {
      status: 200,
      statusText: 'OK',
      headers: { 'Content-Type': 'application/json' }
    });
  }

  window.fetch = async function patchedFetch(input, init) {
    const requestUrl = getRequestUrl(input);
    const response = await originalFetch(input, init);

    if (isMealLogsRequest(requestUrl) && !response.ok) {
      return emptyJsonResponse();
    }

    return response;
  };
})();

(function () {
  const style = document.createElement('style');
  style.textContent = `
    .dj-track {
      overflow: hidden !important;
      text-overflow: clip !important;
      white-space: nowrap !important;
      font-style: normal !important;
    }
    .dj-track-marquee {
      display: inline-block;
      white-space: nowrap;
      font-style: normal !important;
      will-change: transform;
    }
    .dj-track-marquee.is-scrolling {
      animation: djTrackMarquee var(--dj-marquee-duration, 8s) ease-in-out infinite alternate;
    }
    @keyframes djTrackMarquee {
      0%, 12% { transform: translateX(0); }
      88%, 100% { transform: translateX(calc(-1 * var(--dj-marquee-distance, 0px))); }
    }
    @media (prefers-reduced-motion: reduce) {
      .dj-track-marquee.is-scrolling { animation: none; }
    }
  `;
  document.head.appendChild(style);

  function installMarquee() {
    const trackEl = document.getElementById('dj-track');
    if (!trackEl || trackEl.dataset.marqueeInstalled === 'true') return;

    trackEl.dataset.marqueeInstalled = 'true';
    let internalUpdate = false;

    function refresh() {
      if (internalUpdate) return;
      const title = trackEl.textContent.trim();
      if (!title) return;

      internalUpdate = true;
      trackEl.textContent = '';
      const inner = document.createElement('span');
      inner.className = 'dj-track-marquee';
      inner.textContent = title;
      trackEl.appendChild(inner);

      window.requestAnimationFrame(function () {
        const distance = Math.max(0, inner.scrollWidth - trackEl.clientWidth);
        if (distance > 4) {
          inner.style.setProperty('--dj-marquee-distance', `${distance}px`);
          inner.style.setProperty('--dj-marquee-duration', `${Math.max(6, distance / 18).toFixed(1)}s`);
          inner.classList.add('is-scrolling');
        }
        internalUpdate = false;
      });
    }

    new MutationObserver(refresh).observe(trackEl, {
      childList: true,
      characterData: true,
      subtree: true
    });

    window.addEventListener('resize', refresh);
    refresh();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', installMarquee);
  } else {
    installMarquee();
  }
})();
