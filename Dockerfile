# Use Node.js 18 as base image
FROM node:18-alpine AS base

# Configure Alpine to use China mirrors
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories

# Install dependencies needed for the build
RUN apk add --no-cache \
    bash \
    git \
    python3 \
    py3-pip \
    make \
    g++ \
    curl

# Configure npm to use China registry
RUN npm config set registry https://registry.npmmirror.com/

# Configure pip to use Tsinghua mirror
RUN pip config set global.index-url https://pypi.tuna.tsinghua.edu.cn/simple

# Install bun
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:$PATH"
# Set working directory
WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install pnpm and dependencies
RUN npm install -g pnpm && \
    pnpm config set registry https://registry.npmmirror.com/ && \
    pnpm install

# Copy source code, excluding node_modules (handled by .dockerignore)
COPY . .
# Build the application
RUN pnpm run build

# Verify files exist after build
RUN ls -la /app/

# Also install tsx globally since it's needed at runtime
RUN npm install -g tsx

WORKDIR /workspace 
 
# Create the entrypoint script directly in the container
RUN cat << 'EOF' > /entrypoint.sh
#!/bin/sh

# Generate random workspace directory name with timestamp and random suffix
WORKSPACE_DIR="/workspace_$(date +%s)_$(head /dev/urandom | tr -dc a-z0-9 | head -c 8)"

# Create the workspace directory
mkdir -p "$WORKSPACE_DIR"

# Mount bind the random workspace to the default /workspace directory
mount --bind "$WORKSPACE_DIR" /workspace

 
# Change to the workspace directory
cd "$WORKSPACE_DIR" || exit 1

/root/.bun/bin/bun /app/cli.js "$@"
EOF

RUN chmod +x /entrypoint.sh

# Set the entrypoint
ENTRYPOINT ["/entrypoint.sh"]