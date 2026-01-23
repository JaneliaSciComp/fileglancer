/**
 * Browser-side SSH Key Generation
 *
 * Generates OpenSSH-compatible key pairs using the Web Crypto API.
 * Supports Ed25519 (preferred) with RSA-4096 fallback for older browsers.
 *
 * Keys are generated entirely in the browser - nothing is sent to any server.
 */

/** Result of SSH key generation */
export type SSHKeyPair = {
  publicKey: string;
  privateKey: string;
  keyType: 'Ed25519' | 'RSA-4096';
};

// =============================================================================
// Ed25519 Key Generation
// =============================================================================

/**
 * Encodes a raw Ed25519 public key in OpenSSH format.
 */
function encodeOpenSSHPublicKeyEd25519(
  rawPublicKey: Uint8Array,
  comment: string
): string {
  const keyType = 'ssh-ed25519';
  const keyTypeBytes = new TextEncoder().encode(keyType);

  const buffer = new ArrayBuffer(
    4 + keyTypeBytes.length + 4 + rawPublicKey.length
  );
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  let offset = 0;
  view.setUint32(offset, keyTypeBytes.length, false);
  offset += 4;
  bytes.set(keyTypeBytes, offset);
  offset += keyTypeBytes.length;
  view.setUint32(offset, rawPublicKey.length, false);
  offset += 4;
  bytes.set(rawPublicKey, offset);

  const base64Key = btoa(String.fromCharCode(...bytes));
  return comment
    ? `${keyType} ${base64Key} ${comment}`
    : `${keyType} ${base64Key}`;
}

/**
 * Encodes Ed25519 key pair in OpenSSH private key format.
 */
function encodeOpenSSHPrivateKeyEd25519(
  rawPrivateKey: Uint8Array,
  rawPublicKey: Uint8Array,
  comment: string
): string {
  const keyType = 'ssh-ed25519';
  const keyTypeBytes = new TextEncoder().encode(keyType);
  const commentBytes = new TextEncoder().encode(comment);
  const authMagic = new TextEncoder().encode('openssh-key-v1\0');
  const cipherName = new TextEncoder().encode('none');
  const kdfName = new TextEncoder().encode('none');

  const checkInt = crypto.getRandomValues(new Uint32Array(1))[0];

  const privateKeyWithPublic = new Uint8Array(64);
  privateKeyWithPublic.set(rawPrivateKey, 0);
  privateKeyWithPublic.set(rawPublicKey, 32);

  const privateSectionLength =
    4 +
    4 +
    4 +
    keyTypeBytes.length +
    4 +
    rawPublicKey.length +
    4 +
    privateKeyWithPublic.length +
    4 +
    commentBytes.length;

  const paddingLength = (8 - (privateSectionLength % 8)) % 8;
  const paddedPrivateSectionLength = privateSectionLength + paddingLength;

  const privateSection = new Uint8Array(paddedPrivateSectionLength);
  const privateView = new DataView(privateSection.buffer);
  let pOffset = 0;

  privateView.setUint32(pOffset, checkInt, false);
  pOffset += 4;
  privateView.setUint32(pOffset, checkInt, false);
  pOffset += 4;
  privateView.setUint32(pOffset, keyTypeBytes.length, false);
  pOffset += 4;
  privateSection.set(keyTypeBytes, pOffset);
  pOffset += keyTypeBytes.length;
  privateView.setUint32(pOffset, rawPublicKey.length, false);
  pOffset += 4;
  privateSection.set(rawPublicKey, pOffset);
  pOffset += rawPublicKey.length;
  privateView.setUint32(pOffset, privateKeyWithPublic.length, false);
  pOffset += 4;
  privateSection.set(privateKeyWithPublic, pOffset);
  pOffset += privateKeyWithPublic.length;
  privateView.setUint32(pOffset, commentBytes.length, false);
  pOffset += 4;
  privateSection.set(commentBytes, pOffset);
  pOffset += commentBytes.length;

  for (let i = 0; i < paddingLength; i++) {
    privateSection[pOffset + i] = i + 1;
  }

  const publicSectionLength = 4 + keyTypeBytes.length + 4 + rawPublicKey.length;
  const publicSection = new Uint8Array(publicSectionLength);
  const publicView = new DataView(publicSection.buffer);
  let pubOffset = 0;

  publicView.setUint32(pubOffset, keyTypeBytes.length, false);
  pubOffset += 4;
  publicSection.set(keyTypeBytes, pubOffset);
  pubOffset += keyTypeBytes.length;
  publicView.setUint32(pubOffset, rawPublicKey.length, false);
  pubOffset += 4;
  publicSection.set(rawPublicKey, pubOffset);

  const totalLength =
    authMagic.length +
    4 +
    cipherName.length +
    4 +
    kdfName.length +
    4 +
    4 +
    4 +
    publicSectionLength +
    4 +
    paddedPrivateSectionLength;

  const fullKey = new Uint8Array(totalLength);
  const fullView = new DataView(fullKey.buffer);
  let fOffset = 0;

  fullKey.set(authMagic, fOffset);
  fOffset += authMagic.length;
  fullView.setUint32(fOffset, cipherName.length, false);
  fOffset += 4;
  fullKey.set(cipherName, fOffset);
  fOffset += cipherName.length;
  fullView.setUint32(fOffset, kdfName.length, false);
  fOffset += 4;
  fullKey.set(kdfName, fOffset);
  fOffset += kdfName.length;
  fullView.setUint32(fOffset, 0, false);
  fOffset += 4;
  fullView.setUint32(fOffset, 1, false);
  fOffset += 4;
  fullView.setUint32(fOffset, publicSectionLength, false);
  fOffset += 4;
  fullKey.set(publicSection, fOffset);
  fOffset += publicSectionLength;
  fullView.setUint32(fOffset, paddedPrivateSectionLength, false);
  fOffset += 4;
  fullKey.set(privateSection, fOffset);

  const base64 = btoa(String.fromCharCode(...fullKey));
  const wrapped = base64.match(/.{1,70}/g)!.join('\n');

  return `-----BEGIN OPENSSH PRIVATE KEY-----\n${wrapped}\n-----END OPENSSH PRIVATE KEY-----\n`;
}

