FROM fusenet/eth-netstats:spark-0.1.0

WORKDIR /app

# NOTE: cloud_1's Dockerfile also COPYs a custom src/views/index.jade for HARA branding,
# but that file isn't present in the repo (missing/never committed) — using the base
# image's default view here instead. JS patch below still applies (block time display,
# QBFT difficulty normalization, HARA node geo fallback) since it doesn't depend on the jade file.
COPY hara-netstats-patch.js /tmp/hara-netstats-patch.js

RUN node /tmp/hara-netstats-patch.js && grunt build
