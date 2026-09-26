/* DOGFOOD Tier 1 SPA — no build step, no external deps, works offline. */
'use strict';

const App = {
  user: null,
  booted: false,
};

/* ---------------- api client ---------------- */
function getToken() {
  try { return localStorage.getItem('dogfood_token') || ''; } catch (e) { return ''; }
}
function setToken(t) {
  try {
    if (t) localStorage.setItem('dogfood_token', t);
    else localStorage.removeItem('dogfood_token');
  } catch (e) { /* ignore */ }
}

async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const tok = getToken();
  if (tok) headers.Authorization = 'Bearer ' + tok;
  let res;
  try {
    res = await fetch('/api' + path, {
      method: opts.method || 'GET',
      headers,
      credentials: 'include',
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch (e) {
    return { ok: false, status: 0, data: { error: 'Cannot reach the server. Is it running?' } };
  }
  let data = {};
  try { data = await res.json(); } catch (e) { data = {}; }
  return { ok: res.ok, status: res.status, data };
}

async function refreshMe() {
  const r = await api('/auth/me');
  App.user = r.ok ? r.data.user : null;
  return App.user;
}

/* ---------------- utils ---------------- */
function esc(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function fmtDate(v) {
  if (!v) return '—';
  const d = new Date(v);
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}
function fmtDay(v) {
  if (!v) return '—';
  return new Date(v).toLocaleDateString(undefined, { dateStyle: 'medium' });
}
function initials(name) {
  return String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}
function toast(msg, kind = 'info', ms = 4200) {
  const box = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.textContent = msg;
  box.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 320); }, ms);
}
function confirmDialog({ title, body, confirmLabel = 'Confirm', danger = false }) {
  return new Promise((resolve) => {
    const root = document.getElementById('modal-root');
    root.innerHTML =
      '<div class="modal-backdrop"><div class="modal" role="dialog" aria-modal="true">' +
      '<h3>' + esc(title) + '</h3><p style="color:var(--muted)">' + esc(body) + '</p>' +
      '<div class="modal-actions"><button class="btn btn-secondary" id="m-cancel">Cancel</button>' +
      '<button class="btn ' + (danger ? 'btn-danger' : 'btn-primary') + '" id="m-ok">' + esc(confirmLabel) + '</button></div></div></div>';
    const done = (v) => { root.innerHTML = ''; resolve(v); };
    document.getElementById('m-cancel').onclick = () => done(false);
    document.getElementById('m-ok').onclick = () => done(true);
    root.querySelector('.modal-backdrop').addEventListener('click', (e) => {
      if (e.target.classList.contains('modal-backdrop')) done(false);
    });
  });
}
function badge(status) {
  const s = String(status || '').toLowerCase();
  const cls = ['draft', 'published', 'submitted', 'locked', 'archived', 'pending'].includes(s) ? s : '';
  return '<span class="badge ' + cls + '"><span class="dot"></span>' + esc(status || '') + '</span>';
}
function skeletonCards(n = 3) {
  let h = '<div class="grid cols-3">';
  for (let i = 0; i < n; i++) h += '<div class="card"><div class="skel" style="height:18px;width:60%"></div><div class="skel" style="height:12px;margin-top:10px"></div><div class="skel" style="height:12px;width:80%;margin-top:6px"></div></div>';
  return h + '</div>';
}
function emptyState(icon, title, body, actionHtml = '') {
  return '<div class="card"><div class="empty"><div class="big">' + icon + '</div><h3>' + esc(title) + '</h3><p>' + esc(body) + '</p><div style="margin-top:14px">' + actionHtml + '</div></div></div>';
}
function pagerHtml(page, totalPages) {
  if (!totalPages || totalPages <= 1) return '';
  return '<div class="pager"><button class="btn btn-secondary btn-sm" data-page="' + (page - 1) + '" ' + (page <= 1 ? 'disabled' : '') + '>← Prev</button>' +
    '<span>Page ' + page + ' of ' + totalPages + '</span>' +
    '<button class="btn btn-secondary btn-sm" data-page="' + (page + 1) + '" ' + (page >= totalPages ? 'disabled' : '') + '>Next →</button></div>';
}
function bindPager(container, onPage) {
  container.querySelectorAll('[data-page]').forEach((b) => {
    b.onclick = () => onPage(parseInt(b.dataset.page, 10));
  });
}
function countdownParts(target) {
  const diff = new Date(target).getTime() - Date.now();
  const over = diff <= 0;
  const a = Math.abs(diff);
  return {
    over,
    d: Math.floor(a / 86400000),
    h: Math.floor(a / 3600000) % 24,
    m: Math.floor(a / 60000) % 60,
    s: Math.floor(a / 1000) % 60,
  };
}
function countdownHtml(deadline, label = 'Submissions close in') {
  const c = countdownParts(deadline);
  if (c.over) return '<div class="countdown over"><div class="cell"><b>Closed</b><span>deadline passed</span></div></div>';
  return '<div style="font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">' + esc(label) + '</div>' +
    '<div class="countdown" data-countdown="' + esc(deadline) + '">' +
    '<div class="cell"><b data-cd="d">' + c.d + '</b><span>days</span></div>' +
    '<div class="cell"><b data-cd="h">' + c.h + '</b><span>hrs</span></div>' +
    '<div class="cell"><b data-cd="m">' + c.m + '</b><span>min</span></div>' +
    '<div class="cell"><b data-cd="s">' + c.s + '</b><span>sec</span></div></div>';
}
setInterval(() => {
  document.querySelectorAll('[data-countdown]').forEach((el) => {
    const c = countdownParts(el.dataset.countdown);
    if (c.over) { el.outerHTML = '<div class="countdown over"><div class="cell"><b>Closed</b><span>deadline passed</span></div></div>'; return; }
    const q = (k) => el.querySelector('[data-cd="' + k + '"]');
    if (q('d')) q('d').textContent = c.d;
    if (q('h')) q('h').textContent = c.h;
    if (q('m')) q('m').textContent = c.m;
    if (q('s')) q('s').textContent = c.s;
  });
}, 1000);

/* ---------------- navigation ---------------- */
function navFor(role) {
  if (!App.user) {
    return [
      { h: 'Public', links: [['Home', '#/'], ['Events', '#/events'], ['Gallery', '#/gallery'], ['Voting', '#/voting']] },
    ];
  }
  if (role === 'admin') {
    return [
      { h: 'Admin', links: [['Dashboard', '#/admin'], ['Users', '#/admin/users'], ['Events', '#/admin/events'], ['System', '#/admin/system']] },
      { h: 'Browse', links: [['All events', '#/events'], ['Gallery', '#/gallery']] },
    ];
  }
  if (role === 'organizer') {
    return [
      { h: 'Organize', links: [['Dashboard', '#/organizer'], ['Events', '#/organizer/events'], ['Teams', '#/organizer/teams'], ['Projects', '#/organizer/projects'], ['Submissions', '#/organizer/submissions'], ['Settings', '#/organizer/settings']] },
      { h: 'Judging', links: [['Judges', '#/organizer/judging/judges'], ['Assignments', '#/organizer/judging/assignments'], ['Rubric', '#/organizer/judging/rubric'], ['Progress', '#/organizer/judging/progress'], ['Calibration', '#/organizer/judging/calibration'], ['Comparison', '#/organizer/judging/comparison'], ['Results', '#/organizer/judging/results']] },
      { h: 'Community', links: [['Voting rounds', '#/organizer/voting']] },
      { h: 'Participate', links: [['All events', '#/events'], ['Gallery', '#/gallery'], ['Voting', '#/voting']] },
    ];
  }
  if (role === 'judge') {
    return [
      { h: 'Judge', links: [['Dashboard', '#/judging'], ['Events', '#/events'], ['Gallery', '#/gallery'], ['Voting', '#/voting']] },
    ];
  }
  return [
    { h: 'Workspace', links: [['Dashboard', '#/dashboard'], ['Events', '#/events'], ['Teams', '#/teams'], ['Projects', '#/projects'], ['Submissions', '#/submissions'], ['Profile', '#/profile']] },
    { h: 'Discover', links: [['Gallery', '#/gallery'], ['Voting', '#/voting']] },
  ];
}
function isActiveLink(href, hash) {
  if (href === '#/') return hash === '#/';
  return hash === href || hash.startsWith(href + '/') || hash.startsWith(href + '?');
}
function crumbs(items) {
  return '<nav class="crumbs" aria-label="Breadcrumb">' + items.map(([label, href], i) => {
    const last = i === items.length - 1;
    return (i > 0 ? '<span class="crumb-sep">›</span>' : '') +
      (last || !href ? '<span class="crumb-cur">' + esc(label) + '</span>' : '<a href="' + href + '">' + esc(label) + '</a>');
  }).join('') + '</nav>';
}
const ICONS = { Dashboard: '◉', Events: '📅', 'All events': '📅', Teams: '👥', Projects: '🛠', Submissions: '📦', Settings: '⚙', Gallery: '🖼', Home: '⌂', Users: '👤', System: '⚙', Profile: '👤', Judges: '⚖', Assignments: '🗂', Rubric: '📏', Progress: '📊', Calibration: '🎯', Comparison: '🔍', Results: '🏆', Browse: '', Workspace: '', Discover: '', Organize: '', Judging: '', Participate: '', Admin: '', Judge: '⚖', Voting: '🗳', 'Voting rounds': '🗳', Community: '', 'All events': '📅' };

function shell(content, opts = {}) {
  const u = App.user;
  const groups = navFor(u ? u.role : null);
  const hash = location.hash || '#/';
  const side = groups.map((g) =>
    '<div class="side-label">' + esc(g.h) + '</div>' +
    g.links.map(([label, href]) => {
      const active = isActiveLink(href, hash) ? ' active' : '';
      return '<a class="side-link' + active + '" href="' + href + '"><span class="ico">' + (ICONS[label] || '•') + '</span>' + esc(label) + '</a>';
    }).join('')
  ).join('');

  const publicLinks = [['Events', '#/events'], ['Gallery', '#/gallery']];
  const topLinks = u ? [] : publicLinks.map(([l, h]) =>
    '<a href="' + h + '" class="' + (hash.startsWith(h) ? 'active' : '') + '">' + l + '</a>').join('');

  const right = u
    ? '<div class="user-chip"><span class="avatar">' + esc(initials(u.name)) + '</span><span><b>' + esc(u.name) + '</b><br><span class="role-badge">' + esc(u.role) + '</span></span></div>' +
      '<a class="btn btn-ghost btn-sm" href="#/profile">Profile</a>' +
      '<button class="btn btn-secondary btn-sm" id="btn-logout">Logout</button>'
    : '<a class="btn btn-ghost btn-sm" href="#/login">Log in</a><a class="btn btn-primary btn-sm" href="#/register">Get started</a>';

  const mobile = groups.flatMap((g) => g.links).map(([label, href]) =>
    '<a href="' + href + '" class="' + (isActiveLink(href, hash) ? 'active' : '') + '">' + esc(label) + '</a>').join('');

  return '<div class="shell"><header class="topbar"><a class="brand" href="#/"><span class="brand-mark">D</span><span>DOGFOOD<br><small>hackathon platform</small></span></a>' +
    '<nav class="nav-links">' + topLinks + '</nav><div class="topbar-right">' + right + '</div></header>' +
    '<nav class="mobile-nav">' + mobile + '</nav>' +
    '<div class="app-body">' + (u ? '<aside class="sidebar">' + side + '<div class="side-foot"><div class="card" style="padding:12px;font-size:12.5px"><b>Tier 3 live.</b><br><span style="color:var(--muted)">Judging + Community Voting active.</span></div></div></aside>' : '') +
    '<main class="main" id="main"><div class="container' + (opts.narrow ? ' narrow' : '') + '">' + content + '</div></main></div>' +
    '<footer class="footer">DOGFOOD · open-source hackathon platform · MIT · runs fully offline via <code class="inline">docker compose up</code></footer></div>';
}

function render(html, opts) {
  document.getElementById('app').innerHTML = shell(html, opts);
  const lo = document.getElementById('btn-logout');
  if (lo) lo.onclick = async () => {
    await api('/auth/logout', { method: 'POST' });
    setToken('');
    App.user = null;
    toast('Logged out.', 'info');
    location.hash = '#/';
  };
}
function renderLoading(msg = 'Loading…') {
  render('<div class="loading-row"><span class="spinner dark"></span> ' + esc(msg) + '</div>' + skeletonCards(3));
}

/* ---------------- public views ---------------- */
async function viewHome() {
  renderLoading('Loading events…');
  const [ev, gal] = await Promise.all([api('/events?limit=3'), api('/gallery?limit=3')]);
  const events = ev.ok ? ev.data.data : [];
  const projects = gal.ok ? gal.data.data : [];
  render(
    '<section class="hero"><h1>Eat your own DOGFOOD.<br>Ship your hackathon.</h1>' +
    '<p>Registration, teams, projects, submissions and a public gallery — self-hosted, offline-first, and open source. No cloud accounts. No lock-in.</p>' +
    '<div class="cta-row">' +
    (App.user
      ? '<a class="btn btn-light" href="#/dashboard">Open my dashboard →</a><a class="btn btn-light" href="#/events">Browse events</a>'
      : '<a class="btn btn-light" href="#/register">Start hacking — it’s free →</a><a class="btn btn-light" href="#/events">Browse events</a>') +
    '</div><div class="hero-stats"><div><b>100%</b><span>self-hostable</span></div><div><b>0</b><span>cloud accounts needed</span></div><div><b>MIT</b><span>open-source licensed</span></div></div></section>' +
    '<div style="height:22px"></div>' +
    '<div class="page-head"><div><h1 style="font-size:20px">Upcoming events</h1></div><div class="page-actions"><a class="btn btn-secondary btn-sm" href="#/events">All events →</a></div></div>' +
    (events.length ? '<div class="grid cols-3">' + events.map(eventCard).join('') + '</div>' : emptyState('📅', 'No published events yet', 'Check back soon — organizers are cooking something up.')) +
    '<div style="height:22px"></div>' +
    '<div class="page-head"><div><h1 style="font-size:20px">Fresh from the gallery</h1></div><div class="page-actions"><a class="btn btn-secondary btn-sm" href="#/gallery">Open gallery →</a></div></div>' +
    (projects.length ? '<div class="grid cols-3">' + projects.map(projectCard).join('') + '</div>' : emptyState('🖼', 'No submissions yet', 'Be the first team to ship.')) +
    '<div style="height:22px"></div>' +
    '<div class="card"><h3>How it works</h3><div class="grid cols-4" style="margin-top:12px">' +
    [['① Register', 'Create a free local account in seconds.'], ['② Team up', 'Create a team and share an invite link.'], ['③ Build & draft', 'Save your project as a draft, iterate.'], ['④ Submit', 'Hit submit before the deadline. Deadlines are enforced server-side.']].map(([t, d]) =>
      '<div><b>' + t + '</b><p class="meta" style="margin:4px 0 0">' + d + '</p></div>').join('') + '</div></div>'
  );
}

function eventCard(e) {
  return '<div class="card hover"><div style="display:flex;gap:8px;align-items:center;margin-bottom:8px">' + badge(e.status) +
    '<span class="meta">👥 ' + (e.team_count || 0) + ' teams · 📦 ' + (e.submitted_count || 0) + ' submitted</span></div>' +
    '<h3><a href="#/events/' + e.id + '">' + esc(e.title) + '</a></h3>' +
    '<p class="meta">' + esc(String(e.description || '').slice(0, 120)) + (String(e.description || '').length > 120 ? '…' : '') + '</p>' +
    '<p class="meta">🗓 ' + fmtDay(e.starts_at) + ' → ' + fmtDay(e.ends_at) + '<br>⏰ Deadline: ' + fmtDate(e.submission_deadline) + '</p>' +
    '<a class="btn btn-secondary btn-sm" href="#/events/' + e.id + '">View event →</a></div>';
}

function projectCard(p) {
  return '<div class="card hover">' +
    '<div style="display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap">' + (p.track_name ? '<span class="badge track">' + esc(p.track_name) + '</span>' : '') + '<span class="badge">' + esc(p.event_title || '') + '</span></div>' +
    '<h3><a href="#/gallery/' + p.id + '">' + esc(p.title) + '</a></h3>' +
    '<p class="meta">' + esc(p.excerpt || '') + '</p>' +
    '<p class="meta">👥 ' + esc(p.team_name || '') + ' · 🔗 ' + (p.link_count || 0) + ' links</p>' +
    '<a class="btn btn-secondary btn-sm" href="#/gallery/' + p.id + '">Open project →</a></div>';
}

async function viewEvents() {
  renderLoading();
  const r = await api('/events?limit=24');
  const list = r.ok ? r.data.data : [];
  render('<div class="page-head"><div><h1>Events</h1><p class="sub">Published hackathons you can join right now.</p></div>' +
    (App.user && ['organizer', 'admin'].includes(App.user.role) ? '<div class="page-actions"><a class="btn btn-primary" href="#/organizer/events/new">＋ New event</a></div>' : '') + '</div>' +
    (list.length ? '<div class="grid cols-3">' + list.map(eventCard).join('') + '</div>' : emptyState('📅', 'No events yet', 'Organizers can create one from the dashboard.')));
}

