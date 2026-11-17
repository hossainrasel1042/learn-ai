FROM node:20-slim AS builder

ENV NODE_ENV=production

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --omit=dev --legacy-peer-deps

FROM node:20-slim AS production

ENV NODE_ENV=production \
    PORT=8000

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd --gid 1001 appgroup && \
    useradd --uid 1001 --gid appgroup --shell /bin/bash --create-home appuser

RUN mkdir -p /app/logs && chown -R appuser:appgroup /app
COPY --from=builder /app/node_modules /app/node_modules

COPY --chown=appuser:appgroup . .

RUN chmod +x /app/docker-entrypoint.sh

USER root

ENTRYPOINT ["/app/docker-entrypoint.sh"]

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD curl --fail http://localhost:8000/health || exit 1

CMD ["node", "src/index.js"]
