# Build the PWA and a single bundled server file, then run plain Node on Cloud Run's $PORT (no TypeScript step at startup).
FROM node:22-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
USER node
CMD ["node", "dist-server/index.mjs"]
