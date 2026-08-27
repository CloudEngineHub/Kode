FROM node:22.14.0-alpine AS builder

RUN apk add --no-cache bash build-base git linux-headers python3 \
  && npm install --global bun@1.3.6

WORKDIR /app
COPY . .

RUN bun install --frozen-lockfile \
  && node scripts/build-seccomp-assets.mjs --require \
  && bun run build \
  && npm pack --ignore-scripts --pack-destination /tmp

FROM node:22.14.0-alpine AS runtime

RUN apk add --no-cache bash ripgrep
COPY --from=builder /tmp/shareai-lab-kode-*.tgz /tmp/kode.tgz
RUN npm install --global /tmp/kode.tgz --omit=optional --ignore-scripts \
  && rm /tmp/kode.tgz

WORKDIR /workspace
RUN chown node:node /workspace
USER node

ENTRYPOINT ["kode"]