/**
 * Generates an Ed25519 SSH key pair using the Web Crypto API.
 */
async function generateEd25519KeyPair(comment: string): Promise<SSHKeyPair> {
  const keyPair = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, [
    'sign',
    'verify'
  ]);

  const publicKeyRaw = await crypto.subtle.exportKey('raw', keyPair.publicKey);
  const publicKeyBytes = new Uint8Array(publicKeyRaw);

  const privateKeyPkcs8 = await crypto.subtle.exportKey(
    'pkcs8',
    keyPair.privateKey
  );
  const privateKeyPkcs8Bytes = new Uint8Array(privateKeyPkcs8);
  const rawPrivateKey = privateKeyPkcs8Bytes.slice(-32);

  return {
    publicKey: encodeOpenSSHPublicKeyEd25519(publicKeyBytes, comment),
    privateKey: encodeOpenSSHPrivateKeyEd25519(
      rawPrivateKey,
      publicKeyBytes,
      comment
    ),
    keyType: 'Ed25519'
  };
}

// =============================================================================
// RSA Key Generation (Fallback)
// =============================================================================

type RSAKeyComponents = {
  n: Uint8Array;
  e: Uint8Array;
  d: Uint8Array;
  p: Uint8Array;
  q: Uint8Array;
  dp: Uint8Array;
  dq: Uint8Array;
  qi: Uint8Array;
};

/**
 * Parses a DER-encoded integer from a byte array.
 */
function parseDerInteger(
  bytes: Uint8Array,
  offset: number
): { value: Uint8Array; nextOffset: number } {
  if (bytes[offset] !== 0x02) {
    throw new Error('Expected INTEGER');
  }
  offset++;

  let length = bytes[offset++];
  if (length & 0x80) {
    const numBytes = length & 0x7f;
    length = 0;
    for (let i = 0; i < numBytes; i++) {
      length = (length << 8) | bytes[offset++];
    }
  }

  const value = bytes.slice(offset, offset + length);
  return { value, nextOffset: offset + length };
}

