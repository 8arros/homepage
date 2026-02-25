# How to Host Your Own Copy

A step-by-step guide to deploy your own instance of Home. No coding knowledge required — just follow each step in order.

## What You'll Need

- A **GitHub** account (free) — to host the frontend files
- A **Cloudflare** account (free) — to run the backend worker and manage your domain
- A **domain name** — either bought through Cloudflare or another registrar
- About **30 minutes** of your time

## Architecture Overview

The site has two parts:

| Part | What it does | Where it runs |
|------|-------------|---------------|
| **Frontend** (`index.html` + `app.js`) | Everything you see — the UI | GitHub Pages |
| **Backend** (`worker.js`) | Authentication, API proxy, settings storage | Cloudflare Worker |

The frontend talks to the backend through a subdomain. In the original setup, this is `home.barros.work` (frontend) and `api.barros.work` (backend). You'll replace these with your own domain.

---

## Part 1 — Buy or Connect a Domain on Cloudflare

The backend (Cloudflare Worker) needs a custom domain to work properly, and that domain must be managed by Cloudflare's DNS.

### Option A: Buy a domain through Cloudflare (simplest)

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. In the left sidebar, click **Domain Registration** → **Register Domains**
3. Search for a domain you like and buy it
4. Done — DNS is already on Cloudflare

### Option B: Use a domain you already own

If your domain is registered elsewhere (e.g. Namecheap, Google Domains):

1. In Cloudflare Dashboard, click **Add a site** and enter your domain
2. Select the **Free** plan
3. Cloudflare will give you two nameservers (e.g. `ada.ns.cloudflare.com`)
4. Go to your domain registrar and **replace the existing nameservers** with the Cloudflare ones
5. Wait for propagation (can take a few minutes to 24 hours)
6. Cloudflare will confirm when the domain is active

> **Important:** If you use this domain for email (e.g. Fastmail, Google Workspace), you must recreate your MX and TXT records in Cloudflare's DNS settings before changing nameservers, or your email will stop working temporarily.

---

## Part 2 — Set Up the Cloudflare Worker (Backend)

The worker handles authentication, proxies API requests (Claude, Todoist, CalDAV), and stores your settings.

### 2.1 — Create a KV Namespace

KV (Key-Value) is where your settings are stored.

1. In Cloudflare Dashboard → **Workers & Pages** → **KV**
2. Click **Create a namespace**
3. Name it `STARTPAGE_KV` (or any name you prefer)
4. Note the namespace — you'll need it in the next step

### 2.2 — Create the Worker

1. Go to **Workers & Pages** → **Create**
2. Choose **Create Worker**
3. Give it a name (e.g. `startpage`)
4. Click **Deploy** (it will create a hello-world worker)
5. Click **Edit code**
6. Delete everything and paste the contents of `worker.js`
7. Click **Deploy**

### 2.3 — Bind KV to the Worker

1. Go to your worker → **Settings** → **Bindings**
2. Click **Add** → **KV Namespace**
3. Set the variable name to `KV` (this exact name — the code expects it)
4. Select the namespace you created in step 2.1
5. Save

### 2.4 — Set Worker Secrets

The worker needs several secret values. For each one:

1. Go to your worker → **Settings** → **Variables and Secrets**
2. Click **Add** → **Secret**

Add these secrets:

