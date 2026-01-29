"Tests for SSH key management utilities with secure bytearray handling."

import os
import subprocess
import tempfile
import pytest
from pydantic import SecretStr

from fileglancer.sshkeys import (
    _wipe_bytearray,
    read_file_to_bytearray,
    SSHKeyContentResponse,
    TempKeyResponse,
    generate_temp_key_and_authorize,
    list_ssh_keys,
    add_to_authorized_keys,
    is_key_in_authorized_keys,
    SSHKeyInfo,
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


class TestSSHKeyContentResponse:
    """Tests for the SSHKeyContentResponse secure streaming response class."""

    @pytest.mark.asyncio
    async def test_response_streams_content_line_by_line(self):
        """Verify the response streams content line by line with more_body flag."""
        key_content = bytearray(b"line1\nline2\nline3\n")
        response = SSHKeyContentResponse(key_content)

        sent_messages = []
        captured_bodies = []

        async def mock_receive():
            return {"type": "http.request", "body": b""}

        async def mock_send(message):
            sent_messages.append(message)
            # Capture a copy of the body before it gets wiped
            if message.get("type") == "http.response.body":
                captured_bodies.append(bytes(message["body"]))

        scope = {"type": "http"}

        await response(scope, mock_receive, mock_send)

        # Verify response start was sent
        assert sent_messages[0]["type"] == "http.response.start"
        assert sent_messages[0]["status"] == 200

        # Verify streaming: multiple body messages with more_body=True
        # 3 lines + 1 final empty message = 4 body messages
        body_messages = [m for m in sent_messages if m.get("type") == "http.response.body"]
        assert len(body_messages) == 4

        # All but the last should have more_body=True
        for msg in body_messages[:-1]:
            assert msg["more_body"] is True

        # Final message should have more_body=False and empty body
        assert body_messages[-1]["more_body"] is False
        assert captured_bodies[-1] == b""

        # Reassembled content should match original
        reassembled = b"".join(captured_bodies[:-1])  # Exclude final empty
        assert reassembled == b"line1\nline2\nline3\n"

    @pytest.mark.asyncio
    async def test_response_wipes_bytearray_after_streaming(self):
        """Verify the bytearray is wiped after streaming completes."""
        key_content = bytearray(b"sensitive\nprivate\nkey\n")
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
        """Verify the bytearray is wiped even if streaming fails."""
        key_content = bytearray(b"sensitive\ndata\n")
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

    def test_iter_lines_yields_memoryview_slices(self):
        """Verify _iter_lines yields memoryview slices without copying."""
        key_content = bytearray(b"line1\nline2\nline3\n")
        response = SSHKeyContentResponse(key_content)

        lines = list(response._iter_lines())

        # Should have 3 lines
        assert len(lines) == 3

        # Each should be a memoryview
        for line in lines:
            assert isinstance(line, memoryview)

        # Content should be correct
        assert bytes(lines[0]) == b"line1\n"
        assert bytes(lines[1]) == b"line2\n"
        assert bytes(lines[2]) == b"line3\n"

        # Clean up
        _wipe_bytearray(key_content)


class TestListSSHKeys:
    """Tests for list_ssh_keys function (reads from authorized_keys)."""

    def test_empty_directory(self):
        """Verify listing returns empty list for empty directory."""
        with tempfile.TemporaryDirectory() as ssh_dir:
            keys = list_ssh_keys(ssh_dir)
            assert keys == []

    def test_no_authorized_keys_file(self):
        """Verify listing returns empty list when authorized_keys doesn't exist."""
        with tempfile.TemporaryDirectory() as ssh_dir:
            keys = list_ssh_keys(ssh_dir)
            assert keys == []

    def test_list_fileglancer_keys_from_authorized_keys(self):
        """Verify listing includes keys with fileglancer in comment."""
        with tempfile.TemporaryDirectory() as ssh_dir:
            # Generate a key with fileglancer comment
            key_path = os.path.join(ssh_dir, "temp_key")
            subprocess.run([
                'ssh-keygen', '-t', 'ed25519', '-N', '',
                '-f', key_path, '-C', 'fileglancer'
            ], capture_output=True, check=True)

            # Add to authorized_keys
            pubkey_path = key_path + ".pub"
            with open(pubkey_path, 'r') as f:
                pubkey = f.read().strip()

            add_to_authorized_keys(ssh_dir, pubkey)

            keys = list_ssh_keys(ssh_dir)

            assert len(keys) == 1
            assert "fileglancer" in keys[0].comment

    def test_list_excludes_non_fileglancer_keys(self):
        """Verify listing excludes keys without 'fileglancer' comment."""
        with tempfile.TemporaryDirectory() as ssh_dir:
            # Create an authorized_keys file with a non-fileglancer key
            key_path = os.path.join(ssh_dir, "other_key")
            subprocess.run([
                'ssh-keygen', '-t', 'ed25519', '-N', '',
                '-f', key_path, '-C', 'user@host'
            ], capture_output=True, check=True)

            auth_keys_path = os.path.join(ssh_dir, "authorized_keys")
            with open(key_path + ".pub", 'r') as f:
                pubkey = f.read().strip()
            with open(auth_keys_path, 'w') as f:
                f.write(pubkey + "\n")

            keys = list_ssh_keys(ssh_dir)
            assert len(keys) == 0


class TestGenerateTempKeyAndAuthorize:
    """Tests for generate_temp_key_and_authorize function."""

    @pytest.mark.asyncio
    async def test_generate_temp_key_basic(self):
        """Verify generating a temporary key."""
        with tempfile.TemporaryDirectory() as ssh_dir:
            response = generate_temp_key_and_authorize(ssh_dir)

            # Verify it's a TempKeyResponse
            assert isinstance(response, TempKeyResponse)

            # Stream the response to get the private key
            captured_bodies = []

            async def mock_receive():
                return {"type": "http.request", "body": b""}

            async def mock_send(message):
                if message.get("type") == "http.response.body":
                    captured_bodies.append(bytes(message["body"]))

            scope = {"type": "http"}
            await response(scope, mock_receive, mock_send)

            # Reassemble private key
            private_key = b"".join(captured_bodies[:-1])
            assert b"-----BEGIN OPENSSH PRIVATE KEY-----" in private_key

            # Verify authorized_keys was updated
            auth_keys_path = os.path.join(ssh_dir, "authorized_keys")
            assert os.path.exists(auth_keys_path)
            with open(auth_keys_path, 'r') as f:
                content = f.read()
            assert "fileglancer" in content

    @pytest.mark.asyncio
    async def test_generate_temp_key_with_passphrase(self):
        """Verify generating a temp key with passphrase."""
        with tempfile.TemporaryDirectory() as ssh_dir:
            passphrase = SecretStr("test-passphrase")
            response = generate_temp_key_and_authorize(ssh_dir, passphrase=passphrase)

            # Stream the response
            captured_bodies = []

            async def mock_receive():
                return {"type": "http.request", "body": b""}

            async def mock_send(message):
                if message.get("type") == "http.response.body":
                    captured_bodies.append(bytes(message["body"]))

            scope = {"type": "http"}
            await response(scope, mock_receive, mock_send)

            # Reassemble private key
            private_key = b"".join(captured_bodies[:-1])
            assert b"-----BEGIN OPENSSH PRIVATE KEY-----" in private_key

            # Write the key to a temp file and verify it requires the passphrase
            with tempfile.NamedTemporaryFile(mode='wb', delete=False) as f:
                f.write(private_key)
                temp_key_file = f.name

            try:
                os.chmod(temp_key_file, 0o600)

                # Verify it IS encrypted (fails with empty passphrase)
                check_cmd_empty = ['ssh-keygen', '-y', '-f', temp_key_file, '-P', '']
                result_empty = subprocess.run(check_cmd_empty, capture_output=True)
                assert result_empty.returncode != 0

                # Verify it accepts the correct passphrase
                check_cmd_correct = ['ssh-keygen', '-y', '-f', temp_key_file, '-P', 'test-passphrase']
                result_correct = subprocess.run(check_cmd_correct, capture_output=True)
                assert result_correct.returncode == 0
            finally:
                os.unlink(temp_key_file)

    @pytest.mark.asyncio
    async def test_generate_temp_key_deletes_temp_files(self):
        """Verify temp files are deleted after streaming."""
        with tempfile.TemporaryDirectory() as ssh_dir:
            response = generate_temp_key_and_authorize(ssh_dir)

            # Get the temp file paths
            temp_key_path = response._temp_key_path
            temp_pubkey_path = response._temp_pubkey_path

            # Files should exist before streaming
            assert os.path.exists(temp_key_path)
            assert os.path.exists(temp_pubkey_path)

            # Stream the response
            async def mock_receive():
                return {"type": "http.request", "body": b""}

            async def mock_send(message):
                pass

            scope = {"type": "http"}
            await response(scope, mock_receive, mock_send)

            # Files should be deleted after streaming
            assert not os.path.exists(temp_key_path)
            assert not os.path.exists(temp_pubkey_path)

    def test_generate_temp_key_restores_umask(self):
        """Verify umask is restored after temp key generation."""
        with tempfile.TemporaryDirectory() as ssh_dir:
            original_umask = os.umask(0o022)
            os.umask(original_umask)

            # This will create the response but not stream it
            # The umask should be restored after the try/finally
            try:
                generate_temp_key_and_authorize(ssh_dir)
            except Exception:
                pass

            current_umask = os.umask(original_umask)
            assert current_umask == original_umask


class TestIsKeyInAuthorizedKeys:
    """Tests for is_key_in_authorized_keys function."""

    def test_key_not_in_empty_authorized_keys(self):
        """Verify returns False when authorized_keys doesn't exist."""
        with tempfile.TemporaryDirectory() as ssh_dir:
            result = is_key_in_authorized_keys(ssh_dir, "SHA256:abcdef123456")
            assert result is False

    def test_key_in_authorized_keys(self):
        """Verify returns True when key is in authorized_keys with fileglancer comment."""
        with tempfile.TemporaryDirectory() as ssh_dir:
            # Generate a key with fileglancer comment
            key_path = os.path.join(ssh_dir, "temp_key")
            subprocess.run([
                'ssh-keygen', '-t', 'ed25519', '-N', '',
                '-f', key_path, '-C', 'fileglancer'
            ], capture_output=True, check=True)

            # Read the public key and add to authorized_keys
            pubkey_path = key_path + ".pub"
            with open(pubkey_path, 'r') as f:
                pubkey = f.read().strip()

            add_to_authorized_keys(ssh_dir, pubkey)

            # Get the fingerprint
            result = subprocess.run(
                ['ssh-keygen', '-lf', pubkey_path],
                capture_output=True, text=True
            )
            fingerprint = result.stdout.split()[1]

            # Check
            assert is_key_in_authorized_keys(ssh_dir, fingerprint) is True


class TestTempKeyResponse:
    """Tests for TempKeyResponse class."""

    @pytest.mark.asyncio
    async def test_includes_key_info_in_headers(self):
        """Verify key info is included in response headers."""
        key_content = bytearray(b"test private key")
        key_info = SSHKeyInfo(
            filename="test_key",
            key_type="ssh-ed25519",
            fingerprint="SHA256:abc123",
            comment="fileglancer",
        )

        temp_dir = tempfile.mkdtemp()
        with tempfile.NamedTemporaryFile(delete=False, dir=temp_dir) as f1, \
             tempfile.NamedTemporaryFile(delete=False, dir=temp_dir) as f2:
            f1.write(b"private")
            f2.write(b"public")
            temp_key = f1.name
            temp_pub = f2.name

        try:
            response = TempKeyResponse(key_content, temp_key, temp_pub, temp_dir, key_info)

            sent_messages = []

            async def mock_receive():
                return {"type": "http.request", "body": b""}

            async def mock_send(message):
                sent_messages.append(message)

            scope = {"type": "http"}
            await response(scope, mock_receive, mock_send)

            # Check headers
            header_names = [h[0] for h in sent_messages[0]["headers"]]

            assert b"x-ssh-key-fingerprint" in header_names
            assert b"x-ssh-key-type" in header_names
        finally:
            # Files should be deleted by TempKeyResponse
            pass
