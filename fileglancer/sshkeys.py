"""SSH Key management utilities for Fileglancer.

This module provides functions for listing, generating, and managing SSH keys
in a user's ~/.ssh directory.
"""

import os
import subprocess
from typing import List, Optional

from loguru import logger
from pydantic import BaseModel, Field

# Constants
AUTHORIZED_KEYS_FILENAME = "authorized_keys"
SSH_KEY_PREFIX = "ssh-"


def validate_path_in_directory(base_dir: str, path: str) -> str:
    """Validate that a path is within the expected base directory.

    This prevents path traversal attacks by ensuring the resolved path
    stays within the intended directory.

    Args:
        base_dir: The base directory that the path must be within
        path: The path to validate

    Returns:
        The normalized absolute path if valid

    Raises:
        ValueError: If the path escapes the base directory
    """
    # Normalize both paths to resolve symlinks and collapse ..
    real_base = os.path.realpath(base_dir)
    real_path = os.path.realpath(path)

    # Ensure the path is within the base directory
    if not real_path.startswith(real_base + os.sep) and real_path != real_base:
        raise ValueError(f"Path '{path}' is outside the allowed directory")

    return real_path


def safe_join_path(base_dir: str, *parts: str) -> str:
    """Safely join path components and validate the result is within base_dir.

    Args:
        base_dir: The base directory
        *parts: Path components to join

    Returns:
        The validated absolute path

    Raises:
        ValueError: If the resulting path escapes the base directory
    """
    # First normalize the path to collapse any .. components
    joined = os.path.normpath(os.path.join(base_dir, *parts))
    # Then validate it's within the base directory
    return validate_path_in_directory(base_dir, joined)


class SSHKeyInfo(BaseModel):
    """Information about an SSH key"""
    filename: str = Field(description="The key filename without extension (e.g., 'id_ed25519')")
    key_type: str = Field(description="The SSH key type (e.g., 'ssh-ed25519', 'ssh-rsa')")
    fingerprint: str = Field(description="SHA256 fingerprint of the key")
    comment: str = Field(description="Comment associated with the key")
    public_key: str = Field(description="Full public key content")
    private_key: Optional[str] = Field(default=None, description="Private key content (if available)")
    has_private_key: bool = Field(description="Whether the corresponding private key exists")
    is_authorized: bool = Field(description="Whether this key is in authorized_keys")


class SSHKeyListResponse(BaseModel):
    """Response containing a list of SSH keys"""
    keys: List[SSHKeyInfo] = Field(description="List of SSH keys")


class GenerateKeyResponse(BaseModel):
    """Response after generating an SSH key"""
    key: SSHKeyInfo = Field(description="The generated key info")
    message: str = Field(description="Status message")


def get_ssh_directory() -> str:
    """Get the path to the current user's .ssh directory.

    Returns:
        The absolute path to ~/.ssh
    """
    return os.path.expanduser("~/.ssh")


def ensure_ssh_directory_exists(ssh_dir: str) -> None:
    """Ensure the .ssh directory exists with correct permissions.

    Args:
        ssh_dir: Path to the .ssh directory
    """
    if not os.path.exists(ssh_dir):
        os.makedirs(ssh_dir, mode=0o700)
        logger.info(f"Created SSH directory: {ssh_dir}")
    else:
        # Ensure permissions are correct
        current_mode = os.stat(ssh_dir).st_mode & 0o777
        if current_mode != 0o700:
            os.chmod(ssh_dir, 0o700)
            logger.info(f"Fixed SSH directory permissions: {ssh_dir}")


