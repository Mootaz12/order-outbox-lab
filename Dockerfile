# pnpm comes from corepack, pinned by the packageManager field in package.json.
FROM node:24-alpine AS base
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app

# Full dependency tree, used to compile TypeScript.
FROM base AS build-deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Prod-only tree, shipped to the runtime image.
FROM base AS runtime-deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

FROM base AS build
COPY --from=build-deps /app/node_modules ./node_modules
COPY . .
RUN pnpm run build

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=runtime-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/public ./public
EXPOSE 3000
CMD ["node", "dist/main.js"]
