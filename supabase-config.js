window.SUPABASE_URL = "https://hyjisnphsenerleqnkys.supabase.co";
window.SUPABASE_ANON_KEY = "sb_publishable_2dxutx-0VyA8OnUwfX2Bpg_cSSeuA0D";

(function () {
  const originalFetch = window.fetch ? window.fetch.bind(window) : null;
  if (!originalFetch || window.__publicSupabasePatchInstalled) return;

  window.__publicSupabasePatchInstalled = true;
  window.__lastOuraSuccessfulUpdate = null;

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

  function getSuccessfulTimestamp(row) {
    return row?.metadata?.lastSuccessfulUpdate
      || row?.metadata?.last_successful_update
      || row?.occurred_at
      || row?.updated_at
      || row?.created_at
      || null;
  }

  function formatSuccessfulUpdate(timestamp) {
    if (!timestamp) return 'Last update unavailable';

    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return 'Last update unavailable';

    const now = new Date();
    const sameDay = date.toDateString() === now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const wasYesterday = date.toDateString() === yesterday.toDateString();
    const time = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

    if (sameDay) return `last successful update ${time}`;
    if (wasYesterday) return `last successful update yesterday ${time}`;

    return `last successful update ${date.toLocaleDateString([], {
      month: 'short',
      day: 'numeric'
    })}, ${time}`;
  }

  function renderStoredSuccessfulUpdate() {
    const metaUpdatedEl = document.getElementById('oura-last-updated');
    if (!metaUpdatedEl || !window.__lastOuraSuccessfulUpdate) return;

    const nextText = formatSuccessfulUpdate(window.__lastOuraSuccessfulUpdate);
    if (metaUpdatedEl.textContent !== nextText) {
      metaUpdatedEl.textContent = nextText;
    }
  }

  window.fetch = async function patchedFetch(input, init) {
    const requestUrl = getRequestUrl(input);
    const response = await originalFetch(input, init);

    if (isMealLogsRequest(requestUrl) && !response.ok) {
      return emptyJsonResponse();
    }

    const isOuraActivityFeed = requestUrl.includes('/rest/v1/activity_feed')
      && requestUrl.includes('source=eq.oura');

    if (!isOuraActivityFeed) return response;

    try {
      const rows = await response.clone().json();
      if (!Array.isArray(rows)) return response;

      const patchedRows = rows.map((row) => {
        if (!row || typeof row !== 'object') return row;

        const timestamp = getSuccessfulTimestamp(row);
        if (!timestamp) return row;

        window.__lastOuraSuccessfulUpdate = timestamp;
        return {
          ...row,
          metadata: {
            ...(row.metadata || {}),
            lastSuccessfulUpdate: timestamp
          }
        };
      });

      window.setTimeout(renderStoredSuccessfulUpdate, 0);

      return new Response(JSON.stringify(patchedRows), {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers
      });
    } catch (error) {
      return response;
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      const metaUpdatedEl = document.getElementById('oura-last-updated');
      if (!metaUpdatedEl) return;
      new MutationObserver(renderStoredSuccessfulUpdate).observe(metaUpdatedEl, { childList: true });
    });
  } else {
    const metaUpdatedEl = document.getElementById('oura-last-updated');
    if (metaUpdatedEl) {
      new MutationObserver(renderStoredSuccessfulUpdate).observe(metaUpdatedEl, { childList: true });
    }
  }
})();

(function () {
  // Remove the retired card beneath Spotify, including its metadata.
  document.querySelector('.oura-widget')?.remove();
  document.getElementById('oura-steps-meta')?.remove();
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
