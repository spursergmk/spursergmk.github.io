# QQ Music data validation

Checked 2026-10-09 (Asia/Shanghai), before implementing the public catalogue.

## API contract reviewed

The [PlaylistOut Public API documentation](https://github.com/LengxiQwQ/playlistout/blob/main/docs/API.md) describes:

- `GET /api/v1/resolve?q=...&type=user&platform=qqmusic` for a QQ Music profile URL.
- `GET /api/v1/user/playlists?uid=...&platform=qqmusic` for the public playlist directory.
- `GET /api/v1/playlist?id=...&platform=qqmusic` for a single playlist.
- Successful responses use a `{ success, data, meta }` envelope. Playlist tracks expose title, artist, album, id, duration and cover URL fields.
- The documented per-IP limit is 30 requests/minute for each of these public endpoints.

## Live checks

| Check | Result |
| --- | --- |
| Profile resolver with the supplied share URL | No API response. Browser navigation reported `ERR_CONNECTION_CLOSED`; the local command-line request could not resolve the API host. |
| Public user-playlist directory | No API response; DNS lookup for `playlistout-api.lengxqwq.com` failed in the local environment. |
| Playlist `9789171839` | No API response; DNS lookup for `playlistout-api.lengxqwq.com` failed in the local environment. |
| Number of public playlists / date-named playlists | Not verified. |
| Track titles, artists, albums, IDs or cover URLs | Not verified. No track data has been fabricated or imported. |

The browser and command-line failures establish that this environment could not reach the API host. They do not establish whether the remote API service itself is unavailable. The known playlist name, ID and reported count in the initial site state come only from the project brief and remain explicitly marked as unverified.

The sync script is ready to retry from a network that can reach PlaylistOut. It writes a new snapshot only after every selected playlist has been fetched and checked for completeness. If the profile directory is unavailable on a first import but the known playlist can be read, that single playlist can be stored with an explicit `partial` status. A partial refresh never replaces an existing full snapshot. A failed playlist fetch appends a log entry and leaves the prior snapshot untouched. The original QQ Music page was also unavailable to the web reader during this check, so it could not provide a verified fallback here.

## Artwork note

The API documentation includes QQ Music artwork URLs in its data contract. The site uses those remote URLs only when a verified API response supplies them; it does not download or rehost cover images. This implementation does not independently confirm the platform's public-display license terms.

## Full import update — 2026-10-10 (Asia/Shanghai)

### Public directory and catalogue

- PlaylistOut resolved the user-provided QQ number to the public account `spurser` and returned 97 playlists.
- All 97 playlists were fetched sequentially with a 2.2-second gap. The sync normalizer checked each returned track list against its reported count before saving.
- The source import contained 97 playlists and 3,064 tracks. The published site now retains only the 69 date-formatted playlists, totaling 465 track entries; the other 28 playlists are excluded from the public snapshot and all site counts.
- Across the source import's 3,064 tracks, title, artist, and song ID fields were present for every record. Three records had no album name and three had no cover URL; the site uses its existing fallbacks for missing artwork.
- The known playlist `9789171839` is included with all 13 tracks. No song entries were fabricated.

### Privacy and recurring sync

- The numeric QQ number was used only as the `QQ_MUSIC_PROFILE_URL` process setting for this import. The public snapshot stores the supplied opaque share link instead of the numeric identifier.
- The daily GitHub Actions workflow now reads `QQ_MUSIC_PROFILE_URL` from a repository secret. Configure that secret to enable future full-directory refreshes; no password, cookie, or login token is needed.
- This checkout has no Git remote, so the scheduled workflow could not be run here. The standard local `npm run sync` also still encounters `fetch failed` in this runtime; this full import used the sync normalizer and snapshot writer with a working direct request transport.
