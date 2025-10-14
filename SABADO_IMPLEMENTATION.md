# Sabado DESFire Card Implementation Plan
## 2-Application Architecture with Offline Payments

---

## Executive Summary

This document outlines the implementation plan for securing a MIFARE DESFire 4K card with 2 applications:
- **App 1 (Sabado Owned)**: Payment/value storage with full control
- **App 2 (Third-Party)**: Authorized by Sabado with 1KB storage and independent keys

Both applications use AES-128 encryption for offline payment capabilities.

---

## 1. Architecture Overview

### 1.1 Ownership Model

```
┌─────────────────────────────────────────────────┐
│         MIFARE DESFire EV2/EV3 4K Card          │
│                                                 │
│  ┌───────────────────────────────────────────┐ │
│  │    PICC Master Key (Sabado Owned)         │ │
│  │    - AES-128                               │ │
│  │    - Controls app creation/deletion        │ │
│  └───────────────────────────────────────────┘ │
│                                                 │
│  ┌──────────────────┐    ┌──────────────────┐  │
│  │  Application 1   │    │  Application 2   │  │
│  │  (Sabado Owned)  │    │  (Third-Party)   │  │
│  │                  │    │                  │  │
│  │  AID: 0xA10001   │    │  AID: 0xA20001   │  │
│  │  Keys: K0-K4     │    │  Keys: K0-K4     │  │
│  │  Storage: 3KB    │    │  Storage: 1KB    │  │
│  │  (Sabado keys)   │    │  (3rd party keys)│  │
│  └──────────────────┘    └──────────────────┘  │
│                                                 │
│  Isolation: Apps cannot access each other's    │
│  data or keys                                   │
└─────────────────────────────────────────────────┘
```

### 1.2 Card Specifications

**Card Model**: MIFARE DESFire EV2 or EV3 4K
- **Total Memory**: 4096 bytes
- **Maximum Applications**: 28
- **Files per Application**: 32
- **Encryption**: AES-128
- **Standard**: ISO/IEC 14443 Type A

---

## 2. iPhone NFC vs Dedicated Reader Analysis

### 2.1 iPhone NFC Capabilities

**✅ Supported Operations:**
- Read DESFire card UID
- Select applications
- Authenticate with AES keys
- Read/Write data files
- Value file operations (Credit/Debit)
- Send ISO 7816-4 APDUs

**❌ Limitations:**
- Session timeout (60 seconds max)
- No background NFC reading
- Complex key management on device
- Requires iOS 13+ and iPhone 7+
- User must hold card near phone throughout transaction
- Difficult to handle multi-step provisioning

### 2.2 Dedicated Reader Capabilities

**✅ Advantages:**
- No session timeouts
- Reliable for card provisioning
- Better for batch operations
- Full control over communication
- Easier debugging
- More stable for key changes

**Recommended Readers:**
- **ACR122U**: USB NFC reader (~$40)
- **ACR1252U**: USB NFC reader with SAM slots (~$60)
- **ACR1255U-J1**: Bluetooth reader for mobile use (~$80)

### 2.3 Recommendation

**For Development & Card Provisioning:**
- ✅ **Use dedicated USB NFC reader (ACR122U or ACR1252U)**
- Connect to MacBook via USB
- Use Node.js with `nfc-pcsc` library
- Essential for initial card setup, key provisioning, and testing

**For Production Transactions:**
- ✅ **iPhone NFC can work for simple read/write operations**
- Create iOS app using CoreNFC + React Native or Swift
- Pre-authenticate and cache session for faster transactions
- Use for balance checks, payments, and value updates

**Implementation Strategy:**
1. **Phase 1**: Build Node.js backend with USB reader for provisioning
2. **Phase 2**: Create iOS app for end-user transactions (optional)

---

## 3. Key Architecture

### 3.1 PICC Level (Sabado Controlled)

```json
{
  "level": "PICC",
  "owner": "Sabado",
  "key": {
    "type": "AES-128",
    "number": 0,
    "purpose": "Card master key",
    "permissions": [
      "Create Application",
      "Delete Application",
      "Get Application IDs",
      "Format PICC"
    ]
  },
  "storage": "Encrypted in Sabado DB Vault",
  "rotation": "Every 12 months or on-demand"
}
```

