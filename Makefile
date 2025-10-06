# Borderlands SHIFT Code Manager - Production Makefile

.PHONY: test-server build clean help

# Default target
help:
	@echo "Borderlands SHIFT Code Manager - Production Tasks"
	@echo ""
	@echo "Available targets:"
	@echo "  test-server  - Start the Python test server for development testing"
	@echo "  build        - Create a test build or release package"
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

# Build artifacts via interactive prompt
build:
	@python3 scripts/release.py

# Clean up generated files
clean:
	@echo "Cleaning up generated files..."
	@rm -rf dist/
	@echo "✅ Cleanup complete"

# Development shortcuts
dev: test-server

# Production shortcuts  
prod: clean build
