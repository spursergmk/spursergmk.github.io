export function parsePlaylistDate(name) {
  const match = String(name || '').trim().match(/^(\d{2}|\d{4})[.\/_-](\d{1,2})[.\/_-](\d{1,2})$/);
  if (!match) return null;
  const yearPart = Number(match[1]);
  const year = match[1].length === 2 ? 2000 + yearPart : yearPart;
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function artistText(artist) {
  if (typeof artist === 'string') return artist.trim();
  if (!Array.isArray(artist)) return '';
  return artist.map((item) => typeof item === 'string' ? item : item?.name || item?.title || '').filter(Boolean).join(' / ');
}

export function normalizePlaylist(source, parsed) {
  const id = String(parsed?.id ?? source?.id ?? '');
  const name = String(parsed?.name ?? source?.name ?? '').trim();
  const sourceUrl = String(parsed?.sourceUrl ?? source?.sourceUrl ?? `https://y.qq.com/n/ryqq/playlist/${encodeURIComponent(id)}`);
  const rawTracks = Array.isArray(parsed?.tracks) ? parsed.tracks : null;
  if (!id || !name || !rawTracks) throw new Error(`Playlist ${id || '(unknown)'} returned no track list`);
  const trackCount = Number.isFinite(Number(parsed.trackCount)) ? Number(parsed.trackCount) : rawTracks.length;
  if (trackCount !== rawTracks.length) {
    throw new Error(`Playlist ${id} is incomplete: expected ${trackCount} tracks, received ${rawTracks.length}`);
  }
  return {
    id,
    name,
    date: parsePlaylistDate(name),
    trackCount,
    sourceUrl,
    coverUrl: typeof parsed.coverUrl === 'string' ? parsed.coverUrl : '',
    creator: typeof parsed.creator === 'string' ? parsed.creator : '',
    tracks: rawTracks.map((track, index) => ({
      index: Number.isFinite(Number(track?.index)) ? Number(track.index) : index + 1,
      id: String(track?.id ?? ''),
      title: String(track?.title ?? track?.name ?? '').trim(),
      artist: artistText(track?.artist || track?.artists),
      album: String(track?.album ?? '').trim(),
      durationMs: track?.durationMs == null ? null : (Number.isFinite(Number(track.durationMs)) ? Number(track.durationMs) : null),
      coverUrl: typeof track?.coverUrl === 'string' ? track.coverUrl : '',
      isAvailable: typeof track?.isAvailable === 'boolean' ? track.isAvailable : null
    }))
  };
}

export function userPlaylistsFromResolve(payload) {
  const data = payload?.data;
  if (data?.kind === 'user_playlists' && Array.isArray(data?.result?.playlists)) return data.result.playlists;
  if (data?.kind === 'user_playlists' && Array.isArray(data?.playlists)) return data.playlists;
  if (data?.platform === 'qqmusic' && Array.isArray(data?.playlists)) return data.playlists;
  return null;
}
