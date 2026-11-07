#!/usr/bin/env bash
set -euo pipefail

# Named volumes are created owned by root
sudo chown node:node node_modules {types,cdk,lib,core,api,data-prop,system-tests,cicd,utils}/node_modules

# esbuild lets CDK bundle Lambdas locally; there is no Docker daemon in this container
npm install -g aws-cdk esbuild

npm install -g @anthropic-ai/claude-code

# Dependency order: types -> cdk -> lib -> everything else
npm i
for module in types cdk lib; do
    (cd "$module" && npm i)
    # tsc still emits on type errors, so a failed check shouldn't stop the container setup
    (cd "$module" && npm run build) || echo "WARNING: $module build reported errors"
done
for module in core api data-prop system-tests cicd utils; do
    (cd "$module" && npm i)
done

cat <<'EOF'

Dev container ready. First run only: make container-init
Then start GraphQL and the RabbitMQ consumer with: make start-all
REST and device APIs run separately: make rest-start, make device-start
EOF
