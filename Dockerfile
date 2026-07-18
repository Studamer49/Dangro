FROM node:20-alpine AS base

WORKDIR /app

COPY package.json package-lock.json* ./
COPY server/package.json ./server/
COPY client/package.json ./client/

RUN npm install --prefix server
RUN npm install --prefix client

COPY server ./server
COPY client ./client
COPY package.json ./

RUN npm run build --prefix client
RUN cd server && npx prisma generate
RUN npm run build --prefix server

EXPOSE 3001

CMD ["npm", "start"]
