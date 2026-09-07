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
      text: 'Saving my white jeans for AFTER labor day bc I’m a woman of Girard yk? yk??',
      timestamp: '2026-09-07T09:10:41Z'
    },
    {
      text: 'taking human-machine collaboration to the next lemma ;)\n\nvery excited to be supporting this!!',
      timestamp: '2026-09-04T23:09:10Z'
    },
    {
      text: 'sigmoid = activation function of true looksmaxxers and sigma females and males (hence, sig-foids and sigmoids)',
      timestamp: '2026-09-02T18:41:00Z'
    },
    {
      text: 'Fluent in: English, Pig Latin (working proficiency), and Neuralese',
      timestamp: '2026-09-02T02:31:02Z'
    },
    {
      text: 'I am my own tamagotchi https://t.co/IXgxIdJeld',
      timestamp: '2026-09-02T02:15:46Z'
    },
    {
      text: 'Intelligence = d(data)/dt 😝 imo best entry wedge into total vertical integration of enterprise post training',
      timestamp: '2026-09-02T01:57:14Z'
    },
    {
      text: 'You can’t estimate the reward without pulling the arm (or so they say) so I’m not clicking “no cilantro” on my Thai order tn',
      timestamp: '2026-08-23T23:02:03Z'
    }
  ];

  function tweetSearchUrl(text) {
    const clean = text.replace(/https?:\/\/t\.co\/\S+/g, '').replace(/\s+/g, ' ').trim();
    const query = `from:adinapak_ "${clean}"`;
    return `https://x.com/search?q=${encodeURIComponent(query)}&src=typed_query&f=live`;
  }

  function ordinalDay(day) {
    const mod100 = day % 100;
    if (mod100 >= 11 && mod100 <= 13) return `${day}th`;
    switch (day % 10) {
      case 1: return `${day}st`;
      case 2: return `${day}nd`;
      case 3: return `${day}rd`;
      default: return `${day}th`;
    }
  }

  function formatTweetTimestamp(timestamp) {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return '';

    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Los_Angeles',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    }).formatToParts(date);

    const value = (type) => parts.find((part) => part.type === type)?.value || '';
    const month = value('month');
    const day = Number(value('day'));
    const hour = value('hour');
    const minute = value('minute');
    const dayPeriod = value('dayPeriod');

    return `${month} ${ordinalDay(day)} · ${hour}:${minute} ${dayPeriod}`;
  }

  const tweet = tweets[Math.floor(Math.random() * tweets.length)];
  const tweetUrl = tweetSearchUrl(tweet.text);

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
      font-style: normal !important;
    }
    .adina-isms-widget *,
    .adina-isms-meta,
    .adina-isms-meta * {
      font-style: normal !important;
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
    .adina-ism-link {
      display: block;
      color: inherit;
      text-decoration: none;
    }
    .adina-ism-text {
      margin: 0;
      min-height: 3.4em;
      white-space: pre-line;
      font-size: clamp(1.05rem, 2.6vw, 1.28rem);
      line-height: 1.55;
      color: #171717;
    }
    .adina-ism-link:hover .adina-ism-text,
    .adina-ism-link:focus-visible .adina-ism-text {
      color: #000;
    }
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
  `;
  document.head.appendChild(style);

  ouraWidget.className = 'adina-isms-widget';
  ouraWidget.setAttribute('aria-label', '(Adina)-phorisms?');
  ouraWidget.innerHTML = `
    <div class="adina-isms-header">
      <p class="adina-isms-label">(Adina)-phorisms?</p>
    </div>
    <a id="adina-ism-link" class="adina-ism-link" href="${tweetUrl}" target="_blank" rel="noopener noreferrer" aria-label="Open this post on X">
      <p id="adina-ism-text" class="adina-ism-text"></p>
    </a>
  `;

  ouraMeta.className = 'adina-isms-meta';
  ouraMeta.id = 'adina-isms-meta';

  document.getElementById('adina-ism-text').textContent = tweet.text;
  ouraMeta.innerHTML = `<span>${formatTweetTimestamp(tweet.timestamp).replace(' · ', ' - ')}</span><span aria-hidden="true">-</span><a href="https://x.com/adinapak_" target="_blank" rel="noopener noreferrer">via X</a>`;
})();