# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN --mount=type=secret,id=proxy_ca if [ -s /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; npm ci
COPY . .
RUN npm run build:frontend
FROM nginxinc/nginx-unprivileged:stable-alpine-slim@sha256:5d8bb9437d74a600ec5dbf90c035451c724dc33eac8d3a71078f6f8612c345f6 AS runtime
USER root
RUN apk upgrade --no-cache
COPY --from=build --chown=101:101 /app/dist /usr/share/nginx/html
COPY --chown=101:101 --chmod=0444 deploy/docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --chown=101:101 --chmod=0444 deploy/docker/nginx-main.conf /etc/nginx/nginx.conf
USER 101
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -Y off -q -O /dev/null http://127.0.0.1:8080/health/live || exit 1
