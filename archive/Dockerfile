# === CONTRACTS ===
# id: container_recipe_reproducibility
#   given: The production container recipe installs application dependencies.
#   then: Both stages use the CI Node major, committed locks are checked, and build-only Node tools are excluded from the runtime install.
#   class: reproducibility
# === END CONTRACTS ===
FROM ghcr.io/astral-sh/uv:0.11.18 AS uv

FROM node:22-bookworm-slim AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --include=dev

COPY . .
RUN NODE_ENV=production npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates git \
    && rm -rf /var/lib/apt/lists/*

# The production unit owns both processes: Node/Express is public on :5000
# and launches the internal Python/Uvicorn child on :8001.
COPY --from=uv /uv /uvx /bin/
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .
COPY --from=builder /app/dist ./dist

ENV UV_LINK_MODE=copy
ENV UV_PYTHON_INSTALL_DIR=/opt/uv/python
RUN uv python install 3.12 \
    && uv sync --locked --no-dev

RUN mkdir -p uploads

ENV NODE_ENV=production
ENV PYTHONUNBUFFERED=1
ENV PATH="/app/.venv/bin:$PATH"
ENV PORT=5000
EXPOSE 5000

CMD ["node", "dist/index.cjs"]
