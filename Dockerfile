# syntax=docker/dockerfile:1.7

# ---- base: shared runtime packages ------------------------------------------
FROM node:22-bookworm-slim AS base
WORKDIR /app
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# ---- deps: install all node_modules (incl. codex CLI binary) -----------------
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# ---- builder: produce the Next.js production build --------------------------
FROM base AS builder
ENV NEXT_TELEMETRY_DISABLED=1
# Prisma loads prisma.config.ts during `prisma generate`, which requires a
# syntactically valid DATABASE_URL even though generation does not connect.
ENV DATABASE_URL="postgresql://prisma:prisma@localhost:5432/prisma"
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate \
 && npm run build

# ---- runner: minimal runtime image ------------------------------------------
FROM base AS runner

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV CODEX_HOME=/jobtrack
ENV PORT=3000
# Put codex (and other project bins) on PATH so `codex …` works in any shell.
ENV PATH="/app/node_modules/.bin:${PATH}"

# git is commonly needed by codex when operating on a repo workspace
RUN apt-get update \
 && apt-get install -y --no-install-recommends git \
 && rm -rf /var/lib/apt/lists/*

# Pre-create CODEX_HOME and workspace mount points with safe permissions.
# These will be overlaid by the named volume / bind mount at runtime.
RUN mkdir -p /jobtrack /workspace \
 && chmod 700 /jobtrack

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/app/generated ./app/generated
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/app/job-ops ./app/job-ops

RUN npx playwright install --with-deps chromium

EXPOSE 3000

CMD ["npm", "run", "start"]
