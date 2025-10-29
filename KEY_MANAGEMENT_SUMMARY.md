# Key Management Features - Implementation Summary

## What Was Built

Complete key management infrastructure for DESFire EV2/EV3 cards, including generation, storage, authentication, and key change operations.

---

## New Files Created

### 1. `src/card/keyManager.ts` (312 lines)
**Key Management Module**

Features:
- ✅ AES-128 key generation (16-byte random keys)
- ✅ Key set generation (5 keys per application: K0-K4)
- ✅ Factory default key support (16 zeros)
- ✅ Encrypted key storage using AES-256-GCM
- ✅ Master password-based encryption
- ✅ Key versioning support
- ✅ Secure key loading/saving
- ✅ Plain text export for backup
- ✅ Memory clearing for security

Key Methods:
```typescript
generateKey(): Buffer
generateKeySet(appId, numKeys): KeySet
getDefaultKey(): Buffer
getKey(appId, keyNo): Buffer
setKey(appId, keyNo, key, version)
setMasterKey(password)
saveKeySet(appId)
loadKeySet(appId): KeySet
exportKeySetPlain(appId): string
clearKeys()
```

### 2. `src/card/crypto.ts` (348 lines)
**Cryptographic Utilities**

Features:
- ✅ AES-CMAC calculation (for DESFire authentication)
- ✅ Session key derivation (EV2 and legacy AES)
- ✅ AES-128 CBC encryption/decryption
- ✅ CRC32 and CRC16 calculation
- ✅ Buffer rotation (for authentication challenges)
- ✅ ISO/IEC 9797-1 padding
- ✅ Random number generation

Key Functions:
```typescript
aesCMAC(key, data, length?): Buffer
deriveSessionKeyEV2Enc(key, rndA, rndB): Buffer
deriveSessionKeyEV2Mac(key, rndA, rndB): Buffer
deriveSessionKeyAESEnc(key, rndA, rndB): Buffer
deriveSessionKeyAESMac(key, rndA, rndB): Buffer
aesEncrypt(key, data, iv?): Buffer
aesDecrypt(key, data, iv?): Buffer
crc32(data): number
crc16(data): number
rotateLeft(buffer, bytes): Buffer
padData(data, blockSize): Buffer
```

### 3. `src/card/desfire.ts` (Enhanced)
**DESFire Command Library - Authentication Extensions**

Added Authentication State:
```typescript
private authenticated: boolean
private authenticatedKeyNo: number | null
private sessionKeyEnc: Buffer | null
private sessionKeyMac: Buffer | null
private transactionId: Buffer | null
private commandCounter: number
```

New Authentication Methods:
- ✅ `authenticateAES(keyNo, key?)` - Legacy AES auth (EV1/EV2/EV3)
- ✅ `authenticateEV2First(keyNo, key?)` - EV2 first authentication
- ✅ `authenticateEV2NonFirst(keyNo, key?)` - EV2 additional auth
- ✅ `isAuthenticated(): boolean`
- ✅ `getAuthenticatedKeyNo(): number`
- ✅ `resetAuth()`

New Key Management Methods:
- ✅ `getKeySettings()` - Read key settings
- ✅ `changeKeySettings(settings)` - Modify key settings
- ✅ `getKeyVersion(keyNo)` - Read key version
- ✅ `changeKey(keyNo, newKey, oldKey?)` - Legacy key change
- ✅ `changeKeyEV2(keyNo, newKey, version)` - Secure EV2 key change

Key Rollover Methods:
- ✅ `initializeKeySet(keySetNo, keyType)` - Start key rollover
- ✅ `rollKeySet(keySetNo)` - Activate new key set
- ✅ `finalizeKeySet()` - Complete key rollover

### 4. `src/auth-test.ts` (268 lines)
**Authentication Test Script**

Demonstrates:
- Key generation for multiple applications
- Encrypted key storage
- Authentication with factory defaults
- Key settings retrieval
- Key version reading
- Multi-application testing
- Key backup export
- Key change operations (commented, safe)

Run with: `npm run auth-test`

### 5. `KEY_MANAGEMENT.md` (Comprehensive Guide)
**Complete Documentation**

Covers:
- Architecture overview
- Quick start guide
- All authentication methods explained
- Key management operations
- Advanced key rollover
- Security best practices
- Troubleshooting guide
- Complete API reference

