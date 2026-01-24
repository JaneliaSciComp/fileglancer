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
    unmanaged_id_ed25519_exists: bool = Field(
        default=False,
        description="True if id_ed25519 exists but is not managed by fileglancer"
    )
    id_ed25519_exists: bool = Field(
        default=False,
        description="True if id_ed25519 private key exists"
    )
    id_ed25519_missing_pubkey: bool = Field(
        default=False,
        description="True if id_ed25519 exists and is managed but .pub file is missing"
    )


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
    """Secure streaming response for SSH key content that minimizes memory exposure.

    This response class streams the key content line-by-line via ASGI to minimize
    buffering in h11/uvicorn. By sending each chunk with "more_body": True, h11
    can flush each line immediately rather than buffering the entire key in memory.

    After streaming completes, the original bytearray is wiped with zeros and
    garbage collection is triggered to clean up any intermediate copies.

    Uses memoryview to avoid creating unnecessary copies when iterating over lines.
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

    def _iter_lines(self):
        """Yield memoryview slices of the key buffer line by line.

        Using memoryview avoids creating copies of the data. Each yielded
        view is a reference to a slice of the original bytearray.

        Yields:
            memoryview: A view into the buffer for each line (including newline)
        """
        buffer = self._key_buffer
        view = memoryview(buffer)
        start = 0

        while start < len(buffer):
            # Find next newline
            try:
                end = buffer.index(b'\n', start) + 1
            except ValueError:
                # No more newlines, yield the rest
                end = len(buffer)

            yield view[start:end]
            start = end

    async def __call__(self, scope, receive, send):
        """Stream the response line-by-line, then wipe the sensitive buffer.

        Sends each line with "more_body": True to signal h11 that it can flush
        immediately, reducing memory buffering. After all lines are sent, sends
        an empty body with "more_body": False to complete the response.

        The bytearray is wiped in the finally block regardless of success or error.
        """
        await send({
            "type": "http.response.start",
            "status": self.status_code,
            "headers": self.raw_headers,
        })
        try:
            for line in self._iter_lines():
                await send({
                    "type": "http.response.body",
                    "body": line,
                    "more_body": True,
                })
            # Final empty body to signal end of response
            await send({
                "type": "http.response.body",
                "body": b"",
                "more_body": False,
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
    """Check if a key with the given fingerprint is in authorized_keys with 'fileglancer' comment.

    Args:
        ssh_dir: Path to the .ssh directory
        fingerprint: The SHA256 fingerprint to look for

    Returns:
        True if the key is in authorized_keys with 'fileglancer' in the comment, False otherwise
    """
    authorized_keys_path = os.path.join(ssh_dir, AUTHORIZED_KEYS_FILENAME)

    if not os.path.exists(authorized_keys_path):
        return False

    try:
        # Get fingerprints of all keys in authorized_keys
        # Output format: "256 SHA256:xxxxx comment (ED25519)"
        result = subprocess.run(
            ['ssh-keygen', '-lf', authorized_keys_path],
            capture_output=True,
            text=True,
            timeout=30
        )

        if result.returncode != 0:
            logger.warning(f"Could not check authorized_keys: {result.stderr}")
            return False

        # Check each line for the fingerprint AND 'fileglancer' in comment
        for line in result.stdout.strip().split('\n'):
            if fingerprint in line and 'fileglancer' in line:
                return True

        return False
    except Exception as e:
        logger.warning(f"Error checking authorized_keys: {e}")
        return False


def _parse_authorized_keys_fileglancer(ssh_dir: str) -> Dict[str, SSHKeyInfo]:
    """Parse authorized_keys and return keys with 'fileglancer' in the comment.

    Args:
        ssh_dir: Path to the .ssh directory

    Returns:
        Dict mapping fingerprint to SSHKeyInfo for keys with 'fileglancer' comment
    """
    keys_by_fingerprint: Dict[str, SSHKeyInfo] = {}
    authorized_keys_path = os.path.join(ssh_dir, AUTHORIZED_KEYS_FILENAME)

    if not os.path.exists(authorized_keys_path):
        return keys_by_fingerprint

    try:
        # Use ssh-keygen to get fingerprints and comments from authorized_keys
        # Output format: "256 SHA256:xxxxx comment (ED25519)"
        result = subprocess.run(
            ['ssh-keygen', '-lf', authorized_keys_path],
            capture_output=True,
            text=True,
            timeout=30
        )

        if result.returncode != 0:
            logger.warning(f"Could not read authorized_keys: {result.stderr}")
            return keys_by_fingerprint

        for line in result.stdout.strip().split('\n'):
            if not line or 'fileglancer' not in line:
                continue

            # Parse: "256 SHA256:xxxxx comment text (ED25519)"
            parts = line.split()
            if len(parts) < 4:
                continue

            fingerprint = parts[1]
            key_type_raw = parts[-1]  # e.g., "(ED25519)"

            # Extract key type, converting to ssh- format
            key_type = key_type_raw.strip('()')
            if key_type == "ED25519":
                key_type = "ssh-ed25519"
            elif key_type == "RSA":
                key_type = "ssh-rsa"
            elif key_type == "ECDSA":
                key_type = "ecdsa-sha2-nistp256"
            elif key_type == "DSA":
                key_type = "ssh-dss"
            else:
                key_type = f"ssh-{key_type.lower()}"

            # Comment is everything between fingerprint and key type
            comment = " ".join(parts[2:-1])

            keys_by_fingerprint[fingerprint] = SSHKeyInfo(
                filename=fingerprint,  # Use fingerprint as filename placeholder
                key_type=key_type,
                fingerprint=fingerprint,
                comment=comment,
                has_private_key=False,  # Don't search for private keys
                is_authorized=True
            )

    except Exception as e:
        logger.warning(f"Error parsing authorized_keys: {e}")

    return keys_by_fingerprint


def list_ssh_keys(ssh_dir: str) -> List[SSHKeyInfo]:
    """List SSH keys with 'fileglancer' in the comment.

    Collects keys from both .pub files and authorized_keys, filtering to only
    those with 'fileglancer' in the comment. Keys are deduplicated by fingerprint,
    preferring .pub file info when available.

    Args:
        ssh_dir: Path to the .ssh directory

    Returns:
        List of SSHKeyInfo objects for fileglancer-managed keys
    """
    keys_by_fingerprint: Dict[str, SSHKeyInfo] = {}

    if not os.path.exists(ssh_dir):
        return []

    # First, get keys from authorized_keys with 'fileglancer' comment
    keys_by_fingerprint = _parse_authorized_keys_fileglancer(ssh_dir)

    # Then, scan .pub files and override/add entries with 'fileglancer' comment
    # .pub files take precedence since they have better filename info
    for filename in os.listdir(ssh_dir):
        if filename.endswith('.pub'):
            try:
                pubkey_path = safe_join_path(ssh_dir, filename)
                key_info = parse_public_key(pubkey_path, ssh_dir)
                # Only include keys with 'fileglancer' in the comment
                if 'fileglancer' in key_info.comment:
                    keys_by_fingerprint[key_info.fingerprint] = key_info
            except ValueError as e:
                logger.warning(f"Skipping suspicious filename {filename}: {e}")
                continue
            except Exception as e:
                logger.warning(f"Could not parse key {filename}: {e}")
                continue

    keys = list(keys_by_fingerprint.values())

    # Sort by filename, but put id_ed25519 first
    keys.sort(key=lambda k: (0 if k.filename == "id_ed25519" else 1, k.filename))

    logger.info(f"Listed {len(keys)} SSH keys with 'fileglancer' comment in {ssh_dir}")

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
        '-C', 'fileglancer',
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


def regenerate_public_key(
    ssh_dir: str,
    key_name: str = "id_ed25519",
    passphrase: Optional[SecretStr] = None
) -> SSHKeyInfo:
    """Regenerate a public key from an existing private key.

    Uses ssh-keygen -y to extract the public key from the private key.
    If the private key is encrypted, a passphrase must be provided.

    Args:
        ssh_dir: Path to the .ssh directory
        key_name: Name of the key (without extension), defaults to "id_ed25519"
        passphrase: Passphrase for the private key (if encrypted)

    Returns:
        SSHKeyInfo for the regenerated key

    Raises:
        ValueError: If the private key doesn't exist
        RuntimeError: If public key regeneration fails (e.g., wrong passphrase)
    """
    privkey_path = os.path.join(ssh_dir, key_name)
    pubkey_path = os.path.join(ssh_dir, f"{key_name}.pub")

    if not os.path.exists(privkey_path):
        raise ValueError(f"Private key '{key_name}' not found")

    # Build ssh-keygen command to extract public key
    # ssh-keygen -y -f private_key [-P passphrase]
    passphrase_str = passphrase.get_secret_value() if passphrase else ""

    try:
        # Use -y to read private key and output public key
        result = subprocess.run(
            ['ssh-keygen', '-y', '-P', passphrase_str, '-f', privkey_path],
            capture_output=True,
            text=True,
            timeout=30
        )

        if result.returncode != 0:
            if "incorrect passphrase" in result.stderr.lower() or \
               "bad passphrase" in result.stderr.lower():
                raise RuntimeError("Incorrect passphrase for private key")
            raise RuntimeError(f"Failed to extract public key: {result.stderr}")

        # The output is just "type base64key" without comment
        # We need to add the comment
        public_key_content = result.stdout.strip()
        if not public_key_content:
            raise RuntimeError("No public key output from ssh-keygen")

        # Write the public key file
        with open(pubkey_path, 'w') as f:
            f.write(public_key_content + '\n')

        # Set correct permissions
        os.chmod(pubkey_path, 0o644)

        logger.info(f"Regenerated public key: {pubkey_path}")

        # Parse and return the key info
        return parse_public_key(pubkey_path, ssh_dir)

    except subprocess.TimeoutExpired:
        raise RuntimeError("Public key regeneration timed out")
    except FileNotFoundError:
        raise RuntimeError("ssh-keygen not found on system")


def add_to_authorized_keys(ssh_dir: str, public_key: str) -> bool:
    """Add a public key to the authorized_keys file.

    Enforces 'restrict' option and ensures 'fileglancer' is in the comment.

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
    if not public_key:
        raise ValueError("Invalid public key format: empty")

    parts = public_key.strip().split()

    # Find the key type index (ssh-...) to handle existing options
    try:
        type_idx = next(i for i, part in enumerate(parts) if part.startswith(SSH_KEY_PREFIX))
    except StopIteration:
        raise ValueError("Invalid public key format: key type not found")

    # Handle options
    if type_idx > 0:
        options = parts[0].split(',')
        if "restrict" not in options:
            options.insert(0, "restrict,pty")
        new_options = ",".join(options)
    else:
        new_options = "restrict,pty"

    # Handle comment
    key_parts = parts[type_idx:]
    # key_parts is [type, blob, comment...]
    if len(key_parts) < 2:
         raise ValueError("Invalid public key format: incomplete")

    key_type = key_parts[0]
    key_blob = key_parts[1]
    comment_parts = key_parts[2:]

    if not any("fileglancer" in p for p in comment_parts):
        comment_parts.append("fileglancer")

    new_comment = " ".join(comment_parts)

    # Reconstruct key line
    final_key_line = f"{new_options} {key_type} {key_blob} {new_comment}"

    # Ensure .ssh directory exists
    ensure_ssh_directory_exists(ssh_dir)

    authorized_keys_path = os.path.join(ssh_dir, AUTHORIZED_KEYS_FILENAME)

    # Get fingerprint of the key we're adding to check if already present
    # We use the ORIGINAL key content for fingerprinting as options don't affect it
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

    # Backup and append the modified key
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
            f.write(final_key_line + '\n')

        # Ensure correct permissions
        os.chmod(authorized_keys_path, 0o600)

        logger.info(f"Added restricted key to {authorized_keys_path}")
        return True

    except Exception as e:
        raise RuntimeError(f"Failed to add key to authorized_keys: {e}")