def get_key_fingerprint(pubkey_path: str) -> str:
    """Get the SHA256 fingerprint of a public key.

    Args:
        pubkey_path: Path to the public key file

    Returns:
        The SHA256 fingerprint string

    Raises:
        ValueError: If the fingerprint cannot be determined
    """
    try:
        result = subprocess.run(
            ['ssh-keygen', '-lf', pubkey_path],
            capture_output=True,
            text=True,
            timeout=10
        )
        if result.returncode != 0:
            raise ValueError(f"Failed to get fingerprint: {result.stderr}")

        # Output format: "256 SHA256:xxxxx comment (ED25519)"
        parts = result.stdout.strip().split()
        if len(parts) >= 2:
            return parts[1]  # SHA256:xxxxx
        raise ValueError("Unexpected ssh-keygen output format")
    except subprocess.TimeoutExpired:
        raise ValueError("Timeout getting key fingerprint")
    except FileNotFoundError:
        raise ValueError("ssh-keygen not found")


def parse_public_key(pubkey_path: str, ssh_dir: str) -> SSHKeyInfo:
    """Parse a public key file and return its information.

    Args:
        pubkey_path: Path to the public key file
        ssh_dir: Path to the .ssh directory (for checking authorized_keys)

    Returns:
        SSHKeyInfo object with the key details
    """
    with open(pubkey_path, 'r') as f:
        public_key = f.read().strip()

    # Parse the public key content: "type base64key comment"
    parts = public_key.split(None, 2)
    if len(parts) < 2:
        raise ValueError(f"Invalid public key format in {pubkey_path}")

    key_type = parts[0]  # e.g., "ssh-ed25519"
    comment = parts[2] if len(parts) > 2 else ""

    # Get fingerprint
    fingerprint = get_key_fingerprint(pubkey_path)

    # Determine filename (without .pub extension)
    filename = os.path.basename(pubkey_path)
    if filename.endswith('.pub'):
        filename = filename[:-4]

    # Check if private key exists and read it
    private_key_path = pubkey_path[:-4] if pubkey_path.endswith('.pub') else pubkey_path
    has_private_key = os.path.exists(private_key_path) and private_key_path != pubkey_path
    private_key = None
    if has_private_key:
        try:
            with open(private_key_path, 'r') as f:
                private_key = f.read()
        except Exception as e:
            logger.warning(f"Could not read private key {private_key_path}: {e}")

    # Check if key is in authorized_keys
    is_authorized = is_key_in_authorized_keys(ssh_dir, fingerprint)

    return SSHKeyInfo(
        filename=filename,
        key_type=key_type,
        fingerprint=fingerprint,
        comment=comment,
        public_key=public_key,
        private_key=private_key,
        has_private_key=has_private_key,
        is_authorized=is_authorized
    )


def is_key_in_authorized_keys(ssh_dir: str, fingerprint: str) -> bool:
    """Check if a key with the given fingerprint is in authorized_keys.

    Args:
        ssh_dir: Path to the .ssh directory
        fingerprint: The SHA256 fingerprint to look for

    Returns:
        True if the key is in authorized_keys, False otherwise
    """
    authorized_keys_path = os.path.join(ssh_dir, AUTHORIZED_KEYS_FILENAME)

    if not os.path.exists(authorized_keys_path):
        return False

    try:
        # Get fingerprints of all keys in authorized_keys
        result = subprocess.run(
            ['ssh-keygen', '-lf', authorized_keys_path],
            capture_output=True,
            text=True,
            timeout=30
        )

        if result.returncode != 0:
            logger.warning(f"Could not check authorized_keys: {result.stderr}")
            return False

        # Check each line for the fingerprint
        for line in result.stdout.strip().split('\n'):
            if fingerprint in line:
                return True

        return False
    except Exception as e:
        logger.warning(f"Error checking authorized_keys: {e}")
        return False


