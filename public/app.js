const app = document.querySelector('#app');
let library = null;
let libraryError = false;
let artistStyles = {};

let bootstrap = {
  id: '9789171839',
  name: '26.10.6',
  date: '2026-10-06',
  trackCount: 13,
  sourceUrl: 'https://y.qq.com/n/ryqq/playlist/9789171839',
  provenance: 'owner-provided, awaiting API verification'
};

const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const fallbackCover = '<span class="cover-fallback" role="img" aria-label="Album artwork unavailable">Artwork unavailable</span>';
const routeName = () => (location.hash.replace(/^#\/?/, '').split(/[?&]/)[0] || 'home');
const routeParams = () => new URLSearchParams(location.hash.split('?')[1] || '');
const playlistHref = (playlist) => `#playlist?id=${encodeURIComponent(playlist.id)}`;

function songTitleMarkup(track) {
  const title = escapeHtml(track.title || 'Title unavailable');
  return /[\u3040-\u30ff]/u.test(track.title || '')
    ? `<span lang="ja">${title}</span>`
    : title;
}

function collectionDate(date, includeYear = false) {
  if (!date) return 'Date unavailable';
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'long',
    ...(includeYear ? { year: 'numeric' } : {}),
    timeZone: 'UTC'
  }).format(new Date(`${date}T12:00:00Z`));
}

function collectionMonth(month) {
  const date = new Date(`${month}-01T12:00:00Z`);
  return `${new Intl.DateTimeFormat('en', { month: 'long', timeZone: 'UTC' }).format(date)} ${month.slice(0, 4)}`;
}

function artistNames(value = '') {
  const pieces = String(value).split(/\s*,\s*|\s+\/\s+/).map((name) => name.trim()).filter(Boolean);
  const names = [];
  for (let index = 0; index < pieces.length; index += 1) {
    const commaName = index + 1 < pieces.length ? `${pieces[index]}, ${pieces[index + 1]}` : '';
    if (commaName && Object.values(artistStyles).some((artists) => artists.includes(commaName))) {
      names.push(commaName);
      index += 1;
    } else names.push(pieces[index]);
  }
  return [...new Set(names)];
}

function artistTags(artist) {
  return Object.entries(artistStyles).filter(([, artists]) => artists.includes(artist)).map(([style]) => style);
}

function songOccurrences() {
  return (library?.playlists || []).flatMap((playlist) => (playlist.tracks || []).map((track) => ({ track, playlist })));
}

function calendarWeek(dateString) {
  const [year, month, day] = dateString.split('-').map(Number);
  const start = new Date(Date.UTC(year, month - 1, day));
  start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  const thursday = new Date(start);
  thursday.setUTCDate(thursday.getUTCDate() + 3);
  const weekYear = thursday.getUTCFullYear();
  const januaryFourth = new Date(Date.UTC(weekYear, 0, 4));
  const firstMonday = new Date(januaryFourth);
  firstMonday.setUTCDate(firstMonday.getUTCDate() - ((firstMonday.getUTCDay() + 6) % 7));
  const weekNumber = Math.floor((start - firstMonday) / 604800000) + 1;
  const formatDate = (date) => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
  const key = `${weekYear}-W${String(weekNumber).padStart(2, '0')}`;
  return { key, weekYear, weekNumber, start: formatDate(start), end: formatDate(end) };
}

function weekIndex() {
  const weeks = new Map();
  for (const playlist of library?.playlists || []) {
    if (!playlist.date) continue;
    const week = calendarWeek(playlist.date);
    const current = weeks.get(week.key) || { ...week, count: 0, playlistCount: 0 };
    current.count += playlist.tracks?.length || 0;
    current.playlistCount += 1;
    weeks.set(week.key, current);
  }
  return [...weeks.values()].sort((a, b) => b.start.localeCompare(a.start)).map((week) => ({
    ...week,
    name: `${week.weekYear}-W${String(week.weekNumber).padStart(2, '0')}`,
    label: `${week.weekYear} · 第 ${String(week.weekNumber).padStart(2, '0')} 周`,
    rangeLabel: `${week.start.slice(5).replaceAll('-', '.')} — ${week.end.slice(5).replaceAll('-', '.')}`
  }));
}