def _get_key_info_line(key_path: str) -> Optional[str]:
    """Get the ssh-keygen info line for a key (public or private).

    Args:
        key_path: Path to the key file

    Returns:
        The output line from ssh-keygen -lf, or None if it fails.
        Format: "256 SHA256:xxxxx comment (ED25519)"
    """
    try:
        result = subprocess.run(
            ['ssh-keygen', '-lf', key_path],
            capture_output=True,
            text=True,
            timeout=10
        )
        if result.returncode == 0:
            return result.stdout.strip()
        return None
    except Exception:
        return None


def check_unmanaged_id_ed25519(ssh_dir: str) -> bool:
    """Check if id_ed25519 exists but is not managed by fileglancer.

    Args:
        ssh_dir: Path to the .ssh directory

    Returns:
        True if id_ed25519 or id_ed25519.pub exists but isn't fileglancer-managed
    """
    privkey_path = os.path.join(ssh_dir, "id_ed25519")
    pubkey_path = os.path.join(ssh_dir, "id_ed25519.pub")

    privkey_exists = os.path.exists(privkey_path)
    pubkey_exists = os.path.exists(pubkey_path)

    # If neither file exists, not unmanaged
    if not privkey_exists and not pubkey_exists:
        return False

    # If public key exists, check if it has 'fileglancer' in the comment
    if pubkey_exists:
        try:
            with open(pubkey_path, 'r') as f:
                content = f.read().strip()

            # If 'fileglancer' is in the comment, it's managed
            if 'fileglancer' in content:
                return False
            # Otherwise it's unmanaged
            return True
        except Exception as e:
            logger.warning(f"Error checking id_ed25519.pub: {e}")
            # If we can't read it, assume it's unmanaged to be safe
            return True

    # Public key doesn't exist but private key does
    # Get the key info line which includes the comment
    # Output format: "256 SHA256:xxxxx comment (ED25519)"
    info_line = _get_key_info_line(privkey_path)
    if info_line and 'fileglancer' in info_line:
        return False  # It's managed (has fileglancer in comment)

    # Could not get info or 'fileglancer' not in comment
    return True


