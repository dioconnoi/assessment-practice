# Multi-stage build producing a minimal runtime image from Next.js's
# "standalone" output (a pruned server.js + only the node_modules it needs).

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Neither of these is read at build time (no page touches the DB or a
# session during prerendering — everything is dynamic), but the modules
# that validate them run as soon as anything imports the module graph that
# contains them, which Next's page-data collection does even for routes
# that never execute. The real values come from docker-compose at runtime;
# these only need to satisfy the startup checks during `next build`.
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
ENV SESSION_SECRET="00000000000000000000000000000000-build-time-placeholder"
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000
CMD ["node", "server.js"]