function findWeekSongs(key) {
  return songOccurrences().filter(({ playlist }) => playlist.date && calendarWeek(playlist.date).key === key);
}

function artistIndex() {
  const counts = new Map();
  for (const { track } of songOccurrences()) {
    for (const name of artistNames(track.artist)) counts.set(name, (counts.get(name) || 0) + 1);
  }
  return [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'zh-Hans'));
}

function styleIndex() {
  const styles = new Map();
  for (const { track } of songOccurrences()) {
    const tags = new Set(artistNames(track.artist).flatMap(artistTags));
    for (const tag of tags) styles.set(tag, (styles.get(tag) || 0) + 1);
  }
  return [...styles].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'zh-Hans'));
}

function findArtistSongs(name) {
  return songOccurrences().filter(({ track }) => artistNames(track.artist).includes(name));
}

function findStyleSongs(name) {
  return songOccurrences().filter(({ track }) => artistNames(track.artist).some((artist) => artistTags(artist).includes(name)));
}

function artistLinks(artist) {
  return artistNames(artist).map((name) => `<a href="#artist?name=${encodeURIComponent(name)}">${escapeHtml(name)}</a>`).join(' / ') || 'Artist unavailable';
}

function songHref(track, playlist) {
  return track.id ? `https://y.qq.com/n/ryqq/songDetail/${encodeURIComponent(track.id)}` : safeExternalUrl(playlist.sourceUrl, playlistHref(playlist));
}

function safeExternalUrl(value, fallback = '') {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.href : fallback;
  } catch {
    return fallback;
  }
}

function coverMarkup(track, className = '', eager = false, highPriority = false) {
  const title = escapeHtml(track.title || 'Untitled recording');
  const src = safeExternalUrl(track.coverUrl);
  if (!src) return `<span class="cover ${className}">${fallbackCover}</span>`;
  const loading = eager ? 'eager' : 'lazy';
  const priority = highPriority ? ' fetchpriority="high"' : '';
  return `<span class="cover ${className}"><img class="album-artwork" src="${escapeHtml(src)}" alt="${title} album artwork" loading="${loading}" decoding="async"${priority} referrerpolicy="strict-origin-when-cross-origin" onerror="this.hidden=true;this.nextElementSibling.hidden=false"><span class="cover-fallback cover-error-fallback" role="img" aria-label="Album artwork unavailable" hidden>Artwork unavailable</span></span>`;
}

function albumCardMarkup(track, playlist, highPriority = false) {
  const target = songHref(track, playlist);
  return `<article class="album-card">
    <a class="album-link" href="${escapeHtml(target)}" target="_blank" rel="noreferrer" aria-label="Open ${escapeHtml(track.title || 'song')} by ${escapeHtml(track.artist || 'artist')} in QQ Music">${coverMarkup(track, '', true, highPriority)}</a>
    <a class="album-title" href="${escapeHtml(target)}" target="_blank" rel="noreferrer" title="${escapeHtml(track.title || 'Title unavailable')}">${songTitleMarkup(track)}</a>
    <span class="album-artist">${escapeHtml(track.artist || 'Artist unavailable')}</span>
  </article>`;
}

