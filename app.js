// ═══════════════════════════════════════════════════════════════════
// ── App code — loaded dynamically after authentication ──
// ═══════════════════════════════════════════════════════════════════

const APP_VERSION = '5.5.5';

const KV_WORKER_URL = API_BASE;
const WORKER_URL = API_BASE;
const KVStore = (() => {
  const cache = new Map();
  let _token = null;
  let _ready = false;
  let _readyPromise = null;
  const _readyCallbacks = [];

  function getToken() {
    if (_token) return _token;
    // Check URL param first (for setting/migrating token)
    const urlToken = new URLSearchParams(location.search).get('token');
    if (urlToken && urlToken.length >= 16) {
      _token = urlToken;
      document.cookie = `kv_token=${_token};path=/;max-age=31536000;SameSite=Strict`;
      // Clean URL
      const u = new URL(location.href);
      u.searchParams.delete('token');
      history.replaceState(null, '', u.toString());
      return _token;
    }
    // Check cookie
    const match = document.cookie.match(/(?:^|;\s*)kv_token=([^;]+)/);
    if (match) { _token = match[1]; return _token; }
    // Generate new token
    _token = crypto.randomUUID() + crypto.randomUUID().slice(0,8);
    document.cookie = `kv_token=${_token};path=/;max-age=31536000;SameSite=Strict`;
    return _token;
  }

  async function _fetch(method, path, body) {
    const opts = {
      method,
      headers: { 'x-settings-token': getToken() },
    };
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    try {
      const res = await authFetch(`${KV_WORKER_URL}${path}`, opts);
      return await res.json();
    } catch (e) {
      console.warn('[KVStore] network error:', e.message);
      return null;
    }
  }

  // Load all keys from remote into cache
  async function init() {
    if (_readyPromise) return _readyPromise;
    _readyPromise = (async () => {
      const data = await _fetch('GET', '/kv/all');
      if (data && data.data) {
        for (const [k, v] of Object.entries(data.data)) {
          cache.set(k, v);
        }
      }
      _ready = true;
      _readyCallbacks.forEach(cb => cb());
      _readyCallbacks.length = 0;
    })();
    return _readyPromise;
  }

  function onReady(cb) {
    if (_ready) { cb(); return; }
    _readyCallbacks.push(cb);
  }

  function getItem(key) {
    return cache.get(key) ?? null;
  }

  function setItem(key, value) {
    cache.set(key, String(value));
    // Fire-and-forget write to remote
    _fetch('POST', '/kv/set', { entries: { [key]: String(value) } });
  }

  function removeItem(key) {
    cache.delete(key);
    _fetch('DELETE', `/kv/delete/${encodeURIComponent(key)}`);
  }

  // Batch write (for import)
  async function setMany(entries) {
    for (const [k, v] of Object.entries(entries)) {
      if (v === null || v === undefined) cache.delete(k);
      else cache.set(k, String(v));
    }
    await _fetch('POST', '/kv/set', { entries });
  }

  // Batch delete all
  async function clearAll() {
    cache.clear();
    await _fetch('DELETE', '/kv/all');
  }

  // Export all cached data
  function exportAll(keys) {
    const data = {};
    keys.forEach(k => {
      const v = cache.get(k);
      if (v !== undefined) data[k] = v;
    });
    return data;
  }

  return { init, onReady, getItem, setItem, removeItem, setMany, clearAll, exportAll, getToken, get ready() { return _ready; } };
})();

// Start loading immediately — the page will render with defaults,
// then re-render once remote data arrives.
KVStore.init().then(() => {
  if (typeof reinitFromKV === 'function') reinitFromKV();
});

// ── CLOCK ──

function updateClock() {
  const now    = new Date();
  const days   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  document.getElementById('dateDisplay').textContent =
    `${days[now.getDay()]}, ${months[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`;
  const h = String(now.getHours()).padStart(2,'0');
  const m = String(now.getMinutes()).padStart(2,'0');
  const s = String(now.getSeconds()).padStart(2,'0');
  document.getElementById('timeDisplay').textContent = `${h}:${m}:${s}`;
}
updateClock();
setInterval(updateClock, 1000);

// ── WEATHER (Open-Meteo — free, no key) ──
const CDN = 'https://basmilius.github.io/weather-icons/production/fill/all/';

function loadWeatherLocation() {
  try { return JSON.parse(KVStore.getItem('weather_location')) || { lat: 38.7167, lon: -9.1333, name: 'Lisbon' }; }
  catch { return { lat: 38.7167, lon: -9.1333, name: 'Lisbon' }; }
}
function saveWeatherLocation(loc) { KVStore.setItem('weather_location', JSON.stringify(loc)); }


function getIcon(condition, night) {
  const c = (condition||'').toLowerCase();
  const dn = night ? 'night' : 'day';
  if (c.includes('thunderstorm') || c.includes('thunder')) return `thunderstorms-${dn}`;
  if (c.includes('drizzle'))                               return 'drizzle';
  if (c.includes('light rain'))                            return `partly-cloudy-${dn}-rain`;
  if (c.includes('heavy rain'))                            return 'rain';
  if (c.includes('rain') || c.includes('shower'))         return 'rain';
  if (c.includes('snow') || c.includes('blizzard'))       return 'snow';
  if (c.includes('sleet'))                                return 'sleet';
  if (c.includes('hail'))                                 return 'hail';
  if (c.includes('fog') || c.includes('mist'))            return `fog-${dn}`;
  if (c.includes('haze'))                                 return `haze-${dn}`;
  if (c.includes('smoke'))                                return 'smoke';
  if (c.includes('wind') || c.includes('breezy'))        return 'wind';
  if (c.includes('overcast'))                             return `overcast-${dn}`;
  if (c.includes('partly') || c.includes('scattered') || c.includes('broken')) return `partly-cloudy-${dn}`;
  if (c.includes('cloudy') || c.includes('cloud'))       return 'cloudy';
  if (c.includes('clear') || c.includes('sunny') || c.includes('sun')) return `clear-${dn}`;
  return 'not-available';
}

function wmoCondition(code, isDay) {
  if (code === 0)  return isDay ? 'Sunny' : 'Clear';
  if (code <= 2)   return 'Partly Cloudy';
  if (code === 3)  return 'Overcast';
  if (code <= 49)  return 'Fog';
  if (code <= 55)  return 'Drizzle';
  if (code <= 57)  return 'Freezing Drizzle';
  if (code <= 61)  return 'Light Rain';
  if (code <= 65)  return 'Heavy Rain';
  if (code <= 67)  return 'Freezing Rain';
  if (code <= 71)  return 'Light Snow';
  if (code <= 75)  return 'Heavy Snow';
  if (code === 77) return 'Snow Grains';
  if (code <= 82)  return 'Rain Showers';
  if (code <= 84)  return 'Heavy Showers';
  if (code <= 86)  return 'Snow Showers';
  if (code <= 99)  return 'Thunderstorm';
  return 'Unknown';
}

function aqiLabel(a) { if(a<=50) return 'Good'; if(a<=100) return 'Moderate'; if(a<=150) return 'Unhlthy·SG'; if(a<=200) return 'Unhealthy'; return 'Hazardous'; }
function uvLabel(u)  { if(u<=2) return 'Low'; if(u<=5) return 'Moderate'; if(u<=7) return 'High'; if(u<=10) return 'Very High'; return 'Extreme'; }

// ── WEATHER FORECAST CACHE (for calendar day headers) ──
let wxDailyCache = {}; // { "2026-02-22": { icon, precip, uv, aqi }, ... }

async function loadWeather() {
  const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const loc = loadWeatherLocation();
  const { lat: LAT, lon: LON, name: locName } = loc;
  document.getElementById('weatherLoc').textContent = locName;

  // ── Source 1: current conditions + full daily forecast ──
  const wxUrl = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}` +
    `&current=temperature_2m,weather_code,is_day,surface_pressure` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max` +
    `&timezone=auto&forecast_days=7`;

  // ── Source 2: hourly AQI for 7 days ──
  const aqUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${LAT}&longitude=${LON}` +
    `&hourly=european_aqi&forecast_days=7&timezone=auto`;

  try {
    const [wxRes, aqRes] = await Promise.all([fetch(wxUrl), fetch(aqUrl)]);
    const wx = await wxRes.json();
    const aq = await aqRes.json();

    const cur = wx.current;
    const daily = wx.daily;
    const curNight = cur.is_day === 0;
    const curCondition = wmoCondition(cur.weather_code, !curNight);

    // Build daily max AQI from hourly data
    const aqiHourly = aq.hourly?.european_aqi || [];
    const aqiTimes  = aq.hourly?.time || [];
    const dailyAqi = {};
    aqiTimes.forEach((t, i) => {
      const day = t.slice(0, 10);
      const val = aqiHourly[i];
      if (val != null) {
        dailyAqi[day] = Math.max(dailyAqi[day] ?? 0, val);
      }
    });

    // Cache daily forecast for calendar use
    wxDailyCache = {};
    daily.time.forEach((dateStr, i) => {
      const cond = wmoCondition(daily.weather_code[i], true);
      wxDailyCache[dateStr] = {
        icon:   getIcon(cond, false),
        precip: daily.precipitation_probability_max[i] ?? null,
        uv:     daily.uv_index_max[i] ?? null,
        aqi:    dailyAqi[dateStr] ?? null,
        tmax:   daily.temperature_2m_max[i] ?? null,
        tmin:   daily.temperature_2m_min[i] ?? null,
      };
    });

    // Current conditions
    document.getElementById('currentTemp').innerHTML = `${cur.temperature_2m.toFixed(1)}<sup>°C</sup>`;
    document.getElementById('weatherIcon').src = `${CDN}${getIcon(curCondition, curNight)}.svg`;
    document.getElementById('weatherIcon').alt = curCondition;
    document.getElementById('weatherCondition').textContent = curCondition;
    document.getElementById('todayHigh').textContent = daily.temperature_2m_max[0].toFixed(1) + '°';
    document.getElementById('todayLow').textContent  = daily.temperature_2m_min[0].toFixed(1) + '°';

    // Stats (today)
    const todayAqi = dailyAqi[daily.time[0]];
    document.getElementById('s-prec').textContent = daily.precipitation_probability_max[0] ?? '—';
    document.getElementById('s-pres').textContent = Math.round(cur.surface_pressure);
    document.getElementById('s-aqi').textContent  = todayAqi != null ? todayAqi + ' · ' + aqiLabel(todayAqi) : '—';
    const uv = daily.uv_index_max[0];
    document.getElementById('s-uv').textContent   = uv != null ? uv.toFixed(1) + ' · ' + uvLabel(uv) : '—';
    document.getElementById('uv-marker').style.left = uv != null ? Math.min(uv / 11 * 100, 100) + '%' : '0%';

    // 5-day forecast rows (keep showing 5 in weather card)
    const fr = document.getElementById('forecastRows');
    fr.innerHTML = '';
    daily.time.slice(0,5).forEach((dateStr, i) => {
      const dayName = i === 0 ? 'Today' : DAYS[new Date(dateStr + 'T12:00:00').getDay()];
      const cond = wmoCondition(daily.weather_code[i], true);
      const prec = daily.precipitation_probability_max[i] ?? 0;
      const uvI  = daily.uv_index_max[i]?.toFixed(0) ?? '—';
      const aqiD = dailyAqi[dateStr];
      const aqiStr = aqiD != null ? ` · AQI ${aqiD}` : '';
      fr.innerHTML += `<div class="forecast-row">
        <span class="fc-day">${dayName}</span>
        <span class="fc-icon"><img src="${CDN}${getIcon(cond, false)}.svg" style="width:1.8rem;height:1.8rem" alt="${cond}"></span>
        <span class="fc-meta">PRECIP ${prec}% · UV ${uvI}${aqiStr}</span>
        <span class="fc-hi">${daily.temperature_2m_max[i].toFixed(1)}°</span>
        <span class="fc-lo">${daily.temperature_2m_min[i].toFixed(1)}°</span>
      </div>`;
    });

    // Re-render events to show weather in day headers
    renderEvents();

  } catch(e) {
    document.getElementById('weatherCondition').textContent = 'Unavailable';
    console.error('Weather load failed:', e);
  }
}
loadWeather();
setInterval(loadWeather, 30 * 60 * 1000); // refresh weather every 30 minutes

// ── WEATHER MANAGER ──
function openWeatherManager() {
  document.getElementById('wxCityInput').value = loadWeatherLocation().name;
  document.getElementById('wxResults').innerHTML = '';
  document.getElementById('wxStatus').className = 'feed-status';
  document.getElementById('wxStatus').textContent = '';
  document.getElementById('weatherModal').classList.add('open');
}
document.getElementById('weatherModal').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeModal('weatherModal');
});
document.getElementById('wxCityInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') searchWeatherCity();
});

async function searchWeatherCity() {
  const q = document.getElementById('wxCityInput').value.trim();
  if (!q) return;
  const status = document.getElementById('wxStatus');
  const results = document.getElementById('wxResults');
  status.className = 'feed-status visible st-checking';
  status.textContent = '⏳ Searching…';
  results.innerHTML = '';
  try {
    const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=5&language=en&format=json`);
    const data = await res.json();
    if (!data.results?.length) {
      status.className = 'feed-status visible st-error';
      status.textContent = '✕ No locations found. Try a different name.';
      return;
    }
    status.className = 'feed-status visible st-ok';
    status.textContent = `✓ ${data.results.length} location(s) found — select one:`;
    results.innerHTML = '';
    data.results.forEach(r => {
      const label = [r.name, r.admin1, r.country].filter(Boolean).join(', ');
      const btn = document.createElement('button');
      btn.className = 'btn btn-cancel';
      btn.style.cssText = 'width:100%;text-align:left;padding:.5rem .8rem;font-family:"EB Garamond",serif;font-size:.9rem;text-transform:none;letter-spacing:0';
      btn.textContent = label;
      btn.onclick = () => {
        saveWeatherLocation({ lat: r.latitude, lon: r.longitude, name: r.name });
        closeModal('weatherModal');
        loadWeather();
      };
      results.appendChild(btn);
    });
  } catch(e) {
    status.className = 'feed-status visible st-error';
    status.textContent = '✕ Search failed. Try again.';
  }
}

// ── LINKS ──
const DEFAULT_LINKS = [
  {name:'Gmail',url:'https://mail.google.com'},{name:'YouTube',url:'https://youtube.com'},
  {name:'GitHub',url:'https://github.com'},{name:'Reddit',url:'https://reddit.com'},
  {name:'Kagi',url:'https://kagi.com'},{name:'Wikipedia',url:'https://wikipedia.org'},
];
function loadLinks() { try { return JSON.parse(KVStore.getItem('start_links'))||DEFAULT_LINKS; } catch { return DEFAULT_LINKS; } }
function saveLinks(l) { KVStore.setItem('start_links', JSON.stringify(l)); }
function renderLinks() {
  const links=loadLinks(), grid=document.getElementById('linksGrid');
  grid.innerHTML='';
  links.forEach((l,i)=>{
    const a=document.createElement('a'); a.className='link-item'; a.href=l.url; a.target='_blank'; a.rel='noopener noreferrer';
    a.innerHTML=`<span class="link-symbol">⌁</span><span class="link-label">${l.name}</span><button class="link-edit" onclick="openEditLink(event,${i})">✎</button>`;
    grid.appendChild(a);
  });
}
let editingLinkIdx=-1;
function openEditLink(e,i) {
  e.preventDefault(); e.stopPropagation(); editingLinkIdx=i;
  const l=loadLinks(); document.getElementById('modalTitle').textContent='Edit Link';
  document.getElementById('linkName').value=l[i].name; document.getElementById('linkUrl').value=l[i].url;
  document.getElementById('btnDelete').style.display='inline-block';
  document.getElementById('linkModal').classList.add('open');
}
function saveLink() {
  const name=document.getElementById('linkName').value.trim(), url=document.getElementById('linkUrl').value.trim();
  if(!name||!url) return;
  const l=loadLinks();
  if(editingLinkIdx>=0) l[editingLinkIdx]={name,url}; else l.push({name,url});
  saveLinks(l); renderLinks(); closeModal('linkModal');
}
function deleteLink() {
  if(editingLinkIdx<0) return; const l=loadLinks(); l.splice(editingLinkIdx,1); saveLinks(l); renderLinks(); closeModal('linkModal');
}
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
document.getElementById('linkModal').addEventListener('click',e=>{ if(e.target===e.currentTarget) closeModal('linkModal'); });
document.getElementById('feedModal').addEventListener('click',e=>{ if(e.target===e.currentTarget) { editingFeedIdx=-1; closeModal('feedModal'); } });
renderLinks();
document.getElementById('jsVersion').textContent = 'js ' + APP_VERSION;

// ── RSS FEEDS ──
const DEFAULT_FEEDS = [];
const TAB_LABELS = {};

function loadFeeds() {
  try { return JSON.parse(KVStore.getItem('start_feeds'))||DEFAULT_FEEDS; }
  catch { return DEFAULT_FEEDS; }
}
function saveFeeds(f) { KVStore.setItem('start_feeds', JSON.stringify(f)); }

// ── NEWS DATA & RENDERING ──
const newsCache = {};
let currentTab = null;

function getTabsFromFeeds() {
  const feeds = loadFeeds();
  const used = [...new Set(feeds.map(f=>f.tab))];
  return used.sort((a,b)=>(TAB_LABELS[a]||a).localeCompare(TAB_LABELS[b]||b));
}

function buildTabs() {
  const tabs = getTabsFromFeeds();
  const container = document.getElementById('newsTabs');
  container.innerHTML = '';
  tabs.forEach((tab,i)=>{
    const btn = document.createElement('button');
    const isActive = tab === currentTab || (i===0 && !tabs.includes(currentTab));
    btn.className = 'news-tab' + (isActive?' active':'');
    btn.textContent = TAB_LABELS[tab]||tab;
    btn.onclick = ()=>switchTab(btn,tab);
    container.appendChild(btn);
  });
  if(!tabs.includes(currentTab)) currentTab = tabs[0]||null;
}

