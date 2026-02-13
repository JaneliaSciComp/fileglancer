#!/usr/bin/env python3
"""
Development launch script for HTTPS mode with SSL certificates
"""
import os
import sys
from pathlib import Path

def main():
    """Main entry point"""
    # Certificate paths
    cert_dir = Path('/opt/certs')
    key_file = cert_dir / 'cert.key'
    cert_file = cert_dir / 'cert.crt'

    # Check if certificates exist
    if not key_file.exists() or not cert_file.exists():
        print("Error: SSL certificates not found.", file=sys.stderr)
        print(f"Expected certificate files at:", file=sys.stderr)
        print(f"  - {key_file}", file=sys.stderr)
        print(f"  - {cert_file}", file=sys.stderr)
        print("\nPlease install valid SSL certificates before running in secure mode.", file=sys.stderr)
        print("See docs/Development.md for instructions on installing SSL certificates.", file=sys.stderr)
        sys.exit(1)

    print(f"Using SSL certificates from {cert_dir}")

    # Launch uvicorn with the certificates
    print("Starting uvicorn server with HTTPS...")
    uvicorn_cmd = [
        'uvicorn', 'fileglancer.server:app',
        '--host', '0.0.0.0',
        '--port', '443',
        '--reload',
        '--ssl-keyfile', str(key_file),
        '--ssl-certfile', str(cert_file)
    ]

    # Replace current process with uvicorn
    os.execvp('uvicorn', uvicorn_cmd)

if __name__ == '__main__':
    main()
