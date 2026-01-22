"Tests for SSH key management utilities with secure bytearray handling."

import os
import subprocess
import tempfile
import pytest
from pydantic import SecretStr

from fileglancer.sshkeys import (
    _wipe_bytearray,
    read_file_to_bytearray,
    get_key_content,
    SSHKeyContentResponse,
    generate_ssh_key,
)


class TestWipeBytearray:
    """Tests for the _wipe_bytearray helper function."""

    def test_wipe_bytearray_zeros_all_bytes(self):
        """Verify that _wipe_bytearray overwrites all bytes with zeros."""
        data = bytearray(b"sensitive data here")
        original_length = len(data)

        _wipe_bytearray(data)

        assert len(data) == original_length
        assert all(b == 0 for b in data)

    def test_wipe_bytearray_empty(self):
        """Verify that wiping an empty bytearray doesn't raise."""
        data = bytearray()
        _wipe_bytearray(data)
        assert len(data) == 0

    def test_wipe_bytearray_binary_data(self):
        """Verify that binary data (non-UTF8) is properly wiped."""
        data = bytearray(bytes(range(256)))
        _wipe_bytearray(data)
        assert all(b == 0 for b in data)


class TestReadFileToBytearray:
    """Tests for reading files into bytearrays."""

    def test_read_file_into_bytearray(self):
        """Verify file contents are read into a bytearray."""
        test_content = b"-----BEGIN OPENSSH PRIVATE KEY-----\ntest key content\n-----END OPENSSH PRIVATE KEY-----\n"

        with tempfile.NamedTemporaryFile(delete=False) as f:
            f.write(test_content)
            temp_path = f.name

        try:
            result = read_file_to_bytearray(temp_path)

            assert isinstance(result, bytearray)
            assert bytes(result) == test_content

            # Clean up the bytearray
            _wipe_bytearray(result)
        finally:
            os.unlink(temp_path)

    def test_read_returns_mutable_bytearray(self):
        """Verify the returned bytearray is mutable and can be wiped."""
        test_content = b"secret key data"

        with tempfile.NamedTemporaryFile(delete=False) as f:
            f.write(test_content)
            temp_path = f.name

        try:
            result = read_file_to_bytearray(temp_path)

            # Verify it's mutable by modifying it
            result[0] = 0
            assert result[0] == 0

            # Verify we can wipe it completely
            _wipe_bytearray(result)
            assert all(b == 0 for b in result)
        finally:
            os.unlink(temp_path)

    def test_read_nonexistent_file_raises(self):
        """Verify reading a nonexistent file raises an error."""
        with pytest.raises(FileNotFoundError):
            read_file_to_bytearray("/nonexistent/path/to/key")