function switchTab(el,tab) {
  document.querySelectorAll('.news-tab').forEach(t=>t.classList.remove('active'));
  el.classList.add('active');
  currentTab = tab;
  renderNews(tab);
}

function renderNews(tab) {
  const list = document.getElementById('newsList');
  if(newsCache[tab]&&newsCache[tab].length) {
    list.innerHTML='';
    newsCache[tab].forEach(item=>{
      const el = document.createElement(item.link ? 'a' : 'div');
      el.className = 'news-item';
      if (item.link) {
        el.href = item.link;
        el.target = '_blank';
        el.rel = 'noopener noreferrer';
      }
      el.innerHTML = `<div class="news-src">${item.src}</div><div class="news-headline">${item.title}</div>`;
      list.appendChild(el);
    });
  } else {
    list.innerHTML='<div class="news-loading">Loading…</div>';
  }
}

// Substitui este URL pelo URL do teu Worker depois de o criar

async function fetchViaProxy(url, timeoutMs = 8000) {
  const proxyUrl = `${WORKER_URL}/?url=${encodeURIComponent(url)}`;
  const res = await Promise.race([
    authFetch(proxyUrl),
    new Promise((_,rej) => setTimeout(() => rej(new Error('Request timed out')), timeoutMs))
  ]);
  if (!res.ok) throw new Error(`Proxy returned ${res.status}`);
  const text = await res.text();
  if (!text || text.length < 50) throw new Error('Empty response');
  return text;
}

async function fetchFeed(url, name) {
  const text = await fetchViaProxy(url);
  const xml = new DOMParser().parseFromString(text, 'text/xml');
  const items = [...xml.querySelectorAll('item, entry')].slice(0, 4);
  return items.map(i => {
    let title = (i.querySelector('title')?.textContent || '').trim();
    // Unwrap CDATA if DOMParser left it as literal text
    title = title.replace(/^<!\[CDATA\[([\s\S]*?)\]\]>$/, '$1').trim();
    // Atom: <link href="...">  RSS: <link> text  fallback: <guid>
    const linkEl = i.querySelector('link');
    const link = linkEl?.getAttribute('href')
      || linkEl?.textContent?.trim()
      || i.querySelector('guid')?.textContent?.trim()
      || '';
    return { title, link, src: name };
  }).filter(x => x.title && x.title !== 'undefined');
}

async function verifyFeed() {
  const url = document.getElementById('newFeedUrl').value.trim();
  if (!url) { showFeedStatus('error', 'Please enter a feed URL first.'); return; }
  showFeedStatus('checking', '⏳ Verifying feed, please wait…');
  document.getElementById('btnAddFeed').disabled = true;
  feedVerified = false;
  try {
    const text = await fetchViaProxy(url, 9000);
    const xml = new DOMParser().parseFromString(text, 'text/xml');
    const parseErr = xml.querySelector('parsererror');
    if (parseErr) throw new Error('Not a valid XML/RSS feed');
    const items = [...xml.querySelectorAll('item, entry')];
    if (items.length === 0) throw new Error('Feed parsed but contains no articles');
    const firstTitle = items[0].querySelector('title')?.textContent?.trim() || '(no title)';
    feedVerified = true;
    document.getElementById('btnAddFeed').disabled = false;
    showFeedStatus('ok', `✓ Valid — ${items.length} articles found. Latest: "${firstTitle.slice(0, 70)}"`);
    const nameField = document.getElementById('newFeedName');
    if (!nameField.value.trim()) {
      try { nameField.value = new URL(url).hostname.replace('www.','').split('.')[0]; } catch {}
    }
  } catch(e) {
    feedVerified = false;
    document.getElementById('btnAddFeed').disabled = true;
    showFeedStatus('error', '✕ ' + (e.message || 'Could not fetch the feed.'));
  }
}

async function loadAllFeeds() {
  const feeds = loadFeeds();
  const byTab = {};
  feeds.forEach(f=>{ (byTab[f.tab]=byTab[f.tab]||[]).push(f); });

  for(const [tab, tabFeeds] of Object.entries(byTab)) {
    const results = await Promise.allSettled(tabFeeds.map(f=>fetchFeed(f.url,f.name)));
    const articles = results
      .filter(r=>r.status==='fulfilled')
      .flatMap(r=>r.value)
      .slice(0,10);
    if(articles.length>=1) {
      newsCache[tab]=articles;
      // only re-render if this tab is currently selected
      if(tab===currentTab) renderNews(tab);
    }
  }
}

// ── FEED MANAGER ──
let feedVerified = false;
let editingFeedIdx = -1;
let activeFeedCat = null;

function openFeedManager() {
  editingFeedIdx = -1;
  activeFeedCat = null;  // will be set to first cat by buildFeedCatButtons
  resetFeedForm();
  buildFeedCatButtons();
  renderFeedList();
  // populate datalist
  const feeds = loadFeeds();
  const existingTabs = [...new Set(feeds.map(f=>f.tab))];
  const dl = document.getElementById('tabSuggestions');
  dl.innerHTML = existingTabs.map(t=>`<option value="${t}">`).join('');
  document.getElementById('feedModal').classList.add('open');
}

function buildFeedCatButtons() {
  const feeds = loadFeeds();
  const cats = [...new Set(feeds.map(f=>f.tab))];
  const container = document.getElementById('feedCatButtons');
  container.innerHTML = '';
  if (!cats.length) return;
  // select first category if none selected or current no longer exists
  if (activeFeedCat === null || !cats.includes(activeFeedCat)) activeFeedCat = cats[0];
  cats.forEach(cat => {
    const btn = document.createElement('button');
    btn.className = 'btn btn-cancel' + (activeFeedCat===cat?' active-cat':'');
    btn.style.cssText = 'font-size:.78rem;padding:.3rem .7rem;text-transform:none;letter-spacing:0';
    btn.textContent = TAB_LABELS[cat]||cat;
    btn.onclick = () => { activeFeedCat = cat; buildFeedCatButtons(); renderFeedList(); };
    container.appendChild(btn);
  });
}

function renderFeedList() {
  const feeds = loadFeeds();
  const filtered = activeFeedCat ? feeds.filter(f=>f.tab===activeFeedCat) : feeds;
  const list = document.getElementById('feedList');
  if (!filtered.length) {
    list.innerHTML = '<div style="font-family:\'EB Garamond\',serif;font-style:italic;color:var(--text-lt);font-size:.9rem;padding:.5rem 0">No feeds configured.</div>';
    return;
  }
  list.innerHTML = '';
  filtered.forEach((f) => {
    // find real index in full feeds array for edit/delete
    const realIdx = feeds.indexOf(f);
    const row = document.createElement('div');
    row.className = 'feed-row';
    row.innerHTML = `
      <div class="feed-row-info">
        <div class="feed-row-url" title="${f.url}">${f.url}</div>
        <div style="display:flex;gap:.5rem;margin-top:.2rem;align-items:center">
          <span class="feed-row-label">${f.name}</span>
          <span class="feed-tag">${TAB_LABELS[f.tab]||f.tab}</span>
        </div>
      </div>
      <button class="feed-btn" onclick="editFeed(${realIdx})" title="Edit">✎</button>
      <button class="feed-btn" onclick="deleteFeed(${realIdx})" title="Remove">✕</button>`;
    list.appendChild(row);
  });
}

function editFeed(i) {
  const feeds = loadFeeds();
  const f = feeds[i];
  editingFeedIdx = i;
  feedVerified = true;
  document.getElementById('feedFormTitle').textContent = 'Edit Feed';
  document.getElementById('newFeedUrl').value = f.url;
  document.getElementById('newFeedName').value = f.name;
  document.getElementById('newFeedTab').value = TAB_LABELS[f.tab] || f.tab;
  document.getElementById('btnAddFeed').disabled = false;
  document.getElementById('btnAddFeed').textContent = 'Save Feed';
  document.getElementById('btnVerifyFeed').textContent = 'Verify Feed';
  showFeedStatus('ok', `Editing "${f.name}" — modify fields and save.`);
}

function cancelFeedEdit() {
  if (editingFeedIdx !== -1) {
    editingFeedIdx = -1;
    resetFeedForm();
  } else {
    closeModal('feedModal');
  }
}

function resetFeedForm() {
  editingFeedIdx = -1;
  feedVerified = false;
  document.getElementById('feedFormTitle').textContent = 'Add New Feed';
  document.getElementById('newFeedUrl').value = '';
  document.getElementById('newFeedName').value = '';
  document.getElementById('newFeedTab').value = '';
  document.getElementById('btnAddFeed').disabled = true;
  document.getElementById('btnAddFeed').textContent = 'Save Feed';
  document.getElementById('btnVerifyFeed').textContent = 'Verify Feed';
  resetFeedStatus();
}

function deleteFeed(i) {
  const feeds = loadFeeds();
  feeds.splice(i, 1);
  saveFeeds(feeds);
  if (editingFeedIdx === i) resetFeedForm();
  editingFeedIdx = -1;
  buildFeedCatButtons();
  renderFeedList();
  buildTabs();
  loadAllFeeds();
}



function resetFeedStatus() {
  if (editingFeedIdx === -1) {
    feedVerified = false;
    document.getElementById('btnAddFeed').disabled = true;
  }
  const s = document.getElementById('feedStatus');
  s.className = 'feed-status';
  s.textContent = '';
}

function showFeedStatus(type, msg) {
  const s = document.getElementById('feedStatus');
  s.className = 'feed-status visible st-' + type;
  s.textContent = msg;
}

function addFeed() {
  if (!feedVerified && editingFeedIdx === -1) return;
  const url  = document.getElementById('newFeedUrl').value.trim();
  const name = document.getElementById('newFeedName').value.trim() || new URL(url).hostname;
  const rawTab = document.getElementById('newFeedTab').value.trim();
  const tab  = (rawTab.toLowerCase().replace(/\s+/g,'-')) || 'general';
  if (!TAB_LABELS[tab]) TAB_LABELS[tab] = rawTab || tab;
  const feeds = loadFeeds();
  if (editingFeedIdx >= 0) {
    feeds[editingFeedIdx] = { name, url, tab };
    saveFeeds(feeds);
    showFeedStatus('ok', 'Feed updated!');
  } else {
    if (feeds.some(f=>f.url===url)) { showFeedStatus('error','This feed is already in the list'); return; }
    feeds.push({ name, url, tab });
    saveFeeds(feeds);
    showFeedStatus('ok', 'Feed added!');
  }
  resetFeedForm();
  buildFeedCatButtons();
  renderFeedList();
  buildTabs();
  loadAllFeeds();
}

// ── BACKUP / EXPORT / IMPORT ──
const BACKUP_KEYS = ['start_links', 'start_feeds', 'claude_api_key', 'weather_location', 'ics_calendars', 'sports_calendars', 'todoist_api_token', 'todoist_filter', 'active_view', 'quick_notes', 'caldav_user', 'caldav_pass'];
const CACHE_KEYS  = ['briefing_cache', 'briefing_date'];

function openBackup() {
  document.getElementById('importNotice').textContent = '';
  document.getElementById('importNotice').className = 'backup-notice';
  document.getElementById('syncTokenDisplay').value = location.origin + '/?token=' + KVStore.getToken();
  document.getElementById('backupModal').classList.add('open');
}

