// ===================================
// Landing Screen
// ===================================

document.getElementById('select-folder-btn').addEventListener('click', async () => {
  const btn = document.getElementById('select-folder-btn');
  btn.textContent = 'Selecting...';

  const result = await window.electronAPI.selectFolder();

  if (!result.paths) {
    btn.textContent = 'Select Instagram Data Folder(s)';
    return;
  }

  const errorEl = document.getElementById('error-message');
  errorEl.style.display = 'none';

  const pathLabel = result.paths.length === 1
    ? result.paths[0]
    : `${result.paths.length} folders selected`;
  document.getElementById('selected-path').textContent = pathLabel;
  document.getElementById('processing-status').style.display = 'block';
  btn.disabled = true;
  btn.textContent = 'Processing...';

  window.electronAPI.onProcessingProgress(({ step, total, message }) => {
    document.getElementById('progress-fill').style.width = `${(step / total) * 100}%`;
    document.getElementById('processing-message').textContent = message;
  });

  const processResult = await window.electronAPI.processData(result.paths);

  if (processResult.success) {
    try {
      BASE_URL = processResult.baseUrl;
      HTML_ONLY = processResult.htmlOnly || false;
      document.getElementById('landing-screen').style.display = 'none';
      document.getElementById('dashboard').style.display = 'block';
      await init();
    } catch (e) {
      console.error('Dashboard init failed:', e);
      document.getElementById('dashboard').style.display = 'none';
      document.getElementById('landing-screen').style.display = 'flex';
      errorEl.textContent = 'Failed to load dashboard: ' + e.message;
      errorEl.style.display = 'block';
      document.getElementById('processing-status').style.display = 'none';
      btn.disabled = false;
      btn.textContent = 'Select Instagram Data Folder(s)';
    }
    return;
  } else {
    errorEl.textContent = processResult.error;
    errorEl.style.display = 'block';
    document.getElementById('processing-status').style.display = 'none';
    btn.disabled = false;
    btn.textContent = 'Select Instagram Data Folder(s)';
  }
});

// ===================================
// Dashboard
// ===================================

const PAGE_SIZE = 50;
const RECENT_POSTS_COUNT = 10;
const RECENT_STORIES_COUNT = 12;
let BASE_URL = '';
let HTML_ONLY = false;
let PROFILE_USERNAME = '';
const cache = {};
let chartsRendered = false;
const lazyInits = {};

async function load(name) {
  if (cache[name]) return cache[name];
  const url = `${BASE_URL}/data/${name}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${name}: ${res.status} ${res.statusText}`);
  cache[name] = await res.json();
  return cache[name];
}

function fmtDate(ts) {
  if (!ts) return '';
  return new Date(ts * 1000).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function fmtNumber(n) {
  return (n || 0).toLocaleString();
}

function igProfileUrl(username) {
  return `https://www.instagram.com/${username}/`;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// --- Tab Switching ---
function setupTabs() {
  const tabs = document.querySelectorAll('.nav-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetId = tab.dataset.tab;
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      document.getElementById(`panel-${targetId}`).classList.add('active');
      if (lazyInits[targetId]) { lazyInits[targetId](); delete lazyInits[targetId]; }
      window.scrollTo(0, 0);
    });
  });
}

