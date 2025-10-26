# Default target
.DEFAULT_GOAL := help

.PHONY: help install install-graphql install-deps build deploy test update-env clean unit_tests deploy-core deploy-graphql deploy-api deploy-device deploy-data-prop \
	docker-dev-start docker-dev-stop docker-dev-restart docker-dev-logs docker-dev-status docker-dev-clean \
	docker-prod-start docker-prod-stop docker-prod-restart docker-prod-logs docker-prod-status docker-prod-backup \
	docker-test-start docker-test-stop docker-test-run docker-test-clean \
	docker-build-dev docker-build-prod docker-build-test \
	docker-shell-mongodb docker-shell-redis docker-shell-graphql docker-shell-rest docker-shell-device \
	docker-setup-dev docker-setup-prod docker-dev docker-prod clean-all

# Help command to show available targets
help:
	@echo "MyTapTrack Build System"
	@echo ""
	@echo "AWS CDK Deployment Commands:"
	@echo "  install              - Full installation and deployment to AWS"
	@echo "  install-deps         - Install dependencies for all services"
	@echo "  build               - Build all services"
	@echo "  deploy              - Deploy all services to AWS"
	@echo "  deploy-core         - Deploy core infrastructure"
	@echo "  deploy-graphql      - Deploy GraphQL API"
	@echo "  deploy-api          - Deploy REST API"
	@echo "  deploy-device       - Deploy Device API"
	@echo "  deploy-data-prop    - Deploy data propagation service"
	@echo "  test                - Run system tests"
	@echo "  uninstall           - Destroy all AWS stacks"
	@echo "  clean               - Clean build artifacts"
	@echo ""
	@echo "Docker Container Commands:"
	@echo "  docker-dev          - Setup and start development environment"
	@echo "  docker-prod         - Setup and start production environment"
	@echo "  docker-dev-start    - Start development containers"
	@echo "  docker-dev-stop     - Stop development containers"
	@echo "  docker-dev-restart  - Restart development containers"
	@echo "  docker-dev-logs     - Show development container logs"
	@echo "  docker-dev-status   - Show development container status"
	@echo "  docker-dev-clean    - Clean development containers and volumes"
	@echo "  docker-prod-start   - Start production containers"
	@echo "  docker-prod-stop    - Stop production containers"
	@echo "  docker-prod-restart - Restart production containers"
	@echo "  docker-prod-logs    - Show production container logs"
	@echo "  docker-prod-status  - Show production container status"
	@echo "  docker-prod-backup  - Backup production databases"
	@echo "  docker-test-start   - Start test containers"
	@echo "  docker-test-stop    - Stop test containers"
	@echo "  docker-test-run     - Run tests in containers"
	@echo "  docker-test-clean   - Clean test containers"
	@echo "  docker-build-dev    - Build development images"
	@echo "  docker-build-prod   - Build production images"
	@echo "  docker-shell-*      - Open shell in specific container"
	@echo "  test-containers     - Configure and run system tests against dev containers"
	@echo "  test-containers-dev - Configure and run system tests against dev containers"
	@echo "  test-containers-test - Configure and run system tests against test containers"
	@echo "  test-containers-prod - Configure and run system tests against prod containers"
	@echo "  test-containers-configure - Configure system tests for container mode (dev)"
	@echo "  test-containers-configure-env ENV=<env> - Configure for specific environment"
	@echo "  test-containers-run - Run system tests (after configuration)"
	@echo "  test-containers-health - Run container health tests only"
	@echo "  test-containers-full - Start containers and run full test suite"
	@echo "  test-containers-with-cleanup - Run tests and cleanup containers"
	@echo "  test-aws-configure  - Configure system tests for AWS mode"
	@echo "  ensure-data-collection - Ensure data collection exists in dev MongoDB"
	@echo "  clean-all           - Clean everything including Docker"
	@echo ""
	@echo "Environment Commands:"
	@echo "  set-env             - Set environment variables (STAGE=dev|test|prod)"
	@echo "  del-env             - Delete environment (STAGE=dev|test|prod)"
	@echo "  configure-env       - Configure environment settings"
	@echo ""

# Full installation and deployment
install: install-deps build configure-env set-env deploy

env-setup: install-deps set-env

set-env:
	cd utils && npm ci && npm run set-env ${STAGE}

del-env:
	cd utils && npm ci && npm run del-env ${STAGE}

# Install dependencies for all services
install-deps:
	cd types && npm ci && npm run build && cd ..
	cd cdk && npm ci && npm run build && cd ..
	cd lib && npm ci && npm run build && cd ..
	cd core && npm ci && cd ..
	cd api && npm ci && cd ..
	cd data-prop && npm ci && cd ..
	cd system-tests && npm ci && cd ..

# Build all services
build:
	cd types && npm run build && cd ..

	cd lib && npm run build && cd ..

# Deploy all services
deploy: set-env deploy-core deploy-data-prop deploy-graphql deploy-api deploy-device

# Individual deployment targets
deploy-core:
	cd core && cdk deploy --require-approval never && cd ..

deploy-graphql:
	cd api && cdk deploy --require-approval never graphql && cd ..

