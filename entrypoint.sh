#!/bin/sh
# Entrypoint script for runtime configuration
# Reads TARGET_URL environment variable and configures the application

set -e

# Default TARGET_URL if not provided
TARGET_URL=${TARGET_URL:-localhost}

echo "Configuring application with TARGET_URL: $TARGET_URL"

# Generate runtime configuration file for frontend
cat > /app/public/config.js <<EOF
// Auto-generated runtime configuration
window.APP_CONFIG = {
  SETTING_SERVICE_API_URL: 'http://${TARGET_URL}:8080',
  SETTING_SERVICE_TIMEOUT: 5000,
};
EOF

echo "Generated runtime config:"
cat /app/public/config.js

# Export environment variables for Vite dev server proxy
export VITE_METRICS_TARGET="http://${TARGET_URL}:8080"
export VITE_CONTAINERS_TARGET="http://localhost:5000"
export VITE_LOG_SERVICE_URL="http://${TARGET_URL}:47097"

# Demo relay backend (server/server.ts) listens on this port.
# Vite proxies /demo -> http://localhost:${BACKEND_PORT}
export BACKEND_PORT=${BACKEND_PORT:-5174}

# Load demo settings from .env so it is the single source of truth.
#   Without this, the export below would always win over .env and DEMO_DRY_RUN
#   in .env would be ignored. 'set -a' auto-exports every var defined in .env.
if [ -f /app/.env ]; then
  set -a
  . /app/.env
  set +a
fi

# By default do NOT send real requests during demo unless explicitly enabled.
# (.env value, if present, was already loaded above and takes precedence.)
export DEMO_DRY_RUN=${DEMO_DRY_RUN:-1}

# Start BOTH the demo relay backend (5174) and the Vite dev server (5173).
# 'concurrently -k' kills all processes if any one exits, so the container
# stops cleanly if either process dies.
echo "Starting backend (relay, :${BACKEND_PORT}) + Vite dev server (:5173)..."
exec npm run dev:all:force