/**
 * Parses RSA private key components from PKCS#8 format.
 */
function parseRSAPrivateKey(pkcs8Bytes: Uint8Array): RSAKeyComponents {
  let offset = 0;

  // Outer SEQUENCE
  if (pkcs8Bytes[offset++] !== 0x30) {
    throw new Error('Expected SEQUENCE');
  }
  let len = pkcs8Bytes[offset++];
  if (len & 0x80) {
    offset += len & 0x7f;
  }

  // Version INTEGER
  const version = parseDerInteger(pkcs8Bytes, offset);
  offset = version.nextOffset;

  // AlgorithmIdentifier SEQUENCE
  if (pkcs8Bytes[offset++] !== 0x30) {
    throw new Error('Expected SEQUENCE');
  }
  len = pkcs8Bytes[offset++];
  if (len & 0x80) {
    const numBytes = len & 0x7f;
    len = 0;
    for (let i = 0; i < numBytes; i++) {
      len = (len << 8) | pkcs8Bytes[offset++];
    }
  }
  offset += len;

  // OCTET STRING containing RSAPrivateKey
  if (pkcs8Bytes[offset++] !== 0x04) {
    throw new Error('Expected OCTET STRING');
  }
  len = pkcs8Bytes[offset++];
  if (len & 0x80) {
    const numBytes = len & 0x7f;
    len = 0;
    for (let i = 0; i < numBytes; i++) {
      len = (len << 8) | pkcs8Bytes[offset++];
    }
  }

  const rsaKeyBytes = pkcs8Bytes.slice(offset);
  offset = 0;

  if (rsaKeyBytes[offset++] !== 0x30) {
    throw new Error('Expected SEQUENCE');
  }
  len = rsaKeyBytes[offset++];
  if (len & 0x80) {
    offset += len & 0x7f;
  }

  const rsaVersion = parseDerInteger(rsaKeyBytes, offset);
  offset = rsaVersion.nextOffset;

  const n = parseDerInteger(rsaKeyBytes, offset);
  offset = n.nextOffset;

  const e = parseDerInteger(rsaKeyBytes, offset);
  offset = e.nextOffset;

  const d = parseDerInteger(rsaKeyBytes, offset);
  offset = d.nextOffset;

  const p = parseDerInteger(rsaKeyBytes, offset);
  offset = p.nextOffset;

  const q = parseDerInteger(rsaKeyBytes, offset);
  offset = q.nextOffset;

  const dp = parseDerInteger(rsaKeyBytes, offset);
  offset = dp.nextOffset;

  const dq = parseDerInteger(rsaKeyBytes, offset);
  offset = dq.nextOffset;

  const qi = parseDerInteger(rsaKeyBytes, offset);

  return {
    n: n.value,
    e: e.value,
    d: d.value,
    p: p.value,
    q: q.value,
    dp: dp.value,
    dq: dq.value,
    qi: qi.value
  };
}

/**
 * Encodes a string or Uint8Array as an SSH string (4-byte length prefix + data).
 */
function sshString(data: string | Uint8Array): Uint8Array {
  const bytes =
    typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const result = new Uint8Array(4 + bytes.length);
  const view = new DataView(result.buffer);
  view.setUint32(0, bytes.length, false);
  result.set(bytes, 4);
  return result;
}

/**
 * Encodes a byte array as an SSH multi-precision integer.
 */
function sshMpint(bytes: Uint8Array): Uint8Array {
  let start = 0;
  while (start < bytes.length - 1 && bytes[start] === 0) {
    start++;
  }
  bytes = bytes.slice(start);

  const needsPadding = bytes[0] & 0x80;
  const content = needsPadding ? new Uint8Array([0, ...bytes]) : bytes;

  const result = new Uint8Array(4 + content.length);
  const view = new DataView(result.buffer);
  view.setUint32(0, content.length, false);
  result.set(content, 4);
  return result;
}

/**
 * Encodes RSA public key in OpenSSH format.
 */