// --- Profile ---
function renderProfile(summary) {
  const p = summary.profile;
  PROFILE_USERNAME = p.username || '';
  const photo = document.getElementById('profile-photo');
  if (p.profilePhoto) photo.src = `${BASE_URL}/rawdata/${p.profilePhoto}`;
  photo.onerror = () => { photo.style.display = 'none'; };
  document.getElementById('profile-name').textContent = p.name || '';
  document.getElementById('profile-username').textContent = p.username ? `@${p.username}` : '';
  document.getElementById('profile-bio').textContent = p.bio || '';
  const web = document.getElementById('profile-website');
  web.href = p.website || '';
  web.textContent = (p.website || '').replace(/^https?:\/\//, '');
}

// --- Profile Photo Modal ---
async function setupProfilePhotoModal() {
  let photos;
  try { photos = await load('profile-photos.json'); } catch { photos = []; }
  const btn = document.getElementById('change-photo-btn');
  const modal = document.getElementById('photo-modal');
  const closeBtn = document.getElementById('photo-modal-close');
  const grid = document.getElementById('photo-modal-grid');

  if (photos.length === 0) { btn.style.display = 'none'; return; }

  grid.innerHTML = photos.map(p => `
    <div class="photo-option" data-uri="${p.uri}">
      <img src="${BASE_URL}/rawdata/${p.uri}" loading="lazy" onerror="this.parentElement.style.display='none'" alt="">
      <div class="photo-date">${fmtDate(p.ts)}</div>
    </div>
  `).join('');

  btn.addEventListener('click', () => { modal.style.display = 'flex'; });
  closeBtn.addEventListener('click', () => { modal.style.display = 'none'; });
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });

  grid.addEventListener('click', (e) => {
    const option = e.target.closest('.photo-option');
    if (!option) return;
    const uri = option.dataset.uri;
    document.getElementById('profile-photo').src = `${BASE_URL}/rawdata/${uri}`;
    modal.style.display = 'none';
  });
}

// --- Stats ---
function renderStats(stats) {
  const grid = document.getElementById('stats-grid');
  const cards = [
    { n: stats.likedPosts, l: 'Posts Liked' },
    { n: stats.likedComments, l: 'Comments Liked' },
    { n: stats.storyLikes, l: 'Stories Liked' },
    { n: stats.totalLikesGiven, l: 'Total Likes Given' },
    { n: stats.commentsMade, l: 'Comments Made' },
    { n: stats.postsMade, l: 'Posts Made' },
    { n: stats.archivedPosts || 0, l: 'Archived Posts' },
    { n: stats.stories || 0, l: 'Stories' },
    { n: stats.reposts || 0, l: 'Reposts' },
    { n: stats.savedPosts, l: 'Saved Posts' },
    { n: stats.followers, l: 'Followers' },
    { n: stats.following, l: 'Following' },
    { n: stats.closeFriends, l: 'Close Friends' },
    { n: stats.notFollowingBack, l: "Don't Follow Back" },
    { n: stats.youDontFollowBack, l: "You Don't Follow Back" },
    { n: stats.blocked, l: 'Blocked' },
    { n: stats.unfollowed, l: 'Unfollowed' },
  ];
  grid.innerHTML = cards.map(c => `
    <div class="stat-card">
      <span class="number">${fmtNumber(c.n)}</span>
      <span class="label">${c.l}</span>
    </div>
  `).join('');
}

function renderFirsts(firsts) {
  const row = document.getElementById('firsts-row');
  const items = [
    { ts: firsts.firstPost, l: 'First Post' },
    { ts: firsts.firstLikedPost, l: 'First Like' },
    { ts: firsts.firstComment, l: 'First Comment' },
    { ts: firsts.firstFollower, l: 'First Follower' },
    { ts: firsts.firstFollowing, l: 'First Following' },
  ];
  row.innerHTML = items.filter(i => i.ts).map(i => `
    <div class="first-badge">
      <strong>${i.l}</strong>
      ${fmtDate(i.ts)}
    </div>
  `).join('');
}

// --- Charts (now inline in overview) ---
function createChart(canvasId, data, label, color) {
  const ctx = document.getElementById(canvasId);
  if (!ctx || !data || !data.length) return;
  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: data.map(d => d.month),
      datasets: [{ label, data: data.map(d => d.count), backgroundColor: color + '88', borderColor: color, borderWidth: 1, borderRadius: 3 }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { title: (i) => i[0].label, label: (i) => `${fmtNumber(i.raw)} ${label.toLowerCase()}` } } },
      scales: {
        x: { ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 15, font: { size: 10 } }, grid: { display: false } },
        y: { beginAtZero: true, ticks: { font: { size: 10 } }, grid: { color: '#f0f0f0' } },
      },
    },
  });
}