function renderHome() {
  const playlists = (library?.playlists || []).filter((playlist) => playlist.date).sort((a, b) => b.date.localeCompare(a.date));
  const latest = playlists[0];
  const recent = playlists.slice(1, 6);
  const latestTracks = latest?.tracks?.slice(0, 3) || [];
  const recentMarkup = recent.map((playlist) => `<article class="recent-day">
    <div class="recent-day-heading"><h3><a href="${playlistHref(playlist)}">${escapeHtml(collectionDate(playlist.date))}</a></h3><span>${playlist.tracks.length} songs</span></div>
    <div class="recent-covers">${playlist.tracks.slice(0, 3).map((track) => `<a class="album-link" href="${escapeHtml(songHref(track, playlist))}" target="_blank" rel="noreferrer" aria-label="Open ${escapeHtml(track.title || 'song')} in QQ Music">${coverMarkup(track)}</a>`).join('')}</div>
    <div class="recent-day-footer"><span>${escapeHtml(playlist.date.slice(0, 4))}</span><a class="collection-link" href="${playlistHref(playlist)}">View collection →</a></div>
  </article>`).join('');
  const latestLabel = latest ? collectionDate(latest.date, true).toLocaleUpperCase('en-GB') : '';
  const catalogueNote = library?.status === 'partial'
    ? '<p class="source-footnote">This catalogue is a partial sync. Earlier complete data remains preserved.</p>'
    : '';
  return `<div class="page-shell home-page">
    <section class="home-feature" aria-label="Introduction and latest collection">
      <div class="feature-copy">
        <span class="eyebrow">A PERSONAL MUSIC JOURNAL</span>
        <h1>听过的，<br>与喜欢的。</h1>
        <p>一些听过的音乐，<br>和那些留下来的日子。</p>
        <a class="text-link" href="#archive">Explore the archive →</a>
      </div>
      <div class="latest-collection">
        ${latest ? `<div class="latest-heading"><span class="latest-date">${escapeHtml(latestLabel)}</span><a class="latest-all-link" href="${playlistHref(latest)}">View all ${latest.tracks.length} songs</a></div><div class="latest-track-grid">${latestTracks.map((track, index) => albumCardMarkup(track, latest, index === 0)).join('')}</div>` : `<p class="empty-state">${libraryError ? 'The saved catalogue could not be read. Please try again in a moment.' : 'The latest collection will appear after the saved catalogue loads.'}</p>`}
        ${catalogueNote}
      </div>
    </section>
    <section class="section recent-section" aria-labelledby="recent-title">
      <div class="section-heading"><div><h2 id="recent-title">Recent Days</h2><p>近日收藏</p></div></div>
      ${recentMarkup ? `<div class="recent-day-grid">${recentMarkup}</div>` : '<p class="empty-state">There are no earlier collections to show yet.</p>'}
    </section>
    <section class="archive-entrance"><a class="text-link" href="#archive">Explore the full archive →</a></section>
  </div>`;
}

function renderArchive() {
  const params = routeParams();
  const playlists = (library?.playlists || []).filter((playlist) => playlist.date).sort((a, b) => b.date.localeCompare(a.date));
  const years = [...new Set(playlists.map((playlist) => playlist.date.slice(0, 4)))].sort().reverse();
  const yearParam = params.get('year');
  const currentYear = yearParam || years[0] || 'all';
  const visiblePlaylists = currentYear === 'all' ? playlists : playlists.filter((playlist) => playlist.date.startsWith(currentYear));
  const months = [...new Set(visiblePlaylists.map((playlist) => playlist.date.slice(0, 7)))].sort().reverse();
  const trackCount = playlists.reduce((sum, playlist) => sum + (playlist.tracks?.length || 0), 0);
  const archiveNote = library?.status === 'partial'
    ? 'The public playlist directory was unavailable; only the playlist data fetched successfully is shown.'
    : library?.status === 'success'
      ? 'Showing saved date collections from the synced music catalogue.'
      : 'Playlist details are waiting for the saved catalogue to load.';
  let archiveCoverIndex = 0;
  const collectionCard = (playlist) => {
    const monthName = new Intl.DateTimeFormat('en', { month: 'long', timeZone: 'UTC' }).format(new Date(`${playlist.date}T12:00:00Z`));
    const day = playlist.date.slice(8, 10);
    const covers = (playlist.tracks || []).slice(0, 3).map((track) => {
      const index = archiveCoverIndex++;
      return `<a class="album-link" href="${escapeHtml(songHref(track, playlist))}" target="_blank" rel="noreferrer" aria-label="Open ${escapeHtml(track.title || 'song')} in QQ Music">${coverMarkup(track, '', index < 6, index === 0)}</a>`;
    }).join('');
    return `<article class="archive-entry">
      <div class="archive-entry-heading"><h3><a href="${playlistHref(playlist)}">${day} ${monthName}</a></h3><span>${playlist.tracks?.length || 0} songs</span></div>
      <div class="archive-entry-covers">${covers}</div>
      <a class="collection-link" href="${playlistHref(playlist)}">View collection →</a>
    </article>`;
  };
  return `<div class="page-shell archive-page">
    <section class="page-intro"><h1>Archive</h1><p>按日期收集的音乐。</p></section>
    <div class="archive-toolbar"><div class="year-tabs" aria-label="Filter archive by year">${years.map((year) => `<button type="button" class="year-tab ${year === currentYear ? 'active' : ''}" aria-pressed="${year === currentYear}" data-year="${year}">${year}</button>`).join('')}<button type="button" class="year-tab ${currentYear === 'all' ? 'active' : ''}" aria-pressed="${currentYear === 'all'}" data-year="all">All</button></div><span class="archive-total">${playlists.length} collections · ${trackCount} songs</span></div>
    ${months.map((month) => `<section class="archive-month" id="month-${month}"><div class="month-heading"><h2>${escapeHtml(collectionMonth(month))}</h2></div><div class="archive-grid">${visiblePlaylists.filter((playlist) => playlist.date.startsWith(month)).map(collectionCard).join('')}</div></section>`).join('')}
    ${!months.length ? '<p class="archive-empty">Nothing has been archived yet.</p>' : ''}
    <p class="source-footnote">${escapeHtml(archiveNote)}</p>
  </div>`;
}