function encodeOpenSSHPublicKeyRSA(
  n: Uint8Array,
  e: Uint8Array,
  comment: string
): string {
  const keyType = 'ssh-rsa';

  const typeBytes = sshString(keyType);
  const eBytes = sshMpint(e);
  const nBytes = sshMpint(n);

  const blob = new Uint8Array(typeBytes.length + eBytes.length + nBytes.length);
  let offset = 0;
  blob.set(typeBytes, offset);
  offset += typeBytes.length;
  blob.set(eBytes, offset);
  offset += eBytes.length;
  blob.set(nBytes, offset);

  const base64Key = btoa(String.fromCharCode(...blob));
  return comment
    ? `${keyType} ${base64Key} ${comment}`
    : `${keyType} ${base64Key}`;
}

/**
 * Encodes RSA key pair in OpenSSH private key format.
 */
function encodeOpenSSHPrivateKeyRSA(
  rsaKey: RSAKeyComponents,
  comment: string
): string {
  const keyType = 'ssh-rsa';
  const authMagic = new TextEncoder().encode('openssh-key-v1\0');
  const cipherName = 'none';
  const kdfName = 'none';

  const checkInt = crypto.getRandomValues(new Uint32Array(1))[0];

  const pubTypeBytes = sshString(keyType);
  const pubEBytes = sshMpint(rsaKey.e);
  const pubNBytes = sshMpint(rsaKey.n);
  const publicBlob = new Uint8Array(
    pubTypeBytes.length + pubEBytes.length + pubNBytes.length
  );
  let pubOffset = 0;
  publicBlob.set(pubTypeBytes, pubOffset);
  pubOffset += pubTypeBytes.length;
  publicBlob.set(pubEBytes, pubOffset);
  pubOffset += pubEBytes.length;
  publicBlob.set(pubNBytes, pubOffset);

  const privTypeBytes = sshString(keyType);
  const privNBytes = sshMpint(rsaKey.n);
  const privEBytes = sshMpint(rsaKey.e);
  const privDBytes = sshMpint(rsaKey.d);
  const privQiBytes = sshMpint(rsaKey.qi);
  const privPBytes = sshMpint(rsaKey.p);
  const privQBytes = sshMpint(rsaKey.q);
  const privCommentBytes = sshString(comment);

  const privateSectionLength =
    4 +
    4 +
    privTypeBytes.length +
    privNBytes.length +
    privEBytes.length +
    privDBytes.length +
    privQiBytes.length +
    privPBytes.length +
    privQBytes.length +
    privCommentBytes.length;

  const paddingLength = (8 - (privateSectionLength % 8)) % 8;
  const paddedLength = privateSectionLength + paddingLength;

  const privateSection = new Uint8Array(paddedLength);
  const privateView = new DataView(privateSection.buffer);
  let pOffset = 0;

  privateView.setUint32(pOffset, checkInt, false);
  pOffset += 4;
  privateView.setUint32(pOffset, checkInt, false);
  pOffset += 4;
  privateSection.set(privTypeBytes, pOffset);
  pOffset += privTypeBytes.length;
  privateSection.set(privNBytes, pOffset);
  pOffset += privNBytes.length;
  privateSection.set(privEBytes, pOffset);
  pOffset += privEBytes.length;
  privateSection.set(privDBytes, pOffset);
  pOffset += privDBytes.length;
  privateSection.set(privQiBytes, pOffset);
  pOffset += privQiBytes.length;
  privateSection.set(privPBytes, pOffset);
  pOffset += privPBytes.length;
  privateSection.set(privQBytes, pOffset);
  pOffset += privQBytes.length;
  privateSection.set(privCommentBytes, pOffset);
  pOffset += privCommentBytes.length;

  for (let i = 0; i < paddingLength; i++) {
    privateSection[pOffset + i] = i + 1;
  }

  const cipherBytes = sshString(cipherName);
  const kdfBytes = sshString(kdfName);
  const kdfOptions = new Uint8Array([0, 0, 0, 0]);
  const numKeys = new Uint8Array(4);
  new DataView(numKeys.buffer).setUint32(0, 1, false);
  const publicBlobLen = new Uint8Array(4);
  new DataView(publicBlobLen.buffer).setUint32(0, publicBlob.length, false);
  const privateSectionLen = new Uint8Array(4);
  new DataView(privateSectionLen.buffer).setUint32(0, paddedLength, false);

  const totalLength =
    authMagic.length +
    cipherBytes.length +
    kdfBytes.length +
    kdfOptions.length +
    numKeys.length +
    publicBlobLen.length +
    publicBlob.length +
    privateSectionLen.length +
    privateSection.length;

  const fullKey = new Uint8Array(totalLength);
  let fOffset = 0;
  fullKey.set(authMagic, fOffset);
  fOffset += authMagic.length;
  fullKey.set(cipherBytes, fOffset);
  fOffset += cipherBytes.length;
  fullKey.set(kdfBytes, fOffset);
  fOffset += kdfBytes.length;
  fullKey.set(kdfOptions, fOffset);
  fOffset += kdfOptions.length;
  fullKey.set(numKeys, fOffset);
  fOffset += numKeys.length;
  fullKey.set(publicBlobLen, fOffset);
  fOffset += publicBlobLen.length;
  fullKey.set(publicBlob, fOffset);
  fOffset += publicBlob.length;
  fullKey.set(privateSectionLen, fOffset);
  fOffset += privateSectionLen.length;
  fullKey.set(privateSection, fOffset);

  const base64 = btoa(String.fromCharCode(...fullKey));
  const wrapped = base64.match(/.{1,70}/g)!.join('\n');

  return `-----BEGIN OPENSSH PRIVATE KEY-----\n${wrapped}\n-----END OPENSSH PRIVATE KEY-----\n`;
}