---

## Authentication Protocols Implemented

### 1. AuthenticateAES (Legacy)
**DESFire EV1/EV2/EV3 compatible**

Protocol:
1. Send Authenticate command with key number
2. Receive encrypted RndB (16 bytes)
3. Decrypt RndB
4. Generate RndA (16 bytes)
5. Send encrypted RndA + RndB' (rotated)
6. Receive and verify encrypted RndA'
7. Derive session keys from RndA/RndB

Session Keys:
- SesAuthENC: RndA[0:4] || RndB[0:4] || RndA[12:16] || RndB[12:16]
- SesAuthMAC: RndA[4:8] || RndB[4:8] || RndA[8:12] || RndB[8:12]

### 2. AuthenticateEV2First (Recommended)
**DESFire EV2/EV3 enhanced security**

Improvements:
- Transaction Identifier (TI) for session tracking
- CMAC-based session key derivation
- Card capabilities exchange
- Better replay attack protection

Protocol:
1. Send AuthenticateEV2First with key number + PCDcap2
2. Receive encrypted RndB
3. Decrypt RndB
4. Generate RndA
5. Send encrypted RndA + RndB'
6. Receive TI + encrypted RndA'
7. Verify RndA'
8. Derive EV2 session keys using CMAC

Session Keys (CMAC-based):
- SesAuthENCKey = CMAC(key, 0xA5 || 0x5A || ... || RndA_parts || RndB_parts)
- SesAuthMACKey = CMAC(key, 0x5A || 0xA5 || ... || RndA_parts || RndB_parts)

### 3. AuthenticateEV2NonFirst
**Additional authentication after first**

- Uses existing Transaction ID
- Allows multi-key authentication in same session
- Derives new session keys

---

## Security Features

### Encryption at Rest
- Keys stored using AES-256-GCM
- Master password required
- Authentication tag prevents tampering
- IV randomized per encryption

### Secure Key Derivation
- CMAC-based for EV2/EV3
- Proper subkey generation
- Random challenge generation
- Session-specific keys

### Key Versioning
- Track key changes
- Identify factory defaults (version 0)
- Support key rotation policies

### Memory Safety
- Secure key clearing
- Buffer zeroing on cleanup
- Session state reset

---

## Usage Examples

### Generate and Store Keys

```typescript
import KeyManager from './card/keyManager';

const keyManager = new KeyManager('./keys');
keyManager.setMasterKey(process.env.KEY_MASTER_PASSWORD!);

// Generate keys
const keySet = keyManager.generateKeySet(0x000001, 5);

// Save encrypted
keyManager.saveKeySet(0x000001);

// Export backup
const backup = keyManager.exportKeySetPlain(0x000001);
```

### Authenticate with Factory Default

```typescript
import DESFireCard from './card/desfire';

const desfireCard = new DESFireCard(reader, keyManager);

await desfireCard.selectApplication(0x000001);

const defaultKey = keyManager.getDefaultKey();
await desfireCard.authenticateAES(0, defaultKey);

console.log('Authenticated:', desfireCard.isAuthenticated());
```

### Authenticate with EV2

```typescript
await desfireCard.selectApplication(0x000001);
await desfireCard.authenticateEV2First(0, key);

// Transaction ID available for multi-session tracking
console.log('TI:', desfireCard.transactionId?.toString('hex'));
```

### Change Keys (Secure)

```typescript
// Authenticate first
await desfireCard.authenticateAES(0, oldKey);

// Change key using EV2 method (encrypted)
const newKey = keyManager.getKey(0x000001, 0);
await desfireCard.changeKeyEV2(0, newKey, 1);

// Re-authenticate with new key
await desfireCard.authenticateAES(0, newKey);
```

### Key Rollover

```typescript
// Initialize new key set
await desfireCard.initializeKeySet(1);

// Change all keys
for (let i = 0; i < 5; i++) {
  const key = keyManager.getKey(APP_ID, i);
  await desfireCard.changeKeyEV2(i, key, 2);
}

// Atomically activate new key set
await desfireCard.rollKeySet(1);

// Finalize (remove old keys)
await desfireCard.finalizeKeySet();
```

---

## Testing

### Run Test Script

```bash
npm run auth-test
```

