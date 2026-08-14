FROM node:22-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

RUN groupadd --gid 10001 bot \
    && useradd --uid 10001 --gid bot --shell /usr/sbin/nologin --create-home bot \
    && mkdir -p /app/data /app/backups \
    && chown -R bot:bot /app

COPY --from=dependencies --chown=bot:bot /app/node_modules ./node_modules
COPY --chown=bot:bot package.json ./
COPY --chown=bot:bot src ./src

USER 10001:10001
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD ["node", "src/healthcheck.js"]

CMD ["node", "src/bot.js"]
