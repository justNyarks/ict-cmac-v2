#!/bin/sh
set -eu

require_env() {
  var_name="$1"

  if [ -z "$(printenv "$var_name" 2>/dev/null || true)" ]; then
    echo "docker-entrypoint: required environment variable $var_name is not set." >&2
    exit 1
  fi
}

require_env DATABASE_URL
require_env NEXTAUTH_SECRET
require_env NEXTAUTH_URL

if [ -z "${SERVER_ACTION_ALLOWED_ORIGINS:-}" ]; then
  export SERVER_ACTION_ALLOWED_ORIGINS="$NEXTAUTH_URL"
fi

if [ "${PRISMA_SKIP_DB_PUSH:-0}" != "1" ]; then
  npx prisma db execute --file prisma/remove-pmac-tags.sql --schema prisma/schema.prisma
  npx prisma db push
fi

if [ "${PRISMA_RUN_SEED:-0}" = "1" ]; then
  npx prisma db seed
fi

exec npx next start -H 0.0.0.0 -p "${PORT:-3000}"
