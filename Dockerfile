# ── Stage 1: Install deps ──
FROM oven/bun:1-alpine AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# ── Stage 2: Production image ──
FROM oven/bun:1-alpine AS runtime
WORKDIR /app

# Create non-root user
RUN addgroup -S radio && adduser -S radio -G radio

# Copy deps
COPY --from=deps /app/node_modules ./node_modules

# Copy source
COPY server/ server/
COPY public/ public/
COPY tsconfig.json ./

# Create data dir owned by app user
RUN mkdir -p data && chown -R radio:radio /app

USER radio

EXPOSE 3000

# Persistent SQLite data
VOLUME ["/app/data"]

# Healthcheck
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:3000/ || exit 1

ENTRYPOINT ["bun"]
CMD ["run", "server/index.ts"]