async function viewEventDetail(id) {
  renderLoading();
  const r = await api('/events/' + id);
  if (!r.ok) { render(emptyState('🔍', 'Event not found', 'It may be a draft or deleted.')); return; }
  const e = r.data;
  const mine = App.user ? await api('/teams/mine') : { ok: false };
  const myTeam = mine.ok ? mine.data.find((t) => t.event_id === e.id) : null;
  const past = new Date(e.submission_deadline).getTime() < Date.now();
  render(crumbs([['Events', '#/events'], [e.title, null]]) + '<div class="page-head"><div><div style="display:flex;gap:8px;align-items:center">' + badge(e.status) + '<span class="meta">by ' + esc(e.organizer_name || 'organizer') + '</span></div>' +
    '<h1>' + esc(e.title) + '</h1><p class="sub">' + esc(e.description || '') + '</p></div>' +
    '<div class="page-actions"><a class="btn btn-secondary" href="#/events">← All events</a>' +
    (App.user && (App.user.role === 'admin' || (App.user.role === 'organizer')) ? '<a class="btn btn-secondary" href="#/organizer/events/' + e.id + '/edit">Edit event</a>' : '') + '</div></div>' +
    '<div class="grid cols-3">' +
    '<div class="card"><div class="stat-card"><span class="lbl">Starts</span><b style="font-size:18px">' + fmtDate(e.starts_at) + '</b><span class="lbl" style="margin-top:8px">Ends</span><b style="font-size:18px">' + fmtDate(e.ends_at) + '</b></div></div>' +
    '<div class="card">' + countdownHtml(e.submission_deadline) + '<p class="meta" style="margin:10px 0 0">Deadline: ' + fmtDate(e.submission_deadline) + '</p></div>' +
    '<div class="card"><div class="stat-card"><span class="lbl">Your status</span>' +
    (myTeam ? '<b style="font-size:18px">👥 ' + esc(myTeam.name) + '</b><a class="btn btn-secondary btn-sm" style="margin-top:8px" href="#/teams/' + myTeam.id + '">Open my team →</a>'
      : App.user ? (past ? '<p class="meta">Deadline passed — team creation closed.</p>' : '<a class="btn btn-primary" href="#/teams?event=' + e.id + '">Create / join a team →</a>')
      : '<p class="meta">Log in to join this event.</p><a class="btn btn-primary btn-sm" href="#/login">Log in</a>') + '</div></div></div>' +
    '<div style="height:16px"></div><div class="grid cols-2">' +
    '<div class="card"><h3>Tracks (' + (e.tracks || []).length + ')</h3>' + ((e.tracks || []).length ? '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">' + e.tracks.map((t) => '<span class="badge track">' + esc(t.name) + '</span>').join('') + '</div>' : '<p class="meta">Open track — anything goes.</p>') + '</div>' +
    '<div class="card"><h3>Prizes (' + (e.prizes || []).length + ')</h3>' + ((e.prizes || []).length ? '<ul class="checklist" style="margin-top:8px">' + e.prizes.map((p) => '<li>🏆<div><b>' + esc(p.title) + '</b>' + (p.amount ? ' · <span class="badge">' + esc(p.amount) + '</span>' : '') + '<br><span class="meta">' + esc(p.description || '') + '</span></div></li>').join('') + '</ul>' : '<p class="meta">To be announced.</p>') + '</div></div>' +
    '<div style="height:16px"></div><div class="card"><h3>Submitted projects</h3><p class="meta">Explore what teams shipped for this event.</p><a class="btn btn-secondary btn-sm" href="#/gallery?event=' + e.id + '">Open gallery filtered →</a></div>'
  );
}

async function viewGallery() {
  const params = new URLSearchParams((location.hash.split('?')[1] || ''));
  let page = 1, q = params.get('q') || '', eventFilter = params.get('event') || '', trackFilter = '';
  async function load() {
    const box = document.getElementById('gal-list');
    box.innerHTML = skeletonCards(6);
    let url = '/gallery?page=' + page + '&limit=9&q=' + encodeURIComponent(q);
    if (eventFilter) url += '&event_id=' + eventFilter;
    if (trackFilter) url += '&track_id=' + trackFilter;
    const r = await api(url);
    if (!r.ok) { box.innerHTML = '<div class="alert error">Failed to load gallery.</div>'; return; }
    const d = r.data;
    box.innerHTML = d.data.length ? '<div class="grid cols-3">' + d.data.map(projectCard).join('') + '</div>' + pagerHtml(d.page, d.totalPages)
      : emptyState('🖼', 'No projects found for this search', 'Try different keywords, another track, or all events — or be the first to submit.');
    bindPager(box, (p) => { page = p; load(); });
  }
  async function loadTracks() {
    const sel = document.getElementById('gal-track');
    sel.innerHTML = '<option value="">All tracks</option>';
    trackFilter = '';
    if (!eventFilter) { sel.disabled = true; return; }
    sel.disabled = false;
    const r = await api('/events/' + eventFilter);
    if (r.ok) {
      for (const t of (r.data.tracks || [])) {
        const o = document.createElement('option');
        o.value = t.id; o.textContent = t.name;
        sel.appendChild(o);
      }
    }
  }
  const evR = await api('/events?limit=50');
  const evs = evR.ok ? evR.data.data : [];
  render(crumbs([['Home', '#/'], ['Gallery', null]]) + '<div class="page-head"><div><h1>Project gallery</h1><p class="sub">Every submitted project, searchable. Server-side paginated — fast even at 10,000 projects.</p></div></div>' +
    '<div class="searchbar"><input class="input" id="gal-q" placeholder="🔍 Search title, description, team…" value="' + esc(q) + '">' +
    '<select class="select" id="gal-ev" style="max-width:220px"><option value="">All events</option>' + evs.map((e) => '<option value="' + e.id + '"' + (String(e.id) === eventFilter ? ' selected' : '') + '>' + esc(e.title) + '</option>').join('') + '</select>' +
    '<select class="select" id="gal-track" style="max-width:200px" disabled><option value="">All tracks</option></select>' +
    '<button class="btn btn-primary" id="gal-go">Search</button></div>' +
    '<div id="gal-list"></div>');
  const go = () => { q = document.getElementById('gal-q').value; eventFilter = document.getElementById('gal-ev').value; trackFilter = document.getElementById('gal-track').value; page = 1; load(); };
  document.getElementById('gal-go').onclick = go;
  document.getElementById('gal-q').addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  document.getElementById('gal-ev').onchange = async () => {
    eventFilter = document.getElementById('gal-ev').value;
    await loadTracks();
    page = 1; load();
  };
  document.getElementById('gal-track').onchange = go;
  await loadTracks();
  load();
}

async function viewGalleryDetail(id) {
  renderLoading();
  const r = await api('/gallery/' + id);
  if (!r.ok) { render(emptyState('🔍', 'Project not found', 'It may still be a draft.')); return; }
  const p = r.data;
  render(crumbs([['Gallery', '#/gallery'], [p.title, null]]) + '<div class="page-head"><div><h1>' + esc(p.title) + '</h1>' +
    '<p class="sub">by <b>' + esc(p.team_name || '') + '</b> · ' + esc((p.members || []).map((m) => m.name).join(', ')) + ' · ' + esc(p.event_title || '') + '</p></div>' +
    '<div class="page-actions">' + badge('submitted') + (p.track_name ? '<span class="badge track">' + esc(p.track_name) + '</span>' : '') + '</div></div>' +
    '<div class="grid cols-3"><div class="card" style="grid-column: span 2"><h3>About this project</h3><p style="white-space:pre-wrap">' + esc(p.description || '') + '</p>' +
    '<h3 style="margin-top:18px">Links</h3><ul class="link-list">' + (p.links || []).map((l) => '<li><a class="pill" href="' + esc(l.url) + '" target="_blank" rel="noopener">🔗 ' + esc(l.label || 'Link') + '</a></li>').join('') + '</ul></div>' +
    '<div><div class="card"><h3>Details</h3><dl class="kv"><dt>Team</dt><dd>' + esc(p.team_name || '') + '</dd><dt>Event</dt><dd>' + esc(p.event_title || '') + '</dd><dt>Submitted</dt><dd>' + fmtDate(p.submitted_at) + '</dd><dt>Track</dt><dd>' + esc(p.track_name || '—') + '</dd></dl></div></div></div>');
}

/* ---------------- auth views ---------------- */
function viewLogin() {
  if (App.user) { location.hash = '#/dashboard'; return; }
  render('<div class="page-head"><div><h1>Welcome back</h1><p class="sub">Log in to your hackathon workspace.</p></div></div>' +
    '<div class="card"><form id="f-login"><div class="field"><label>Email</label><input class="input" name="email" type="email" required autocomplete="email" placeholder="you@example.com"></div>' +
    '<div class="field"><label>Password</label><input class="input" name="password" type="password" required autocomplete="current-password" placeholder="••••••••"></div>' +
    '<div class="field-error" id="f-err" style="display:none"></div>' +
    '<button class="btn btn-primary btn-block" type="submit" id="f-btn">Log in</button>' +
    '<p class="meta" style="text-align:center">No account? <a href="#/register">Register</a></p>' +
    '<div class="alert info" style="margin:12px 0 0">Demo accounts (seeded):<br><code class="inline">admin@dogfood.local / Admin123!</code><br><code class="inline">organizer@dogfood.local / Organizer123!</code><br><code class="inline">priya@dogfood.local / Password123!</code></div>' +
    '</form></div>', { narrow: true });
  document.getElementById('f-login').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const btn = document.getElementById('f-btn');
    const err = document.getElementById('f-err');
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Logging in…';
    const r = await api('/auth/login', { method: 'POST', body: { email: fd.get('email'), password: fd.get('password') } });
    if (!r.ok) { err.style.display = 'block'; err.textContent = r.data.error || 'Login failed.'; btn.disabled = false; btn.textContent = 'Log in'; return; }
    setToken(r.data.token);
    await refreshMe();
    toast('Welcome back, ' + App.user.name + '!', 'success');
    const back = sessionStorage.getItem('post_login');
    if (back) { sessionStorage.removeItem('post_login'); location.hash = back; }
    else location.hash = '#/dashboard';
  };
}
function viewRegister() {
  if (App.user) { location.hash = '#/dashboard'; return; }
  render('<div class="page-head"><div><h1>Create your account</h1><p class="sub">Free forever. Your data stays on your server.</p></div></div>' +
    '<div class="card"><form id="f-reg"><div class="field"><label>Full name</label><input class="input" name="name" required minlength="2" placeholder="Ada Lovelace"></div>' +
    '<div class="field"><label>Email</label><input class="input" name="email" type="email" required placeholder="you@example.com"></div>' +
    '<div class="field"><label>Password <span class="hint">— min 8 characters</span></label><input class="input" name="password" type="password" required minlength="8" placeholder="••••••••"></div>' +
    '<div class="field-error" id="f-err" style="display:none"></div>' +
    '<button class="btn btn-primary btn-block" type="submit" id="f-btn">Create account</button>' +
    '<p class="meta" style="text-align:center">Have an account? <a href="#/login">Log in</a></p></form></div>', { narrow: true });
  document.getElementById('f-reg').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const btn = document.getElementById('f-btn');
    const err = document.getElementById('f-err');
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Creating…';
    const r = await api('/auth/register', { method: 'POST', body: { name: fd.get('name'), email: fd.get('email'), password: fd.get('password') } });
    if (!r.ok) { err.style.display = 'block'; err.textContent = r.data.error || 'Registration failed.'; btn.disabled = false; btn.textContent = 'Create account'; return; }
    setToken(r.data.token);
    await refreshMe();
    toast('Account created. Let’s find you an event!', 'success');
    const back = sessionStorage.getItem('post_login');
    if (back) { sessionStorage.removeItem('post_login'); location.hash = back; }
    else location.hash = '#/dashboard';
  };
}

/* ---------------- participant views ---------------- */
function requireLogin() {
  if (!App.user) { location.hash = '#/login'; return false; }
  return true;
}

async function viewDashboard() {
  if (!requireLogin()) return;
  if (App.user.role === 'organizer') { location.hash = '#/organizer'; return; }
  if (App.user.role === 'admin') { location.hash = '#/admin'; return; }
  if (App.user.role === 'judge') { location.hash = '#/judging'; return; }
  renderLoading('Loading your workspace…');
  const r = await api('/stats/me');
  if (!r.ok) { render('<div class="alert error">Failed to load dashboard.</div>'); return; }
  const { teams, projects, events } = r.data;
  const submitted = projects.filter((p) => p.status === 'submitted').length;
  const nextDeadline = events.length ? events[0].submission_deadline : null;
  // required actions
  const actions = [];
  if (!teams.length) actions.push(['📅', 'Join an event & create a team', 'Pick an event and form your crew.', '#/events']);
  else if (!projects.length) actions.push(['🛠', 'Create your project draft', 'Every submission starts as a draft.', '#/projects']);
  else {
    const drafts = projects.filter((p) => p.status === 'draft');
    if (drafts.length) actions.push(['📦', 'Submit ' + drafts.length + ' draft' + (drafts.length > 1 ? 's' : ''), 'Deadlines are enforced server-side — don’t wait.', '#/projects']);
    else actions.push(['✅', 'All submitted — nice!', 'Browse the gallery to see the competition.', '#/gallery']);
  }
  render('<div class="page-head"><div><h1>Hey, ' + esc(App.user.name.split(' ')[0]) + ' 👋</h1><p class="sub">Here’s what’s happening and what needs your attention.</p></div>' +
    '<div class="page-actions"><a class="btn btn-secondary" href="#/events">Find events</a><a class="btn btn-primary" href="#/projects">My projects</a></div></div>' +
    '<div class="grid cols-4">' +
    '<div class="card stat-card"><span class="lbl">My teams</span><span class="num">' + teams.length + '</span></div>' +
    '<div class="card stat-card"><span class="lbl">Projects</span><span class="num">' + projects.length + '</span></div>' +
    '<div class="card stat-card"><span class="lbl">Submitted</span><span class="num">' + submitted + '</span></div>' +
    '<div class="card stat-card"><span class="lbl">Open events</span><span class="num">' + events.length + '</span></div></div>' +
    '<div style="height:16px"></div><div class="grid cols-2">' +
    '<div class="card"><h3>⚡ Required actions</h3><ul class="checklist" style="margin-top:10px">' + actions.map(([i, t, d, h]) => '<li>' + i + '<div><b>' + esc(t) + '</b><br><span class="meta">' + esc(d) + '</span><br><a class="btn btn-secondary btn-sm" style="margin-top:6px" href="' + h + '">Go →</a></div></li>').join('') + '</ul></div>' +
    '<div class="card">' + (nextDeadline ? countdownHtml(nextDeadline, 'Next deadline') : '<p class="meta">No upcoming deadlines.</p>') +
    '<h3 style="margin-top:14px">My projects</h3>' + (projects.length ? projects.slice(0, 3).map((p) => '<p> ' + badge(p.status) + ' <a href="#/projects/' + p.id + '"><b>' + esc(p.title) + '</b></a><br><span class="meta">' + esc(p.event_title || '') + '</span></p>').join('') : '<p class="meta">No projects yet.</p>') + '</div></div>' +
    '<div style="height:16px"></div><div class="card"><h3>Open events</h3>' + (events.length ? '<div class="grid cols-3" style="margin-top:10px">' + events.slice(0, 3).map(eventCard).join('') + '</div>' : '<p class="meta">No open events.</p>') + '</div>'
  );
}

async function viewTeams() {
  if (!requireLogin()) return;
  const params = new URLSearchParams((location.hash.split('?')[1] || ''));
  const eventHint = params.get('event');
  renderLoading();
  const [mine, evs] = await Promise.all([api('/teams/mine'), api('/events?limit=50')]);
  const teams = mine.ok ? mine.data : [];
  const events = evs.ok ? evs.data.data : [];
  const joinable = eventHint ? events.filter((e) => String(e.id) === eventHint) : events;
  render('<div class="page-head"><div><h1>Teams</h1><p class="sub">One team per event. Share your invite link to grow the crew.</p></div></div>' +
    (teams.length ? '<div class="grid cols-2">' + teams.map((t) =>
      '<div class="card hover"><h3><a href="#/teams/' + t.id + '">' + esc(t.name) + '</a></h3>' +
      '<p class="meta">📅 ' + esc(t.event_title || '') + ' · 👥 ' + t.member_count + ' member(s) · you are <b>' + esc(t.my_role || 'member') + '</b></p>' +
      '<p class="meta">⏰ Deadline: ' + fmtDate(t.submission_deadline) + '</p>' +
      '<a class="btn btn-secondary btn-sm" href="#/teams/' + t.id + '">Open team →</a></div>').join('') + '</div>'
      : emptyState('👥', 'No teams yet', 'Create a team for an event to start building.')) +
    '<div style="height:16px"></div><div class="card"><h3>Create a team</h3><form id="f-team"><div class="form-row">' +
    '<div class="field"><label>Event</label><select class="select" name="event_id">' + joinable.map((e) => '<option value="' + e.id + '"' + (String(e.id) === eventHint ? ' selected' : '') + '>' + esc(e.title) + '</option>').join('') + '</select></div>' +
    '<div class="field"><label>Team name</label><input class="input" name="name" required minlength="2" placeholder="Pixel Pioneers"></div></div>' +
    '<div class="field-error" id="t-err" style="display:none"></div><button class="btn btn-primary" type="submit">Create team</button></form></div>');
  const f = document.getElementById('f-team');
  if (f) f.onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const err = document.getElementById('t-err');
    const r = await api('/teams', { method: 'POST', body: { event_id: parseInt(fd.get('event_id'), 10), name: fd.get('name') } });
    if (!r.ok) { err.style.display = 'block'; err.textContent = r.data.error || 'Could not create team.'; return; }
    toast('Team created! Share the invite link.', 'success');
    location.hash = '#/teams/' + r.data.id;
  };
}

async function viewTeamDetail(id) {
  if (!requireLogin()) return;
  renderLoading();
  const r = await api('/teams/' + id);
  if (!r.ok) { render(emptyState('🔒', 'Team not available', r.data.error || 'Only members can view this team.')); return; }
  const t = r.data;
  const isOwner = t.members.some((m) => m.user_id === App.user.id && m.member_role === 'owner');
  const inviteUrl = location.origin + location.pathname + '#/join/' + t.invite_code;
  render(crumbs([['Teams', '#/teams'], [t.name, null]]) + '<div class="page-head"><div><h1>' + esc(t.name) + '</h1><p class="sub">📅 ' + esc(t.event_title || '') + ' · ⏰ ' + fmtDate(t.submission_deadline) + '</p></div>' +
    '<div class="page-actions">' + (isOwner ? '<button class="btn btn-secondary" id="btn-rename">Rename</button>' : '') +
    '<button class="btn btn-secondary" id="btn-leave">Leave team</button></div></div>' +
    '<div class="grid cols-2"><div class="card"><h3>Members (' + t.members.length + ')</h3><ul class="checklist" style="margin-top:8px">' +
    t.members.map((m) => '<li>👤<div><b>' + esc(m.name) + '</b> ' + (m.member_role === 'owner' ? '<span class="badge">owner</span>' : '') + '<br><span class="meta">joined ' + fmtDay(m.joined_at) + '</span></div></li>').join('') + '</ul></div>' +
    '<div class="card"><h3>Invitation link</h3><p class="meta">Anyone with this link can request to join (one team per event is enforced).</p>' +
    '<div class="invite-box">' + esc(inviteUrl) + '</div>' +
    '<p class="meta" style="margin:8px 0 0">⏳ Expires ' + fmtDate(t.invite_expires_at) + ' — regenerating issues a fresh link.</p>' +
    '<div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap"><button class="btn btn-secondary btn-sm" id="btn-copy">Copy link</button>' +
    (isOwner ? '<button class="btn btn-ghost btn-sm" id="btn-regen">Regenerate</button>' : '') + '</div></div></div>');
  document.getElementById('btn-copy').onclick = async () => {
    try { await navigator.clipboard.writeText(inviteUrl); toast('Invite link copied!', 'success'); }
    catch (e) { toast(inviteUrl, 'info', 8000); }
  };
  const re = document.getElementById('btn-regen');
  if (re) re.onclick = async () => {
    if (!await confirmDialog({ title: 'Regenerate invite link?', body: 'The old link will stop working.', confirmLabel: 'Regenerate' })) return;
    const rr = await api('/teams/' + id + '/invites', { method: 'POST', body: { regenerate: true } });
    if (rr.ok) { toast('New invite link generated.', 'success'); viewTeamDetail(id); }
    else toast(rr.data.error || 'Failed.', 'error');
  };
  const rn = document.getElementById('btn-rename');
  if (rn) rn.onclick = async () => {
    const name = prompt('New team name:', t.name);
    if (!name) return;
    const rr = await api('/teams/' + id, { method: 'PUT', body: { name } });
    if (rr.ok) { toast('Team renamed.', 'success'); viewTeamDetail(id); }
    else toast(rr.data.error || 'Rename failed.', 'error');
  };
  document.getElementById('btn-leave').onclick = async () => {
    if (!await confirmDialog({ title: 'Leave ' + t.name + '?', body: 'You can rejoin later with the invite link (if a slot is free).', confirmLabel: 'Leave team', danger: true })) return;
    const rr = await api('/teams/' + id + '/leave', { method: 'POST' });
    if (rr.ok) { toast('You left the team.', 'info'); location.hash = '#/teams'; }
    else toast(rr.data.error || 'Could not leave.', 'error');
  };
}

