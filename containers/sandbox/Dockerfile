FROM node:24-slim
ARG WRONGSTACK_VERSION
RUN test -n "$WRONGSTACK_VERSION" \
    && apt-get update \
    && apt-get install --yes --no-install-recommends git ca-certificates bash python3 make g++ \
    && rm -rf /var/lib/apt/lists/* \
    && npm install --global "wrongstack@$WRONGSTACK_VERSION" \
    && mkdir -p /workspace \
    && chown node:node /workspace
USER node
WORKDIR /workspace
CMD ["wstack", "--help"]
