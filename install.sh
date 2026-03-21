#!/usr/bin/env bash
# =============================================================================
# Bird Garden — Single-command deploy script for Debian 12/13
# Usage: sudo bash install.sh
# =============================================================================
set -euo pipefail

APP_DIR="/opt/bird-garden"
SERVICE_USER="birdgarden"
DOMAIN="${DOMAIN:-birdgarden.example.com}"  # Override with env var

echo "==> Bird Garden Installation"
echo "    Directory: ${APP_DIR}"
echo "    Domain:    ${DOMAIN}"
echo ""

# 1. System dependencies
echo "==> Installing system dependencies…"
apt-get update -q
apt-get install -y -q curl unzip ffmpeg sqlite3 ufw

# 2. Create dedicated service user (non-root, no login shell)
echo "==> Creating service user: ${SERVICE_USER}"
useradd --system \
  --shell /usr/sbin/nologin \
  --home-dir "${APP_DIR}" \
  "${SERVICE_USER}" 2>/dev/null || echo "  (user already exists)"

# 3. Install Bun for service user
echo "==> Installing Bun runtime…"
if [ ! -f "/home/${SERVICE_USER}/.bun/bin/bun" ]; then
  sudo -u "${SERVICE_USER}" bash -c 'curl -fsSL https://bun.sh/install | bash'
fi
BUN_BIN="/home/${SERVICE_USER}/.bun/bin/bun"

# 4. Install Caddy
echo "==> Installing Caddy…"
if ! command -v caddy &>/dev/null; then
  apt-get install -y -q debian-keyring debian-archive-keyring apt-transport-https
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    | tee /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -q && apt-get install -y -q caddy
fi

# 5. Project directory (assumes repo already present at APP_DIR)
echo "==> Setting up project directory…"
cd "${APP_DIR}"

# 6. Install npm dependencies
echo "==> Installing project dependencies…"
"${BUN_BIN}" install --frozen-lockfile

# 7. Dependency audit (warn but don't block install)
echo "==> Running dependency audit…"
"${BUN_BIN}" audit 2>&1 || echo "WARNING: Dependency audit found issues. Review above before production use."

# 8. Initialize database (idempotent — skips if DB already exists)
if [ ! -f "${APP_DIR}/db/bird-garden.sqlite" ]; then
  echo "==> Initializing database…"
  SEED_MODE=true "${BUN_BIN}" run scripts/seed-db.ts
else
  echo "==> Database already exists — skipping seed."
fi

# 9. Fetch and optimize media (if not already present)
if [ ! -d "${APP_DIR}/media/songs" ] || [ -z "$(ls -A "${APP_DIR}/media/songs/" 2>/dev/null)" ]; then
  echo "==> Fetching media files…"
  "${BUN_BIN}" run scripts/fetch-media.ts
  echo "==> Optimizing images…"
  "${BUN_BIN}" run scripts/optimize-images.ts
else
  echo "==> Media already present — skipping download."
fi

# 10. Build Astro site
echo "==> Building site…"
"${BUN_BIN}" run build

# 11. Set ownership and permissions
echo "==> Setting file permissions…"
chown -R "${SERVICE_USER}:${SERVICE_USER}" "${APP_DIR}"
# DB: readable only by service user
chmod 640 "${APP_DIR}/db/bird-garden.sqlite"
# Media: world-readable (Caddy serves these directly)
find "${APP_DIR}/media" -type f -exec chmod 644 {} \;
find "${APP_DIR}/media" -type d -exec chmod 755 {} \;
# Source: readable, not writable by service user
chmod -R 755 "${APP_DIR}/dist"

# 12. Configure Caddy
echo "==> Configuring Caddy…"
sed "s/birdgarden.example.com/${DOMAIN}/g" "${APP_DIR}/Caddyfile" \
  > /etc/caddy/Caddyfile
systemctl enable caddy
systemctl restart caddy

# 13. Configure systemd service
echo "==> Installing systemd service…"
cp "${APP_DIR}/bird-garden.service" /etc/systemd/system/bird-garden.service
systemctl daemon-reload
systemctl enable bird-garden
systemctl restart bird-garden

# 14. Firewall
echo "==> Configuring firewall…"
ufw allow 80/tcp   comment 'HTTP'
ufw allow 443/tcp  comment 'HTTPS'
ufw limit 22/tcp   comment 'SSH (rate-limited)'
ufw --force enable

# 15. Backup cron job
echo "==> Setting up database backup cron…"
cat > /etc/cron.daily/bird-garden-backup << 'EOF'
#!/usr/bin/env bash
set -euo pipefail
BACKUP_DIR="/backups/bird-garden"
BACKUP_FILE="${BACKUP_DIR}/bird-garden-$(date +%Y%m%d).sqlite"
mkdir -p "${BACKUP_DIR}"
sqlite3 /opt/bird-garden/db/bird-garden.sqlite ".backup ${BACKUP_FILE}"
chmod 600 "${BACKUP_FILE}"
# Verify integrity
if ! sqlite3 "${BACKUP_FILE}" "PRAGMA integrity_check;" | grep -q "^ok$"; then
  echo "ERROR: Backup integrity check failed for ${BACKUP_FILE}" >&2
  exit 1
fi
# Remove backups older than 30 days
find "${BACKUP_DIR}" -name "*.sqlite" -mtime +30 -delete
EOF
chmod 755 /etc/cron.daily/bird-garden-backup

echo ""
echo "==> Bird Garden installation complete!"
echo ""
echo "    Site:    https://${DOMAIN}"
echo "    Status:  systemctl status bird-garden"
echo "    Logs:    journalctl -u bird-garden -f"
echo ""
echo "    Next: Update /etc/caddy/Caddyfile with your actual domain if needed."
