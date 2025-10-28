# Database Management Scripts Makefile
# Provides convenient commands for database initialization, migration, and management

# Default configuration (can be overridden by .env files)
ENVIRONMENT ?= development
NODE_ENV ?= $(ENVIRONMENT)

# Load environment variables from .env files
ifneq (,$(wildcard .env.$(NODE_ENV)))
    include .env.$(NODE_ENV)
    export
endif

ifneq (,$(wildcard .env))
    include .env
    export
endif

# Set defaults if not provided by environment
MONGO_URL ?= mongodb://localhost:27017
MONGO_DB ?= mytaptrack
AWS_REGION ?= us-east-1

# Build configuration
NODE_MODULES = node_modules
DIST_DIR = dist
TS_FILES = $(wildcard *.ts)
JS_FILES = $(TS_FILES:%.ts=$(DIST_DIR)/%.js)

.PHONY: help install build clean migrate validate backup restore seed-dev seed-test seed-staging list-backups

# Default target
help:
	@echo "Database Management Scripts"
	@echo ""
	@echo "Available commands:"
	@echo "  install          Install dependencies and build scripts"
	@echo "  build            Build TypeScript files"
	@echo "  clean            Clean build artifacts"
	@echo ""
	@echo "Migration commands:"
	@echo "  migrate          Migrate DynamoDB data to MongoDB"
	@echo "  migrate-export   Export DynamoDB data only"
	@echo "  migrate-import   Import data to MongoDB"
	@echo ""
	@echo "Validation commands:"
	@echo "  validate         Validate MongoDB schema"
	@echo "  validate-report  Generate validation report"
	@echo ""
	@echo "Backup commands:"
	@echo "  backup           Create database backup"
	@echo "  restore          Restore from backup (requires BACKUP_PATH)"
	@echo "  list-backups     List available backups"
	@echo ""
	@echo "Data seeding commands:"
	@echo "  seed-dev         Seed development data"
	@echo "  seed-test        Seed testing data"
	@echo "  seed-staging     Seed staging data"
	@echo "  seed-custom      Seed custom data (requires USERS, STUDENTS, DEVICES)"
	@echo ""
	@echo "Index management commands:"
	@echo "  create-indexes   Create all required database indexes"
	@echo "  validate-indexes Validate existing indexes"
	@echo "  recreate-indexes Drop and recreate all indexes"
	@echo ""
	@echo "Environment variables:"
	@echo "  NODE_ENV         Environment (development|test|production)"
	@echo "  MONGO_URL        MongoDB connection string"
	@echo "  MONGO_DB         MongoDB database name"
	@echo "  AWS_REGION       AWS region"
	@echo "  AWS_PROFILE      AWS profile to use"
	@echo ""
	@echo "Configuration files:"
	@echo "  .env.development Development environment settings"
	@echo "  .env.test        Test environment settings"
	@echo "  .env             Default environment settings"

# Installation and build
install: $(NODE_MODULES) build

$(NODE_MODULES): package.json
	npm install
	@touch $(NODE_MODULES)

build: $(DIST_DIR) $(JS_FILES)

$(DIST_DIR):
	mkdir -p $(DIST_DIR)

$(DIST_DIR)/%.js: %.ts $(NODE_MODULES) tsconfig.json
	npm run build

clean:
	rm -rf $(DIST_DIR)
	rm -rf $(NODE_MODULES)

# Migration commands
migrate: build
	@echo "Starting DynamoDB to MongoDB migration..."
	node $(DIST_DIR)/migrate-dynamodb-to-mongodb.js \
		--mongo-url $(MONGO_URL) \
		--mongo-db $(MONGO_DB) \
		--region $(AWS_REGION) \
		$(if $(AWS_PROFILE),--profile $(AWS_PROFILE)) \
		--validate \
		--backup

migrate-export: build
	@echo "Exporting DynamoDB data..."
	node $(DIST_DIR)/migrate-dynamodb-to-mongodb.js \
		--region $(AWS_REGION) \
		$(if $(AWS_PROFILE),--profile $(AWS_PROFILE)) \
		--output ./export-$(shell date +%Y%m%d-%H%M%S).json

