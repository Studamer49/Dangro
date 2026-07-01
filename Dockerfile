FROM node:20-alpine AS builder
WORKDIR /app
COPY client/package*.json client/
RUN cd client && npm ci
COPY client/ client/
RUN cd client && npm run build

FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY server/package*.json server/
RUN cd server && npm ci
COPY server/ server/
COPY --from=builder /app/client/dist server/public/
EXPOSE 3001
ENV NODE_ENV=production
CMD ["node", "server/src/index.js"]
