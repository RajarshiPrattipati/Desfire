# DESFire Key Management Guide

Comprehensive guide to key generation, storage, and authentication for DESFire EV2/EV3 cards.

## Overview

This implementation provides complete key management features:
- **Key Generation**: Generate secure AES-128 keys
- **Encrypted Storage**: Keys encrypted at rest using AES-256-GCM
- **Authentication**: Support for AES and EV2 authentication protocols
- **Key Change**: Securely change keys from factory defaults
- **Key Rollover**: Advanced key rotation using DESFire key sets

## Architecture

### Key Structure

Each application has 5 keys (K0-K4):

```
Application (0x000001)
├── K0: Master Key (admin operations, key changes)
├── K1: Read Key (authenticated reads)
├── K2: Write Key (write operations)
├── K3: ChangeConfig Key (modify access rights)
└── K4: Reserved (future use)
```

### Key Storage

Keys are stored encrypted in the `./keys/` directory:

```
keys/
├── app_000001.key  # Encrypted keys for App 1
└── app_000002.key  # Encrypted keys for App 2
```

**Security Features:**
- AES-256-GCM encryption
- Authenticated encryption (prevents tampering)
- Master password required to decrypt
- `.gitignore` prevents accidental commits

## Quick Start

### 1. Generate Keys

```typescript
import KeyManager from './card/keyManager';

const keyManager = new KeyManager('./keys');

// Set master password (store in environment variable in production)
keyManager.setMasterKey('your-secure-master-password');

// Generate key set for application
const keySet = keyManager.generateKeySet(0x000001, 5);

// Save encrypted keys
keyManager.saveKeySet(0x000001);

// Export for backup (KEEP SECURE!)
const backup = keyManager.exportKeySetPlain(0x000001);
console.log(backup);
```

### 2. Authenticate with Factory Default

All DESFire cards come with factory default keys (16 bytes of zeros):

```typescript
import DESFireCard from './card/desfire';

const desfireCard = new DESFireCard(reader, keyManager);

// Select application
await desfireCard.selectApplication(0x000001);

// Get factory default key
const defaultKey = keyManager.getDefaultKey();

// Authenticate using AES (works on EV1/EV2/EV3)
await desfireCard.authenticateAES(0, defaultKey);

// Or use EV2 First (recommended for EV2/EV3)
await desfireCard.authenticateEV2First(0, defaultKey);

// Check authentication status
console.log('Authenticated:', desfireCard.isAuthenticated());
console.log('With key:', desfireCard.getAuthenticatedKeyNo());
```

### 3. Change Keys from Factory Defaults

**WARNING: This is irreversible! Make sure you have backed up your keys.**

```typescript
// Authenticate with factory default first
await desfireCard.selectApplication(0x000001);
await desfireCard.authenticateAES(0, defaultKey);

// Get new key from key manager
const newKey = keyManager.getKey(0x000001, 0);

// Change K0 (Master Key)
await desfireCard.changeKeyEV2(0, newKey, 1); // Version 1

// Re-authenticate with new key
await desfireCard.authenticateAES(0, newKey);

// Change other keys
for (let i = 1; i < 5; i++) {
  const key = keyManager.getKey(0x000001, i);
  await desfireCard.changeKeyEV2(i, key, 1);
}
```

## Authentication Methods

### AuthenticateAES (Legacy)

Works on DESFire EV1, EV2, and EV3:

```typescript
await desfireCard.authenticateAES(keyNo, key);
```

**Process:**
1. Send Authenticate command with key number
2. Receive encrypted RndB from card
3. Decrypt RndB with key
4. Generate RndA
5. Send encrypted RndA + RndB' (rotated)
6. Receive and verify encrypted RndA'
7. Derive session keys

**Session Keys:**
- `SesAuthENC`: Encryption key from RndA/RndB bytes
- `SesAuthMAC`: MAC key from RndA/RndB bytes

### AuthenticateEV2First (Recommended)

Enhanced authentication for DESFire EV2/EV3:

```typescript
await desfireCard.authenticateEV2First(keyNo, key);
```

**Improvements over AES:**
- Transaction Identifier (TI) for multi-session tracking
- CMAC-based session key derivation
- Support for card capabilities exchange
- Better security against replay attacks

**Session Keys (derived with CMAC):**
- `SesAuthENCKey`: CMAC(key, SV1)
- `SesAuthMACKey`: CMAC(key, SV2)

### AuthenticateEV2NonFirst

For authenticating with additional keys after first authentication:

