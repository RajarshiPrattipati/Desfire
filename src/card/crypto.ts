/**
 * Cryptographic Operations for DESFire
 * Implements AES-128 CMAC, session key derivation, and encryption for DESFire EV2/EV3
 */

import crypto from 'crypto';

/**
 * Generate subkeys for AES-CMAC
 */
function generateCMACSubkeys(key: Buffer): { k1: Buffer; k2: Buffer } {
  const rb = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x87]);

  // Encrypt zero block
  const cipher = crypto.createCipheriv('aes-128-ecb', key, Buffer.alloc(0));
  cipher.setAutoPadding(false);
  const l = cipher.update(Buffer.alloc(16, 0x00));

  // Generate K1
  const k1 = Buffer.alloc(16);
  let carry = 0;
  for (let i = 15; i >= 0; i--) {
    const b = l[i];
    k1[i] = ((b << 1) | carry) & 0xFF;
    carry = (b & 0x80) ? 1 : 0;
  }

  if (l[0] & 0x80) {
    for (let i = 0; i < 16; i++) {
      k1[i] ^= rb[i];
    }
  }

  // Generate K2
  const k2 = Buffer.alloc(16);
  carry = 0;
  for (let i = 15; i >= 0; i--) {
    const b = k1[i];
    k2[i] = ((b << 1) | carry) & 0xFF;
    carry = (b & 0x80) ? 1 : 0;
  }

  if (k1[0] & 0x80) {
    for (let i = 0; i < 16; i++) {
      k2[i] ^= rb[i];
    }
  }

  return { k1, k2 };
}

/**
 * Calculate AES-CMAC (Cipher-based Message Authentication Code)
 * Used for DESFire authentication and secure messaging
 */
export function aesCMAC(key: Buffer, data: Buffer, length?: number): Buffer {
  if (key.length !== 16) {
    throw new Error('Key must be 16 bytes for AES-128');
  }

  const { k1, k2 } = generateCMACSubkeys(key);

  // Determine output length (full 16 bytes or truncated)
  const outputLength = length || 16;

  // Pad data if necessary
  let paddedData: Buffer;
  const blockSize = 16;
  const numBlocks = Math.ceil(data.length / blockSize);

  if (data.length === 0 || data.length % blockSize !== 0) {
    // Incomplete block - use padding
    paddedData = Buffer.alloc(numBlocks * blockSize, 0x00);
    data.copy(paddedData);
    if (data.length < paddedData.length) {
      paddedData[data.length] = 0x80; // Padding bit
    }

    // XOR last block with K2
    for (let i = 0; i < 16; i++) {
      paddedData[paddedData.length - 16 + i] ^= k2[i];
    }
  } else {
    // Complete blocks - XOR last block with K1
    paddedData = Buffer.from(data);
    for (let i = 0; i < 16; i++) {
      paddedData[paddedData.length - 16 + i] ^= k1[i];
    }
  }

  // CBC-MAC calculation
  const cipher = crypto.createCipheriv('aes-128-ecb', key, Buffer.alloc(0));
  cipher.setAutoPadding(false);

  let mac = Buffer.alloc(16, 0x00);

  for (let i = 0; i < paddedData.length; i += 16) {
    const block = paddedData.slice(i, i + 16);

    // XOR with previous MAC
    for (let j = 0; j < 16; j++) {
      mac[j] ^= block[j];
    }

    // Encrypt
    const encrypted = cipher.update(mac);
    encrypted.copy(mac);
  }

  return mac.slice(0, outputLength);
}

/**
 * Derive session encryption key for DESFire EV2
 */
export function deriveSessionKeyEV2Enc(key: Buffer, rndA: Buffer, rndB: Buffer): Buffer {
  // SV1 = 0xA5 || 0x5A || 0x00 || 0x01 || 0x00 || 0x80 || RndA[0..1] || RndB[0..1] || RndA[13..15] || RndB[13..15]
  const sv1 = Buffer.concat([
    Buffer.from([0xA5, 0x5A, 0x00, 0x01, 0x00, 0x80]),
    rndA.slice(0, 2),
    rndB.slice(0, 2),
    rndA.slice(13, 16),
    rndB.slice(13, 16)
  ]);

  return aesCMAC(key, sv1, 16);
}

/**
 * Derive session MAC key for DESFire EV2
 */
export function deriveSessionKeyEV2Mac(key: Buffer, rndA: Buffer, rndB: Buffer): Buffer {
  // SV2 = 0x5A || 0xA5 || 0x00 || 0x01 || 0x00 || 0x80 || RndA[0..1] || RndB[0..1] || RndA[13..15] || RndB[13..15]
  const sv2 = Buffer.concat([
    Buffer.from([0x5A, 0xA5, 0x00, 0x01, 0x00, 0x80]),
    rndA.slice(0, 2),
    rndB.slice(0, 2),
    rndA.slice(13, 16),
    rndB.slice(13, 16)
  ]);

  return aesCMAC(key, sv2, 16);
}

/**
 * Derive session encryption key for legacy AES authentication
 */