function doExport() {
  const data = KVStore.exportAll(BACKUP_KEYS);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const now = new Date();
  const date = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `startpage-settings-${date}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function doImport(event) {
  const file = event.target.files[0];
  const notice = document.getElementById('importNotice');
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async e => {
    try {
      const data = JSON.parse(e.target.result);
      const entries = {};
      BACKUP_KEYS.forEach(k => {
        if (data[k] !== undefined) entries[k] = data[k];
      });
      await KVStore.setMany(entries);
      notice.textContent = '✓ Imported successfully. Reloading…';
      notice.className = 'backup-notice ok';
      setTimeout(() => location.reload(), 900);
    } catch {
      notice.textContent = '✕ Invalid file — please use a file exported from this page.';
      notice.className = 'backup-notice err';
    }
  };
  reader.readAsText(file);
}

async function clearAllData() {
  if (!confirm('This will remove all your links, feeds, API key and settings. Are you sure?')) return;
  await KVStore.clearAll();
  // Clear the sync token cookie
  document.cookie = 'kv_token=;path=/;max-age=0;SameSite=Strict';
  location.reload();
}

document.getElementById('backupModal').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeModal('backupModal');
});

// ── CALENDAR ──
const DAYS_SHORT = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const MONTHS_LONG = ['January','February','March','April','May','June','July','August','September','October','November','December'];
let calYear, calMonth;

// ── TODOIST CONSTANTS (declared early so calInit can use them) ──
const TODOIST_TOKEN_KEY  = 'todoist_api_token';
const TODOIST_FILTER_KEY = 'todoist_filter';
function getTodoistToken() { return KVStore.getItem(TODOIST_TOKEN_KEY) || ''; }
let todoistTasks    = [];
let todoistProjects = {};
let todoistFilter   = 'today'; // always start on Today view

function calInit() {
  const now = new Date();
  calYear  = now.getFullYear();
  calMonth = now.getMonth();
  renderMiniCal();
  loadAllIcs();
  loadTodoist();
}

function calPrevMonth() { calMonth--; if(calMonth<0){calMonth=11;calYear--;} renderMiniCal(); renderEvents(); }
function calNextMonth() { calMonth++; if(calMonth>11){calMonth=0;calYear++;} renderMiniCal(); renderEvents(); }
function calGoToday()  { const n=new Date(); calYear=n.getFullYear(); calMonth=n.getMonth(); renderMiniCal(); renderEvents(); }

function renderMiniCal() {
  document.getElementById('calMonthLabel').textContent = MONTHS_LONG[calMonth] + ' ' + calYear;
  const today = new Date();
  const firstDay = new Date(calYear, calMonth, 1);
  let startDow = firstDay.getDay() - 1; if(startDow < 0) startDow = 6;
  const daysInMonth = new Date(calYear, calMonth+1, 0).getDate();
  const daysInPrev  = new Date(calYear, calMonth, 0).getDate();

  // collect per-day calendar colours for this month using full expansion
  const monthStart = new Date(calYear, calMonth, 1);
  const monthEnd   = new Date(calYear, calMonth+1, 0, 23, 59, 59);
  const monthEvents = getEventsInWindow(monthStart, monthEnd);
  const dayColors = new Map();
  monthEvents.forEach(ev => {
    const d = new Date(ev.start);
    const day = d.getDate();
    if(!dayColors.has(day)) dayColors.set(day, new Set());
    dayColors.get(day).add(ev.calColor);
  });

  let html = '<table class="mini-cal"><thead><tr>';
  DAYS_SHORT.forEach((d,i) => {
    html += `<th class="${i>=5?'weekend':''}">${d}</th>`;
  });
  html += '</tr></thead><tbody><tr>';

  let cell = 0;
  for(let i=0;i<startDow;i++){
    html += `<td class="other-month">${daysInPrev-startDow+1+i}</td>`;
    cell++;
  }
  for(let d=1;d<=daysInMonth;d++){
    if(cell>0 && cell%7===0) html += '</tr><tr>';
    const dow = (startDow+d-1)%7;
    const isWeekend = dow>=5;
    const isToday = d===today.getDate() && calMonth===today.getMonth() && calYear===today.getFullYear();
    const colors = dayColors.get(d);
    let cls = [];
    if(isWeekend) cls.push('weekend');
    if(isToday)   cls.push('today');
    if(colors)    cls.push('has-event');
    const dotsHtml = colors
      ? `<div class="mini-cal-dots">${[...colors].map(c=>`<span class="mini-cal-dot" style="background:${c}"></span>`).join('')}</div>`
      : '';
    const label = isToday ? `<span>${d}</span>` : d;
    html += `<td class="${cls.join(' ')}">${label}${dotsHtml}</td>`;
    cell++;
  }
  let next = 1;
  while(cell%7!==0){ html += `<td class="other-month">${next++}</td>`; cell++; }
  html += '</tr></tbody></table>';
  document.getElementById('miniCal').innerHTML = html;
}

// ── ICS STORAGE ──
function loadIcsCalendars() { try { return JSON.parse(KVStore.getItem('ics_calendars'))||[]; } catch { return []; } }
function saveIcsCalendars(c) { KVStore.setItem('ics_calendars', JSON.stringify(c)); }

let icsRawCache = [];

// ── ICS PARSER ──
function parseIcsDate(str) {
  if(!str) return null;
  str = str.trim();
  const isUTC = str.endsWith('Z');
  const clean = str.replace(/[^0-9T]/g,'');
  const y=+clean.slice(0,4), mo=+clean.slice(4,6)-1, d=+clean.slice(6,8);
  if(!clean.includes('T')) return new Date(y,mo,d);
  const tIdx = clean.indexOf('T');
  const tp = clean.slice(tIdx+1);
  const h=+tp.slice(0,2), mi=+tp.slice(2,4), s=+tp.slice(4,6)||0;
  return isUTC ? new Date(Date.UTC(y,mo,d,h,mi,s)) : new Date(y,mo,d,h,mi,s);
}

function addDays(date,n){ const d=new Date(date); d.setDate(d.getDate()+n); return d; }
function addWeeks(date,n){ return addDays(date,n*7); }
function addMonths(date,n){ const d=new Date(date); d.setMonth(d.getMonth()+n); return d; }
function addYears(date,n){ const d=new Date(date); d.setFullYear(d.getFullYear()+n); return d; }

function expandRecurring(ev, windowStart, windowEnd) {
  const results = [];
  if(!ev.rrule) {
    if(ev.start <= windowEnd && ev.start >= windowStart) results.push(new Date(ev.start));
    return results;
  }
  // parse RRULE e.g. FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20260630T000000Z;COUNT=10
  const parts = {};
  ev.rrule.split(';').forEach(p => { const [k,v]=p.split('='); parts[k]=v; });
  const freq   = parts['FREQ'] || 'DAILY';
  const count  = parts['COUNT'] ? +parts['COUNT'] : 500;
  const until  = parts['UNTIL'] ? parseIcsDate(parts['UNTIL']) : null;
  const byDay  = parts['BYDAY'] ? parts['BYDAY'].split(',') : null;
  const interval = +(parts['INTERVAL']||1);

  const DAY_MAP = {SU:0,MO:1,TU:2,WE:3,TH:4,FR:5,SA:6};

  let cur = new Date(ev.start);

  // For YEARLY recurrences, if the base event starts after the window,
  // rewind to the occurrence that falls within or just before the window.
  if(freq === 'YEARLY' && cur > windowEnd) {
    const yearsDiff = windowEnd.getFullYear() - cur.getFullYear();
    cur = addYears(cur, yearsDiff);
    // if still after window, go back one more year
    if(cur > windowEnd) cur = addYears(cur, -1);
  }
  // For MONTHLY recurrences similarly
  if(freq === 'MONTHLY' && cur > windowEnd) {
    const monthsDiff = (windowEnd.getFullYear() - cur.getFullYear()) * 12
      + (windowEnd.getMonth() - cur.getMonth());
    cur = addMonths(cur, Math.floor(monthsDiff / interval) * interval);
    if(cur > windowEnd) cur = addMonths(cur, -interval);
  }

  let n = 0;
  while(n < count) {
    if(until && cur > until) break;
    if(cur > windowEnd) break;
    // check BYDAY filter
    const dow = cur.getDay();
    const dayMatch = !byDay || byDay.some(bd => {
      const code = bd.replace(/^[-+\d]+/,'');
      return DAY_MAP[code] === dow;
    });
    if(dayMatch && cur >= windowStart) results.push(new Date(cur));
    // advance
    if(freq==='DAILY')   cur = addDays(cur, interval);
    else if(freq==='WEEKLY') {
      if(byDay && byDay.length>1) {
        // step day by day within weekly cycle
        cur = addDays(cur,1);
        // if we've passed all days this week, jump to next interval
        const newDow = cur.getDay();
        const anyLeft = byDay.some(bd => DAY_MAP[bd.replace(/^[-+\d]+/,'')] >= newDow);
        if(!anyLeft) { cur = addDays(cur, (7-newDow) + (interval-1)*7); }
      } else {
        cur = addWeeks(cur, interval);
      }
    }
    else if(freq==='MONTHLY') cur = addMonths(cur, interval);
    else if(freq==='YEARLY')  cur = addYears(cur, interval);
    else break;
    n++;
  }
  return results;
}

function parseIcs(text, calName, calColor) {
  const lines = text.replace(/\r\n/g,'\n').replace(/\r/g,'\n')
    .replace(/\n[ \t]/g,'').split('\n');
  let inVEvent=false, subDepth=0, ev={};
  const rawEvents=[];
  for (const raw of lines) {
    const line=raw.trim(); if(!line) continue;
    if(!inVEvent){ if(line==='BEGIN:VEVENT'){inVEvent=true;subDepth=0;ev={};} continue; }
    if(line.startsWith('BEGIN:')){ subDepth++; continue; }
    if(line.startsWith('END:')){ if(subDepth>0){subDepth--;continue;} if(ev.start&&ev.title)rawEvents.push({...ev}); inVEvent=false; continue; }
    if(subDepth>0) continue;
    const ci=line.indexOf(':'); if(ci===-1) continue;
    const key=line.slice(0,ci), val=line.slice(ci+1), kb=key.split(';')[0].toUpperCase();
    if(kb==='SUMMARY')  ev.title   =val.replace(/\\,/g,',').replace(/\\n/g,' ').replace(/\\;/g,';').trim();
    if(kb==='UID')      ev.uid     =val.trim();
    if(kb==='DTSTART') {ev.start   =parseIcsDate(val.trim()); ev.allDay=!val.includes('T');}
    if(kb==='DTEND')    ev.end     =parseIcsDate(val.trim());
    if(kb==='RRULE')    ev.rrule   =val.trim();
    if(kb==='LOCATION') ev.location=val.replace(/\\,/g,',').replace(/\\n/g,' ').replace(/\\;/g,';').trim();
    if(kb==='EXDATE'){ev.exdates=ev.exdates||[];val.split(',').forEach(v=>{const d=parseIcsDate(v.trim());if(d)ev.exdates.push(d);});}
  }
  return rawEvents.map(r=>({...r,calName,calColor}));
}

let _icsLoading = false;
async function loadAllIcs() {
  if (_icsLoading) return; // prevent concurrent loads
  _icsLoading = true;
  try {
    const cals=loadIcsCalendars();
    if(!cals.length){icsRawCache=[];renderEvents();renderMiniCal();return;}
    icsRawCache=[];
    const results=await Promise.allSettled(cals.map(async c=>{
      const text=await fetchViaProxy(c.url,10000);
      return parseIcs(text,c.name,c.color);
    }));
    results.forEach(r=>{if(r.status==='fulfilled')icsRawCache.push(...r.value);});
    // Deduplicate events by UID (keep first occurrence)
    const seenUids = new Set();
    icsRawCache = icsRawCache.filter(ev => {
      if (!ev.uid) return true; // keep events without UID
      if (seenUids.has(ev.uid)) return false;
      seenUids.add(ev.uid);
      return true;
    });
    renderEvents();
    renderMiniCal();
  } finally {
    _icsLoading = false;
  }
}

function getEventsInWindow(windowStart, windowEnd) {
  const events=[];
  for(const rev of icsRawCache){
    if(!rev.start||!rev.title) continue;

    const rawEnd = rev.end ? new Date(rev.end) : null;
    const endDay = rawEnd ? (rev.allDay ? addDays(rawEnd,-1) : rawEnd) : null;
    // durationDays: for single-day allDay events DTSTART==DTEND so endDay < start → clamp to 0
    const durationDays = endDay ? Math.max(0, Math.round((endDay - rev.start)/(86400000))) : 0;
    const searchStart = addDays(windowStart, -durationDays-1);

    const occs=expandRecurring(rev, searchStart, windowEnd);
    for(const occ of occs){
      if(rev.exdates&&rev.exdates.some(ex=>ex&&ex.toDateString()===occ.toDateString())) continue;

      let startDay=new Date(occ); startDay.setHours(0,0,0,0);

      if(durationDays === 0) {
        // single-day event (including allDay with DTSTART==DTEND)
        if(startDay >= windowStart && startDay <= windowEnd)
          events.push({start:occ, title:rev.title, calName:rev.calName, calColor:rev.calColor, allDay:rev.allDay, location:rev.location||'', isFirstDay:true, uid:rev.uid||'', rrule:rev.rrule||''});
      } else {
        // multi-day: compute end for this occurrence
        let occEndDay = new Date(startDay.getTime() + durationDays * 86400000);
        occEndDay.setHours(0,0,0,0);
        const spanStart = new Date(Math.max(startDay.getTime(), windowStart.getTime()));
        const spanEnd   = new Date(Math.min(occEndDay.getTime(), windowEnd.getTime()));
        let d = new Date(spanStart);
        while(d <= spanEnd){
          events.push({start:new Date(d), title:rev.title, calName:rev.calName, calColor:rev.calColor, allDay:true, location:rev.location||'', isFirstDay:d.getTime()===startDay.getTime(), uid:rev.uid||'', rrule:rev.rrule||''});
          d = addDays(d,1);
        }
      }
    }
  }
  return events.sort((a,b)=>a.start-b.start);
}

// Check if an event belongs to a CalDAV calendar (editable) vs ICS-only feed
function isCaldavEvent(calName) {
  const cals = loadIcsCalendars();
  const cal = cals.find(c => c.name === calName);
  if (!cal) return false;
  // Fastmail ICS feeds use user.fm or caldav.fastmail.com
  if (/user\.fm\/calendar|caldav\.fastmail\.com/.test(cal.url)) return true;
  return false;
}

// Build CalDAV PUT/DELETE URL for an event in a Fastmail calendar
function getCaldavCalUrl(calName) {
  const { user } = getCaldavCreds();
  if (!user) return null;
  // Use PROPFIND-discovered calendars if available
  const aeCal = aeCalendars.find(c => c.displayName === calName);
  if (aeCal && aeCal.url) return aeCal.url.replace(/\/$/, '') + '/';
  // Fallback: build URL from calName slug
  // Fastmail CalDAV URL pattern: https://caldav.fastmail.com/dav/calendars/user/{email}/{calendarId}/
  // We can't reliably guess the calendarId from the name, so try PROPFIND first
  return null;
}

// Edit event state
let editingEvent = null;

async function openEditEvent(uid) {
  // Find the raw event in icsRawCache
  const raw = icsRawCache.find(e => e.uid === uid);
  if (!raw) return;
  if (raw.rrule) return; // recurring events not editable

  const { user } = getCaldavCreds();
  if (!user) { openCaldavSettings(); return; }

  editingEvent = { ...raw };

  // Reuse the Add Event modal
  document.getElementById('aeModalTitle').textContent = 'Edit Event';
  document.getElementById('aeSubmitBtn').textContent = 'Save';
  document.getElementById('aeSubmitBtn').disabled = false;
  document.getElementById('aeSubmitBtn').onclick = saveEditEvent;
  document.getElementById('aeDeleteBtn').style.display = '';
  document.getElementById('aeDeleteBtn').disabled = false;
  document.getElementById('aeStatus').textContent = '';
  document.getElementById('aeStatus').style.color = '';

  // Fill in title and location
  document.getElementById('aeTitle').value = raw.title || '';
  document.getElementById('aeLocation').value = raw.location || '';

  // Fetch CalDAV calendars and then select matching one
  await aeFetchCalendars();
  const calIdx = aeCalendars.findIndex(c => c.displayName === raw.calName);
  if (calIdx >= 0) {
    aeState.calUrl = aeCalendars[calIdx].url;
    aeState.calName = aeCalendars[calIdx].displayName;
    document.getElementById('aeCalLabel').textContent = aeCalendars[calIdx].displayName;
    document.getElementById('aeCalLabel').classList.remove('at-dp-placeholder');
  } else {
    // Calendar not found via PROPFIND — set name anyway
    aeState.calUrl = null;
    aeState.calName = raw.calName;
    document.getElementById('aeCalLabel').textContent = raw.calName;
    document.getElementById('aeCalLabel').classList.remove('at-dp-placeholder');
  }

  // Start date/time
  const s = new Date(raw.start);
  aeState.startDate = `${s.getFullYear()}-${String(s.getMonth()+1).padStart(2,'0')}-${String(s.getDate()).padStart(2,'0')}`;
  if (!raw.allDay) {
    aeState.startH = s.getHours();
    aeState.startM = s.getMinutes();
  } else {
    aeState.startH = null;
    aeState.startM = null;
  }

  // End date/time
  if (raw.end) {
    const e = new Date(raw.end);
    if (raw.allDay) e.setDate(e.getDate() - 1);
    aeState.endDate = `${e.getFullYear()}-${String(e.getMonth()+1).padStart(2,'0')}-${String(e.getDate()).padStart(2,'0')}`;
    if (!raw.allDay) {
      aeState.endH = e.getHours();
      aeState.endM = e.getMinutes();
    } else {
      aeState.endH = null;
      aeState.endM = null;
    }
  } else {
    aeState.endDate = null;
    aeState.endH = null;
    aeState.endM = null;
  }

  // Update all displays
  aeState.calMonth = { start: s.getMonth(), end: s.getMonth() };
  aeState.calYear  = { start: s.getFullYear(), end: s.getFullYear() };

  // Start date display
  if (aeState.startDate) {
    const sd = new Date(aeState.startDate + 'T12:00:00');
    document.getElementById('aeStartDateLabel').textContent = `${sd.getDate()} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][sd.getMonth()]} ${sd.getFullYear()}`;
    document.getElementById('aeStartDateLabel').classList.remove('at-dp-placeholder');
  } else {
    document.getElementById('aeStartDateLabel').textContent = 'No date';
    document.getElementById('aeStartDateLabel').classList.add('at-dp-placeholder');
  }
  // End date display
  if (aeState.endDate) {
    const ed = new Date(aeState.endDate + 'T12:00:00');
    document.getElementById('aeEndDateLabel').textContent = `${ed.getDate()} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][ed.getMonth()]} ${ed.getFullYear()}`;
    document.getElementById('aeEndDateLabel').classList.remove('at-dp-placeholder');
  } else {
    document.getElementById('aeEndDateLabel').textContent = 'No date';
    document.getElementById('aeEndDateLabel').classList.add('at-dp-placeholder');
  }
  // Start time display
  if (aeState.startH !== null && aeState.startM !== null) {
    document.getElementById('aeStartTimeLabel').textContent = `${String(aeState.startH).padStart(2,'0')}:${String(aeState.startM).padStart(2,'0')}`;
    document.getElementById('aeStartTimeLabel').classList.remove('at-dp-placeholder');
  } else {
    document.getElementById('aeStartTimeLabel').textContent = 'All day';
    document.getElementById('aeStartTimeLabel').classList.add('at-dp-placeholder');
  }
  // End time display
  if (aeState.endH !== null && aeState.endM !== null) {
    document.getElementById('aeEndTimeLabel').textContent = `${String(aeState.endH).padStart(2,'0')}:${String(aeState.endM).padStart(2,'0')}`;
    document.getElementById('aeEndTimeLabel').classList.remove('at-dp-placeholder');
  } else {
    document.getElementById('aeEndTimeLabel').textContent = 'All day';
    document.getElementById('aeEndTimeLabel').classList.add('at-dp-placeholder');
  }

  document.getElementById('addEventModal').classList.add('open');
  setTimeout(() => document.getElementById('aeTitle').focus(), 80);
}

async function saveEditEvent() {
  if (!editingEvent || !editingEvent.uid) return;
  const statusEl = document.getElementById('aeStatus');
  const title    = document.getElementById('aeTitle').value.trim();
  const location = document.getElementById('aeLocation').value.trim();

  if (!title)             { statusEl.textContent = '⚠ Please enter a title.'; return; }
  if (!aeState.startDate) { statusEl.textContent = '⚠ Please select a start date.'; return; }
  if (!aeState.calUrl)    { statusEl.textContent = '⚠ Please select a calendar.'; return; }

  const endDate = aeState.endDate || aeState.startDate;
  const allDay  = aeState.startH === null;

  const fmtDt = (dateStr, h, m) => {
    if (h === null) return dateStr.replace(/-/g, '');
    return `${dateStr.replace(/-/g,'')}T${String(h).padStart(2,'0')}${String(m).padStart(2,'0')}00`;
  };
  const dtstart = fmtDt(aeState.startDate, aeState.startH, aeState.startM);
  let   dtend   = fmtDt(endDate, aeState.endH ?? aeState.startH, aeState.endM ?? aeState.startM);
  if (allDay) {
    const d = new Date(endDate + 'T00:00:00');
    d.setDate(d.getDate() + 1);
    dtend = d.toISOString().slice(0,10).replace(/-/g,'');
  }

  const now    = new Date().toISOString().replace(/[-:]/g,'').slice(0,15) + 'Z';
  const dtProp = allDay ? 'VALUE=DATE:' : '';

  let ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'CALSCALE:GREGORIAN',
    'PRODID:-//Startpage//EN',
    'BEGIN:VEVENT',
    `UID:${editingEvent.uid}`,
    `DTSTAMP:${now}`,
    `DTSTART;${dtProp}${dtstart}`,
    `DTEND;${dtProp}${dtend}`,
    `SUMMARY:${title.replace(/\n/g,'\\n')}`,
  ];
  if (location) ics.push(`LOCATION:${location.replace(/\n/g,'\\n')}`);
  ics.push('END:VEVENT', 'END:VCALENDAR');
  const icsText = ics.join('\r\n');

  // CalDAV PUT URL = calendar base + uid.ics
  const calBase = getCaldavCalUrl(editingEvent.calName);
  if (!calBase) { statusEl.textContent = '⚠ Cannot find CalDAV calendar URL.'; return; }
  const eventUrl = calBase + editingEvent.uid + '.ics';

  document.getElementById('aeSubmitBtn').disabled = true;
  document.getElementById('aeSubmitBtn').textContent = 'Saving…';
  statusEl.textContent = '';

  try {
    const { status } = await caldavRequest('PUT', eventUrl, icsText, '0', { 'x-caldav-if-match': '*' });
    if (status === 200 || status === 201 || status === 204) {
      statusEl.style.color = 'var(--accent)';
      statusEl.textContent = '✓ Event updated';
      document.getElementById('aeSubmitBtn').textContent = 'Done';
      editingEvent = null;
      setTimeout(() => { loadAllIcs(); closeModal('addEventModal'); }, 900);
    } else {
      statusEl.style.color = '#c0392b';
      statusEl.textContent = `⚠ Server returned ${status}`;
      document.getElementById('aeSubmitBtn').disabled = false;
      document.getElementById('aeSubmitBtn').textContent = 'Save';
    }
  } catch (e) {
    statusEl.style.color = '#c0392b';
    statusEl.textContent = '⚠ Network error: ' + e.message;
    document.getElementById('aeSubmitBtn').disabled = false;
    document.getElementById('aeSubmitBtn').textContent = 'Save';
  }
}

async function deleteEditEvent() {
  if (!editingEvent || !editingEvent.uid) return;
  const statusEl = document.getElementById('aeStatus');
  const calBase = getCaldavCalUrl(editingEvent.calName);
  if (!calBase) { statusEl.textContent = '⚠ Cannot find CalDAV calendar URL.'; return; }
  const eventUrl = calBase + editingEvent.uid + '.ics';

  document.getElementById('aeDeleteBtn').disabled = true;
  statusEl.textContent = '';

  try {
    const { status } = await caldavRequest('DELETE', eventUrl, null, '0', { 'x-caldav-if-match': '*' });
    if (status === 200 || status === 204) {
      statusEl.style.color = 'var(--accent)';
      statusEl.textContent = '✓ Event deleted';
      editingEvent = null;
      setTimeout(() => { loadAllIcs(); closeModal('addEventModal'); }, 900);
    } else {
      statusEl.style.color = '#c0392b';
      statusEl.textContent = `⚠ Server returned ${status}`;
      document.getElementById('aeDeleteBtn').disabled = false;
    }
  } catch (e) {
    statusEl.style.color = '#c0392b';
    statusEl.textContent = '⚠ Network error: ' + e.message;
    document.getElementById('aeDeleteBtn').disabled = false;
  }
}

function renderEvents() {
  const el=document.getElementById('calEvents'); if(!el) return;

  const now = new Date(); now.setHours(0,0,0,0);
  const isCurrentMonth = (calYear===now.getFullYear() && calMonth===now.getMonth());
  const windowStart = isCurrentMonth ? now : new Date(calYear,calMonth,1);
  const windowEnd   = new Date(calYear,calMonth+1,0,23,59,59);

  const events=getEventsInWindow(windowStart,windowEnd);
  if(!events.length){
    el.innerHTML='<div class="cal-empty">'+(isCurrentMonth?'No upcoming events this month':'No events this month')+'</div>';
    return;
  }
  const DAY=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const today=new Date(); today.setHours(0,0,0,0);
  const tomorrow=addDays(today,1);
  let html='', lastDateStr=null;
  for(const ev of events){
    const d=new Date(ev.start);
    const dayStart=new Date(d); dayStart.setHours(0,0,0,0);
    const dateKey=dayStart.toDateString();
    if(dateKey!==lastDateStr){
      lastDateStr=dateKey;
      let label;
      if(dayStart.getTime()===today.getTime()) label='Today';
      else if(dayStart.getTime()===tomorrow.getTime()) label='Tomorrow';
      else label=`${DAY[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]}`;
      // weather for this day
      const dateKey2 = `${dayStart.getFullYear()}-${String(dayStart.getMonth()+1).padStart(2,'0')}-${String(dayStart.getDate()).padStart(2,'0')}`;
      const wx = wxDailyCache[dateKey2];
      let wxHtml = '';
      if(wx) {
        const precip = wx.precip!=null ? `PRECIP ${wx.precip}%` : '';
        const uv     = wx.uv!=null    ? `UV ${Math.round(wx.uv)}` : '';
        const aqi    = wx.aqi!=null   ? `AQI ${wx.aqi}` : '';
        const meta   = [precip,uv,aqi].filter(Boolean).join(' · ');
        wxHtml = `<span class="cal-wx-row"><img src="${CDN}${wx.icon}.svg" class="cal-wx-icon" alt=""><span class="cal-wx-meta">${meta}</span></span>`;
      }
      html+=`<div class="cal-day-header"><span>${label}</span>${wxHtml}</div>`;
    }
    const timeStr=ev.allDay?'all day':`${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    const locHtml=ev.location?`<div class="cal-event-loc">${ev.location}</div>`:'';
    // Editable: has UID, no RRULE, and belongs to a CalDAV calendar (not ICS-only feed)
    const isEditable = ev.uid && !ev.rrule && isCaldavEvent(ev.calName);
    const clickAttr = isEditable ? ` onclick="openEditEvent('${ev.uid.replace(/'/g,"\\'")}')" style="cursor:pointer"` : '';
    html+=`<div class="cal-event"${clickAttr}>
      <div class="cal-event-dot" style="background:${ev.calColor}"></div>
      <div class="cal-event-date">${timeStr}</div>
      <div class="cal-event-body"><div class="cal-event-title">${ev.title}</div>${locHtml}</div>
    </div>`;
  }
  el.innerHTML=html;
}

