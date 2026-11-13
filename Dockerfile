# Build the PWA, then run the Node server (serves dist/ + /api) on Cloud Run's $PORT.
FROM node:22-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY server ./server
COPY src ./src
COPY tsconfig.json tsconfig.server.json ./
USER node
CMD ["npx", "tsx", "server/index.ts"]