def check_id_ed25519_status(ssh_dir: str) -> tuple:
    """Check the status of id_ed25519 key.

    Args:
        ssh_dir: Path to the .ssh directory

    Returns:
        Tuple of (exists, unmanaged, missing_pubkey):
        - exists: True if id_ed25519 private key exists
        - unmanaged: True if id_ed25519 exists but is not managed by fileglancer
        - missing_pubkey: True if id_ed25519 is managed but .pub file is missing
    """
    privkey_path = os.path.join(ssh_dir, "id_ed25519")
    pubkey_path = os.path.join(ssh_dir, "id_ed25519.pub")

    privkey_exists = os.path.exists(privkey_path)
    pubkey_exists = os.path.exists(pubkey_path)

    # If private key doesn't exist
    if not privkey_exists:
        # Check if only pubkey exists (unusual but possible)
        if pubkey_exists:
            try:
                with open(pubkey_path, 'r') as f:
                    content = f.read().strip()
                if 'fileglancer' in content:
                    return (True, False, False)  # Managed via pubkey only
                return (True, True, False)  # Unmanaged
            except Exception:
                return (True, True, False)  # Assume unmanaged
        return (False, False, False)  # Nothing exists

    # Private key exists
    exists = True

    # Check if public key exists and has fileglancer
    if pubkey_exists:
        try:
            with open(pubkey_path, 'r') as f:
                content = f.read().strip()
            if 'fileglancer' in content:
                return (exists, False, False)  # Managed, has pubkey
            return (exists, True, False)  # Unmanaged
        except Exception:
            return (exists, True, False)  # Assume unmanaged

    # Private key exists but public key doesn't
    # Check if private key has fileglancer in comment
    info_line = _get_key_info_line(privkey_path)
    if info_line and 'fileglancer' in info_line:
        return (exists, False, True)  # Managed but missing pubkey

    return (exists, True, False)  # Unmanaged