// ── ICS MANAGER ──
function openIcsManager() {
  renderIcsList();
  document.getElementById('icsUrl').value='';
  document.getElementById('icsName').value='';
  document.getElementById('icsStatus').textContent='';
  document.getElementById('icsStatus').className='feed-status';
  switchCalModalTab('personal');
  document.getElementById('icsModal').classList.add('open');
}

function renderIcsList() {
  const cals = loadIcsCalendars();
  const el = document.getElementById('icsList');
  if(!cals.length) { el.innerHTML='<div style="font-family:\'EB Garamond\',serif;font-style:italic;color:var(--text-lt);font-size:.9rem;padding:.5rem 0">No calendars configured.</div>'; return; }
  el.innerHTML = cals.map((c,i) => `
    <div class="feed-row">
      <div style="display:flex;align-items:center;gap:.5rem;flex:1;min-width:0">
        <input type="color" value="${c.color}" onchange="updateIcsColor(${i}, this.value)"
          title="Change colour"
          style="width:2rem;height:2rem;padding:.1rem;border:1px solid var(--border-lt);border-radius:2px;cursor:pointer;background:var(--bg-input);flex-shrink:0">
        <div class="feed-row-info">
          <div class="feed-row-url" title="${c.url}">${c.url}</div>
          <span class="feed-row-label">${c.name}</span>
        </div>
      </div>
      <button class="feed-btn" onclick="deleteIcsCal(${i})" title="Remove">✕</button>
    </div>`).join('');
}

function updateIcsColor(i, color) {
  const cals = loadIcsCalendars();
  cals[i].color = color;
  saveIcsCalendars(cals);
  loadAllIcs();
}

function deleteIcsCal(i) {
  const cals = loadIcsCalendars();
  icsRawCache = icsRawCache.filter(r => r.calName !== cals[i]?.name);
  cals.splice(i,1);
  saveIcsCalendars(cals);
  loadAllIcs();
}

async function addIcsCalendar() {
  const url   = document.getElementById('icsUrl').value.trim();
  const name  = document.getElementById('icsName').value.trim() || 'Calendar';
  const color = document.getElementById('icsColor').value;
  const st    = document.getElementById('icsStatus');
  if(!url) { st.className='feed-status visible st-error'; st.textContent='Please enter a URL.'; return; }
  st.className='feed-status visible st-checking'; st.textContent='⏳ Verifying…';
  try {
    const text = await fetchViaProxy(url, 10000);
    if(!text.includes('VCALENDAR')) throw new Error('Not a valid .ics calendar');
    const cals = loadIcsCalendars();
    if(cals.some(c=>c.url===url)) { st.className='feed-status visible st-error'; st.textContent='Calendar already added.'; return; }
    cals.push({name,url,color});
    saveIcsCalendars(cals);
    renderIcsList();
    st.className='feed-status visible st-ok'; st.textContent='✓ Calendar added!';
    document.getElementById('icsUrl').value='';
    document.getElementById('icsName').value='';
    loadAllIcs();
  } catch(e) {
    st.className='feed-status visible st-error'; st.textContent='✕ '+e.message;
  }
}

document.getElementById('icsModal').addEventListener('click', e=>{ if(e.target===e.currentTarget) closeModal('icsModal'); });
document.getElementById('todoistModal').addEventListener('click', e=>{ if(e.target===e.currentTarget) closeTodoistSettings(); });
document.getElementById('caldavModal').addEventListener('click', e=>{ if(e.target===e.currentTarget) closeModal('caldavModal'); });
['addTaskModal','addEventModal'].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('click', e=>{ if(e.target===e.currentTarget) closeModal(id); });
});

// ── VIEW SWITCHER ──
let currentView = 'home';

document.getElementById('btnViewHome').addEventListener('click', () => switchView('home'));
document.getElementById('btnViewCal').addEventListener('click', () => switchView('calendar'));
document.getElementById('btnViewSettings').addEventListener('click', () => openBackup());

function switchView(view) {
  if (view === currentView) return;
  KVStore.setItem('active_view', view);

  const fromGrid = currentView === 'home'
    ? document.getElementById('mainGrid')
    : document.getElementById('calGrid');
  const toGrid = view === 'home'
    ? document.getElementById('mainGrid')
    : document.getElementById('calGrid');

  document.getElementById('btnViewHome').classList.toggle('active', view === 'home');
  document.getElementById('btnViewCal').classList.toggle('active', view === 'calendar');

  document.body.style.overflowY = 'hidden';
  fromGrid.classList.add('flip-out');

  setTimeout(() => {
    fromGrid.classList.remove('flip-out');
    fromGrid.style.display = 'none';
    toGrid.style.display = 'grid';
    toGrid.classList.add('flip-in');
    setTimeout(() => {
      toGrid.classList.remove('flip-in');
      document.body.style.overflowY = '';
    }, 460);
    if(view === 'calendar') { calInit(); setTimeout(initCol3, 200); }
  }, 440);

  currentView = view;
}

// restore last active view instantly (no animation)
(function() {
  const saved = KVStore.getItem('active_view');
  if (saved === 'calendar') {
    currentView = 'calendar';
    document.getElementById('mainGrid').style.display = 'none';
    document.getElementById('calGrid').style.display = 'grid';
    document.getElementById('btnViewHome').classList.remove('active');
    document.getElementById('btnViewCal').classList.add('active');
    calInit();
    setTimeout(initCol3, 200);
  }
})();
(function() {
  let scrollTimer;
  const nl = document.getElementById('newsList');
  nl.addEventListener('scroll', () => {
    nl.classList.add('scrolling');
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => nl.classList.remove('scrolling'), 1000);
  });
  // Same for modal feed lists
  ['icsList','feedList'].forEach(id => {
    const el = document.getElementById(id);
    if(!el) return;
    let t;
    el.addEventListener('scroll', () => {
      el.classList.add('scrolling');
      clearTimeout(t);
      t = setTimeout(() => el.classList.remove('scrolling'), 1000);
    });
  });
})();

// ── INIT ──
buildTabs();
renderNews(currentTab);
loadAllFeeds();

// Auto-refresh feeds every hour
setInterval(() => {
  loadAllFeeds();
}, 60 * 60 * 1000);

// ── AI CHAT ──
let chatHistory = [];

const API_KEY_STORAGE = 'claude_api_key';

function getApiKey() {
  return KVStore.getItem(API_KEY_STORAGE) || '';
}

function updateModelUI() {
  document.getElementById('chatApiKey').placeholder = 'sk-ant-…';
  document.getElementById('chatApiKey').value = getApiKey();
  document.getElementById('chatApiSection').style.display = getApiKey() ? 'none' : 'block';
}

function saveApiKey() {
  const key = document.getElementById('chatApiKey').value.trim();
  if (!key) return;
  KVStore.setItem(API_KEY_STORAGE, key);
  document.getElementById('chatApiSection').style.display = 'none';
  addBubble('assistant', 'API key saved. Ask me anything.');
}

function toggleApiKey() {
  const sec = document.getElementById('chatApiSection');
  const visible = sec.style.display !== 'none';
  sec.style.display = visible ? 'none' : 'block';
  if (!visible) document.getElementById('chatApiKey').value = getApiKey();
}

function chatKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
}

function addBubble(role, text) {
  const msgs = document.getElementById('chatMessages');
  const div = document.createElement('div');
  div.className = 'chat-bubble ' + role;
  div.textContent = text;
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
  return div;
}

function clearChat() {
  chatHistory = [];
  document.getElementById('chatMessages').innerHTML = '';
}

async function sendMessage() {
  const input = document.getElementById('chatInput');
  const text = input.value.trim();
  if (!text) return;

  const apiKey = getApiKey();
  if (!apiKey) {
    document.getElementById('chatApiSection').style.display = 'block';
    addBubble('error', 'Please enter your Anthropic API key first (⚙ API Key below).');
    return;
  }

  input.value = '';
  document.getElementById('chatSend').disabled = true;
  addBubble('user', text);
  chatHistory.push({ role: 'user', content: text });
  const thinking = addBubble('thinking', 'thinking…');

  try {
    const res = await authFetch(`${WORKER_URL}/claude`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: 'You are a helpful assistant embedded in a personal browser start page. Keep answers concise and clear.',
        messages: chatHistory,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || 'API error ' + res.status);
    const reply = data.content?.[0]?.text || '(no response)';
    thinking.className = 'chat-bubble assistant';
    thinking.textContent = reply;
    chatHistory.push({ role: 'assistant', content: reply });
  } catch(e) {
    thinking.className = 'chat-bubble error';
    thinking.textContent = e.message || 'Unknown error';
    chatHistory.pop();
  } finally {
    document.getElementById('chatSend').disabled = false;
    input.focus();
  }
}

updateModelUI();

// ── TODOIST ──

