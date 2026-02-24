# Home — Personal Dashboard

A minimal, elegant personal startpage built entirely by [Claude](https://claude.ai) (Anthropic) through iterative conversations with Barros. Every line of HTML, CSS, and JavaScript was written by Claude based on Barros's requirements and feedback — no templates, no frameworks, no manual coding.

## What it does

**Home** is a single-page dashboard designed to be a browser start page, combining daily essentials into one clean interface:

- **Quick Links** — bookmarks organised by category, editable in place
- **RSS Feeds** — aggregated news from configured sources, fetched via proxy
- **Calendar** — monthly view with events pulled from CalDAV (Fastmail) and ICS feeds
- **Todoist Integration** — tasks with three views: Today (including overdue), Upcoming (rest of the week), and All Tasks
- **Weather** — current conditions and 7-day forecast via Open-Meteo, with air quality index; auto-refreshes every 30 minutes
- **Daily Briefing** — AI-generated morning/afternoon/evening summary of your calendar, tasks, and weather, powered by Claude Sonnet
- **Sports Briefing** — AI-generated overview of upcoming matches from 17+ ICS sports calendar feeds (Formula 1, Champions League, Europa League, Premier League, and more)
- **Quick Notes** — simple scratchpad accessible from the header
- **Claude Chat** — embedded assistant for quick questions

## Architecture

The application is split into two parts:

| Component | Hosted on | Purpose |
|-----------|-----------|---------|
| `index.html` + `app.js` | GitHub Pages (`home.barros.work`) | UI, all client-side logic |
| `worker.js` | Cloudflare Worker (`api.barros.work`) | Auth, CORS proxy, API relay (Claude, Todoist, CalDAV), KV settings storage |

All user settings (links, feeds, API keys, calendars) are stored in Cloudflare Workers KV, synced automatically across devices via a unique token.

## Authentication

The site is protected by token-based authentication. The Worker validates credentials against encrypted secrets and issues a signed HMAC-SHA256 token (30-day expiry) stored as a cookie. All Worker routes require a valid token — the static HTML is public, but without authentication no data or API calls are accessible.

## Design

The visual style is intentionally warm and typographic — no bright colours, no harsh contrasts. The palette is built around cream, sand, and brown tones. Typography uses Cormorant Garamond for headers, EB Garamond for body text, and Josefin Sans for labels and UI elements.

## Built with Claude

This project was developed entirely through conversation. Barros described what he wanted; Claude wrote the code. Every feature, every bug fix, every design decision went through this loop — describe, generate, test, refine. The current version (5.3.3) is the result of dozens of iterative sessions.

No code was written by hand.