function playlistsById(id) {
  return library?.playlists?.find((playlist) => playlist.id === id) || null;
}

function renderPlaylistDetail(playlist) {
  const tracks = Array.isArray(playlist.tracks) ? playlist.tracks : [];
  const verified = tracks.length > 0;
  const dateLabel = playlist.date ? playlist.date.slice(2).replaceAll('-', '.') : 'date unavailable';
  const list = verified ? `<div class="track-gallery">${tracks.map((track, index) => {
    const target = songHref(track, playlist);
    const title = track.title || 'Title unavailable';
    return `<article class="track-card">
      <a class="album-link" href="${escapeHtml(target)}" target="_blank" rel="noreferrer" aria-label="Open ${escapeHtml(title)} in QQ Music">${coverMarkup(track, '', index < 4, index === 0)}</a>
      <a class="track-card-title" href="${escapeHtml(target)}" target="_blank" rel="noreferrer" title="${escapeHtml(title)}">${songTitleMarkup(track)}</a>
      <span class="track-card-artist">${artistLinks(track.artist)}</span>
      ${track.album ? `<span class="track-card-album">${escapeHtml(track.album)}</span>` : ''}
    </article>`;
  }).join('')}</div>` : `<div class="detail-pending"><strong>Song details haven't arrived yet.</strong><p>The source playlist is known, but its public catalogue could not be reached for verification. This entry contains no imported song data yet.</p></div>`;
  const label = verified ? `${tracks.length} ${tracks.length === 1 ? 'song' : 'songs'} collected` : 'Source entry · not yet verified';
  return `<div class="page-shell playlist-page"><a class="back-link" href="#archive">← Back to archive</a><section class="playlist-detail" id="playlist-detail"><div class="detail-heading"><div><h1>${escapeHtml(dateLabel)}</h1><p>${label}</p></div></div>${list}<a class="source-button" href="${escapeHtml(safeExternalUrl(playlist.sourceUrl))}" target="_blank" rel="noreferrer">Open original QQ Music playlist →</a></section></div>`;
}

