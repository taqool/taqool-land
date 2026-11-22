#!/bin/sh
set -eu

api_base_url="${API_BASE_URL:-https://api.qabas.one}"

case "$api_base_url" in
  https://*|http://*) ;;
  *) echo "API_BASE_URL must be an absolute http(s) URL" >&2; exit 1 ;;
esac

case "$api_base_url" in
  *[!a-zA-Z0-9:/._-]* ) echo "API_BASE_URL contains unsupported characters" >&2; exit 1 ;;
esac

cat > /usr/share/nginx/html/env-config.js <<EOF
window.__ENV__ = { API_BASE_URL: "$api_base_url" };
EOF