export function deriveSessionKeyAESEnc(key: Buffer, rndA: Buffer, rndB: Buffer): Buffer {
  // KSesAuthENC = RndA[0..3] || RndB[0..3] || RndA[12..15] || RndB[12..15]
  return Buffer.concat([
    rndA.slice(0, 4),
    rndB.slice(0, 4),
    rndA.slice(12, 16),
    rndB.slice(12, 16)
  ]);
}

/**
 * Derive session MAC key for legacy AES authentication
 */
export function deriveSessionKeyAESMac(key: Buffer, rndA: Buffer, rndB: Buffer): Buffer {
  // KSesAuthMAC = RndA[4..7] || RndB[4..7] || RndA[8..11] || RndB[8..11]
  return Buffer.concat([
    rndA.slice(4, 8),
    rndB.slice(4, 8),
    rndA.slice(8, 12),
    rndB.slice(8, 12)
  ]);
}

/**
 * Encrypt data with AES-128 in CBC mode
 */
export function aesEncrypt(key: Buffer, data: Buffer, iv: Buffer = Buffer.alloc(16, 0x00)): Buffer {
  const cipher = crypto.createCipheriv('aes-128-cbc', key, iv);
  cipher.setAutoPadding(false);
  return Buffer.concat([cipher.update(data), cipher.final()]);
}

/**
 * Decrypt data with AES-128 in CBC mode
 */
export function aesDecrypt(key: Buffer, data: Buffer, iv: Buffer = Buffer.alloc(16, 0x00)): Buffer {
  const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
  decipher.setAutoPadding(false);
  return Buffer.concat([decipher.update(data), decipher.final()]);
}

/**
 * Calculate CRC32 for DESFire
 */
export function crc32(data: Buffer): number {
  const polynomial = 0xEDB88320;
  let crc = 0xFFFFFFFF;

  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc & 1) ? (crc >>> 1) ^ polynomial : crc >>> 1;
    }
  }

  return (~crc) >>> 0;
}

/**
 * Calculate CRC32 and return as 4-byte buffer (little-endian)
 */
export function crc32Buffer(data: Buffer): Buffer {
  const crc = crc32(data);
  const buffer = Buffer.allocUnsafe(4);
  buffer.writeUInt32LE(crc, 0);
  return buffer;
}

/**
 * Calculate CRC16 for DESFire (ISO 14443-3 Type A)
 */
export function crc16(data: Buffer): number {
  const polynomial = 0x8408;
  let crc = 0x6363;

  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc & 1) ? (crc >>> 1) ^ polynomial : crc >>> 1;
    }
  }

  return crc & 0xFFFF;
}

/**
 * Calculate CRC16 and return as 2-byte buffer (little-endian)
 */
export function crc16Buffer(data: Buffer): Buffer {
  const crc = crc16(data);
  const buffer = Buffer.allocUnsafe(2);
  buffer.writeUInt16LE(crc, 0);
  return buffer;
}

/**
 * XOR two buffers of equal length
 */
export function xorBuffers(a: Buffer, b: Buffer): Buffer {
  if (a.length !== b.length) {
    throw new Error('Buffers must be of equal length');
  }
  const result = Buffer.alloc(a.length);
  for (let i = 0; i < a.length; i++) {
    result[i] = a[i] ^ b[i];
  }
  return result;
}

/**
 * Rotate buffer left by 1 byte (for DESFire authentication)
 */
export function rotateLeft(buffer: Buffer, bytes: number = 1): Buffer {
  const result = Buffer.alloc(buffer.length);
  for (let i = 0; i < buffer.length; i++) {
    result[i] = buffer[(i + bytes) % buffer.length];
  }
  return result;
}

/**
 * Generate random bytes (for challenges)
 */
export function generateRandom(length: number): Buffer {
  return crypto.randomBytes(length);
}

/**
 * Pad data to block size (ISO/IEC 9797-1 Method 2)
 */
export function padData(data: Buffer, blockSize: number = 16): Buffer {
  const paddingLength = blockSize - (data.length % blockSize);
  const padding = Buffer.alloc(paddingLength);
  padding[0] = 0x80; // First padding byte is 0x80
  // Rest are 0x00 (already set by Buffer.alloc)
  return Buffer.concat([data, padding]);
}

/**
 * Remove padding from data
 */
export function unpadData(data: Buffer): Buffer {
  // Find last 0x80 byte
  for (let i = data.length - 1; i >= 0; i--) {
    if (data[i] === 0x80) {
      return data.slice(0, i);
    }
    if (data[i] !== 0x00) {
      // No valid padding found
      return data;
    }
  }
  return data;
}

export default {
  aesCMAC,
  deriveSessionKeyEV2Enc,
  deriveSessionKeyEV2Mac,
  deriveSessionKeyAESEnc,
  deriveSessionKeyAESMac,
  aesEncrypt,
  aesDecrypt,
  crc32,
  crc32Buffer,
  crc16,
  crc16Buffer,
  xorBuffers,
  rotateLeft,
  generateRandom,
  padData,
  unpadData
};
