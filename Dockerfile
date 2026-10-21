# syntax=docker/dockerfile:1
# Progression CRM: multi-stage build producing a small, non-root Next.js standalone image.

ARG NODE_IMAGE=node:22-alpine

# node:22-alpine already ships OpenSSL 3 (libssl.so.3), which is all Prisma's musl engines need.
FROM ${NODE_IMAGE} AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# 1. Install dependencies (cached unless the lockfile changes)
FROM base AS deps
COPY package.json package-lock.json ./
COPY prisma/schema.prisma ./prisma/schema.prisma
RUN npm ci --no-audit --no-fund

# 2. Build the app and bundle the seed script
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate \
 && npm run build \
 && npm run build:seed

# 3. Prisma CLI only (for `migrate deploy` at start-up), kept out of the app bundle
FROM base AS prisma-cli
WORKDIR /cli
RUN npm init -y >/dev/null \
 && npm install --no-audit --no-fund --omit=dev prisma@6.19.3

# 4. Runtime
FROM base AS runner
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN addgroup -S -g 1001 app \
 && adduser -S -u 1001 -G app app \
 && mkdir -p /app/data && chown app:app /app/data

COPY --from=prisma-cli /cli/node_modules /opt/prisma-cli/node_modules
# The standalone bundle already contains the traced Prisma client and query engine used by the app and seed.
COPY --from=builder --chown=app:app /app/.next/standalone ./
COPY --from=builder --chown=app:app /app/.next/static ./.next/static
COPY --from=builder --chown=app:app /app/public ./public
COPY --from=builder --chown=app:app /app/prisma/schema.prisma ./prisma/schema.prisma
COPY --from=builder --chown=app:app /app/prisma/migrations ./prisma/migrations
COPY --from=builder --chown=app:app /app/prisma/dist/seed.js ./prisma/seed.js
COPY --chown=app:app docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

USER app
EXPOSE 3000
VOLUME ["/app/data"]
HEALTHCHECK --interval=15s --timeout=5s --start-period=60s --retries=5 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
ENTRYPOINT ["./docker-entrypoint.sh"]
