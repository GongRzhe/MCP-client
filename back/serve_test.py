import http.server
import socketserver
import os

# Define the port to serve on
PORT = 8000

# Change to the directory containing this script
os.chdir(os.path.dirname(os.path.abspath(__file__)))

# Set up a simple HTTP server
Handler = http.server.SimpleHTTPRequestHandler
httpd = socketserver.TCPServer(("", PORT), Handler)

print(f"Serving at http://localhost:{PORT}")
print(f"Access the test page at http://localhost:{PORT}/test.html")

# Start the server
httpd.serve_forever() 