class TestGetKeyContent:
    """Tests for the unified get_key_content function."""

    def test_returns_bytearray_for_public_key(self):
        """Verify get_key_content returns a bytearray for public keys."""
        with tempfile.TemporaryDirectory() as ssh_dir:
            pubkey_content = b"ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAITest test@example.com"
            pubkey_path = os.path.join(ssh_dir, "id_ed25519.pub")

            with open(pubkey_path, 'wb') as f:
                f.write(pubkey_content)

            result = get_key_content(ssh_dir, "id_ed25519", "public")

            assert isinstance(result, bytearray)
            assert bytes(result) == pubkey_content

            # Clean up
            _wipe_bytearray(result)

    def test_returns_bytearray_for_private_key(self):
        """Verify get_key_content returns a bytearray for private keys."""
        with tempfile.TemporaryDirectory() as ssh_dir:
            private_key_content = b"-----BEGIN OPENSSH PRIVATE KEY-----\ntest\n-----END OPENSSH PRIVATE KEY-----\n"
            private_key_path = os.path.join(ssh_dir, "id_ed25519")

            with open(private_key_path, 'wb') as f:
                f.write(private_key_content)

            result = get_key_content(ssh_dir, "id_ed25519", "private")

            assert isinstance(result, bytearray)
            assert bytes(result) == private_key_content

            # Clean up
            _wipe_bytearray(result)

    def test_returned_bytearray_is_wipeable(self):
        """Verify the returned bytearray can be securely wiped."""
        with tempfile.TemporaryDirectory() as ssh_dir:
            key_content = b"secret key data"
            key_path = os.path.join(ssh_dir, "id_ed25519")

            with open(key_path, 'wb') as f:
                f.write(key_content)

            result = get_key_content(ssh_dir, "id_ed25519", "private")

            # Wipe and verify
            _wipe_bytearray(result)
            assert all(b == 0 for b in result)

    def test_nonexistent_public_key_raises(self):
        """Verify requesting a nonexistent public key raises ValueError."""
        with tempfile.TemporaryDirectory() as ssh_dir:
            with pytest.raises(ValueError, match="not found"):
                get_key_content(ssh_dir, "nonexistent_key", "public")

    def test_nonexistent_private_key_raises(self):
        """Verify requesting a nonexistent private key raises ValueError."""
        with tempfile.TemporaryDirectory() as ssh_dir:
            with pytest.raises(ValueError, match="not found"):
                get_key_content(ssh_dir, "nonexistent_key", "private")

    def test_invalid_key_type_raises(self):
        """Verify invalid key_type raises ValueError."""
        with tempfile.TemporaryDirectory() as ssh_dir:
            with pytest.raises(ValueError, match="Invalid key_type"):
                get_key_content(ssh_dir, "id_ed25519", "invalid")


class TestSSHKeyContentResponse:
    """Tests for the SSHKeyContentResponse secure response class."""

    @pytest.mark.asyncio
    async def test_response_sends_bytearray_content(self):
        """Verify the response sends the bytearray content."""
        key_content = bytearray(b"test private key content")
        response = SSHKeyContentResponse(key_content)

        # Capture what gets sent via ASGI
        # We need to capture a COPY of the body since the bytearray gets wiped
        sent_messages = []
        captured_body = None

        async def mock_receive():
            return {"type": "http.request", "body": b""}

        async def mock_send(message):
            nonlocal captured_body
            sent_messages.append(message)
            # Capture a copy of the body before it gets wiped
            if message.get("type") == "http.response.body":
                captured_body = bytes(message["body"])

        scope = {"type": "http"}

        await response(scope, mock_receive, mock_send)

        # Verify response start was sent
        assert sent_messages[0]["type"] == "http.response.start"
        assert sent_messages[0]["status"] == 200

        # Verify body was sent with correct content (captured before wipe)
        assert sent_messages[1]["type"] == "http.response.body"
        assert captured_body == b"test private key content"

    @pytest.mark.asyncio
    async def test_response_wipes_bytearray_after_sending(self):
        """Verify the bytearray is wiped after the response is sent."""
        key_content = bytearray(b"sensitive private key")
        original_length = len(key_content)
        response = SSHKeyContentResponse(key_content)

        async def mock_receive():
            return {"type": "http.request", "body": b""}

        async def mock_send(message):
            pass

        scope = {"type": "http"}

        await response(scope, mock_receive, mock_send)

        # Verify the bytearray was wiped
        assert len(key_content) == original_length
        assert all(b == 0 for b in key_content)

    @pytest.mark.asyncio
    async def test_response_wipes_bytearray_even_on_error(self):
        """Verify the bytearray is wiped even if sending fails."""
        key_content = bytearray(b"sensitive data")
        response = SSHKeyContentResponse(key_content)

        async def mock_receive():
            return {"type": "http.request", "body": b""}

        async def mock_send(message):
            if message["type"] == "http.response.body":
                raise Exception("Simulated send error")

        scope = {"type": "http"}

        with pytest.raises(Exception, match="Simulated send error"):
            await response(scope, mock_receive, mock_send)

        # Verify the bytearray was still wiped despite the error
        assert all(b == 0 for b in key_content)

    def test_response_has_correct_content_type(self):
        """Verify the response has text/plain content type."""
        key_content = bytearray(b"test")
        response = SSHKeyContentResponse(key_content)

        assert response.media_type == "text/plain"

        # Clean up
        _wipe_bytearray(key_content)

    def test_response_accepts_custom_status_code(self):
        """Verify custom status codes are supported."""
        key_content = bytearray(b"test")
        response = SSHKeyContentResponse(key_content, status_code=201)

        assert response.status_code == 201

        # Clean up
        _wipe_bytearray(key_content)

    @pytest.mark.asyncio
    async def test_response_with_custom_headers(self):
        """Verify custom headers are included in the response."""
        key_content = bytearray(b"test")
        custom_headers = {"X-Custom-Header": "test-value"}
        response = SSHKeyContentResponse(key_content, headers=custom_headers)

        sent_messages = []

        async def mock_receive():
            return {"type": "http.request", "body": b""}

        async def mock_send(message):
            sent_messages.append(message)

        scope = {"type": "http"}

        await response(scope, mock_receive, mock_send)

        # Check headers in the response start message
        headers = dict(sent_messages[0]["headers"])
        assert b"x-custom-header" in headers or any(
            h[0] == b"x-custom-header" for h in sent_messages[0]["headers"]
        )

    @pytest.mark.asyncio
    async def test_response_sets_correct_content_length(self):
        """Verify Content-Length header matches the bytearray length."""
        key_content = bytearray(b"test private key with specific length")
        expected_length = len(key_content)
        response = SSHKeyContentResponse(key_content)

        sent_messages = []

        async def mock_receive():
            return {"type": "http.request", "body": b""}

        async def mock_send(message):
            sent_messages.append(message)

        scope = {"type": "http"}

        await response(scope, mock_receive, mock_send)

        # Find Content-Length in headers
        headers = sent_messages[0]["headers"]
        content_length = None
        for header_name, header_value in headers:
            if header_name == b"content-length":
                content_length = int(header_value.decode())
                break

        assert content_length == expected_length


