"""SSH Key management utilities for Fileglancer.

This module provides functions for listing, generating, and managing SSH keys
in a user's ~/.ssh directory.
"""

import gc
import os
import shutil
import subprocess
import tempfile
from typing import Dict, List, Optional

from fastapi.responses import Response
from loguru import logger
from pydantic import BaseModel, Field, SecretStr

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
    """Information about an SSH key (without sensitive content)"""
    filename: str = Field(description="The key filename without extension (e.g., 'id_ed25519')")
    key_type: str = Field(description="The SSH key type (e.g., 'ssh-ed25519', 'ssh-rsa')")
    fingerprint: str = Field(description="SHA256 fingerprint of the key")
    comment: str = Field(description="Comment associated with the key")
    has_private_key: bool = Field(description="Whether the corresponding private key exists")
    is_authorized: bool = Field(description="Whether this key is in authorized_keys")


class SSHKeyListResponse(BaseModel):
    """Response containing a list of SSH keys"""
    keys: List[SSHKeyInfo] = Field(description="List of SSH keys")


class GenerateKeyResponse(BaseModel):
    """Response after generating an SSH key"""
    key: SSHKeyInfo = Field(description="The generated key info")
    message: str = Field(description="Status message")


class GenerateKeyRequest(BaseModel):
    """Request body for generating an SSH key"""
    passphrase: Optional[SecretStr] = Field(default=None, description="Optional passphrase to protect the private key")


def _wipe_bytearray(data: bytearray) -> None:
    """Securely wipe a bytearray by overwriting with zeros.

    Args:
        data: The bytearray to wipe
    """
    data[:] = b'\x00' * len(data)