| Secret name | What to put | Example |
|-------------|-------------|---------|
| `AUTH_SECRET` | A long random string (used to sign auth tokens) | `k7Gx9mP2qR5...` (32+ characters) |
| `AUTH_PASS` | The password you'll use to log into the site | `your-login-password` |
| `ALLOWED_ORIGIN` | Your frontend URL (with https://, no trailing slash) | `https://home.yourdomain.com` |

To generate a random string for `AUTH_SECRET`, you can open a terminal and run:
```
openssl rand -hex 32
```
Or just mash your keyboard for 32+ random characters.

### 2.5 — Add a Custom Domain to the Worker

This gives your worker a clean URL like `api.yourdomain.com` instead of `startpage.your-account.workers.dev`.

1. Go to your worker → **Settings** → **Domains & Routes**
2. Click **Add** → **Custom Domain**
3. Enter your API subdomain: `api.yourdomain.com`
4. Cloudflare will create the DNS record automatically
5. Wait for it to show as **Active** (usually a few seconds)

### 2.6 — Set SSL Mode

1. In Cloudflare Dashboard, select your domain
2. Go to **SSL/TLS** → **Overview**
3. Make sure the encryption mode is set to **Full**

---

## Part 3 — Set Up GitHub Pages (Frontend)

### 3.1 — Create a GitHub Repository

1. Go to [GitHub](https://github.com) and sign in
2. Click **+** → **New repository**
3. Name it anything you like (e.g. `startpage` or `home`)
4. Set it to **Public** (required for free GitHub Pages)
5. Click **Create repository**

### 3.2 — Update the Code

Before uploading, you need to change one line in `index.html` to point to your own backend.

Open `index.html` in any text editor and find this line (near the bottom):

```javascript
const API_BASE = 'https://api.barros.work';
```

Change it to your own API subdomain:

```javascript
const API_BASE = 'https://api.yourdomain.com';
```

That's the **only change needed in the code**. Save the file.

### 3.3 — Upload the Files

Upload these files to the root of your repository:

- `index.html`
- `app.js`

You can do this through GitHub's web interface:

1. In your repository, click **Add file** → **Upload files**
2. Drag in both files
3. Click **Commit changes**

### 3.4 — Enable GitHub Pages

1. In your repository, go to **Settings** → **Pages**
2. Under **Source**, select **Deploy from a branch**
3. Select the **main** branch and **/ (root)** folder
4. Click **Save**
5. Wait a minute — GitHub will deploy your site at `https://yourusername.github.io/repositoryname`

### 3.5 — Add Your Custom Domain

1. Still in **Settings** → **Pages**, under **Custom domain**
2. Enter your frontend subdomain: `home.yourdomain.com`
3. Click **Save**
4. GitHub will tell you to add a DNS record

Now go to Cloudflare:

5. Go to your domain → **DNS** → **Records**
6. Click **Add Record**
7. Type: `CNAME`
8. Name: `home`
9. Target: `yourusername.github.io`
10. Proxy status: **Proxied** (orange cloud on) — this is recommended as it enables Cloudflare's CDN
11. Click **Save**

Back in GitHub, wait a few minutes for the domain to verify. Once verified, tick **Enforce HTTPS**.

---

## Part 4 — Test Everything

1. Go to `https://home.yourdomain.com`
2. You should see a login screen
3. Enter the password you set as `AUTH_PASS` in the worker secrets
4. After logging in, you'll see the dashboard

If something doesn't work:

| Problem | Solution |
|---------|----------|
| Login fails | Check that `AUTH_PASS` and `AUTH_SECRET` are set in worker secrets, and `ALLOWED_ORIGIN` matches your frontend URL exactly |
| Redirect loop | Make sure Cloudflare SSL mode is **Full**, not Flexible |
| Page shows but no data loads | Check browser console for errors — likely `ALLOWED_ORIGIN` doesn't match |
| DNS not resolving | Wait up to 24 hours for propagation, or check your CNAME records |

---

## Part 5 — Configure Your Dashboard

Once logged in, everything is configured through the site's settings modal (gear icon in the top right):

- **Weather:** Set your location
- **RSS Feeds:** Add your news sources
- **Quick Links:** Click the pencil icon to edit bookmarks
- **Todoist:** Add your Todoist API token (get it from [Todoist Settings → Integrations → Developer](https://todoist.com/app/settings/integrations/developer))
- **Calendar (CalDAV):** Add your CalDAV credentials (works with Fastmail, iCloud, etc.)
- **Calendar (ICS):** Add ICS feed URLs for subscribed calendars
- **Sports:** Add ICS feeds for sports schedules
- **Briefings:** Add your Claude API key for AI-generated daily and sports briefings (get it from [Anthropic Console](https://console.anthropic.com/))
- **Sync:** Copy the sync URL to set up additional devices

All settings are stored remotely in Cloudflare KV and sync automatically across all devices that share the same token.

---

## Updating the Site

To update the site after changes:

1. Upload the new `index.html` and/or `app.js` to your GitHub repository (overwriting the old files)
2. GitHub Pages will automatically redeploy within a minute
3. Hard-refresh your browser (`Ctrl+Shift+R` or `Cmd+Shift+R`) to clear the cache

Both files include a version number visible in **Settings** at the bottom — you can compare `HTML x.y.z` and `JS x.y.z` to confirm both files are up to date.

To update the worker, go to **Workers & Pages** → your worker → **Edit code**, paste the new `worker.js`, and click **Deploy**.