async function renderCharts() {
  if (chartsRendered) return;
  chartsRendered = true;
  const t = await load('timelines.json');
  createChart('chart-liked-posts', t.likedPosts, 'Likes', '#fd1d1d');
  createChart('chart-comments', t.comments, 'Comments', '#833ab4');
  createChart('chart-posts', t.posts, 'Posts', '#0095f6');
  createChart('chart-stories', t.stories, 'Stories', '#e1306c');
  createChart('chart-followers', t.followers, 'Followers', '#00c853');
  createChart('chart-following', t.following, 'Following', '#f56040');
  createChart('chart-saved', t.savedPosts, 'Saved', '#fcaf45');
}

// --- Paginated Lists ---
function createPaginatedList({ containerId, loadMoreId, searchId, dataFile, renderItem, searchFn }) {
  let allData = null;
  let filtered = null;
  let shown = 0;
  const container = document.getElementById(containerId);
  const loadMore = document.getElementById(loadMoreId);
  const search = searchId ? document.getElementById(searchId) : null;

  async function loadData(data) {
    allData = data || await load(dataFile);
    filtered = allData;
    shown = 0;
    render();
  }

  function render() {
    const batch = filtered.slice(shown, shown + PAGE_SIZE);
    if (shown === 0) container.innerHTML = '';
    for (const item of batch) container.insertAdjacentHTML('beforeend', renderItem(item));
    shown += batch.length;
    loadMore.style.display = shown < filtered.length ? 'block' : 'none';
  }

  if (loadMore) loadMore.addEventListener('click', render);
  if (search) {
    let timeout;
    search.addEventListener('input', () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        const q = search.value.toLowerCase().trim();
        filtered = q ? allData.filter(item => searchFn(item, q)) : allData;
        shown = 0;
        render();
      }, 200);
    });
  }
  return { loadData };
}

// --- Connections ---
function setupConnections(summary) {
  document.getElementById('count-followers').textContent = `(${fmtNumber(summary.stats.followers)})`;
  document.getElementById('count-following').textContent = `(${fmtNumber(summary.stats.following)})`;
  document.getElementById('count-nfb').textContent = `(${fmtNumber(summary.stats.notFollowingBack)})`;
  document.getElementById('count-ydfb').textContent = `(${fmtNumber(summary.stats.youDontFollowBack)})`;
  document.getElementById('count-cf').textContent = `(${fmtNumber(summary.stats.closeFriends)})`;
  document.getElementById('count-blocked').textContent = `(${fmtNumber(summary.stats.blocked)})`;
  document.getElementById('count-unfollowed').textContent = `(${fmtNumber(summary.stats.unfollowed)})`;

  const list = createPaginatedList({
    containerId: 'connections-list',
    loadMoreId: 'connections-load-more',
    searchId: 'connections-search',
    renderItem: (item) => `
      <div class="item-row">
        <a class="username" href="${igProfileUrl(item.username)}" target="_blank" rel="noopener">@${item.username}</a>
        <span class="date">${fmtDate(item.ts)}</span>
      </div>
    `,
    searchFn: (item, q) => (item.username || '').toLowerCase().includes(q),
  });

  const loadFile = async (name) => {
    const data = await load(`${name}.json`);
    list.loadData(data);
  };
  loadFile('followers');

  document.querySelectorAll('#panel-connections .sub-tab-bar .sub-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('#panel-connections .sub-tab-bar .sub-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      loadFile(tab.dataset.list);
      document.getElementById('connections-search').value = '';
    });
  });
}

// --- Comments ---
function setupComments() {
  createPaginatedList({
    containerId: 'comments-list',
    loadMoreId: 'comments-load-more',
    searchId: 'comments-search',
    dataFile: 'comments.json',
    renderItem: (item) => `
      <div class="item-row" style="flex-direction:column;gap:4px">
        <div style="display:flex;gap:8px;align-items:center;width:100%">
          <a class="username" href="${igProfileUrl(item.mediaOwner)}" target="_blank" rel="noopener">@${item.mediaOwner}</a>
          <span class="type-badge">${item.type}</span>
          <span class="date">${fmtDate(item.ts)}</span>
        </div>
        <div class="comment-text">${escapeHtml(item.comment)}</div>
      </div>
    `,
    searchFn: (item, q) => item.comment.toLowerCase().includes(q) || item.mediaOwner.toLowerCase().includes(q),
  }).loadData();
}