// Todoist Sync API v1 — POST to worker /todoist
async function todoistSync(params) {
  const token = getTodoistToken();
  const body = Object.entries(params)
    .map(([k,v]) => `${encodeURIComponent(k)}=${encodeURIComponent(typeof v === 'object' ? JSON.stringify(v) : v)}`)
    .join('&');
  const res = await authFetch(`${WORKER_URL}/todoist`, {
    method: 'POST',
    headers: { 'x-todoist-token': token, 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function openTodoistSettings() {
  document.getElementById('todoistToken').value = getTodoistToken();
  document.getElementById('todoistModal').classList.add('open');
}
function closeTodoistSettings() {
  document.getElementById('todoistModal').classList.remove('open');
}
function saveTodoistToken() {
  const t = document.getElementById('todoistToken').value.trim();
  if(t) KVStore.setItem(TODOIST_TOKEN_KEY, t);
  closeTodoistSettings();
  loadTodoist();
}

// Filter cycle: today → upcoming → all → today
const FILTERS = ['today','upcoming','all'];
const FILTER_LABELS = { today:'Today', upcoming:'Upcoming', all:'All Tasks' };
function cycleFilter() {
  const idx = FILTERS.indexOf(todoistFilter);
  todoistFilter = FILTERS[(idx+1) % FILTERS.length];
  KVStore.setItem(TODOIST_FILTER_KEY, todoistFilter);
  renderTodoist();
}
function resetFilter() {
  todoistFilter = 'today';
  KVStore.setItem(TODOIST_FILTER_KEY, todoistFilter);
  renderTodoist();
}
function cycleFilterBack() {
  const idx = FILTERS.indexOf(todoistFilter);
  todoistFilter = FILTERS[(idx - 1 + FILTERS.length) % FILTERS.length];
  KVStore.setItem(TODOIST_FILTER_KEY, todoistFilter);
  renderTodoist();
}
function updateFilterBtn() {
  const btn = document.getElementById('todoistFilterBtn');
  if(!btn) return;
  btn.textContent = FILTER_LABELS[todoistFilter] || 'Today';
}

let todoistNotes = {}; // task_id -> [note texts]

async function loadTodoist() {
  const token = getTodoistToken();
  const list  = document.getElementById('todoistList');
  if(!list) return;
  if(!token) { renderTodoist(); return; }
  list.innerHTML = '<div class="td-empty">Loading…</div>';
  try {
    const data = await todoistSync({ sync_token: '*', resource_types: '["items","projects","notes"]' });
    if(data.error) { list.innerHTML = `<div class="td-empty">Error: ${data.error}</div>`; return; }
    todoistProjects = {};
    (data.projects || []).forEach(p => { todoistProjects[p.id] = { name: p.name, color: p.color }; });
    todoistTasks = (data.items || []).filter(t => !t.checked && !t.is_deleted);
    todoistNotes = {};
    (data.notes || []).forEach(n => {
      if (!n.item_id || n.is_deleted) return;
      if (!todoistNotes[n.item_id]) todoistNotes[n.item_id] = [];
      todoistNotes[n.item_id].push(n.content);
    });
    renderTodoist();
  } catch(e) {
    list.innerHTML = `<div class="td-empty">Could not reach Todoist.<br><span style="font-size:.75em;opacity:.7">${e.message}</span></div>`;
    console.error('Todoist load failed:', e);
  }
}

// Todoist color name -> hex
const TD_COLORS = {
  berry_red:'#b8256f', red:'#db4035', orange:'#ff9933', yellow:'#fad000',
  olive_green:'#afb83b', lime_green:'#7ecc49', green:'#299438', mint_green:'#6accbc',
  teal:'#158fad', sky_blue:'#14aaf5', light_blue:'#96c3eb', blue:'#4073ff',
  grape:'#884dff', violet:'#af38eb', lavender:'#eb96eb', magenta:'#e05194',
  salmon:'#ff8d85', charcoal:'#808080', grey:'#b8b8b8', taupe:'#ccac93',
};
function tdColor(name) { return TD_COLORS[name] || '#808080'; }

function renderTodoist() {
  updateFilterBtn();
  const list = document.getElementById('todoistList');
  if(!todoistTasks.length) { list.innerHTML='<div class="td-empty">No tasks — you\'re all caught up!</div>'; return; }

  const today = new Date(); today.setHours(0,0,0,0);
  const todayStr = today.getFullYear() + '-' + String(today.getMonth()+1).padStart(2,'0') + '-' + String(today.getDate()).padStart(2,'0');

  // Helper to extract date string from a task's due field
  function taskDueDate(t) {
    if (!t.due) return '';
    if (typeof t.due === 'string') return t.due.slice(0,10);
    return (t.due.date || t.due.datetime || '').slice(0,10);
  }

  let tasks = [...todoistTasks];

  if(todoistFilter === 'today') {
    tasks = tasks.filter(t => {
      const d = taskDueDate(t);
      return d && d <= todayStr;
    });
  } else if(todoistFilter === 'upcoming') {
    // Tomorrow through next Sunday
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.getFullYear() + '-' + String(tomorrow.getMonth()+1).padStart(2,'0') + '-' + String(tomorrow.getDate()).padStart(2,'0');
    const nextSun = new Date(today);
    const dayOfWeek = nextSun.getDay();
    const daysUntilSun = dayOfWeek === 0 ? 7 : 7 - dayOfWeek;
    nextSun.setDate(nextSun.getDate() + daysUntilSun);
    const nextSunStr = nextSun.getFullYear() + '-' + String(nextSun.getMonth()+1).padStart(2,'0') + '-' + String(nextSun.getDate()).padStart(2,'0');
    tasks = tasks.filter(t => {
      const d = taskDueDate(t);
      return d && d >= tomorrowStr && d <= nextSunStr;
    });
    tasks.sort((a,b) => {
      const da = taskDueDate(a) || '9999';
      const db = taskDueDate(b) || '9999';
      if(da !== db) return da < db ? -1 : 1;
      return b.priority - a.priority;
    });
  } else {
    // all — sort by due date then priority
    tasks.sort((a,b) => {
      const da = taskDueDate(a) || '9999';
      const db = taskDueDate(b) || '9999';
      if(da !== db) return da < db ? -1 : 1;
      return b.priority - a.priority;
    });
  }

  if(!tasks.length) {
    const msgs = { today:'Nothing due today \u2014 enjoy!', upcoming:'No upcoming tasks this week', all:'No tasks' };
    list.innerHTML = `<div class="td-empty">${msgs[todoistFilter]}</div>`; return;
  }

  const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  list.innerHTML = tasks.map(t => {
    const proj = todoistProjects[t.project_id];
    const projColor = proj ? tdColor(proj.color) : '#808080';
    const projName  = proj?.name || '';
    const pClass = t.priority >= 4 ? 'td-priority-1' : t.priority === 3 ? 'td-priority-2' : t.priority === 2 ? 'td-priority-3' : '';

    let dueHtml = '';
    if(t.due) {
      const dueDate = taskDueDate(t);
      if(dueDate) {
        const d = new Date(dueDate + 'T12:00:00');
        if(!isNaN(d.getTime())) {
          const overdue = dueDate < todayStr;
          const tomorrowStr = new Date(today.getTime() + 86400000).toISOString().slice(0,10);
          let dStr;
          if(dueDate === todayStr) dStr = 'Today';
          else if(dueDate === tomorrowStr) dStr = 'Tomorrow';
          else dStr = `${d.getDate()} ${MON[d.getMonth()]}`;
          // Add time if available
          const dtStr = typeof t.due === 'object' && t.due.datetime ? t.due.datetime : '';
          if(dtStr && dtStr.length > 10) {
            const dt = new Date(dtStr);
            if(!isNaN(dt.getTime())) dStr += ` · ${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
          }
          dueHtml = `<div class="td-due${overdue?' overdue':''}">${overdue?'⚠ Overdue · ':''}${dStr}</div>`;
        }
      }
    }
    const projBadge = projName && projName !== 'Inbox'
      ? `<div class="td-project-badge" style="background:${projColor}22;color:${projColor}">${projName}</div>` : '';

    const hasComments = todoistNotes[t.id] && todoistNotes[t.id].length > 0;
    const hasDescription = t.description && t.description.trim();
    const hasNotes = hasComments || hasDescription;
    const notesIcon = hasNotes
      ? `<button class="td-notes-btn" onclick="event.stopPropagation();showTaskNotes('${t.id}',this)" title="View notes"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg></button>` : '';

    return `<div class="td-task" data-id="${t.id}">
      <button class="td-check" onclick="completeTodoistTask('${t.id}')" title="Complete"></button>
      <div class="td-body ${pClass}" onclick="openEditTask('${t.id}')" style="cursor:pointer">
        ${projBadge}
        <div class="td-title">${t.content}${notesIcon}</div>
        ${dueHtml}
      </div>
    </div>`;
  }).join('');
}

async function completeTodoistTask(id) {
  const btn = document.querySelector(`.td-task[data-id="${id}"] .td-check`);
  if(btn) { btn.classList.add('done'); btn.disabled = true; }
  try {
    const uuid = (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));
    await todoistSync({ commands: JSON.stringify([{ type: 'item_complete', uuid, args: { id } }]) });
    todoistTasks = todoistTasks.filter(t => t.id !== id);
    setTimeout(() => renderTodoist(), 350);
  } catch(e) {
    if(btn) { btn.classList.remove('done'); btn.disabled = false; }
    console.error('Complete task failed:', e);
  }
}

function showTaskNotes(taskId, btn) {
  const old = document.getElementById('taskNotesPopup');
  if (old) old.remove();

  const task = todoistTasks.find(t => t.id === taskId);
  const comments = todoistNotes[taskId] || [];
  const desc = task?.description?.trim() || '';
  if (!desc && !comments.length) return;

  const esc = s => s
    .replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\n/g,'<br>')
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener" style="color:var(--accent);text-decoration:underline">$1</a>');
  let html = '';
  if (desc) html += `<p style="margin-bottom:.6rem">${esc(desc)}</p>`;
  if (desc && comments.length) html += '<hr style="border:none;border-top:1px solid var(--border-lt);margin:.6rem 0">';
  html += comments.map(n => `<p style="margin-bottom:.6rem">${esc(n)}</p>`).join('');

  const popup = document.createElement('div');
  popup.id = 'taskNotesPopup';
  popup.style.cssText = 'position:fixed;z-index:600;background:var(--bg-card);border:1px solid var(--border);border-radius:3px;padding:1rem;width:260px;box-shadow:0 4px 20px var(--shadow);font-family:"EB Garamond",serif;font-size:.9rem;line-height:1.6;color:var(--text-mid);max-height:200px;overflow-y:auto;scrollbar-width:none';
  popup.innerHTML = html;

  const rect = btn.getBoundingClientRect();
  document.body.appendChild(popup);
  popup.style.left = Math.min(rect.left, window.innerWidth - 280) + 'px';
  popup.style.top = (rect.bottom + 6) + 'px';

  setTimeout(() => {
    const handler = (e) => {
      if (!popup.contains(e.target)) { popup.remove(); document.removeEventListener('click', handler); }
    };
    document.addEventListener('click', handler);
  }, 0);
}

// ── ADD TASK CUSTOM DATE PICKER ──
let atCalYear, atCalMonth, atSelectedDate = null; // "YYYY-MM-DD" or null

function atToggleCal() {
  const popup   = document.getElementById('atCalPopup');
  const display = document.getElementById('atDueDisplay');
  const isOpen  = popup.classList.contains('open');
  document.querySelectorAll('.at-cal-popup.open').forEach(p => p.classList.remove('open'));
  document.querySelectorAll('.at-datepicker-display.active').forEach(d => d.classList.remove('active'));
  if(!isOpen) {
    const rect = display.getBoundingClientRect();
    popup.style.top  = (rect.bottom + 4) + 'px';
    popup.style.left = rect.left + 'px';
    const now = new Date();
    atCalYear  = atSelectedDate ? parseInt(atSelectedDate.slice(0,4)) : now.getFullYear();
    atCalMonth = atSelectedDate ? parseInt(atSelectedDate.slice(5,7))-1 : now.getMonth();
    atRenderCal();
    popup.classList.add('open');
    display.classList.add('active');
    setTimeout(() => document.addEventListener('click', atOutsideClick), 0);
  }
}

function atOutsideClick(e) {
  if(!document.getElementById('atDuePicker').contains(e.target)) {
    document.getElementById('atCalPopup').classList.remove('open');
    document.getElementById('atDueDisplay').classList.remove('active');
    document.removeEventListener('click', atOutsideClick);
  }
}

function atCalNav(dir) {
  atCalMonth += dir;
  if(atCalMonth < 0)  { atCalMonth = 11; atCalYear--; }
  if(atCalMonth > 11) { atCalMonth = 0;  atCalYear++; }
  atRenderCal();
}

function atRenderCal() {
  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const DAYS   = ['M','T','W','T','F','S','S'];
  document.getElementById('atCalMonthLabel').textContent = `${MONTHS[atCalMonth]} ${atCalYear}`;

  const today    = new Date(); today.setHours(0,0,0,0);
  const todayStr = today.toISOString().slice(0,10);
  const firstDay = new Date(atCalYear, atCalMonth, 1);
  let startDow   = firstDay.getDay() - 1; if(startDow < 0) startDow = 6;
  const daysInMonth = new Date(atCalYear, atCalMonth+1, 0).getDate();
  const daysInPrev  = new Date(atCalYear, atCalMonth, 0).getDate();

  let html = DAYS.map(d => `<div class="at-dow">${d}</div>`).join('');
  for(let i=0; i<startDow; i++) {
    html += `<div class="at-day other-month">${daysInPrev-startDow+1+i}</div>`;
  }
  for(let d=1; d<=daysInMonth; d++) {
    const dateStr = `${atCalYear}-${String(atCalMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    let cls = 'at-day';
    if(dateStr === todayStr)       cls += ' today';
    if(dateStr === atSelectedDate) cls += ' selected';
    html += `<div class="${cls}" onclick="atSelectDate('${dateStr}')">${d}</div>`;
  }
  let next = 1;
  const total = startDow + daysInMonth;
  const remaining = total % 7 === 0 ? 0 : 7 - (total % 7);
  for(let i=0; i<remaining; i++) html += `<div class="at-day other-month">${next++}</div>`;

  document.getElementById('atCalGrid').innerHTML = html;
}

function atSelectDate(dateStr) {
  atSelectedDate = dateStr;
  atUpdateDisplay();
  document.getElementById('atCalPopup').classList.remove('open');
  document.getElementById('atDueDisplay').classList.remove('active');
  document.removeEventListener('click', atOutsideClick);
  atRenderCal();
}

function atClearDate() {
  atSelectedDate = null;
  atUpdateDisplay();
  document.getElementById('atCalPopup').classList.remove('open');
  document.getElementById('atDueDisplay').classList.remove('active');
  document.removeEventListener('click', atOutsideClick);
}

function atUpdateDisplay() {
  const lbl = document.getElementById('atDueLabel');
  if(atSelectedDate) {
    const [y,m,d] = atSelectedDate.split('-');
    const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    lbl.textContent = `${d} ${MON[parseInt(m)-1]} ${y}`;
    lbl.classList.remove('at-dp-placeholder');
  } else {
    lbl.textContent = 'No date';
    lbl.classList.add('at-dp-placeholder');
  }
}

// ── ADD TASK CUSTOM DROPDOWNS (project + priority) ──
let atSelectedProject = { id: '', name: 'Inbox' };
let atSelectedPriority = { value: '1', label: 'Normal' };
const AT_PRIORITIES = [
  { value:'1', label:'Normal' },
  { value:'2', label:'P3 — Low' },
  { value:'3', label:'P2 — Medium' },
  { value:'4', label:'P1 — Urgent' },
];

function atToggleDropdown(pickerId, popupId) {
  const popup   = document.getElementById(popupId);
  const display = document.getElementById(pickerId).querySelector('.at-datepicker-display');
  const isOpen  = popup.classList.contains('open');
  // close all
  document.querySelectorAll('.at-cal-popup.open').forEach(p => p.classList.remove('open'));
  document.querySelectorAll('.at-datepicker-display.active').forEach(d => d.classList.remove('active'));
  document.removeEventListener('click', atTimeOutsideClick);
  document.removeEventListener('click', atOutsideClick);
  if(!isOpen) {
    const rect = display.getBoundingClientRect();
    popup.style.top  = (rect.bottom + 4) + 'px';
    popup.style.left = rect.left + 'px';
    popup.classList.add('open');
    display.classList.add('active');
    const handler = (e) => {
      if(!document.getElementById(pickerId).contains(e.target)) {
        popup.classList.remove('open');
        display.classList.remove('active');
        document.removeEventListener('click', handler);
      }
    };
    setTimeout(() => document.addEventListener('click', handler), 0);
  }
}

function atRenderProjectOptions() {
  const projects = [{ id:'', name:'Inbox', color:'' },
    ...Object.entries(todoistProjects)
      .filter(([,p]) => p.name !== 'Inbox')
      .map(([id,p]) => ({ id, name:p.name, color:tdColor(p.color) }))
  ];
  document.getElementById('atProjectOptions').innerHTML = projects.map(p => `
    <div class="at-list-option ${p.id===atSelectedProject.id?'selected':''}"
      onclick="atPickProject('${p.id}','${p.name.replace(/'/g,"\\'")}')">
      ${p.color ? `<span class="at-opt-dot" style="background:${p.color}"></span>` : '<span class="at-opt-dot" style="background:var(--border)"></span>'}
      ${p.name}
    </div>`).join('');
}

function atPickProject(id, name) {
  atSelectedProject = { id, name };
  document.getElementById('atProjectLabel').textContent = name;
  document.getElementById('atProjectLabel').classList.remove('at-dp-placeholder');
  document.getElementById('atProjectPopup').classList.remove('open');
  document.getElementById('atProjectDisplay').classList.remove('active');
  atRenderProjectOptions();
}

function atRenderPriorityOptions() {
  const colors = { '1':'var(--text-lt)', '2':'#4073ff', '3':'#ff9933', '4':'#db4035' };
  document.getElementById('atPriorityOptions').innerHTML = AT_PRIORITIES.map(p => `
    <div class="at-list-option ${p.value===atSelectedPriority.value?'selected':''}"
      onclick="atPickPriority('${p.value}','${p.label}')">
      <span class="at-opt-dot" style="background:${colors[p.value]}"></span>
      ${p.label}
    </div>`).join('');
}

function atPickPriority(value, label) {
  atSelectedPriority = { value, label };
  document.getElementById('atPriorityLabel').textContent = label;
  document.getElementById('atPriorityPopup').classList.remove('open');
  document.getElementById('atPriorityDisplay').classList.remove('active');
  atRenderPriorityOptions();
}

// ── ADD TASK CUSTOM TIME PICKER ──
let atSelectedHour = null, atSelectedMin = null;

function atToggleTime() {
  const popup   = document.getElementById('atTimePopup');
  const display = document.getElementById('atTimeDisplay');
  const isOpen  = popup.classList.contains('open');
  document.querySelectorAll('.at-cal-popup.open').forEach(p => p.classList.remove('open'));
  document.querySelectorAll('.at-datepicker-display.active').forEach(d => d.classList.remove('active'));
  if(!isOpen) {
    const rect = display.getBoundingClientRect();
    popup.style.top  = (rect.bottom + 4) + 'px';
    popup.style.left = rect.left + 'px';
    popup.style.width = '210px';
    atRenderTimeGrids();
    popup.classList.add('open');
    display.classList.add('active');
    setTimeout(() => document.addEventListener('click', atTimeOutsideClick), 0);
  }
}

function atTimeOutsideClick(e) {
  if(!document.getElementById('atTimePicker').contains(e.target)) {
    document.getElementById('atTimePopup').classList.remove('open');
    document.getElementById('atTimeDisplay').classList.remove('active');
    document.removeEventListener('click', atTimeOutsideClick);
  }
}

function atRenderTimeGrids() {
  const hg = document.getElementById('atHourGrid');
  const mg = document.getElementById('atMinGrid');
  hg.innerHTML = Array.from({length:24},(_,i) => {
    const v = String(i).padStart(2,'0');
    return `<button class="${v===atSelectedHour?'selected':''}" onclick="event.stopPropagation();atPickHour('${v}')">${v}</button>`;
  }).join('');
  mg.innerHTML = ['00','15','30','45'].map(v =>
    `<button class="${v===atSelectedMin?'selected':''}" onclick="event.stopPropagation();atPickMin('${v}')">${v}</button>`
  ).join('');
}

function atPickHour(v) {
  atSelectedHour = v;
  if(atSelectedMin === null) atSelectedMin = '00';
  atUpdateTimeDisplay();
  atRenderTimeGrids();
}

function atPickMin(v) {
  atSelectedMin = v;
  if(atSelectedHour === null) atSelectedHour = '09';
  atUpdateTimeDisplay();
  atRenderTimeGrids();
}

function atClearTime() {
  atSelectedHour = null; atSelectedMin = null;
  atUpdateTimeDisplay();
  document.getElementById('atTimePopup').classList.remove('open');
  document.getElementById('atTimeDisplay').classList.remove('active');
  document.removeEventListener('click', atTimeOutsideClick);
}

function atUpdateTimeDisplay() {
  const lbl = document.getElementById('atTimeLabel');
  if(atSelectedHour !== null && atSelectedMin !== null) {
    lbl.textContent = `${atSelectedHour}:${atSelectedMin}`;
    lbl.classList.remove('at-dp-placeholder');
  } else {
    lbl.textContent = 'No reminder';
    lbl.classList.add('at-dp-placeholder');
  }
}

let editingTaskId = null;

function openAddTask() {
  if(!getTodoistToken()) { openTodoistSettings(); return; }
  editingTaskId = null;
  // Reset state — all blank
  atSelectedProject  = { id: '', name: '' };
  atSelectedPriority = { value: '', label: '' };
  atSelectedDate = null; atSelectedHour = null; atSelectedMin = null;
  document.getElementById('atContent').value = '';
  document.getElementById('atDescription').value = '';
  document.getElementById('atProjectLabel').textContent = 'Project…';
  document.getElementById('atProjectLabel').classList.add('at-dp-placeholder');
  document.getElementById('atPriorityLabel').textContent = 'Priority…';
  document.getElementById('atPriorityLabel').classList.add('at-dp-placeholder');
  atUpdateDisplay();
  atUpdateTimeDisplay();
  // Modal title & buttons
  document.getElementById('atModalTitle').textContent = 'New Task';
  document.getElementById('atSaveBtn').textContent = 'Add Task';
  document.getElementById('atSaveBtn').onclick = saveAddTask;
  document.getElementById('atDeleteBtn').style.display = 'none';
  atRenderProjectOptions();
  atRenderPriorityOptions();
  document.getElementById('addTaskModal').classList.add('open');
  setTimeout(() => document.getElementById('atContent').focus(), 80);
}

function openEditTask(id) {
  if(!getTodoistToken()) return;
  const task = todoistTasks.find(t => t.id === id);
  if(!task) return;
  editingTaskId = id;

  // Populate fields from task
  document.getElementById('atContent').value = task.content || '';
  document.getElementById('atDescription').value = task.description || '';

  // Project
  const proj = todoistProjects[task.project_id];
  if(proj && proj.name !== 'Inbox') {
    atSelectedProject = { id: task.project_id, name: proj.name };
    document.getElementById('atProjectLabel').textContent = proj.name;
    document.getElementById('atProjectLabel').classList.remove('at-dp-placeholder');
  } else {
    atSelectedProject = { id: '', name: '' };
    document.getElementById('atProjectLabel').textContent = 'Project…';
    document.getElementById('atProjectLabel').classList.add('at-dp-placeholder');
  }

  // Priority (Todoist: 4=urgent, 1=normal)
  const priMap = { 4: { value: '4', label: 'Urgent' }, 3: { value: '3', label: 'High' }, 2: { value: '2', label: 'Medium' } };
  if(priMap[task.priority]) {
    atSelectedPriority = priMap[task.priority];
    document.getElementById('atPriorityLabel').textContent = priMap[task.priority].label;
    document.getElementById('atPriorityLabel').classList.remove('at-dp-placeholder');
  } else {
    atSelectedPriority = { value: '', label: '' };
    document.getElementById('atPriorityLabel').textContent = 'Priority…';
    document.getElementById('atPriorityLabel').classList.add('at-dp-placeholder');
  }

  // Due date & time
  atSelectedDate = null; atSelectedHour = null; atSelectedMin = null;
  if(task.due) {
    const dueObj = typeof task.due === 'string' ? { date: task.due } : task.due;
    if(dueObj.date) atSelectedDate = dueObj.date.slice(0, 10);
    if(dueObj.datetime && dueObj.datetime.length > 10) {
      const dt = new Date(dueObj.datetime);
      if(!isNaN(dt.getTime())) {
        atSelectedHour = String(dt.getHours()).padStart(2, '0');
        atSelectedMin  = String(dt.getMinutes()).padStart(2, '0');
      }
    }
  }
  atUpdateDisplay();
  atUpdateTimeDisplay();

  // Modal title & buttons
  document.getElementById('atModalTitle').textContent = 'Edit Task';
  document.getElementById('atSaveBtn').textContent = 'Save';
  document.getElementById('atSaveBtn').onclick = saveEditTask;
  document.getElementById('atDeleteBtn').style.display = '';
  atRenderProjectOptions();
  atRenderPriorityOptions();
  document.getElementById('addTaskModal').classList.add('open');
  setTimeout(() => document.getElementById('atContent').focus(), 80);
}

async function saveEditTask() {
  const content = document.getElementById('atContent').value.trim();
  if(!content) { document.getElementById('atContent').focus(); return; }
  if(!editingTaskId) return;

  const priority     = parseInt(atSelectedPriority.value) || 1;
  const dueDate      = atSelectedDate;
  const reminderTime = (atSelectedHour && atSelectedMin) ? `${atSelectedHour}:${atSelectedMin}` : '';
  const description  = document.getElementById('atDescription').value.trim();
  const projectId    = atSelectedProject.id;

  closeModal('addTaskModal');

  try {
    const uuid = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
    const args = { id: editingTaskId, content, priority, description: description || '' };
    if(projectId) args.project_id = projectId;
    if(dueDate && reminderTime) args.due = { date: dueDate, string: `${dueDate} ${reminderTime}` };
    else if(dueDate) args.due = { date: dueDate };
    else args.due = null;

    await todoistSync({ commands: JSON.stringify([{ type: 'item_update', uuid, args }]) });

    // Update local cache
    const task = todoistTasks.find(t => t.id === editingTaskId);
    if(task) {
      task.content     = content;
      task.priority    = priority;
      task.description = description;
      task.due         = dueDate ? { date: dueDate } : null;
      if(projectId) task.project_id = projectId;
    }
    editingTaskId = null;
    renderTodoist();
  } catch(e) {
    console.error('Edit task failed:', e);
  }
}

async function deleteEditTask() {
  if(!editingTaskId) return;
  const id = editingTaskId;
  closeModal('addTaskModal');

  try {
    const uuid = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
    await todoistSync({ commands: JSON.stringify([{ type: 'item_delete', uuid, args: { id } }]) });
    todoistTasks = todoistTasks.filter(t => t.id !== id);
    editingTaskId = null;
    renderTodoist();
  } catch(e) {
    console.error('Delete task failed:', e);
  }
}

async function saveAddTask() {
  const content = document.getElementById('atContent').value.trim();
  if(!content) { document.getElementById('atContent').focus(); return; }

  const priority     = parseInt(atSelectedPriority.value) || 1;
  const dueDate      = atSelectedDate;
  const reminderTime = (atSelectedHour && atSelectedMin) ? `${atSelectedHour}:${atSelectedMin}` : '';
  const description  = document.getElementById('atDescription').value.trim();
  const projectId    = atSelectedProject.id;

  closeModal('addTaskModal');

  try {
    const uuid   = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
    const tempId = 'temp_' + Date.now();
    const args   = { content, priority };
    if(projectId)   args.project_id = projectId;
    if(description) args.description = description;
    if(dueDate)     args.due = { date: dueDate };
    if(dueDate && reminderTime) args.due = { date: dueDate, string: `${dueDate} ${reminderTime}` };

    const data   = await todoistSync({ commands: JSON.stringify([{ type: 'item_add', temp_id: tempId, uuid, args }]) });
    const realId = (data.temp_id_mapping && data.temp_id_mapping[tempId]) || tempId;
    todoistTasks.unshift({ id: realId, content, checked: 0, priority, due: dueDate ? { date: dueDate } : null, project_id: projectId || null });
    renderTodoist();
  } catch(e) {
    console.error('Add task failed:', e);
  }
}



// ── QUICK NOTES ──
const NOTES_KEY = 'quick_notes';
function initNotes() {
  const ta  = document.getElementById('quickNotes');
  const btn = document.getElementById('notesClearBtn');
  if(!ta) return;
  ta.value = KVStore.getItem(NOTES_KEY) || '';
  if(btn) btn.style.display = ta.value ? 'inline-flex' : 'none';
}
function saveNotes() {
  const ta  = document.getElementById('quickNotes');
  const btn = document.getElementById('notesClearBtn');
  if(!ta) return;
  KVStore.setItem(NOTES_KEY, ta.value);
  if(btn) btn.style.display = ta.value ? 'inline-flex' : 'none';
}
function clearNotes() {
  if(!confirm('Clear all notes?')) return;
  document.getElementById('quickNotes').value = '';
  KVStore.removeItem(NOTES_KEY);
  document.getElementById('notesClearBtn').style.display = 'none';
}
function toggleNotesModal() {
  const modal = document.getElementById('notesModal');
  if (modal.classList.contains('open')) {
    closeModal('notesModal');
  } else {
    initNotes();
    modal.classList.add('open');
  }
}
document.getElementById('notesModal').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeModal('notesModal');
});
// Init notes on load
initNotes();

// ── DAILY BRIEFING ──
const BRIEFING_KEY      = 'briefing_cache';
const BRIEFING_DATE_KEY = 'briefing_date';

// ── Briefing periods: morning (6-13), afternoon (13-20), evening (20-6) ──
function getBriefingPeriod() {
  const h = new Date().getHours();
  if (h >= 6 && h < 13)  return 'morning';
  if (h >= 13 && h < 20)  return 'afternoon';
  return 'evening';
}

function getBriefingCacheKey() {
  const today = new Date().toISOString().slice(0,10);
  return `${today}_${getBriefingPeriod()}`;
}

function buildBriefingPrompt() {
  const now     = new Date();
  const period  = getBriefingPeriod();
  const today   = new Date(); today.setHours(0,0,0,0);
  const tomorrow = addDays(today, 1);
  const todayStr    = today.toISOString().slice(0,10);
  const tomorrowStr = tomorrow.toISOString().slice(0,10);
  const fmtDate  = d => d.toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long' });
  const fmtShort = d => d.toLocaleDateString('en-GB', { day:'numeric', month:'short' });
  const fmtTime  = d => `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;

  // Weather
  const loc        = loadWeatherLocation();
  const todayWx    = wxDailyCache[todayStr]    || {};
  const tomorrowWx = wxDailyCache[tomorrowStr] || {};
  const todayPrecip    = todayWx.precip    ?? '?';
  const tomPrecip      = tomorrowWx.precip ?? '?';
  const todayMax       = todayWx.tmax != null ? todayWx.tmax.toFixed(1) : '?';
  const todayMin       = todayWx.tmin != null ? todayWx.tmin.toFixed(1) : '?';
  const tomMax         = tomorrowWx.tmax != null ? tomorrowWx.tmax.toFixed(1) : '?';
  const tomMin         = tomorrowWx.tmin != null ? tomorrowWx.tmin.toFixed(1) : '?';
  const umbrellaToday    = todayPrecip !== '?' && parseInt(todayPrecip) >= 40;
  const umbrellaTomorrow = tomPrecip   !== '?' && parseInt(tomPrecip)   >= 40;

  // Exclude only the recurring scheduling blocks (title is exactly 👧🏻👧🏻)
  const isSchedulingEvent = (ev) => ev.title.trim() === '👧🏻👧🏻';

  // Events from ICS — for afternoon/evening, only show REMAINING events
  const eventsForDay = (dateStr, futureOnly = false) => {
    if(!icsRawCache || !icsRawCache.length) return [];
    const ws = new Date(dateStr + 'T00:00:00');
    const we = new Date(dateStr + 'T23:59:59');
    return getEventsInWindow(ws, we)
      .filter(e => !isSchedulingEvent(e))
      .filter(e => {
        if (!futureOnly || e.allDay) return true;
        return new Date(e.start) > now;
      })
      .map(e => e.title);
  };

  const showFutureOnly = period !== 'morning';
  const todayEvents    = eventsForDay(todayStr, showFutureOnly);
  const tomorrowEvents = eventsForDay(tomorrowStr);

  // Todoist tasks
  const briefingDueDate = (t) => {
    if (!t.due) return '';
    if (typeof t.due === 'string') return t.due.slice(0,10);
    return (t.due.date || t.due.datetime || '').slice(0,10);
  };
  const getTasksDue = (dateStr) => todoistTasks.filter(t => {
    if(t.checked) return false;
    return briefingDueDate(t) === dateStr;
  }).map(t => t.content);
  const todayTasks    = getTasksDue(todayStr);
  const tomorrowTasks = getTasksDue(tomorrowStr);
  const overdueTasks  = todoistTasks.filter(t => {
    if(t.checked) return false;
    const due = briefingDueDate(t);
    return due && due < todayStr;
  }).map(t => t.content);

  // Upcoming birthdays (next 14 days) — detect by RRULE:YEARLY + title pattern
  const upcomingBirthdays = [];
  if(icsRawCache && icsRawCache.length) {
    for(const ev of icsRawCache) {
      if(!ev.start || !ev.title) continue;
      if(!ev.rrule || !ev.rrule.includes('YEARLY')) continue;
      const lc = ev.title.toLowerCase();
      if(!lc.includes('aniversário') && !lc.includes('aniversario') && !lc.includes('birthday')) continue;
      const occs = expandRecurring(ev, today, addDays(today, 14));
      occs.forEach(occ => {
        const days = Math.round((occ - today) / 86400000);
        const name = ev.title.replace(/🎂\s*/,'').replace(/Aniversário de /i,'').replace(/Aniversario de /i,'').trim();
        if(days === 0)      upcomingBirthdays.push(`${name} — TODAY`);
        else if(days === 1) upcomingBirthdays.push(`${name} — tomorrow`);
        else                upcomingBirthdays.push(`${name} — in ${days} days (${fmtShort(occ)})`);
      });
    }
  }

  const upcomingEvents = [];
  if(icsRawCache && icsRawCache.length) {
    const in7 = addDays(today, 7);
    const ws  = addDays(today, 2); // start from day after tomorrow
    const evs = getEventsInWindow(ws, in7);
    evs.forEach(ev => {
      const lc = ev.title.toLowerCase();
      if(lc.includes('aniversário') || lc.includes('aniversario') || lc.includes('birthday')) return;
      if(isSchedulingEvent(ev)) return;
      const days = Math.round((new Date(ev.start).setHours(0,0,0,0) - today.getTime()) / 86400000);
      upcomingEvents.push(`"${ev.title}" — in ${days} days (${fmtShort(new Date(ev.start))})`);
    });
  }

  // Period-specific context
  const periodInfo = {
    morning:   { greeting: 'Good morning', timeContext: `Current time: ${fmtTime(now)} (morning)` },
    afternoon: { greeting: 'Good afternoon', timeContext: `Current time: ${fmtTime(now)} (afternoon)` },
    evening:   { greeting: 'Good evening', timeContext: `Current time: ${fmtTime(now)} (evening)` },
  }[period];

  const lines = [
    `Today: ${fmtDate(today)} — ${loc.name}`,
    periodInfo.timeContext,
    `Weather today: ${todayMax}°C / ${todayMin}°C, rain ${todayPrecip}%${umbrellaToday ? ' ☂ BRING UMBRELLA' : ''}`,
    `Weather tomorrow: ${tomMax}°C / ${tomMin}°C, rain ${tomPrecip}%${umbrellaTomorrow ? ' ☂ BRING UMBRELLA' : ''}`,
    todayTasks.length    ? `Today's remaining tasks: ${todayTasks.join('; ')}`       : '',
    todayEvents.length   ? `Today's ${showFutureOnly ? 'remaining ' : ''}events: ${todayEvents.join('; ')}` : (showFutureOnly ? 'No more events today' : ''),
    tomorrowTasks.length ? `Tomorrow's tasks: ${tomorrowTasks.join('; ')}` : '',
    tomorrowEvents.length? `Tomorrow's events: ${tomorrowEvents.join('; ')}` : '',
    overdueTasks.length  ? `OVERDUE tasks (action needed): ${overdueTasks.join('; ')}` : '',
    upcomingBirthdays.length ? `Upcoming birthdays: ${upcomingBirthdays.join('; ')}` : '',
    upcomingEvents.length    ? `Upcoming calendar events (next 7 days): ${upcomingEvents.join('; ')}` : '',
  ].filter(Boolean).join('\n');

  const periodRules = {
    morning: `- Start with "${periodInfo.greeting}" and the weather overview for the day ahead
- Mention umbrella warning if needed
- Mention today's tasks and events if any; mention overdue tasks urgently
- End with upcoming birthdays and events in the next few days`,
    afternoon: `- Start with "${periodInfo.greeting}" and an update on the rest of the day
- Focus on weather changes for the rest of the day and evening (e.g. "it will get colder tonight", "rain expected this evening")
- Only mention REMAINING events and tasks — skip anything already past
- Mention overdue tasks urgently if any
- End with a look-ahead to tomorrow and upcoming birthdays/events`,
    evening: `- Start with "${periodInfo.greeting}" and a brief weather wrap-up
- Mention if it will be cold tonight or if rain is expected
- Focus on tomorrow: weather, tasks, events
- Only mention remaining tasks if any; skip past events entirely
- End with upcoming birthdays and events in the next few days`,
  }[period];

  return `You are a sharp personal assistant. Write a concise ${period} briefing based on this data:

${lines}

Rules:
- 2–3 short paragraphs, plain prose, no bullet points, no headers
${periodRules}
- If no upcoming items, skip the heads-up entirely
- Skip any section with no data
- IMPORTANT: treat each task and event as independent items — never merge, combine, or infer connections between separate items
- IMPORTANT: write ENTIRELY in English — translate Portuguese words into English (e.g. "psiquiatria" → "psychiatry") but keep abbreviations, acronyms, and short codes exactly as they are (e.g. "DM" stays "DM", "GP" stays "GP")
- Tone: direct, warm, concise`;
}

async function loadBriefing(force = false) {
  const apiKey = getApiKey();
  if(!apiKey) {
    if (activeBriefingTab === 'daily') {
      document.getElementById('briefingBody').innerHTML =
        '<div class="td-empty" style="padding-top:1rem">Configure your Claude API key to generate the briefing.</div>';
    }
    return;
  }

  // Cache: only regenerate if forced or period changed
  const cacheKey = getBriefingCacheKey();
  if(!force) {
    const cachedKey  = KVStore.getItem(BRIEFING_DATE_KEY);
    const cachedText = KVStore.getItem(BRIEFING_KEY);
    if(cachedKey === cacheKey && cachedText) {
      renderBriefing(cachedText);
      return;
    }
  }

  const body = document.getElementById('briefingBody');
  const btn  = document.getElementById('briefingRefreshBtn');
  if (activeBriefingTab === 'daily') body.innerHTML = '<div class="td-empty" style="padding-top:1rem;font-style:italic">Generating briefing…</div>';
  if(btn) btn.disabled = true;

  try {
    const prompt = buildBriefingPrompt();
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-20250514',
        max_tokens: 600,
        messages:   [{ role:'user', content: prompt }]
      })
    });
    const data = await res.json();
    const text = data?.content?.[0]?.text || 'Could not generate the briefing.';
    KVStore.setItem(BRIEFING_KEY, text);
    KVStore.setItem(BRIEFING_DATE_KEY, cacheKey);
    renderBriefing(text);
  } catch(e) {
    if (activeBriefingTab === 'daily') body.innerHTML = '<div class="td-empty" style="padding-top:1rem;color:var(--err)">Error generating briefing.</div>';
    console.error('Briefing error:', e);
  } finally {
    if(btn) btn.disabled = false;
  }
}

// ── Auto-refresh briefing when period changes ──
let _lastBriefingPeriod = getBriefingCacheKey();
setInterval(() => {
  const current = getBriefingCacheKey();
  if (current !== _lastBriefingPeriod) {
    _lastBriefingPeriod = current;
    if (currentView === 'calendar') {
      loadBriefing(true);
      // Show the new daily briefing if that tab is active
      if (activeBriefingTab === 'daily') {
        // already shown by loadBriefing
      }
    }
  }
}, 60000); // check every minute

// ══════════════════════════════════════════════
// ── SPORTS ICS CALENDARS (hidden from visual calendar) ──
// ══════════════════════════════════════════════
const DEFAULT_SPORTS_ICS = [
  { name:'F1', url:'https://ics.fixtur.es/v2/league/formula-1.ics', color:'#e10600' },
  { name:'Benfica', url:'https://ics.fixtur.es/v2/team/sl-benfica.ics', color:'#ff0000' },
  { name:'Sporting', url:'https://ics.fixtur.es/v2/team/sporting-cp.ics', color:'#00a651' },
  { name:'Porto', url:'https://ics.fixtur.es/v2/team/fc-porto.ics', color:'#003893' },
  { name:'Arsenal', url:'https://ics.fixtur.es/v2/team/arsenal.ics', color:'#ef0107' },
  { name:'Chelsea', url:'https://ics.fixtur.es/v2/team/chelsea.ics', color:'#034694' },
  { name:'Fulham', url:'https://ics.fixtur.es/v2/team/fulham.ics', color:'#000000' },
  { name:'Liverpool', url:'https://ics.fixtur.es/v2/team/liverpool.ics', color:'#c8102e' },
  { name:'Man City', url:'https://ics.fixtur.es/v2/team/manchester-city.ics', color:'#6cabdd' },
  { name:'Man Utd', url:'https://ics.fixtur.es/v2/team/manchester-united.ics', color:'#da291c' },
  { name:'AC Milan', url:'https://ics.fixtur.es/v2/team/ac-milan.ics', color:'#fb090b' },
  { name:'Juventus', url:'https://ics.fixtur.es/v2/team/juventus.ics', color:'#000000' },
  { name:'PSG', url:'https://ics.fixtur.es/v2/team/paris-saint-germain.ics', color:'#004170' },
  { name:'Champions League', url:'https://ics.fixtur.es/v2/league/champions-league.ics', color:'#1a3a6e' },
  { name:'Europa League', url:'https://ics.fixtur.es/v2/league/europa-league.ics', color:'#f68e1e' },
  { name:'ATP', url:'https://ics.fixtur.es/v2/league/atp-500.ics', color:'#00529b' },
  { name:'WTA', url:'https://ics.fixtur.es/v2/league/wta-1000.ics', color:'#792f8a' },
];

function loadSportsCalendars() {
  try { const v = KVStore.getItem('sports_calendars'); return v ? JSON.parse(v) : [...DEFAULT_SPORTS_ICS]; }
  catch { return [...DEFAULT_SPORTS_ICS]; }
}
function saveSportsCalendars(c) { KVStore.setItem('sports_calendars', JSON.stringify(c)); }

function switchCalModalTab(tab) {
  document.getElementById('calPanelPersonal').style.display = tab === 'personal' ? '' : 'none';
  document.getElementById('calPanelSports').style.display = tab === 'sports' ? '' : 'none';
  document.getElementById('btnCalTabPersonal').classList.toggle('active', tab === 'personal');
  document.getElementById('btnCalTabSports').classList.toggle('active', tab === 'sports');
  document.getElementById('calModalTitle').textContent = tab === 'personal' ? 'Manage Calendars' : 'Sports Calendars';
  if (tab === 'sports') renderSportsList();
}

function renderSportsList() {
  const cals = loadSportsCalendars();
  const el = document.getElementById('sportsList');
  if (!cals.length) { el.innerHTML = '<div style="font-family:\'EB Garamond\',serif;font-style:italic;color:var(--text-lt);font-size:.9rem;padding:.5rem 0">No sports feeds configured.</div>'; return; }
  el.innerHTML = cals.map((c, i) => `
    <div class="feed-row">
      <div class="feed-row-info" style="flex:1;min-width:0">
        <span class="feed-row-label">${c.name}</span>
        <div class="feed-row-url" title="${c.url}">${c.url}</div>
      </div>
      <button class="feed-btn" onclick="deleteSportsCal(${i})" title="Remove">✕</button>
    </div>`).join('');
}

function addSportsCalendar() {
  const url  = document.getElementById('sportsUrl').value.trim();
  const name = document.getElementById('sportsName').value.trim();
  const status = document.getElementById('sportsStatus');
  if (!url) { status.textContent = 'URL is required'; status.className = 'feed-status visible st-error'; return; }
  if (!name) { status.textContent = 'Name is required'; status.className = 'feed-status visible st-error'; return; }
  if (!url.startsWith('http')) { status.textContent = 'URL must start with http'; status.className = 'feed-status visible st-error'; return; }
  if (name.startsWith('http')) { status.textContent = 'Name should not be a URL — check if fields are swapped'; status.className = 'feed-status visible st-error'; return; }
  const cals = loadSportsCalendars();
  if (cals.some(c => c.url === url)) { status.textContent = 'Already added'; status.className = 'feed-status visible st-error'; return; }
  cals.push({ name, url, color: '#808080' });
  saveSportsCalendars(cals);
  document.getElementById('sportsUrl').value = '';
  document.getElementById('sportsName').value = '';
  status.textContent = '';
  status.className = 'feed-status';
  renderSportsList();
  sportsRawCache = []; // force reload on next briefing
}

function deleteSportsCal(i) {
  const cals = loadSportsCalendars();
  cals.splice(i, 1);
  saveSportsCalendars(cals);
  renderSportsList();
  sportsRawCache = []; // force reload on next briefing
}

let sportsRawCache = [];
let _sportsLoading = false;

async function loadAllSportsIcs() {
  if (_sportsLoading) return;
  _sportsLoading = true;
  try {
    const cals = loadSportsCalendars();
    sportsRawCache = [];
    const results = await Promise.allSettled(cals.map(async c => {
      const text = await fetchViaProxy(c.url, 15000);
      return parseIcs(text, c.name, c.color);
    }));
    results.forEach(r => { if (r.status === 'fulfilled') sportsRawCache.push(...r.value); });
    // Deduplicate by UID
    const seen = new Set();
    sportsRawCache = sportsRawCache.filter(ev => {
      if (!ev.uid) return true;
      if (seen.has(ev.uid)) return false;
      seen.add(ev.uid);
      return true;
    });
  } finally {
    _sportsLoading = false;
  }
}

// ── Sports Briefing ──
const SPORTS_BRIEFING_KEY      = 'sports_briefing_cache';
const SPORTS_BRIEFING_DATE_KEY = 'sports_briefing_date';

function getSportsBriefingCacheKey() {
  const today = new Date().toISOString().slice(0,10);
  return `${today}_${getBriefingPeriod()}`;
}

function buildSportsBriefingPrompt() {
  const now    = new Date();
  const period = getBriefingPeriod();
  const today  = new Date(); today.setHours(0,0,0,0);
  const fmtDate  = d => d.toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long' });
  const fmtShort = d => d.toLocaleDateString('en-GB', { weekday:'short', day:'numeric', month:'short' });
  const fmtTime  = d => `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;

  // Get sports events for next 7 days
  const windowStart = period !== 'morning' ? now : today;
  const windowEnd = addDays(today, 7);

  if (!sportsRawCache.length) return null;

  const events = [];
  for (const rev of sportsRawCache) {
    if (!rev.start || !rev.title) continue;
    const ws = new Date(windowStart);
    const we = new Date(windowEnd);
    const occs = expandRecurring(rev, ws, we);
    for (const occ of occs) {
      if (rev.exdates && rev.exdates.some(ex => ex && ex.toDateString() === occ.toDateString())) continue;
      if (occ >= ws && occ <= we) {
        events.push({
          start: occ,
          title: rev.title,
          calName: rev.calName,
          allDay: rev.allDay,
        });
      }
    }
  }
  events.sort((a, b) => a.start - b.start);

  if (!events.length) return null;

  // Group by day
  const days = {};
  events.forEach(e => {
    const dayKey = e.start.toISOString().slice(0, 10);
    if (!days[dayKey]) days[dayKey] = [];
    const timeStr = e.allDay ? 'All day' : fmtTime(e.start);
    days[dayKey].push(`${timeStr} — ${e.calName}: ${e.title}`);
  });

  const lines = Object.entries(days).map(([date, evts]) => {
    const d = new Date(date + 'T12:00:00');
    const dayDiff = Math.round((d.setHours(0,0,0,0) - today.getTime()) / 86400000);
    let label;
    if (dayDiff === 0) label = 'Today';
    else if (dayDiff === 1) label = 'Tomorrow';
    else label = fmtShort(new Date(date + 'T12:00:00'));
    return `${label}:\n${evts.join('\n')}`;
  }).join('\n\n');

  const periodGreeting = { morning: 'Good morning', afternoon: 'Good afternoon', evening: 'Good evening' }[period];

  return `You are a sports-savvy personal assistant. Write a concise sports briefing based on this schedule of upcoming events (times are Lisbon/Portugal time):

${lines}

Rules:
- Start with "${periodGreeting}" and a brief overview of what's coming up
- 2–4 short paragraphs, plain prose, no bullet points, no headers, no bold, no markdown
- Group by sport naturally: football first, then F1, then tennis
- For football: mention the teams, competition, day and kick-off time. Highlight big matches (derbies, top teams clashing, Champions League knockout games)
- For F1: mention which GP, what sessions are coming (practice, qualifying, race) and times
- For tennis: mention tournament name, stage, and notable players if the event title includes them
- All times must be in Lisbon time (already provided)
- ${period === 'afternoon' ? 'Focus on remaining events today and upcoming days' : period === 'evening' ? 'Focus on tomorrow and the coming days' : 'Cover today and the days ahead'}
- Skip sports with no events in the window
- If there are many events, prioritise: Champions League/Europa League knockout stages, F1 race days, Grand Slam finals, then domestic league top matches
- Tone: enthusiastic but concise, like a knowledgeable friend giving you a heads-up
- Write in English`;
}

async function loadSportsBriefing(force = false) {
  const apiKey = getApiKey();
  if (!apiKey) {
    renderBriefing('<div class="td-empty" style="padding-top:1rem">Configure your Claude API key to generate the sports briefing.</div>', true);
    return;
  }

  // Ensure sports data is loaded
  if (!sportsRawCache.length) {
    renderBriefing('<div class="td-empty" style="padding-top:1rem;font-style:italic">Loading sports calendars…</div>', true);
    await loadAllSportsIcs();
  }

  const cacheKey = getSportsBriefingCacheKey();
  if (!force) {
    const cachedKey  = KVStore.getItem(SPORTS_BRIEFING_DATE_KEY);
    const cachedText = KVStore.getItem(SPORTS_BRIEFING_KEY);
    if (cachedKey === cacheKey && cachedText) {
      renderBriefing(cachedText, true);
      return;
    }
  }

  const body = document.getElementById('briefingBody');
  const btn  = document.getElementById('briefingRefreshBtn');
  if (activeBriefingTab === 'sports') body.innerHTML = '<div class="td-empty" style="padding-top:1rem;font-style:italic">Generating sports briefing…</div>';
  if (btn) btn.disabled = true;

  try {
    const prompt = buildSportsBriefingPrompt();
    if (!prompt) {
      renderBriefing('<div class="td-empty" style="padding-top:1rem">No upcoming sports events found.</div>', true);
      return;
    }

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-20250514',
        max_tokens: 800,
        messages:   [{ role: 'user', content: prompt }]
      })
    });
    const data = await res.json();
    const text = data?.content?.[0]?.text || 'Could not generate the sports briefing.';
    KVStore.setItem(SPORTS_BRIEFING_KEY, text);
    KVStore.setItem(SPORTS_BRIEFING_DATE_KEY, cacheKey);
    renderBriefing(text, true);
  } catch (e) {
    if (activeBriefingTab === 'sports') body.innerHTML = '<div class="td-empty" style="padding-top:1rem;color:var(--err)">Error generating sports briefing.</div>';
    console.error('Sports briefing error:', e);
  } finally {
    if (btn) btn.disabled = false;
  }
}

// ── Briefing tab switching with blur transition ──
let activeBriefingTab = 'daily';

function switchBriefingTab(tab) {
  if (tab === activeBriefingTab) return;
  activeBriefingTab = tab;

  // Update button states
  document.getElementById('btnBriefingDaily').classList.toggle('active', tab === 'daily');
  document.getElementById('btnBriefingSports').classList.toggle('active', tab === 'sports');

  // Update title
  document.getElementById('briefingTitle').textContent = tab === 'daily' ? 'Daily Briefing' : 'Sports Briefing';

  // Blur out
  const body = document.getElementById('briefingBody');
  body.style.filter = 'blur(6px)';
  body.style.opacity = '0.3';

  setTimeout(() => {
    if (tab === 'daily') {
      const cachedKey  = KVStore.getItem(BRIEFING_DATE_KEY);
      const cachedText = KVStore.getItem(BRIEFING_KEY);
      if (cachedKey === getBriefingCacheKey() && cachedText) {
        renderBriefing(cachedText);
      } else {
        loadBriefing();
      }
    } else {
      const cachedKey  = KVStore.getItem(SPORTS_BRIEFING_DATE_KEY);
      const cachedText = KVStore.getItem(SPORTS_BRIEFING_KEY);
      if (cachedKey === getSportsBriefingCacheKey() && cachedText) {
        renderBriefing(cachedText, true);
      } else {
        loadSportsBriefing();
      }
    }
    // Unblur
    setTimeout(() => {
      body.style.filter = 'none';
      body.style.opacity = '1';
    }, 100);
  }, 300);
}

async function refreshAllBriefings() {
  const btn = document.getElementById('briefingRefreshBtn');
  if (btn) btn.disabled = true;
  try {
    // Refresh both in parallel, but show the active one
    const dailyP = loadBriefing(true);
    const sportsP = loadSportsBriefing(true);
    if (activeBriefingTab === 'daily') await dailyP;
    else await sportsP;
    // Wait for the other to finish in background
    await Promise.allSettled([dailyP, sportsP]);
  } finally {
    if (btn) btn.disabled = false;
  }
}

function renderBriefing(text, isSports) {
  // Only render if the active tab matches this briefing type
  if (isSports && activeBriefingTab !== 'sports') return;
  if (!isSports && activeBriefingTab !== 'daily') return;
  const body = document.getElementById('briefingBody');
  if (!body) return;
  if (typeof text === 'string' && text.startsWith('<')) {
    body.innerHTML = text; return;
  }
  const html = text.trim().split(/\n\n+/).map(p =>
    `<p style="margin-bottom:.9rem">${p.trim()}</p>`
  ).join('');
  body.innerHTML = html;
}


// ══════════════════════════════════════════════
// ── CALDAV / ADD EVENT ──
// ══════════════════════════════════════════════

const CALDAV_USER_KEY = 'caldav_user';
const CALDAV_PASS_KEY = 'caldav_pass';
const CALDAV_BASE     = 'https://caldav.fastmail.com/dav/calendars/user/';

function getCaldavCreds() {
  return {
    user: KVStore.getItem(CALDAV_USER_KEY) || '',
    pass: KVStore.getItem(CALDAV_PASS_KEY) || '',
  };
}

function openCaldavSettings() {
  const { user, pass } = getCaldavCreds();
  document.getElementById('caldavUser').value = user;
  document.getElementById('caldavPass').value = pass;
  document.getElementById('caldavModal').classList.add('open');
}

function saveCaldavSettings() {
  const user = document.getElementById('caldavUser').value.trim();
  const pass = document.getElementById('caldavPass').value.trim();
  if (!user || !pass) return;
  KVStore.setItem(CALDAV_USER_KEY, user);
  KVStore.setItem(CALDAV_PASS_KEY, pass);
  closeModal('caldavModal');
  // Refresh calendar list for the event modal
  aeFetchCalendars();
}

// ── CalDAV proxy call via worker ──
async function caldavRequest(method, targetUrl, body = null, depth = '0', extraHeaders = {}) {
  const { user, pass } = getCaldavCreds();
  const headers = {
    'Content-Type': 'application/json',
    'x-caldav-user': user,
    'x-caldav-pass': pass,
    'x-caldav-method': method,
    'x-caldav-url': targetUrl,
    'x-caldav-depth': depth,
    ...extraHeaders,
  };
  const res = await authFetch(`${WORKER_URL}/caldav`, {
    method: 'POST',
    headers,
    body: body || '',
  });
  return { status: res.status, text: await res.text() };
}

// ── PROPFIND — list user's calendars ──
let aeCalendars = []; // [{displayName, url, color}]

async function aeFetchCalendars() {
  const { user } = getCaldavCreds();
  if (!user) return;
  const principalUrl = `${CALDAV_BASE}${user}/`;
  try {
    const { status, text } = await caldavRequest('PROPFIND', principalUrl, null, '1');
    if (status !== 207 && status !== 200) return;
    // Parse XML response to extract calendar collections
    const parser = new DOMParser();
    const xml = parser.parseFromString(text, 'application/xml');
    const responses = xml.querySelectorAll('response');
    aeCalendars = [];
    responses.forEach(r => {
      const href = r.querySelector('href')?.textContent?.trim() || '';
      const resourcetype = r.querySelector('resourcetype');
      const isCalendar = resourcetype && resourcetype.querySelector('calendar');
      if (!isCalendar) return;
      const name = r.querySelector('displayname')?.textContent?.trim() || href.split('/').filter(Boolean).pop() || 'Calendar';
      const fullUrl = href.startsWith('http') ? href : `https://caldav.fastmail.com${href}`;
      aeCalendars.push({ displayName: name, url: fullUrl });
    });
    aeRenderCalendarOptions();
  } catch (e) {
    console.warn('CalDAV PROPFIND failed:', e);
  }
}

// ── Add Event state ──
let aeState = {
  calUrl: null, calName: null,
  startDate: null, startH: null, startM: null,
  endDate: null,   endH: null,   endM: null,
  calYear:  { start: new Date().getFullYear(), end: new Date().getFullYear() },
  calMonth: { start: new Date().getMonth(),    end: new Date().getMonth() },
};

function aeRenderCalendarOptions() {
  const el = document.getElementById('aeCalOptions');
  if (!el) return;
  const filtered = aeCalendars.filter(c => !/default.task.calendar/i.test(c.displayName));
  if (!filtered.length) {
    el.innerHTML = '<div style="padding:.4rem .6rem;font-size:.82rem;color:var(--text-lt)">No calendars found. Check credentials.</div>';
    return;
  }
  el.innerHTML = filtered.map((c, i) => {
    const origIdx = aeCalendars.indexOf(c);
    return `<div class="at-list-option" onclick="aePickCal(${origIdx})">${c.displayName}</div>`;
  }).join('');
}

function aePickCal(i) {
  aeState.calUrl  = aeCalendars[i].url;
  aeState.calName = aeCalendars[i].displayName;
  document.getElementById('aeCalLabel').textContent = aeCalendars[i].displayName;
  document.getElementById('aeCalLabel').classList.remove('at-dp-placeholder');
  document.getElementById('aeCalPopup').classList.remove('open');
  document.getElementById('aeCalDisplay').classList.remove('active');
}

// ── Shared: close all AE popups ──
function aeCloseAllPopups() {
  ['aeStartCalPopup','aeEndCalPopup','aeStartTimePopup','aeEndTimePopup','aeCalPopup'].forEach(id => {
    document.getElementById(id)?.classList.remove('open');
  });
  ['aeStartDateDisplay','aeEndDateDisplay','aeStartTimeDisplay','aeEndTimeDisplay','aeCalDisplay'].forEach(id => {
    document.getElementById(id)?.classList.remove('active');
  });
}

// ── Date pickers (start / end) — identical pattern to atToggleCal ──
function aeToggleCal(which) {
  const popupId   = which === 'start' ? 'aeStartCalPopup'    : 'aeEndCalPopup';
  const displayId = which === 'start' ? 'aeStartDateDisplay' : 'aeEndDateDisplay';
  const popup     = document.getElementById(popupId);
  const display   = document.getElementById(displayId);
  const isOpen    = popup.classList.contains('open');
  aeCloseAllPopups();
  if (!isOpen) {
    const now = new Date();
    const selDate = which === 'start' ? aeState.startDate : aeState.endDate;
    aeState.calYear[which]  = selDate ? parseInt(selDate.slice(0,4))  : now.getFullYear();
    aeState.calMonth[which] = selDate ? parseInt(selDate.slice(5,7))-1 : now.getMonth();
    const rect = display.getBoundingClientRect();
    popup.style.top  = (rect.bottom + 4) + 'px';
    popup.style.left = rect.left + 'px';
    aeRenderCalGrid(which);
    popup.classList.add('open');
    display.classList.add('active');
    setTimeout(() => document.addEventListener('click', aeOutsideClick), 0);
  }
}

function aeCalNav(which, dir, e) {
  if (e) e.stopPropagation();
  aeState.calMonth[which] += dir;
  if (aeState.calMonth[which] < 0)  { aeState.calMonth[which] = 11; aeState.calYear[which]--; }
  if (aeState.calMonth[which] > 11) { aeState.calMonth[which] = 0;  aeState.calYear[which]++; }
  aeRenderCalGrid(which);
}

function aeRenderCalGrid(which) {
  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const DAYS   = ['M','T','W','T','F','S','S'];
  const y = aeState.calYear[which], m = aeState.calMonth[which];
  const labelId = which === 'start' ? 'aeStartCalMonthLabel' : 'aeEndCalMonthLabel';
  const gridId  = which === 'start' ? 'aeStartCalGrid'       : 'aeEndCalGrid';
  document.getElementById(labelId).textContent = `${MONTHS[m]} ${y}`;

  const today = new Date(); today.setHours(0,0,0,0);
  const todayStr = today.toISOString().slice(0,10);
  const selDate  = which === 'start' ? aeState.startDate : aeState.endDate;

  let firstDow = new Date(y, m, 1).getDay() - 1;
  if (firstDow < 0) firstDow = 6;
  const daysInMonth = new Date(y, m+1, 0).getDate();
  const daysInPrev  = new Date(y, m, 0).getDate();

  let html = DAYS.map(d => `<div class="at-dow">${d}</div>`).join('');
  for (let i = 0; i < firstDow; i++)
    html += `<div class="at-day other-month">${daysInPrev - firstDow + 1 + i}</div>`;
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    let cls = 'at-day';
    if (dateStr === todayStr) cls += ' today';
    if (dateStr === selDate)  cls += ' selected';
    html += `<div class="${cls}" onclick="aePickDate('${which}','${dateStr}')">${d}</div>`;
  }
  let next = 1;
  const total = firstDow + daysInMonth;
  const remaining = total % 7 === 0 ? 0 : 7 - (total % 7);
  for (let i = 0; i < remaining; i++)
    html += `<div class="at-day other-month">${next++}</div>`;

  document.getElementById(gridId).innerHTML = html;
}

