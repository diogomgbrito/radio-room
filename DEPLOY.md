# Radio Room Deployment Guide

This is the **actual deployment** of the Radio Room project. No hypothetical setups — this is how it runs today.

> **Purpose:** Radio Room is a test/learning project. It is deployed with free-tier infrastructure and an ephemeral tunnel. A custom domain is intentionally not used.

---

## Architecture at a Glance

```
┌─────────────────────────────┐      ┌─────────────────────────────────────────┐
│   Cloudflare Pages          │      │   Oracle Cloud Always Free VM           │
│   radio-room.pages.dev      │◄────►│   141.253.121.167 (ephemeral IP)        │
│   (static HTML/JS/CSS)      │  WS  │                                         │
└─────────────────────────────┘      │   ┌─────────────────────────────────┐   │
                                     │   │  radio-room.service             │   │
                                     │   │  Bun backend on localhost:3000  │   │
                                     │   └─────────────────────────────────┘   │
                                     │   ┌─────────────────────────────────┐   │
                                     │   │  cloudflared.service            │   │
                                     │   │  ephemeral tunnel to Cloudflare │   │
                                     │   └─────────────────────────────────┘   │
                                     │   ┌─────────────────────────────────┐   │
                                     │   │  tailscaled.service             │   │
                                     │   │  Tailscale agent (tailnet)      │   │
                                     │   └─────────────────────────────────┘   │
                                     └─────────────────────────────────────────┘
```

---

## Part 1: Frontend (Cloudflare Pages)

**URL:** `https://radio-room.pages.dev`

The frontend is a static single-page app (vanilla HTML/CSS/JS) deployed to Cloudflare Pages.

### How it works

- `public/` folder contains all frontend assets
- `public/config.js` tells the frontend where the backend WebSocket lives
- Deployed via Wrangler CLI (`wrangler pages deploy ./public`)

### Deploy / Update Frontend

```bash
cd radio-room
# Edit frontend files in public/...
# Update config.js if the tunnel URL changed
wrangler pages deploy ./public --project-name=radio-room --branch=master
```

---

## Part 2: Backend (Oracle Cloud VM)

**Host:** Oracle Cloud Always Free Tier  
**VM:** `VM.Standard.E2.1.Micro` (1/8 OCPU, 1 GB RAM)  
**OS:** Oracle Linux Server 9.7  
**Public IP:** `141.253.121.167` (ephemeral — may change on stop/start)  
**Tailscale IP:** `100.76.254.86` (stable, never changes)  
**Tailnet:** `cormo-mark.ts.net`

### VM Access

**SSH (key-based):**
```bash
ssh -i /path/to/radio-room-deploy.key opc@141.253.121.167
```

**Tailscale (alternative, no public IP needed):**
```bash
ssh opc@dmgb-vm-1  # via Tailscale SSH (currently blocked by SELinux)
```

### Services Running on the VM

| Service | Role | Port | Status |
|---------|------|------|--------|
| `radio-room.service` | Bun backend | 3000 | `active (running)` |
| `cloudflared.service` | Ephemeral Cloudflare Tunnel | — | `active (running)` |
| `tailscaled.service` | Tailscale agent | 41641 | `active (running)` |

### Backend Environment

```
FRONTEND_URL=https://radio-room.pages.dev
PORT=3000
ENABLE_DB=true
```

### Database

SQLite is **enabled**. All songs and activity events are persisted across restarts.

Data lives in `/home/opc/radio-room/data/radio-room.db`.

To **disable** the database:

```bash
ssh -i /path/to/key opc@141.253.121.167
sudo rm /etc/systemd/system/radio-room.service.d/db.conf
sudo systemctl daemon-reload
sudo systemctl restart radio-room
```

---

## Part 3: Cloudflare Tunnel (Ephemeral)

**Current tunnel URL:** `per-soldier-pamela-workers.trycloudflare.com`

### What it is

An **ephemeral** Cloudflare Tunnel created with `cloudflared tunnel --url http://localhost:3000`. It exposes the Bun backend on port 3000 to the internet via a Cloudflare-managed HTTPS URL.

### Important: URL changes on restart

The `trycloudflare.com` URL is **not persistent**. If `cloudflared.service` restarts, the URL changes. When this happens:

