"""SSH Key management utilities for Fileglancer.

This module provides functions for listing, generating, and managing SSH keys
in a user's ~/.ssh directory.
"""

import os
import re
import shutil
import subprocess
import tempfile
from typing import List, Optional

from loguru import logger
from pydantic import BaseModel, Field


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


class GenerateKeyRequest(BaseModel):
    """Request to generate a new SSH key"""
    key_name: str = Field(description="Name for the new key file (without extension)")
    comment: Optional[str] = Field(default=None, description="Optional comment for the key")
    add_to_authorized_keys: bool = Field(default=True, description="Whether to add the key to authorized_keys")


class GenerateKeyResponse(BaseModel):
    """Response after generating an SSH key"""
    key: SSHKeyInfo = Field(description="The generated key info")
    message: str = Field(description="Status message")


# Regex pattern for valid key names (alphanumeric, underscore, hyphen)
KEY_NAME_PATTERN = re.compile(r'^[a-zA-Z0-9_-]+$')


def validate_key_name(key_name: str) -> None:
    """Validate that a key name is safe and doesn't allow path traversal.

    Args:
        key_name: The key name to validate

    Raises:
        ValueError: If the key name is invalid
    """
    if not key_name:
        raise ValueError("Key name cannot be empty")

    if not KEY_NAME_PATTERN.match(key_name):
        raise ValueError("Key name can only contain letters, numbers, underscores, and hyphens")

    if key_name.startswith('.') or key_name.startswith('-'):
        raise ValueError("Key name cannot start with '.' or '-'")

    if len(key_name) > 100:
        raise ValueError("Key name is too long (max 100 characters)")


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
    authorized_keys_path = os.path.join(ssh_dir, 'authorized_keys')

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
            pubkey_path = os.path.join(ssh_dir, filename)
            try:
                key_info = parse_public_key(pubkey_path, ssh_dir)
                keys.append(key_info)
            except Exception as e:
                logger.warning(f"Could not parse key {filename}: {e}")
                continue

    # Sort by filename
    keys.sort(key=lambda k: k.filename)

    return keys


def generate_ssh_key(ssh_dir: str, key_name: str, comment: Optional[str] = None) -> SSHKeyInfo:
    """Generate a new ed25519 SSH key.

    Args:
        ssh_dir: Path to the .ssh directory
        key_name: Name for the key file (without extension)
        comment: Optional comment for the key

    Returns:
        SSHKeyInfo for the generated key

    Raises:
        ValueError: If the key name is invalid or key already exists
        RuntimeError: If key generation fails
    """
    # Validate key name
    validate_key_name(key_name)

    # Ensure .ssh directory exists
    ensure_ssh_directory_exists(ssh_dir)

    # Build key path
    key_path = os.path.join(ssh_dir, key_name)
    pubkey_path = f"{key_path}.pub"

    # Check if key already exists
    if os.path.exists(key_path) or os.path.exists(pubkey_path):
        raise ValueError(f"Key '{key_name}' already exists")

    # Build ssh-keygen command
    cmd = [
        'ssh-keygen',
        '-t', 'ed25519',
        '-N', '',  # No passphrase
        '-f', key_path,
    ]

    if comment:
        cmd.extend(['-C', comment])

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

        # Parse and return the generated key info
        return parse_public_key(pubkey_path, ssh_dir)

    except subprocess.TimeoutExpired:
        raise RuntimeError("Key generation timed out")
    except FileNotFoundError:
        raise RuntimeError("ssh-keygen not found on system")