async function viewJoin(code) {
  if (!requireLogin()) { sessionStorage.setItem('post_login', '#/join/' + code); return; }
  renderLoading('Checking invitation…');
  const r = await api('/teams/invites/' + code + '/preview');
  if (!r.ok) {
    const expired = r.status === 410;
    render(emptyState(expired ? '⏳' : '🔗', expired ? 'Invitation expired' : 'Invalid invitation',
      r.data.error || (expired ? 'Ask the team owner for a fresh link.' : 'This invite link is unknown.')), { narrow: true });
    return;
  }
  const { team, members, already_member } = r.data;
  render('<div class="card" style="text-align:center;padding:40px"><div style="font-size:44px">✉️</div><h1>You’re invited to join<br>' + esc(team.name) + '</h1>' +
    '<p class="sub">📅 ' + esc(team.event_title || '') + ' · 👥 ' + members.map((m) => esc(m.name)).join(', ') + '</p>' +
    (already_member ? '<div class="alert info">You’re already in this team.</div><a class="btn btn-primary" href="#/teams/' + team.id + '">Open team →</a>'
      : '<button class="btn btn-primary" id="btn-accept" style="font-size:16px;padding:12px 28px">Accept invitation</button><div class="field-error" id="j-err" style="display:none;margin-top:10px"></div>') + '</div>', { narrow: true });
  const b = document.getElementById('btn-accept');
  if (b) b.onclick = async () => {
    b.disabled = true; b.innerHTML = '<span class="spinner"></span> Joining…';
    const rr = await api('/invites/' + code + '/accept', { method: 'POST' });
    if (rr.ok) { toast('Welcome to ' + team.name + '!', 'success'); location.hash = '#/teams/' + team.id; }
    else { const e = document.getElementById('j-err'); e.style.display = 'block'; e.textContent = rr.data.error || 'Could not join.'; b.disabled = false; b.textContent = 'Accept invitation'; }
  };
}

async function viewProjects() {
  if (!requireLogin()) return;
  renderLoading();
  const [projs, teams] = await Promise.all([api('/projects/mine'), api('/teams/mine')]);
  const list = projs.ok ? projs.data : [];
  const myTeams = teams.ok ? teams.data : [];
  render('<div class="page-head"><div><h1>Projects</h1><p class="sub">Drafts are private. Submitted projects go to the public gallery.</p></div></div>' +
    (list.length ? '<div class="grid cols-2">' + list.map((p) =>
      '<div class="card hover"><div style="display:flex;gap:8px;align-items:center">' + badge(p.status) + (p.track_name ? '<span class="badge track">' + esc(p.track_name) + '</span>' : '') + '</div>' +
      '<h3><a href="#/projects/' + p.id + '">' + esc(p.title) + '</a></h3><p class="meta">' + esc(p.event_title || '') + ' · 👥 ' + esc(p.team_name || '') + '</p>' +
      '<p class="meta">Updated ' + fmtDate(p.updated_at) + '</p></div>').join('') + '</div>'
      : emptyState('🛠', 'No projects yet', 'Create your first draft — you can edit it until the deadline.')) +
    '<div style="height:16px"></div><div class="card"><h3>New draft</h3><form id="f-proj"><div class="form-row">' +
    '<div class="field"><label>Team</label><select class="select" name="team_id">' + myTeams.map((t) => '<option value="' + t.id + '">' + esc(t.name) + ' (' + esc(t.event_title || '') + ')</option>').join('') + '</select>' +
    (myTeams.length ? '' : '<div class="hint">Create a team first.</div>') + '</div>' +
    '<div class="field"><label>Title</label><input class="input" name="title" required minlength="3" placeholder="My brilliant hack"></div></div>' +
    '<div class="field"><label>Short description</label><textarea class="textarea" name="description" placeholder="What does it do? (20+ chars needed to submit)"></textarea></div>' +
    '<div class="field"><label>Repo / demo URL</label><input class="input" name="url" placeholder="https://…"></div>' +
    '<div class="field-error" id="p-err" style="display:none"></div><button class="btn btn-primary" type="submit" ' + (myTeams.length ? '' : 'disabled') + '>Save draft</button></form></div>');
  const f = document.getElementById('f-proj');
  if (f) f.onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const links = fd.get('url') ? [{ label: 'Repo', url: String(fd.get('url')) }] : [];
    const r = await api('/projects', { method: 'POST', body: { team_id: parseInt(fd.get('team_id'), 10), title: fd.get('title'), description: fd.get('description'), links } });
    if (!r.ok) { const el = document.getElementById('p-err'); el.style.display = 'block'; el.textContent = r.data.error || 'Could not create project.'; return; }
    toast('Draft saved.', 'success');
    location.hash = '#/projects/' + r.data.id;
  };
}

async function viewProjectDetail(id) {
  if (!requireLogin()) return;
  renderLoading();
  const r = await api('/projects/' + id);
  if (!r.ok) { render(emptyState('🔒', 'Project not available', r.data.error || 'Only team members can view drafts.')); return; }
  const p = r.data;
  const past = new Date(p.submission_deadline).getTime() < Date.now();
  const links = (p.links || []).map((l) => ({ label: l.label, url: l.url }));
  const evTracks = await api('/events/' + p.event_id);
  const tracks = evTracks.ok ? (evTracks.data.tracks || []) : [];
  const submitted = p.status === 'submitted';
  let submittedAt = null;
  if (submitted) {
    const g = await api('/gallery/' + id);
    if (g.ok) submittedAt = g.data.submitted_at;
  }
  const trackName = (tracks.find((t) => t.id === p.track_id) || {}).name || '—';
  render(crumbs([['Projects', '#/projects'], [p.title, null]]) + '<div class="page-head"><div><div style="display:flex;gap:8px;align-items:center;margin-top:4px">' + badge(p.status) + (past ? badge('locked') : '') + '</div>' +
    '<h1>' + esc(p.title) + '</h1><p class="sub">👥 ' + esc(p.team_name || '') + ' · 📅 ' + esc(p.event_title || '') + '</p></div>' +
    '<div class="page-actions"><button class="btn btn-secondary" id="btn-preview">👁 Preview</button>' + (submitted && !past ? '<button class="btn btn-secondary" id="btn-unsubmit">Move back to draft</button>' : '') +
    (!submitted && !past ? '<button class="btn btn-primary" id="btn-submit">Submit project →</button>' : '') + '</div></div>' +
    (submitted ? '<div class="alert success">✅ <b>Submitted' + (submittedAt ? ' on ' + fmtDate(submittedAt) : '') + '.</b> It’s live in the <a href="#/gallery/' + p.id + '">public gallery</a>.' + (past ? ' The deadline has passed, so it is now locked.' : ' You can still edit or unsubmit before the deadline.') + '</div>'
      : past ? '<div class="alert error">⏰ The deadline has passed. This project is locked and can no longer be edited or submitted.</div>'
      : '<div class="alert info">📝 Draft — only your team can see this. Add a track, a 20+ character description and at least one link, then submit.</div>') +
    '<div class="grid cols-3"><div class="card" style="grid-column: span 2">' +
    '<div id="pane-edit"><h3>Project information</h3><form id="f-edit">' +
    '<div class="field"><label>Title</label><input class="input" name="title" value="' + esc(p.title) + '" ' + (past ? 'disabled' : '') + '></div>' +
    '<div class="field"><label>Description</label><textarea class="textarea" name="description" ' + (past ? 'disabled' : '') + '>' + esc(p.description || '') + '</textarea></div>' +
    '<div class="field"><label>Track' + (tracks.length ? '' : ' (none defined for this event)') + '</label><select class="select" name="track_id" ' + (past ? 'disabled' : '') + '><option value="">— No track —</option>' +
    tracks.map((t) => '<option value="' + t.id + '"' + (p.track_id === t.id ? ' selected' : '') + '>' + esc(t.name) + '</option>').join('') + '</select></div>' +
    '<div class="field"><label>Links (one per line: <code class="inline">Label | https://…</code>)</label><textarea class="textarea" name="links" style="min-height:80px" ' + (past ? 'disabled' : '') + '>' + esc(links.map((l) => (l.label || 'Link') + ' | ' + l.url).join('\n')) + '</textarea></div>' +
    '<div class="field-error" id="e-err" style="display:none"></div>' +
    (past ? '' : '<button class="btn btn-primary" type="submit">Save draft</button>') + '</form></div>' +
    '<div id="pane-preview" style="display:none"><h3>Gallery preview</h3><p class="meta">Exactly how the public will see this project after submission.</p>' +
    '<div class="preview-frame"><div class="card"><div style="display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap">' + (p.track_id ? '<span class="badge track">' + esc(trackName) + '</span>' : '') + badge(p.status) + '</div>' +
    '<h3>' + esc(p.title) + '</h3><p class="meta">' + esc((p.description || '').slice(0, 220)) + '</p>' +
    '<p class="meta">👥 ' + esc(p.team_name || '') + '</p><ul class="link-list">' + links.map((l) => '<li><a class="pill" href="' + esc(l.url) + '" target="_blank" rel="noopener">🔗 ' + esc(l.label || 'Link') + '</a></li>').join('') + '</ul></div></div></div>' +
    '</div>' +
    '<div><div class="card">' + countdownHtml(p.submission_deadline) + '</div><div style="height:12px"></div>' +
    '<div class="card"><h3>Submission status</h3><dl class="kv" style="margin-top:8px"><dt>Status</dt><dd>' + badge(p.status) + '</dd><dt>Submitted at</dt><dd>' + (submittedAt ? fmtDate(submittedAt) : '—') + '</dd><dt>Deadline</dt><dd>' + fmtDate(p.submission_deadline) + '</dd><dt>Track</dt><dd>' + esc(trackName) + '</dd></dl></div><div style="height:12px"></div><div class="card"><h3>Submission checklist</h3><ul class="checklist" style="margin-top:8px">' +
    [['Title ≥ 3 chars', (p.title || '').trim().length >= 3], ['Description ≥ 20 chars', (p.description || '').trim().length >= 20], ['≥ 1 valid link', links.length > 0 && links.every((l) => /^https?:\/\//.test(l.url))], ['Track selected', tracks.length === 0 || !!p.track_id], ['Before deadline', !past]].map(([t, ok]) =>
      '<li class="' + (ok ? 'done' : '') + '">' + (ok ? '✅' : '⬜') + '<div>' + esc(t) + '</div></li>').join('') + '</ul></div></div></div>');
  document.getElementById('btn-preview').onclick = () => {
    const pe = document.getElementById('pane-edit');
    const pp = document.getElementById('pane-preview');
    const showing = pp.style.display === 'none';
    pp.style.display = showing ? 'block' : 'none';
    pe.style.display = showing ? 'none' : 'block';
    document.getElementById('btn-preview').innerHTML = showing ? '✏️ Back to edit' : '👁 Preview';
  };
  const f = document.getElementById('f-edit');
  if (f) f.onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const parsed = String(fd.get('links') || '').split('\n').map((s) => s.trim()).filter(Boolean).map((line, i) => {
      const parts = line.split('|').map((s) => s.trim());
      return parts.length === 2 ? { label: parts[0] || 'Link', url: parts[1] } : { label: 'Link', url: parts[0] };
    });
    const body = { title: fd.get('title'), description: fd.get('description'), track_id: fd.get('track_id') ? parseInt(fd.get('track_id'), 10) : null, links: parsed };
    const rr = await api('/projects/' + id, { method: 'PUT', body });
    if (!rr.ok) { const el = document.getElementById('e-err'); el.style.display = 'block'; el.textContent = rr.data.error || 'Save failed.'; return; }
    toast('Saved.', 'success');
    viewProjectDetail(id);
  };
  const sb = document.getElementById('btn-submit');
  if (sb) sb.onclick = async () => {
    const root = document.getElementById('modal-root');
    root.innerHTML = '<div class="modal-backdrop"><div class="modal" role="dialog" aria-modal="true">' +
      '<h3>Review & submit</h3><p style="color:var(--muted)">This will publish your project to the public gallery.</p>' +
      '<dl class="kv"><dt>Project</dt><dd><b>' + esc(p.title) + '</b></dd><dt>Team</dt><dd>' + esc(p.team_name || '') + '</dd>' +
      '<dt>Track</dt><dd>' + esc(trackName) + '</dd><dt>Links</dt><dd>' + links.length + '</dd>' +
      '<dt>Deadline</dt><dd>' + fmtDate(p.submission_deadline) + '</dd></dl>' +
      '<div class="modal-actions"><button class="btn btn-secondary" id="m-cancel">Keep editing</button>' +
      '<button class="btn btn-primary" id="m-ok">Submit project</button></div></div></div>';
    const close = () => { root.innerHTML = ''; };
    root.querySelector('#m-cancel').onclick = close;
    root.querySelector('#m-ok').onclick = async (ev2) => {
      ev2.target.disabled = true;
      ev2.target.innerHTML = '<span class="spinner"></span> Submitting…';
      const rr = await api('/projects/' + id + '/submit', { method: 'POST' });
      close();
      if (!rr.ok) { toast((rr.data.error || 'Submit failed.') + (rr.data.details ? ' ' + rr.data.details.join(' ') : ''), 'error', 7000); return; }
      toast('🎉 Submitted at ' + fmtDate(rr.data.submission.submitted_at), 'success', 6000);
      viewProjectDetail(id);
    };
  };
  const ub = document.getElementById('btn-unsubmit');
  if (ub) ub.onclick = async () => {
    if (!await confirmDialog({ title: 'Move back to draft?', body: 'It will disappear from the public gallery until you resubmit.', confirmLabel: 'Unsubmit', danger: true })) return;
    const rr = await api('/projects/' + id + '/unsubmit', { method: 'POST' });
    if (!rr.ok) { toast(rr.data.error || 'Failed.', 'error'); return; }
    toast('Moved back to draft.', 'info');
    viewProjectDetail(id);
  };
}

async function viewSubmissions() {
  if (!requireLogin()) return;
  renderLoading();
  const r = await api('/submissions/mine');
  const list = r.ok ? r.data : [];
  render('<div class="page-head"><div><h1>Submissions</h1><p class="sub">Everything your teams have shipped, with timestamps.</p></div><div class="page-actions"><a class="btn btn-secondary" href="#/gallery">Public gallery</a></div></div>' +
    (list.length ? '<div class="table-wrap"><table class="tbl"><thead><tr><th>Project</th><th>Team</th><th>Event</th><th>Submitted at</th><th></th></tr></thead><tbody>' +
      list.map((s) => '<tr><td><b>' + esc(s.project_title) + '</b></td><td>' + esc(s.team_name) + '</td><td>' + esc(s.event_title) + '</td><td>' + fmtDate(s.submitted_at) + '</td><td><a class="btn btn-secondary btn-sm" href="#/gallery/' + s.project_id + '">View →</a></td></tr>').join('') + '</tbody></table></div>'
      : emptyState('📦', 'Nothing submitted yet', 'Drafts don’t count — hit submit before the deadline.', '<a class="btn btn-primary" href="#/projects">Go to my projects</a>')));
}

async function viewProfile() {
  if (!requireLogin()) return;
  const u = App.user;
  render('<div class="page-head"><div><h1>Profile</h1><p class="sub">Your local account.</p></div></div>' +
    '<div class="card"><div style="display:flex;gap:14px;align-items:center"><span class="avatar" style="width:52px;height:52px;font-size:20px">' + esc(initials(u.name)) + '</span><div><b style="font-size:18px">' + esc(u.name) + '</b><br><span class="meta">' + esc(u.email) + '</span> <span class="role-badge">' + esc(u.role) + '</span></div></div>' +
    '<form id="f-prof" style="margin-top:16px"><div class="field"><label>Display name</label><input class="input" name="name" value="' + esc(u.name) + '"></div><div class="field-error" id="pf-err" style="display:none"></div><button class="btn btn-primary" type="submit">Save</button></form></div>');
  document.getElementById('f-prof').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const r = await api('/auth/profile', { method: 'PUT', body: { name: fd.get('name') } });
    if (!r.ok) { const el = document.getElementById('pf-err'); el.style.display = 'block'; el.textContent = r.data.error || 'Failed.'; return; }
    App.user = r.data.user;
    toast('Profile updated.', 'success');
    viewProfile();
  };
}

/* ---------------- organizer views ---------------- */
function requireOrganizer() {
  if (!App.user) { location.hash = '#/login'; return false; }
  if (!['organizer', 'admin'].includes(App.user.role)) { location.hash = '#/dashboard'; return false; }
  return true;
}

async function viewOrganizer() {
  if (!requireOrganizer()) return;
  renderLoading('Loading organizer overview…');
  const r = await api('/stats/organizer');
  if (!r.ok) { render('<div class="alert error">Failed to load stats.</div>'); return; }
  const { totals, upcoming } = r.data;
  render('<div class="page-head"><div><h1>Organizer dashboard</h1><p class="sub">What’s happening, what needs attention, and what’s next. All numbers are live from the database.</p></div>' +
    '<div class="page-actions"><a class="btn btn-secondary" href="#/organizer/events">Manage events</a><a class="btn btn-primary" href="#/organizer/events/new">＋ New event</a></div></div>' +
    '<div class="grid cols-4">' +
    '<div class="card stat-card"><span class="lbl">Participants</span><span class="num">' + totals.participants + '</span><span class="lbl">in your events</span></div>' +
    '<div class="card stat-card"><span class="lbl">Teams</span><span class="num">' + totals.teams + '</span></div>' +
    '<div class="card stat-card"><span class="lbl">Projects</span><span class="num">' + totals.projects + '</span><span class="lbl">' + totals.drafts + ' still drafts</span></div>' +
    '<div class="card stat-card"><span class="lbl">Submissions</span><span class="num">' + totals.submissions + '</span></div></div>' +
    '<div style="height:16px"></div><div class="grid cols-2"><div class="card"><h3>⏰ Upcoming deadlines</h3>' +
    (upcoming.length ? '<ul class="checklist" style="margin-top:8px">' + upcoming.map((e) => '<li>📅<div><b><a href="#/organizer/events/' + e.id + '/edit">' + esc(e.title) + '</a></b> ' + badge(e.status) + '<br><span class="meta">Deadline: ' + fmtDate(e.submission_deadline) + '</span></div></li>').join('') + '</ul>' : '<p class="meta">No events yet.</p>') + '</div>' +
    '<div class="card"><h3>⚡ Quick actions</h3><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"><a class="btn btn-primary btn-sm" href="#/organizer/events/new">＋ New event</a><a class="btn btn-secondary btn-sm" href="#/organizer/events">Manage events</a><a class="btn btn-secondary btn-sm" href="#/gallery">View gallery</a></div>' +
    '<div class="alert info" style="margin:12px 0 0">Judging is live: manage <a href="#/organizer/judging/judges">judges</a>, <a href="#/organizer/judging/assignments">assignments</a>, <a href="#/organizer/judging/rubric">rubric</a> and <a href="#/organizer/judging/calibration">calibration</a>.</div></div></div>');
}

