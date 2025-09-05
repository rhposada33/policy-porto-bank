# Multi-stage Dockerfile for NestJS app
# Stage 1: build
FROM node:20-alpine AS builder
WORKDIR /usr/src/app

# Install build deps
COPY package.json package-lock.json* ./
COPY tsconfig*.json ./
RUN npm ci --silent

# Copy source and build
COPY . .
RUN npm run build

# Stage 2: runtime
FROM node:20-alpine AS runner
WORKDIR /usr/src/app
ENV NODE_ENV=production

# Copy package.json and production deps
COPY package.json package-lock.json* ./
RUN npm ci --production --silent

# Copy compiled output
COPY --from=builder /usr/src/app/dist ./dist

EXPOSE 3000
CMD ["node", "dist/main"]
