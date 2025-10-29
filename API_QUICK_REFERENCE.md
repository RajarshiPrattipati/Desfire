# API Quick Reference

Fast lookup reference for common operations.

## Quick Links
- [Full API Docs](./API_DOCUMENTATION.md)
- [Key Management Guide](./KEY_MANAGEMENT.md)
- [Examples](./src/)

---

## Initialize

```typescript
import NFCReaderManager from './card/reader';
import DESFireCard from './card/desfire';
import KeyManager from './card/keyManager';

const keyManager = new KeyManager('./keys');
keyManager.setMasterKey(process.env.KEY_MASTER_PASSWORD!);

const readerManager = new NFCReaderManager();
const { reader, card } = await new Promise(r =>
  readerManager.once('card-detected', r)
);

const desfire = new DESFireCard(reader, keyManager);
```

---

## Key Management

```typescript
// Generate keys
const keySet = keyManager.generateKeySet(0x000001, 5);
keyManager.saveKeySet(0x000001);

// Load keys
keyManager.loadKeySet(0x000001);

// Get specific key
const key = keyManager.getKey(0x000001, 0);

// Factory default
const defaultKey = keyManager.getDefaultKey();

// Export backup
const backup = keyManager.exportKeySetPlain(0x000001);
```

---

## Authentication

```typescript
// Select application
await desfire.selectApplication(0x000001);

// Authenticate AES (legacy)
await desfire.authenticateAES(0, key);

// Authenticate EV2 (recommended)
await desfire.authenticateEV2First(0, key);

// Check auth status
if (desfire.isAuthenticated()) {
  console.log('Authenticated with key', desfire.getAuthenticatedKeyNo());
}

// Reset auth
desfire.resetAuth();
```

---

## Application Management

```typescript
// Get applications
const apps = await desfire.getApplicationIDs();

// Create application
await desfire.createApplication(0x000001, 0x0F, 5, 0x80);

// Select application
await desfire.selectApplication(0x000001);

// Delete application
await desfire.deleteApplication(0x000001);

// Get card version
const version = await desfire.getVersion();
```

---

## Key Operations

```typescript
// Get key settings
const settings = await desfire.getKeySettings();

// Change key settings
await desfire.changeKeySettings(0x0F);

// Get key version
const version = await desfire.getKeyVersion(0);

// Change key (secure EV2 method)
await desfire.authenticateEV2First(0, oldKey);
await desfire.changeKeyEV2(0, newKey, 1);
```

---

## File Operations

```typescript
// List files
const files = await desfire.getFileIDs();

// Create standard data file
const accessRights = Buffer.from([0x12, 0x23]); // R=K1, W=K2
await desfire.createStdDataFile(0, 0x00, accessRights, 1024);

// Create value file
await desfire.createValueFile(0, 0x00, accessRights, 0, 1000000, 0, 0x00);

// Read data
const data = await desfire.readData(0, 0, 256);

// Write data
await desfire.writeData(0, 0, Buffer.from('Hello'));
```

---

## Value File Operations

```typescript
// Get value
const balance = await desfire.getValue(0);

// Credit (add)
await desfire.credit(0, 100);
await desfire.commitTransaction();

// Debit (subtract)
await desfire.debit(0, 50);
await desfire.commitTransaction();

// Abort transaction
await desfire.abortTransaction();
```

---

## Crypto Utilities

```typescript
import * as Crypto from './card/crypto';

// CMAC
const mac = Crypto.aesCMAC(key, data);

// Encrypt/Decrypt
const encrypted = Crypto.aesEncrypt(key, data, iv);
const decrypted = Crypto.aesDecrypt(key, encrypted, iv);

// CRC
const crc32 = Crypto.crc32(data);
const crc16 = Crypto.crc16(data);

// Random
const random = Crypto.generateRandom(16);

// Padding
const padded = Crypto.padData(data, 16);
const unpadded = Crypto.unpadData(padded);
```

---

## Common Patterns

### Authenticate & Read Balance
```typescript
await desfire.selectApplication(0x000001);
await desfire.authenticateAES(1, readKey); // K1 = read key
const balance = await desfire.getValue(0);
```

### Authenticate & Top Up
```typescript
await desfire.selectApplication(0x000001);
await desfire.authenticateAES(2, writeKey); // K2 = write key
await desfire.credit(0, 100);
await desfire.commitTransaction();
```

### Read Transaction History
```typescript
await desfire.selectApplication(0x000001);
await desfire.authenticateAES(1, readKey);
const txData = await desfire.readData(1, 0, 1024);
```

### Change Keys from Factory Defaults
```typescript
await desfire.selectApplication(0x000001);
await desfire.authenticateAES(0, defaultKey);

// Change master key first
const newMasterKey = keyManager.getKey(0x000001, 0);
await desfire.changeKeyEV2(0, newMasterKey, 1);

// Re-authenticate with new key
await desfire.authenticateAES(0, newMasterKey);

// Change other keys
for (let i = 1; i < 5; i++) {
  const key = keyManager.getKey(0x000001, i);
  await desfire.changeKeyEV2(i, key, 1);
}
```

