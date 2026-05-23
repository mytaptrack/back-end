.PHONY: install install-graphql install-deps build deploy test update-env clean unit_tests deploy-core deploy-graphql deploy-api deploy-device deploy-data-prop container-up container-down container-logs container-init container-services test-local device-start rest-start device-watch rest-watch graphql-watch rabbitmq-consumer rabbitmq-watch start-all

# AWS configuration — override on command line: make deploy-core AWS_PROFILE=myprofile STAGE=dev
AWS_PROFILE ?= default
STAGE ?= dev

# Container commands
container-up:
	docker-compose up -d

container-services:
	docker-compose up -d dynamodb-local rabbitmq redis

container-down:
	docker-compose down

container-logs:
	docker-compose logs -f

container-init:
	cd api && npm run container:init-tables

# Local device API (without Docker)
device-start:
	cd api && npm run device:start

device-watch:
	cd api && npm run device:watch

# Local REST API (without Docker)
rest-start:
	cd api && npm run rest:start

rest-watch:
	cd api && npm run rest:watch

# Local GraphQL API (without Docker)
graphql-watch:
	cd api && npm run graphql:watch

# Local RabbitMQ consumer
rabbitmq-consumer:
	cd api && npm run rabbitmq:consumer

rabbitmq-watch:
	cd api && npm run rabbitmq:watch

# Start all local services (GraphQL + RabbitMQ consumer)
start-all:
	cd api && npm run start:all

# Local testing
test-local:
	cd system-tests && npm run test:local

# Full installation and deployment
install: install-deps build configure-env set-env deploy

env-setup: install-deps set-env

set-env:
	cd utils && npm ci && AWS_PROFILE=$(AWS_PROFILE) npm run set-env $(STAGE)

del-env:
	cd utils && npm ci && AWS_PROFILE=$(AWS_PROFILE) npm run del-env $(STAGE)

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
	cd core && AWS_PROFILE=$(AWS_PROFILE) STAGE=$(STAGE) cdk deploy --require-approval never && cd ..

deploy-graphql:
	cd api && AWS_PROFILE=$(AWS_PROFILE) STAGE=$(STAGE) cdk deploy --require-approval never graphql && cd ..

deploy-api:
	cd api && AWS_PROFILE=$(AWS_PROFILE) STAGE=$(STAGE) cdk deploy --require-approval never api && cd ..

deploy-device:
	cd api && AWS_PROFILE=$(AWS_PROFILE) STAGE=$(STAGE) cdk deploy --require-approval never device && cd ..

deploy-data-prop:
	cd data-prop && AWS_PROFILE=$(AWS_PROFILE) STAGE=$(STAGE) cdk deploy --require-approval never && cd ..

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