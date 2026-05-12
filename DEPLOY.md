# Radio Room Deployment Guide

Split deployment: **Frontend on Cloudflare Pages** + **Backend on Oracle Cloud** (Always Free).

---

## Architecture

```
Cloudflare Pages          Oracle Cloud VM
┌─────────────────┐            ┌─────────────────┐
│  index.html       │  ←────→  │  Bun.serve()      │
│  app.js           │   WS     │  WebSocket /ws    │
│  style.css        │          │  API /api/resolve │
│  config.js        │          │  Optional SQLite  │
└─────────────────┘            └─────────────────┘
```

---

## Prerequisites

- Oracle Cloud Free Tier account
- Cloudflare account + Wrangler CLI
- GitHub repo for the project
- SSH key pair for Oracle VM access

---

## Part 1: Backend (Oracle Cloud)

### 1. Create VM

1. Oracle Cloud Console → **Compute** → **Instances**
2. Click **Create Instance**
3. Settings:
   - **Name:** `radio-room`
   - **Image:** Oracle Linux 9
   - **Shape:** `VM.Standard.E2.1.Micro` (Always Free)
   - **Networking:** Create new VCN → **Public subnet**
   - **Assign public IPv4 address:** ✅ **Checked**
   - **SSH keys:** Generate new key pair, download `.key` file
4. Click **Create**
5. Wait ~2 min, copy the **Public IP**

### 2. Open Firewall Port 3000

In the Oracle Console:
1. Go to your VCN → **Security Lists** → Default Security List
2. Click **Add Ingress Rule**:
   - Source CIDR: `0.0.0.0/0`
   - Destination Port: `3000`
   - Protocol: TCP

### 3. Deploy Backend

SSH into the VM (from your local machine):

```bash
ssh -i /path/to/your-key.key opc@<VM_PUBLIC_IP>
```

Inside the VM:

```bash
# Install Bun
curl -fsSL https://bun.sh/install | bash
source ~/.bash_profile

# Install Git
sudo dnf install -y git

# Clone repo
cd ~
git clone https://github.com/diogomgbrito/radio-room.git
cd radio-room
bun install

# Copy bun to a system path (fixes systemd permission issues)
sudo cp ~/.bun/bin/bun /usr/local/bin/bun
sudo chmod +x /usr/local/bin/bun

# Create systemd service
sudo tee /etc/systemd/system/radio-room.service << 'EOF'
[Unit]
Description=Radio Room Backend
After=network.target

[Service]
Type=simple
User=opc
WorkingDirectory=/home/opc/radio-room
Environment=FRONTEND_URL=https://radio-room.pages.dev
Environment=PORT=3000
ExecStart=/usr/local/bin/bun run server/index.ts
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable radio-room
sudo systemctl start radio-room

# Verify
sudo systemctl status radio-room
```

You should see `active (running)` and `🎵 Radio Room running on http://localhost:3000`.

### 4. Keep It Updated

To update the backend after code changes:

```bash
ssh -i /path/to/your-key.key opc@<VM_PUBLIC_IP>
cd ~/radio-room
git pull
sudo systemctl restart radio-room
```

---

## Part 2: Frontend (Cloudflare Pages)

### 1. Install Wrangler

```bash
npm install -g wrangler
wrangler login
```

### 2. Create Project

```bash
wrangler pages project create radio-room --production-branch=master
```

### 3. Configure Backend URL

Edit `public/config.js`:

```js
window.RADIO_ROOM_CONFIG = {
  wsHost: "<VM_PUBLIC_IP>:3000",
};
```

### 4. Deploy

```bash
wrangler pages deploy ./public --project-name=radio-room --branch=master
```

Your frontend is live at `https://radio-room.pages.dev`.

### 5. Auto-deploy on Push (Optional)

Connect your GitHub repo in the Cloudflare Dashboard:
1. Pages → Create a project → Connect to Git
2. Select your repo
3. Build settings:
   - **Build command:** (leave empty — static files)
   - **Build output directory:** `public/`
4. Every push to `master` auto-deploys

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Backend server port |
| `FRONTEND_URL` | `*` | CORS origin (set to your Pages domain) |
| `ENABLE_DB` | *(unset)* | Set to `"true"` to enable SQLite logging |

---

## Database (Optional)

SQLite is **disabled by default**. Set `ENABLE_DB=true` to persist songs and activity.

- **Without DB:** All features work. Room state is in-memory only.
- **With DB:** Songs and activity are logged across restarts.

To enable:
```bash
sudo systemctl edit radio-room
# Add:
[Service]
Environment=ENABLE_DB=true
```

---

## Updating After Code Changes

### Frontend only:
```bash
cd radio-room
# edit code...
git push origin master
# Cloudflare auto-deploys if Git integration is set up
# OR manually:
wrangler pages deploy ./public --project-name=radio-room
```

### Backend only:
```bash
ssh -i /path/to/your-key.key opc@<VM_PUBLIC_IP>
cd ~/radio-room
git pull
sudo systemctl restart radio-room
```

### Both:
```bash
cd radio-room
git push origin master
wrangler pages deploy ./public --project-name=radio-room
ssh -i /path/to/your-key.key opc@<VM_PUBLIC_IP> "cd ~/radio-room && git pull && sudo systemctl restart radio-room"
```

---

## Troubleshooting

### Backend won't start (systemd)
```bash
sudo journalctl -u radio-room -n 50 --no-pager
```

### WebSocket connection fails
- Check firewall: port 3000 must be open in Oracle Security List
- Check CORS: `FRONTEND_URL` must match your Pages domain
- Check `config.js`: `wsHost` must be `IP:3000` (not just IP)

### Frontend shows "Connecting..."
- Backend might be down: `sudo systemctl status radio-room`
- VM might have changed IP after restart (Oracle ephemeral IPs)
- Update `config.js` and re-deploy if IP changed

---

## Current Deployment

| Component | URL / Endpoint |
|-----------|---------------|
| Frontend | `https://radio-room.pages.dev` |
| Backend | `141.253.121.167:3000` |
| WebSocket | `ws://141.253.121.167:3000/ws` |
| API | `http://141.253.121.167:3000/api/resolve` |

---

## Notes

- Oracle Cloud Always Free VM: 1/8 OCPU + 1GB RAM — plenty for this app
- Cloudflare Pages: unlimited bandwidth, free SSL
- No database required for basic functionality
- For production SSL on the backend, add Let's Encrypt or use a reverse proxy