// --- Liked Posts ---
function setupLikedPosts() {
  createPaginatedList({
    containerId: 'likes-list',
    loadMoreId: 'likes-load-more',
    searchId: 'likes-search',
    dataFile: 'liked-posts.json',
    renderItem: (item) => `
      <div class="item-row">
        <a class="username" href="${igProfileUrl(item.ownerUsername || '')}" target="_blank" rel="noopener">@${item.ownerUsername || 'unknown'}</a>
        ${item.ownerName ? `<span class="meta">${escapeHtml(item.ownerName)}</span>` : ''}
        ${item.url ? `<a class="link-icon" href="${item.url}" target="_blank" rel="noopener">view post</a>` : ''}
        <span class="date">${fmtDate(item.ts)}</span>
      </div>
    `,
    searchFn: (item, q) => (item.ownerUsername || '').toLowerCase().includes(q) || (item.ownerName || '').toLowerCase().includes(q),
  }).loadData();
}

// --- Saved Posts ---
function setupSavedPosts() {
  createPaginatedList({
    containerId: 'saved-list',
    loadMoreId: 'saved-load-more',
    searchId: 'saved-search',
    dataFile: 'saved-posts.json',
    renderItem: (item) => `
      <div class="item-row">
        <a class="username" href="${igProfileUrl(item.owner)}" target="_blank" rel="noopener">@${item.owner}</a>
        ${item.url ? `<a class="link-icon" href="${item.url}" target="_blank" rel="noopener">view post</a>` : ''}
        <span class="date">${fmtDate(item.ts)}</span>
      </div>
    `,
    searchFn: (item, q) => item.owner.toLowerCase().includes(q),
  }).loadData();
}

// --- Post table row helper ---
function postSearchUrl(p) {
  // Instagram doesn't include post URLs in the export.
  // Build a Google search that finds the post on Instagram.
  if (!p.title || !PROFILE_USERNAME) return '';
  try {
    // Use first ~60 chars, strip emojis/special chars that break encoding
    const caption = p.title.slice(0, 60).replace(/[\uD800-\uDFFF]/g, '').trim();
    if (caption.length < 3) return '';
    return `https://www.google.com/search?q=site:instagram.com+${encodeURIComponent(PROFILE_USERNAME)}+${encodeURIComponent('"' + caption + '"')}`;
  } catch {
    return '';
  }
}

function postTableRow(p) {
  const camera = p.exif?.camera || '';
  const cameraShort = camera.replace(/^iPhone \d+ Pro back triple camera /, '').replace(/^iPhone /, 'iPhone ');
  const searchUrl = postSearchUrl(p);
  const allMedia = p.allMedia || (p.uri ? [{ uri: p.uri }] : []);
  const mediaLinks = allMedia.length <= 1
    ? (p.uri ? `<a href="${BASE_URL}/rawdata/${p.uri}" target="_blank">media</a>` : '')
    : allMedia.map((m, i) => `<a href="${BASE_URL}/rawdata/${m.uri}" target="_blank">${i + 1}</a>`).join(' ');
  return `
    <tr>
      <td class="date-cell">${fmtDate(p.ts)}</td>
      <td class="caption-cell" title="${escapeHtml(p.title || '')}">${escapeHtml(p.title || '(no caption)')}</td>
      <td class="meta-cell">${p.mediaCount > 1 ? p.mediaCount : '1'}</td>
      <td class="meta-cell" title="${escapeHtml(camera)}">${escapeHtml(cameraShort) || ''}</td>
      <td>
        ${mediaLinks}${mediaLinks && searchUrl ? ' &middot; ' : ''}${searchUrl ? `<a href="${searchUrl}" target="_blank" rel="noopener">find on IG</a>` : ''}
      </td>
    </tr>
  `;
}

