import { appendFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { normalizePlaylist, parsePlaylistDate, userPlaylistsFromResolve } from './data.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const snapshotPath = resolve(root, 'public/data/library.json');
const logPath = resolve(root, 'sync-log.jsonl');
const profileUrl = process.env.QQ_MUSIC_PROFILE_URL || 'https://c6.y.qq.com/base/fcgi-bin/u?__=fEuCQJiX90v6';
const publicProfileUrl = 'https://c6.y.qq.com/base/fcgi-bin/u?__=fEuCQJiX90v6';
const knownPlaylist = { id: '9789171839', name: '26.10.6', trackCount: 13, sourceUrl: 'https://y.qq.com/n/ryqq/playlist/9789171839' };
const baseUrl = (process.env.PLAYLISTOUT_API_BASE || 'https://playlistout-api.lengxiqwq.com').replace(/\/$/, '');
const requestGapMs = Math.max(0, Number(process.env.PLAYLISTOUT_REQUEST_GAP_MS || 2200));
const allowLargeSyncChange = process.env.ALLOW_LARGE_SYNC_CHANGE === 'true';
const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

async function requestJson(path, params = {}) {
  const url = new URL(`${baseUrl}${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: 'application/json', 'User-Agent': 'spurser.fm/1.0 (personal music archive)' }
      });
      if (response.status === 429 || response.status >= 500) {
        const retryAfter = Number(response.headers.get('retry-after'));
        const waitMs = retryAfter > 0 ? Math.min(retryAfter * 1000, 60_000) : 1000 * (attempt + 1);
        lastError = new Error(`HTTP ${response.status} from PlaylistOut`);
        if (attempt < 2) await sleep(waitMs);
        continue;
      }
      const payload = await response.json();
      if (!response.ok || payload?.success === false) {
        const error = new Error(`PlaylistOut ${response.status}: ${payload?.error?.code || payload?.error?.message || 'request failed'}`);
        error.retryable = false;
        throw error;
      }
      return payload;
    } catch (error) {
      if (error?.retryable === false) throw error;
      lastError = error?.name === 'AbortError' ? new Error(`Request timed out: ${path}`) : error;
      if (attempt < 2) await sleep(750 * (attempt + 1));
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError || new Error(`Request failed: ${path}`);
}

function resultData(payload) {
  return payload?.data?.result ?? payload?.data ?? payload;
}

async function getPlaylistDirectory(apiRequest = requestJson) {
  try {
    const resolved = await apiRequest('/api/v1/resolve', { q: profileUrl, type: 'user', platform: 'qqmusic' });
    const playlists = userPlaylistsFromResolve(resolved);
    if (playlists) return { playlists, via: 'resolve' };
  } catch (error) {
    console.warn(`Profile resolver unavailable: ${error.message}`);
  }
  try {
    const directory = await apiRequest('/api/v1/user/playlists', { uid: profileUrl, platform: 'qqmusic' });
    const result = resultData(directory);
    if (!Array.isArray(result?.playlists)) throw new Error('Profile response did not contain a playlist array');
    return { playlists: result.playlists, via: 'user/playlists' };
  } catch (error) {
    console.warn(`User playlist directory unavailable: ${error.message}`);
    return { playlists: [], via: null };
  }
}

async function appendLog(entry) {
  await mkdir(dirname(logPath), { recursive: true });
  await appendFile(logPath, `${JSON.stringify(entry)}\n`, 'utf8');
}

async function appendGithubSummary(markdown) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) return;
  try {
    await appendFile(summaryPath, `${markdown.trim()}\n`, 'utf8');
  } catch {
    // A reporting failure must not invalidate a successfully fetched snapshot.
  }
}

async function writeSnapshot(snapshot) {
  await mkdir(dirname(snapshotPath), { recursive: true });
  const temporaryPath = `${snapshotPath}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, snapshotPath);
}

async function readSnapshot() {
  try {
    return JSON.parse(await readFile(snapshotPath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

export async function runSync({ now = new Date(), request = requestJson, log = appendLog, save = writeSnapshot, load = readSnapshot, directory } = {}) {
  const startedAt = now.toISOString();
  let previous;
  try {
    previous = await load();
    const { playlists: catalog, via } = await (directory ? directory() : getPlaylistDirectory(request));
    const catalogEntries = catalog.filter((item) => String(item?.id ?? '').length > 0);
    const fullDirectory = Boolean(via && catalog.length > 0 && catalogEntries.length === catalog.length);
    const candidates = new Map();
    let excludedUndatedPlaylistCount = 0;
    for (const item of catalogEntries) {
      const id = String(item?.id ?? '');
      const name = String(item?.name || (id === knownPlaylist.id ? knownPlaylist.name : '')).trim();
      if (!parsePlaylistDate(name)) {
        excludedUndatedPlaylistCount += 1;
        continue;
      }
      if (id) candidates.set(id, { ...item, name });
    }
    const datedCandidateCount = candidates.size;

    if (!fullDirectory && previous?.status === 'success') {
      const entry = {
        at: startedAt,
        status: 'partial',
        directoryEndpoint: via,
        sourcePlaylistCount: catalogEntries.length,
        datedPlaylistCount: datedCandidateCount,
        error: 'Profile directory unavailable or incomplete; kept the previous full snapshot',
        snapshotPreserved: true
      };
      await log(entry);
      await appendGithubSummary(`## QQ Music sync\n\n- Outcome: previous complete snapshot preserved.\n- Directory: unavailable or incomplete.\n- Last published data remains unchanged.`);
      return { ...previous, syncOutcome: 'preserved' };
    }

    const previousDatedCount = Array.isArray(previous?.playlists)
      ? previous.playlists.filter((playlist) => playlist.date).length
      : 0;
    const previousSourceCount = Number(previous?.sourcePlaylistCount) || 0;
    const directoryShrankSignificantly = (previousSourceCount > 0 && catalogEntries.length < previousSourceCount * 0.5)
      || (previousDatedCount > 0 && datedCandidateCount < previousDatedCount * 0.5);
    if (previous?.status === 'success' && fullDirectory && directoryShrankSignificantly && !allowLargeSyncChange) {
      const entry = {
        at: startedAt,
        status: 'partial',
        directoryEndpoint: via,
        sourcePlaylistCount: catalogEntries.length,
        datedPlaylistCount: datedCandidateCount,
        error: 'Public directory shrank by more than 50%; kept the previous full snapshot. Review the change before allowing it.',
        snapshotPreserved: true
      };
      await log(entry);
      await appendGithubSummary(`## QQ Music sync\n\n- Outcome: previous complete snapshot preserved.\n- Reason: the public directory returned less than half its previous size.\n- Review the directory before manually allowing a large change.`);
      return { ...previous, syncOutcome: 'preserved' };
    }

    if (!candidates.has(knownPlaylist.id)) candidates.set(knownPlaylist.id, knownPlaylist);

    const playlists = [];
    let position = 0;
    for (const source of candidates.values()) {
      if (position > 0 && requestGapMs > 0) await sleep(requestGapMs);
      const payload = await request('/api/v1/playlist', { id: String(source.id), platform: 'qqmusic' });
      const playlist = normalizePlaylist(source, resultData(payload));
      if (!playlist.date) {
        excludedUndatedPlaylistCount += 1;
        position += 1;
        continue;
      }
      playlists.push(playlist);
      position += 1;
      console.log(`Fetched ${playlist.name}: ${playlist.tracks.length} tracks`);
    }
    if (!playlists.length) throw new Error('No playlists were successfully read');
    const snapshot = {
      schemaVersion: 1,
      status: fullDirectory ? 'success' : 'partial',
      lastSyncedAt: now.toISOString(),
      source: { provider: 'PlaylistOut Public API', profileUrl: publicProfileUrl, directoryEndpoint: via },
      knownSource: { ...knownPlaylist, date: parsePlaylistDate(knownPlaylist.name), provenance: 'owner-provided, fetched by PlaylistOut API' },
      directoryStatus: fullDirectory ? 'verified' : 'unavailable',
      playlistCount: playlists.length,
      trackCount: playlists.reduce((sum, playlist) => sum + playlist.tracks.length, 0),
      unparsedDateCount: 0,
      sourcePlaylistCount: catalogEntries.length,
      excludedUndatedPlaylistCount,
      playlists
    };
    await save(snapshot);
    await log({ at: startedAt, status: snapshot.status, directoryEndpoint: via, playlists: playlists.length, tracks: snapshot.trackCount, excludedUndatedPlaylistCount, snapshotPreserved: false });
    await appendGithubSummary(`## QQ Music sync\n\n- Outcome: **${snapshot.status}**\n- Last synced: ${snapshot.lastSyncedAt}\n- Dated playlists: ${snapshot.playlistCount}\n- Saved track occurrences: ${snapshot.trackCount}\n- Undated playlists excluded: ${snapshot.excludedUndatedPlaylistCount}`);
    return snapshot;
  } catch (error) {
    const entry = { at: startedAt, status: 'failed', error: String(error?.message || error), snapshotPreserved: true };
    await log(entry);
    await appendGithubSummary(`## QQ Music sync\n\n- Outcome: **failed**; the previous snapshot was preserved.\n\n\`\`\`text\n${entry.error}\n\`\`\``);
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const snapshot = await runSync();
    if (snapshot.syncOutcome === 'preserved') {
      console.error('Sync incomplete; the previous full snapshot was preserved.');
      process.exitCode = 1;
    } else {
    console.log(`Sync complete: ${snapshot.playlistCount} dated playlists, ${snapshot.trackCount} tracks; excluded ${snapshot.excludedUndatedPlaylistCount} undated playlists`);
    }
  } catch (error) {
    console.error(`Sync failed; the last successful snapshot was preserved. ${error.message}`);
    process.exitCode = 1;
  }
}