### Complete Transaction with Rollback
```typescript
try {
  await desfire.authenticateAES(2, writeKey);

  // Multiple operations
  await desfire.debit(0, 50);
  await desfire.writeData(1, offset, txRecord);

  // Commit all
  await desfire.commitTransaction();
} catch (error) {
  // Rollback on error
  await desfire.abortTransaction();
  throw error;
}
```

---

## Access Rights Helper

```typescript
function createAccessRights(read: number, write: number,
                           readWrite: number, change: number): Buffer {
  const byte1 = (readWrite << 4) | change;
  const byte2 = (read << 4) | write;
  return Buffer.from([byte2, byte1]);
}

// Examples
const publicRead = createAccessRights(0xE, 1, 1, 0);      // Read=Free, Write=K1
const privateFile = createAccessRights(1, 2, 2, 0);       // Read=K1, Write=K2
const masterOnly = createAccessRights(0, 0, 0, 0);        // All=K0
```

**Key Numbers:**
- `0-13` = Specific key
- `0xE` = Free access
- `0xF` = Deny access

---

## Error Handling

```typescript
try {
  await desfire.authenticateAES(0, key);
} catch (error) {
  if (error.message.includes('RndA verification failed')) {
    console.error('Wrong key!');
  } else if (error.message.includes('Authentication required')) {
    console.error('Must authenticate first');
  } else {
    console.error('Command failed:', error.message);
  }
}
```

---

## Event Handling

```typescript
const readerManager = new NFCReaderManager();

// Reader connected
readerManager.on('reader-connected', (reader) => {
  console.log('Reader:', reader.name);
});

// Card detected
readerManager.on('card-detected', async ({ reader, card }) => {
  console.log('Card UID:', card.uid);
  const desfire = new DESFireCard(reader);
  // ... operations
});

// Card removed
readerManager.on('card-removed', ({ reader, card }) => {
  console.log('Card removed');
});

// Cleanup
readerManager.close();
```

---

## Complete Flow Example

```typescript
async function processCard() {
  // 1. Setup
  const keyManager = new KeyManager('./keys');
  keyManager.setMasterKey(process.env.KEY_MASTER_PASSWORD!);
  keyManager.loadKeySet(0x000001);

  const readerManager = new NFCReaderManager();
  const { reader, card } = await new Promise(r =>
    readerManager.once('card-detected', r)
  );

  try {
    const desfire = new DESFireCard(reader, keyManager);

    // 2. Select & Authenticate
    await desfire.selectApplication(0x000001);
    await desfire.authenticateAES(2); // Write key

    // 3. Check balance
    const balance = await desfire.getValue(0);
    console.log('Current balance:', balance);

    // 4. Perform transaction
    await desfire.debit(0, 50);

    // 5. Log transaction
    const txRecord = Buffer.from(JSON.stringify({
      timestamp: Date.now(),
      amount: -50,
      balance: balance - 50
    }));
    await desfire.writeData(1, 0, txRecord);

    // 6. Commit
    await desfire.commitTransaction();

    console.log('Transaction complete');
    console.log('New balance:', await desfire.getValue(0));

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    readerManager.close();
  }
}
```

---

## Cheat Sheet

### Card Hierarchy
```
Card (PICC)
├── PICC Master Key (K0)
├── Application 0x000001
│   ├── Master Key (K0)
│   ├── Read Key (K1)
│   ├── Write Key (K2)
│   ├── ChangeConfig Key (K3)
│   ├── Reserved (K4)
│   ├── File 0 (Value File)
│   ├── File 1 (Data File)
│   └── File 2 (Data File)
└── Application 0x000002
    └── ...
```

### File Types
- **Standard Data File**: General purpose storage
- **Backup Data File**: Transactional data (commit/rollback)
- **Value File**: Signed 32-bit integer with limits
- **Linear Record File**: FIFO records (not yet implemented)
- **Cyclic Record File**: Ring buffer records (not yet implemented)

### Communication Settings
- `0x00` = Plain (no encryption)
- `0x01` = MAC (authenticated)
- `0x03` = Encrypted (confidential)

### Key Settings
- `0x0F` = All changeable, no master key for operations
- `0x0B` = Configuration changeable, master key required
- `0x00` = Frozen (no changes allowed)

### Default Values
- Factory key: `00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00`
- Key version after factory: `0x00`
- PICC Application ID: `0x000000`

---

## Testing Commands

```bash
# Test authentication
npm run auth-test

# Read card info
npm run dev

# Provision new card
npm run provision

# Build project
npm run build
```

---

## Common Status Codes

- `0x9000` - Success
- `0x91AF` - Additional frame (more data)
- `0x91AE` - Authentication error
- `0x917E` - Length error
- `0x919D` - Permission denied
- `0x919E` - Parameter error

---

**For complete details, see [API_DOCUMENTATION.md](./API_DOCUMENTATION.md)**
