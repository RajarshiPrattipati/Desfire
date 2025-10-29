/**
 * Key Management Module
 * Handles AES-128 key generation, storage, and retrieval for DESFire cards
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export type KeyType = 'AES' | 'DES' | '3DES';

export interface KeySet {
  appId: number;
  keyType: KeyType;
  keys: Map<number, Buffer>; // Key number -> Key data (16 bytes for AES-128)
  keyVersions: Map<number, number>; // Key number -> Version
}

export class KeyManager {
  private keySets: Map<number, KeySet> = new Map(); // AppId -> KeySet
  private masterKey: Buffer | null = null;
  private keyStorePath: string;

  constructor(keyStorePath: string = './keys') {
    this.keyStorePath = keyStorePath;
    this.ensureKeyDirectory();
  }

  /**
   * Ensure key storage directory exists
   */
  private ensureKeyDirectory(): void {
    if (!fs.existsSync(this.keyStorePath)) {
      fs.mkdirSync(this.keyStorePath, { recursive: true });
      console.log(`Created key storage directory: ${this.keyStorePath}`);
    }
  }

  /**
   * Generate a random key for the given type
   * AES: 16 bytes, DES (2-key 3DES): 16 bytes, 3DES (3-key): 24 bytes
   */
  generateKey(type: KeyType = 'AES'): Buffer {
    const len = type === '3DES' ? 24 : 16;
    return crypto.randomBytes(len);
  }

  /**
   * Generate a complete key set for an application (K0-K4)
   */
  generateKeySet(appId: number, numKeys: number = 5, keyType: KeyType = 'AES'): KeySet {
    const keySet: KeySet = {
      appId,
      keyType,
      keys: new Map(),
      keyVersions: new Map()
    };

    for (let i = 0; i < numKeys; i++) {
      keySet.keys.set(i, this.generateKey(keyType));
      keySet.keyVersions.set(i, 0); // Initial version is 0
    }

    this.keySets.set(appId, keySet);
    console.log(`Generated ${numKeys} keys for application 0x${appId.toString(16).padStart(6, '0')}`);

    return keySet;
  }

  /**
   * Get factory default key (16 bytes of zeros)
   * Used for initial authentication before changing keys
   */
  getDefaultKey(): Buffer {
    return Buffer.alloc(16, 0x00);
  }

  /**
   * Get a specific key from a key set
   */
  getKey(appId: number, keyNo: number): Buffer {
    const keySet = this.keySets.get(appId);
    if (!keySet) {
      throw new Error(`Key set not found for application 0x${appId.toString(16).padStart(6, '0')}`);
    }

    const key = keySet.keys.get(keyNo);
    if (!key) {
      throw new Error(`Key ${keyNo} not found in application 0x${appId.toString(16).padStart(6, '0')}`);
    }

    return key;
  }

  /**
   * Set a specific key in a key set
   */
  setKey(appId: number, keyNo: number, key: Buffer, version: number = 0, keyType?: KeyType): void {
    let keySet = this.keySets.get(appId);
    if (!keySet) {
      keySet = {
        appId,
        keyType: keyType || 'AES',
        keys: new Map(),
        keyVersions: new Map()
      };
      this.keySets.set(appId, keySet);
    }

    const type = keyType || keySet.keyType || 'AES';
    const expectedLen = type === '3DES' ? 24 : 16;
    if (key.length !== expectedLen) {
      throw new Error(`${type} key must be exactly ${expectedLen} bytes`);
    }

    keySet.keys.set(keyNo, key);
    keySet.keyVersions.set(keyNo, version);
    keySet.keyType = type;
  }

  /**
   * Get key version
   */
  getKeyVersion(appId: number, keyNo: number): number {
    const keySet = this.keySets.get(appId);
    if (!keySet) {
      throw new Error(`Key set not found for application 0x${appId.toString(16).padStart(6, '0')}`);
    }

    return keySet.keyVersions.get(keyNo) || 0;
  }

  /**
   * Set master encryption key for key storage encryption
   */
  setMasterKey(masterKey: Buffer | string): void {
    if (typeof masterKey === 'string') {
      // Derive key from password
      this.masterKey = crypto.pbkdf2Sync(masterKey, 'desfire-salt', 100000, 32, 'sha256');
    } else {
      this.masterKey = masterKey;
    }
  }

  /**
   * Encrypt key data for storage
   */
  private encryptKeyData(data: Buffer): { encrypted: Buffer; iv: Buffer; authTag: Buffer } {
    if (!this.masterKey) {
      throw new Error('Master key not set. Call setMasterKey() first.');
    }

    const iv = crypto.randomBytes(12); // 12 bytes for GCM
    const cipher = crypto.createCipheriv('aes-256-gcm', this.masterKey, iv);

    const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return { encrypted, iv, authTag };
  }

  /**
   * Decrypt key data from storage
   */
  private decryptKeyData(encrypted: Buffer, iv: Buffer, authTag: Buffer): Buffer {
    if (!this.masterKey) {
      throw new Error('Master key not set. Call setMasterKey() first.');
    }

    const decipher = crypto.createDecipheriv('aes-256-gcm', this.masterKey, iv);
    decipher.setAuthTag(authTag);

    return Buffer.concat([decipher.update(encrypted), decipher.final()]);
  }

  /**
   * Save key set to encrypted file
   */
  saveKeySet(appId: number): void {
    const keySet = this.keySets.get(appId);
    if (!keySet) {
      throw new Error(`Key set not found for application 0x${appId.toString(16).padStart(6, '0')}`);
    }

    // Serialize key set
    const keyData: any = {
      appId,
      keyType: keySet.keyType,
      keys: {},
      keyVersions: {}
    };

    keySet.keys.forEach((key, keyNo) => {
      keyData.keys[keyNo] = key.toString('hex');
    });

    keySet.keyVersions.forEach((version, keyNo) => {
      keyData.keyVersions[keyNo] = version;
    });

    const serialized = Buffer.from(JSON.stringify(keyData, null, 2));

    // Encrypt
    const { encrypted, iv, authTag } = this.encryptKeyData(serialized);

    // Save to file
    const filename = path.join(this.keyStorePath, `app_${appId.toString(16).padStart(6, '0')}.key`);
    const fileData = {
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
      encrypted: encrypted.toString('hex')
    };

    fs.writeFileSync(filename, JSON.stringify(fileData, null, 2));
    console.log(`Key set saved to ${filename}`);
  }

  /**
   * Load key set from encrypted file
   */
  loadKeySet(appId: number): KeySet {
    const filename = path.join(this.keyStorePath, `app_${appId.toString(16).padStart(6, '0')}.key`);

    if (!fs.existsSync(filename)) {
      throw new Error(`Key file not found: ${filename}`);
    }

    // Read encrypted file
    const fileData = JSON.parse(fs.readFileSync(filename, 'utf8'));
    const iv = Buffer.from(fileData.iv, 'hex');
    const authTag = Buffer.from(fileData.authTag, 'hex');
    const encrypted = Buffer.from(fileData.encrypted, 'hex');

    // Decrypt
    const decrypted = this.decryptKeyData(encrypted, iv, authTag);
    const keyData = JSON.parse(decrypted.toString());

    // Reconstruct key set
    const keySet: KeySet = {
      appId: keyData.appId,
      keyType: (keyData.keyType as KeyType) || 'AES',
      keys: new Map(),
      keyVersions: new Map()
    };

    Object.entries(keyData.keys).forEach(([keyNo, hexKey]) => {
      keySet.keys.set(parseInt(keyNo), Buffer.from(hexKey as string, 'hex'));
    });

    Object.entries(keyData.keyVersions).forEach(([keyNo, version]) => {
      keySet.keyVersions.set(parseInt(keyNo), version as number);
    });

    this.keySets.set(appId, keySet);
    console.log(`Key set loaded from ${filename}`);

    return keySet;
  }

  /**
   * Export key set as plain JSON (for backup - KEEP SECURE!)
   */
  exportKeySetPlain(appId: number): string {
    const keySet = this.keySets.get(appId);
    if (!keySet) {
      throw new Error(`Key set not found for application 0x${appId.toString(16).padStart(6, '0')}`);
    }

    const exportData: any = {
      appId: `0x${appId.toString(16).padStart(6, '0')}`,
      keyType: keySet.keyType,
      keys: {}
    };

    keySet.keys.forEach((key, keyNo) => {
      exportData.keys[`K${keyNo}`] = {
        hex: key.toString('hex'),
        version: keySet.keyVersions.get(keyNo) || 0
      };
    });

    return JSON.stringify(exportData, null, 2);
  }

  /**
   * List all loaded key sets
   */
  listKeySets(): number[] {
    return Array.from(this.keySets.keys());
  }

  /**
   * Clear all keys from memory (security)
   */
  clearKeys(): void {
    this.keySets.forEach(keySet => {
      keySet.keys.forEach(key => key.fill(0)); // Zero out key data
      keySet.keys.clear();
      keySet.keyVersions.clear();
    });
    this.keySets.clear();

    if (this.masterKey) {
      this.masterKey.fill(0);
      this.masterKey = null;
    }

    console.log('All keys cleared from memory');
  }
}

export default KeyManager;
