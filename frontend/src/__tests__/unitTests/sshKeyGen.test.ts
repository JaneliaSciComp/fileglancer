/**
 * Tests for browser-side SSH key generation.
 *
 * These tests validate that generated keys are compatible with OpenSSH
 * by using the ssh-keygen command-line utility.
 */

import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

import {
  generateSSHKeyPair,
  supportsEd25519,
  getKeyFileName
} from '@/utils/sshKeyGen';
import type { SSHKeyPair } from '@/utils/sshKeyGen';

// Temp directory for key files during tests
let tempDir: string;

beforeAll(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'ssh-keygen-test-'));
});

afterAll(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

/**
 * Helper to write a key pair to temp files and return paths
 */
function writeKeyFiles(
  keyPair: SSHKeyPair,
  basename: string
): { privatePath: string; publicPath: string } {
  const privatePath = join(tempDir, basename);
  const publicPath = join(tempDir, `${basename}.pub`);

  writeFileSync(privatePath, keyPair.privateKey, { mode: 0o600 });
  writeFileSync(publicPath, keyPair.publicKey, { mode: 0o644 });

  return { privatePath, publicPath };
}

/**
 * Run ssh-keygen command and return output
 */
function runSshKeygen(args: string): string {
  return execSync(`ssh-keygen ${args}`, {
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe']
  }).trim();
}

describe('sshKeyGen', () => {
  describe('getKeyFileName', () => {
    test('returns id_ed25519 for Ed25519 keys', () => {
      expect(getKeyFileName('Ed25519')).toBe('id_ed25519');
    });

    test('returns id_rsa for RSA keys', () => {
      expect(getKeyFileName('RSA-4096')).toBe('id_rsa');
    });
  });

  describe('supportsEd25519', () => {
    test('returns a boolean', async () => {
      const result = await supportsEd25519();
      expect(typeof result).toBe('boolean');
    });
  });

  describe('generateSSHKeyPair', () => {
    test('generates a key pair with correct structure', async () => {
      const keyPair = await generateSSHKeyPair();

      expect(keyPair).toHaveProperty('publicKey');
      expect(keyPair).toHaveProperty('privateKey');
      expect(keyPair).toHaveProperty('keyType');
      expect(['Ed25519', 'RSA-4096']).toContain(keyPair.keyType);
    });

    test('includes comment in public key when provided', async () => {
      const comment = 'test@example.com';
      const keyPair = await generateSSHKeyPair(comment);

      expect(keyPair.publicKey).toContain(comment);
    });

    test('public key has correct format', async () => {
      const keyPair = await generateSSHKeyPair();

      if (keyPair.keyType === 'Ed25519') {
        expect(keyPair.publicKey).toMatch(/^ssh-ed25519 [A-Za-z0-9+/]+=*/);
      } else {
        expect(keyPair.publicKey).toMatch(/^ssh-rsa [A-Za-z0-9+/]+=*/);
      }
    });

    test('private key has OpenSSH format', async () => {
      const keyPair = await generateSSHKeyPair();

      expect(keyPair.privateKey).toContain(
        '-----BEGIN OPENSSH PRIVATE KEY-----'
      );
      expect(keyPair.privateKey).toContain('-----END OPENSSH PRIVATE KEY-----');
    });

    test('generates unique keys each time', async () => {
      const keyPair1 = await generateSSHKeyPair();
      const keyPair2 = await generateSSHKeyPair();

      expect(keyPair1.publicKey).not.toBe(keyPair2.publicKey);
      expect(keyPair1.privateKey).not.toBe(keyPair2.privateKey);
    });
  });

  describe('ssh-keygen validation', () => {
    test('ssh-keygen can read the private key', async () => {
      const keyPair = await generateSSHKeyPair('test-comment');
      const { privatePath } = writeKeyFiles(keyPair, 'test-private-read');

      // ssh-keygen -y extracts public key from private key
      // If the private key is invalid, this will throw
      const extractedPublic = runSshKeygen(`-y -f "${privatePath}"`);

      expect(extractedPublic).toBeTruthy();
      expect(extractedPublic).toMatch(/^ssh-(ed25519|rsa) /);
    });

    test('ssh-keygen can compute fingerprint of public key', async () => {
      const keyPair = await generateSSHKeyPair();
      const { publicPath } = writeKeyFiles(keyPair, 'test-fingerprint');

      // ssh-keygen -l -f shows fingerprint
      const fingerprint = runSshKeygen(`-l -f "${publicPath}"`);

      expect(fingerprint).toBeTruthy();
      // Fingerprint format: <bits> SHA256:<hash> <comment> (<type>)
      expect(fingerprint).toMatch(/^\d+ SHA256:/);
    });

    test('ssh-keygen can compute fingerprint of private key', async () => {
      const keyPair = await generateSSHKeyPair();
      const { privatePath } = writeKeyFiles(keyPair, 'test-priv-fingerprint');

      const fingerprint = runSshKeygen(`-l -f "${privatePath}"`);

      expect(fingerprint).toBeTruthy();
      expect(fingerprint).toMatch(/^\d+ SHA256:/);
    });

    test('public and private key fingerprints match', async () => {
      const keyPair = await generateSSHKeyPair();
      const { privatePath, publicPath } = writeKeyFiles(keyPair, 'test-match');

      const publicFingerprint = runSshKeygen(`-l -f "${publicPath}"`);
      const privateFingerprint = runSshKeygen(`-l -f "${privatePath}"`);

      // Extract just the hash part (SHA256:...)
      const publicHash = publicFingerprint.split(' ')[1];
      const privateHash = privateFingerprint.split(' ')[1];

      expect(publicHash).toBe(privateHash);
    });

    test('extracted public key matches original public key', async () => {
      const comment = 'extract-test@example.com';
      const keyPair = await generateSSHKeyPair(comment);
      const { privatePath } = writeKeyFiles(keyPair, 'test-extract');

      // Extract public key from private key
      const extractedPublic = runSshKeygen(`-y -f "${privatePath}"`);

      // The extracted key won't have the comment, so compare base64 portion
      const originalParts = keyPair.publicKey.split(' ');
      const extractedParts = extractedPublic.split(' ');

      expect(extractedParts[0]).toBe(originalParts[0]); // key type
      expect(extractedParts[1]).toBe(originalParts[1]); // base64 key data
    });

    test('ssh-keygen reports correct key type for Ed25519', async () => {
      const keyPair = await generateSSHKeyPair();

      // Skip if RSA fallback was used
      if (keyPair.keyType !== 'Ed25519') {
        return;
      }

      const { publicPath } = writeKeyFiles(keyPair, 'test-ed25519-type');
      const fingerprint = runSshKeygen(`-l -f "${publicPath}"`);

      expect(fingerprint).toContain('(ED25519)');
      expect(fingerprint).toMatch(/^256 /); // Ed25519 keys are 256 bits
    });

    test('ssh-keygen reports correct key type for RSA', async () => {
      const keyPair = await generateSSHKeyPair();

      // Skip if Ed25519 was used
      if (keyPair.keyType !== 'RSA-4096') {
        return;
      }

      const { publicPath } = writeKeyFiles(keyPair, 'test-rsa-type');
      const fingerprint = runSshKeygen(`-l -f "${publicPath}"`);

      expect(fingerprint).toContain('(RSA)');
      expect(fingerprint).toMatch(/^4096 /); // RSA-4096 keys are 4096 bits
    });

    test('comment is preserved in key', async () => {
      const comment = 'my-special-comment@host';
      const keyPair = await generateSSHKeyPair(comment);
      const { publicPath } = writeKeyFiles(keyPair, 'test-comment');

      const fingerprint = runSshKeygen(`-l -f "${publicPath}"`);

      expect(fingerprint).toContain(comment);
    });

    test('handles empty comment', async () => {
      const keyPair = await generateSSHKeyPair('');
      const { privatePath, publicPath } = writeKeyFiles(
        keyPair,
        'test-empty-comment'
      );

      // Should still be valid keys
      const extractedPublic = runSshKeygen(`-y -f "${privatePath}"`);
      expect(extractedPublic).toBeTruthy();

      const fingerprint = runSshKeygen(`-l -f "${publicPath}"`);
      expect(fingerprint).toBeTruthy();
    });

    test('handles comment with spaces', async () => {
      const comment = 'user name with spaces';
      const keyPair = await generateSSHKeyPair(comment);
      const { publicPath } = writeKeyFiles(keyPair, 'test-space-comment');

      const fingerprint = runSshKeygen(`-l -f "${publicPath}"`);

      expect(fingerprint).toContain(comment);
    });

    test('handles comment with special characters', async () => {
      const comment = 'user+tag@host.example.com';
      const keyPair = await generateSSHKeyPair(comment);
      const { publicPath } = writeKeyFiles(keyPair, 'test-special-comment');

      // Key should still be valid
      const fingerprint = runSshKeygen(`-l -f "${publicPath}"`);
      expect(fingerprint).toBeTruthy();
    });
  });

  describe('key format details', () => {
    test('private key has proper line wrapping (70 chars)', async () => {
      const keyPair = await generateSSHKeyPair();

      // Extract the base64 lines (between header and footer)
      const lines = keyPair.privateKey.split('\n');
      const base64Lines = lines.slice(1, -2); // Skip header, footer, and trailing newline

      for (const line of base64Lines.slice(0, -1)) {
        // All lines except possibly the last should be 70 chars
        expect(line.length).toBe(70);
      }

      // Last base64 line should be <= 70 chars
      const lastLine = base64Lines[base64Lines.length - 1];
      expect(lastLine.length).toBeLessThanOrEqual(70);
    });

    test('private key ends with newline', async () => {
      const keyPair = await generateSSHKeyPair();
      expect(keyPair.privateKey.endsWith('\n')).toBe(true);
    });

    test('public key is single line', async () => {
      const keyPair = await generateSSHKeyPair('comment');
      const lines = keyPair.publicKey.split('\n').filter(l => l.length > 0);
      expect(lines.length).toBe(1);
    });
  });
});
