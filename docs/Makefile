# Documentation Makefile
# Provides commands for building, validating, and deploying documentation

.PHONY: help install build start validate validate-links validate-diagrams validate-content validate-accessibility deploy clean

# Default target
help:
	@echo "MyTapTrack Documentation Build System"
	@echo ""
	@echo "Available targets:"
	@echo "  install              - Install documentation dependencies"
	@echo "  build                - Build static documentation site"
	@echo "  start                - Start development server"
	@echo "  validate             - Run comprehensive validation (all checks)"
	@echo "  validate-links       - Validate internal and external links"
	@echo "  validate-diagrams    - Validate draw.io diagram files"
	@echo "  validate-content     - Validate content quality and consistency"
	@echo "  validate-accessibility - Validate accessibility compliance"
	@echo "  generate             - Generate API documentation"
	@echo "  deploy               - Deploy to production"
	@echo "  clean                - Clean build artifacts"
	@echo ""

# Install dependencies
install:
	@echo "📦 Installing documentation dependencies..."
	npm ci
	@echo "✅ Dependencies installed"

# Build documentation site
build: generate
	@echo "🏗️  Building documentation site..."
	npm run build
	@echo "✅ Documentation built successfully"

# Start development server
start: generate
	@echo "🚀 Starting documentation development server..."
	npm run start

# Validate documentation
validate:
	@echo "🔍 Running comprehensive documentation validation..."
	npm run validate-all
	@echo "✅ Documentation validation complete"

# Individual validation targets
validate-links:
	@echo "🔗 Validating links..."
	npm run validate-links

validate-diagrams:
	@echo "📊 Validating diagrams..."
	npm run validate-diagrams

validate-content:
	@echo "📝 Validating content..."
	npm run validate-content

validate-accessibility:
	@echo "♿ Validating accessibility..."
	npm run validate-accessibility

# Generate API documentation
generate:
	@echo "📝 Generating API documentation..."
	npm run generate-api-docs
	@echo "✅ API documentation generated"

# Deploy to production (requires AWS credentials)
deploy: build validate
	@echo "🚀 Deploying documentation to production..."
	@if [ -z "$$AWS_ACCESS_KEY_ID" ]; then \
		echo "❌ AWS credentials not configured"; \
		exit 1; \
	fi
	aws s3 sync build/ s3://mytaptrack-docs-production --delete
	@if [ ! -z "$$CLOUDFRONT_DISTRIBUTION_ID" ]; then \
		aws cloudfront create-invalidation --distribution-id $$CLOUDFRONT_DISTRIBUTION_ID --paths "/*"; \
	fi
	@echo "✅ Documentation deployed successfully"

# Clean build artifacts
clean:
	@echo "🧹 Cleaning documentation build artifacts..."
	rm -rf build/
	rm -rf .docusaurus/
	rm -rf node_modules/
	@echo "✅ Clean complete"

# Development workflow
dev: install generate start

# CI/CD workflow
ci: install generate build validate

# Full deployment workflow
full-deploy: clean install generate build validate deploy