class TestGenerateSSHKey:
    """Tests for the generate_ssh_key function."""

    def test_generate_key_no_passphrase(self):
        """Verify generating a key with no passphrase."""
        with tempfile.TemporaryDirectory() as ssh_dir:
            key_info = generate_ssh_key(ssh_dir, passphrase=None)

            assert key_info.filename == "id_ed25519"
            key_path = os.path.join(ssh_dir, "id_ed25519")
            assert os.path.exists(key_path)
            assert os.path.exists(key_path + ".pub")

            # Verify it is NOT encrypted
            check_cmd = ['ssh-keygen', '-y', '-f', key_path, '-P', '']
            result = subprocess.run(check_cmd, capture_output=True)
            assert result.returncode == 0

    def test_generate_key_with_passphrase(self):
        """Verify generating a key with a passphrase."""
        with tempfile.TemporaryDirectory() as ssh_dir:
            passphrase_str = "test-passphrase"
            passphrase = SecretStr(passphrase_str)
            key_info = generate_ssh_key(ssh_dir, passphrase=passphrase)

            assert key_info.filename == "id_ed25519"
            key_path = os.path.join(ssh_dir, "id_ed25519")
            assert os.path.exists(key_path)
            assert os.path.exists(key_path + ".pub")

            # Verify it IS encrypted (fails with empty passphrase)
            check_cmd_empty = ['ssh-keygen', '-y', '-f', key_path, '-P', '']
            result_empty = subprocess.run(check_cmd_empty, capture_output=True)
            assert result_empty.returncode != 0

            # Verify it accepts the correct passphrase
            check_cmd_correct = ['ssh-keygen', '-y', '-f', key_path, '-P', passphrase_str]
            result_correct = subprocess.run(check_cmd_correct, capture_output=True)
            assert result_correct.returncode == 0

    def test_generate_key_already_exists_raises(self):
        """Verify generating a key when one already exists raises ValueError."""
        with tempfile.TemporaryDirectory() as ssh_dir:
            # Create a dummy key file
            key_path = os.path.join(ssh_dir, "id_ed25519")
            with open(key_path, 'w') as f:
                f.write("dummy key")

            with pytest.raises(ValueError, match="already exists"):
                generate_ssh_key(ssh_dir)