// --- My Posts ---
async function renderPosts() {
  const posts = await load('posts.json');
  const recent = posts.slice(0, RECENT_POSTS_COUNT);
  const older = posts.slice(RECENT_POSTS_COUNT);

  const grid = document.getElementById('posts-grid');
  grid.innerHTML = recent.map(p => {
    const exifLine = p.exif ? `<div class="post-exif">${escapeHtml(p.exif.camera || '')}${p.exif.iso ? ` &middot; ISO ${p.exif.iso}` : ''}${p.mediaCount > 1 ? ` &middot; ${p.mediaCount} items` : ''}</div>` : '';
    const searchUrl = postSearchUrl(p);
    const isVideo = /\.(mp4|mov)$/i.test(p.uri || '');
    let mediaHtml = '';
    if (p.uri) {
      if (isVideo) {
        mediaHtml = `<video src="${BASE_URL}/rawdata/${p.uri}" controls preload="metadata" style="width:100%;border-radius:8px;margin-bottom:8px" onerror="this.style.display='none'"></video>`;
      } else {
        mediaHtml = `<img src="${BASE_URL}/rawdata/${p.uri}" loading="lazy" onerror="this.style.display='none'" alt="">`;
      }
    }
    return `
      <div class="post-card">
        ${mediaHtml}
        <div class="post-title">${escapeHtml(p.title || '(no caption)')}</div>
        <div class="post-date">${fmtDate(p.ts)}${searchUrl ? ` &middot; <a href="${searchUrl}" target="_blank" rel="noopener" class="link-icon">find on IG</a>` : ''}</div>
        ${exifLine}
      </div>
    `;
  }).join('');

  if (older.length > 0) {
    document.getElementById('older-posts-title').style.display = '';
    document.getElementById('posts-table-wrap').style.display = '';
    const tbody = document.getElementById('posts-table-body');
    function renderTable(data) { tbody.innerHTML = data.map(postTableRow).join(''); }
    renderTable(older);
    const search = document.getElementById('posts-search');
    let timeout;
    search.addEventListener('input', () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        const q = search.value.toLowerCase().trim();
        renderTable(q ? older.filter(p => (p.title || '').toLowerCase().includes(q)) : older);
      }, 200);
    });
  }

  // Archived posts
  try {
    const archived = await load('archived-posts.json');
    if (archived.length > 0) {
      document.getElementById('archived-posts-title').style.display = '';
      document.getElementById('archived-table-wrap').style.display = '';
      document.getElementById('archived-table-body').innerHTML = archived.map(postTableRow).join('');
    }
  } catch (e) { console.warn('Could not load archived posts:', e); }

  // Reposts
  try {
    const reposts = await load('reposts.json');
    document.getElementById('reposts-title').style.display = '';
    const repostsList = document.getElementById('reposts-list');
    repostsList.style.display = '';
    if (reposts.length > 0) {
      repostsList.innerHTML = reposts.map(r => `
        <div class="item-row">
          ${r.ownerUsername ? `<a class="username" href="${igProfileUrl(r.ownerUsername)}" target="_blank" rel="noopener">@${r.ownerUsername}</a>` : ''}
          ${r.ownerName && r.ownerName !== r.ownerUsername ? `<span class="meta">${escapeHtml(r.ownerName)}</span>` : ''}
          ${r.url ? `<a class="link-icon" href="${r.url}" target="_blank" rel="noopener">view post</a>` : ''}
          <span class="date">${fmtDate(r.ts)}</span>
        </div>
      `).join('');
    } else {
      repostsList.innerHTML = '<p class="empty-notice">The data has no repost information.</p>';
    }
  } catch (e) { console.warn('Could not load reposts:', e); }
}

