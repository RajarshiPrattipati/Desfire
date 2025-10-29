# DESFire Card System - API Documentation

Complete API reference for the DESFire Card Management System.

## Table of Contents

1. [KeyManager](#keymanager)
2. [DESFireCard](#desfirecard)
   - [Authentication](#authentication-methods)
   - [Key Management](#key-management-methods)
   - [Application Management](#application-management)
   - [File Operations](#file-operations)
   - [Value File Operations](#value-file-operations)
3. [Crypto Utilities](#crypto-utilities)
4. [NFC Reader](#nfc-reader)
5. [APDU](#apdu)
6. [Types & Enums](#types--enums)

---

# KeyManager

Key generation, storage, and management for DESFire applications.

## Constructor

```typescript
new KeyManager(keyStorePath?: string)
```

**Parameters:**
- `keyStorePath` (optional): Directory for encrypted key storage. Default: `'./keys'`

**Example:**
```typescript
import KeyManager from './card/keyManager';

const keyManager = new KeyManager('./keys');
keyManager.setMasterKey(process.env.KEY_MASTER_PASSWORD);
```

---

## Methods

### generateKey()

Generate a single random AES-128 key.

```typescript
generateKey(): Buffer
```

**Returns:** 16-byte Buffer containing random key

**Example:**
```typescript
const key = keyManager.generateKey();
console.log(key.toString('hex')); // e.g., "3f7e8a9c2b4c6d8e..."
```

---

### generateKeySet()

Generate a complete set of keys for an application.

```typescript
generateKeySet(appId: number, numKeys: number = 5): KeySet
```

**Parameters:**
- `appId`: Application ID (e.g., `0x000001`)
- `numKeys`: Number of keys to generate (default: 5)

**Returns:** KeySet object with keys and versions

**Example:**
```typescript
const keySet = keyManager.generateKeySet(0x000001, 5);
// Creates K0, K1, K2, K3, K4 for application 0x000001
```

---

### getDefaultKey()

Get factory default key (16 bytes of zeros).

```typescript
getDefaultKey(): Buffer
```

**Returns:** 16-byte Buffer of zeros

**Example:**
```typescript
const defaultKey = keyManager.getDefaultKey();
// Used for initial authentication before changing keys
```

---

### getKey()

Retrieve a specific key from a key set.

```typescript
getKey(appId: number, keyNo: number): Buffer
```

**Parameters:**
- `appId`: Application ID
- `keyNo`: Key number (0-13)

**Returns:** 16-byte AES-128 key

**Throws:** Error if key set or key not found

**Example:**
```typescript
const masterKey = keyManager.getKey(0x000001, 0);
const readKey = keyManager.getKey(0x000001, 1);
```

---

### setKey()

Set a specific key in a key set.

```typescript
setKey(appId: number, keyNo: number, key: Buffer, version: number = 0): void
```

**Parameters:**
- `appId`: Application ID
- `keyNo`: Key number (0-13)
- `key`: 16-byte AES-128 key
- `version`: Key version (default: 0)

**Throws:** Error if key is not 16 bytes

**Example:**
```typescript
const newKey = Buffer.from('0102030405060708090a0b0c0d0e0f10', 'hex');
keyManager.setKey(0x000001, 0, newKey, 1);
```

---

### getKeyVersion()

Get version number of a specific key.

```typescript
getKeyVersion(appId: number, keyNo: number): number
```

**Parameters:**
- `appId`: Application ID
- `keyNo`: Key number (0-13)

**Returns:** Key version number

**Example:**
```typescript
const version = keyManager.getKeyVersion(0x000001, 0);
console.log('Key version:', version); // 0 = factory default
```

---

### setMasterKey()

Set master encryption key for key storage.

```typescript
setMasterKey(masterKey: Buffer | string): void
```

**Parameters:**
- `masterKey`: Master key as Buffer or password string

**Example:**
```typescript
// From password (derives key using PBKDF2)
keyManager.setMasterKey('my-secure-password');

// From Buffer
const masterKey = crypto.randomBytes(32);
keyManager.setMasterKey(masterKey);

// Production: use environment variable
keyManager.setMasterKey(process.env.KEY_MASTER_PASSWORD!);
```

---

### saveKeySet()

Save key set to encrypted file.

```typescript
saveKeySet(appId: number): void
```

**Parameters:**
- `appId`: Application ID

**Throws:** Error if master key not set or key set not found

**Output:** Creates encrypted file: `keys/app_<appId>.key`

**Example:**
```typescript
keyManager.saveKeySet(0x000001);
// Creates: keys/app_000001.key
```

---

### loadKeySet()

Load key set from encrypted file.

```typescript
loadKeySet(appId: number): KeySet
```

**Parameters:**
- `appId`: Application ID

**Returns:** Loaded KeySet

**Throws:** Error if file not found or decryption fails

**Example:**
```typescript
const keySet = keyManager.loadKeySet(0x000001);
console.log('Loaded', keySet.keys.size, 'keys');
```

---

### exportKeySetPlain()

Export key set as plain JSON for backup.

```typescript
exportKeySetPlain(appId: number): string
```

**Parameters:**
- `appId`: Application ID

**Returns:** JSON string with keys in hex format

**⚠️ WARNING:** Output contains plaintext keys. Store securely!

**Example:**
```typescript
const backup = keyManager.exportKeySetPlain(0x000001);
fs.writeFileSync('/secure/backup/keys.json', backup);
```

**Output format:**
```json
{
  "appId": "0x000001",
  "keys": {
    "K0": {
      "hex": "3f7e8a9c2b4c6d8e...",
      "version": 1
    },
    "K1": { ... }
  }
}
```

---

### listKeySets()

List all loaded key sets.

```typescript
listKeySets(): number[]
```

**Returns:** Array of application IDs

**Example:**
```typescript
const apps = keyManager.listKeySets();
console.log('Loaded apps:', apps.map(a => '0x' + a.toString(16)));
```

---

### clearKeys()

Clear all keys from memory (security).

```typescript
clearKeys(): void
```

**Example:**
```typescript
try {
  // Use keys...
} finally {
  keyManager.clearKeys(); // Secure cleanup
}
```

---

# DESFireCard

Main class for DESFire card operations.

## Constructor

```typescript
new DESFireCard(reader: any, keyManager?: KeyManager)
```

**Parameters:**
- `reader`: NFC reader instance
- `keyManager` (optional): KeyManager for authentication

**Example:**
```typescript
import DESFireCard from './card/desfire';

const desfireCard = new DESFireCard(reader, keyManager);
```

---

## Authentication Methods

### authenticateAES()

Authenticate using AES-128 (legacy method, works on EV1/EV2/EV3).

```typescript
async authenticateAES(keyNo: number, key?: Buffer): Promise<void>
```

**Parameters:**
- `keyNo`: Key number (0-13)
- `key` (optional): 16-byte AES key. If not provided, uses KeyManager

**Throws:** Error if authentication fails

**Example:**
```typescript
await desfireCard.selectApplication(0x000001);

// With explicit key
const key = Buffer.from('00000000000000000000000000000000', 'hex');
await desfireCard.authenticateAES(0, key);

// With KeyManager
await desfireCard.authenticateAES(0);
```

**Protocol:**
1. Send Authenticate command
2. Receive encrypted RndB
3. Decrypt RndB
4. Generate RndA
5. Send encrypted RndA + RndB'
6. Verify RndA'
7. Derive session keys

---

### authenticateEV2First()

Authenticate using EV2 First method (recommended for EV2/EV3).

```typescript
async authenticateEV2First(keyNo: number, key?: Buffer): Promise<void>
```

**Parameters:**
- `keyNo`: Key number (0-13)
- `key` (optional): 16-byte AES key

**Throws:** Error if authentication fails

**Example:**
```typescript
await desfireCard.selectApplication(0x000001);
await desfireCard.authenticateEV2First(0);
```

**Features:**
- Transaction Identifier (TI) for session tracking
- CMAC-based session keys
- Enhanced security

---

### authenticateEV2NonFirst()

Authenticate with additional key after EV2 First.

```typescript
async authenticateEV2NonFirst(keyNo: number, key?: Buffer): Promise<void>
```

**Parameters:**
- `keyNo`: Key number (0-13)
- `key` (optional): 16-byte AES key

**Requires:** Previous EV2 First authentication

**Example:**
```typescript
// First authentication
await desfireCard.authenticateEV2First(0, masterKey);

// Additional authentication
await desfireCard.authenticateEV2NonFirst(1, readKey);
```

---

### isAuthenticated()

Check if currently authenticated.

```typescript
isAuthenticated(): boolean
```

**Returns:** true if authenticated, false otherwise

**Example:**
```typescript
if (desfireCard.isAuthenticated()) {
  console.log('Authenticated with key', desfireCard.getAuthenticatedKeyNo());
}
```

---

### getAuthenticatedKeyNo()

Get the key number used for authentication.

```typescript
getAuthenticatedKeyNo(): number | null
```

**Returns:** Key number or null if not authenticated

---

### resetAuth()

Reset authentication state.

```typescript
resetAuth(): void
```

**Example:**
```typescript
try {
  await desfireCard.authenticateAES(0, key);
  // Perform operations...
} finally {
  desfireCard.resetAuth(); // Clean up
}
```

---

## Key Management Methods

### getKeySettings()

Get key settings for current application.

```typescript
async getKeySettings(): Promise<{
  settings: number;
  maxKeys: number;
  keyType: number;
}>
```

**Returns:** Object with key settings information

**Example:**
```typescript
const settings = await desfireCard.getKeySettings();
console.log('Settings:', settings.settings.toString(16));
console.log('Max keys:', settings.maxKeys);
console.log('Key type:', settings.keyType.toString(16));
```

**Key Settings Byte:**
- Bit 7: Configuration changeable
- Bit 6: CreateApplication without master key
- Bit 5: File directory list access
- Bit 4: Master key changeable
- Bits 3-0: Key change rights

---

### changeKeySettings()

Change key settings for current application.

```typescript
async changeKeySettings(newSettings: number): Promise<void>
```

**Parameters:**
- `newSettings`: New settings byte

**Requires:** Authentication with ChangeConfig key or Master key

**Example:**
```typescript
await desfireCard.authenticateAES(0, masterKey);
await desfireCard.changeKeySettings(0x0F); // All keys changeable
```

---

### getKeyVersion()

Get version of a specific key.

```typescript
async getKeyVersion(keyNo: number): Promise<number>
```

**Parameters:**
- `keyNo`: Key number (0-13)

**Returns:** Key version (0 = factory default)

**Example:**
```typescript
for (let i = 0; i < 5; i++) {
  const version = await desfireCard.getKeyVersion(i);
  console.log(`K${i} version: ${version}`);
}
```

---

### changeKey()

Change a key (legacy method - use with caution).

```typescript
async changeKey(keyNo: number, newKey: Buffer, oldKey?: Buffer): Promise<void>
```

**Parameters:**
- `keyNo`: Key number to change (0-13)
- `newKey`: New 16-byte AES key
- `oldKey` (optional): Old key

**Requires:** Authentication with Master key

**⚠️ WARNING:** This method may send keys in plaintext. Use `changeKeyEV2()` instead.

**Example:**
```typescript
await desfireCard.authenticateAES(0, oldMasterKey);
await desfireCard.changeKey(0, newMasterKey);
```

---

### changeKeyEV2()

Change a key using secure EV2 method.

```typescript
async changeKeyEV2(keyNo: number, newKey: Buffer, newKeyVersion: number = 0): Promise<void>
```

**Parameters:**
- `keyNo`: Key number (0-13)
- `newKey`: New 16-byte AES key
- `newKeyVersion`: Version for new key (default: 0)

**Requires:** EV2 authentication

**Example:**
```typescript
await desfireCard.authenticateEV2First(0, oldKey);
await desfireCard.changeKeyEV2(0, newKey, 1);

// Re-authenticate with new key
await desfireCard.authenticateEV2First(0, newKey);
```

---

### initializeKeySet()

Initialize key set for rollover.

```typescript
async initializeKeySet(keySetNo: number, keyType: number = 0x80): Promise<void>
```

**Parameters:**
- `keySetNo`: Key set number
- `keyType`: Key type (0x80 = AES)

**Requires:** Authentication

**Example:**
```typescript
await desfireCard.initializeKeySet(1); // Prepare key set 1
```

---

### rollKeySet()

Activate a new key set (atomic switch).

```typescript
async rollKeySet(keySetNo: number): Promise<void>
```

**Parameters:**
- `keySetNo`: Key set number to activate

**Example:**
```typescript
await desfireCard.rollKeySet(1); // Switch to key set 1
```

---

### finalizeKeySet()

Complete key set rollover (remove old keys).

```typescript
async finalizeKeySet(): Promise<void>
```

**Example:**
```typescript
await desfireCard.finalizeKeySet(); // Make rollover permanent
```

---

## Application Management

### getVersion()

Get card version information.

```typescript
async getVersion(): Promise<{
  hardware: Buffer;
  software: Buffer;
  uid: Buffer;
}>
```

**Returns:** Object with hardware, software, and UID buffers

**Example:**
```typescript
const version = await desfireCard.getVersion();
console.log('Hardware:', version.hardware.toString('hex'));
console.log('Software:', version.software.toString('hex'));
console.log('UID:', version.uid.toString('hex'));
```

---

### getApplicationIDs()

Get list of application IDs on card.

```typescript
async getApplicationIDs(): Promise<number[]>
```

**Returns:** Array of application IDs

**Example:**
```typescript
const apps = await desfireCard.getApplicationIDs();
apps.forEach(aid => {
  console.log('App:', '0x' + aid.toString(16).padStart(6, '0'));
});
```

---

### createApplication()

Create a new application.

```typescript
async createApplication(
  aid: number,
  keySetting: number,
  numKeys: number,
  keyType: number = 0x80
): Promise<void>
```

**Parameters:**
- `aid`: Application ID (3 bytes)
- `keySetting`: Key settings byte
- `numKeys`: Number of keys (1-14)
- `keyType`: Key type (0x80 = AES)

**Example:**
```typescript
await desfireCard.createApplication(
  0x000001,              // Application ID
  0x0F,                  // Key settings
  5,                     // 5 keys (K0-K4)
  0x80                   // AES keys
);
```

---

### selectApplication()

Select an application for operations.

```typescript
async selectApplication(aid: number): Promise<void>
```

**Parameters:**
- `aid`: Application ID (0x000000 for PICC level)

**Example:**
```typescript
await desfireCard.selectApplication(0x000001);
// Now in application context
```

---

### deleteApplication()

Delete an application.

```typescript
async deleteApplication(aid: number): Promise<void>
```

**Parameters:**
- `aid`: Application ID

**⚠️ WARNING:** Deletes all files in application

**Example:**
```typescript
await desfireCard.deleteApplication(0x000001);
```

---

### formatPICC()

Format card (erase all applications).

```typescript
async formatPICC(): Promise<void>
```

**⚠️ WARNING:** Erases all data on card

**Requires:** Authentication with PICC Master Key

**Example:**
```typescript
await desfireCard.selectApplication(0x000000); // PICC level
await desfireCard.authenticateAES(0, piccMasterKey);
await desfireCard.formatPICC();
```

---

## File Operations

### getFileIDs()

Get list of file IDs in current application.

```typescript
async getFileIDs(): Promise<number[]>
```

**Returns:** Array of file IDs

**Example:**
```typescript
const files = await desfireCard.getFileIDs();
console.log('Files:', files); // e.g., [0, 1, 2]
```

---

### createStdDataFile()

Create a standard data file.

```typescript
async createStdDataFile(
  fileNo: number,
  commSettings: number,
  accessRights: Buffer,
  fileSize: number
): Promise<void>
```

**Parameters:**
- `fileNo`: File number (0-31)
- `commSettings`: Communication settings (0x00 = plain)
- `accessRights`: 2-byte access rights
- `fileSize`: Size in bytes

**Example:**
```typescript
const accessRights = Buffer.from([0x12, 0x23]);
// Read=K1, Write=K2, ReadWrite=K2, Change=K3

await desfireCard.createStdDataFile(
  0,                // File 0
  0x00,            // Plain communication
  accessRights,
  1024             // 1KB
);
```

---

### createBackupDataFile()

Create a backup data file (transactional).

```typescript
async createBackupDataFile(
  fileNo: number,
  commSettings: number,
  accessRights: Buffer,
  fileSize: number
): Promise<void>
```

**Parameters:** Same as `createStdDataFile()`

**Example:**
```typescript
await desfireCard.createBackupDataFile(1, 0x00, accessRights, 256);
```

---

### createValueFile()

Create a value file (signed 32-bit integer).

```typescript
async createValueFile(
  fileNo: number,
  commSettings: number,
  accessRights: Buffer,
  lowerLimit: number,
  upperLimit: number,
  value: number,
  limitedCreditEnabled: number
): Promise<void>
```

**Parameters:**
- `fileNo`: File number (0-31)
- `commSettings`: Communication settings
- `accessRights`: 2-byte access rights
- `lowerLimit`: Minimum value
- `upperLimit`: Maximum value
- `value`: Initial value
- `limitedCreditEnabled`: Enable limited credit (0x00 or 0x01)

**Example:**
```typescript
await desfireCard.createValueFile(
  0,                // File 0
  0x00,            // Plain communication
  accessRights,
  0,               // Min: 0
  1000000,         // Max: 1,000,000
  0,               // Initial: 0
  0x00             // Limited credit disabled
);
```

---

### readData()

Read data from standard or backup data file.

```typescript
async readData(fileNo: number, offset: number, length: number): Promise<Buffer>
```

**Parameters:**
- `fileNo`: File number
- `offset`: Byte offset
- `length`: Number of bytes to read

**Returns:** Buffer with file data

**Example:**
```typescript
const data = await desfireCard.readData(1, 0, 256);
console.log('File data:', data.toString('hex'));
```

---

### writeData()

Write data to standard or backup data file.

```typescript
async writeData(fileNo: number, offset: number, data: Buffer): Promise<void>
```

**Parameters:**
- `fileNo`: File number
- `offset`: Byte offset
- `data`: Data to write

**Example:**
```typescript
const data = Buffer.from('Hello DESFire!', 'utf8');
await desfireCard.writeData(1, 0, data);
```

---

## Value File Operations

### getValue()

Get current value from value file.

```typescript
async getValue(fileNo: number): Promise<number>
```

**Parameters:**
- `fileNo`: Value file number

**Returns:** Current value (signed 32-bit integer)

**Example:**
```typescript
const balance = await desfireCard.getValue(0);
console.log('Balance:', balance);
```

---

### credit()

Add value to value file.

```typescript
async credit(fileNo: number, amount: number): Promise<void>
```

**Parameters:**
- `fileNo`: Value file number
- `amount`: Amount to add (positive)

**Requires:** Commit transaction after operation

**Example:**
```typescript
await desfireCard.credit(0, 100);        // Add 100
await desfireCard.commitTransaction();   // Commit
```

---

### debit()

Subtract value from value file.

```typescript
async debit(fileNo: number, amount: number): Promise<void>
```

**Parameters:**
- `fileNo`: Value file number
- `amount`: Amount to subtract (positive)

**Requires:** Commit transaction after operation

**Example:**
```typescript
await desfireCard.debit(0, 50);          // Subtract 50
await desfireCard.commitTransaction();   // Commit
```

---

### commitTransaction()

Commit pending transaction.

```typescript
async commitTransaction(): Promise<void>
```

**Example:**
```typescript
try {
  await desfireCard.credit(0, 100);
  await desfireCard.writeData(1, 0, txData);
  await desfireCard.commitTransaction();
} catch (error) {
  await desfireCard.abortTransaction();
  throw error;
}
```

---

### abortTransaction()

Abort pending transaction (rollback).

```typescript
async abortTransaction(): Promise<void>
```

---

### getFreeMemory()

Get available memory on card.

```typescript
async getFreeMemory(): Promise<number>
```

**Returns:** Free bytes

**Example:**
```typescript
const free = await desfireCard.getFreeMemory();
console.log('Free memory:', free, 'bytes');
```

---

# Crypto Utilities

Cryptographic functions for DESFire operations.

```typescript
import * as Crypto from './card/crypto';
```

## aesCMAC()

Calculate AES-CMAC.

```typescript
aesCMAC(key: Buffer, data: Buffer, length?: number): Buffer
```

**Parameters:**
- `key`: 16-byte AES key
- `data`: Data to MAC
- `length` (optional): Output length (default: 16)

**Returns:** CMAC buffer

---

## Session Key Derivation

### deriveSessionKeyEV2Enc()

```typescript
deriveSessionKeyEV2Enc(key: Buffer, rndA: Buffer, rndB: Buffer): Buffer
```

### deriveSessionKeyEV2Mac()

```typescript
deriveSessionKeyEV2Mac(key: Buffer, rndA: Buffer, rndB: Buffer): Buffer
```

### deriveSessionKeyAESEnc()

```typescript
deriveSessionKeyAESEnc(key: Buffer, rndA: Buffer, rndB: Buffer): Buffer
```

### deriveSessionKeyAESMac()

```typescript
deriveSessionKeyAESMac(key: Buffer, rndA: Buffer, rndB: Buffer): Buffer
```

---

## Encryption/Decryption

### aesEncrypt()

```typescript
aesEncrypt(key: Buffer, data: Buffer, iv?: Buffer): Buffer
```

### aesDecrypt()

```typescript
aesDecrypt(key: Buffer, data: Buffer, iv?: Buffer): Buffer
```

---

## CRC Calculation

### crc32()

```typescript
crc32(data: Buffer): number
```

### crc32Buffer()

```typescript
crc32Buffer(data: Buffer): Buffer
```

### crc16()

```typescript
crc16(data: Buffer): number
```

### crc16Buffer()

```typescript
crc16Buffer(data: Buffer): Buffer
```

---

## Utility Functions

### xorBuffers()

```typescript
xorBuffers(a: Buffer, b: Buffer): Buffer
```

### rotateLeft()

```typescript
rotateLeft(buffer: Buffer, bytes?: number): Buffer
```

### generateRandom()

```typescript
generateRandom(length: number): Buffer
```

### padData()

```typescript
padData(data: Buffer, blockSize?: number): Buffer
```

### unpadData()

```typescript
unpadData(data: Buffer): Buffer
```

---

# NFC Reader

Reader management and card detection.

```typescript
import NFCReaderManager from './card/reader';
```

## Constructor

```typescript
new NFCReaderManager()
```

## Events

### reader-connected

Emitted when NFC reader is connected.

```typescript
readerManager.on('reader-connected', (reader) => {
  console.log('Reader:', reader.name);
});
```

### card-detected

Emitted when card is placed on reader.

```typescript
readerManager.on('card-detected', ({ reader, card }) => {
  console.log('Card UID:', card.uid);
});
```

### card-removed

Emitted when card is removed.

```typescript
readerManager.on('card-removed', ({ reader, card }) => {
  console.log('Card removed');
});
```

## Methods

### close()

Close reader connection.

```typescript
readerManager.close(): void
```

---

# APDU

Low-level APDU builder and parser.

```typescript
import { APDU } from './card/apdu';
```

## buildDESFire()

Build DESFire native APDU.

```typescript
static buildDESFire(cmd: number, data?: Buffer, le?: number): Buffer
```

**Parameters:**
- `cmd`: Command code
- `data` (optional): Command data
- `le` (optional): Expected response length

**Returns:** APDU buffer

---

## parse()

Parse APDU response.

```typescript
static parse(response: Buffer): {
  data: Buffer;
  sw1: number;
  sw2: number;
  status: string;
}
```

---

## Status Checkers

```typescript
static isSuccess(sw1: number, sw2: number): boolean
static isAdditionalFrame(sw1: number, sw2: number): boolean
```

---

# Types & Enums

## DesfireCommand

Command codes for DESFire operations.

```typescript
enum DesfireCommand {
  // PICC Level
  GET_VERSION = 0x60,
  FORMAT_PICC = 0xFC,

  // Application Level
  GET_APPLICATION_IDS = 0x6A,
  CREATE_APPLICATION = 0xCA,
  SELECT_APPLICATION = 0x5A,

  // Authentication
  AUTHENTICATE_AES = 0xAA,
  AUTHENTICATE_EV2_FIRST = 0x71,
  AUTHENTICATE_EV2_NON_FIRST = 0x77,

  // Key Management
  CHANGE_KEY = 0xC4,
  CHANGE_KEY_EV2 = 0xC6,
  GET_KEY_SETTINGS = 0x45,

  // ... (see src/card/desfire.ts for complete list)
}
```

---

## KeySet

```typescript
interface KeySet {
  appId: number;
  keys: Map<number, Buffer>;
  keyVersions: Map<number, number>;
}
```

---

# Error Handling

All async methods throw errors on failure. Always use try-catch:

```typescript
try {
  await desfireCard.authenticateAES(0, key);
  await desfireCard.readData(0, 0, 256);
} catch (error) {
  console.error('Operation failed:', error.message);
  desfireCard.resetAuth();
}
```

Common errors:
- `"Authentication failed: RndA verification failed"` - Wrong key
- `"Authentication required"` - Must authenticate first
- `"No key provided and no KeyManager set"` - Configure KeyManager
- `"DESFire command failed"` - Card rejected command

---

# Complete Example

```typescript
import NFCReaderManager from './card/reader';
import DESFireCard from './card/desfire';
import KeyManager from './card/keyManager';

async function main() {
  // Setup
  const keyManager = new KeyManager('./keys');
  keyManager.setMasterKey(process.env.KEY_MASTER_PASSWORD!);

  const readerManager = new NFCReaderManager();

  // Wait for card
  const { reader, card } = await new Promise((resolve) => {
    readerManager.once('card-detected', resolve);
  });

  try {
    const desfireCard = new DESFireCard(reader, keyManager);

    // Select application
    await desfireCard.selectApplication(0x000001);

    // Authenticate
    const defaultKey = keyManager.getDefaultKey();
    await desfireCard.authenticateAES(0, defaultKey);

    // Operations
    const balance = await desfireCard.getValue(0);
    console.log('Balance:', balance);

    await desfireCard.credit(0, 100);
    await desfireCard.commitTransaction();

    console.log('New balance:', await desfireCard.getValue(0));

  } finally {
    readerManager.close();
  }
}

main().catch(console.error);
```

---

# Best Practices

1. **Always authenticate before operations**
   ```typescript
   await desfireCard.authenticateAES(keyNo, key);
   ```

2. **Reset auth when done**
   ```typescript
   try { /* operations */ } finally { desfireCard.resetAuth(); }
   ```

3. **Commit transactions**
   ```typescript
   await desfireCard.credit(0, 100);
   await desfireCard.commitTransaction();
   ```

4. **Handle errors**
   ```typescript
   try {
     await desfireCard.credit(0, 100);
     await desfireCard.commitTransaction();
   } catch (error) {
     await desfireCard.abortTransaction();
     throw error;
   }
   ```

5. **Use KeyManager for key storage**
   ```typescript
   keyManager.setMasterKey(process.env.KEY_MASTER_PASSWORD!);
   keyManager.saveKeySet(appId);
   ```

6. **Prefer EV2 authentication**
   ```typescript
   await desfireCard.authenticateEV2First(0); // Better security
   ```

---

# See Also

- [KEY_MANAGEMENT.md](./KEY_MANAGEMENT.md) - Key management guide
- [README_APP.md](./README_APP.md) - Application overview
- [Examples](./src/) - Source code examples

---

**Last Updated:** 2025-10-18
**Version:** 1.0.0
