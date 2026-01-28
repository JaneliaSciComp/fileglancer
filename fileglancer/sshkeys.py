"""SSH Key management utilities for Fileglancer.

This module provides functions for listing and generating SSH keys
that are stored in the user's authorized_keys file.
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


class SSHKeyInfo(BaseModel):
    """Information about an SSH key (without sensitive content)"""
    filename: str = Field(description="Key identifier (fingerprint for authorized_keys entries)")
    key_type: str = Field(description="The SSH key type (e.g., 'ssh-ed25519', 'ssh-rsa')")
    fingerprint: str = Field(description="SHA256 fingerprint of the key")
    comment: str = Field(description="Comment associated with the key")


class SSHKeyListResponse(BaseModel):
    """Response containing a list of SSH keys"""
    keys: List[SSHKeyInfo] = Field(description="List of SSH keys")


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
    buffering in h11/uvicorn. After streaming completes, the original bytearray
    is wiped with zeros and garbage collection is triggered.
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
        self._key_buffer = key_content

        all_headers = dict(headers) if headers else {}
        all_headers["content-length"] = str(len(key_content))

        super().__init__(
            status_code=status_code,
            headers=all_headers,
            media_type=self.media_type,
        )

    def _iter_lines(self):
        """Yield memoryview slices of the key buffer line by line."""
        buffer = self._key_buffer
        view = memoryview(buffer)
        start = 0

        while start < len(buffer):
            try:
                end = buffer.index(b'\n', start) + 1
            except ValueError:
                end = len(buffer)

            yield view[start:end]
            start = end

    async def __call__(self, scope, receive, send):
        """Stream the response line-by-line, then wipe the sensitive buffer."""
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

        parts = result.stdout.strip().split()
        if len(parts) >= 2:
            return parts[1]  # SHA256:xxxxx
        raise ValueError("Unexpected ssh-keygen output format")
    except subprocess.TimeoutExpired:
        raise ValueError("Timeout getting key fingerprint")
    except FileNotFoundError:
        raise ValueError("ssh-keygen not found")


def read_file_to_bytearray(file_path: str) -> bytearray:
    """Read a file into a mutable bytearray for secure handling.

    Args:
        file_path: Path to the file to read

    Returns:
        The file contents as a mutable bytearray
    """
    file_size = os.path.getsize(file_path)
    key_buffer = bytearray(file_size)

    with open(file_path, 'rb') as f:
        bytes_read = f.readinto(key_buffer)
        if bytes_read != file_size:
            _wipe_bytearray(key_buffer)
            raise IOError(f"Expected to read {file_size} bytes, but read {bytes_read}")

    return key_buffer


def is_key_in_authorized_keys(ssh_dir: str, fingerprint: str) -> bool:
    """Check if a key with the given fingerprint is in authorized_keys with 'fileglancer' comment.

    Args:
        ssh_dir: Path to the .ssh directory
        fingerprint: The SHA256 fingerprint to look for

    Returns:
        True if the key is in authorized_keys with 'fileglancer' in the comment
    """
    authorized_keys_path = os.path.join(ssh_dir, AUTHORIZED_KEYS_FILENAME)

    if not os.path.exists(authorized_keys_path):
        return False

    try:
        result = subprocess.run(
            ['ssh-keygen', '-lf', authorized_keys_path],
            capture_output=True,
            text=True,
            timeout=30
        )

        if result.returncode != 0:
            logger.warning(f"Could not check authorized_keys: {result.stderr}")
            return False

        for line in result.stdout.strip().split('\n'):
            if fingerprint in line and 'fileglancer' in line:
                return True

        return False
    except Exception as e:
        logger.warning(f"Error checking authorized_keys: {e}")
        return False


def list_ssh_keys(ssh_dir: str) -> List[SSHKeyInfo]:
    """List SSH keys with 'fileglancer' in the comment from authorized_keys.

    Args:
        ssh_dir: Path to the .ssh directory

    Returns:
        List of SSHKeyInfo objects for fileglancer-managed keys
    """
    keys: List[SSHKeyInfo] = []
    authorized_keys_path = os.path.join(ssh_dir, AUTHORIZED_KEYS_FILENAME)

    if not os.path.exists(authorized_keys_path):
        return keys

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
            return keys

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

            keys.append(SSHKeyInfo(
                filename=fingerprint,
                key_type=key_type,
                fingerprint=fingerprint,
                comment=comment,
            ))

    except Exception as e:
        logger.warning(f"Error parsing authorized_keys: {e}")

    logger.info(f"Listed {len(keys)} SSH keys with 'fileglancer' comment in {ssh_dir}")
    return keys


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

    ensure_ssh_directory_exists(ssh_dir)

    authorized_keys_path = os.path.join(ssh_dir, AUTHORIZED_KEYS_FILENAME)

    # Check if key already exists
    try:
        with tempfile.NamedTemporaryFile(mode='w', suffix='.pub', delete=False) as tmp:
            tmp.write(public_key)
            tmp_path = tmp.name

        try:
            fingerprint = get_key_fingerprint(tmp_path)
        finally:
            os.unlink(tmp_path)

        if is_key_in_authorized_keys(ssh_dir, fingerprint):
            logger.info("Key already in authorized_keys (fingerprint match)")
            return True

    except Exception as e:
        logger.warning(f"Could not check fingerprint, proceeding with add: {e}")

    # Backup and append
    try:
        if os.path.exists(authorized_keys_path):
            backup_path = authorized_keys_path + '.bak'
            shutil.copy2(authorized_keys_path, backup_path)
            logger.info(f"Backed up authorized_keys to {backup_path}")

            # Ensure file ends with newline before appending
            with open(authorized_keys_path, 'rb') as f:
                f.seek(0, 2)
                if f.tell() > 0:
                    f.seek(-1, 2)
                    if f.read(1) != b'\n':
                        with open(authorized_keys_path, 'a') as af:
                            af.write('\n')

        with open(authorized_keys_path, 'a') as f:
            f.write(final_key_line + '\n')

        os.chmod(authorized_keys_path, 0o600)

        logger.info(f"Added restricted key to {authorized_keys_path}")
        return True

    except Exception as e:
        raise RuntimeError(f"Failed to add key to authorized_keys: {e}")


class TempKeyResponse(SSHKeyContentResponse):
    """Secure streaming response for temporary SSH key that deletes files after sending."""

    def __init__(
        self,
        key_content: bytearray,
        temp_key_path: str,
        temp_pubkey_path: str,
        key_info: SSHKeyInfo,
        status_code: int = 200,
    ):
        self._temp_key_path = temp_key_path
        self._temp_pubkey_path = temp_pubkey_path

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
            self._cleanup_temp_files()

    def _cleanup_temp_files(self):
        """Securely delete temporary key files."""
        for path in (self._temp_key_path, self._temp_pubkey_path):
            try:
                if os.path.exists(path):
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
    temp_dir = tempfile.mkdtemp(prefix="fileglancer_ssh_")
    temp_key_path = os.path.join(temp_dir, "temp_key")
    temp_pubkey_path = os.path.join(temp_dir, "temp_key.pub")

    old_umask = os.umask(0o077)
    try:
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

        os.chmod(temp_key_path, 0o600)
        os.chmod(temp_pubkey_path, 0o644)

        with open(temp_pubkey_path, 'r') as f:
            public_key = f.read().strip()

        ensure_ssh_directory_exists(ssh_dir)
        add_to_authorized_keys(ssh_dir, public_key)

        fingerprint = get_key_fingerprint(temp_pubkey_path)

        parts = public_key.split(None, 2)
        key_type = parts[0] if len(parts) >= 1 else "ssh-ed25519"
        comment = parts[2] if len(parts) > 2 else "fileglancer"

        key_info = SSHKeyInfo(
            filename="temporary",
            key_type=key_type,
            fingerprint=fingerprint,
            comment=comment,
        )

        private_key_buffer = read_file_to_bytearray(temp_key_path)

        logger.info("Temporary SSH key generated and added to authorized_keys")

        return TempKeyResponse(
            private_key_buffer,
            temp_key_path,
            temp_pubkey_path,
            key_info
        )

    except Exception as e:
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
    finally:
        os.umask(old_umask)
