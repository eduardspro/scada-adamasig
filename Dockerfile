# ETAPA 1: Construcción Frontend (React/Vite)
FROM node:20-alpine AS frontend-builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ETAPA 2: Distribución
FROM node:20-bookworm-slim
WORKDIR /app

RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

COPY --from=frontend-builder /app/dist ./dist
COPY server ./server
WORKDIR /app/server
RUN npm install --omit=dev

ENV NODE_ENV=production
ENV PORT=80

EXPOSE 80
CMD ["node", "index.js"]
