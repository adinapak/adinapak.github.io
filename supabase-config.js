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