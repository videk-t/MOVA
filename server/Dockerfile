# MOVA backend.
#
# Render does not need this — it builds the Node service directly — but a
# Dockerfile keeps the deployment portable. Koyeb, Railway, Cloud Run or any
# container host will take this image unchanged, so the choice of platform
# stays reversible.
#
# Build context is the repo root, not server/, because the backend imports the
# app's `src/core` rather than reimplementing the scoring model:
#   docker build -f server/Dockerfile -t mova-api .

FROM node:22-alpine AS base
WORKDIR /app

# Dependencies first so a source-only change does not reinstall the world.
COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci --omit=dev

# The shared pure core. Only these paths — the React Native app is not needed
# and would drag half of node_modules in with it.
COPY src/core ./src/core
COPY src/theme/colors.ts ./src/theme/colors.ts
COPY src/data/providers/analysis.ts ./src/data/providers/analysis.ts
COPY src/data/providers/types.ts ./src/data/providers/types.ts

COPY server/src ./server/src
COPY server/tsconfig.json ./server/

# Run as a non-root user. The image has no business writing to its own
# filesystem, and nothing here needs privileges.
USER node

ENV NODE_ENV=production
ENV PORT=8787
EXPOSE 8787

WORKDIR /app/server

# tsx executes TypeScript directly and resolves the tsconfig path alias that
# reaches into src/core. Compiling with tsc would emit unresolvable `@/…`
# imports, since tsc does not rewrite paths on output.
CMD ["npm", "start"]