def add_to_authorized_keys(ssh_dir: str, public_key: str) -> bool:
    """Add a public key to the authorized_keys file.

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
    if not public_key or not public_key.startswith('ssh-'):
        raise ValueError("Invalid public key format")

    # Ensure .ssh directory exists
    ensure_ssh_directory_exists(ssh_dir)

    authorized_keys_path = os.path.join(ssh_dir, 'authorized_keys')

    # Check if key is already present (by content)
    if os.path.exists(authorized_keys_path):
        with open(authorized_keys_path, 'r') as f:
            existing_content = f.read()
            # Check if the key (base64 part) is already present
            key_parts = public_key.split()
            if len(key_parts) >= 2 and key_parts[1] in existing_content:
                logger.info("Key already in authorized_keys")
                return True

    # Append the key
    try:
        # Ensure the file ends with a newline before appending
        needs_newline = False
        if os.path.exists(authorized_keys_path):
            file_size = os.path.getsize(authorized_keys_path)
            if file_size > 0:
                with open(authorized_keys_path, 'rb') as f:
                    f.seek(-1, 2)  # Seek to last byte
                    needs_newline = f.read(1) != b'\n'

        with open(authorized_keys_path, 'a') as f:
            if needs_newline:
                f.write('\n')
            f.write(public_key)
            f.write('\n')

        # Ensure correct permissions
        os.chmod(authorized_keys_path, 0o600)

        logger.info(f"Added key to {authorized_keys_path}")
        return True

    except Exception as e:
        raise RuntimeError(f"Failed to add key to authorized_keys: {e}")


def remove_from_authorized_keys(ssh_dir: str, public_key: str) -> bool:
    """Remove a public key from the authorized_keys file.

    Uses atomic write with backup to prevent data loss.

    Args:
        ssh_dir: Path to the .ssh directory
        public_key: The public key content to remove

    Returns:
        True if the key was removed, False if it wasn't found
    """
    authorized_keys_path = os.path.join(ssh_dir, 'authorized_keys')
    backup_path = f"{authorized_keys_path}.bak"

    if not os.path.exists(authorized_keys_path):
        return False

    # Extract the key data (type + base64) for matching, ignoring comments
    key_parts = public_key.split()
    if len(key_parts) < 2:
        return False
    key_identifier = f"{key_parts[0]} {key_parts[1]}"

    try:
        with open(authorized_keys_path, 'r') as f:
            lines = f.readlines()

        # Filter out lines that contain this key
        new_lines = []
        removed = False
        for line in lines:
            line_stripped = line.strip()
            if line_stripped and key_identifier in line_stripped:
                removed = True
                logger.info("Removing key from authorized_keys")
            else:
                new_lines.append(line)

        if removed:
            # Create backup before modifying
            shutil.copy2(authorized_keys_path, backup_path)
            logger.info(f"Created backup at {backup_path}")

            # Write to temp file first, then atomically rename
            fd, temp_path = tempfile.mkstemp(dir=ssh_dir, prefix='.authorized_keys_')
            try:
                with os.fdopen(fd, 'w') as f:
                    f.writelines(new_lines)
                os.chmod(temp_path, 0o600)
                os.rename(temp_path, authorized_keys_path)
                logger.info("Updated authorized_keys successfully")
            except Exception:
                # Clean up temp file on failure
                if os.path.exists(temp_path):
                    os.remove(temp_path)
                raise

        return removed

    except Exception as e:
        logger.warning(f"Error removing key from authorized_keys: {e}")
        return False


def delete_ssh_key(ssh_dir: str, key_name: str) -> bool:
    """Delete an SSH key (both private and public key files).

    Creates backups before deletion and removes the key from authorized_keys.
    Backups are stored as {key_name}.deleted and {key_name}.pub.deleted.

    Args:
        ssh_dir: Path to the .ssh directory
        key_name: Name of the key to delete (without extension)

    Returns:
        True if the key was deleted successfully

    Raises:
        ValueError: If the key name is invalid or key doesn't exist
        RuntimeError: If deletion fails
    """
    # Validate key name to prevent path traversal
    validate_key_name(key_name)

    private_key_path = os.path.join(ssh_dir, key_name)
    public_key_path = f"{private_key_path}.pub"

    # Check if at least one of the key files exists
    private_exists = os.path.exists(private_key_path)
    public_exists = os.path.exists(public_key_path)

    if not private_exists and not public_exists:
        raise ValueError(f"Key '{key_name}' does not exist")

    # Read the public key content before any modifications
    public_key = None
    if public_exists:
        with open(public_key_path, 'r') as f:
            public_key = f.read().strip()

    try:
        # Step 1: Create backups before any destructive operations
        if private_exists:
            backup_private = f"{private_key_path}.deleted"
            shutil.copy2(private_key_path, backup_private)
            os.chmod(backup_private, 0o600)
            logger.info(f"Created backup: {backup_private}")

        if public_exists:
            backup_public = f"{public_key_path}.deleted"
            shutil.copy2(public_key_path, backup_public)
            logger.info(f"Created backup: {backup_public}")

        # Step 2: Delete the key files
        if private_exists:
            os.remove(private_key_path)
            logger.info(f"Deleted private key: {private_key_path}")

        if public_exists:
            os.remove(public_key_path)
            logger.info(f"Deleted public key: {public_key_path}")

        # Step 3: Remove from authorized_keys (cleanup, non-critical)
        # Done last so key files are already gone even if this fails
        if public_key:
            if remove_from_authorized_keys(ssh_dir, public_key):
                logger.info(f"Removed key '{key_name}' from authorized_keys")

        return True

    except PermissionError as e:
        raise RuntimeError(f"Permission denied when deleting key: {e}")
    except Exception as e:
        raise RuntimeError(f"Failed to delete key: {e}")
