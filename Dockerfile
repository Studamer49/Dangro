# Syntax: https://docs.docker.com/engine/reference/builder/
FROM node:20-alpine AS build

WORKDIR /app

# Install root scripts (concurrently) for `npm run build`
COPY package.json package-lock.json* ./
COPY server/package.json ./server/
COPY client/package.json ./client/
RUN npm ci --no-audit

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

EXPOSE 3001

CMD ["npm", "start"]