# Stage 1: Build Frontend
FROM node:20-alpine AS builder
WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

# Stage 2: Production Server
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY package*.json ./
RUN npm ci --only=production

COPY server.js ai-engine.js ./
COPY data/ ./data/
COPY --from=builder /app/public ./public

EXPOSE 3000

CMD ["node", "server.js"]
