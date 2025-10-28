FROM node:18-alpine

# Install system dependencies
RUN apk add --no-cache \
    bash \
    curl \
    jq \
    docker-cli \
    mongodb-tools \
    redis

# Install global npm packages for development
RUN npm install -g \
    nodemon \
    ts-node \
    typescript \
    @types/node

# Create app directory
WORKDIR /app

# Copy package files
COPY containers/scripts/package*.json ./scripts/
COPY package*.json ./

# Install dependencies
RUN cd scripts && npm ci

# Copy development tools
COPY containers/dev-tools/tools ./dev-tools/
COPY containers/scripts ./scripts/

# Make scripts executable
RUN chmod +x dev-tools/*.sh

# Set default command
CMD ["tail", "-f", "/dev/null"]