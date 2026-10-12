# spurser.fm

A quiet, date-led archive for music collected in QQ Music. The site is a dependency-free static front end; the Node.js sync script reads the public PlaylistOut API and writes one JSON snapshot for the site.

## Run locally

Requires Node.js 20 or newer. From this folder:

```sh
npm run dev
```

Open <http://127.0.0.1:5173>. The server serves the `public` directory and needs no package install.

## Build and verify

```sh
npm test
npm run build
```

The build output is `dist/` and can be hosted as a static site.

## Data sync

```sh
npm run sync
```

The sync script reads `QQ_MUSIC_PROFILE_URL` when set. It rate-limits requests, retries transient failures, validates each date-formatted playlist against its reported track count, and atomically updates `public/data/library.json` only after the selected playlists are complete. Names without a valid calendar date are excluded from the website. If a first import cannot read the directory, it can save the known dated playlist with `partial` status; a partial refresh never replaces an existing full snapshot. Failures are appended to `sync-log.jsonl`.

On 2026-10-10, the supplied QQ number resolved to the public account `spurser`. The source directory contained 97 playlists; the website includes only the 69 playlists with date-formatted names (465 saved track entries). The other 28 playlists are excluded from the published snapshot and its pages. The public snapshot stores the opaque profile share link, not the numeric QQ number. See [the data validation record](docs/data-validation.md). The local CLI and scheduled GitHub Actions run have not been verified end to end.

## GitHub Pages deployment and daily updates

The workflows in `.github/workflows/` publish the static site and run a daily sync at 09:15 China Standard Time (01:15 UTC). To use them:

1. Put this project on a GitHub repository whose default branch is named `main`.
2. Add a repository secret named `QQ_MUSIC_PROFILE_URL` with the QQ number or a supported public profile URL. The workflow reads this secret for sync; it does not put the numeric identifier into the published data.
3. In repository settings, set **Pages → Build and deployment → Source** to **GitHub Actions**.
4. Allow GitHub Actions to write repository contents so a successful sync can commit the refreshed snapshot.
5. Run **Publish spurser.fm** once from the Actions tab. The public URL appears in the deployment job summary.

The scheduled workflow fetches the catalogue, commits its snapshot and log, then deploys. If sync fails, it records the failure and keeps the previous published snapshot. No QQ Music password, Cookie or login token is used. GitHub Pages itself requires a GitHub repository; this working folder currently has no Git remote, so no public URL has been created from this environment.

## Pages and data boundaries

- Home, Archive, Stats and About are responsive HTML/CSS/JavaScript views. Every archive and timeline playlist link opens its own song-list page.
- Stats searches artists and styles and groups saved tracks by ISO calendar week (Monday through Sunday). Artist and weekly counts are saved track occurrences; repeat saves count again. Week entries open a page with that week's dated playlists and songs. Style pages use the editable artist tags in `public/data/artist-styles.json`, so the same artist can appear under more than one style.
- The provider snapshot has no track-level genre field. Style pages are an editorial artist-level index, not official genre metadata for each recording.
- Song entries appear only after they have been fetched from the API. Playlists whose names do not contain a valid calendar date are excluded from the public data and all page counts.
- Repeated songs remain attached to each dated playlist where they were collected.
- QQ Music cover artwork is referenced remotely from API-provided URLs, not copied into this repository.
- A generated static build is available at `dist/` after `npm run build`.