class TempKeyResponse(SSHKeyContentResponse):
    """Secure streaming response for temporary SSH key that deletes files after sending.

    Extends SSHKeyContentResponse to also delete the temporary key files
    after the private key content has been streamed and wiped.
    """

    def __init__(
        self,
        key_content: bytearray,
        temp_key_path: str,
        temp_pubkey_path: str,
        key_info: SSHKeyInfo,
        status_code: int = 200,
    ):
        """Initialize the response with key content and paths to delete.

        Args:
            key_content: The private key content as a mutable bytearray
            temp_key_path: Path to temporary private key file to delete
            temp_pubkey_path: Path to temporary public key file to delete
            key_info: SSHKeyInfo to include in response headers
            status_code: HTTP status code (default 200)
        """
        self._temp_key_path = temp_key_path
        self._temp_pubkey_path = temp_pubkey_path

        # Include key info in headers
        headers = {
            "X-SSH-Key-Filename": key_info.filename,
            "X-SSH-Key-Type": key_info.key_type,
            "X-SSH-Key-Fingerprint": key_info.fingerprint,
            "X-SSH-Key-Comment": key_info.comment,
        }

        super().__init__(key_content, status_code, headers)

    async def __call__(self, scope, receive, send):
        """Stream the response, then wipe buffer and delete temp files."""
        try:
            await super().__call__(scope, receive, send)
        finally:
            # Delete temporary files
            self._cleanup_temp_files()

    def _cleanup_temp_files(self):
        """Securely delete temporary key files."""
        for path in (self._temp_key_path, self._temp_pubkey_path):
            try:
                if os.path.exists(path):
                    # Overwrite with zeros before deleting
                    file_size = os.path.getsize(path)
                    with open(path, 'wb') as f:
                        f.write(b'\x00' * file_size)
                    os.unlink(path)
                    logger.info(f"Deleted temporary key file: {path}")
            except Exception as e:
                logger.warning(f"Failed to delete temp file {path}: {e}")