migrate-import: build
	@if [ -z "$(IMPORT_FILE)" ]; then \
		echo "Error: IMPORT_FILE is required"; \
		echo "Usage: make migrate-import IMPORT_FILE=./export.json"; \
		exit 1; \
	fi
	@echo "Importing data to MongoDB..."
	node $(DIST_DIR)/migrate-dynamodb-to-mongodb.js \
		--mongo-url $(MONGO_URL) \
		--mongo-db $(MONGO_DB) \
		--input $(IMPORT_FILE) \
		--validate

# Validation commands
validate: build
	@echo "Validating MongoDB schema..."
	node $(DIST_DIR)/database-schema-validator.js \
		--mongo-url $(MONGO_URL) \
		--database $(MONGO_DB)

validate-report: build
	@echo "Generating validation report..."
	node $(DIST_DIR)/database-schema-validator.js \
		--mongo-url $(MONGO_URL) \
		--database $(MONGO_DB) \
		--output ./validation-report-$(shell date +%Y%m%d-%H%M%S).md

# Backup commands
backup: build
	@echo "Creating database backup..."
	node $(DIST_DIR)/database-backup-restore.js backup \
		--mongo-url $(MONGO_URL) \
		--database $(MONGO_DB) \
		--output ./backups

restore: build
	@if [ -z "$(BACKUP_PATH)" ]; then \
		echo "Error: BACKUP_PATH is required"; \
		echo "Usage: make restore BACKUP_PATH=./backups/backup-2023-12-01T10-00-00-000Z"; \
		exit 1; \
	fi
	@echo "Restoring from backup: $(BACKUP_PATH)"
	node $(DIST_DIR)/database-backup-restore.js restore $(BACKUP_PATH) \
		--mongo-url $(MONGO_URL) \
		--database $(MONGO_DB) \
		--validate

list-backups: build
	@echo "Available backups:"
	node $(DIST_DIR)/database-backup-restore.js list \
		--output ./backups

# Data seeding commands
seed-dev: build
	@echo "Seeding development data..."
	node $(DIST_DIR)/seed-test-data.js \
		--environment development \
		--mongo-url $(MONGO_URL) \
		--database $(MONGO_DB) \
		$(if $(CLEAR),--clear)

seed-test: build
	@echo "Seeding testing data..."
	node $(DIST_DIR)/seed-test-data.js \
		--environment testing \
		--mongo-url $(MONGO_URL) \
		--database $(MONGO_DB) \
		$(if $(CLEAR),--clear)

seed-staging: build
	@echo "Seeding staging data..."
	node $(DIST_DIR)/seed-test-data.js \
		--environment staging \
		--mongo-url $(MONGO_URL) \
		--database $(MONGO_DB) \
		$(if $(CLEAR),--clear)

seed-custom: build
	@if [ -z "$(USERS)" ] || [ -z "$(STUDENTS)" ] || [ -z "$(DEVICES)" ]; then \
		echo "Error: USERS, STUDENTS, and DEVICES are required"; \
		echo "Usage: make seed-custom USERS=50 STUDENTS=200 DEVICES=150"; \
		exit 1; \
	fi
	@echo "Seeding custom data (Users: $(USERS), Students: $(STUDENTS), Devices: $(DEVICES))..."
	node $(DIST_DIR)/seed-test-data.js \
		--environment $(ENVIRONMENT) \
		--mongo-url $(MONGO_URL) \
		--database $(MONGO_DB) \
		--users $(USERS) \
		--students $(STUDENTS) \
		--devices $(DEVICES) \
		$(if $(DAYS),--days $(DAYS)) \
		$(if $(CLEAR),--clear)

# Docker integration commands
docker-init: build
	@echo "Initializing MongoDB in Docker container..."
	docker-compose -f ../docker-compose.yml exec mongodb mongosh mytaptrack /docker-entrypoint-initdb.d/01-init-database.js

docker-seed: build
	@echo "Seeding data in Docker container..."
	docker-compose -f ../docker-compose.yml exec mongodb mongosh mytaptrack /docker-entrypoint-initdb.d/02-seed-development-data.js

