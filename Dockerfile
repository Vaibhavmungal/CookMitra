# Multi-stage: build the React frontend, then serve it + the API from one
# Node process (backend/server.js auto-detects frontend/build and serves it).
# Build:  docker build -t festivecook .
# Run:    docker run -p 5000:5000 --env-file backend/.env festivecook

# ---- Stage 1: build frontend ----
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
# REACT_APP_* values are baked in at build time. For a single-service deploy
# leave them unset so the app uses same-origin /api paths.
RUN npm run build

# ---- Stage 2: production server ----
FROM node:20-alpine
WORKDIR /app/backend
ENV NODE_ENV=production
COPY backend/package*.json ./
RUN npm ci --omit=dev
COPY backend/ ./
COPY --from=frontend-build /app/frontend/build ../frontend/build
# Runtime uploads live on a mounted volume in production; create the dir anyway.
RUN mkdir -p uploads/cook-docs
EXPOSE 5000
CMD ["node", "server.js"]