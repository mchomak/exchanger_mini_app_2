#!/bin/bash
set -e

echo "Waiting for API to be ready..."
while ! python -c "
import urllib.request
urllib.request.urlopen('http://api:8000/health')
" 2>/dev/null; do
    echo "  API not ready, retrying in 3s..."
    sleep 3
done
echo "API is ready!"

echo "Starting Telegram bot..."
exec python -m backend.bot.main