1. SSH into the VM and read the new tunnel URL from logs:
   ```bash
   ssh opc@141.253.121.167
   sudo journalctl -u cloudflared -n 20 --no-pager
   ```

2. Update `public/config.js` with the new `wsHost`:
   ```js
   window.RADIO_ROOM_CONFIG = {
     wsHost: "new-url.trycloudflare.com",
   };
   ```

3. Re-deploy the frontend:
   ```bash
   wrangler pages deploy ./public --project-name=radio-room --branch=master
   ```

### Why not a named tunnel?

A named tunnel requires a custom domain. Since this project is for testing/learning and no domain is purchased, the ephemeral tunnel is the free option.

### Tunnel systemd service

```ini
# /etc/systemd/system/cloudflared.service
[Unit]
Description=Cloudflare Tunnel for Radio Room
After=network.target

[Service]
Type=simple
User=root
ExecStart=/usr/local/bin/cloudflared tunnel --url http://localhost:3000
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

---

## Part 4: Tailscale

**Installed:** May 13, 2026  
**Version:** 1.96.4  
**Tailnet:** `cormo-mark.ts.net`  
**VM hostname:** `dmgb-vm-1`  
**VM Tailscale IP:** `100.76.254.86`

### Purpose

Provides stable, private network access to the VM regardless of its public IP. Useful for SSH and direct backend access without relying on the ephemeral tunnel.

### Tailscale SSH

SELinux on Oracle Linux blocks Tailscale SSH by default. To use it:

```bash
sudo setsebool -P tailscale_ssh on
```

Then access the VM from any tailnet device:
```bash
ssh opc@dmgb-vm-1
```

---

## Updating After Code Changes

### Update backend only

```bash
ssh -i /path/to/key opc@141.253.121.167
cd ~/radio-room
git pull
sudo systemctl restart radio-room
```

### Update frontend only

```bash
cd radio-room
# Edit files...
wrangler pages deploy ./public --project-name=radio-room --branch=master
```

### Update both

```bash
cd radio-room
git push github master   # push to GitHub
git push origin master   # push to Brilean GitLab

# Deploy frontend
wrangler pages deploy ./public --project-name=radio-room --branch=master

# Deploy backend
ssh -i /path/to/key opc@141.253.121.167 "cd ~/radio-room && git pull && sudo systemctl restart radio-room"
```

---

## Troubleshooting

### Backend won't start
```bash
ssh opc@141.253.121.167
sudo journalctl -u radio-room -n 50 --no-pager
```

### Tunnel URL changed
```bash
ssh opc@141.253.121.167
sudo journalctl -u cloudflared -n 20 --no-pager | grep "trycloudflare"
# Update public/config.js and re-deploy frontend
```

### WebSocket connection fails
- Check that `config.js` `wsHost` matches the current tunnel URL
- Check `FRONTEND_URL` env var matches `radio-room.pages.dev`
- Check `cloudflared.service` is running

### Frontend shows "Connecting..."
- Backend might be down: `sudo systemctl status radio-room`
- Tunnel URL may have changed (see above)
- Check browser console for mixed-content errors (HTTP vs HTTPS)

---

## Current Deployment Snapshot

| Component | URL / Endpoint |
|-----------|---------------|
| Frontend (Cloudflare Pages) | `https://radio-room.pages.dev` |
| Backend (ephemeral tunnel) | `wss://per-soldier-pamela-workers.trycloudflare.com` |
| API resolve | `https://per-soldier-pamela-workers.trycloudflare.com/api/resolve` |
| VM public IP | `141.253.121.167:3000` (no HTTPS, direct access) |
| VM Tailscale IP | `100.76.254.86` (private tailnet access) |
| GitHub repo | `https://github.com/diogomgbrito/radio-room` |
| Brilean repo | `ssh://git@git.brilean.cloud:2424/diogo.brito/radio-room.git` |

---

## Notes

- Oracle Cloud Always Free VM: 1/8 OCPU + 1 GB RAM — sufficient for this app
- Cloudflare Pages: unlimited bandwidth, free SSL
- SQLite database is **enabled** — songs and activity are persisted across restarts
- The `trycloudflare.com` tunnel is free but ephemeral — the URL changes on restart
- For production use, switch to a named Cloudflare Tunnel with a custom domain
