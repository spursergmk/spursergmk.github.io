const app = document.querySelector('#app');
const headerStatus = document.querySelector('#header-status');
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
const fallbackCover = '<div class="cover-fallback" aria-label="Album artwork unavailable"><span>spurser.fm</span><i>♪</i></div>';
const routeName = () => (location.hash.replace(/^#\/?/, '').split(/[?&]/)[0] || 'home');
const routeParams = () => new URLSearchParams(location.hash.split('?')[1] || '');
const playlistHref = (playlist) => `#playlist?id=${encodeURIComponent(playlist.id)}`;

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

function coverMarkup(track, className = '') {
  const title = escapeHtml(track.title || 'Untitled recording');
  const src = safeExternalUrl(track.coverUrl);
  if (!src) return `<div class="cover ${className}">${fallbackCover}</div>`;
  return `<div class="cover ${className}"><img src="${escapeHtml(src)}" alt="${title} album artwork" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" onerror="this.hidden=true;this.nextElementSibling.hidden=false"><div class="cover-fallback cover-error-fallback" hidden aria-label="Album artwork unavailable"><span>spurser.fm</span><i>♪</i></div></div>`;
}

function songCard(track, playlist) {
  const date = playlist.date ? playlist.date.slice(5).replace('-', '.') : playlist.name;
  const target = track.id ? `https://y.qq.com/n/ryqq/songDetail/${encodeURIComponent(track.id)}` : safeExternalUrl(playlist.sourceUrl, '#archive');
  return `<a class="song-card" href="${escapeHtml(target)}" target="_blank" rel="noreferrer">
    ${coverMarkup(track)}
    <span class="song-title">${escapeHtml(track.title || 'Title unavailable')}</span>
    <span class="song-artist">${escapeHtml(track.artist || 'Artist unavailable')}</span>
    <span class="song-date">${escapeHtml(date)}</span>
  </a>`;
}

function pendingArt() {
  return `<div class="pending-gallery" aria-label="A dated playlist is waiting for its verified song catalogue">
    <div class="record-sleeve">
      <span class="sleeve-kicker">A DATE KEPT</span>
      <span class="sleeve-date">26<span>.</span>10<span>.</span>06</span>
      <span class="sleeve-caption">moments, remembered in songs</span>
      <span class="record-disc" aria-hidden="true"><i></i></span>
    </div>
    <div class="pending-note"><span class="note-index">01 / 01</span><span class="fine-rule"></span><span>13 tracks listed<br>details not yet fetched</span><a href="${safeExternalUrl(bootstrap.sourceUrl)}" target="_blank" rel="noreferrer">Open source ↗</a></div>
    <span class="gallery-caption">THE FIRST ENTRY · 2026 / 10</span>
  </div>`;
}

function galleryMarkup(playlists) {
  const tracks = playlists.flatMap((playlist) => playlist.tracks.map((track) => ({ ...track, playlist }))).slice(0, 7);
  if (!tracks.length) return pendingArt();
  return `<div class="album-gallery">${tracks.map(({ playlist, ...track }, index) => `<a class="gallery-album album-${index + 1}" href="${escapeHtml(track.id ? `https://y.qq.com/n/ryqq/songDetail/${encodeURIComponent(track.id)}` : safeExternalUrl(playlist.sourceUrl, '#archive'))}" target="_blank" rel="noreferrer" aria-label="${escapeHtml(track.title || 'Open song')} — ${escapeHtml(track.artist)}">${coverMarkup(track)}</a>`).join('')}<span class="gallery-caption">${tracks.length} RECENT LISTENING NOTES</span></div>`;
}

function timelineMarkup(playlists, limit = 4) {
  const ordered = [...playlists].filter((playlist) => playlist.date).sort((a, b) => b.date.localeCompare(a.date)).slice(0, limit);
  if (!ordered.length) {
    return `<div class="empty-timeline"><span class="timeline-mark"></span><div><span class="timeline-date">${bootstrap.name}</span><span class="timeline-weekday">Tue · 2026</span></div><div class="timeline-covers" aria-hidden="true">${Array.from({ length: 5 }, (_, i) => `<span class="mini-cover mini-${i + 1}"></span>`).join('')}</div><span class="timeline-count">13 tracks*</span><a class="row-arrow" href="#playlist?id=${encodeURIComponent(bootstrap.id)}" aria-label="Open ${bootstrap.name}">↗</a></div>
    <p class="source-footnote">* Listed in the project brief; song metadata has not yet been verified.</p>`;
  }
  return ordered.map((playlist) => {
    const [year, month, day] = playlist.date.split('-');
    const weekday = new Intl.DateTimeFormat('en', { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${playlist.date}T12:00:00Z`));
    const previews = playlist.tracks.slice(0, 6).map((track, index) => {
      const imageUrl = safeExternalUrl(track.coverUrl);
      return `<span class="mini-cover">${imageUrl ? `<img src="${escapeHtml(imageUrl)}" alt="" loading="lazy" onerror="this.remove()">` : `<i>${String(index + 1).padStart(2, '0')}</i>`}</span>`;
    }).join('');
    return `<div class="timeline-row"><a class="timeline-date-link" href="${playlistHref(playlist)}"><span class="timeline-date">${month}.${day}</span><span class="timeline-weekday">${weekday} · ${year}</span></a><div class="timeline-covers">${previews || '<span class="timeline-empty">No cover image</span>'}</div><span class="timeline-count">${playlist.tracks.length} tracks</span><a class="row-arrow" href="${playlistHref(playlist)}" aria-label="Open ${escapeHtml(playlist.name)}">↗</a></div>`;
  }).join('');
}

function renderHome() {
  const playlists = library?.playlists || [];
  const songs = playlists.flatMap((playlist) => playlist.tracks.map((track) => ({ track, playlist }))).sort((a, b) => (b.playlist.date || '').localeCompare(a.playlist.date || '') || a.track.index - b.track.index).slice(0, 6);
  const lastUpdated = library?.lastSyncedAt ? new Date(library.lastSyncedAt).toLocaleDateString('en-CA') : 'awaiting first sync';
  const latestYear = [...playlists].filter((playlist) => playlist.date).sort((a, b) => b.date.localeCompare(a.date))[0]?.date.slice(0, 4) || bootstrap.date.slice(0, 4);
  return `<div class="page-shell home-page">
    <section class="hero">
      <div class="hero-copy">
        <span class="eyebrow">AN ONGOING COLLECTION<br>OF MUSIC I'VE HEARD<br>AND LOVED.</span>
        <h1>听过的，<br>与喜欢的<span class="period">。</span></h1>
        <span class="hero-dash"></span>
        <p class="hero-subtitle">在日常之中，收集一些音乐，<br>也收集一些时刻。</p>
        <p class="hero-english">An ongoing collection of music<br>I've heard and loved.</p>
        <a class="text-link" href="#archive">Explore the archive <span>↗</span></a>
      </div>
      <div class="hero-art">${galleryMarkup(playlists)}</div>
      <span class="hero-index">COLLECTED, NOT RANKED <span>—</span> 01</span>
    </section>
    <section class="section recent-section">
      <div class="section-heading"><div><span class="eyebrow">THE LATEST</span><h2>最近收集</h2></div><a class="text-link" href="#archive">View archive <span>→</span></a></div>
      ${songs.length ? `<div class="song-grid">${songs.map(({ track, playlist }) => songCard(track, playlist)).join('')}</div>` : `<div class="quiet-empty"><span class="empty-mark">✳</span><div><p class="empty-title">The songs are on their way.</p><p>One dated playlist is recorded here. Its song details will appear after a successful public catalogue sync.</p></div><a href="${bootstrap.sourceUrl}" target="_blank" rel="noreferrer">Visit QQ Music <span>↗</span></a></div>`}
    </section>
    <section class="section timeline-section">
      <div class="section-heading"><div><span class="eyebrow">A LIFE IN LISTENING</span><h2>音乐时间线</h2></div><span class="year-note">${library?.playlists?.length ? `${latestYear} —` : `${latestYear} · FIRST ENTRY`}</span></div>
      <div class="timeline">${timelineMarkup(playlists)}</div>
    </section>
    <section class="archive-callout"><span class="eyebrow">SAVED BY DATE</span><p>Not a ranking. Not a recommendation.<br>Just the music that stayed.</p><a class="round-arrow" href="#archive" aria-label="Open archive">↗</a></section>
    <p class="sync-caption">CATALOGUE STATUS <span>${libraryError ? 'LOCAL DATA COULD NOT BE READ' : (library?.status === 'success' ? `LAST VERIFIED ${lastUpdated}` : (library?.status === 'partial' ? 'KNOWN PLAYLIST VERIFIED · FULL DIRECTORY PENDING' : 'FIRST PUBLIC API READ PENDING'))}</span></p>
  </div>`;
}

function renderArchive() {
  const params = routeParams();
  const playlists = library?.playlists || [];
  const dates = [...new Set([...playlists.map((playlist) => playlist.date).filter(Boolean), bootstrap.date])].sort((a, b) => b.localeCompare(a));
  const years = [...new Set(dates.map((date) => date.slice(0, 4)))].sort().reverse();
  const yearParam = params.get('year');
  const currentYear = yearParam || dates[0]?.slice(0, 4) || '2026';
  const visibleDates = currentYear === 'all' ? dates : dates.filter((date) => date.startsWith(currentYear));
  const months = [...new Set(visibleDates.map((date) => date.slice(0, 7)))].sort().reverse();
  const monthName = (month) => new Intl.DateTimeFormat('en', { month: 'long', timeZone: 'UTC' }).format(new Date(`${month}-01T12:00:00Z`));
  const archiveNote = library?.status === 'partial'
    ? 'The public playlist directory was unavailable; only the playlist data fetched successfully is shown.'
    : library?.status === 'success'
      ? 'Only playlists with date-formatted names are included in this archive.'
      : '* Playlist details are waiting for the first successful catalogue sync.';
  const dateLink = (date) => {
    const playlist = playlists.find((item) => item.date === date);
    const [year, month, day] = date.split('-');
    const count = playlist ? `${playlist.tracks.length} tracks` : `${bootstrap.trackCount} tracks*`;
    const covers = playlist?.tracks.slice(0, 5).map((track) => {
      const imageUrl = safeExternalUrl(track.coverUrl);
      return `<span class="archive-mini-cover">${imageUrl ? `<img src="${escapeHtml(imageUrl)}" alt="" loading="lazy" onerror="this.remove()">` : '♪'}</span>`;
    }).join('') || Array.from({ length: 4 }, () => '<span class="archive-mini-cover pending-mini">·</span>').join('');
    const href = playlist ? playlistHref(playlist) : (date === bootstrap.date ? `#playlist?id=${encodeURIComponent(bootstrap.id)}` : `#archive?date=${date}`);
    return `<a class="archive-date-row ${playlist ? '' : 'is-pending'}" href="${href}"><span class="archive-date"><strong>${month}.${day}</strong><small>${year}</small></span><span class="archive-preview">${covers}</span><span class="archive-date-count">${count}</span><span class="row-arrow">↗</span></a>`;
  };
  return `<div class="page-shell archive-page">
    <section class="page-intro"><span class="eyebrow">THE MUSIC ARCHIVE</span><h1>按时间浏览<span class="period">。</span></h1><p>每一天都有自己的声音。<br>按歌单原名与日期，一页一页慢慢听回去。</p></section>
    <div class="archive-toolbar"><div class="year-tabs">${years.map((year) => `<button class="year-tab ${year === currentYear ? 'active' : ''}" data-year="${year}">${year}</button>`).join('')}<span class="year-divider"></span><button class="year-tab all-years ${currentYear === 'all' ? 'active' : ''}" data-year="all">All years</button></div><span class="archive-total">${playlists.length} ${library?.status === 'success' ? 'verified' : 'saved'} ${playlists.length === 1 ? 'list' : 'lists'} <span>·</span> ${library?.trackCount || playlists.reduce((sum, item) => sum + (item.tracks?.length || 0), 0)} songs</span></div>
    ${months.map((month) => `<section class="archive-month" id="month-${month}"><div class="month-heading"><h2>${monthName(month)}</h2><span>${month.slice(0, 4)} / ${month.slice(5)}</span></div><div class="archive-date-list">${visibleDates.filter((date) => date.startsWith(month)).map(dateLink).join('')}</div></section>`).join('')}
    ${!months.length ? '<p class="archive-empty">Nothing has been archived yet.</p>' : ''}
    <p class="source-footnote">${archiveNote}</p>
  </div>`;
}

function playlistsById(id) {
  return library?.playlists?.find((playlist) => playlist.id === id) || null;
}

function renderPlaylistDetail(playlist) {
  const verified = Boolean(playlist.tracks);
  const date = playlist.date;
  const dateLabel = date ? date.replaceAll('-', '.') : 'date not parsed';
  const list = verified ? `<div class="track-list">${playlist.tracks.map((track, index) => `<div class="track-row"><span class="track-number">${String(index + 1).padStart(2, '0')}</span>${coverMarkup(track, 'track-cover')}<div class="track-meta"><strong>${escapeHtml(track.title || 'Title unavailable')}</strong><span>${artistLinks(track.artist)}${track.album ? ` · ${escapeHtml(track.album)}` : ''}</span></div><a href="${escapeHtml(songHref(track, playlist))}" target="_blank" rel="noreferrer" aria-label="Open in QQ Music">↗</a></div>`).join('')}</div>` : `<div class="detail-pending"><span class="pending-symbol">◌</span><div><strong>Song details haven't arrived yet.</strong><p>The source playlist is known, but its public catalogue could not be reached for verification. This entry contains no imported song data yet.</p></div></div>`;
  return `<div class="page-shell playlist-page"><a class="back-link" href="#archive">← 返回时间档案</a><section class="playlist-detail" id="playlist-detail"><div class="detail-heading"><div><span class="eyebrow">${verified ? 'PLAYLIST · PERSONAL COLLECTION' : 'SOURCE ENTRY · NOT YET VERIFIED'}</span><h1>${escapeHtml(playlist.name)}<span class="period">。</span></h1><p>${dateLabel} <span>·</span> ${verified ? `${playlist.tracks.length} 首收藏` : '13 首歌单条目待核验'}</p></div></div>${list}<a class="source-button" href="${escapeHtml(safeExternalUrl(playlist.sourceUrl))}" target="_blank" rel="noreferrer">在 QQ 音乐打开原歌单 <span>↗</span></a></section></div>`;
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
  return `<div class="page-shell stats-page"><section class="page-intro"><span class="eyebrow">A MAP OF WHAT STAYS</span><h1>收藏统计<span class="period">。</span></h1><p>从歌手、风格或自然周进入，回到这份收藏里的每一首歌。</p></section><section class="stats-summary"><span><strong>${totalSongs.toLocaleString()}</strong><small>首收藏记录</small></span><span><strong>${artistCount.toLocaleString()}</strong><small>位艺人</small></span><span><strong>${(library?.playlists || []).length}</strong><small>张歌单</small></span><span><strong>${weekIndex().length}</strong><small>有收藏的周</small></span></section><section class="stats-browser"><div class="stats-browser-heading"><div><span class="eyebrow">BROWSE YOUR COLLECTION</span><h2>按歌手、风格或周次浏览</h2></div><span class="stats-sort-note">${sortNote}</span></div><div class="stats-mode" role="tablist" aria-label="搜索类别"><button type="button" role="tab" aria-selected="${mode === 'artist'}" class="stats-mode-button ${mode === 'artist' ? 'active' : ''}" data-stats-mode="artist">歌手</button><button type="button" role="tab" aria-selected="${mode === 'style'}" class="stats-mode-button ${mode === 'style' ? 'active' : ''}" data-stats-mode="style">风格</button><button type="button" role="tab" aria-selected="${mode === 'week'}" class="stats-mode-button ${mode === 'week' ? 'active' : ''}" data-stats-mode="week">周</button></div><label class="stats-search"><span aria-hidden="true">⌕</span><input id="stats-search" type="search" value="${escapeHtml(query)}" placeholder="${placeholder}" autocomplete="off"><span class="search-hint">↵</span></label><div class="stats-results-heading"><span id="stats-results-title">${query ? '搜索结果' : defaultTitle}</span><span>${query ? '匹配收藏数由高到低' : sortNote}</span></div><div id="stats-results">${renderStatsResults(mode, query)}</div><p class="stats-method-note">${methodNote}</p></section></div>`;
}

function occurrenceRows(occurrences) {
  if (!occurrences.length) return '<p class="stats-empty">这份曲库里还没有匹配的收藏记录。</p>';
  const ordered = [...occurrences].sort((a, b) => (b.playlist.date || '').localeCompare(a.playlist.date || '') || a.track.index - b.track.index);
  return `<div class="track-list stats-track-list">${ordered.map(({ track, playlist }, index) => `<div class="track-row stats-track-row"><span class="track-number">${String(index + 1).padStart(2, '0')}</span>${coverMarkup(track, 'track-cover')}<div class="track-meta"><strong>${escapeHtml(track.title || 'Title unavailable')}</strong><span>${artistLinks(track.artist)}${track.album ? ` · ${escapeHtml(track.album)}` : ''}</span><span class="track-origin">收藏于 <a href="${playlistHref(playlist)}">${escapeHtml(playlist.name)} ↗</a></span></div><a href="${escapeHtml(songHref(track, playlist))}" target="_blank" rel="noreferrer" aria-label="在 QQ 音乐打开歌曲">↗</a></div>`).join('')}</div>`;
}

function renderArtistPage(name) {
  const occurrences = findArtistSongs(name);
  const firstTrack = occurrences[0]?.track;
  return `<div class="page-shell profile-page"><a class="back-link" href="#stats">← 返回 Stats</a><section class="profile-heading"><div class="profile-art">${firstTrack ? coverMarkup(firstTrack) : fallbackCover}</div><div><span class="eyebrow">ARTIST · SAVED IN THIS ARCHIVE</span><h1>${escapeHtml(name)}<span class="period">。</span></h1><p>${occurrences.length} 首收藏记录 <span>·</span> 来自 ${(new Set(occurrences.map(({ playlist }) => playlist.id))).size} 张歌单</p></div></section><section class="profile-song-section"><div class="month-heading"><h2>收藏曲目</h2><span>按歌单日期由近到远</span></div>${occurrenceRows(occurrences)}</section></div>`;
}

function renderStylePage(name) {
  const occurrences = findStyleSongs(name);
  const artists = [...new Set(occurrences.flatMap(({ track }) => artistNames(track.artist)).filter((artist) => artistTags(artist).includes(name)))];
  return `<div class="page-shell profile-page style-page"><a class="back-link" href="#stats?mode=style">← 返回风格检索</a><section class="profile-heading style-profile-heading"><div class="style-emblem" aria-hidden="true">♪</div><div><span class="eyebrow">STYLE · EDITORIAL ARTIST TAGS</span><h1>${escapeHtml(name)}<span class="period">。</span></h1><p>${occurrences.length} 首匹配收藏 <span>·</span> ${artists.length} 位已标注艺人</p></div></section><p class="style-disclosure">这是按艺人风格标签整理的收藏索引；同一位艺人的作品可能横跨多种风格。</p><section class="profile-song-section"><div class="month-heading"><h2>匹配曲目</h2><span>按歌单日期由近到远</span></div>${occurrenceRows(occurrences)}</section></div>`;
}

function renderWeekPage(key) {
  const week = weekIndex().find((item) => item.key === key);
  if (!week) return `<div class="page-shell missing-page"><a class="back-link" href="#stats?mode=week">← 返回周统计</a><h1>没有找到这一周的收藏。</h1></div>`;
  const occurrences = findWeekSongs(key);
  return `<div class="page-shell profile-page week-page"><a class="back-link" href="#stats?mode=week">← 返回周统计</a><section class="profile-heading week-heading"><div class="week-emblem" aria-hidden="true"><span>WEEK</span><strong>${String(week.weekNumber).padStart(2, '0')}</strong><small>MON — SUN</small></div><div><span class="eyebrow">CALENDAR WEEK · MONDAY—SUNDAY</span><h1>${week.weekYear} · 第 ${String(week.weekNumber).padStart(2, '0')} 周<span class="period">。</span></h1><p>${week.start.replaceAll('-', '.')} — ${week.end.replaceAll('-', '.')} <span>·</span> ${occurrences.length} 首收藏 <span>·</span> ${week.playlistCount} 张歌单</p></div></section><section class="profile-song-section"><div class="month-heading"><h2>本周收藏</h2><span>按日期由近到远</span></div>${occurrenceRows(occurrences)}</section></div>`;
}

function renderAbout() {
  return `<div class="page-shell about-page"><section class="about-hero"><span class="eyebrow">A SMALL NOTE ABOUT THIS PLACE</span><h1>Collected in moments,<br>remembered in songs<span class="period">。</span></h1><div class="about-rule"></div><p class="about-cn">这是一个慢慢长大的私人音乐档案。<br>收集那些听过的，与留下来的。</p><p>A small archive of music I've collected along the way.<br>Collected in moments, remembered in songs.</p><a class="text-link" href="https://c6.y.qq.com/base/fcgi-bin/u?__=fEuCQJiX90v6" target="_blank" rel="noreferrer">Find me on QQ Music <span>↗</span></a></section><div class="about-aside"><span class="about-seal">S<span>·</span>F</span><span class="eyebrow">PERSONAL MUSIC ARCHIVE</span><span>Since 2026</span><span>Listening without a score.</span></div><div class="about-bottom"><span>spurser.fm</span><span>Made for the music that stays.</span></div></div>`;
}

function render() {
  const route = routeName();
  const navRoute = route === 'playlist' ? 'archive' : (route === 'artist' || route === 'style' || route === 'week' ? 'stats' : route);
  document.querySelectorAll('.main-nav a').forEach((link) => link.classList.toggle('active', link.dataset.route === navRoute));
  headerStatus.textContent = library?.status === 'success' ? `${library.playlistCount} collections` : (library?.status === 'partial' ? 'Partial catalogue' : 'A personal archive');
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
  const mode = routeParams().get('mode') === 'style' ? 'style' : 'artist';
  const results = document.querySelector('#stats-results');
  if (!results) return;
  results.innerHTML = renderStatsResults(mode, event.target.value);
  const title = document.querySelector('#stats-results-title');
  if (title) title.textContent = event.target.value.trim() ? '搜索结果' : (mode === 'artist' ? '高频收藏歌手' : '曲库中的风格');
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