```typescript
// First authentication
await desfireCard.authenticateEV2First(0, masterKey);

// Additional authentication (uses existing TI)
await desfireCard.authenticateEV2NonFirst(1, readKey);
```

## Key Management Operations

### Get Key Settings

```typescript
const settings = await desfireCard.getKeySettings();
console.log('Settings:', settings.settings.toString(16));
console.log('Max Keys:', settings.maxKeys);
console.log('Key Type:', settings.keyType.toString(16));
```

**Key Settings Byte:**
```
Bit 7: Configuration changeable
Bit 6: CreateApplication without master key
Bit 5: File directory list access
Bit 4: Master key changeable
Bits 3-0: Key change rights (0=master, 1-13=specific key, E=frozen)
```

### Change Key Settings

```typescript
await desfireCard.changeKeySettings(0x0F); // All keys changeable
```

### Get Key Version

```typescript
for (let i = 0; i < 5; i++) {
  const version = await desfireCard.getKeyVersion(i);
  console.log(`K${i} version: ${version}`);
}
```

### Change Key (Legacy)

**WARNING: Sends key in plaintext! Only for testing with default keys.**

```typescript
await desfireCard.changeKey(keyNo, newKey);
```

### Change Key EV2 (Secure)

Properly encrypted key change for EV2/EV3:

```typescript
await desfireCard.changeKeyEV2(keyNo, newKey, newVersion);
```

**Process:**
1. Authenticate first
2. Build: NewKey || Version || CRC32
3. Encrypt with session encryption key
4. Send encrypted data

## Advanced: Key Rollover

DESFire EV3 supports atomic key set changes:

```typescript
// Step 1: Initialize new key set
await desfireCard.initializeKeySet(1);

// Step 2: Change all keys to new key set
for (let i = 0; i < 5; i++) {
  const newKey = keyManager.getKey(APP_ID, i);
  await desfireCard.changeKeyEV2(i, newKey, 2);
}

// Step 3: Roll to new key set (atomic switch)
await desfireCard.rollKeySet(1);

// Step 4: Finalize (remove old keys)
await desfireCard.finalizeKeySet();
```

**Benefits:**
- Atomic key rotation (all or nothing)
- No window of mixed keys
- Rollback capability before finalization

## Testing

### Run Authentication Test

```bash
npm run auth-test
```

This script:
1. Generates keys for both applications
2. Saves keys to encrypted storage
3. Authenticates with factory defaults
4. Reads key settings and versions
5. Tests both applications
6. Shows how to change keys (commented out)

### Expected Output

```
DESFire Authentication Test
============================================================

Generating key sets...
App 1 keys generated:
  K0: 3f7e8a9c...
  K1: 2b4c6d8e...
  ...

Authenticating with factory default key...
✓ Authenticated with key 0
  Session Enc Key: 1a2b3c4d...
  Session MAC Key: 5e6f7a8b...

Authentication status:
  Authenticated: true
  Authenticated Key: K0
```

## Security Best Practices

### 1. Master Key Protection

```typescript
// WRONG - Hardcoded password
keyManager.setMasterKey('password123');

// RIGHT - Environment variable
import dotenv from 'dotenv';
dotenv.config();
keyManager.setMasterKey(process.env.KEY_MASTER_PASSWORD!);
```

### 2. Key Backup

```typescript
// Export keys to secure backup location
const backup = keyManager.exportKeySetPlain(APP_ID);

// Store in secure location (encrypted, offline)
fs.writeFileSync('/secure/backup/keys.json', backup);
```

**Backup Storage Options:**
- Hardware Security Module (HSM)
- Encrypted USB drive (offline)
- Secure cloud storage with client-side encryption
- Paper backup in safe (for disaster recovery)

### 3. Key Rotation

Rotate keys periodically:

```typescript
// Generate new keys
const newKeySet = keyManager.generateKeySet(APP_ID, 5);

// Change all keys
await desfireCard.selectApplication(APP_ID);
await desfireCard.authenticateAES(0, oldMasterKey);

for (let i = 0; i < 5; i++) {
  const newKey = keyManager.getKey(APP_ID, i);
  await desfireCard.changeKeyEV2(i, newKey, version + 1);
}

// Update key manager
keyManager.saveKeySet(APP_ID);
```

**Rotation Schedule:**
- Master keys: Every 6-12 months
- Operational keys: Every 3-6 months
- After suspected compromise: Immediately

### 4. Access Control