### 3.2 Application 1 (Sabado Payment App)

```json
{
  "application": "Application 1",
  "owner": "Sabado",
  "aid": "0xA10001",
  "storage": "~3KB (3072 bytes)",
  "keys": [
    {
      "K0": {
        "type": "AES-128",
        "role": "Application Master Key",
        "permissions": "Full admin control"
      }
    },
    {
      "K1": {
        "type": "AES-128",
        "role": "Read Key",
        "permissions": "Read balance and transaction history"
      }
    },
    {
      "K2": {
        "type": "AES-128",
        "role": "Write Key",
        "permissions": "Credit/Debit operations"
      }
    },
    {
      "K3": {
        "type": "AES-128",
        "role": "ChangeConfig Key",
        "permissions": "Modify file settings"
      }
    },
    {
      "K4": {
        "type": "AES-128",
        "role": "Reserved",
        "permissions": "Future use / audit"
      }
    }
  ],
  "files": [
    {
      "fileId": 0,
      "type": "Value File",
      "size": 4,
      "purpose": "Current balance (32-bit value)",
      "accessRights": {
        "read": "K1",
        "write": "K2",
        "readWrite": "K2",
        "changeConfig": "K3"
      },
      "limits": {
        "lower": 0,
        "upper": 1000000
      }
    },
    {
      "fileId": 1,
      "type": "Backup Data File",
      "size": 512,
      "purpose": "Transaction history (32 records × 16 bytes)",
      "accessRights": {
        "read": "K1",
        "write": "K2",
        "readWrite": "K2",
        "changeConfig": "K3"
      }
    },
    {
      "fileId": 2,
      "type": "Standard Data File",
      "size": 128,
      "purpose": "User metadata (name, card ID, etc.)",
      "accessRights": {
        "read": "K1",
        "write": "K2",
        "readWrite": "K2",
        "changeConfig": "K3"
      }
    }
  ]
}
```

**Total App 1 Storage**: ~644 bytes used (~2428 bytes available)

### 3.3 Application 2 (Third-Party App)

```json
{
  "application": "Application 2",
  "owner": "Third-Party (authorized by Sabado)",
  "aid": "0xA20001",
  "storage": "1KB (1024 bytes)",
  "keys": [
    {
      "K0": {
        "type": "AES-128",
        "role": "Application Master Key",
        "permissions": "Full admin control (owned by 3rd party)",
        "note": "Sabado does NOT have access to this key"
      }
    },
    {
      "K1": {
        "type": "AES-128",
        "role": "Read Key",
        "permissions": "Read app 2 data"
      }
    },
    {
      "K2": {
        "type": "AES-128",
        "role": "Write Key",
        "permissions": "Write app 2 data"
      }
    },
    {
      "K3": {
        "type": "AES-128",
        "role": "ChangeConfig Key",
        "permissions": "Modify file settings"
      }
    },
    {
      "K4": {
        "type": "AES-128",
        "role": "Reserved",
        "permissions": "Future use"
      }
    }
  ],
  "files": [
    {
      "fileId": 0,
      "type": "Standard Data File",
      "size": 512,
      "purpose": "Third-party data 1",
      "accessRights": {
        "read": "K1",
        "write": "K2",
        "readWrite": "K2",
        "changeConfig": "K3"
      }
    },
    {
      "fileId": 1,
      "type": "Standard Data File",
      "size": 512,
      "purpose": "Third-party data 2",
      "accessRights": {
        "read": "K1",
        "write": "K2",
        "readWrite": "K2",
        "changeConfig": "K3"
      }
    }
  ]
}
```

**Total App 2 Storage**: 1024 bytes (as requested)

### 3.4 Key Ownership Summary

| Key Level | Owner | Access |
|-----------|-------|--------|
| PICC Master Key | Sabado | Sabado only |
| App 1 Keys (K0-K4) | Sabado | Sabado only |
| App 2 Keys (K0-K4) | Third-Party | Third-party only (Sabado cannot access) |

