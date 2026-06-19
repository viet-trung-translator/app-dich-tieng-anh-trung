# ---- Build frontend (React/Vite) ----
FROM node:22-alpine AS frontend
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ---- Build backend (TypeScript -> JS) ----
FROM node:22-alpine AS backend
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci
COPY backend/ ./
RUN npm run build

# ---- Runtime: chỉ deps production + JS đã build ----
FROM node:22-alpine
WORKDIR /app/backend
ENV NODE_ENV=production
COPY backend/package*.json ./
RUN npm ci --omit=dev
COPY --from=backend /app/backend/dist ./dist
COPY --from=frontend /app/frontend/dist ./public
ENV STATIC_DIR=/app/backend/public
# Host (Render/Fly/...) tự inject PORT; mặc định 8787 nếu chạy local.
EXPOSE 8787
CMD ["node", "dist/server.js"]
