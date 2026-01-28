"Tests for SSH key management utilities with secure bytearray handling."

import os
import stat
import subprocess
import tempfile
import pytest
from pydantic import SecretStr

from fileglancer.sshkeys import (
    _wipe_bytearray,
    read_file_to_bytearray,
    get_key_content,
    SSHKeyContentResponse,
    TempKeyResponse,
    generate_ssh_key,
    generate_temp_key_and_authorize,
    regenerate_public_key,
    check_id_ed25519_status,
    list_ssh_keys,
    add_to_authorized_keys,
    is_key_in_authorized_keys,
    _parse_authorized_keys_fileglancer,
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
    async def test_response_sends_single_line_content(self):
        """Verify the response handles content without newlines."""
        key_content = bytearray(b"single line no newline")
        response = SSHKeyContentResponse(key_content)

        sent_messages = []
        captured_bodies = []

        async def mock_receive():
            return {"type": "http.request", "body": b""}

        async def mock_send(message):
            sent_messages.append(message)
            if message.get("type") == "http.response.body":
                captured_bodies.append(bytes(message["body"]))

        scope = {"type": "http"}

        await response(scope, mock_receive, mock_send)

        # Verify response start was sent
        assert sent_messages[0]["type"] == "http.response.start"
        assert sent_messages[0]["status"] == 200

        # 1 content chunk + 1 final empty = 2 body messages
        body_messages = [m for m in sent_messages if m.get("type") == "http.response.body"]
        assert len(body_messages) == 2

        # First should have more_body=True, second more_body=False
        assert body_messages[0]["more_body"] is True
        assert body_messages[1]["more_body"] is False

        # Content should match
        assert captured_bodies[0] == b"single line no newline"
        assert captured_bodies[1] == b""

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

    def test_response_accepts_custom_status_code(self):
        """Verify custom status codes are supported."""
        key_content = bytearray(b"test")
        response = SSHKeyContentResponse(key_content, status_code=201)

        assert response.status_code == 201

        # Clean up
        _wipe_bytearray(key_content)

    @pytest.mark.asyncio
    async def test_response_streams_realistic_ssh_key(self):
        """Verify streaming works with a realistic SSH private key format."""
        key_content = bytearray(
            b"-----BEGIN OPENSSH PRIVATE KEY-----\n"
            b"b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtz\n"
            b"c2gtZWQyNTUxOQAAACBGVmJsZnRtcm5yYmx0c21ibmRjc2xibmRzY21ibmRzYwAA\n"
            b"AIhkc21ibmRzY21ibmRzY21ibmRzY21ibmRzY21ibmRzY2RzbWJuZHNjbWJuZHNj\n"
            b"-----END OPENSSH PRIVATE KEY-----\n"
        )
        expected_content = bytes(key_content)
        response = SSHKeyContentResponse(key_content)

        sent_messages = []
        captured_bodies = []

        async def mock_receive():
            return {"type": "http.request", "body": b""}

        async def mock_send(message):
            sent_messages.append(message)
            if message.get("type") == "http.response.body":
                captured_bodies.append(bytes(message["body"]))

        scope = {"type": "http"}

        await response(scope, mock_receive, mock_send)

        # Should have 5 lines + 1 final empty = 6 body messages
        body_messages = [m for m in sent_messages if m.get("type") == "http.response.body"]
        assert len(body_messages) == 6

        # Verify each line message has more_body=True
        for msg in body_messages[:-1]:
            assert msg["more_body"] is True

        # Final message should be empty with more_body=False
        assert body_messages[-1]["more_body"] is False
        assert captured_bodies[-1] == b""

        # Reassembled content should match original
        reassembled = b"".join(captured_bodies[:-1])
        assert reassembled == expected_content

        # Verify bytearray was wiped
        assert all(b == 0 for b in key_content)

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

    def test_iter_lines_handles_no_trailing_newline(self):
        """Verify _iter_lines handles content without trailing newline."""
        key_content = bytearray(b"line1\nline2\nfinal")
        response = SSHKeyContentResponse(key_content)

        lines = list(response._iter_lines())

        # Should have 3 lines
        assert len(lines) == 3

        assert bytes(lines[0]) == b"line1\n"
        assert bytes(lines[1]) == b"line2\n"
        assert bytes(lines[2]) == b"final"  # No newline

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

    def test_generate_key_has_fileglancer_comment(self):
        """Verify generated key has 'fileglancer' in the comment."""
        with tempfile.TemporaryDirectory() as ssh_dir:
            key_info = generate_ssh_key(ssh_dir)

            assert key_info.comment == "fileglancer"

            # Also verify by reading the public key file
            pubkey_path = os.path.join(ssh_dir, "id_ed25519.pub")
            with open(pubkey_path, 'r') as f:
                content = f.read()
            assert "fileglancer" in content

    def test_generate_key_sets_correct_permissions(self):
        """Verify generated keys have correct permissions."""
        with tempfile.TemporaryDirectory() as ssh_dir:
            generate_ssh_key(ssh_dir)

            key_path = os.path.join(ssh_dir, "id_ed25519")
            pubkey_path = os.path.join(ssh_dir, "id_ed25519.pub")

            # Private key should be 0o600
            key_mode = stat.S_IMODE(os.stat(key_path).st_mode)
            assert key_mode == 0o600

            # Public key should be 0o644
            pubkey_mode = stat.S_IMODE(os.stat(pubkey_path).st_mode)
            assert pubkey_mode == 0o644

    def test_generate_key_restores_umask(self):
        """Verify umask is restored after key generation."""
        with tempfile.TemporaryDirectory() as ssh_dir:
            # Set a known umask
            original_umask = os.umask(0o022)
            os.umask(original_umask)

            generate_ssh_key(ssh_dir)

            # Verify umask is restored
            current_umask = os.umask(original_umask)
            assert current_umask == original_umask


class TestRegeneratePublicKey:
    """Tests for regenerating public keys from private keys."""

    def test_regenerate_public_key_basic(self):
        """Verify regenerating a public key from a private key."""
        with tempfile.TemporaryDirectory() as ssh_dir:
            # First generate a key pair
            generate_ssh_key(ssh_dir)

            # Delete the public key
            pubkey_path = os.path.join(ssh_dir, "id_ed25519.pub")
            os.unlink(pubkey_path)
            assert not os.path.exists(pubkey_path)

            # Regenerate
            key_info = regenerate_public_key(ssh_dir)

            assert os.path.exists(pubkey_path)
            assert key_info.filename == "id_ed25519"
            assert key_info.comment == "fileglancer"

    def test_regenerate_public_key_with_passphrase(self):
        """Verify regenerating with a passphrase-protected key."""
        with tempfile.TemporaryDirectory() as ssh_dir:
            passphrase = SecretStr("test-passphrase")
            generate_ssh_key(ssh_dir, passphrase=passphrase)

            # Delete the public key
            pubkey_path = os.path.join(ssh_dir, "id_ed25519.pub")
            os.unlink(pubkey_path)

            # Regenerate with passphrase
            key_info = regenerate_public_key(ssh_dir, passphrase=passphrase)

            assert os.path.exists(pubkey_path)
            assert key_info.comment == "fileglancer"

    def test_regenerate_public_key_wrong_passphrase(self):
        """Verify regenerating with wrong passphrase fails."""
        with tempfile.TemporaryDirectory() as ssh_dir:
            passphrase = SecretStr("correct-passphrase")
            generate_ssh_key(ssh_dir, passphrase=passphrase)

            # Delete the public key
            pubkey_path = os.path.join(ssh_dir, "id_ed25519.pub")
            os.unlink(pubkey_path)

            # Try to regenerate with wrong passphrase
            wrong_passphrase = SecretStr("wrong-passphrase")
            with pytest.raises(RuntimeError, match="passphrase"):
                regenerate_public_key(ssh_dir, passphrase=wrong_passphrase)

    def test_regenerate_public_key_nonexistent_raises(self):
        """Verify regenerating a nonexistent key raises ValueError."""
        with tempfile.TemporaryDirectory() as ssh_dir:
            with pytest.raises(ValueError, match="not found"):
                regenerate_public_key(ssh_dir)


class TestCheckId25519Status:
    """Tests for check_id_ed25519_status function."""

    def test_no_key_exists(self):
        """Verify status when no key exists."""
        with tempfile.TemporaryDirectory() as ssh_dir:
            exists, unmanaged, missing_pubkey = check_id_ed25519_status(ssh_dir)

            assert exists is False
            assert unmanaged is False
            assert missing_pubkey is False

    def test_managed_key_exists(self):
        """Verify status when managed key exists."""
        with tempfile.TemporaryDirectory() as ssh_dir:
            generate_ssh_key(ssh_dir)

            exists, unmanaged, missing_pubkey = check_id_ed25519_status(ssh_dir)

            assert exists is True
            assert unmanaged is False
            assert missing_pubkey is False

    def test_managed_key_missing_pubkey(self):
        """Verify status when managed key exists but pubkey is missing."""
        with tempfile.TemporaryDirectory() as ssh_dir:
            generate_ssh_key(ssh_dir)

            # Delete the public key
            pubkey_path = os.path.join(ssh_dir, "id_ed25519.pub")
            os.unlink(pubkey_path)

            exists, unmanaged, missing_pubkey = check_id_ed25519_status(ssh_dir)

            assert exists is True
            assert unmanaged is False
            assert missing_pubkey is True

    def test_unmanaged_key_exists(self):
        """Verify status when unmanaged key exists."""
        with tempfile.TemporaryDirectory() as ssh_dir:
            # Create an unmanaged key (no fileglancer comment)
            key_path = os.path.join(ssh_dir, "id_ed25519")
            pubkey_path = os.path.join(ssh_dir, "id_ed25519.pub")

            subprocess.run([
                'ssh-keygen', '-t', 'ed25519', '-N', '',
                '-f', key_path, '-C', 'user@host'
            ], capture_output=True, check=True)

            exists, unmanaged, missing_pubkey = check_id_ed25519_status(ssh_dir)

            assert exists is True
            assert unmanaged is True
            assert missing_pubkey is False


class TestListSSHKeys:
    """Tests for list_ssh_keys function."""

    def test_empty_directory(self):
        """Verify listing returns empty list for empty directory."""
        with tempfile.TemporaryDirectory() as ssh_dir:
            keys = list_ssh_keys(ssh_dir)
            assert keys == []

    def test_list_managed_key(self):
        """Verify listing includes managed keys."""
        with tempfile.TemporaryDirectory() as ssh_dir:
            generate_ssh_key(ssh_dir)

            keys = list_ssh_keys(ssh_dir)

            assert len(keys) == 1
            assert keys[0].filename == "id_ed25519"
            assert keys[0].comment == "fileglancer"

    def test_list_excludes_unmanaged_keys(self):
        """Verify listing excludes keys without 'fileglancer' comment."""
        with tempfile.TemporaryDirectory() as ssh_dir:
            # Create an unmanaged key
            key_path = os.path.join(ssh_dir, "id_rsa")
            subprocess.run([
                'ssh-keygen', '-t', 'rsa', '-b', '2048', '-N', '',
                '-f', key_path, '-C', 'user@host'
            ], capture_output=True, check=True)

            keys = list_ssh_keys(ssh_dir)
            assert len(keys) == 0

    def test_list_sorts_id_ed25519_first(self):
        """Verify id_ed25519 is sorted first."""
        with tempfile.TemporaryDirectory() as ssh_dir:
            # Create multiple keys with fileglancer comment
            for name in ["aaa_key", "id_ed25519", "zzz_key"]:
                key_path = os.path.join(ssh_dir, name)
                subprocess.run([
                    'ssh-keygen', '-t', 'ed25519', '-N', '',
                    '-f', key_path, '-C', 'fileglancer'
                ], capture_output=True, check=True)

            keys = list_ssh_keys(ssh_dir)

            assert len(keys) == 3
            assert keys[0].filename == "id_ed25519"
            # The rest should be alphabetical
            assert keys[1].filename == "aaa_key"
            assert keys[2].filename == "zzz_key"


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
            sent_messages = []
            captured_bodies = []

            async def mock_receive():
                return {"type": "http.request", "body": b""}

            async def mock_send(message):
                sent_messages.append(message)
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
        """Verify returns True when key is in authorized_keys."""
        with tempfile.TemporaryDirectory() as ssh_dir:
            # Generate a key and add to authorized_keys
            generate_ssh_key(ssh_dir)

            # Read the public key and add to authorized_keys
            pubkey_path = os.path.join(ssh_dir, "id_ed25519.pub")
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


class TestParseAuthorizedKeysFileglancer:
    """Tests for _parse_authorized_keys_fileglancer function."""

    def test_empty_authorized_keys(self):
        """Verify returns empty dict when authorized_keys doesn't exist."""
        with tempfile.TemporaryDirectory() as ssh_dir:
            result = _parse_authorized_keys_fileglancer(ssh_dir)
            assert result == {}

    def test_parses_fileglancer_keys(self):
        """Verify parses keys with fileglancer in comment."""
        with tempfile.TemporaryDirectory() as ssh_dir:
            # Generate and authorize a key
            generate_ssh_key(ssh_dir)
            pubkey_path = os.path.join(ssh_dir, "id_ed25519.pub")
            with open(pubkey_path, 'r') as f:
                pubkey = f.read().strip()
            add_to_authorized_keys(ssh_dir, pubkey)

            result = _parse_authorized_keys_fileglancer(ssh_dir)

            assert len(result) == 1
            key_info = list(result.values())[0]
            assert "fileglancer" in key_info.comment
            assert key_info.is_authorized is True

    def test_excludes_non_fileglancer_keys(self):
        """Verify excludes keys without fileglancer in comment."""
        with tempfile.TemporaryDirectory() as ssh_dir:
            # Create authorized_keys with a non-fileglancer key
            auth_keys_path = os.path.join(ssh_dir, "authorized_keys")

            # Generate a key without fileglancer comment
            key_path = os.path.join(ssh_dir, "other_key")
            subprocess.run([
                'ssh-keygen', '-t', 'ed25519', '-N', '',
                '-f', key_path, '-C', 'user@host'
            ], capture_output=True, check=True)

            with open(key_path + ".pub", 'r') as f:
                pubkey = f.read().strip()

            with open(auth_keys_path, 'w') as f:
                f.write(pubkey + "\n")

            result = _parse_authorized_keys_fileglancer(ssh_dir)
            assert len(result) == 0


class TestTempKeyResponse:
    """Tests for TempKeyResponse class."""

    @pytest.mark.asyncio
    async def test_includes_key_info_in_headers(self):
        """Verify key info is included in response headers."""
        from fileglancer.sshkeys import SSHKeyInfo

        key_content = bytearray(b"test private key")
        key_info = SSHKeyInfo(
            filename="test_key",
            key_type="ssh-ed25519",
            fingerprint="SHA256:abc123",
            comment="fileglancer",
            has_private_key=False,
            is_authorized=True
        )

        with tempfile.NamedTemporaryFile(delete=False) as f1, \
             tempfile.NamedTemporaryFile(delete=False) as f2:
            f1.write(b"private")
            f2.write(b"public")
            temp_key = f1.name
            temp_pub = f2.name

        try:
            response = TempKeyResponse(key_content, temp_key, temp_pub, key_info)

            sent_messages = []

            async def mock_receive():
                return {"type": "http.request", "body": b""}

            async def mock_send(message):
                sent_messages.append(message)

            scope = {"type": "http"}
            await response(scope, mock_receive, mock_send)

            # Check headers
            headers = dict(sent_messages[0]["headers"])
            header_names = [h[0] for h in sent_messages[0]["headers"]]

            assert b"x-ssh-key-fingerprint" in header_names
            assert b"x-ssh-key-type" in header_names
        finally:
            # Files should be deleted by TempKeyResponse
            pass
