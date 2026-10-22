# dusk

A link-in-bio site. Log in with Discord, build your page, upload MP3s, and show your live Discord status.

- **Discord login** (OAuth2). No typing in IDs.
- **Music tab**: upload an MP3, enter the song name and artist. Synced lyrics come from [LRCLIB](https://lrclib.net). The cover is read from the MP3, or found through an iTunes search if the file has none. You can also upload your own cover.
- **Live Discord status and Spotify** through [Lanyard](https://github.com/Phineas/lanyard), with lyrics that follow the song.
- Two lyrics styles per source: a panel beside the card, or a Dynamic Island pill at the top of the page (tap it to open controls and lyrics).
- Written in TypeScript. Server in `src/server`, web app in `src/web`, shared types in `src/shared`.

## The twilight look

The site has its own identity now: deep indigo and violet with a warm amber horizon glow, soft grain
over the top, and layered depth instead of flat black and white. Every public page sits inside a
glass bar with the dusk mark, an **Edit page** button and a **Share** button. Each profile keeps
its own theme on top of that — the twilight chrome is the frame, your colours are the picture.

Twelve themes (Dusk, Midnight, Frost, Neon, Sunset, Ocean, Forest, Rose, Slate, Ember, Lilac, Moss)
and seventeen backgrounds (Solid, Gradient, Aurora, Particles, Grid, Dots, Lines, Spotlight, Waves,
Bokeh, Beams, Contours, Mesh, Stars, Rain, …) are yours to mix, saved as you make them.

## What is on your page

- **Groups of links** — put links under headings like *Work* or *Elsewhere*. Links with no heading
  sit at the top, and the headings render on the public page with a hairline rule.
- **Page insights** — how many people opened your page, which days they came, and which links they
  actually clicked. The counts are only ever about your own page; you never see who they are.
- **A social preview image** — a 1200×630 card of your page, drawn in your browser in the colours
  of your page, for posting your link in a chat or on a feed.
- **A badge for your README** — a small SVG of your page that follows the colours you pick, with
  a one-line markdown snippet to paste in.
- **Roles as tags** — your roles in the Discord server show under your name, and you hide the ones
  you would rather not show.

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

## Supabase (no persistent disk needed)

Set `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` and dusk keeps its database in a Supabase table and its MP3s, covers and avatars in a private Storage bucket (`dusk`, created on first start). Run `supabase/setup.sql` in the Supabase SQL Editor once. Without those two variables everything stays in `DATA_DIR`.

The database is stored as one JSON document, which is fine for a small site on a single server. Run one instance only.

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
src/web      Vite app: views/ (pages), views/panes/ (dashboard tabs), render/ (the profile and the
             live preview), ui/ (chrome, icons, toast), media/ (player, Lanyard, lyrics), styles/
```