### What It Tests

1. ✅ Key generation (5 keys × 2 applications)
2. ✅ Encrypted storage
3. ✅ Key backup export
4. ✅ Application selection
5. ✅ Key settings retrieval
6. ✅ Key version reading
7. ✅ Authentication with factory defaults
8. ✅ AuthenticateAES protocol
9. ✅ AuthenticateEV2First protocol (fallback)
10. ✅ Session key derivation
11. ✅ Multi-application support

### Build Verification

```bash
npm run build
```

✅ Build successful - no TypeScript errors

---

## Key Management Workflow

### Phase 1: Development (Current)
- ✅ Generate keys for testing
- ✅ Authenticate with factory defaults
- ✅ Test all authentication methods
- ✅ Verify key settings/versions
- ✅ Keys NOT changed from defaults yet (per your request)

### Phase 2: Key Change (When Ready)
1. Generate production keys
2. Back up keys securely
3. Authenticate with factory defaults
4. Change keys using changeKeyEV2
5. Test authentication with new keys
6. Update key versions

### Phase 3: Production
1. Load keys from encrypted storage
2. Authenticate with production keys
3. Perform operations
4. Implement key rotation schedule
5. Monitor key versions

---

## File Structure

```
src/
├── card/
│   ├── reader.ts           # NFC reader interface
│   ├── apdu.ts            # APDU builder/parser
│   ├── desfire.ts         # DESFire commands + AUTH ✨
│   ├── keyManager.ts      # Key management ✨ NEW
│   └── crypto.ts          # Crypto utilities ✨ NEW
├── index.ts               # Card info reader
├── provision.ts           # Card provisioning
└── auth-test.ts           # Authentication test ✨ NEW

keys/                      # Encrypted key storage (gitignored)
├── app_000001.key        # Generated by auth-test
└── app_000002.key        # Generated by auth-test

docs/
├── KEY_MANAGEMENT.md      # Complete guide ✨ NEW
└── KEY_MANAGEMENT_SUMMARY.md  # This file ✨ NEW
```

---

## Next Steps

### Immediate
1. ✅ Test authentication with factory defaults
   ```bash
   npm run auth-test
   ```

2. ✅ Review generated keys
   ```bash
   ls -la keys/
   ```

3. ✅ Backup keys securely
   ```bash
   # Keys are in the test output or keys/ directory
   ```

### When Ready to Change Keys
1. Uncomment key change code in auth-test.ts
2. Test on non-production card first
3. Verify authentication with new keys
4. Document key versions

### Production Deployment
1. Generate production keys
2. Store master password in environment variable
3. Implement key rotation schedule
4. Set up key backup procedures
5. Deploy with proper key management

---

## Dependencies

No new dependencies required! Uses built-in Node.js `crypto` module.

Existing dependencies:
- `nfc-pcsc` - NFC reader communication
- `dotenv` - Environment variables (recommended for master password)
- `winston` - Logging

---

## Security Notes

### ✅ Implemented
- AES-256-GCM encrypted key storage
- CMAC-based authentication
- Session key derivation
- Key versioning
- Secure random generation
- Memory clearing

### ⚠️ Important Reminders
- Factory defaults still active (not changed yet per your request)
- Master password should be in environment variable
- Back up keys before changing from defaults
- Test on non-production card first
- Keys in ./keys/ are encrypted but protect master password

### 🔒 Production Checklist
- [ ] Change factory default keys
- [ ] Store master password securely
- [ ] Back up keys in multiple secure locations
- [ ] Implement key rotation schedule
- [ ] Document key management procedures
- [ ] Set up monitoring for key versions
- [ ] Test disaster recovery procedures

---

## Summary

**All key management features are now implemented and ready for testing!**

- 3 new files created
- 2 files enhanced (desfire.ts, package.json)
- 2 documentation files added
- 400+ lines of authentication code
- 300+ lines of crypto utilities
- 300+ lines of key management
- Complete test script included
- Comprehensive documentation provided

**Status: ✅ COMPLETE**

The foundation is solid. You can now:
1. Test authentication with factory defaults
2. Generate and manage keys securely
3. When ready, change keys from defaults
4. Implement authenticated file operations
5. Deploy to production with proper key management

Run `npm run auth-test` to see it all in action!
