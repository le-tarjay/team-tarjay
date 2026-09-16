# The Angular frontend, production-built and served by nginx, for the local
# docker-compose stack.
#
# This file lives in `infrastructure/` rather than `frontend/` because runtime
# provisioning is this surface's job (see infrastructure/CONVENTIONS.md's
# Cross-surface impact). Its build context is `../../frontend`, so every path below is
# relative to the frontend surface root, not to this file.
#
# Production-built, not `ng serve`: e2e/CONVENTIONS.md's Scope requires this surface to
# be exercised production-built. The `ng serve` inner loop is a separate way to run the
# app and belongs to LET-120/LET-121, not here.

FROM node:22-alpine AS build
WORKDIR /src

# Lockfile-only install first, so a source-only change does not reinstall node_modules.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# `production` is angular.json's defaultConfiguration, named here so it stays explicit.
RUN npm run build -- --configuration production

FROM nginx:1.27-alpine AS runtime

# @angular/build:application with no explicit outputPath emits to
# dist/<project-name>/browser; the project is `point-of-sale-ui` (frontend/angular.json).
COPY --from=build /src/dist/point-of-sale-ui/browser /usr/share/nginx/html

# The server block -- including the /v1/ proxy rule -- is bind-mounted by
# docker-compose.yml rather than copied here. It has to be: a Dockerfile can only COPY
# from its own build context, and that context is the frontend surface, while the nginx
# config belongs to this surface.

EXPOSE 80

HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=5 \
  CMD wget --spider -q http://127.0.0.1/ || exit 1