docker-validate: build
	@echo "Validating Docker MongoDB..."
	$(MAKE) validate MONGO_URL=mongodb://admin:password@localhost:27017

docker-backup: build
	@echo "Creating backup of Docker MongoDB..."
	$(MAKE) backup MONGO_URL=mongodb://admin:password@localhost:27017

# Development helpers
dev-setup: install docker-init docker-seed
	@echo "Development environment setup complete"

dev-reset: build
	@echo "Resetting development environment..."
	$(MAKE) seed-dev CLEAR=1 MONGO_URL=mongodb://admin:password@localhost:27017

dev-status: build
	@echo "Development environment status:"
	$(MAKE) validate MONGO_URL=mongodb://admin:password@localhost:27017

# Testing helpers
test-migration: build
	@echo "Testing migration process..."
	@echo "1. Creating test backup..."
	$(MAKE) backup MONGO_URL=$(MONGO_URL)
	@echo "2. Validating schema..."
	$(MAKE) validate MONGO_URL=$(MONGO_URL)
	@echo "3. Migration test complete"

# Production helpers
prod-migrate: build
	@if [ -z "$(AWS_PROFILE)" ]; then \
		echo "Error: AWS_PROFILE is required for production migration"; \
		exit 1; \
	fi
	@echo "Production migration (Profile: $(AWS_PROFILE))..."
	$(MAKE) migrate AWS_PROFILE=$(AWS_PROFILE) AWS_REGION=$(AWS_REGION)

prod-backup: build
	@echo "Creating production backup..."
	$(MAKE) backup MONGO_URL=$(MONGO_URL)

# Index management commands
create-indexes: build
	@echo "Creating database indexes..."
	node $(DIST_DIR)/create-indexes.js create \
		--mongo-url $(MONGO_URL) \
		--database $(MONGO_DB)

validate-indexes: build
	@echo "Validating database indexes..."
	node $(DIST_DIR)/create-indexes.js validate \
		--mongo-url $(MONGO_URL) \
		--database $(MONGO_DB)

recreate-indexes: build
	@echo "Recreating database indexes..."
	node $(DIST_DIR)/create-indexes.js recreate \
		--mongo-url $(MONGO_URL) \
		--database $(MONGO_DB)

# Utility commands
check-deps:
	@echo "Checking dependencies..."
	@command -v node >/dev/null 2>&1 || { echo "Node.js is required but not installed"; exit 1; }
	@command -v npm >/dev/null 2>&1 || { echo "npm is required but not installed"; exit 1; }
	@command -v docker >/dev/null 2>&1 || { echo "Docker is required but not installed"; exit 1; }
	@echo "All dependencies are available"

check-mongo:
	@echo "Checking MongoDB connection..."
	@node -e "const { MongoClient } = require('mongodb'); \
		const client = new MongoClient('$(MONGO_URL)'); \
		client.connect().then(() => { \
			console.log('MongoDB connection successful'); \
			client.close(); \
		}).catch(err => { \
			console.error('MongoDB connection failed:', err.message); \
			process.exit(1); \
		});"

check-aws:
	@echo "Checking AWS credentials..."
	@aws sts get-caller-identity $(if $(AWS_PROFILE),--profile $(AWS_PROFILE)) >/dev/null 2>&1 || { \
		echo "AWS credentials not configured or invalid"; \
		exit 1; \
	}
	@echo "AWS credentials are valid"

# Documentation
docs:
	@echo "Generating documentation..."
	@echo "# Database Scripts Documentation" > USAGE.md
	@echo "" >> USAGE.md
	@echo "Generated on: $$(date)" >> USAGE.md
	@echo "" >> USAGE.md
	@$(MAKE) help >> USAGE.md
	@echo "Documentation generated: USAGE.md"

# All-in-one commands
setup: check-deps install
	@echo "Setup complete"

full-dev-setup: setup dev-setup
	@echo "Full development setup complete"

full-test: setup test-migration
	@echo "Full test suite complete"