// --- Stories ---
async function setupStories() {
  const stories = await load('stories.json');
  const interactions = await load('story-interactions.json');

  // Stats
  const statsGrid = document.getElementById('stories-stats-grid');
  statsGrid.innerHTML = [
    { n: stories.length, l: 'Total Stories' },
    { n: interactions.total, l: 'Interactions' },
    { n: interactions.polls, l: 'Polls Answered' },
    { n: interactions.emoji, l: 'Emoji Sliders' },
    { n: interactions.quizzes, l: 'Quizzes' },
    { n: interactions.questions, l: 'Questions' },
  ].map(c => `<div class="stat-card"><span class="number">${fmtNumber(c.n)}</span><span class="label">${c.l}</span></div>`).join('');

  // Recent stories as visual cards
  const recent = stories.slice(0, RECENT_STORIES_COUNT);
  const older = stories.slice(RECENT_STORIES_COUNT);
  const grid = document.getElementById('stories-grid');
  grid.innerHTML = recent.map(s => `
    <div class="post-card">
      ${s.uri ? (s.isVideo
        ? `<video src="${BASE_URL}/rawdata/${s.uri}" controls preload="metadata" style="width:100%;border-radius:8px;margin-bottom:8px" onerror="this.style.display='none'"></video>`
        : `<img src="${BASE_URL}/rawdata/${s.uri}" loading="lazy" onerror="this.style.display='none'" alt="">`)
        : ''}
      <div class="post-title">${escapeHtml(s.title || '(no caption)')}</div>
      <div class="post-date">${fmtDate(s.ts)}</div>
    </div>
  `).join('');

  // Older stories table
  if (older.length > 0) {
    document.getElementById('older-stories-title').style.display = '';
    document.getElementById('stories-table-wrap').style.display = '';
    document.getElementById('stories-table-body').innerHTML = older.map(s => `
      <tr>
        <td class="date-cell">${fmtDate(s.ts)}</td>
        <td class="caption-cell">${escapeHtml(s.title || '(no caption)')}</td>
        <td class="meta-cell">${s.isVideo ? 'Video' : 'Photo'}</td>
        <td>${s.uri ? `<a href="${BASE_URL}/rawdata/${s.uri}" target="_blank">view</a>` : ''}</td>
      </tr>
    `).join('');
  }

  // Story interactions with filter
  let allInteractions = interactions.items;
  let filtered = allInteractions;
  let shown = 0;
  const container = document.getElementById('story-interactions-list');
  const loadMore = document.getElementById('story-interactions-load-more');

  function renderInteractions() {
    const batch = filtered.slice(shown, shown + PAGE_SIZE);
    if (shown === 0) container.innerHTML = '';
    for (const i of batch) {
      container.insertAdjacentHTML('beforeend', `
        <div class="item-row">
          <a class="username" href="${igProfileUrl(i.username)}" target="_blank" rel="noopener">@${i.username}</a>
          <span class="type-badge">${i.type}</span>
          ${i.value ? `<span class="meta">${escapeHtml(i.value)}</span>` : ''}
          <span class="date">${fmtDate(i.ts)}</span>
        </div>
      `);
    }
    shown += batch.length;
    loadMore.style.display = shown < filtered.length ? 'block' : 'none';
  }

  renderInteractions();
  loadMore.addEventListener('click', renderInteractions);

  document.querySelectorAll('#story-interaction-filters .sub-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('#story-interaction-filters .sub-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const stype = tab.dataset.stype;
      filtered = stype === 'all' ? allInteractions : allInteractions.filter(i => i.type === stype);
      shown = 0;
      renderInteractions();
    });
  });
}

