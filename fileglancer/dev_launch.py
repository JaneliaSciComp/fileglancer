#!/usr/bin/env python3
"""
Development launch script that generates self-signed certificates if needed
"""
import os
import sys
import subprocess
from pathlib import Path
from datetime import datetime, timedelta

def generate_self_signed_cert(cert_dir: Path, key_file: Path, cert_file: Path):
    """Generate self-signed certificate using OpenSSL"""
    print(f"Generating self-signed certificates in {cert_dir}...")

    # Create directory if it doesn't exist
    cert_dir.mkdir(parents=True, exist_ok=True)

    # Generate private key and certificate using OpenSSL
    # This creates a 2048-bit RSA key and a self-signed certificate valid for 365 days
    openssl_cmd = [
        'openssl', 'req', '-x509', '-newkey', 'rsa:2048',
        '-keyout', str(key_file),
        '-out', str(cert_file),
        '-days', '365',
        '-nodes',  # No passphrase
        '-subj', '/CN=fileglancer-dev.int.janelia.org/O=Development/C=US'
    ]

    try:
        subprocess.run(openssl_cmd, check=True, capture_output=True)
        print(f"✓ Generated self-signed certificate at {cert_file}")
        print(f"✓ Generated private key at {key_file}")

        # Set appropriate permissions
        os.chmod(key_file, 0o600)  # Read/write for owner only
        os.chmod(cert_file, 0o644)  # Read for all, write for owner

    except subprocess.CalledProcessError as e:
        print(f"Error generating certificates: {e.stderr.decode()}", file=sys.stderr)
        sys.exit(1)
    except FileNotFoundError:
        print("Error: OpenSSL not found. Please install OpenSSL.", file=sys.stderr)
        sys.exit(1)

def main():
    """Main entry point"""
    # Certificate paths
    cert_dir = Path('/opt/certs')
    key_file = cert_dir / 'cert.key'
    cert_file = cert_dir / 'cert.crt'

    # Check if certificates exist
    if not key_file.exists() or not cert_file.exists():
        print("SSL certificates not found.")
        generate_self_signed_cert(cert_dir, key_file, cert_file)
    else:
        print(f"Using existing SSL certificates from {cert_dir}")

    # Launch uvicorn with the certificates
    print("\nStarting uvicorn server with HTTPS...")
    uvicorn_cmd = [
        'uvicorn', 'fileglancer.app:app',
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