function aePickDate(which, dateStr) {
  if (dateStr === null) {
    // Clear
    if (which === 'start') {
      aeState.startDate = null;
      document.getElementById('aeStartDateLabel').textContent = 'No date';
      document.getElementById('aeStartDateLabel').classList.add('at-dp-placeholder');
      document.getElementById('aeStartCalPopup').classList.remove('open');
      document.getElementById('aeStartDateDisplay').classList.remove('active');
    } else {
      aeState.endDate = null;
      document.getElementById('aeEndDateLabel').textContent = 'No date';
      document.getElementById('aeEndDateLabel').classList.add('at-dp-placeholder');
      document.getElementById('aeEndCalPopup').classList.remove('open');
      document.getElementById('aeEndDateDisplay').classList.remove('active');
    }
    document.removeEventListener('click', aeOutsideClick);
    return;
  }
  const d = new Date(dateStr + 'T00:00:00');
  const label = d.toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' });
  if (which === 'start') {
    aeState.startDate = dateStr;
    aeState.calYear.start  = d.getFullYear();
    aeState.calMonth.start = d.getMonth();
    document.getElementById('aeStartDateLabel').textContent = label;
    document.getElementById('aeStartDateLabel').classList.remove('at-dp-placeholder');
    // Auto-set end date to same if not set yet
    if (!aeState.endDate) {
      aeState.endDate = dateStr;
      aeState.calYear.end  = d.getFullYear();
      aeState.calMonth.end = d.getMonth();
      document.getElementById('aeEndDateLabel').textContent = label;
      document.getElementById('aeEndDateLabel').classList.remove('at-dp-placeholder');
    }
    document.getElementById('aeStartCalPopup').classList.remove('open');
    document.getElementById('aeStartDateDisplay').classList.remove('active');
    document.removeEventListener('click', aeOutsideClick);
    aeRenderCalGrid('start');
  } else {
    aeState.endDate = dateStr;
    aeState.calYear.end  = d.getFullYear();
    aeState.calMonth.end = d.getMonth();
    document.getElementById('aeEndDateLabel').textContent = label;
    document.getElementById('aeEndDateLabel').classList.remove('at-dp-placeholder');
    document.getElementById('aeEndCalPopup').classList.remove('open');
    document.getElementById('aeEndDateDisplay').classList.remove('active');
    document.removeEventListener('click', aeOutsideClick);
    aeRenderCalGrid('end');
  }
}