// --- Ads & Tracking ---
async function setupAds() {
  const ads = await load('ads.json');
  const s = ads.stats;

  document.getElementById('ads-stats-grid').innerHTML = [
    { n: s.totalAdvertisers, l: 'Total Advertisers' },
    { n: s.withDataFile, l: 'Have Your Data File' },
    { n: s.withRemarketing, l: 'Remarketing You' },
    { n: s.withBoth, l: 'Both Data + Remarketing' },
    { n: s.adCategories, l: 'Targeting Categories' },
    { n: s.offMetaApps, l: 'Off-Meta Apps Tracking' },
  ].map(c => `<div class="stat-card"><span class="number">${fmtNumber(c.n)}</span><span class="label">${c.l}</span></div>`).join('');

  document.getElementById('ads-categories').innerHTML = ads.categories.map(c => `<span class="tag">${escapeHtml(c)}</span>`).join('');

  document.getElementById('off-meta-list').innerHTML = ads.offMeta.map(o => {
    const typesBadges = Object.entries(o.eventTypes).map(([t, count]) => `<span class="event-type">${t} (${count})</span>`).join('');
    return `
      <div class="item-row" style="flex-direction:column;gap:4px">
        <div style="display:flex;gap:8px;align-items:center;width:100%">
          <span class="username">${escapeHtml(o.name)}</span>
          <span class="meta">${o.eventCount} events</span>
          <span class="date">${fmtDate(o.lastEvent)}</span>
        </div>
        <div class="event-types">${typesBadges}</div>
      </div>
    `;
  }).join('');

  let allAdvertisers = ads.advertisers;
  let filtered = allAdvertisers;
  let shown = 0;
  const container = document.getElementById('advertisers-list');
  const loadMore = document.getElementById('advertisers-load-more');
  const search = document.getElementById('advertisers-search');

  function renderAdvertisers() {
    const batch = filtered.slice(shown, shown + PAGE_SIZE);
    if (shown === 0) container.innerHTML = '';
    for (const a of batch) {
      const badges = a.types.map(t => {
        const cls = t === 'data file' ? 'data-file' : t === 'remarketing' ? 'remarketing' : 'in-store';
        return `<span class="adv-type ${cls}">${t}</span>`;
      }).join(' ');
      container.insertAdjacentHTML('beforeend', `
        <div class="item-row">
          <span class="username">${escapeHtml(a.name)}</span>
          <div style="display:flex;gap:4px;margin-left:auto">${badges}</div>
        </div>
      `);
    }
    shown += batch.length;
    loadMore.style.display = shown < filtered.length ? 'block' : 'none';
  }

  renderAdvertisers();
  loadMore.addEventListener('click', renderAdvertisers);

  function applyFilters() {
    const q = search.value.toLowerCase().trim();
    const activeFilter = document.querySelector('#advertiser-filters .sub-tab.active').dataset.filter;
    filtered = allAdvertisers.filter(a => {
      const matchesSearch = !q || a.name.toLowerCase().includes(q);
      let matchesFilter = true;
      if (activeFilter === 'data file') matchesFilter = a.types.includes('data file');
      else if (activeFilter === 'remarketing') matchesFilter = a.types.includes('remarketing');
      else if (activeFilter === 'both') matchesFilter = a.types.includes('data file') && a.types.includes('remarketing');
      return matchesSearch && matchesFilter;
    });
    shown = 0;
    renderAdvertisers();
  }

  let timeout;
  search.addEventListener('input', () => { clearTimeout(timeout); timeout = setTimeout(applyFilters, 200); });
  document.querySelectorAll('#advertiser-filters .sub-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('#advertiser-filters .sub-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      applyFilters();
    });
  });
}

// --- Init ---
async function init() {
  const summary = await load('summary.json');
  renderProfile(summary);
  renderStats(summary.stats);
  renderFirsts(summary.firsts);
  renderCharts();
  await setupProfilePhotoModal();

  setupTabs();
  setupConnections(summary);

  if (HTML_ONLY) {
    // Show warning banner
    document.getElementById('html-only-banner').style.display = 'block';
    // Hide tabs that don't work well with HTML exports
    const htmlDisabledTabs = ['posts', 'stories', 'comments', 'liked-posts', 'saved', 'ads'];
    document.querySelectorAll('.nav-tab').forEach(tab => {
      if (htmlDisabledTabs.includes(tab.dataset.tab)) {
        tab.style.display = 'none';
      }
    });
  } else {
    lazyInits['comments'] = setupComments;
    lazyInits['liked-posts'] = setupLikedPosts;
    lazyInits['saved'] = setupSavedPosts;
    lazyInits['posts'] = renderPosts;
    lazyInits['stories'] = setupStories;
    lazyInits['ads'] = setupAds;
  }
}
