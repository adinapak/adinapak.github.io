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
  const ouraWidget = document.querySelector('.oura-widget');
  const ouraMeta = document.getElementById('oura-steps-meta');
  if (!ouraWidget || !ouraMeta) return;

  const tweets = [
    {
      text: 'taking human-machine collaboration to the next lemma ;) very excited to be supporting this!!',
      date: 'Sep 6',
      url: 'https://x.com/adinapak_'
    },
    {
      text: 'You can’t estimate the reward without pulling the arm (or so they say) so I’m not clicking “no cilantro” on my Thai order tn',
      date: 'Sep 3',
      url: 'https://x.com/adinapak_'
    }
  ];

  const style = document.createElement('style');
  style.textContent = `
    .adina-isms-widget {
      margin: 14px auto 0;
      max-width: 560px;
      background: rgba(255,255,255,0.72);
      backdrop-filter: blur(18px);
      -webkit-backdrop-filter: blur(18px);
      border: 1px solid rgba(0,0,0,0.07);
      border-radius: 4px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.06), 0 4px 20px rgba(0,0,0,0.04);
      padding: 16px 20px;
    }
    .adina-isms-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 12px;
    }
    .adina-isms-label {
      margin: 0;
      font-size: 0.72rem;
      color: #999;
      letter-spacing: 1.2px;
      text-transform: uppercase;
      font-weight: 400;
    }
    .adina-isms-controls {
      display: flex;
      align-items: center;
      gap: 7px;
      color: #999;
      font-size: 0.72rem;
      font-variant-numeric: tabular-nums;
    }
    .adina-isms-arrow {
      border: 0;
      background: transparent;
      color: #777;
      font: inherit;
      font-size: 0.9rem;
      line-height: 1;
      padding: 2px 3px;
      cursor: pointer;
    }
    .adina-isms-arrow:hover,
    .adina-isms-arrow:focus-visible { color: #111; }
    .adina-ism-text {
      margin: 0;
      min-height: 3.4em;
      font-size: clamp(1.05rem, 2.6vw, 1.28rem);
      line-height: 1.55;
      color: #171717;
      transition: opacity 160ms ease;
    }
    .adina-ism-text.is-changing { opacity: 0; }
    .adina-isms-meta {
      margin: 0.8rem 0 0;
      font-size: 0.74rem;
      color: #666;
      display: flex;
      justify-content: center;
      align-items: baseline;
      gap: 0.35rem;
      text-align: center;
    }
    .adina-isms-meta a {
      color: inherit;
      text-decoration: none;
      border-bottom: 1px dotted #aaa;
    }
    @media (prefers-reduced-motion: reduce) {
      .adina-ism-text { transition: none; }
    }
  `;
  document.head.appendChild(style);

  ouraWidget.className = 'adina-isms-widget';
  ouraWidget.setAttribute('aria-label', 'Adina-isms');
  ouraWidget.innerHTML = `
    <div class="adina-isms-header">
      <p class="adina-isms-label">Adina-isms</p>
      <div class="adina-isms-controls" aria-label="Tweet navigation">
        <button class="adina-isms-arrow" type="button" data-dir="-1" aria-label="Previous Adina-ism">←</button>
        <span id="adina-isms-count">1 / ${tweets.length}</span>
        <button class="adina-isms-arrow" type="button" data-dir="1" aria-label="Next Adina-ism">→</button>
      </div>
    </div>
    <p id="adina-ism-text" class="adina-ism-text"></p>
  `;

  ouraMeta.className = 'adina-isms-meta';
  ouraMeta.id = 'adina-isms-meta';

  const textEl = document.getElementById('adina-ism-text');
  const countEl = document.getElementById('adina-isms-count');
  let index = 0;
  let timer = null;

  function render(nextIndex, animate) {
    index = (nextIndex + tweets.length) % tweets.length;
    const tweet = tweets[index];

    const apply = function () {
      textEl.textContent = tweet.text;
      countEl.textContent = `${index + 1} / ${tweets.length}`;
      ouraMeta.innerHTML = `<span>X</span><span aria-hidden="true">·</span><span>${tweet.date}</span><span aria-hidden="true">·</span><a href="${tweet.url}" target="_blank" rel="noopener noreferrer">@adinapak_</a>`;
      textEl.classList.remove('is-changing');
    };

    if (animate) {
      textEl.classList.add('is-changing');
      window.setTimeout(apply, 160);
    } else {
      apply();
    }
  }

  function restartShuffle() {
    if (timer) window.clearInterval(timer);
    timer = window.setInterval(function () {
      render(index + 1, true);
    }, 9000);
  }

  ouraWidget.querySelectorAll('.adina-isms-arrow').forEach(function (button) {
    button.addEventListener('click', function () {
      render(index + Number(button.dataset.dir || 1), true);
      restartShuffle();
    });
  });

  render(0, false);
  restartShuffle();
})();