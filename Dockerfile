# Syntax: https://docs.docker.com/engine/reference/builder/
#
# Cloudflare Containers build this image during `wrangler deploy` (or from
# Workers Builds) and run it behind the Worker in worker/index.ts. The image
# must be linux/amd64; Wrangler handles that.
#
# The image is self-contained: it serves the API, /uploads and Socket.IO on
# port 8080. Static assets are served by the Worker at the edge, but client/dist
# is still copied in so the container can also run standalone (`docker run`)
# exactly as it did before.
FROM node:20-alpine AS build

WORKDIR /app

# The root package.json defines the build:client / build:server scripts used
# below. Root dependencies are tooling only (wrangler, TypeScript) and are not
# installed in the image.
COPY package.json ./package.json
COPY server/package.json server/package-lock.json* ./server/
COPY client/package.json client/package-lock.json* ./client/
RUN apk add --no-cache openssl libc6-compat \
  && npm ci --prefix server --no-audit \
  && npm ci --prefix client --no-audit

# Copy sources
COPY server ./server
COPY client ./client

# Build the client bundle and compile the server
RUN npm run build:client
RUN npm --prefix server run db:generate
RUN npm run build:server

# ---- runtime image ----
FROM node:20-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080

# Only the compiled output and production deps are needed at runtime
COPY --from=build /app/server/package.json ./server/package.json
COPY --from=build /app/server/node_modules ./server/node_modules
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/server/prisma ./server/prisma
COPY --from=build /app/client/dist ./client/dist
RUN apk add --no-cache openssl libc6-compat

# Cloudflare routes to this port. Keep it in sync with CONTAINER_PORT in
# worker/index.ts and PORT in wrangler.jsonc.
EXPOSE 8080

# No `prisma migrate deploy` here: the MongoDB backend has no migrations to
# apply, and the command would fail without a PostgreSQL connection string.
#
# Run node directly rather than through `npm start`: npm as PID 1 can swallow
# the SIGTERM Cloudflare sends before stopping an instance, and the server has
# a graceful shutdown handler that needs to see it.
CMD ["node", "server/dist/index.js"]