function renderStatsResults(kind, query = '') {
  const source = kind === 'style' ? styleIndex() : (kind === 'week' ? weekIndex() : artistIndex());
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filtered = query.trim()
    ? source.filter((entry) => `${entry.name || ''} ${entry.label || ''} ${entry.rangeLabel || ''}`.toLocaleLowerCase().includes(normalizedQuery))
    : source.slice(0, kind === 'style' ? 18 : (kind === 'week' ? 24 : 20));
  if (!filtered.length) return '<p class="stats-empty">没有找到匹配项。试试其他名字。</p>';
  return `<div class="stats-entry-grid">${filtered.map((entry, index) => {
    const label = kind === 'week' ? entry.label : entry.name;
    const href = kind === 'style'
      ? `#style?name=${encodeURIComponent(entry.name)}`
      : (kind === 'week' ? `#week?week=${encodeURIComponent(entry.key)}` : `#artist?name=${encodeURIComponent(entry.name)}`);
    const detail = kind === 'week' ? `<small class="stats-entry-detail">${escapeHtml(entry.rangeLabel)} · ${entry.playlistCount} 张歌单</small>` : '';
    return `<a class="stats-entry" href="${href}"><span class="stats-entry-rank">${String(index + 1).padStart(2, '0')}</span><span class="stats-entry-copy"><strong>${escapeHtml(label)}</strong><small>${entry.count} 首收藏</small>${detail}</span><span class="stats-entry-arrow">↗</span></a>`;
  }).join('')}</div>`;
}

function renderStats() {
  const params = routeParams();
  const requestedMode = params.get('mode');
  const mode = ['style', 'week'].includes(requestedMode) ? requestedMode : 'artist';
  const query = params.get('q') || '';
  const totalSongs = songOccurrences().length;
  const artistCount = artistIndex().length;
  const sortNote = mode === 'artist' ? '按歌曲收藏数量排序' : (mode === 'week' ? '按日历周从近到远' : '按匹配收藏数量排序');
  const placeholder = mode === 'artist' ? '搜索歌手，例如：王菲' : (mode === 'week' ? '搜索周次，例如：2026-W41' : '搜索风格，例如：R&B');
  const defaultTitle = mode === 'artist' ? '高频收藏歌手' : (mode === 'week' ? '每周收藏' : '曲库中的风格');
  const methodNote = mode === 'week'
    ? '按自然周统计（周一至周日）；每周收藏数按日期歌单中的记录累计，重复收录会分别计数。'
    : '歌手数量按歌单中的收藏记录计算，重复收录会分别计数。风格页按艺人风格标签整理，跨界艺人可能出现在多个风格中。';
  return `<div class="page-shell stats-page"><section class="page-intro"><h1>Collection Index</h1><p>从歌手、风格与时间重新发现这些收藏。</p></section><section class="stats-summary"><span><strong>${totalSongs.toLocaleString()}</strong><small>首收藏记录</small></span><span><strong>${artistCount.toLocaleString()}</strong><small>位艺人</small></span><span><strong>${(library?.playlists || []).length}</strong><small>张歌单</small></span><span><strong>${weekIndex().length}</strong><small>有收藏的周</small></span></section><section class="stats-browser"><div class="stats-browser-heading"><div><h2>按歌手、风格或周次浏览</h2></div><span class="stats-sort-note">${sortNote}</span></div><div class="stats-mode" role="tablist" aria-label="搜索类别"><button type="button" role="tab" aria-selected="${mode === 'artist'}" class="stats-mode-button ${mode === 'artist' ? 'active' : ''}" data-stats-mode="artist">歌手</button><button type="button" role="tab" aria-selected="${mode === 'style'}" class="stats-mode-button ${mode === 'style' ? 'active' : ''}" data-stats-mode="style">风格</button><button type="button" role="tab" aria-selected="${mode === 'week'}" class="stats-mode-button ${mode === 'week' ? 'active' : ''}" data-stats-mode="week">周</button></div><label class="stats-search"><input id="stats-search" type="search" value="${escapeHtml(query)}" placeholder="${placeholder}" autocomplete="off" aria-label="${placeholder}"></label><div class="stats-results-heading"><span id="stats-results-title">${query ? '搜索结果' : defaultTitle}</span><span>${query ? '匹配收藏数由高到低' : sortNote}</span></div><div id="stats-results">${renderStatsResults(mode, query)}</div><p class="stats-method-note">${methodNote}</p></section></div>`;
}

function occurrenceRows(occurrences) {
  if (!occurrences.length) return '<p class="stats-empty">这份曲库里还没有匹配的收藏记录。</p>';
  const ordered = [...occurrences].sort((a, b) => (b.playlist.date || '').localeCompare(a.playlist.date || '') || a.track.index - b.track.index);
  return `<div class="track-list stats-track-list">${ordered.map(({ track, playlist }, index) => `<div class="track-row stats-track-row"><span class="track-number">${String(index + 1).padStart(2, '0')}</span>${coverMarkup(track, 'track-cover')}<div class="track-meta"><strong>${escapeHtml(track.title || 'Title unavailable')}</strong><span>${artistLinks(track.artist)}${track.album ? ` · ${escapeHtml(track.album)}` : ''}</span><span class="track-origin">收藏于 <a href="${playlistHref(playlist)}">${escapeHtml(playlist.name)} ↗</a></span></div><a href="${escapeHtml(songHref(track, playlist))}" target="_blank" rel="noreferrer" aria-label="在 QQ 音乐打开歌曲">↗</a></div>`).join('')}</div>`;
}

function renderArtistPage(name) {
  const occurrences = findArtistSongs(name);
  const firstTrack = occurrences[0]?.track;
  return `<div class="page-shell profile-page"><a class="back-link" href="#stats">← Back to Collection Index</a><section class="profile-heading"><div class="profile-art">${firstTrack ? coverMarkup(firstTrack, '', true) : fallbackCover}</div><div><span class="eyebrow">ARTIST · SAVED IN THIS ARCHIVE</span><h1>${escapeHtml(name)}</h1><p>${occurrences.length} 首收藏记录 <span>·</span> 来自 ${(new Set(occurrences.map(({ playlist }) => playlist.id))).size} 张歌单</p></div></section><section class="profile-song-section"><div class="month-heading"><h2>收藏曲目</h2><span>按歌单日期由近到远</span></div>${occurrenceRows(occurrences)}</section></div>`;
}

function renderStylePage(name) {
  const occurrences = findStyleSongs(name);
  const artists = [...new Set(occurrences.flatMap(({ track }) => artistNames(track.artist)).filter((artist) => artistTags(artist).includes(name)))];
  return `<div class="page-shell profile-page style-page"><a class="back-link" href="#stats?mode=style">← Back to style index</a><section class="profile-heading style-profile-heading"><div><span class="eyebrow">STYLE · EDITORIAL ARTIST TAGS</span><h1>${escapeHtml(name)}</h1><p>${occurrences.length} 首匹配收藏 <span>·</span> ${artists.length} 位已标注艺人</p></div></section><p class="style-disclosure">这是按艺人风格标签整理的收藏索引；同一位艺人的作品可能横跨多种风格。</p><section class="profile-song-section"><div class="month-heading"><h2>匹配曲目</h2><span>按歌单日期由近到远</span></div>${occurrenceRows(occurrences)}</section></div>`;
}

function renderWeekPage(key) {
  const week = weekIndex().find((item) => item.key === key);
  if (!week) return `<div class="page-shell missing-page"><a class="back-link" href="#stats?mode=week">← 返回周统计</a><h1>没有找到这一周的收藏。</h1></div>`;
  const occurrences = findWeekSongs(key);
  return `<div class="page-shell profile-page week-page"><a class="back-link" href="#stats?mode=week">← Back to week index</a><section class="profile-heading week-heading"><div><span class="eyebrow">CALENDAR WEEK · MONDAY—SUNDAY</span><h1>${week.weekYear} · 第 ${String(week.weekNumber).padStart(2, '0')} 周</h1><p>${week.start.replaceAll('-', '.')} — ${week.end.replaceAll('-', '.')} <span>·</span> ${occurrences.length} 首收藏 <span>·</span> ${week.playlistCount} 张歌单</p></div></section><section class="profile-song-section"><div class="month-heading"><h2>本周收藏</h2><span>按日期由近到远</span></div>${occurrenceRows(occurrences)}</section></div>`;
}

function renderAbout() {
  return `<div class="page-shell about-page"><section class="about-hero"><h1>A small music journal.</h1><p class="about-cn">这里收集一些喜欢的音乐。<br>也记录它们来到生活中的日子。</p><a class="text-link" href="https://c6.y.qq.com/base/fcgi-bin/u?__=fEuCQJiX90v6" target="_blank" rel="noreferrer">QQ Music profile →</a></section></div>`;
}

function render() {
  const route = routeName();
  const navRoute = route === 'playlist' ? 'archive' : (route === 'artist' || route === 'style' || route === 'week' ? 'stats' : route);
  document.querySelectorAll('.main-nav a').forEach((link) => {
    const active = link.dataset.route === navRoute;
    link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  if (libraryError) app.innerHTML = `<div class="load-state"><span class="eyebrow">THE ARCHIVE IS RESTING</span><h1>Music will find its way here.</h1><p>The saved catalogue could not be read. Please try again in a moment.</p></div>`;
  else if (route === 'archive') app.innerHTML = renderArchive();
  else if (route === 'playlist') {
    const requested = playlistsById(routeParams().get('id')) || (routeParams().get('id') === bootstrap.id ? bootstrap : null);
    app.innerHTML = requested ? renderPlaylistDetail(requested) : `<div class="page-shell missing-page"><a class="back-link" href="#archive">← 返回时间档案</a><h1>没有找到这张歌单。</h1></div>`;
  }
  else if (route === 'stats') app.innerHTML = renderStats();
  else if (route === 'artist') app.innerHTML = renderArtistPage(routeParams().get('name') || '');
  else if (route === 'style') app.innerHTML = renderStylePage(routeParams().get('name') || '');
  else if (route === 'week') app.innerHTML = renderWeekPage(routeParams().get('week') || '');
  else if (route === 'about') app.innerHTML = renderAbout();
  else app.innerHTML = renderHome();
}

window.addEventListener('hashchange', render);
app.addEventListener('click', (event) => {
  const yearButton = event.target.closest('[data-year]');
  if (yearButton) location.hash = yearButton.dataset.year === 'all' ? '#archive?year=all' : `#archive?year=${yearButton.dataset.year}`;
  const modeButton = event.target.closest('[data-stats-mode]');
  if (modeButton) {
    const query = document.querySelector('#stats-search')?.value || '';
    const params = new URLSearchParams({ mode: modeButton.dataset.statsMode });
    if (query) params.set('q', query);
    location.hash = `#stats?${params.toString()}`;
  }
});
app.addEventListener('input', (event) => {
  if (event.target.id !== 'stats-search') return;
  const requestedMode = routeParams().get('mode');
  const mode = ['style', 'week'].includes(requestedMode) ? requestedMode : 'artist';
  const results = document.querySelector('#stats-results');
  if (!results) return;
  results.innerHTML = renderStatsResults(mode, event.target.value);
  const title = document.querySelector('#stats-results-title');
  if (title) title.textContent = event.target.value.trim() ? '搜索结果' : (mode === 'artist' ? '高频收藏歌手' : (mode === 'week' ? '每周收藏' : '曲库中的风格'));
});
document.querySelector('#footer-year').textContent = `© ${new Date().getFullYear()}`;
library = { status: 'awaiting_first_successful_sync', playlists: [] };
render();
Promise.all([
  fetch('./data/library.json', { cache: 'no-store' }).then((response) => { if (!response.ok) throw new Error('Could not load archive data'); return response.json(); }),
  fetch('./data/artist-styles.json', { cache: 'no-store' }).then((response) => response.ok ? response.json() : {}).catch(() => ({}))
])
  .then(([data, styleData]) => { library = data; bootstrap = data.knownSource || bootstrap; artistStyles = styleData.styles || {}; render(); })
  .catch(() => { libraryError = true; render(); });