deploy-api:
	cd api && cdk deploy --require-approval never api && cd ..

deploy-device:
	cd api && cdk deploy --require-approval never device && cd ..

deploy-data-prop:
	cd data-prop && cdk deploy --require-approval never && cd ..

# Install only GraphQL service
install-graphql: 
	cd api && npm i && cd ..
	cd api && cdk deploy graphql && cd ..

configure-license:
	cd utils && npm i && npm run setup-env

uninstall:
	cd data-prop && cdk destroy
	cd api && cdk destroy --all
	cd core && cdk destroy

# Update environment configurations
update-env:
	cd utils && npm i && npm run setenv && cd ..

configure: install-deps configure-env

configure-env:
	cd utils && npm run setup-env

push-env:
	cd utils && npm run set-env

test:
	cd system-tests && npm run envSetup && npm test

export-data:
	cd utils && npm run export-data

# Docker Container Commands
# Development environment
docker-dev-start:
	cd containers && ./manage.sh start dev

docker-dev-stop:
	cd containers && ./manage.sh stop dev

docker-dev-restart:
	cd containers && ./manage.sh restart dev

docker-dev-logs:
	cd containers && ./manage.sh logs dev

docker-dev-status:
	cd containers && ./manage.sh status dev

docker-dev-clean:
	cd containers && ./manage.sh clean dev

# Production environment
docker-prod-start:
	cd containers && ./manage.sh start prod

docker-prod-stop:
	cd containers && ./manage.sh stop prod

docker-prod-restart:
	cd containers && ./manage.sh restart prod

docker-prod-logs:
	cd containers && ./manage.sh logs prod

docker-prod-status:
	cd containers && ./manage.sh status prod

docker-prod-backup:
	cd containers && ./manage.sh backup prod

# Test environment
docker-test-start:
	cd containers && ./manage.sh start test

docker-test-stop:
	cd containers && ./manage.sh stop test

docker-test-run:
	cd containers && docker-compose -f docker-compose.test.yml up --abort-on-container-exit

docker-test-clean:
	cd containers && ./manage.sh clean test

# Container testing commands
test-containers: test-containers-dev

test-containers-dev: docker-dev-start
	@echo "Configuring and running system tests against dev containers..."
	cd system-tests && npm run test:container:dev

test-containers-test: docker-test-start
	@echo "Configuring and running system tests against test containers..."
	cd system-tests && npm run test:container:test

test-containers-prod: docker-prod-start
	@echo "Configuring and running system tests against prod containers..."
	cd system-tests && npm run test:container:prod

test-containers-configure:
	@echo "Configuring system tests for container mode (dev)..."
	cd system-tests && npm run configure:containers:dev

test-containers-configure-env:
	@echo "Configuring system tests for container mode ($(ENV))..."
	cd system-tests && npm run configure:containers:$(ENV)

test-containers-run:
	@echo "Running system tests (must be configured for containers first)..."
	cd system-tests && npm test

test-containers-health:
	@echo "Running container health tests..."
	cd system-tests && npm run test:container:health

test-containers-full: test-containers-dev

test-containers-with-cleanup: test-containers docker-dev-stop

test-aws-configure:
	@echo "Configuring system tests for AWS mode..."
	cd system-tests && npm run configure:aws

# Database utilities
ensure-data-collection:
	@echo "Ensuring data collection exists in dev MongoDB..."
	./containers/scripts/ensure-data-collection.sh

# Docker build commands
docker-build-dev:
	cd containers && ./manage.sh build dev

docker-build-prod:
	cd containers && ./manage.sh build prod

docker-build-test:
	cd containers && ./manage.sh build test

# Docker utility commands
docker-shell-mongodb:
	cd containers && ./manage.sh shell dev mongodb

docker-shell-redis:
	cd containers && ./manage.sh shell dev redis

docker-shell-graphql:
	cd containers && ./manage.sh shell dev graphql-api

docker-shell-rest:
	cd containers && ./manage.sh shell dev rest-api

docker-shell-device:
	cd containers && ./manage.sh shell dev device-api

# Docker setup commands
docker-setup-dev:
	cd containers && cp .env.example .env.dev && echo "Please edit containers/.env.dev with your development settings"

docker-setup-prod:
	cd containers && cp .env.example .env && echo "Please edit containers/.env with your production settings"

# Combined commands for easy development workflow
docker-dev: docker-setup-dev docker-build-dev docker-dev-start

docker-prod: docker-setup-prod docker-build-prod docker-prod-start

# Clean build artifacts
clean:
	cd types && rm -rf node_modules && cd ..
	cd lib && rm -rf node_modules && cd ..
	cd core && rm -rf node_modules && cd ..
	cd api && rm -rf node_modules && cd ..
	cd utils && rm -rf node_modules && cd ..
	cd data-prop && rm -rf node_modules && cd ..
	find . -name "*.js.map" -type f -delete
	find . -name "*.d.ts" -type f -delete
	find . -name "cdk.out" -type d -exec rm -rf {} +

# Clean everything including Docker
clean-all: clean
	cd containers && ./manage.sh clean dev || true
	cd containers && ./manage.sh clean prod || true
	cd containers && ./manage.sh clean test || true
	docker system prune -f