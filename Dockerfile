FROM oven/bun:1 AS base
WORKDIR /app

# Install dependencies
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# Copy source
COPY server/ server/
COPY public/ public/
COPY tsconfig.json ./

# Create data directory for SQLite
RUN mkdir -p data

# Expose port
EXPOSE 3000

# Data volume for persistent SQLite
VOLUME ["/app/data"]

# Start server
CMD ["bun", "run", "server/index.ts"]
