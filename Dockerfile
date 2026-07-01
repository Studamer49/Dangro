FROM node:20-alpine AS builder
WORKDIR /app
COPY client/package*.json client/
RUN cd client && npm ci
COPY client/ client/
RUN cd client && npm run build

FROM node:20-alpine
WORKDIR /app
COPY server/package*.json ./
RUN npm ci
COPY server/ src/
COPY --from=builder /app/client/dist public/
EXPOSE 3001
ENV NODE_ENV=production
CMD ["node", "src/index.js"]