```typescript
// Different keys for different operations
await desfireCard.authenticateAES(1, readKey);  // Read-only access
await desfireCard.readData(0, 0, 256);

await desfireCard.authenticateAES(2, writeKey); // Write access
await desfireCard.writeData(0, 0, data);

await desfireCard.authenticateAES(0, masterKey); // Admin access
await desfireCard.changeKeyEV2(1, newReadKey);
```

### 5. Session Management

```typescript
try {
  await desfireCard.authenticateAES(0, key);

  // Perform operations
  await desfireCard.readData(...);
  await desfireCard.writeData(...);

} finally {
  // Always reset authentication when done
  desfireCard.resetAuth();
}
```

## Troubleshooting

### "Authentication failed: RndA verification failed"

**Cause:** Wrong key used
**Solution:** Verify you're using the correct key for the key number

```typescript
// Check key version first
const version = await desfireCard.getKeyVersion(0);
console.log('Key version:', version);

// Version 0 = factory default
// Version > 0 = key has been changed
```

### "Authentication required for ChangeKey"

**Cause:** Not authenticated before changing keys
**Solution:** Authenticate first

```typescript
await desfireCard.authenticateAES(0, currentMasterKey);
await desfireCard.changeKeyEV2(1, newKey);
```

### "No key provided and no KeyManager set"

**Cause:** KeyManager not configured
**Solution:** Set key manager on DESFire card

```typescript
const keyManager = new KeyManager('./keys');
const desfireCard = new DESFireCard(reader);
desfireCard.setKeyManager(keyManager);
```

### "Key file not found"

**Cause:** Keys not saved or wrong path
**Solution:** Generate and save keys first

```typescript
keyManager.generateKeySet(APP_ID, 5);
keyManager.saveKeySet(APP_ID);
```

## API Reference

### KeyManager

#### Constructor
```typescript
new KeyManager(keyStorePath?: string)
```

#### Methods
- `generateKey(): Buffer` - Generate single AES-128 key
- `generateKeySet(appId, numKeys): KeySet` - Generate complete key set
- `getDefaultKey(): Buffer` - Get factory default key (zeros)
- `getKey(appId, keyNo): Buffer` - Get specific key
- `setKey(appId, keyNo, key, version)` - Set specific key
- `getKeyVersion(appId, keyNo): number` - Get key version
- `setMasterKey(password)` - Set master encryption password
- `saveKeySet(appId)` - Save keys to encrypted file
- `loadKeySet(appId): KeySet` - Load keys from file
- `exportKeySetPlain(appId): string` - Export as JSON (backup)
- `clearKeys()` - Clear all keys from memory

### DESFireCard Authentication

#### Methods
- `authenticateAES(keyNo, key?)` - AES authentication
- `authenticateEV2First(keyNo, key?)` - EV2 first authentication
- `authenticateEV2NonFirst(keyNo, key?)` - EV2 additional authentication
- `isAuthenticated(): boolean` - Check auth status
- `getAuthenticatedKeyNo(): number` - Get authenticated key
- `resetAuth()` - Clear authentication state

### DESFireCard Key Management

#### Methods
- `getKeySettings()` - Read key settings
- `changeKeySettings(settings)` - Change key settings
- `getKeyVersion(keyNo): number` - Read key version
- `changeKey(keyNo, newKey, oldKey?)` - Change key (legacy)
- `changeKeyEV2(keyNo, newKey, version)` - Change key (secure)
- `initializeKeySet(keySetNo, keyType)` - Initialize key rollover
- `rollKeySet(keySetNo)` - Activate new key set
- `finalizeKeySet()` - Complete key rollover

## Next Steps

1. **Test Authentication**: Run `npm run auth-test`
2. **Review Generated Keys**: Check `./keys/` directory
3. **Backup Keys**: Export and securely store key backup
4. **Test on Non-Production Card**: Change keys on test card first
5. **Implement Authenticated Operations**: Use authenticated file read/write
6. **Deploy to Production**: With proper key management procedures

## References

- [DESFire EV2 Datasheet](https://www.nxp.com/docs/en/data-sheet/MF3DX2_MF3DHx2_SDS.pdf)
- [DESFire EV3 Datasheet](https://www.nxp.com/docs/en/data-sheet/MF3D_H_x3_SDS.pdf)
- [NIST AES-CMAC](https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-38B.pdf)

## Support

For issues or questions:
- Check troubleshooting section above
- Review example script: `src/auth-test.ts`
- Test with factory defaults first
- Verify card is DESFire EV2/EV3