---

## 4. Card Provisioning Workflow

### 4.1 Initial Card Setup (Sabado Performs)

```javascript
// Step 1: Format card and set PICC master key
async function provisionCard(reader, cardUID) {
  // 1. Select PICC level
  await selectPICC(reader);

  // 2. Authenticate with default key (0x00...)
  await authenticateAES(reader, 0, DEFAULT_KEY);

  // 3. Change PICC master key to Sabado's key
  const piccMasterKey = generateAESKey(); // Sabado's secure key
  await changeKey(reader, 0, DEFAULT_KEY, piccMasterKey);

  // 4. Store PICC key in Sabado DB Vault
  await vault.storeKey({
    cardUID: cardUID,
    keyType: 'PICC_MASTER',
    keyData: encrypt(piccMasterKey),
    createdAt: new Date()
  });

  return piccMasterKey;
}

// Step 2: Create Application 1 (Sabado)
async function createApp1(reader, piccMasterKey) {
  // 1. Authenticate to PICC with master key
  await authenticateAES(reader, 0, piccMasterKey);

  // 2. Create Application 1
  await createApplication(reader, {
    aid: 0xA10001,
    keySett1: 0x0F,           // App master key changeable with itself
    keySett2: 0x05,           // 5 keys (K0-K4)
    keySett3: 0x40,           // Multiple keysets enabled for rotation
    isoFileID: 0x0001,
    dfName: 'SABADO_PAY'
  });

  // 3. Select Application 1
  await selectApplication(reader, 0xA10001);

  // 4. Authenticate with default key
  await authenticateAES(reader, 0, DEFAULT_KEY);

  // 5. Generate and set all 5 keys for App 1
  const app1Keys = {
    K0: generateAESKey(), // AMK
    K1: generateAESKey(), // Read
    K2: generateAESKey(), // Write
    K3: generateAESKey(), // ChangeConfig
    K4: generateAESKey()  // Reserved
  };

  for (let i = 0; i < 5; i++) {
    await changeKeyEV2(reader, i, DEFAULT_KEY, app1Keys[`K${i}`]);
  }

  // 6. Store all App 1 keys in vault
  await vault.storeKeys({
    cardUID: cardUID,
    appAID: 0xA10001,
    keys: app1Keys,
    owner: 'Sabado'
  });

  return app1Keys;
}

// Step 3: Create files in Application 1
async function createApp1Files(reader, app1Keys) {
  // Authenticate with AMK
  await authenticateAES(reader, 0, app1Keys.K0);

  // File 0: Value file for balance
  await createValueFile(reader, {
    fileNo: 0,
    commSett: 0x03,        // Fully encrypted
    accessRights: 0x12E3,  // R=K1, W=K2, RW=K2, CHG=K3
    lowerLimit: 0,
    upperLimit: 1000000,
    value: 0,
    limitedCreditEnabled: 0x00
  });

  // File 1: Backup data file for transaction history
  await createBackupDataFile(reader, {
    fileNo: 1,
    commSett: 0x03,
    accessRights: 0x12E3,
    fileSize: 512
  });

  // File 2: Standard data file for metadata
  await createStdDataFile(reader, {
    fileNo: 2,
    commSett: 0x03,
    accessRights: 0x12E3,
    fileSize: 128
  });
}

// Step 4: Create Application 2 (for third-party)
async function createApp2(reader, piccMasterKey) {
  // 1. Authenticate to PICC
  await authenticateAES(reader, 0, piccMasterKey);

  // 2. Create Application 2 with 1KB storage
  await createApplication(reader, {
    aid: 0xA20001,
    keySett1: 0x0F,
    keySett2: 0x05,           // 5 keys
    keySett3: 0x40,           // Multiple keysets
    isoFileID: 0x0002,
    dfName: 'THIRD_PARTY'
  });

  // 3. Select Application 2
  await selectApplication(reader, 0xA20001);

  // 4. Authenticate with default key
  await authenticateAES(reader, 0, DEFAULT_KEY);

  // 5. Generate temporary keys (to be changed by third-party)
  const app2TempKeys = {
    K0: generateAESKey(),
    K1: generateAESKey(),
    K2: generateAESKey(),
    K3: generateAESKey(),
    K4: generateAESKey()
  };

  // 6. Set temporary keys
  for (let i = 0; i < 5; i++) {
    await changeKeyEV2(reader, i, DEFAULT_KEY, app2TempKeys[`K${i}`]);
  }

  // 7. Return temp keys to third-party securely
  // Third-party will then change K0 to their own master key
  return app2TempKeys;
}

// Step 5: Create files in Application 2
async function createApp2Files(reader, app2TempKeys) {
  // Authenticate with AMK
  await authenticateAES(reader, 0, app2TempKeys.K0);

  // File 0: 512 bytes standard data
  await createStdDataFile(reader, {
    fileNo: 0,
    commSett: 0x03,
    accessRights: 0x12E3,
    fileSize: 512
  });

  // File 1: 512 bytes standard data
  await createStdDataFile(reader, {
    fileNo: 1,
    commSett: 0x03,
    accessRights: 0x12E3,
    fileSize: 512
  });
}
```

