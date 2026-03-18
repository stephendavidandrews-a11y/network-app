#!/bin/bash
# Deploy script for network.stephenandrews.org
# Run on the server: bash deploy.sh

set -e

APP_DIR="/Users/stephen/Documents/Website/network"
LOG_DIR="/var/log/network-app"
BACKUP_DIR="$APP_DIR/backups"

echo "=== Deploying network-app ==="

# Ensure directories exist
mkdir -p "$LOG_DIR" "$BACKUP_DIR"

cd "$APP_DIR"

# Backup database before deploy
if [ -f "data/network.db" ]; then
  cp data/network.db "$BACKUP_DIR/network-pre-deploy-$(date +%Y%m%d-%H%M%S).db"
  echo "Database backed up"
fi

# Pull latest code
git pull origin main

# Install dependencies
npm ci --production=false

# Generate Prisma client
npx prisma generate

# Run migrations
npx prisma db push

# Build
npm run build

# Restart PM2
pm2 restart ecosystem.config.js --update-env || pm2 start ecosystem.config.js

echo "=== Deploy complete ==="
echo "App running at http://localhost:3001"
