<p align="center">
  <img src="public/favicon.svg" alt="VIBREO logo" width="84" height="84" />
</p>

<h1 align="center">VIBREO</h1>

<p align="center">
  <strong>Music charts that feel alive.</strong>
</p>

<p align="center">
  <a href="https://vibreo.es">Open vibreo.es</a>
</p>

---

## What Is Vibreo?

VIBREO is a music discovery website for checking what is moving across the world right now.

It brings together global and country-level chart views, lets you jump between songs, artists and albums, and wraps the experience in a dark, video-led interface built for quick browsing.

## Screenshots

| Global pulse | USA charts |
| --- | --- |
| ![VIBREO home screen showing the global top song and what's hot list](public/screenshots/home.png) | ![VIBREO USA chart screen showing the songs chart](public/screenshots/usa-chart.png) |

## What You Can Do

- 🔥 See what is hot globally.
- 🌍 Browse charts by country.
- 🎧 Switch between songs, artists and albums.
- 🔎 Search the catalog.
- 📈 Follow chart movement, streams and positions.
- 🎬 Enjoy video-backed hero sections where available.
- 📱 Use it comfortably on desktop and mobile.

## Where The Data Comes From

The public API is `https://api.vibreo.es`. Vercel routes that hostname to the
allowlisted API proxy in this repository. Browser data and hero videos use
`/api-proxy` on the website's own origin, avoiding a separate browser connection
to Cloudflare's edge. The proxy reads from the existing
`vibreo-api.gonzalo-lopez-gil.workers.dev` Worker, so its upstream must not point
back to `api.vibreo.es` (that would create a loop).

The API DNS record is a DNS-only CNAME to `cname.vercel-dns.com`; the existing
Cloudflare Worker and R2 bucket continue serving the data. JSON requests to the
API hostname retain the `Origin: https://vibreo.es` requirement. Media requests
retain origin/referer checks, stream without buffering, and forward range and
media response headers. Public API and media responses bypass the shared CDN
cache so access checks always run.

The interface may show music and platform metadata related to Spotify, Apple Music, YouTube, iTunes, Shazam and Deezer when that information is returned by the API.

## For Developers

This repository contains the frontend for [vibreo.es](https://vibreo.es).

```bash
npm install
npm run dev
```

Useful checks:

```bash
npm run lint
npm run typecheck
npm test -- --coverage
npm run build
```

Tech stack: Next.js 16, React 19, TypeScript, Tailwind CSS and Jest.

## License

MIT © [Gonzalo López Gil](https://github.com/gonzalopezgil)