def list_ssh_keys(ssh_dir: str) -> List[SSHKeyInfo]:
    """List all SSH keys in the given directory.

    Args:
        ssh_dir: Path to the .ssh directory

    Returns:
        List of SSHKeyInfo objects
    """
    keys = []

    if not os.path.exists(ssh_dir):
        return keys

    # Find all .pub files
    for filename in os.listdir(ssh_dir):
        if filename.endswith('.pub'):
            try:
                pubkey_path = safe_join_path(ssh_dir, filename)
                key_info = parse_public_key(pubkey_path, ssh_dir)
                keys.append(key_info)
            except ValueError as e:
                logger.warning(f"Skipping suspicious filename {filename}: {e}")
                continue
            except Exception as e:
                logger.warning(f"Could not parse key {filename}: {e}")
                continue

    # Sort by filename
    keys.sort(key=lambda k: k.filename)

    logger.info(f"Listed {len(keys)} SSH keys in {ssh_dir}")

    return keys


def generate_ssh_key(ssh_dir: str) -> SSHKeyInfo:
    """Generate the default ed25519 SSH key (id_ed25519).

    Args:
        ssh_dir: Path to the .ssh directory

    Returns:
        SSHKeyInfo for the generated key

    Raises:
        ValueError: If the key already exists
        RuntimeError: If key generation fails
    """
    key_name = "id_ed25519"

    # Ensure .ssh directory exists
    ensure_ssh_directory_exists(ssh_dir)

    # Build key paths
    key_path = os.path.join(ssh_dir, key_name)
    pubkey_path = os.path.join(ssh_dir, f"{key_name}.pub")

    # Check if key already exists
    if os.path.exists(key_path) or os.path.exists(pubkey_path):
        raise ValueError(f"SSH key '{key_name}' already exists")

    # Build ssh-keygen command
    cmd = [
        'ssh-keygen',
        '-t', 'ed25519',
        '-N', '',  # No passphrase
        '-f', key_path,
    ]

    logger.info(f"Generating SSH key: {key_name}")

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=30
        )

        if result.returncode != 0:
            raise RuntimeError(f"ssh-keygen failed: {result.stderr}")

        # Set correct permissions
        os.chmod(key_path, 0o600)
        os.chmod(pubkey_path, 0o644)

        logger.info(f"Successfully generated SSH key: {key_name}")

        # Parse and return the generated key info
        return parse_public_key(pubkey_path, ssh_dir)

    except subprocess.TimeoutExpired:
        raise RuntimeError("Key generation timed out")
    except FileNotFoundError:
        raise RuntimeError("ssh-keygen not found on system")


def add_to_authorized_keys(ssh_dir: str, public_key: str) -> bool:
    """Add a public key to the authorized_keys file using cat command.

    Args:
        ssh_dir: Path to the .ssh directory
        public_key: The public key content to add

    Returns:
        True if the key was added successfully

    Raises:
        ValueError: If the public key is invalid
        RuntimeError: If adding the key fails
    """
    # Validate public key format (basic check)
    if not public_key or not public_key.startswith(SSH_KEY_PREFIX):
        raise ValueError("Invalid public key format")

    # Ensure .ssh directory exists
    ensure_ssh_directory_exists(ssh_dir)

    authorized_keys_path = os.path.join(ssh_dir, AUTHORIZED_KEYS_FILENAME)

    # Check if key is already present using grep
    if os.path.exists(authorized_keys_path):
        key_parts = public_key.split()
        if len(key_parts) >= 2:
            result = subprocess.run(
                ['grep', '-qF', key_parts[1], authorized_keys_path],
                capture_output=True,
                timeout=10
            )
            if result.returncode == 0:
                logger.info("Key already in authorized_keys")
                return True

    # Append the key using cat
    try:
        result = subprocess.run(
            ['sh', '-c', f'cat >> "{authorized_keys_path}"'],
            input=public_key + '\n',
            capture_output=True,
            text=True,
            timeout=10
        )

        if result.returncode != 0:
            raise RuntimeError(f"cat failed: {result.stderr}")

        # Ensure correct permissions
        os.chmod(authorized_keys_path, 0o600)

        logger.info(f"Added key to {authorized_keys_path}")
        return True

    except subprocess.TimeoutExpired:
        raise RuntimeError("Timed out adding key to authorized_keys")
    except Exception as e:
        raise RuntimeError(f"Failed to add key to authorized_keys: {e}")