/**
 * Generates an RSA-4096 SSH key pair using the Web Crypto API.
 * Used as fallback when Ed25519 is not supported by the browser.
 */
async function generateRSAKeyPair(comment: string): Promise<SSHKeyPair> {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 4096,
      publicExponent: new Uint8Array([0x01, 0x00, 0x01]),
      hash: 'SHA-256'
    },
    true,
    ['sign', 'verify']
  );

  const privateKeyPkcs8 = await crypto.subtle.exportKey(
    'pkcs8',
    keyPair.privateKey
  );
  const rsaKey = parseRSAPrivateKey(new Uint8Array(privateKeyPkcs8));

  return {
    publicKey: encodeOpenSSHPublicKeyRSA(rsaKey.n, rsaKey.e, comment),
    privateKey: encodeOpenSSHPrivateKeyRSA(rsaKey, comment),
    keyType: 'RSA-4096'
  };
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Generates an SSH key pair in OpenSSH format.
 *
 * Uses Ed25519 when available (preferred), with RSA-4096 fallback for
 * browsers that don't support Ed25519.
 *
 * Keys are generated entirely in the browser using the Web Crypto API.
 * Nothing is sent to any server.
 *
 * @param comment - Optional comment to include in the key (e.g., "user@hostname")
 * @returns Promise resolving to the generated key pair
 *
 * @example
 * const keyPair = await generateSSHKeyPair('user@example.com');
 * console.log(keyPair.publicKey);  // ssh-ed25519 AAAA... user@example.com
 * console.log(keyPair.privateKey); // -----BEGIN OPENSSH PRIVATE KEY-----...
 * console.log(keyPair.keyType);    // 'Ed25519' or 'RSA-4096'
 */
export async function generateSSHKeyPair(comment = ''): Promise<SSHKeyPair> {
  try {
    return await generateEd25519KeyPair(comment);
  } catch (e) {
    if (e instanceof Error && e.name === 'NotSupportedError') {
      return await generateRSAKeyPair(comment);
    }
    throw e;
  }
}

/**
 * Checks if the browser supports Ed25519 key generation.
 *
 * @returns Promise resolving to true if Ed25519 is supported
 */
export async function supportsEd25519(): Promise<boolean> {
  try {
    await crypto.subtle.generateKey({ name: 'Ed25519' }, false, [
      'sign',
      'verify'
    ]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Returns the recommended key file name based on key type.
 *
 * @param keyType - The type of SSH key
 * @returns The recommended file name (e.g., 'id_ed25519' or 'id_rsa')
 */
export function getKeyFileName(keyType: SSHKeyPair['keyType']): string {
  return keyType === 'Ed25519' ? 'id_ed25519' : 'id_rsa';
}