async function viewOrganizerEvents() {
  if (!requireOrganizer()) return;
  renderLoading();
  const r = await api('/events?scope=all&limit=50');
  const list = r.ok ? r.data.data : [];
  render(crumbs([['Dashboard', '#/organizer'], ['Events', null]]) + '<div class="page-head"><div><h1>Events</h1><p class="sub">Create, publish, and manage your hackathons.</p></div><div class="page-actions"><a class="btn btn-primary" href="#/organizer/events/new">＋ New event</a></div></div>' +
    (list.length ? '<div class="table-wrap"><table class="tbl"><thead><tr><th>Event</th><th>Status</th><th>Teams</th><th>Submitted</th><th>Deadline</th><th></th></tr></thead><tbody>' +
      list.map((e) => '<tr><td><b><a href="#/events/' + e.id + '">' + esc(e.title) + '</a></b></td><td>' + badge(e.status) + '</td><td>' + (e.team_count || 0) + '</td><td>' + (e.submitted_count || 0) + '</td><td>' + fmtDate(e.submission_deadline) + '</td>' +
        '<td style="white-space:nowrap"><a class="btn btn-secondary btn-sm" href="#/organizer/events/' + e.id + '/submissions">Submissions</a> <a class="btn btn-secondary btn-sm" href="#/organizer/events/' + e.id + '/teams">Teams</a> <a class="btn btn-secondary btn-sm" href="#/organizer/events/' + e.id + '/edit">Edit</a></td></tr>').join('') + '</tbody></table></div>'
      : emptyState('📅', 'No events yet', 'Create your first hackathon to get started.', '<a class="btn btn-primary" href="#/organizer/events/new">＋ New event</a>')));
}

function eventFormHtml(e = {}) {
  const v = (k) => esc(e[k] || '');
  const dt = (k) => e[k] ? String(e[k]).slice(0, 16) : '';
  return '<div class="form-row"><div class="field"><label>Event name *</label><input class="input" name="title" required minlength="3" value="' + v('title') + '" placeholder="Campus Hack 2026"></div>' +
    '<div class="field"><label>Status</label><select class="select" name="status"><option value="draft"' + (e.status === 'draft' ? ' selected' : '') + '>Draft (hidden)</option><option value="published"' + (e.status === 'published' ? ' selected' : '') + '>Published (public)</option><option value="archived"' + (e.status === 'archived' ? ' selected' : '') + '>Archived</option></select></div></div>' +
    '<div class="field"><label>Description</label><textarea class="textarea" name="description" placeholder="What is this hackathon about?">' + v('description') + '</textarea></div>' +
    '<div class="form-row"><div class="field"><label>Starts at *</label><input class="input" type="datetime-local" name="starts_at" required value="' + dt('starts_at') + '"></div>' +
    '<div class="field"><label>Ends at *</label><input class="input" type="datetime-local" name="ends_at" required value="' + dt('ends_at') + '"></div></div>' +
    '<div class="field"><label>Submission deadline *</label><input class="input" type="datetime-local" name="submission_deadline" required value="' + dt('submission_deadline') + '"><div class="hint">Enforced on the server — late submissions are rejected even if the button is somehow clicked.</div></div>' +
    '<div class="form-row"><div class="field"><label>Tracks <span class="hint">(one per line)</span></label><textarea class="textarea" name="tracks" style="min-height:70px" placeholder="Web & Mobile&#10;AI & Data">' + esc((e.tracks || []).map((t) => t.name).join('\n')) + '</textarea></div>' +
    '<div class="field"><label>Prizes <span class="hint">(one per line: Title | Amount)</span></label><textarea class="textarea" name="prizes" style="min-height:70px" placeholder="Grand Prize | $1500&#10;Best Design | $500">' + esc((e.prizes || []).map((p) => p.title + (p.amount ? ' | ' + p.amount : '')).join('\n')) + '</textarea></div></div>';
}

async function viewEventNew() {
  if (!requireOrganizer()) return;
  render(crumbs([['Events', '#/organizer/events'], ['New event', null]]) + '<div class="page-head"><div><h1>New event</h1></div></div>' +
    '<div class="card"><form id="f-ev">' + eventFormHtml() + '<div class="field-error" id="ev-err" style="display:none"></div><button class="btn btn-primary" type="submit">Create event</button></form></div>', { narrow: true });
  document.getElementById('f-ev').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const tracks = String(fd.get('tracks') || '').split('\n').map((s) => s.trim()).filter(Boolean).map((name) => ({ name }));
    const prizes = String(fd.get('prizes') || '').split('\n').map((s) => s.trim()).filter(Boolean).map((line) => {
      const [title, amount] = line.split('|').map((s) => s.trim());
      return { title, amount: amount || '' };
    });
    const body = { title: fd.get('title'), description: fd.get('description'), status: fd.get('status'), starts_at: new Date(fd.get('starts_at')).toISOString(), ends_at: new Date(fd.get('ends_at')).toISOString(), submission_deadline: new Date(fd.get('submission_deadline')).toISOString(), tracks, prizes };
    const r = await api('/events', { method: 'POST', body });
    if (!r.ok) { const el = document.getElementById('ev-err'); el.style.display = 'block'; el.textContent = r.data.errors ? Object.values(r.data.errors).join(' ') : (r.data.error || 'Failed.'); return; }
    toast('Event created!', 'success');
    location.hash = '#/events/' + r.data.id;
  };
}

async function viewEventEdit(id) {
  if (!requireOrganizer()) return;
  renderLoading();
  const r = await api('/events/' + id);
  if (!r.ok) { render(emptyState('🔍', 'Event not found', '')); return; }
  const e = r.data;
  render(crumbs([['Events', '#/organizer/events'], ['Edit: ' + e.title, null]]) + '<div class="page-head"><div><h1>Edit: ' + esc(e.title) + '</h1></div>' +
    '<div class="page-actions"><a class="btn btn-secondary" href="#/organizer/events/' + id + '/submissions">Submissions</a><button class="btn btn-danger" id="btn-del">Delete</button></div></div>' +
    '<div class="card"><form id="f-ev">' + eventFormHtml(e) + '<div class="field-error" id="ev-err" style="display:none"></div><button class="btn btn-primary" type="submit">Save changes</button></form></div>', { narrow: true });
  document.getElementById('f-ev').onsubmit = async (ev2) => {
    ev2.preventDefault();
    const fd = new FormData(ev2.target);
    const body = { title: fd.get('title'), description: fd.get('description'), status: fd.get('status'), starts_at: new Date(fd.get('starts_at')).toISOString(), ends_at: new Date(fd.get('ends_at')).toISOString(), submission_deadline: new Date(fd.get('submission_deadline')).toISOString() };
    const rr = await api('/events/' + id, { method: 'PUT', body });
    if (!rr.ok) { const el = document.getElementById('ev-err'); el.style.display = 'block'; el.textContent = rr.data.errors ? Object.values(rr.data.errors).join(' ') : (rr.data.error || 'Failed.'); return; }
    toast('Event updated.', 'success');
    location.hash = '#/events/' + id;
  };
  document.getElementById('btn-del').onclick = async () => {
    if (!await confirmDialog({ title: 'Delete this event?', body: 'Teams, projects and drafts will be removed. Events with submissions can only be archived.', confirmLabel: 'Delete', danger: true })) return;
    const rr = await api('/events/' + id, { method: 'DELETE' });
    if (!rr.ok) { toast(rr.data.error || 'Delete failed.', 'error'); return; }
    toast('Event deleted.', 'info');
    location.hash = '#/organizer/events';
  };
}

async function viewOrganizerTeams() {
  if (!requireOrganizer()) return;
  renderLoading();
  const r = await api('/organizer/teams');
  if (!r.ok) { render('<div class="alert error">Failed to load teams.</div>'); return; }
  render(crumbs([['Dashboard', '#/organizer'], ['Teams', null]]) + '<div class="page-head"><div><h1>Teams (' + r.data.length + ')</h1><p class="sub">Every team across your events.</p></div></div>' +
    (r.data.length ? '<div class="table-wrap"><table class="tbl"><thead><tr><th>Team</th><th>Event</th><th>Owner</th><th>Members</th><th>Projects</th><th>Created</th></tr></thead><tbody>' +
      r.data.map((t) => '<tr><td><b>' + esc(t.name) + '</b></td><td>' + esc(t.event_title || '') + '</td><td>' + esc(t.owner_name || '') + '</td><td>' + t.member_count + '</td><td>' + t.project_count + '</td><td>' + fmtDay(t.created_at) + '</td></tr>').join('') + '</tbody></table></div>'
      : emptyState('👥', 'No teams yet', 'Teams appear here once participants sign up for your events.', '<a class="btn btn-secondary" href="#/organizer/events">View events</a>')));
}

async function viewOrganizerProjects() {
  if (!requireOrganizer()) return;
  const params = new URLSearchParams((location.hash.split('?')[1] || ''));
  const status = params.get('status') || '';
  renderLoading();
  const r = await api('/organizer/projects' + (status ? '?status=' + status : ''));
  if (!r.ok) { render('<div class="alert error">Failed to load projects.</div>'); return; }
  render(crumbs([['Dashboard', '#/organizer'], ['Projects', null]]) + '<div class="page-head"><div><h1>Projects (' + r.data.length + ')</h1><p class="sub">Drafts and submissions across your events.</p></div>' +
    '<div class="page-actions"><a class="btn btn-secondary btn-sm" href="#/organizer/projects">All</a><a class="btn btn-secondary btn-sm" href="#/organizer/projects?status=draft">Drafts</a><a class="btn btn-secondary btn-sm" href="#/organizer/projects?status=submitted">Submitted</a></div></div>' +
    (r.data.length ? '<div class="table-wrap"><table class="tbl"><thead><tr><th>Project</th><th>Status</th><th>Team</th><th>Event</th><th>Track</th><th>Updated</th><th></th></tr></thead><tbody>' +
      r.data.map((p) => '<tr><td><b>' + esc(p.title) + '</b></td><td>' + badge(p.status) + '</td><td>' + esc(p.team_name || '') + '</td><td>' + esc(p.event_title || '') + '</td><td>' + esc(p.track_name || '—') + '</td><td>' + fmtDate(p.updated_at) + '</td>' +
        '<td>' + (p.status === 'submitted' ? '<a class="btn btn-secondary btn-sm" href="#/gallery/' + p.id + '">View →</a>' : '<span class="meta">draft</span>') + '</td></tr>').join('') + '</tbody></table></div>'
      : emptyState('🛠', 'No projects' + (status ? ' with status ' + status : '') + ' yet', 'Projects appear once teams start building.')));
}