### 4.2 Third-Party Key Takeover

After Sabado creates Application 2, the third-party performs:

```javascript
async function thirdPartyTakeover(reader, app2TempKeys) {
  // 1. Select Application 2
  await selectApplication(reader, 0xA20001);

  // 2. Authenticate with temporary AMK
  await authenticateAES(reader, 0, app2TempKeys.K0);

  // 3. Generate third-party's own keys
  const thirdPartyKeys = {
    K0: generateAESKey(), // Their own master key
    K1: generateAESKey(),
    K2: generateAESKey(),
    K3: generateAESKey(),
    K4: generateAESKey()
  };

  // 4. Change all keys to third-party keys
  for (let i = 0; i < 5; i++) {
    await changeKeyEV2(reader, i, app2TempKeys[`K${i}`], thirdPartyKeys[`K${i}`]);
  }

  // 5. Store in their own secure vault
  await thirdPartyVault.storeKeys({
    appAID: 0xA20001,
    keys: thirdPartyKeys
  });

  // Now Sabado has NO ACCESS to App 2 data
  return thirdPartyKeys;
}
```

---

## 5. Offline Payment Operations

### 5.1 Balance Inquiry

```javascript
async function getBalance(reader, cardUID) {
  // 1. Retrieve keys from vault
  const app1Keys = await vault.getKeys(cardUID, 0xA10001);

  // 2. Select Application 1
  await selectApplication(reader, 0xA10001);

  // 3. Authenticate with Read key (K1)
  await authenticateEV2First(reader, 1, app1Keys.K1);

  // 4. Get value from file 0
  const balance = await getValue(reader, 0);

  return balance;
}
```

### 5.2 Top-Up (Credit)

```javascript
async function topUp(reader, cardUID, amount) {
  // 1. Get keys
  const app1Keys = await vault.getKeys(cardUID, 0xA10001);

  // 2. Select and authenticate
  await selectApplication(reader, 0xA10001);
  await authenticateEV2First(reader, 2, app1Keys.K2); // Write key

  // 3. Credit value file
  await credit(reader, 0, amount);
  await commitTransaction(reader);

  // 4. Log transaction
  const txRecord = {
    timestamp: Date.now(),
    type: 'CREDIT',
    amount: amount,
    balanceAfter: await getValue(reader, 0)
  };

  await logTransaction(reader, 1, txRecord, app1Keys.K2);

  return txRecord;
}
```

### 5.3 Payment (Debit)

```javascript
async function makePayment(reader, cardUID, amount) {
  // 1. Get keys
  const app1Keys = await vault.getKeys(cardUID, 0xA10001);

  // 2. Select and authenticate
  await selectApplication(reader, 0xA10001);
  await authenticateEV2First(reader, 2, app1Keys.K2);

  // 3. Check balance
  const currentBalance = await getValue(reader, 0);
  if (currentBalance < amount) {
    throw new Error('Insufficient balance');
  }

  // 4. Debit value file
  await debit(reader, 0, amount);
  await commitTransaction(reader);

  // 5. Log transaction
  const txRecord = {
    timestamp: Date.now(),
    type: 'DEBIT',
    amount: amount,
    balanceAfter: await getValue(reader, 0)
  };

  await logTransaction(reader, 1, txRecord, app1Keys.K2);

  return txRecord;
}
```

