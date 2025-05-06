.PHONY: install install-graphql install-deps build deploy test update-env clean unit_tests deploy-core deploy-graphql deploy-api deploy-device deploy-data-prop

# Full installation and deployment
install: install-deps build set-env deploy

env-setup: install-deps set-env

set-env:
	cdk core && npm run setenv

# Install dependencies for all services
install-deps:
	cd cdk && npm ci && npm run build && cd ..
	cd lib && npm ci && npm run build && cd ..
	cd core && npm ci && cd ..
	cd api && npm ci && cd ..
	cd data-prop && npm ci && cd ..
	cd system-tests && npm ci && cd ..

# Build all services
build:
	cd lib && npm run build && cd ..
	cd core && npm run setenv ${STAGE} && cd ..

# Deploy all services
deploy: deploy-core deploy-data-prop deploy-graphql deploy-api deploy-device

# Individual deployment targets
deploy-core:
	# cd core && cdk deploy && cd ..

deploy-graphql:
	# cd api && cdk deploy graphql && cd ..

deploy-api:
	# cd api && cdk deploy api && cd ..

deploy-device:
	# cd api && cdk deploy device && cd ..

deploy-data-prop:
	# cd data-prop && cdk deploy && cd ..

# Install only GraphQL service
install-graphql: 
	cd api && npm i && cd ..
	cd api && cdk deploy graphql && cd ..

# Update environment configurations
update-env:
	cd core && npm i && npm run setenv && cd ..

configure: install-deps configure-env

configure-env:
	cd core && npm run setup-env

# Run unit tests
unit_tests:
	cd lib && npm test && cd ..
	cd core && npm test && cd ..
	cd api && npm test && cd ..
	cd data-prop && npm test && cd ..

test:
	cd system-tests && npm run envSetup && npm test


# Clean build artifacts
clean:
	cd lib && rm -rf node_modules && cd ..
	cd core && rm -rf node_modules && cd ..
	cd api && rm -rf node_modules && cd ..
	cd data-prop && rm -rf node_modules && cd ..
	find . -name "*.js.map" -type f -delete
	find . -name "*.d.ts" -type f -delete
	find . -name "cdk.out" -type d -exec rm -rf {} +