class SSHKeyContentResponse(Response):
    """Secure response for SSH key content that wipes sensitive data after sending.

    This response class stores the key content in a mutable bytearray and
    explicitly overwrites it with zeros after the response has been sent.
    This minimizes the time sensitive key material exists in memory.

    The response body is sent as plain text (the raw key content) to avoid
    creating immutable string copies during JSON serialization.
    """

    media_type = "text/plain"
    charset = "utf-8"

    def __init__(
        self,
        key_content: bytearray,
        status_code: int = 200,
        headers: Optional[Dict[str, str]] = None,
    ):
        """Initialize the response with key content stored in a bytearray.

        Args:
            key_content: The SSH key content as a mutable bytearray
            status_code: HTTP status code (default 200)
            headers: Optional additional headers
        """
        # Store the key buffer - do NOT convert to bytes
        self._key_buffer = key_content

        # Merge Content-Length header with any provided headers
        # This is required because we don't pass content to the parent
        all_headers = dict(headers) if headers else {}
        all_headers["content-length"] = str(len(key_content))

        # Initialize parent without content - we'll send body directly in __call__
        super().__init__(
            status_code=status_code,
            headers=all_headers,
            media_type=self.media_type,
        )

    async def __call__(self, scope, receive, send):
        """Send the response and then wipe the sensitive buffer.

        Overrides the parent __call__ to send the bytearray directly via ASGI
        without converting to immutable bytes, then wipes the buffer and
        invokes garbage collection to clean up any intermediate copies.
        """
        await send({
            "type": "http.response.start",
            "status": self.status_code,
            "headers": self.raw_headers,
        })
        try:
            await send({
                "type": "http.response.body",
                "body": self._key_buffer,
            })
        finally:
            _wipe_bytearray(self._key_buffer)
            gc.collect()


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
    """Parse a public key file and return its information (without key content).

    Args:
        pubkey_path: Path to the public key file
        ssh_dir: Path to the .ssh directory (for checking authorized_keys)

    Returns:
        SSHKeyInfo object with the key details (no sensitive content)
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

    # Check if private key exists (but don't read it)
    private_key_path = pubkey_path[:-4] if pubkey_path.endswith('.pub') else pubkey_path
    has_private_key = os.path.exists(private_key_path) and private_key_path != pubkey_path

    # Check if key is in authorized_keys
    is_authorized = is_key_in_authorized_keys(ssh_dir, fingerprint)

    return SSHKeyInfo(
        filename=filename,
        key_type=key_type,
        fingerprint=fingerprint,
        comment=comment,
        has_private_key=has_private_key,
        is_authorized=is_authorized
    )


def read_file_to_bytearray(file_path: str) -> bytearray:
    """Read a file into a mutable bytearray for secure handling.

    This function reads file contents into a mutable bytearray that can be
    explicitly wiped from memory when no longer needed. The caller is responsible
    for wiping the bytearray when done (e.g., by passing it to SSHKeyContentResponse
    which wipes it after sending).

    Args:
        file_path: Path to the file to read

    Returns:
        The file contents as a mutable bytearray

    Note:
        The returned bytearray should be wiped with _wipe_bytearray() when no
        longer needed. SSHKeyContentResponse handles this automatically.
    """
    # Get file size to allocate bytearray
    file_size = os.path.getsize(file_path)

    # Read into mutable bytearray
    key_buffer = bytearray(file_size)

    with open(file_path, 'rb') as f:
        bytes_read = f.readinto(key_buffer)
        if bytes_read != file_size:
            # Wipe partial data on error
            _wipe_bytearray(key_buffer)
            raise IOError(f"Expected to read {file_size} bytes, but read {bytes_read}")

    return key_buffer


def get_key_content(ssh_dir: str, filename: str, key_type: str = "public") -> bytearray:
    """Get the content of an SSH key as a mutable bytearray.

    The returned bytearray should be passed to SSHKeyContentResponse, which
    will wipe it after sending the response. Do not convert to str or bytes.

    Args:
        ssh_dir: Path to the .ssh directory
        filename: Key filename without extension (e.g., 'id_ed25519')
        key_type: Type of key to fetch: 'public' or 'private'

    Returns:
        bytearray containing the key content (caller must wipe when done)

    Raises:
        ValueError: If the key doesn't exist or key_type is invalid
    """
    if key_type == "public":
        key_path = safe_join_path(ssh_dir, f"{filename}.pub")
        if not os.path.exists(key_path):
            raise ValueError(f"Public key '{filename}' not found")
    elif key_type == "private":
        key_path = safe_join_path(ssh_dir, filename)
        if not os.path.exists(key_path):
            raise ValueError(f"Private key '{filename}' not found")
    else:
        raise ValueError(f"Invalid key_type: {key_type}")

    return read_file_to_bytearray(key_path)


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


def generate_ssh_key(ssh_dir: str, passphrase: Optional[SecretStr] = None) -> SSHKeyInfo:
    """Generate the default ed25519 SSH key (id_ed25519).

    Args:
        ssh_dir: Path to the .ssh directory
        passphrase: Optional passphrase to protect the private key

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
    passphrase_str = passphrase.get_secret_value() if passphrase else ""
    cmd = [
        'ssh-keygen',
        '-t', 'ed25519',
        '-N', passphrase_str,
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
    if not public_key or not public_key.startswith(SSH_KEY_PREFIX):
        raise ValueError("Invalid public key format")

    # Ensure .ssh directory exists
    ensure_ssh_directory_exists(ssh_dir)

    authorized_keys_path = os.path.join(ssh_dir, AUTHORIZED_KEYS_FILENAME)

    # Get fingerprint of the key we're adding to check if already present
    # Write key to temp file to get its fingerprint
    try:
        with tempfile.NamedTemporaryFile(mode='w', suffix='.pub', delete=False) as tmp:
            tmp.write(public_key)
            tmp_path = tmp.name

        try:
            fingerprint = get_key_fingerprint(tmp_path)
        finally:
            os.unlink(tmp_path)

        # Use fingerprint-based check (same as UI uses)
        if is_key_in_authorized_keys(ssh_dir, fingerprint):
            logger.info("Key already in authorized_keys (fingerprint match)")
            return True

    except Exception as e:
        logger.warning(f"Could not check fingerprint, proceeding with add: {e}")

    # Backup and append the key
    try:
        # Backup existing file before modifying
        if os.path.exists(authorized_keys_path):
            backup_path = authorized_keys_path + '.bak'
            shutil.copy2(authorized_keys_path, backup_path)
            logger.info(f"Backed up authorized_keys to {backup_path}")

            # Ensure file ends with newline before appending
            with open(authorized_keys_path, 'rb') as f:
                f.seek(0, 2)  # Seek to end
                if f.tell() > 0:  # File is not empty
                    f.seek(-1, 2)  # Seek to last byte
                    if f.read(1) != b'\n':
                        # File doesn't end with newline, add one
                        with open(authorized_keys_path, 'a') as af:
                            af.write('\n')

        # Append the key
        with open(authorized_keys_path, 'a') as f:
            f.write(public_key + '\n')

        # Ensure correct permissions
        os.chmod(authorized_keys_path, 0o600)

        logger.info(f"Added key to {authorized_keys_path}")
        return True

    except Exception as e:
        raise RuntimeError(f"Failed to add key to authorized_keys: {e}")
