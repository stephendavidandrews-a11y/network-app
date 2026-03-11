#!/bin/bash
# One-time server setup for network.stephenandrews.org
# Run on a fresh Ubuntu 24.04 DigitalOcean Droplet
# Usage: ssh root@YOUR_DROPLET_IP 'bash -s' < server-setup.sh

set -e

APP_DIR="/Users/stephen/Documents/Website/network"
LOG_DIR="/var/log/network-app"

echo "=== Setting up network-app server ==="

# System updates
apt update && apt upgrade -y

# Install Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Install Nginx
apt install -y nginx

# Install PM2 globally
npm install -g pm2

# Install certbot for SSL
apt install -y certbot python3-certbot-nginx

# Create app directory and log directory
mkdir -p "$APP_DIR" "$LOG_DIR" "$APP_DIR/data" "$APP_DIR/backups"

# Clone the repo
cd /opt
git clone https://github.com/stephendavidandrews-a11y/network-app.git

cd "$APP_DIR"

# Install dependencies
npm ci --production=false

# Generate Prisma client
npx prisma generate

# Push schema to create database
npx prisma db push

# Create .env.local (EDIT THESE VALUES)
cat > .env.local << 'ENVEOF'
DATABASE_URL="file:../data/network.db"

AUTH_USERNAME=stephen
AUTH_PASSWORD_HASH=REPLACE_WITH_BCRYPT_HASH
AUTH_SECRET=REPLACE_WITH_RANDOM_SECRET
NEXTAUTH_URL=https://network.stephenandrews.org

ANTHROPIC_API_KEY=REPLACE_WITH_API_KEY

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=stephen@stephenandrews.org
SMTP_PASS=REPLACE_WITH_APP_PASSWORD
SMTP_FROM=Stephen Andrews <stephen@stephenandrews.org>

NODE_ENV=production
ENVEOF

echo ""
echo "IMPORTANT: Edit $APP_DIR/.env.local with your actual credentials!"
echo ""

# Build the app
npm run build

# Setup Nginx
cp nginx-network.conf /etc/nginx/sites-available/network.stephenandrews.org
ln -sf /etc/nginx/sites-available/network.stephenandrews.org /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

# Get SSL certificate
echo "Getting SSL certificate..."
certbot --nginx -d network.stephenandrews.org --non-interactive --agree-tos --email stephen@stephenandrews.org || echo "SSL setup failed - configure DNS first"

# Start with PM2
pm2 start ecosystem.config.js
pm2 save
pm2 startup systemd -u root --hp /root

# Seed the database (import contacts)
echo "Run seed if you have the XLSX files in place:"
echo "  cd $APP_DIR && npm run db:seed"

echo ""
echo "=== Setup complete ==="
echo "1. Point DNS A record for network.stephenandrews.org to this server's IP"
echo "2. Edit $APP_DIR/.env.local with your credentials"
echo "3. Run: cd $APP_DIR && npm run build && pm2 restart network-app"
echo "4. Run certbot if DNS wasn't ready: certbot --nginx -d network.stephenandrews.org"
