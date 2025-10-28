#!/bin/bash

# Configuration Setup Script for MyTapTrack
# This script helps set up configuration files safely

set -e

echo "🔧 MyTapTrack Configuration Setup"
echo "=================================="

# Function to copy example config if it doesn't exist
copy_config_if_needed() {
    local example_file="$1"
    local target_file="$2"
    
    if [ -f "$example_file" ] && [ ! -f "$target_file" ]; then
        echo "📋 Copying $example_file to $target_file"
        cp "$example_file" "$target_file"
        echo "✅ Created $target_file"
        echo "⚠️  Please update $target_file with your actual configuration values"
        echo ""
    elif [ -f "$target_file" ]; then
        echo "✅ $target_file already exists"
    else
        echo "❌ Example file $example_file not found"
    fi
}

# Create config directories if they don't exist
mkdir -p config
mkdir -p containers/config

echo "Setting up configuration files..."
echo ""

# Copy AWS production config
copy_config_if_needed "config/aws-prod.yml.example" "config/aws-prod.yml"

# Copy Docker production config  
copy_config_if_needed "containers/config/production.yml.example" "containers/config/production.yml"

# Copy environment variables file
copy_config_if_needed ".env.example" ".env"

echo "🔒 Security Reminders:"
echo "====================="
echo "1. Never commit production configuration files to version control"
echo "2. Use environment variables for all sensitive values"
echo "3. Production config files are automatically ignored by .gitignore"
echo "4. Use secret management systems (AWS Secrets Manager, Docker Secrets, etc.)"
echo ""

echo "📚 Next Steps:"
echo "=============="
echo "1. Update the copied configuration files with your actual values"
echo "2. Set up environment variables for sensitive data"
echo "3. Configure your secret management system"
echo "4. Test your configuration with: npm run test"
echo ""

echo "✨ Configuration setup complete!"