### 5.4 Transaction History

```javascript
async function getTransactionHistory(reader, cardUID) {
  // 1. Get keys
  const app1Keys = await vault.getKeys(cardUID, 0xA10001);

  // 2. Select and authenticate
  await selectApplication(reader, 0xA10001);
  await authenticateEV2First(reader, 1, app1Keys.K1); // Read key

  // 3. Read backup data file
  const historyData = await readData(reader, 1, 0, 512);

  // 4. Parse records (32 records × 16 bytes)
  const records = [];
  for (let i = 0; i < 32; i++) {
    const offset = i * 16;
    const record = parseTransaction(historyData.slice(offset, offset + 16));
    if (record.timestamp > 0) {
      records.push(record);
    }
  }

  return records;
}
```

---

## 6. Security Considerations

### 6.1 Isolation Between Applications

- ✅ **Cryptographic Isolation**: Each app has independent AES keys
- ✅ **Memory Isolation**: Apps cannot read each other's files
- ✅ **Key Independence**: Compromise of App 1 keys does NOT affect App 2
- ✅ **PICC Protection**: Only Sabado can create/delete applications

### 6.2 Offline Security

**Value File MAC Verification:**
- Every credit/debit operation generates a MAC
- MAC is verified on next read to detect tampering
- Transaction is rolled back if MAC validation fails

**Encrypted Communication:**
- All read/write operations use AES encryption
- Session keys derived from authentication
- Prevents eavesdropping and replay attacks

**Key Rotation:**
- Support for multiple keysets (KS1-KS16)
- Zero-downtime rotation using RollKeySet
- Recommended rotation: every 90-180 days

### 6.3 Third-Party Trust Model

```
Sabado Trust Model:
┌────────────────────────────────────────────┐
│ What Sabado CAN do:                        │
│ ✅ Create/delete Application 2             │
│ ✅ See that App 2 exists                   │
│ ✅ Monitor card-level operations           │
└────────────────────────────────────────────┘

┌────────────────────────────────────────────┐
│ What Sabado CANNOT do:                     │
│ ❌ Read App 2 data without keys            │
│ ❌ Modify App 2 files without keys         │
│ ❌ Access App 2 keys (owned by 3rd party)  │
│ ❌ Impersonate third-party operations      │
└────────────────────────────────────────────┘
```

---

## 7. Node.js Implementation Stack

### 7.1 Core Dependencies

```json
{
  "name": "sabado-desfire-card",
  "version": "1.0.0",
  "dependencies": {
    "nfc-pcsc": "^0.8.0",
    "node-forge": "^1.3.1",
    "express": "^4.18.2",
    "pg": "^8.11.0",
    "dotenv": "^16.3.1",
    "winston": "^3.11.0",
    "joi": "^17.11.0"
  },
  "devDependencies": {
    "typescript": "^5.3.3",
    "@types/node": "^20.10.6",
    "jest": "^29.7.0",
    "ts-node": "^10.9.2"
  }
}
```

### 7.2 Project Structure

```
sabado-desfire/
├── src/
│   ├── card/
│   │   ├── desfire.ts           # DESFire command wrappers
│   │   ├── apdu.ts              # APDU builder/parser
│   │   ├── crypto.ts            # AES encryption/MAC
│   │   └── reader.ts            # NFC reader interface
│   ├── vault/
│   │   ├── vault.service.ts     # Key storage service
│   │   ├── encryption.ts        # Key encryption at rest
│   │   └── models.ts            # Database models
│   ├── api/
│   │   ├── payment.routes.ts    # Payment endpoints
│   │   ├── card.routes.ts       # Card management
│   │   └── middleware.ts        # Auth/validation
│   ├── services/
│   │   ├── provisioning.ts      # Card provisioning logic
│   │   ├── payment.service.ts   # Payment operations
│   │   └── key-rotation.ts      # Key management
│   └── index.ts                 # Main entry point
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── config/
│   ├── database.ts
│   └── keys.ts
├── .env.example
├── package.json
└── README.md
```

