# dusk

A link-in-bio site. Log in with Discord, build your page, upload MP3s, and show your live Discord status.

- **Discord login** (OAuth2). No typing in IDs.
- **Music tab**: upload an MP3, enter the song name and artist. Synced lyrics come from [LRCLIB](https://lrclib.net). The cover is read from the MP3, or found through an iTunes search if the file has none. You can also upload your own cover.
- **Live Discord status and Spotify** through [Lanyard](https://github.com/Phineas/lanyard), with lyrics that follow the song.
- Two lyrics styles per source: a panel beside the card, or a Dynamic Island pill at the top of the page (tap it to open controls and lyrics).
- Written in TypeScript. Server in `src/server`, web app in `src/web`, shared types in `src/shared`.

## 1. Create the Discord application

1. Go to <https://discord.com/developers/applications> and create an application.
2. Under **OAuth2**, copy the **Client ID** and **Client Secret**.
3. Under **OAuth2 → Redirects**, add `http://localhost:5173/auth/discord/callback` (and your real address when you host it, e.g. `https://example.com/auth/discord/callback`).

## 2. Configure

```
cp .env.example .env
```

Fill in `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_REDIRECT_URI` and a long random `SESSION_SECRET`
(`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`).

## 3. Run

```
npm install
npm run dev        # server on :3000, site on http://localhost:5173
```

Production:

```
npm run build
npm start          # serves the site and the API on PORT (default 3000)
```

Put it behind HTTPS. Set `TRUST_PROXY=1` behind a reverse proxy, and keep `DATA_DIR` on a disk that persists: it holds the database (`db.json`) and the uploaded files. In production `DISCORD_REDIRECT_URI` and `BASE_URL` must be your real address.

## Live Discord status

Lanyard can only see accounts that joined its Discord server: <https://discord.gg/lanyard>. Join with the same account you log in with, then turn on **Discord → Show my live Discord status** in the dashboard.

## Test login without Discord

`DEV_LOGIN=1 npm run dev`, then open `http://localhost:5173/auth/dev?as=anyname`. It is ignored in production.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | server and site with reload |
| `npm run typecheck` | checks web and server |
| `npm run build` | typecheck, build the site, bundle the server |
| `npm start` | run the built app |

## Layout

```
src/shared   types, limits, themes, username rules (used by both sides)
src/server   Express app: auth, profile, tracks (upload, LRCLIB, covers), public pages, media
src/web      Vite app: views/ (pages and dashboard tabs), render/ (the profile), media/ (player, Lanyard, lyrics), styles/
```
