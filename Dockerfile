# Syntax: https://docs.docker.com/engine/reference/builder/
FROM node:20-alpine AS build

WORKDIR /app

# Install the root scripts and every workspace's dependencies (incl. dev deps,
# which are required to typecheck/build the client and compile the server).
COPY package.json package-lock.json* ./
COPY server/package.json server/package-lock.json* ./server/
COPY client/package.json client/package-lock.json* ./client/
RUN apk add --no-cache openssl libc6-compat \
  && npm ci --no-audit \
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

# Only the compiled output and production deps are needed at runtime
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/server/package.json ./server/package.json
COPY --from=build /app/server/node_modules ./server/node_modules
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/server/prisma ./server/prisma
COPY --from=build /app/client/dist ./client/dist
RUN apk add --no-cache openssl libc6-compat

EXPOSE 3001

CMD ["sh", "-c", "npm --prefix server run db:deploy && npm start"]