---

## 8. Hardware Requirements

### 8.1 For Development (Required)

**NFC Reader:**
- **Model**: ACR122U USB NFC Reader
- **Price**: ~$40
- **Connection**: USB to MacBook
- **Compatibility**: PC/SC compliant, works with nfc-pcsc
- **Purpose**: Card provisioning, testing, development

**Alternative**: ACR1252U (~$60) - Better build quality

### 8.2 Cards (Provided)

- **Model**: MIFARE DESFire EV2 or EV3 4K
- **Quantity**: Sample cards available
- **Memory**: 4KB
- **UID**: 7-byte unique ID

### 8.3 For Production (Optional)

**iPhone NFC Development:**
- iPhone 7 or newer with iOS 13+
- Xcode for CoreNFC development
- Apple Developer account ($99/year)

---

## 9. Implementation Phases

### Phase 1: Foundation (Week 1)
- [ ] Set up Node.js project with TypeScript
- [ ] Install ACR122U reader and test connectivity
- [ ] Implement basic APDU communication
- [ ] Test reading card UID

### Phase 2: Card Communication (Week 2)
- [ ] Implement DESFire SelectApplication
- [ ] Implement AuthenticateEV2First/AuthenticateAES
- [ ] Implement session key derivation
- [ ] Test authentication with default keys

### Phase 3: Provisioning (Week 3)
- [ ] Implement PICC master key setup
- [ ] Implement Application 1 creation with 5 keys
- [ ] Implement Application 2 creation with 5 keys
- [ ] Create value file and data files for App 1
- [ ] Create data files for App 2

### Phase 4: Payment Operations (Week 4)
- [ ] Implement GetValue (balance inquiry)
- [ ] Implement Credit (top-up)
- [ ] Implement Debit (payment)
- [ ] Implement transaction logging
- [ ] Test offline payment flow

### Phase 5: Key Management (Week 5)
- [ ] Implement DB Vault for key storage
- [ ] Implement key encryption at rest
- [ ] Implement key rotation workflow
- [ ] Test multi-keyset rotation

### Phase 6: API & Security (Week 6)
- [ ] Build REST API for payment operations
- [ ] Add authentication and authorization
- [ ] Implement audit logging
- [ ] Security testing and hardening

---

## 10. Next Steps

1. **Order USB NFC Reader**: Purchase ACR122U from Amazon (~$40)
2. **Verify Card Model**: Confirm DESFire EV2 or EV3 on your 4K cards
3. **Set Up Development Environment**: Install Node.js 18+, PostgreSQL
4. **Start with Phase 1**: Basic reader connectivity and UID reading
5. **Provision First Card**: Follow provisioning workflow for 2 apps

---

## 11. FAQ

**Q: Can Sabado access Application 2 data?**
A: No. After the third-party changes the App 2 keys, Sabado cannot authenticate to App 2 and therefore cannot read or write its data. Only the third-party has access.

**Q: Can the third-party access Application 1 data?**
A: No. App 1 keys are owned by Sabado and never shared. The third-party cannot access App 1.

**Q: Can Sabado delete Application 2?**
A: Yes. Sabado owns the PICC master key and can delete any application. However, this would be a destructive operation that requires card-level authentication.

**Q: Is iPhone NFC sufficient for all operations?**
A: For end-user transactions (balance check, payment), yes. For card provisioning and key management, a dedicated USB reader is strongly recommended.

**Q: How secure is offline payment?**
A: Very secure. Value file operations include MAC verification, encrypted communication, and transaction commit/rollback. Tampering is detected and rejected.

**Q: What happens if the card is lost?**
A: The PICC master key and app keys remain in Sabado's vault. A new card can be provisioned with the same keys, and the old card can be blacklisted by serial number (UID).

---

**Document Owner**: Sabado Technical Team
**Last Updated**: 2025-10-14
**Status**: Ready for Implementation
**Estimated Timeline**: 6 weeks