def generate_temp_key_and_authorize(
    ssh_dir: str,
    passphrase: Optional[SecretStr] = None
) -> TempKeyResponse:
    """Generate a temporary SSH key, add to authorized_keys, and return private key.

    The key is generated to a temporary location, the public key is added to
    authorized_keys with 'fileglancer' comment, and the private key is returned
    via TempKeyResponse which will delete the temp files after streaming.

    Args:
        ssh_dir: Path to the .ssh directory
        passphrase: Optional passphrase to protect the private key

    Returns:
        TempKeyResponse containing the private key (streams and deletes files)

    Raises:
        RuntimeError: If key generation fails
    """
    # Create temporary directory for key generation
    temp_dir = tempfile.mkdtemp(prefix="fileglancer_ssh_")
    temp_key_path = os.path.join(temp_dir, "temp_key")
    temp_pubkey_path = os.path.join(temp_dir, "temp_key.pub")

    try:
        # Generate key to temp location
        passphrase_str = passphrase.get_secret_value() if passphrase else ""
        cmd = [
            'ssh-keygen',
            '-t', 'ed25519',
            '-N', passphrase_str,
            '-f', temp_key_path,
            '-C', 'fileglancer',
        ]

        logger.info("Generating temporary SSH key")

        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=30
        )

        if result.returncode != 0:
            raise RuntimeError(f"ssh-keygen failed: {result.stderr}")

        # Set correct permissions
        os.chmod(temp_key_path, 0o600)
        os.chmod(temp_pubkey_path, 0o644)

        # Read public key and add to authorized_keys
        with open(temp_pubkey_path, 'r') as f:
            public_key = f.read().strip()

        ensure_ssh_directory_exists(ssh_dir)
        add_to_authorized_keys(ssh_dir, public_key)

        # Get key info for headers
        fingerprint = get_key_fingerprint(temp_pubkey_path)

        # Parse public key for type and comment
        parts = public_key.split(None, 2)
        key_type = parts[0] if len(parts) >= 1 else "ssh-ed25519"
        comment = parts[2] if len(parts) > 2 else "fileglancer"

        key_info = SSHKeyInfo(
            filename="temporary",
            key_type=key_type,
            fingerprint=fingerprint,
            comment=comment,
            has_private_key=False,  # Not persisted
            is_authorized=True
        )

        # Read private key into bytearray
        private_key_buffer = read_file_to_bytearray(temp_key_path)

        logger.info("Temporary SSH key generated and added to authorized_keys")

        # Return response that will stream private key and delete temp files
        # Note: temp_dir cleanup happens in TempKeyResponse._cleanup_temp_files
        return TempKeyResponse(
            private_key_buffer,
            temp_key_path,
            temp_pubkey_path,
            key_info
        )

    except Exception as e:
        # Clean up on error
        try:
            if os.path.exists(temp_key_path):
                os.unlink(temp_key_path)
            if os.path.exists(temp_pubkey_path):
                os.unlink(temp_pubkey_path)
            if os.path.exists(temp_dir):
                os.rmdir(temp_dir)
        except Exception:
            pass
        raise RuntimeError(f"Failed to generate temporary key: {e}")
