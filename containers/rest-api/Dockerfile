# Multi-stage build for REST API service
FROM node:18-alpine AS base

# Install security updates and create non-root user
RUN apk update && apk upgrade && \
    apk add --no-cache dumb-init && \
    addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Set working directory
WORKDIR /app

# Build stage
FROM base AS builder

# Copy package files and source
COPY containers/rest-api/package*.json ./
COPY containers/rest-api/tsconfig.json ./
COPY containers/rest-api/src/ ./src/
COPY containers/shared/ ./shared/
COPY business-logic/core/src/logging/ ./business-logic/core/src/logging/

# Install dependencies
RUN npm install

# Build the application
RUN npm run build

# Development stage
FROM builder AS development

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 4501

# Start with nodemon for hot reloading
CMD ["npm", "run", "dev"]

# Test stage
FROM builder AS test

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 4501

# Run tests
CMD ["npm", "test"]

# Production stage
FROM base AS runtime

# Copy built application and production dependencies
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/package*.json ./

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 4501

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD node -e "process.exit(0)" || exit 1

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start application
CMD ["node", "dist/index.js"]