// ── Time pickers (start / end) — identical pattern to atToggleTime ──
function aeToggleTime(which) {
  const popupId   = which === 'start' ? 'aeStartTimePopup'   : 'aeEndTimePopup';
  const displayId = which === 'start' ? 'aeStartTimeDisplay' : 'aeEndTimeDisplay';
  const popup     = document.getElementById(popupId);
  const display   = document.getElementById(displayId);
  const isOpen    = popup.classList.contains('open');
  aeCloseAllPopups();
  if (!isOpen) {
    const rect = display.getBoundingClientRect();
    popup.style.top  = (rect.bottom + 4) + 'px';
    popup.style.left = rect.left + 'px';
    aeRenderTimeGrids(which);
    popup.classList.add('open');
    display.classList.add('active');
    setTimeout(() => document.addEventListener('click', aeOutsideClick), 0);
  }
}

function aeRenderTimeGrids(which) {
  const hGrid = which === 'start' ? 'aeStartHourGrid' : 'aeEndHourGrid';
  const mGrid = which === 'start' ? 'aeStartMinGrid'  : 'aeEndMinGrid';
  const curH  = which === 'start' ? aeState.startH    : aeState.endH;
  const curM  = which === 'start' ? aeState.startM    : aeState.endM;
  let hHtml = '';
  for (let h = 0; h < 24; h++) {
    hHtml += `<button class="at-time-btn${curH===h?' selected':''}"
      onclick="aePickTime('${which}',${h},null);event.stopPropagation()">${String(h).padStart(2,'0')}</button>`;
  }
  const mins = [0,15,30,45];
  const mHtml = mins.map(m =>
    `<button class="at-time-btn${curM===m?' selected':''}"
      onclick="aePickTime('${which}',null,${m});event.stopPropagation()">${String(m).padStart(2,'0')}</button>`
  ).join('');
  document.getElementById(hGrid).innerHTML = hHtml;
  document.getElementById(mGrid).innerHTML = mHtml;
}

