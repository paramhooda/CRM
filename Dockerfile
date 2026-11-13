# Progression CRM: one image that migrates the database on start and serves the app.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate && npx next build

FROM node:22-alpine AS runtime
WORKDIR /app
RUN addgroup -S app && adduser -S app -G app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000
# The full app (node_modules included) so `prisma migrate deploy` and the seed can run at start-up
COPY --from=build --chown=app:app /app /app
USER app
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=5 CMD wget -qO- http://localhost:3000/api/v1/health || exit 1
ENTRYPOINT ["sh", "scripts/docker-entrypoint.sh"]
