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

# Start the application
echo "Starting Vite dev server..."
exec npm run dev -- --force
