import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePlaylist, parsePlaylistDate, userPlaylistsFromResolve } from '../scripts/data.mjs';
import { runSync } from '../scripts/sync.mjs';

test('parses supported date playlist names without guessing', () => {
  assert.equal(parsePlaylistDate('26.10.6'), '2026-10-06');
  assert.equal(parsePlaylistDate('26.10.09'), '2026-10-09');
  assert.equal(parsePlaylistDate('2026-10-09'), '2026-10-09');
  assert.equal(parsePlaylistDate('October 9'), null);
  assert.equal(parsePlaylistDate('26.02.30'), null);
});

test('normalizes fields and keeps repeated tracks as separate positions', () => {
  const playlist = normalizePlaylist({ id: '1', name: '26.10.6' }, {
    id: '1', name: '26.10.6', trackCount: 2,
    tracks: [
      { id: 'same', title: 'First', artist: [{ name: 'A' }], index: 1 },
      { id: 'same', title: 'Again', artists: ['A', 'B'], index: 2 }
    ]
  });
  assert.equal(playlist.date, '2026-10-06');
  assert.equal(playlist.tracks.length, 2);
  assert.equal(playlist.tracks[0].artist, 'A');
  assert.equal(playlist.tracks[1].artist, 'A / B');
});

test('fails closed when a playlist track list is incomplete', () => {
  assert.throws(() => normalizePlaylist({ id: '1', name: '26.10.6' }, {
    id: '1', name: '26.10.6', trackCount: 13, tracks: [{ id: 'one' }]
  }), /incomplete/);
});

test('extracts the documented user playlist response envelope', () => {
  assert.deepEqual(userPlaylistsFromResolve({ data: { kind: 'user_playlists', result: { playlists: [{ id: '1' }] } } }), [{ id: '1' }]);
  assert.equal(userPlaylistsFromResolve({ data: { kind: 'playlist', result: {} } }), null);
});

test('a failed first import logs failure and never replaces the previous snapshot', async () => {
  let saved = false;
  let logEntry;
  await assert.rejects(runSync({
    now: new Date('2026-10-09T00:00:00.000Z'),
    directory: async () => ({ playlists: [], via: null }),
    request: async () => { throw new Error('network unavailable'); },
    log: async (entry) => { logEntry = entry; },
    save: async () => { saved = true; }
  }), /network unavailable/);
  assert.equal(saved, false);
  assert.equal(logEntry.status, 'failed');
  assert.equal(logEntry.snapshotPreserved, true);
});

test('a first partial read can save only the known playlist with a partial status', async () => {
  let saved;
  const snapshot = await runSync({
    now: new Date('2026-10-09T00:00:00.000Z'),
    directory: async () => ({ playlists: [], via: null }),
    request: async () => ({ success: true, data: {
      id: '9789171839', name: '26.10.6', trackCount: 13,
      tracks: Array.from({ length: 13 }, (_, index) => ({ id: `track-${index}`, title: `Track ${index + 1}` }))
    } }),
    load: async () => null,
    log: async () => {},
    save: async (value) => { saved = value; }
  });
  assert.equal(snapshot.status, 'partial');
  assert.equal(snapshot.playlistCount, 1);
  assert.equal(snapshot.trackCount, 13);
  assert.equal(saved.status, 'partial');
});

test('a partial directory refresh cannot replace a prior full snapshot', async () => {
  const previous = { status: 'success', playlistCount: 97, trackCount: 500, playlists: Array(97).fill({ id: 'old' }) };
  let saved = false;
  let logEntry;
  const result = await runSync({
    directory: async () => ({ playlists: [], via: null }),
    request: async () => ({ success: true, data: {
      id: '9789171839', name: '26.10.6', trackCount: 13,
      tracks: Array.from({ length: 13 }, (_, index) => ({ id: `track-${index}`, title: `Track ${index + 1}` }))
    } }),
    load: async () => previous,
    log: async (entry) => { logEntry = entry; },
    save: async () => { saved = true; }
  });
  assert.equal(result.syncOutcome, 'preserved');
  assert.equal(result.playlistCount, 97);
  assert.equal(saved, false);
  assert.equal(logEntry.status, 'partial');
  assert.equal(logEntry.snapshotPreserved, true);
});
