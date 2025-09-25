# Borderlands SHIFT Code Manager - Production Makefile

.PHONY: test-server build clean help

# Default target
help:
	@echo "Borderlands SHIFT Code Manager - Production Tasks"
	@echo ""
	@echo "Available targets:"
	@echo "  test-server  - Start the Python test server for development testing"
	@echo "  build        - Create production zip file for browser extension upload"
	@echo "  clean        - Clean up generated files and directories"
	@echo "  help         - Show this help message"

# Start the Python test server for testing
test-server:
	@echo "Starting SHIFT code test server..."
	@if [ ! -f test/test-server.py ]; then \
		echo "Error: test/test-server.py not found"; \
		exit 1; \
	fi
	@cd test && python3 test-server.py

# Build production zip for browser extension upload
build:
	@echo "Building production extension package..."
	@mkdir -p dist
	@zip -r dist/shift-code-manager-production.zip \
		manifest.json \
		popup.html \
		help.html \
		popup.js \
		background.js \
		shift-handler.js \
		assets/ \
		LICENSE \
		PRIVACY.md
	@echo "✅ Production package created: dist/shift-code-manager-production.zip"

# Clean up generated files
clean:
	@echo "Cleaning up generated files..."
	@rm -rf dist/
	@echo "✅ Cleanup complete"

# Development shortcuts
dev: test-server

# Production shortcuts  
prod: clean build