async function viewOrganizerSubmissions() {
  if (!requireOrganizer()) return;
  renderLoading();
  const r = await api('/organizer/submissions?limit=50');
  if (!r.ok) { render('<div class="alert error">Failed to load submissions.</div>'); return; }
  const d = r.data;
  render(crumbs([['Dashboard', '#/organizer'], ['Submissions', null]]) + '<div class="page-head"><div><h1>Submissions (' + d.total + ')</h1><p class="sub">Everything shipped before the deadline, across all your events.</p></div>' +
    '<div class="page-actions"><button class="btn btn-secondary" id="btn-csv">Export CSV</button></div></div>' +
    (d.data.length ? '<div class="table-wrap"><table class="tbl"><thead><tr><th>Project</th><th>Team</th><th>Event</th><th>Track</th><th>By</th><th>Submitted at</th><th></th></tr></thead><tbody>' +
      d.data.map((s) => '<tr><td><b>' + esc(s.project_title) + '</b></td><td>' + esc(s.team_name) + '</td><td>' + esc(s.event_title) + '</td><td>' + esc(s.track_name || '—') + '</td><td>' + esc(s.submitted_by_name || '') + '</td><td>' + fmtDate(s.submitted_at) + '</td><td><a class="btn btn-secondary btn-sm" href="#/gallery/' + s.project_id + '">Open →</a></td></tr>').join('') + '</tbody></table></div>'
      : emptyState('📦', 'No submissions yet', 'Share your events with participants and watch this table fill up.')));
  const csv = document.getElementById('btn-csv');
  if (csv) csv.onclick = () => {
    const rows = [['project', 'team', 'event', 'track', 'submitted_by', 'submitted_at']].concat(d.data.map((s) => [s.project_title, s.team_name, s.event_title, s.track_name || '', s.submitted_by_name || '', s.submitted_at]));
    const text = rows.map((x) => x.map((c) => '"' + String(c || '').replace(/"/g, '""') + '"').join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
    a.download = 'dogfood-submissions.csv';
    a.click();
    toast('Submissions exported as CSV.', 'success');
  };
}

async function viewOrganizerSettings() {
  if (!requireOrganizer()) return;
  renderLoading('Loading your events…');
  const r = await api('/events?scope=all&limit=50');
  const list = r.ok ? r.data.data : [];
  const params = new URLSearchParams((location.hash.split('?')[1] || ''));
  const selected = params.get('event') || (list[0] ? String(list[0].id) : '');
  render(crumbs([['Dashboard', '#/organizer'], ['Settings', null]]) + '<div class="page-head"><div><h1>Event settings</h1><p class="sub">Dates, deadline, tracks, prizes, and visibility per event.</p></div></div>' +
    (list.length ? '<div class="card"><div class="field"><label>Event</label><select class="select" id="set-ev">' +
      list.map((e) => '<option value="' + e.id + '"' + (String(e.id) === selected ? ' selected' : '') + '>' + esc(e.title) + ' (' + esc(e.status) + ')</option>').join('') +
      '</select></div><div id="set-form"></div></div>'
      : emptyState('⚙️', 'No events yet', 'Create an event first.', '<a class="btn btn-primary" href="#/organizer/events/new">＋ New event</a>')));
  const sel = document.getElementById('set-ev');
  async function loadForm(id) {
    const box = document.getElementById('set-form');
    box.innerHTML = '<div class="loading-row"><span class="spinner dark"></span> Loading settings…</div>';
    const er = await api('/events/' + id);
    if (!er.ok) { box.innerHTML = '<div class="alert error">Failed to load event.</div>'; return; }
    const e = er.data;
    box.innerHTML = '<form id="f-set">' + eventFormHtml(e) + '<div class="field-error" id="set-err" style="display:none"></div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-primary" type="submit">Save settings</button>' +
      '<a class="btn btn-secondary" href="#/events/' + id + '">View public page</a>' +
      '<a class="btn btn-secondary" href="#/organizer/events/' + id + '/submissions">View submissions</a></div></form>';
    document.getElementById('f-set').onsubmit = async (ev2) => {
      ev2.preventDefault();
      const fd = new FormData(ev2.target);
      const body = { title: fd.get('title'), description: fd.get('description'), status: fd.get('status'), starts_at: new Date(fd.get('starts_at')).toISOString(), ends_at: new Date(fd.get('ends_at')).toISOString(), submission_deadline: new Date(fd.get('submission_deadline')).toISOString() };
      const rr = await api('/events/' + id, { method: 'PUT', body });
      if (!rr.ok) { const el = document.getElementById('set-err'); el.style.display = 'block'; el.textContent = rr.data.errors ? Object.values(rr.data.errors).join(' ') : (rr.data.error || 'Failed.'); return; }
      toast('Settings saved.', 'success');
    };
  }
  if (sel) {
    sel.onchange = () => { location.hash = '#/organizer/settings?event=' + sel.value; };
    if (selected) loadForm(selected);
  }
}

async function viewEventSubmissions(id) {
  if (!requireOrganizer()) return;
  renderLoading();
  const r = await api('/events/' + id + '/submissions?limit=50');
  if (!r.ok) { render('<div class="alert error">' + esc(r.data.error || 'Failed to load.') + '</div>'); return; }
  const d = r.data;
  render(crumbs([['Events', '#/organizer/events'], ['Submissions', null]]) + '<div class="page-head"><div><h1>Submissions (' + d.total + ')</h1><p class="sub">Everyone who shipped before the deadline.</p></div>' +
    '<div class="page-actions"><button class="btn btn-secondary" id="btn-csv">Export CSV</button></div></div>' +
    (d.data.length ? '<div class="table-wrap" id="sub-tbl"><table class="tbl"><thead><tr><th>Project</th><th>Team</th><th>Track</th><th>By</th><th>Submitted at</th><th></th></tr></thead><tbody>' +
      d.data.map((s) => '<tr><td><b>' + esc(s.project_title) + '</b></td><td>' + esc(s.team_name) + '</td><td>' + esc(s.track_name || '—') + '</td><td>' + esc(s.submitted_by_name || '') + '</td><td>' + fmtDate(s.submitted_at) + '</td><td><a class="btn btn-secondary btn-sm" href="#/gallery/' + s.project_id + '">Open →</a></td></tr>').join('') + '</tbody></table></div>'
      : emptyState('📦', 'No submissions yet', 'Share the event with participants and watch this table fill up.')));
  const csv = document.getElementById('btn-csv');
  if (csv) csv.onclick = () => {
    const rows = [['project', 'team', 'track', 'submitted_by', 'submitted_at']].concat(d.data.map((s) => [s.project_title, s.team_name, s.track_name || '', s.submitted_by_name || '', s.submitted_at]));
    const text = rows.map((r) => r.map((c) => '"' + String(c || '').replace(/"/g, '""') + '"').join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
    a.download = 'submissions-event-' + id + '.csv';
    a.click();
    toast('CSV exported (Tier 1 basic export). Full judging CSV arrives in Tier 2.', 'success');
  };
}

async function viewEventTeams(id) {
  if (!requireOrganizer()) return;
  renderLoading();
  const r = await api('/events/' + id + '/teams');
  if (!r.ok) { render('<div class="alert error">' + esc(r.data.error || 'Failed.') + '</div>'); return; }
  render(crumbs([['Events', '#/organizer/events'], ['Teams', null]]) + '<div class="page-head"><div><h1>Teams (' + r.data.length + ')</h1></div></div>' +
    (r.data.length ? '<div class="table-wrap"><table class="tbl"><thead><tr><th>Team</th><th>Owner</th><th>Members</th><th>Projects</th><th>Created</th></tr></thead><tbody>' +
      r.data.map((t) => '<tr><td><b>' + esc(t.name) + '</b></td><td>' + esc(t.owner_name || '') + '</td><td>' + t.member_count + '</td><td>' + t.project_count + '</td><td>' + fmtDay(t.created_at) + '</td></tr>').join('') + '</tbody></table></div>'
      : emptyState('👥', 'No teams yet', 'Teams appear here once participants sign up.')));
}

/* ---------------- judge workspace (Tier 2) ---------------- */
function requireJudge() {
  if (!App.user) { location.hash = '#/login'; return false; }
  if (!['judge', 'admin'].includes(App.user.role)) { location.hash = '#/dashboard'; return false; }
  return true;
}

async function viewJudging() {
  if (!requireJudge()) return;
  renderLoading('Loading your assignments…');
  const params = new URLSearchParams((location.hash.split('?')[1] || ''));
  const f = params.get('status') || '';
  const r = await api('/judging/mine' + (f ? '?status=' + f : ''));
  if (!r.ok) { render('<div class="alert error">' + esc(r.data.error || 'Failed to load.') + '</div>'); return; }
  const d = r.data;
  const pct = d.assigned ? Math.round((d.completed / d.assigned) * 100) : 0;
  render('<div class="page-head"><div><h1>Judging dashboard</h1><p class="sub">Projects assigned to you. Score them against the event rubric.</p></div>' +
    '<div class="page-actions"><a class="btn btn-secondary btn-sm" href="#/judging">All</a><a class="btn btn-secondary btn-sm" href="#/judging?status=pending">Pending</a><a class="btn btn-secondary btn-sm" href="#/judging?status=submitted">Submitted</a></div></div>' +
    '<div class="grid cols-3"><div class="card stat-card"><span class="lbl">Assigned</span><span class="num">' + d.assigned + '</span></div>' +
    '<div class="card stat-card"><span class="lbl">Completed</span><span class="num">' + d.completed + '</span></div>' +
    '<div class="card"><span class="lbl">Progress</span><div class="progress" style="margin-top:10px"><div style="width:' + pct + '%"></div></div><p class="meta">' + pct + '% · ' + d.remaining + ' remaining</p></div></div>' +
    '<div style="height:16px"></div>' +
    (d.data.length ? '<div class="table-wrap"><table class="tbl"><thead><tr><th>Project</th><th>Event</th><th>Type</th><th>Status</th><th>Score</th><th></th></tr></thead><tbody>' +
      d.data.map((a) => '<tr><td><b>' + esc(a.project_title) + '</b><br><span class="meta">👥 ' + esc(a.team_name || '') + (a.track_name ? ' · ' + esc(a.track_name) : '') + '</span></td>' +
        '<td>' + esc(a.event_title || '') + '</td><td>' + (a.kind === 'calibration' ? '<span class="badge track">calibration</span>' : '<span class="badge">normal</span>') + '</td>' +
        '<td>' + badge(a.status) + '</td><td>' + (a.raw_total !== null && a.raw_total !== undefined ? a.raw_total : '—') + '</td>' +
        '<td><a class="btn btn-primary btn-sm" href="#/judging/evaluate/' + a.id + '">' + (a.status === 'submitted' ? 'Review →' : 'Evaluate →') + '</a></td></tr>').join('') + '</tbody></table></div>'
      : emptyState('⚖️', f === 'pending' ? 'Nothing pending' : 'No assignments yet', 'An organizer will assign submitted projects to you. Check back soon.')));
}

async function viewJudgeEvaluate(assignmentId) {
  if (!requireJudge()) return;
  renderLoading();
  const r = await api('/judging/assignments/' + assignmentId);
  if (!r.ok) { render(emptyState('🔒', 'Assignment unavailable', r.data.error || 'Only the assigned judge can open this.')); return; }
  const a = r.data;
  const rubric = a.rubric;
  const ev = a.evaluation || {};
  const submitted = ev.status === 'submitted';
  const scores = ev.scores || {};
  const suspended = a.judge_status === 'suspended' || a.judge_status === 'completed';
  render(crumbs([['Judging', '#/judging'], [a.project_title, null]]) + '<div class="page-head"><div>' +
    '<div style="display:flex;gap:8px;align-items:center">' + badge(a.status) + (a.kind === 'calibration' ? '<span class="badge track">shared calibration project</span>' : '') + '</div>' +
    '<h1>' + esc(a.project_title) + '</h1><p class="sub">👥 ' + esc(a.team_name || '') + ' · 📅 ' + esc(a.event_title || '') + (a.track_name ? ' · ' + esc(a.track_name) : '') + '</p></div></div>' +
    (submitted ? '<div class="alert success">✅ Submitted' + (ev.submitted_at ? ' on ' + fmtDate(ev.submitted_at) : '') + ' · raw total <b>' + ev.raw_total + '</b>. Locked — ask an organizer to reopen if a correction is needed.</div>' : '') +
    (suspended ? '<div class="alert warn">Your judging access for this event is <b>' + esc(a.judge_status) + '</b> — scoring is read-only.</div>' : '') +
    '<div class="grid cols-3"><div class="card" style="grid-column: span 2"><h3>Submission under review</h3>' +
    '<p style="white-space:pre-wrap">' + esc(a.project_description || '') + '</p>' +
    '<h3 style="margin-top:14px">Links</h3><ul class="link-list">' + (a.links || []).map((l) => '<li><a class="pill" href="' + esc(l.url) + '" target="_blank" rel="noopener">🔗 ' + esc(l.label || 'Link') + '</a></li>').join('') + '</ul></div>' +
    '<div class="card"><h3>' + esc(rubric ? rubric.title : 'Rubric') + ' <span class="meta">v' + (rubric ? rubric.version : '?') + '</span></h3>' +
    (rubric ? '<form id="f-eval">' + rubric.criteria.map((c) =>
      '<div class="field"><label>' + esc(c.label) + ' <span class="hint">— 0 to ' + c.max_score + (c.weight !== 1 ? ' × weight ' + c.weight : '') + (c.required ? '' : ' (optional)') + '</span></label>' +
      (c.description ? '<div class="hint" style="margin-bottom:6px">' + esc(c.description) + '</div>' : '') +
      '<input class="input" type="number" min="0" max="' + c.max_score + '" step="any" name="crit_' + c.id + '" value="' + esc(scores[c.id] ?? scores[String(c.id)] ?? '') + '" ' + ((submitted || suspended) ? 'disabled' : 'required') + '></div>').join('') +
      '<div class="field"><label>Feedback for the team <span class="hint">(optional)</span></label><textarea class="textarea" name="feedback" style="min-height:70px" ' + ((submitted || suspended) ? 'disabled' : '') + '>' + esc(ev.feedback || '') + '</textarea></div>' +
      '<div class="field-error" id="ev-err" style="display:none"></div>' +
      ((submitted || suspended) ? '<p class="meta">Raw total: <b>' + ev.raw_total + '</b></p>'
        : '<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-secondary" type="submit" name="mode" value="draft">Save draft</button><button class="btn btn-primary" type="submit" name="mode" value="submit">Submit evaluation</button></div>') +
      '</form>' : '<div class="alert warn">No rubric configured for this event yet.</div>') + '</div></div>');
  const f = document.getElementById('f-eval');
  if (f) f.onsubmit = async (e) => {
    e.preventDefault();
    const mode = (e.submitter && e.submitter.value) || 'draft';
    const fd = new FormData(f);
    const sc = {};
    (rubric.criteria || []).forEach((c) => {
      const v = fd.get('crit_' + c.id);
      if (v !== null && v !== '') sc[c.id] = Number(v);
    });
    if (mode === 'submit' && !await confirmDialog({ title: 'Submit evaluation?', body: 'Scores lock after submission. The total is calculated on the server.', confirmLabel: 'Submit' })) return;
    const rr = await api('/judging/evaluations/assignment/' + assignmentId, {
      method: 'PUT', body: { scores: sc, feedback: fd.get('feedback'), submit: mode === 'submit' },
    });
    if (!rr.ok) {
      const el = document.getElementById('ev-err');
      el.style.display = 'block';
      el.textContent = (rr.data.error || 'Save failed.') + (rr.data.details ? ' ' + rr.data.details.join(' ') : '');
      return;
    }
    toast(mode === 'submit' ? 'Evaluation submitted. Raw total: ' + rr.body.raw_total : 'Draft saved.', mode === 'submit' ? 'success' : 'info');
    viewJudgeEvaluate(assignmentId);
  };
}

function requireAdmin() {
  if (!App.user) { location.hash = '#/login'; return false; }
  if (App.user.role !== 'admin') { location.hash = '#/dashboard'; return false; }
  return true;
}

async function viewAdmin() {
  if (!requireAdmin()) return;
  renderLoading();
  const r = await api('/admin/system/overview');
  const o = r.ok ? r.data : {};
  render('<div class="page-head"><div><h1>Admin dashboard</h1><p class="sub">Users, events, and system health.</p></div><div class="page-actions"><a class="btn btn-secondary" href="#/admin/users">Manage users</a></div></div>' +
    '<div class="grid cols-4">' +
    [['Users', o.users || 0], ['Events', o.events || 0], ['Teams', o.teams || 0], ['Submissions', o.submissions || 0]].map(([l, n]) => '<div class="card stat-card"><span class="lbl">' + l + '</span><span class="num">' + n + '</span></div>').join('') + '</div>' +
    '<div style="height:16px"></div><div class="card"><h3>System</h3><dl class="kv"><dt>Backend</dt><dd>Tier 2 · healthy</dd><dt>Judging</dt><dd>implemented (rubrics, assignments, calibration, results)</dd><dt>Version</dt><dd>' + esc(o.version || '2.0.0-tier2') + '</dd></dl></div>');
}

async function viewAdminUsers() {
  if (!requireAdmin()) return;
  let q = '';
  async function load() {
    const box = document.getElementById('u-list');
    box.innerHTML = '<div class="loading-row"><span class="spinner dark"></span> Loading users…</div>';
    const r = await api('/admin/users?limit=50&q=' + encodeURIComponent(q));
    if (!r.ok) { box.innerHTML = '<div class="alert error">Failed to load users.</div>'; return; }
    box.innerHTML = '<div class="table-wrap"><table class="tbl"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Joined</th><th></th></tr></thead><tbody>' +
      r.data.data.map((u) => '<tr><td><b>' + esc(u.name) + '</b></td><td>' + esc(u.email) + '</td><td><span class="role-badge">' + esc(u.role) + '</span></td><td>' + fmtDay(u.created_at) + '</td>' +
        '<td><select class="select" data-role-for="' + u.id + '" style="max-width:150px">' + ['participant', 'organizer', 'judge', 'admin'].map((rl) => '<option value="' + rl + '"' + (u.role === rl ? ' selected' : '') + '>' + rl + '</option>').join('') + '</select></td></tr>').join('') + '</tbody></table></div>';
    box.querySelectorAll('[data-role-for]').forEach((sel) => {
      sel.onchange = async () => {
        const rr = await api('/admin/users/' + sel.dataset.roleFor + '/role', { method: 'PUT', body: { role: sel.value } });
        if (rr.ok) toast('Role updated.', 'success');
        else { toast(rr.data.error || 'Failed.', 'error'); load(); }
      };
    });
  }
  render(crumbs([['Dashboard', '#/admin'], ['Users', null]]) + '<div class="page-head"><div><h1>Users</h1></div></div>' +
    '<div class="searchbar"><input class="input" id="u-q" placeholder="🔍 Search name or email…"><button class="btn btn-primary" id="u-go">Search</button></div><div id="u-list"></div>');
  document.getElementById('u-go').onclick = () => { q = document.getElementById('u-q').value; load(); };
  load();
}

async function viewAdminEvents() {
  if (!requireAdmin()) return;
  renderLoading();
  const r = await api('/events?scope=all&limit=50');
  const list = r.ok ? r.data.data : [];
  render(crumbs([['Dashboard', '#/admin'], ['Events', null]]) + '<div class="page-head"><div><h1>All events</h1></div></div>' +
    (list.length ? '<div class="table-wrap"><table class="tbl"><thead><tr><th>Event</th><th>Status</th><th>Deadline</th><th></th></tr></thead><tbody>' +
      list.map((e) => '<tr><td><b>' + esc(e.title) + '</b></td><td>' + badge(e.status) + '</td><td>' + fmtDate(e.submission_deadline) + '</td><td><a class="btn btn-secondary btn-sm" href="#/events/' + e.id + '">Open →</a></td></tr>').join('') + '</tbody></table></div>'
      : '<p class="meta">No events.</p>'));
}

async function viewAdminSystem() {
  if (!requireAdmin()) return;
  renderLoading();
  const [h, o] = await Promise.all([api('/health'), api('/admin/system/overview')]);
  render(crumbs([['Dashboard', '#/admin'], ['System', null]]) + '<div class="page-head"><div><h1>System</h1></div></div>' +
    '<div class="grid cols-2"><div class="card"><h3>Health</h3><p>' + (h.ok ? '✅ API reachable · database connected' : '❌ API/DB problem') + '</p><dl class="kv"><dt>Time</dt><dd>' + esc((h.data && h.data.time) || '—') + '</dd></dl></div>' +
    '<div class="card"><h3>Future tiers</h3><ul class="checklist"><li>⚖️<div><b>Judging (Tier 2)</b> — placeholder routes return <code class="inline">501</code>. See JUDGING.md.</div></li><li>💬<div><b>Community (Tier 3)</b> — votes/comments/audit tables planned.</div></li><li>🔌<div><b>Platform (Tier 4)</b> — webhooks/certificates/embeds planned.</div></li></ul></div></div>');
}

/* ---------------- organizer judging (Tier 2) ---------------- */
async function judgingEventPicker(selected) {
  const r = await api('/events?scope=all&limit=50');
  const list = r.ok ? r.data.data : [];
  return { list, html: '<select class="select" id="j-ev" style="max-width:280px">' + (list.length ? '' : '<option value="">No events</option>') +
    list.map((e) => '<option value="' + e.id + '"' + (String(e.id) === String(selected) ? ' selected' : '') + '>' + esc(e.title) + ' (' + esc(e.status) + ')</option>').join('') + '</select>' };
}

function downloadBlob(text, filename, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

async function viewJudgingJudges() {
  if (!requireOrganizer()) return;
  const params = new URLSearchParams((location.hash.split('?')[1] || ''));
  const { list, html } = await judgingEventPicker(params.get('event'));
  const eventId = params.get('event') || (list[0] ? list[0].id : '');
  render(crumbs([['Dashboard', '#/organizer'], ['Judges', null]]) + '<div class="page-head"><div><h1>Judge management</h1><p class="sub">Invite judges, track status (invited → active → suspended/completed).</p></div></div>' +
    '<div class="card"><div class="field"><label>Event</label>' + html + '</div><div id="j-body"></div></div>');
  const sel = document.getElementById('j-ev');
  async function load(id) {
    const box = document.getElementById('j-body');
    if (!id) { box.innerHTML = '<p class="meta">Create an event first.</p>'; return; }
    box.innerHTML = '<div class="loading-row"><span class="spinner dark"></span> Loading judges…</div>';
    const r = await api('/judging/events/' + id + '/judges');
    if (!r.ok) { box.innerHTML = '<div class="alert error">' + esc(r.data.error || 'Failed.') + '</div>'; return; }
    box.innerHTML = (r.rows || r.data).length ? '<div class="table-wrap"><table class="tbl"><thead><tr><th>Judge</th><th>Email</th><th>Status</th><th></th></tr></thead><tbody>' +
      r.data.map((j) => '<tr><td><b>' + esc(j.name) + '</b></td><td>' + esc(j.email) + '</td><td>' + badge(j.status) + '</td>' +
        '<td style="white-space:nowrap"><select class="select" data-jstatus="' + j.id + '" style="max-width:150px">' + ['invited', 'active', 'suspended', 'completed'].map((s) => '<option value="' + s + '"' + (j.status === s ? ' selected' : '') + '>' + s + '</option>').join('') + '</select> ' +
        '<button class="btn btn-ghost btn-sm" data-jdel="' + j.id + '">Remove</button></td></tr>').join('') + '</tbody></table></div>'
      : emptyState('⚖️', 'No judges yet', 'Invite judges by email — new accounts are created automatically.');
    box.innerHTML += '<div style="height:14px"></div><h3>Invite a judge</h3><form id="f-inv"><div class="form-row">' +
      '<div class="field"><label>Name</label><input class="input" name="name" required minlength="2" placeholder="Jordan Judge"></div>' +
      '<div class="field"><label>Email</label><input class="input" name="email" type="email" required placeholder="judge@example.com"></div></div>' +
      '<div class="field"><label>Password <span class="hint">(optional — a secure temp password is generated otherwise)</span></label><input class="input" name="password" type="text" placeholder="leave blank to auto-generate"></div>' +
      '<div class="field-error" id="j-err" style="display:none"></div><button class="btn btn-primary" type="submit">Send invitation</button></form>';
    box.querySelectorAll('[data-jstatus]').forEach((s) => {
      s.onchange = async () => {
        const rr = await api('/judging/judges/' + s.dataset.jstatus + '/status', { method: 'PUT', body: { status: s.value } });
        if (rr.ok) toast('Judge status → ' + s.value, 'success');
        else { toast(rr.data.error || 'Failed.', 'error'); load(id); }
      };
    });
    box.querySelectorAll('[data-jdel]').forEach((b) => {
      b.onclick = async () => {
        if (!await confirmDialog({ title: 'Remove judge?', body: 'Only possible while they have no submitted evaluations.', confirmLabel: 'Remove', danger: true })) return;
        const rr = await api('/judging/judges/' + b.dataset.jdel, { method: 'DELETE' });
        if (rr.ok) { toast('Judge removed.', 'info'); load(id); }
        else toast(rr.data.error || 'Failed.', 'error');
      };
    });
    document.getElementById('f-inv').onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const rr = await api('/judging/events/' + id + '/judges', { method: 'POST', body: { name: fd.get('name'), email: fd.get('email'), password: fd.get('password') || undefined } });
      if (!rr.ok) { const el = document.getElementById('j-err'); el.style.display = 'block'; el.textContent = rr.data.error || 'Invite failed.'; return; }
      toast('Judge invited: ' + rr.data.user.email + (rr.data.temp_password ? ' (temp password: ' + rr.data.temp_password + ')' : ''), 'success', 8000);
      load(id);
    };
  }
  sel.onchange = () => { location.hash = '#/organizer/judging/judges?event=' + sel.value; };
  load(eventId);
}

async function viewJudgingAssignments() {
  if (!requireOrganizer()) return;
  const params = new URLSearchParams((location.hash.split('?')[1] || ''));
  const { list, html } = await judgingEventPicker(params.get('event'));
  const eventId = params.get('event') || (list[0] ? list[0].id : '');
  render(crumbs([['Dashboard', '#/organizer'], ['Assignments', null]]) + '<div class="page-head"><div><h1>Assignments</h1><p class="sub">Manual or deterministic batch assignment of submitted projects to judges.</p></div></div>' +
    '<div class="card"><div class="field"><label>Event</label>' + html + '</div><div id="a-body"></div></div>');
  const sel = document.getElementById('j-ev');
  async function load(id) {
    const box = document.getElementById('a-body');
    if (!id) { box.innerHTML = '<p class="meta">Create an event first.</p>'; return; }
    const [judges, projs, table] = await Promise.all([
      api('/judging/events/' + id + '/judges'),
      api('/organizer/projects?status=submitted'),
      api('/judging/events/' + id + '/assignments?limit=50'),
    ]);
    const jl = judges.ok ? judges.data : [];
    const pl = (projs.ok ? projs.data : []).filter((p) => String(p.event_id) === String(id) || p.event_title);
    const rows = table.ok ? table.data.data : [];
    box.innerHTML =
      '<h3>Batch assignment</h3><form id="f-batch"><div class="form-row">' +
      '<div class="field"><label>Coverage <span class="hint">(judges per project)</span></label><input class="input" type="number" name="coverage" value="2" min="1" max="20"></div>' +
      '<div class="field"><label>Max load <span class="hint">(per judge, blank = unlimited)</span></label><input class="input" type="number" name="max_load" min="1" placeholder="—"></div></div>' +
      '<div class="field"><label>Seed <span class="hint">(deterministic shuffle; default = event id)</span></label><input class="input" type="number" name="seed" placeholder="' + esc(String(id)) + '"></div>' +
      '<button class="btn btn-primary" type="submit">Run batch assignment</button> <span class="meta" id="batch-msg"></span></form>' +
      '<div style="height:16px"></div><h3>Manual assignment</h3><form id="f-man"><div class="form-row">' +
      '<div class="field"><label>Judge</label><select class="select" name="judge_id">' + jl.map((j) => '<option value="' + j.user_id + '">' + esc(j.name) + ' (' + esc(j.status) + ')</option>').join('') + '</select></div>' +
      '<div class="field"><label>Projects</label><div style="max-height:160px;overflow:auto;border:1px solid var(--line);border-radius:10px;padding:8px">' +
      (pl.filter((p) => !p.event_id || String(p.event_id) === String(id)).map((p) => '<label style="display:block;font-weight:400;font-size:13.5px"><input type="checkbox" name="pid" value="' + p.id + '"> ' + esc(p.title) + ' <span class="meta">(' + esc(p.team_name || '') + ')</span></label>').join('') || '<span class="meta">No submitted projects.</span>') + '</div></div></div>' +
      '<button class="btn btn-secondary" type="submit">Assign selected</button> <span class="meta" id="man-msg"></span></form>' +
      '<div style="height:16px"></div><h3>Current assignments (' + (table.ok ? table.data.total : 0) + ')</h3>' +
      (rows.length ? '<div class="table-wrap"><table class="tbl"><thead><tr><th>Judge</th><th>Project</th><th>Type</th><th>Status</th><th>Score</th><th></th></tr></thead><tbody>' +
        rows.map((a) => '<tr><td>' + esc(a.judge_name) + '</td><td><b>' + esc(a.project_title) + '</b><br><span class="meta">' + esc(a.team_name || '') + '</span></td>' +
          '<td>' + (a.kind === 'calibration' ? '<span class="badge track">calibration</span>' : '<span class="badge">normal</span>') + '</td><td>' + badge(a.status) + '</td><td>' + (a.raw_total ?? '—') + '</td>' +
          '<td><button class="btn btn-ghost btn-sm" data-adel="' + a.id + '">Remove</button></td></tr>').join('') + '</tbody></table></div>' : '<p class="meta">No assignments yet.</p>');
    document.getElementById('f-batch').onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const msg = document.getElementById('batch-msg');
      msg.textContent = 'Running…';
      const rr = await api('/judging/events/' + id + '/assignments/batch', { method: 'POST', body: {
        coverage: parseInt(fd.get('coverage'), 10) || 2,
        max_load: fd.get('max_load') ? parseInt(fd.get('max_load'), 10) : undefined,
        seed: fd.get('seed') ? parseInt(fd.get('seed'), 10) : undefined,
      } });
      if (!rr.ok) { msg.textContent = ''; toast(rr.data.error || 'Batch failed.', 'error'); return; }
      toast(`Batch done: ${rr.body.created} created, ${rr.body.skipped_existing} already existed.`, 'success');
      load(id);
    };
    document.getElementById('f-man').onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const pids = fd.getAll('pid').map((x) => parseInt(x, 10));
      if (!pids.length) { toast('Select at least one project.', 'error'); return; }
      const rr = await api('/judging/events/' + id + '/assignments', { method: 'POST', body: { judge_id: parseInt(fd.get('judge_id'), 10), project_ids: pids } });
      if (!rr.ok) { toast(rr.data.error || 'Assign failed.', 'error'); return; }
      toast(`Assigned: ${rr.body.created} new${rr.body.skipped.length ? `, ${rr.body.skipped.length} duplicates skipped` : ''}.`, 'success');
      load(id);
    };
    box.querySelectorAll('[data-adel]').forEach((b) => {
      b.onclick = async () => {
        if (!await confirmDialog({ title: 'Remove assignment?', body: 'Submitted evaluations block removal.', confirmLabel: 'Remove', danger: true })) return;
        const rr = await api('/judging/assignments/' + b.dataset.adel, { method: 'DELETE' });
        if (rr.ok) { toast('Assignment removed.', 'info'); load(id); }
        else toast(rr.data.error || 'Failed.', 'error');
      };
    });
  }
  sel.onchange = () => { location.hash = '#/organizer/judging/assignments?event=' + sel.value; };
  load(eventId);
}

async function viewJudgingRubric() {
  if (!requireOrganizer()) return;
  const params = new URLSearchParams((location.hash.split('?')[1] || ''));
  const { list, html } = await judgingEventPicker(params.get('event'));
  const eventId = params.get('event') || (list[0] ? list[0].id : '');
  render(crumbs([['Dashboard', '#/organizer'], ['Rubric', null]]) + '<div class="page-head"><div><h1>Judging rubric</h1><p class="sub">Configurable criteria. Totals are always calculated on the server.</p></div></div>' +
    '<div class="card"><div class="field"><label>Event</label>' + html + '</div><div id="r-body"></div></div>');
  const sel = document.getElementById('j-ev');
  const rowHtml = (c = {}) => '<div class="form-row" data-crow><div class="field"><label>Label</label><input class="input" name="label" value="' + esc(c.label || '') + '" required></div>' +
    '<div class="field"><label>Max score</label><input class="input" type="number" name="max_score" value="' + esc(c.max_score ?? 25) + '" min="0.5" step="any" required></div></div>' +
    '<div class="form-row" data-crow2><div class="field"><label>Weight</label><input class="input" type="number" name="weight" value="' + esc(c.weight ?? 1) + '" min="0" step="any"></div>' +
    '<div class="field"><label>Options</label><div><label style="font-weight:400"><input type="checkbox" name="required" ' + (c.required === false ? '' : 'checked') + '> Required</label> ' +
    '<input class="input" name="description" placeholder="Description (optional)" value="' + esc(c.description || '') + '" style="margin-top:6px"></div></div></div><hr style="border:none;border-top:1px solid var(--line)">';
  async function load(id) {
    const box = document.getElementById('r-body');
    if (!id) { box.innerHTML = '<p class="meta">Create an event first.</p>'; return; }
    const cur = await api('/judging/events/' + id + '/rubric');
    const has = cur.ok;
    box.innerHTML = (has ? '<div class="alert info">Active rubric: <b>' + esc(cur.data.title) + '</b> (v' + cur.data.version + ', ' + cur.data.criteria.length + ' criteria). Saving below creates v' + (cur.data.version + 1) + ' and deactivates this one.</div>'
      : '<div class="alert warn">No rubric configured yet — judges cannot score until you save one.</div>') +
      '<form id="f-rub"><div class="field"><label>Rubric title</label><input class="input" name="title" required minlength="3" value="' + esc(has ? cur.data.title : 'Standard 100') + '"></div>' +
      '<div id="crits">' + (has ? cur.data.criteria.map(rowHtml).join('') : rowHtml({ label: 'Innovation' }) + rowHtml({ label: 'Technical Implementation' }) + rowHtml({ label: 'Impact' }) + rowHtml({ label: 'Presentation' })) + '</div>' +
      '<div style="display:flex;gap:8px;margin:8px 0"><button class="btn btn-secondary btn-sm" type="button" id="crit-add">＋ Add criterion</button></div>' +
      '<div class="field-error" id="r-err" style="display:none"></div><button class="btn btn-primary" type="submit">Save rubric</button></form>';
    document.getElementById('crit-add').onclick = () => {
      const d = document.createElement('div');
      d.innerHTML = rowHtml({});
      document.getElementById('crits').appendChild(d);
    };
    document.getElementById('f-rub').onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const labels = fd.getAll('label'), maxs = fd.getAll('max_score'), weights = fd.getAll('weight'), reqs = e.target.querySelectorAll('[name=required]'), descs = fd.getAll('description');
      const criteria = labels.map((label, i) => ({ label, max_score: Number(maxs[i]), weight: Number(weights[i]), required: reqs[i] ? reqs[i].checked : true, description: descs[i] || '' }));
      const rr = await api('/judging/events/' + id + '/rubrics', { method: 'POST', body: { title: fd.get('title'), criteria } });
      if (!rr.ok) { const el = document.getElementById('r-err'); el.style.display = 'block'; el.textContent = rr.data.error || 'Save failed.'; return; }
      toast('Rubric v' + rr.data.version + ' activated.', 'success');
      load(id);
    };
  }
  sel.onchange = () => { location.hash = '#/organizer/judging/rubric?event=' + sel.value; };
  load(eventId);
}

async function viewJudgingProgress() {
  if (!requireOrganizer()) return;
  const params = new URLSearchParams((location.hash.split('?')[1] || ''));
  const { list, html } = await judgingEventPicker(params.get('event'));
  const eventId = params.get('event') || (list[0] ? list[0].id : '');
  render(crumbs([['Dashboard', '#/organizer'], ['Judge progress', null]]) + '<div class="page-head"><div><h1>Judge progress</h1><p class="sub">Completion and raw-score ranges per judge (organizer-only).</p></div></div>' +
    '<div class="card"><div class="field"><label>Event</label>' + html + '</div><div id="p-body"></div></div>');
  const sel = document.getElementById('j-ev');
  async function load(id) {
    const box = document.getElementById('p-body');
    if (!id) { box.innerHTML = '<p class="meta">Create an event first.</p>'; return; }
    box.innerHTML = '<div class="loading-row"><span class="spinner dark"></span> Loading…</div>';
    const r = await api('/judging/events/' + id + '/progress');
    if (!r.ok) { box.innerHTML = '<div class="alert error">' + esc(r.data.error || 'Failed.') + '</div>'; return; }
    box.innerHTML = r.data.length ? '<div class="table-wrap"><table class="tbl"><thead><tr><th>Judge</th><th>Status</th><th>Done</th><th>Progress</th><th>Avg</th><th>Min</th><th>Max</th></tr></thead><tbody>' +
      r.data.map((j) => '<tr><td><b>' + esc(j.name) + '</b><br><span class="meta">' + esc(j.email) + '</span></td><td>' + badge(j.status) + '</td>' +
        '<td>' + j.completed + ' / ' + j.assigned + '</td><td style="min-width:140px"><div class="progress"><div style="width:' + j.pct + '%"></div></div><span class="meta">' + j.pct + '%</span></td>' +
        '<td>' + (j.avg_raw !== null ? Math.round(j.avg_raw * 100) / 100 : '—') + '</td><td>' + (j.min_raw ?? '—') + '</td><td>' + (j.max_raw ?? '—') + '</td></tr>').join('') + '</tbody></table></div>'
      : emptyState('📊', 'No judges on roster', 'Invite judges first.');
  }
  sel.onchange = () => { location.hash = '#/organizer/judging/progress?event=' + sel.value; };
  load(eventId);
}

async function viewJudgingCalibration() {
  if (!requireOrganizer()) return;
  const params = new URLSearchParams((location.hash.split('?')[1] || ''));
  const { list, html } = await judgingEventPicker(params.get('event'));
  const eventId = params.get('event') || (list[0] ? list[0].id : '');
  const runSel = params.get('run') || '';
  render(crumbs([['Dashboard', '#/organizer'], ['Calibration', null]]) + '<div class="page-head"><div><h1>Calibration</h1><p class="sub">Shared projects → two-point linear normalization onto a reference judge’s scale.</p></div></div>' +
    '<div class="card"><div class="field"><label>Event</label>' + html + '</div><div id="c-body"></div></div>');
  const sel = document.getElementById('j-ev');
  async function load(id) {
    const box = document.getElementById('c-body');
    if (!id) { box.innerHTML = '<p class="meta">Create an event first.</p>'; return; }
    const [judges, runs] = await Promise.all([
      api('/judging/events/' + id + '/judges'),
      api('/judging/events/' + id + '/calibration/runs'),
    ]);
    const jl = judges.ok ? judges.data : [];
    const rl = runs.ok ? runs.data : [];
    const cur = runSel ? rl.find((x) => String(x.id) === runSel) : rl[0];
    box.innerHTML =
      '<h3>Start a calibration run</h3><form id="f-run"><div class="form-row">' +
      '<div class="field"><label>Reference judge</label><select class="select" name="reference_judge_id">' + jl.map((j) => '<option value="' + j.user_id + '">' + esc(j.name) + '</option>').join('') + '</select></div>' +
      '<div class="field"><label>Mode</label><select class="select" name="mode"><option value="ONE_LOW_ONE_HIGH">One low + one high (default)</option><option value="TWO_LOW_ONE_HIGH">Two low + one high</option><option value="ONE_LOW_TWO_HIGH">One low + two high</option><option value="TWO_LOW_TWO_HIGH">Two low + two high</option></select></div></div>' +
      '<button class="btn btn-primary" type="submit">Start run</button></form>' +
      '<div style="height:14px"></div><h3>Runs</h3>' +
      (rl.length ? '<div class="table-wrap"><table class="tbl"><thead><tr><th>v</th><th>Reference</th><th>Mode</th><th>Status</th><th>Calibrations</th><th>Normalized</th><th></th></tr></thead><tbody>' +
        rl.map((x) => '<tr><td>v' + x.version + '</td><td>' + esc(x.reference_judge_name) + '</td><td><code class="inline">' + esc(x.mode) + '</code></td><td>' + badge(x.status) + '</td><td>' + x.calibrations + '</td><td>' + x.normalized + '</td>' +
          '<td><a class="btn btn-secondary btn-sm" href="#/organizer/judging/calibration?event=' + id + '&run=' + x.id + '">Open →</a></td></tr>').join('') + '</tbody></table></div>' : '<p class="meta">No runs yet.</p>') +
      '<div id="run-detail" style="margin-top:14px"></div>';
    document.getElementById('f-run').onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const rr = await api('/judging/events/' + id + '/calibration/runs', { method: 'POST', body: { reference_judge_id: parseInt(fd.get('reference_judge_id'), 10), mode: fd.get('mode') } });
      if (!rr.ok) { toast(rr.data.error || 'Failed.', 'error'); return; }
      toast('Calibration run v' + rr.body.version + ' started.', 'success');
      location.hash = '#/organizer/judging/calibration?event=' + id + '&run=' + rr.body.id;
    };
    if (cur) loadRun(id, cur.id);
  }
  async function loadRun(eventId2, runId) {
    const box = document.getElementById('run-detail');
    box.innerHTML = '<div class="loading-row"><span class="spinner dark"></span> Loading run…</div>';
    const r = await api('/judging/calibration/runs/' + runId);
    if (!r.ok) { box.innerHTML = '<div class="alert error">' + esc(r.data.error || 'Failed.') + '</div>'; return; }
    const { run, calibrations, counts } = r.data;
    const pros = await api('/organizer/projects?status=submitted');
    const pl = (pros.ok ? pros.data : []).filter((p) => !p.event_id || String(p.event_id) === String(eventId2)).slice(0, 200);
    box.innerHTML = '<h3>Run v' + run.version + ' → ' + esc(run.reference_judge_name) + ' ' + badge(run.status) + '</h3>' +
      '<p class="meta">Mode <code class="inline">' + esc(run.mode) + '</code> · ' + counts.normalized + ' normalized scores (' + counts.extrapolated + ' extrapolated)</p>' +
      '<h3>Shared calibration projects</h3><form id="f-cal"><div style="max-height:150px;overflow:auto;border:1px solid var(--line);border-radius:10px;padding:8px">' +
      pl.map((p) => '<label style="display:block;font-weight:400;font-size:13.5px"><input type="checkbox" name="pid" value="' + p.id + '"> ' + esc(p.title) + ' <span class="meta">(' + esc(p.team_name || '') + ')</span></label>').join('') + '</div>' +
      '<div style="margin-top:8px;display:flex;gap:8px"><button class="btn btn-secondary" type="submit">Assign to all judges</button><button class="btn btn-primary" type="button" id="btn-calc">Calculate normalization</button></div><div class="meta" id="cal-msg"></div></form>' +
      '<div style="height:12px"></div><div class="table-wrap"><table class="tbl"><thead><tr><th>Judge</th><th>Reference</th><th>Low anchor</th><th>High anchor</th><th>Src lo→hi</th><th>Tgt lo→hi</th><th>Slope</th><th>Intercept</th><th>Status</th></tr></thead><tbody>' +
      (calibrations.length ? calibrations.map((c) => '<tr><td><b>' + esc(c.source_name) + '</b></td><td>' + esc(c.target_name) + '</td>' +
        '<td>' + esc(c.low_anchor_title || '—') + '</td><td>' + esc(c.high_anchor_title || '—') + '</td>' +
        '<td>' + (c.source_low ?? '—') + ' → ' + (c.source_high ?? '—') + '</td><td>' + (c.target_low ?? '—') + ' → ' + (c.target_high ?? '—') + '</td>' +
        '<td>' + (c.slope !== null ? Math.round(c.slope * 10000) / 10000 : '—') + '</td><td>' + (c.intercept !== null ? Math.round(c.intercept * 100) / 100 : '—') + '</td>' +
        '<td>' + badge(c.status) + (c.reason ? '<br><span class="meta">' + esc(c.reason) + '</span>' : '') + '</td></tr>').join('')
        : '<tr><td colspan="9" class="meta">No calibrations yet — calculate below.</td></tr>') + '</tbody></table></div>';
    document.getElementById('f-cal').onsubmit = async (e) => {
      e.preventDefault();
      const pids = new FormData(e.target).getAll('pid').map((x) => parseInt(x, 10));
      if (!pids.length) { toast('Pick at least one shared project.', 'error'); return; }
      const rr = await api('/judging/calibration/runs/' + runId + '/assign', { method: 'POST', body: { project_ids: pids } });
      if (!rr.ok) { toast(rr.data.error || 'Failed.', 'error'); return; }
      toast(`Calibration assignments: ${rr.body.created} new, ${rr.body.skipped_existing} already existed.`, 'success');
    };
    document.getElementById('btn-calc').onclick = async () => {
      if (!await confirmDialog({ title: 'Calculate normalization?', body: 'Raw scores are never modified; outputs are versioned under this run.', confirmLabel: 'Calculate' })) return;
      const msg = document.getElementById('cal-msg');
      msg.textContent = 'Calculating…';
      const rr = await api('/judging/calibration/runs/' + runId + '/calculate', { method: 'POST' });
      if (!rr.ok) { msg.textContent = ''; toast(rr.data.error || 'Failed.', 'error', 6000); return; }
      const s = rr.body.summary;
      toast(`Done: ${s.valid} valid, ${s.insufficient} insufficient, ${s.suspicious} suspicious, ${s.extrapolated} extrapolated.`, s.invalid || s.suspicious ? 'info' : 'success', 7000);
      loadRun(eventId2, runId);
    };
  }
  sel.onchange = () => { location.hash = '#/organizer/judging/calibration?event=' + sel.value; };
  load(eventId);
}

async function viewJudgingComparison() {
  if (!requireOrganizer()) return;
  const params = new URLSearchParams((location.hash.split('?')[1] || ''));
  const { list, html } = await judgingEventPicker(params.get('event'));
  const eventId = params.get('event') || (list[0] ? list[0].id : '');
  render(crumbs([['Dashboard', '#/organizer'], ['Score comparison', null]]) + '<div class="page-head"><div><h1>Score comparison</h1><p class="sub">Raw vs normalized per project and judge (organizer-only).</p></div></div>' +
    '<div class="card"><div class="field"><label>Event</label>' + html + '</div><div id="s-body"></div></div>');
  const sel = document.getElementById('j-ev');
  async function load(id) {
    const box = document.getElementById('s-body');
    if (!id) { box.innerHTML = '<p class="meta">Create an event first.</p>'; return; }
    box.innerHTML = '<div class="loading-row"><span class="spinner dark"></span> Building comparison…</div>';
    const r = await api('/judging/events/' + id + '/results');
    if (!r.ok || !r.data.run) { box.innerHTML = '<div class="alert info">No completed calibration run yet. Start one under <a href="#/organizer/judging/calibration?event=' + id + '">Calibration</a>.</div>'; return; }
    const { run, finals } = r.data;
    const judges = [];
    finals.forEach((f) => f.judges.forEach((j) => { if (!judges.includes(j.judge)) judges.push(j.judge); }));
    const cell = (f, jn, key) => {
      const j = f.judges.find((x) => x.judge === jn);
      if (!j) return '<span class="meta">—</span>';
      const v = j[key];
      return v === null || v === undefined ? '<span class="meta">—</span>' :
        '<b>' + (Math.round(v * 100) / 100) + '</b>' + (j.extrapolated ? ' <span class="badge pending">extrapolated</span>' : '') + '<br><span class="meta">' + esc(j.status) + '</span>';
    };
    const tbl = (title, key) => '<h3>' + title + ' <span class="meta">(run v' + run.version + ')</span></h3><div class="table-wrap"><table class="tbl"><thead><tr><th>Project</th>' + judges.map((j) => '<th>' + esc(j) + '</th>').join('') + '<th>Avg</th></tr></thead><tbody>' +
      finals.map((f) => '<tr><td><b>' + esc(f.title) + '</b><br><span class="meta">' + esc(f.team || '') + '</span></td>' + judges.map((j) => '<td>' + cell(f, j, key) + '</td>').join('') +
        '<td><b>' + (f[key === 'raw' ? 'raw_avg' : 'normalized_avg'] !== null ? Math.round(f[key === 'raw' ? 'raw_avg' : 'normalized_avg'] * 100) / 100 : '—') + '</b></td></tr>').join('') + '</tbody></table></div>';
    box.innerHTML = tbl('Raw scores', 'raw') + '<div style="height:14px"></div>' + tbl('Normalized scores', 'normalized') +
      '<div style="height:14px"></div><div class="alert info">Only <b>VALID</b> and <b>EXTRAPOLATED</b> normalized scores participate in finals. Pending / invalid / excluded evaluations are listed but never silently averaged in.</div>';
  }
  sel.onchange = () => { location.hash = '#/organizer/judging/comparison?event=' + sel.value; };
  load(eventId);
}

async function viewJudgingResults() {
  if (!requireOrganizer()) return;
  const params = new URLSearchParams((location.hash.split('?')[1] || ''));
  const { list, html } = await judgingEventPicker(params.get('event'));
  const eventId = params.get('event') || (list[0] ? list[0].id : '');
  render(crumbs([['Dashboard', '#/organizer'], ['Final results', null]]) + '<div class="page-head"><div><h1>Final results</h1><p class="sub">Ranked by normalized average. Click any normalized score for its audit derivation.</p></div></div>' +
    '<div class="card"><div class="field"><label>Event</label>' + html + '</div><div id="r-body"></div></div>');
  const sel = document.getElementById('j-ev');
  async function load(id) {
    const box = document.getElementById('r-body');
    if (!id) { box.innerHTML = '<p class="meta">Create an event first.</p>'; return; }
    box.innerHTML = '<div class="loading-row"><span class="spinner dark"></span> Aggregating…</div>';
    const r = await api('/judging/events/' + id + '/results');
    if (!r.ok || !r.data.run) { box.innerHTML = '<div class="alert info">No completed calibration run yet.</div>'; return; }
    const { run, finals } = r.data;
    box.innerHTML = '<div class="page-actions" style="margin:0 0 12px"><button class="btn btn-secondary btn-sm" id="csv-ev">Export evaluations CSV</button><button class="btn btn-secondary btn-sm" id="csv-pr">Export projects CSV</button> <span class="meta">run v' + run.version + ' · ref: ' + esc(run.reference_judge_id) + '</span></div>' +
      '<div class="table-wrap"><table class="tbl"><thead><tr><th>#</th><th>Project</th><th>Final (norm. avg)</th><th>Raw avg</th><th>Judges</th><th>Range</th><th>Flags</th></tr></thead><tbody>' +
      finals.map((f, i) => '<tr><td><b>' + (i + 1) + '</b></td><td><b>' + esc(f.title) + '</b><br><span class="meta">' + esc(f.team || '') + '</span><br>' +
        f.judges.map((j) => '<button class="btn btn-ghost btn-sm" data-why="' + j.normalized_id + '" title="Why is this score ' + j.normalized + '?">' + esc(j.judge) + ': ' + (j.normalized !== null ? Math.round(j.normalized * 100) / 100 : '—') + ' ⚖</button>').join(' ') + '</td>' +
        '<td><b>' + (f.normalized_avg !== null ? Math.round(f.normalized_avg * 100) / 100 : '—') + '</b></td>' +
        '<td>' + (f.raw_avg !== null ? Math.round(f.raw_avg * 100) / 100 : '—') + '</td><td>' + f.n_judges + '</td>' +
        '<td class="meta">' + (f.norm_min ?? '—') + ' – ' + (f.norm_max ?? '—') + ' (σ ' + Math.round((f.stddev || 0) * 100) / 100 + ')</td>' +
        '<td>' + (f.pending ? '<span class="badge pending">' + f.pending + ' pending</span> ' : '') + (f.invalid ? '<span class="badge">' + f.invalid + ' invalid</span> ' : '') + (f.excluded ? '<span class="badge">' + f.excluded + ' excluded</span>' : '') + '</td></tr>').join('') + '</tbody></table></div>';
    async function dl(level) {
      const rr = await fetch('/api/judging/events/' + id + '/results/export?level=' + level + '&run_id=' + run.id, { credentials: 'include', headers: getToken() ? { Authorization: 'Bearer ' + getToken() } : {} });
      if (!rr.ok) { toast('Export failed.', 'error'); return; }
      const text = await rr.text();
      downloadBlob(text, 'judging-' + level + '-event' + id + '-run' + run.version + '.csv', 'text/csv');
      toast('CSV exported.', 'success');
    }
    document.getElementById('csv-ev').onclick = () => dl('evaluations');
    document.getElementById('csv-pr').onclick = () => dl('projects');
    box.querySelectorAll('[data-why]').forEach((b) => {
      b.onclick = async () => {
        const w = await api('/judging/normalized/' + b.dataset.why);
        if (!w.ok) { toast(w.data.error || 'Failed.', 'error'); return; }
        const n = w.data;
        const root = document.getElementById('modal-root');
        root.innerHTML = '<div class="modal-backdrop"><div class="modal" role="dialog" aria-modal="true" style="max-width:560px">' +
          '<h3>Why is this score ' + (n.normalized_score !== null ? Math.round(n.normalized_score * 100) / 100 : '—') + '?</h3>' +
          (n.explanation
            ? '<dl class="kv"><dt>Raw score</dt><dd><b>' + n.raw_score + '</b> by ' + esc(n.source_name) + '</dd>' +
              '<dt>Reference</dt><dd>' + esc(n.target_name) + ' (run v' + n.run.version + ', ' + esc(n.run.mode) + ')</dd>' +
              '<dt>Low anchor</dt><dd>' + esc(n.low_anchor_title || ('#' + n.calibration.low_anchor_project_id)) + ': source ' + n.calibration.source_low + ' · ref ' + n.calibration.target_low + '</dd>' +
              '<dt>High anchor</dt><dd>' + esc(n.high_anchor_title || ('#' + n.calibration.high_anchor_project_id)) + ': source ' + n.calibration.source_high + ' · ref ' + n.calibration.target_high + '</dd>' +
              '<dt>Formula</dt><dd><code class="inline">' + esc(n.explanation.formula) + '</code></dd>' +
              '<dt>Slope/intercept</dt><dd><code class="inline">' + esc(n.explanation.slopeIntercept) + '</code></dd>' +
              '<dt>Status</dt><dd>' + badge(n.status) + (n.extrapolated ? ' <span class="badge pending">extrapolated</span>' : '') + '</dd></dl>'
            : '<div class="alert warn">No valid transformation for this score (status: ' + esc(n.status) + '). Raw score preserved as evidence.</div>') +
          '<div class="modal-actions"><button class="btn btn-secondary" id="m-ok">Close</button></div></div></div>';
        document.getElementById('m-ok').onclick = () => { root.innerHTML = ''; };
      };
    });
  }
  sel.onchange = () => { location.hash = '#/organizer/judging/results?event=' + sel.value; };
  load(eventId);
}

/* ===============================================================
   TIER 3: Community Voting — Public & Organizer Views
   =============================================================== */

function votingStatusBadge(status) {
  const map = {
    draft: '<span class="badge">draft</span>',
    scheduled: '<span class="badge pending">scheduled</span>',
    open: '<span class="badge success">open</span>',
    paused: '<span class="badge warn">paused</span>',
    closed: '<span class="badge">closed</span>',
    results_revealed: '<span class="badge success">results live</span>',
    archived: '<span class="badge">archived</span>',
  };
  return map[status] || `<span class="badge">${esc(status)}</span>`;
}

/* Public: list all active voting rounds */
async function viewVotingRounds() {
  renderLoading('Loading voting rounds…');
  const params = new URLSearchParams((location.hash.split('?')[1] || ''));
  const eventId = params.get('event') || '';
  const url = '/voting' + (eventId ? '?event_id=' + eventId : '');
  const r = await api(url);
  const rounds = r.ok ? r.data.data : [];
  render(crumbs([['Home', '#/'], ['Community Voting', null]]) +
    '<div class="page-head"><div><h1>🗳 Community Voting</h1><p class="sub">Vote for your favourite projects and see the community results.</p></div></div>' +
    (rounds.length
      ? '<div class="grid cols-3">' + rounds.map((vr) =>
          '<div class="card hover">' +
          '<div style="display:flex;gap:8px;align-items:center;margin-bottom:8px">' + votingStatusBadge(vr.status) +
          '<span class="meta">' + esc(vr.event_title || '') + '</span></div>' +
          '<h3><a href="#/voting/' + vr.id + '">' + esc(vr.name) + '</a></h3>' +
          '<p class="meta">' + esc(String(vr.description || '').slice(0, 120)) + '</p>' +
          '<p class="meta">🏗 ' + (vr.project_count || 0) + ' projects · 👤 ' + (vr.voter_count || 0) + ' voters</p>' +
          '<a class="btn btn-secondary btn-sm" href="#/voting/' + vr.id + '">' +
          (vr.status === 'open' ? '🗳 Vote now →' : vr.status === 'results_revealed' ? '🏆 See results →' : 'View →') +
          '</a></div>'
        ).join('') + '</div>'
      : emptyState('🗳', 'No active voting rounds', 'Check back when an organizer opens voting.'))
  );
}

/* Public: vote on a round's projects */
async function viewVotingDetail(id) {
  renderLoading('Loading voting round…');
  const [roundR, projR] = await Promise.all([
    api('/voting/' + id),
    api('/voting/' + id + '/projects'),
  ]);
  if (!roundR.ok) { render(emptyState('🔍', 'Voting round not found', '')); return; }
  const round = roundR.data;
  const projData = projR.ok ? projR.data : { data: [], votes_remaining: null };
  const projects = projData.data || [];
  const isOpen = round.status === 'open';
  const canVote = isOpen && App.user && App.user.role !== 'judge';

  // Results section — only if revealed (or not hidden)
  let resultsHtml = '';
  if (round.status === 'results_revealed' || (!round.results_hidden_during_voting && ['open','paused','closed','results_revealed'].includes(round.status))) {
    const rr = await api('/voting/' + id + '/results');
    if (rr.ok) {
      const res = rr.data.results || [];
      resultsHtml = '<div style="margin-top:18px"><h3>🏆 Results</h3><div class="table-wrap"><table class="tbl"><thead><tr><th>#</th><th>Project</th><th>Team</th><th>Votes</th><th>%</th></tr></thead><tbody>' +
        res.map((p) => `<tr><td><b>${p.rank}</b></td><td>${esc(p.title)}</td><td>${esc(p.team_name || '')}</td><td>${p.vote_count}</td><td>${p.percentage}%</td></tr>`).join('') +
        '</tbody></table></div></div>';
    }
  }

  render(
    crumbs([['Voting', '#/voting'], [round.name, null]]) +
    '<div class="page-head"><div>' +
    '<div style="display:flex;gap:8px;align-items:center">' + votingStatusBadge(round.status) + '<span class="meta">' + esc(round.event_title || '') + '</span></div>' +
    '<h1>' + esc(round.name) + '</h1>' +
    '<p class="sub">' + esc(round.description || '') + '</p></div>' +
    (canVote ? '<div class="page-actions"><div class="card" style="padding:12px"><b id="votes-remaining-display">' + (projData.votes_remaining ?? '?') + '</b> votes remaining (max ' + round.max_votes_per_user + ')</div></div>' : '') +
    '</div>' +
    (!App.user && isOpen ? '<div class="alert info">🔐 <a href="#/login">Log in</a> to cast your votes.</div>' : '') +
    (round.status === 'paused' ? '<div class="alert warn">⏸ Voting is temporarily paused.</div>' : '') +
    (round.status === 'closed' && !resultsHtml ? '<div class="alert info">Voting has closed. Results will be revealed by the organizer soon.</div>' : '') +
    resultsHtml +
    (projects.length
      ? '<div style="margin-top:16px"><h3>Projects</h3><div class="grid cols-2" id="proj-grid">' +
          projects.map((p) =>
            '<div class="card" id="proj-' + p.id + '">' +
            '<div style="display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap">' + (p.track_name ? '<span class="badge track">' + esc(p.track_name) + '</span>' : '') + '</div>' +
            '<h3><a href="#/gallery/' + p.id + '">' + esc(p.title) + '</a></h3>' +
            '<p class="meta">' + esc(p.excerpt || '') + '</p>' +
            '<p class="meta">👥 ' + esc(p.team_name || '') + '</p>' +
            (canVote
              ? '<button class="btn ' + (p.has_voted ? 'btn-secondary' : 'btn-primary') + ' btn-sm vote-btn" data-pid="' + p.id + '" data-voted="' + p.has_voted + '">' +
                (p.has_voted ? '✓ Voted' : '🗳 Vote') + '</button>'
              : (p.has_voted ? '<span class="badge success">✓ You voted</span>' : '')) +
            (round.comments_enabled
              ? '<a class="btn btn-ghost btn-sm" style="margin-left:6px" href="#/voting/' + id + '/comments/' + p.id + '">💬 Comments</a>'
              : '') +
            '</div>'
          ).join('') +
        '</div></div>'
      : emptyState('🏗', 'No projects in this round', 'The organizer has not added any eligible projects yet.'))
  );

  // Wire up vote buttons
  if (canVote) {
    let remaining = projData.votes_remaining ?? 0;
    document.querySelectorAll('.vote-btn').forEach((btn) => {
      btn.onclick = async () => {
        const pid = parseInt(btn.dataset.pid, 10);
        const hasVoted = btn.dataset.voted === 'true';
        btn.disabled = true;
        if (hasVoted) {
          // Withdraw if allow_vote_change
          const r = await api('/voting/' + id + '/votes/' + pid, { method: 'DELETE' });
          if (r.ok) {
            btn.textContent = '🗳 Vote'; btn.className = 'btn btn-primary btn-sm vote-btn';
            btn.dataset.voted = 'false'; remaining++;
            const display = document.getElementById('votes-remaining-display');
            if (display) display.textContent = remaining;
            toast('Vote withdrawn.', 'info');
          } else { toast(r.data.error || 'Failed.', 'error'); }
        } else {
          const r = await api('/voting/' + id + '/votes', { method: 'POST', body: { project_id: pid } });
          if (r.ok) {
            btn.textContent = '✓ Voted'; btn.className = 'btn btn-secondary btn-sm vote-btn';
            btn.dataset.voted = 'true'; remaining = r.body.votes_remaining ?? remaining - 1;
            const display = document.getElementById('votes-remaining-display');
            if (display) display.textContent = r.data.votes_remaining ?? remaining;
            toast('Vote cast!', 'success');
          } else { toast(r.data.error || 'Failed to cast vote.', 'error'); }
        }
        btn.disabled = false;
      };
    });
  }
}

/* Public: comments on a project within a voting round */
async function viewVotingComments(roundId, projectId) {
  renderLoading('Loading comments…');
  const [roundR, projR, commR] = await Promise.all([
    api('/voting/' + roundId),
    api('/gallery/' + projectId),
    api('/comments?voting_round_id=' + roundId + '&project_id=' + projectId + '&limit=50'),
  ]);
  if (!roundR.ok || !projR.ok) { render(emptyState('🔍', 'Not found', '')); return; }
  const round = roundR.data;
  const project = projR.data;
  const comments = commR.ok ? commR.data.data : [];
  const canComment = App.user && ['open','paused'].includes(round.status) && round.comments_enabled;

  render(
    crumbs([['Voting', '#/voting'], [round.name, '#/voting/' + roundId], [project.title + ' – Comments', null]]) +
    '<div class="page-head"><div><h1>💬 Comments — ' + esc(project.title) + '</h1><p class="sub">Public discussion for this project during the voting round.</p></div></div>' +
    (canComment
      ? '<div class="card" style="margin-bottom:16px"><form id="f-comment"><div class="field"><label>Your comment</label><textarea class="input" id="c-body" rows="3" maxlength="1000" placeholder="Share your feedback…"></textarea></div><div class="field-error" id="c-err" style="display:none"></div><button class="btn btn-primary" type="submit" id="c-btn">Post comment</button></form></div>'
      : (!App.user ? '<div class="alert info"><a href="#/login">Log in</a> to post a comment.</div>' : '<div class="alert info">Comments are only allowed while voting is active.</div>')) +
    '<div id="comment-list">' +
    (comments.length
      ? comments.map((c) =>
          '<div class="card" style="margin-bottom:10px" id="comment-' + c.id + '">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">' +
          '<b>' + esc(c.author_name || 'User') + '</b>' +
          '<span class="meta">' + fmtDate(c.created_at) + (c.edited_at ? ' (edited)' : '') + '</span></div>' +
          '<p style="white-space:pre-wrap;margin:0">' + esc(c.body) + '</p>' +
          '</div>'
        ).join('')
      : '<p class="meta">No comments yet. Be the first!</p>') +
    '</div>'
  );

  if (canComment) {
    document.getElementById('f-comment').onsubmit = async (e) => {
      e.preventDefault();
      const body = document.getElementById('c-body').value.trim();
      const btn = document.getElementById('c-btn');
      const err = document.getElementById('c-err');
      if (!body) { err.style.display = 'block'; err.textContent = 'Comment cannot be empty.'; return; }
      btn.disabled = true;
      const r = await api('/comments', { method: 'POST', body: { voting_round_id: roundId, project_id: projectId, body } });
      if (r.ok) {
        toast('Comment posted!', 'success');
        await viewVotingComments(roundId, projectId); // reload
      } else {
        err.style.display = 'block'; err.textContent = r.data.error || 'Failed to post.';
        btn.disabled = false;
      }
    };
  }
}

/* Organizer: voting management dashboard */
async function viewOrganizerVoting() {
  if (!requireOrganizer()) return;
  renderLoading('Loading voting rounds…');
  const evR = await api('/stats/organizer');
  const upcomingEvs = evR.ok ? evR.data.upcoming : [];
  const params = new URLSearchParams((location.hash.split('?')[1] || ''));
  const eventId = params.get('event') || (upcomingEvs[0] ? upcomingEvs[0].id : '');
  const eventsR = await api('/events?limit=50');
  const allEvs = eventsR.ok ? eventsR.data.data : [];

  const evSel = '<select class="select" id="v-ev">' +
    allEvs.map((e) => '<option value="' + e.id + '"' + (String(e.id) === String(eventId) ? ' selected' : '') + '>' + esc(e.title) + '</option>').join('') +
    '</select>';

  render(crumbs([['Dashboard', '#/organizer'], ['Voting', null]]) +
    '<div class="page-head"><div><h1>🗳 Community Voting</h1><p class="sub">Create and manage public voting rounds for your events.</p></div>' +
    '<div class="page-actions"><button class="btn btn-primary" id="btn-new-round">＋ New round</button></div></div>' +
    '<div class="card"><div class="field"><label>Event</label>' + evSel + '</div><div id="v-body"></div></div>');

  async function loadRounds(eid) {
    const box = document.getElementById('v-body');
    if (!eid) { box.innerHTML = '<p class="meta">Select an event.</p>'; return; }
    box.innerHTML = '<div class="loading-row"><span class="spinner dark"></span> Loading…</div>';
    const r = await api('/voting?event_id=' + eid);
    // Also fetch all rounds including drafts for organizer (need separate call)
    const all = await api('/voting?event_id=' + eid); // public returns open+
    // We'll also try fetching by listing our own created ones from events
    if (!r.ok) { box.innerHTML = '<div class="alert error">Failed to load.</div>'; return; }
    const rounds = r.data.data || [];
    box.innerHTML = rounds.length
      ? '<div class="table-wrap"><table class="tbl"><thead><tr><th>Name</th><th>Status</th><th>Projects</th><th>Voters</th><th>Actions</th></tr></thead><tbody>' +
          rounds.map((vr) =>
            '<tr>' +
            '<td><b>' + esc(vr.name) + '</b></td>' +
            '<td>' + votingStatusBadge(vr.status) + '</td>' +
            '<td>' + (vr.project_count || 0) + '</td>' +
            '<td>' + (vr.voter_count || 0) + '</td>' +
            '<td style="display:flex;gap:6px;flex-wrap:wrap">' +
            '<a class="btn btn-secondary btn-sm" href="#/voting/' + vr.id + '">View</a>' +
            (vr.status === 'draft' || vr.status === 'scheduled'
              ? '<button class="btn btn-primary btn-sm" onclick="orgOpenRound(' + vr.id + ')">Open</button>' : '') +
            (vr.status === 'open'
              ? '<button class="btn btn-secondary btn-sm" onclick="orgPauseRound(' + vr.id + ')">Pause</button><button class="btn btn-secondary btn-sm" onclick="orgCloseRound(' + vr.id + ')">Close</button>' : '') +
            (vr.status === 'paused'
              ? '<button class="btn btn-primary btn-sm" onclick="orgOpenRound(' + vr.id + ')">Resume</button><button class="btn btn-secondary btn-sm" onclick="orgCloseRound(' + vr.id + ')">Close</button>' : '') +
            (vr.status === 'closed'
              ? '<button class="btn btn-primary btn-sm" onclick="orgRevealRound(' + vr.id + ')">Reveal results</button>' : '') +
            (vr.status === 'open' || vr.status === 'paused' || vr.status === 'closed' || vr.status === 'results_revealed'
              ? '<a class="btn btn-ghost btn-sm" href="#/organizer/voting/' + vr.id + '/analytics">Analytics</a>' : '') +
            '</td></tr>'
          ).join('') +
        '</tbody></table></div>'
      : '<p class="meta">No voting rounds yet. Create one above.</p>';
  }

  // Global helpers for inline buttons
  window.orgOpenRound = async (rid) => {
    const r = await api('/voting/' + rid + '/open', { method: 'POST' });
    if (r.ok) { toast('Voting opened!', 'success'); loadRounds(document.getElementById('v-ev').value); }
    else toast(r.data.error || 'Failed.', 'error');
  };
  window.orgPauseRound = async (rid) => {
    const r = await api('/voting/' + rid + '/pause', { method: 'POST' });
    if (r.ok) { toast('Voting paused.', 'info'); loadRounds(document.getElementById('v-ev').value); }
    else toast(r.data.error || 'Failed.', 'error');
  };
  window.orgCloseRound = async (rid) => {
    const r = await api('/voting/' + rid + '/close', { method: 'POST' });
    if (r.ok) { toast('Voting closed.', 'info'); loadRounds(document.getElementById('v-ev').value); }
    else toast(r.data.error || 'Failed.', 'error');
  };
  window.orgRevealRound = async (rid) => {
    const r = await api('/voting/' + rid + '/reveal', { method: 'POST' });
    if (r.ok) { toast('Results revealed!', 'success'); loadRounds(document.getElementById('v-ev').value); }
    else toast(r.data.error || 'Failed.', 'error');
  };

  document.getElementById('v-ev').onchange = (e) => {
    const eid = e.target.value;
    history.replaceState(null, '', location.pathname + location.search + '#/organizer/voting?event=' + eid);
    loadRounds(eid);
  };

  document.getElementById('btn-new-round').onclick = () => {
    const eid = document.getElementById('v-ev').value;
    if (!eid) { toast('Select an event first.', 'warn'); return; }
    location.hash = '#/organizer/voting/new?event=' + eid;
  };

  loadRounds(eventId);
}

/* Organizer: create voting round */
async function viewOrganizerVotingNew() {
  if (!requireOrganizer()) return;
  const params = new URLSearchParams((location.hash.split('?')[1] || ''));
  const eventId = params.get('event') || '';
  const evR = await api('/events?limit=50');
  const evs = evR.ok ? evR.data.data : [];
  render(crumbs([['Dashboard', '#/organizer'], ['Voting', '#/organizer/voting'], ['New round', null]]) +
    '<div class="page-head"><div><h1>Create voting round</h1></div></div>' +
    '<div class="card"><form id="f-new-round">' +
    '<div class="field"><label>Event</label><select class="select" name="event_id">' + evs.map((e) => '<option value="' + e.id + '"' + (String(e.id) === String(eventId) ? ' selected' : '') + '>' + esc(e.title) + '</option>').join('') + '</select></div>' +
    '<div class="field"><label>Round name</label><input class="input" name="name" value="Community Choice" required></div>' +
    '<div class="field"><label>Description</label><input class="input" name="description" placeholder="Vote for your favourite project!"></div>' +
    '<div class="field"><label>Max votes per user</label><input class="input" name="max_votes_per_user" type="number" value="5" min="1" max="50"></div>' +
    '<div class="field"><label>Voting start (optional)</label><input class="input" name="voting_start" type="datetime-local"></div>' +
    '<div class="field"><label>Voting end (optional)</label><input class="input" name="voting_end" type="datetime-local"></div>' +
    '<div class="field" style="display:flex;gap:18px;flex-wrap:wrap">' +
    '<label><input type="checkbox" name="results_hidden_during_voting" checked> Hide results until reveal</label>' +
    '<label><input type="checkbox" name="randomized_ordering" checked> Randomize project order</label>' +
    '<label><input type="checkbox" name="comments_enabled" checked> Enable comments</label>' +
    '<label><input type="checkbox" name="allow_vote_change"> Allow vote changes</label>' +
    '</div>' +
    '<div class="field-error" id="f-err" style="display:none"></div>' +
    '<button class="btn btn-primary" type="submit" id="f-btn">Create round</button>' +
    '<a class="btn btn-secondary" href="#/organizer/voting">Cancel</a>' +
    '</form></div>');
  document.getElementById('f-new-round').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const btn = document.getElementById('f-btn');
    const err = document.getElementById('f-err');
    btn.disabled = true;
    const body = {
      event_id: fd.get('event_id'),
      name: fd.get('name'),
      description: fd.get('description'),
      max_votes_per_user: parseInt(fd.get('max_votes_per_user'), 10),
      voting_start: fd.get('voting_start') || null,
      voting_end: fd.get('voting_end') || null,
      results_hidden_during_voting: fd.has('results_hidden_during_voting'),
      randomized_ordering: fd.has('randomized_ordering'),
      comments_enabled: fd.has('comments_enabled'),
      allow_vote_change: fd.has('allow_vote_change'),
    };
    const r = await api('/voting', { method: 'POST', body });
    if (r.ok) {
      toast('Voting round created!', 'success');
      // Add all submitted projects automatically
      const projR = await api('/events/' + body.event_id + '/projects');
      if (projR.ok) {
        const submitted = (projR.data || []).filter((p) => p.status === 'submitted');
        if (submitted.length) {
          await api('/voting/' + r.data.id + '/projects', { method: 'POST', body: { project_ids: submitted.map((p) => p.id) } });
        }
      }
      location.hash = '#/organizer/voting?event=' + body.event_id;
    } else {
      err.style.display = 'block'; err.textContent = r.data.error || 'Failed to create round.';
      btn.disabled = false;
    }
  };
}

/* Organizer: analytics for a voting round */
async function viewOrganizerVotingAnalytics(roundId) {
  if (!requireOrganizer()) return;
  renderLoading('Loading analytics…');
  const r = await api('/voting/' + roundId + '/analytics');
  if (!r.ok) { render(emptyState('🔍', 'Round not found or access denied', '')); return; }
  const { round, stats, top_projects } = r.data;
  render(
    crumbs([['Dashboard', '#/organizer'], ['Voting', '#/organizer/voting'], ['Analytics', null]]) +
    '<div class="page-head"><div>' +
    votingStatusBadge(round.status) +
    '<h1>' + esc(round.name) + ' — Analytics</h1>' +
    '<p class="sub">' + esc(round.event_title || '') + ' · Organizer-only live view</p></div>' +
    '<div class="page-actions">' +
    (round.status === 'open' ? '<button class="btn btn-secondary" onclick="orgPauseRound(' + round.id + ')">Pause</button>' : '') +
    (round.status === 'open' || round.status === 'paused' ? '<button class="btn btn-secondary" onclick="orgCloseRound(' + round.id + ')">Close</button>' : '') +
    (round.status === 'closed' ? '<button class="btn btn-primary" onclick="orgRevealRound(' + round.id + ')">Reveal results</button>' : '') +
    '</div></div>' +
    '<div class="grid cols-4" style="margin-bottom:18px">' +
    ['<b>' + stats.total_voters + '</b><span>unique voters</span>',
     '<b>' + stats.total_valid_votes + '</b><span>valid votes</span>',
     '<b>' + stats.total_comments + '</b><span>comments</span>',
     '<b>' + stats.unreviewed_flags + '</b><span>unreviewed flags</span>']
      .map((c) => '<div class="card"><div class="stat-card">' + c + '</div></div>').join('') +
    '</div>' +
    '<div class="card"><h3>Top projects</h3>' +
    (top_projects.length
      ? '<div class="table-wrap"><table class="tbl"><thead><tr><th>#</th><th>Project</th><th>Votes</th></tr></thead><tbody>' +
          top_projects.map((p, i) => '<tr><td>' + (i + 1) + '</td><td>' + esc(p.title) + '</td><td>' + p.vote_count + '</td></tr>').join('') +
        '</tbody></table></div>'
      : '<p class="meta">No votes yet.</p>') +
    '</div>' +
    '<div class="card" style="margin-top:12px"><h3>Links</h3>' +
    '<a class="btn btn-secondary btn-sm" href="#/voting/' + round.id + '/results">Public results page</a> ' +
    '<a class="btn btn-ghost btn-sm" href="#/organizer/voting">← Back to voting rounds</a></div>'
  );
}

/* ---------------- router ---------------- */
const routes = [
  [/^#\/$/, viewHome],
  [/^#\/events$/, viewEvents],
  [/^#\/events\/(\d+)$/, (m) => viewEventDetail(m[1])],
  [/^#\/gallery$/, viewGallery],
  [/^#\/gallery\/(\d+)$/, (m) => viewGalleryDetail(m[1])],
  [/^#\/login$/, viewLogin],
  [/^#\/register$/, viewRegister],
  [/^#\/join\/([A-Za-z0-9]+)$/, (m) => viewJoin(m[1])],
  [/^#\/dashboard$/, viewDashboard],
  [/^#\/teams$/, viewTeams],
  [/^#\/teams\/(\d+)$/, (m) => viewTeamDetail(m[1])],
  [/^#\/projects$/, viewProjects],
  [/^#\/projects\/(\d+)$/, (m) => viewProjectDetail(m[1])],
  [/^#\/submissions$/, viewSubmissions],
  [/^#\/profile$/, viewProfile],
  [/^#\/organizer$/, viewOrganizer],
  [/^#\/organizer\/events$/, viewOrganizerEvents],
  [/^#\/organizer\/teams$/, viewOrganizerTeams],
  [/^#\/organizer\/projects$/, viewOrganizerProjects],
  [/^#\/organizer\/submissions$/, viewOrganizerSubmissions],
  [/^#\/organizer\/settings$/, viewOrganizerSettings],
  [/^#\/organizer\/events$/, viewOrganizerEvents],
  [/^#\/organizer\/events\/new$/, viewEventNew],
  [/^#\/organizer\/events\/(\d+)\/edit$/, (m) => viewEventEdit(m[1])],
  [/^#\/organizer\/events\/(\d+)\/submissions$/, (m) => viewEventSubmissions(m[1])],
  [/^#\/organizer\/events\/(\d+)\/teams$/, (m) => viewEventTeams(m[1])],
  [/^#\/judging$/, viewJudging],
  [/^#\/judging\/evaluate\/(\d+)$/, (m) => viewJudgeEvaluate(m[1])],
  [/^#\/organizer\/judging\/judges$/, viewJudgingJudges],
  [/^#\/organizer\/judging\/assignments$/, viewJudgingAssignments],
  [/^#\/organizer\/judging\/rubric$/, viewJudgingRubric],
  [/^#\/organizer\/judging\/progress$/, viewJudgingProgress],
  [/^#\/organizer\/judging\/calibration$/, viewJudgingCalibration],
  [/^#\/organizer\/judging\/comparison$/, viewJudgingComparison],
  [/^#\/organizer\/judging\/results$/, viewJudgingResults],
  [/^#\/organizer\/voting$/, viewOrganizerVoting],
  [/^#\/organizer\/voting\/new$/, viewOrganizerVotingNew],
  [/^#\/organizer\/voting\/(\d+)\/analytics$/, (m) => viewOrganizerVotingAnalytics(m[1])],
  [/^#\/voting$/, viewVotingRounds],
  [/^#\/voting\/(\d+)$/, (m) => viewVotingDetail(m[1])],
  [/^#\/voting\/(\d+)\/comments\/(\d+)$/, (m) => viewVotingComments(m[1], m[2])],
  [/^#\/admin$/, viewAdmin],
  [/^#\/admin\/users$/, viewAdminUsers],
  [/^#\/admin\/events$/, viewAdminEvents],
  [/^#\/admin\/system$/, viewAdminSystem],
];

async function router() {
  const hash = location.hash.split('?')[0] || '#/';
  window.scrollTo(0, 0);
  for (const [re, fn] of routes) {
    const m = hash.match(re);
    if (m) {
      try { await fn(m); } catch (e) { console.error(e); render('<div class="alert error">Something went wrong rendering this page.</div>'); }
      return;
    }
  }
  render(emptyState('🧭', 'Page not found', 'That route doesn’t exist.', '<a class="btn btn-primary" href="#/">Go home</a>'));
}

window.addEventListener('hashchange', router);
document.addEventListener('DOMContentLoaded', async () => {
  await refreshMe();
  App.booted = true;
  if (!location.hash) location.hash = '#/';
  // If a protected invite link was requested pre-login, continue there.
  const back = sessionStorage.getItem('post_login');
  if (back && App.user) { sessionStorage.removeItem('post_login'); location.hash = back; }
  router();
});
