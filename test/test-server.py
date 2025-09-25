#!/usr/bin/env python3
"""
Simple HTTP server to serve a test page with SHiFT codes for testing notifications
Run with: python3 test-server.py
"""

import http.server
import socketserver
import os
import sys
import random
import string
from datetime import datetime

PORT = 8000

def generate_shift_code():
    """Generate a random SHiFT code in the format XXXXX-XXXXX-XXXXX-XXXXX-XXXXX"""
    def random_segment():
        # SHiFT codes use uppercase letters and numbers, but exclude some characters
        # for clarity (no 0, O, I, 1, etc.)
        chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
        return ''.join(random.choice(chars) for _ in range(5))
    
    return '-'.join(random_segment() for _ in range(5))

def generate_test_html():
    """Generate HTML with random SHiFT codes"""
    # Generate 3-5 random codes each time
    num_codes = random.randint(3, 5)
    active_codes = [generate_shift_code() for _ in range(num_codes)]
    
    # Generate 1-2 expired codes
    expired_codes = [generate_shift_code() for _ in range(random.randint(1, 2))]
    
    current_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    active_codes_html = '\n    '.join([f'<div class="code new">{code}</div>' for code in active_codes])
    expired_codes_html = '\n    '.join([f'<div class="code expired">{code}</div>' for code in expired_codes])
    
    return f"""
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Test SHiFT Codes - Borderlands 4</title>
    <style>
        body {{ font-family: Arial, sans-serif; margin: 40px; }}
        h1 {{ color: #007cba; }}
        .code {{ 
            background: #f0f0f0; 
            padding: 10px; 
            margin: 10px 0; 
            border-left: 4px solid #007cba;
            font-family: monospace;
            font-size: 16px;
        }}
        .new {{ border-left-color: #28a745; }}
        .expired {{ border-left-color: #dc3545; }}
    </style>
</head>
<body>
    <h1>Test SHiFT Codes for Borderlands 4</h1>
    <p>This is a test page for notification testing with randomly generated codes.</p>
    
    <h2>Active Codes</h2>
    {active_codes_html}
    
    <h2>Expired Codes (for reference)</h2>
    {expired_codes_html}
    
    <p><em>Updated: {current_time} (codes regenerated on each request)</em></p>
</body>
</html>
"""

class MyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/' or self.path == '/index.html':
            self.send_response(200)
            self.send_header('Content-type', 'text/html')
            self.end_headers()
            # Generate fresh HTML with random codes on each request
            html_content = generate_test_html()
            self.wfile.write(html_content.encode('utf-8'))
        else:
            super().do_GET()

if __name__ == "__main__":
    try:
        with socketserver.TCPServer(("", PORT), MyHTTPRequestHandler) as httpd:
            print(f"🚀 Test server running at http://localhost:{PORT}")
            print("📋 Test codes are available at the root URL")
            print("🔔 Add this URL to your extension settings:")
            print(f"   http://localhost:{PORT}")
            print("\n⚠️  Press Ctrl+C to stop the server")
            httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n🛑 Server stopped")
    except OSError as e:
        if e.errno == 98:  # Address already in use
            print(f"❌ Port {PORT} is already in use. Try a different port or stop the existing server.")
            sys.exit(1)
        else:
            raise