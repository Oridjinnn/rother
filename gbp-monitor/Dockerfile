# GBP Monitor — Multi-stage Docker build
#
# Build:
#   docker build -t gbp-monitor:latest .
#
# Run:
#   docker run --rm -v gbp-data:/app/data gbp-monitor:latest
#
# Per M13A PADR-004: Docker Compose is the primary deployment model.

# ── Stage 1: Builder ────────────────────────────────────────────────
FROM python:3.11-slim AS builder

WORKDIR /build
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ── Stage 2: Runtime ────────────────────────────────────────────────
FROM python:3.11-slim

# Playwright Chromium system dependencies (from playwright install --with-deps).
# Pinned to the minimum set needed for headless Chromium.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libnss3 libnspr4 libatk1.0-0t64 libatk-bridge2.0-0t64 \
    libcups2t64 libdrm2 libdbus-1-3 libexpat1 libxcb1 \
    libxkbcommon0 libx11-6 libxcomposite1 libxdamage1 \
    libxext6 libxfixes3 libxrandr2 libgbm1 libpango-1.0-0 \
    libcairo2 libasound2 libegl1 \
    && rm -rf /var/lib/apt/lists/*

# Install Playwright and Chromium from the builder.
COPY --from=builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin
RUN playwright install chromium 2>/dev/null

WORKDIR /app

# Copy application code.
COPY orchestration/ orchestration/
COPY parser/ parser/
COPY storage/ storage/
COPY harness/ harness/
COPY discovery/ discovery/
COPY golden/ golden/
COPY config/ config/
COPY scripts/ scripts/
COPY tests/fixtures/ tests/fixtures/
COPY tests/__init__.py tests/
COPY CHANGELOG.md .
COPY requirements.txt .

# Create non-root user.
RUN useradd -m -u 1001 gbp-monitor && \
    mkdir -p /app/data && \
    chown -R gbp-monitor:gbp-monitor /app

USER gbp-monitor

# Data volume for persistent snapshots, logs, and deltas.
VOLUME /app/data

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python -m orchestration.health

ENTRYPOINT ["python", "-m", "orchestration.run_all"]
