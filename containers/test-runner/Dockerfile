# Test Runner Dockerfile
FROM node:18-alpine AS base

# Install security updates and create non-root user
RUN apk update && apk upgrade && \
    apk add --no-cache dumb-init curl && \
    addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Set working directory
WORKDIR /app

# Copy package files for dependency installation
COPY system-tests/package*.json ./

# Install dependencies
RUN npm ci && npm cache clean --force

# Copy test files
COPY system-tests/ ./

# Switch to non-root user
USER nodejs

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Default command to run tests
CMD ["npm", "test"]