function aePickTime(which, h, m) {
  const hKey      = which === 'start' ? 'startH'           : 'endH';
  const mKey      = which === 'start' ? 'startM'           : 'endM';
  const labelId   = which === 'start' ? 'aeStartTimeLabel' : 'aeEndTimeLabel';
  const popupId   = which === 'start' ? 'aeStartTimePopup' : 'aeEndTimePopup';
  const displayId = which === 'start' ? 'aeStartTimeDisplay' : 'aeEndTimeDisplay';

  if (h === null && m === null) {
    // Clear → all day
    aeState[hKey] = null; aeState[mKey] = null;
    document.getElementById(labelId).textContent = 'All day';
    document.getElementById(labelId).classList.add('at-dp-placeholder');
    document.getElementById(popupId).classList.remove('open');
    document.getElementById(displayId).classList.remove('active');
    document.removeEventListener('click', aeOutsideClick);
    return;
  }
  if (h !== null) aeState[hKey] = h;
  if (m !== null) aeState[mKey] = m;
  const curH = aeState[hKey], curM = aeState[mKey];
  if (curH !== null && curM !== null) {
    const timeStr = `${String(curH).padStart(2,'0')}:${String(curM).padStart(2,'0')}`;
    document.getElementById(labelId).textContent = timeStr;
    document.getElementById(labelId).classList.remove('at-dp-placeholder');
    document.getElementById(popupId).classList.remove('open');
    document.getElementById(displayId).classList.remove('active');
    document.removeEventListener('click', aeOutsideClick);
    // Auto-set end time 1h later if start just set and end not set
    if (which === 'start' && aeState.endH === null) {
      const eH = (curH + 1) % 24;
      aeState.endH = eH; aeState.endM = curM;
      document.getElementById('aeEndTimeLabel').textContent = `${String(eH).padStart(2,'0')}:${String(curM).padStart(2,'0')}`;
      document.getElementById('aeEndTimeLabel').classList.remove('at-dp-placeholder');
    }
  } else {
    aeRenderTimeGrids(which);
  }
}

// ── Calendar dropdown toggle (identical to atToggleDropdown) ──
function aeToggleCalDropdown() {
  const popup   = document.getElementById('aeCalPopup');
  const display = document.getElementById('aeCalDisplay');
  const isOpen  = popup.classList.contains('open');
  aeCloseAllPopups();
  if (!isOpen) {
    const rect = display.getBoundingClientRect();
    popup.style.top  = (rect.bottom + 4) + 'px';
    popup.style.left = rect.left + 'px';
    popup.classList.add('open');
    display.classList.add('active');
    setTimeout(() => document.addEventListener('click', aeOutsideClick), 0);
  }
}

// ── Outside click handler ──
function aeOutsideClick(e) {
  const containers = ['aeStartDatePicker','aeEndDatePicker','aeStartTimePicker','aeEndTimePicker','aeCalPicker'];
  const inside = containers.some(id => document.getElementById(id)?.contains(e.target));
  if (!inside) {
    aeCloseAllPopups();
    document.removeEventListener('click', aeOutsideClick);
  }
}

// ── Open Add Event modal ──
function openAddEvent() {
  const { user } = getCaldavCreds();
  if (!user) { openCaldavSettings(); return; }
  editingEvent = null;
  const now = new Date();
  aeState = {
    calUrl:  null,
    calName: null,
    startDate: null, startH: null, startM: null,
    endDate: null,   endH: null,   endM: null,
    calYear:  { start: now.getFullYear(), end: now.getFullYear() },
    calMonth: { start: now.getMonth(),    end: now.getMonth() },
  };
  document.getElementById('aeTitle').value    = '';
  document.getElementById('aeLocation').value = '';
  document.getElementById('aeStatus').textContent = '';
  document.getElementById('aeStatus').style.color = '';
  ['aeStartDateLabel','aeEndDateLabel'].forEach(id => {
    document.getElementById(id).textContent = 'No date';
    document.getElementById(id).classList.add('at-dp-placeholder');
  });
  ['aeStartTimeLabel','aeEndTimeLabel'].forEach(id => {
    document.getElementById(id).textContent = 'All day';
    document.getElementById(id).classList.add('at-dp-placeholder');
  });
  document.getElementById('aeSubmitBtn').disabled    = false;
  document.getElementById('aeSubmitBtn').textContent = 'Add Event';
  document.getElementById('aeSubmitBtn').onclick     = saveAddEvent;
  document.getElementById('aeDeleteBtn').style.display = 'none';
  document.getElementById('aeDeleteBtn').disabled = false;
  document.getElementById('aeModalTitle').textContent = 'New Event';
  document.getElementById('aeCalLabel').textContent = 'Select calendar…';
  document.getElementById('aeCalLabel').classList.add('at-dp-placeholder');
  if (!aeCalendars.length) aeFetchCalendars();
  aeCloseAllPopups();
  document.getElementById('addEventModal').classList.add('open');
}

// ── Build iCalendar string and PUT to CalDAV ──
async function saveAddEvent() {
  const title    = document.getElementById('aeTitle').value.trim();
  const location = document.getElementById('aeLocation').value.trim();
  const statusEl = document.getElementById('aeStatus');

  if (!title)             { statusEl.textContent = '⚠ Please enter a title.'; return; }
  if (!aeState.startDate) { statusEl.textContent = '⚠ Please select a start date.'; return; }
  if (!aeState.calUrl)    { statusEl.textContent = '⚠ Please select a calendar.'; return; }

  const endDate = aeState.endDate || aeState.startDate;
  const allDay  = aeState.startH === null;

  // Build DTSTART / DTEND
  const fmtDt = (dateStr, h, m) => {
    if (h === null) return dateStr.replace(/-/g, ''); // DATE only
    return `${dateStr.replace(/-/g,'')}T${String(h).padStart(2,'0')}${String(m).padStart(2,'0')}00`;
  };
  const dtstart = fmtDt(aeState.startDate, aeState.startH, aeState.startM);
  let   dtend   = fmtDt(endDate, aeState.endH ?? aeState.startH, aeState.endM ?? aeState.startM);
  // For all-day, DTEND must be next day (exclusive)
  if (allDay) {
    const d = new Date(endDate + 'T00:00:00');
    d.setDate(d.getDate() + 1);
    dtend = d.toISOString().slice(0,10).replace(/-/g,'');
  }

  const uid = `${Date.now()}-${Math.random().toString(36).slice(2)}@startpage`;
  const now  = new Date().toISOString().replace(/[-:]/g,'').slice(0,15) + 'Z';
  const dtProp = allDay ? 'VALUE=DATE:' : '';

  let ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'CALSCALE:GREGORIAN',
    'PRODID:-//Startpage//EN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${now}`,
    `DTSTART;${dtProp}${dtstart}`,
    `DTEND;${dtProp}${dtend}`,
    `SUMMARY:${title.replace(/\n/g,'\\n')}`,
  ];
  if (location) ics.push(`LOCATION:${location.replace(/\n/g,'\\n')}`);
  ics.push('END:VEVENT', 'END:VCALENDAR');
  const icsText = ics.join('\r\n');

  const eventUrl = aeState.calUrl + uid + '.ics';

  document.getElementById('aeSubmitBtn').disabled = true;
  document.getElementById('aeSubmitBtn').textContent = 'Saving…';
  statusEl.textContent = '';

  try {
    const { status, text } = await caldavRequest('PUT', eventUrl, icsText);
    if (status === 201 || status === 200 || status === 204) {
      statusEl.style.color = 'var(--accent)';
      statusEl.textContent = '✓ Event saved to ' + aeState.calName;
      document.getElementById('aeSubmitBtn').textContent = 'Done';
      // Reload ICS feeds after a short delay so the new event appears
      setTimeout(() => {
        loadAllIcs();
        closeModal('addEventModal');
        document.removeEventListener('click', aeOutsideClick);
      }, 900);
    } else {
      statusEl.style.color = '#c0392b';
      statusEl.textContent = `⚠ Server returned ${status}. Check credentials.`;
      document.getElementById('aeSubmitBtn').disabled = false;
      document.getElementById('aeSubmitBtn').textContent = 'Add Event';
    }
  } catch (e) {
    statusEl.style.color = '#c0392b';
    statusEl.textContent = '⚠ Network error: ' + e.message;
    document.getElementById('aeSubmitBtn').disabled = false;
    document.getElementById('aeSubmitBtn').textContent = 'Add Event';
  }
}

// Pre-fetch calendars if credentials already stored
(function() {
  const { user } = getCaldavCreds();
  if (user) aeFetchCalendars();
})();
function initCol3() {
  // Load from cache if available for current period
  const cachedKey  = KVStore.getItem(BRIEFING_DATE_KEY);
  const cachedText = KVStore.getItem(BRIEFING_KEY);
  const currentKey = getBriefingCacheKey();
  if(cachedKey === currentKey && cachedText) {
    renderBriefing(cachedText);
  }
}

// Also init col3 when calendar view loads
if(currentView === 'calendar') { setTimeout(initCol3, 100); }

// Lucide icons — init now and also on load in case script loads late

// ═══════════════════════════════════════════════════════════════════
// ── Re-init after KVStore loads remote data ──
// ═══════════════════════════════════════════════════════════════════
function reinitFromKV() {
  // Re-render everything with the remote data now in cache
  renderLinks();
  buildTabs();
  loadAllFeeds();
  updateModelUI();
  updateFilterBtn();
  todoistFilter = KVStore.getItem(TODOIST_FILTER_KEY) || 'today';
  // Restore active view
  const saved = KVStore.getItem('active_view');
  if (saved === 'calendar' && currentView !== 'calendar') {
    currentView = 'calendar';
    document.getElementById('mainGrid').style.display = 'none';
    document.getElementById('calGrid').style.display = 'grid';
    document.getElementById('btnViewHome').classList.remove('active');
    document.getElementById('btnViewCal').classList.add('active');
  } else if (saved !== 'calendar' && currentView === 'calendar') {
    currentView = 'home';
    document.getElementById('calGrid').style.display = 'none';
    document.getElementById('mainGrid').style.display = 'grid';
    document.getElementById('btnViewCal').classList.remove('active');
    document.getElementById('btnViewHome').classList.add('active');
  }
  if (currentView === 'calendar') {
    calInit();
    setTimeout(initCol3, 200);
  }
  // Re-fetch weather with potentially updated location
  loadWeather();
  // Re-fetch calendars if we now have CalDAV creds
  const { user } = getCaldavCreds();
  if (user) aeFetchCalendars();
  // Re-load todoist
  loadTodoist();
}
