# DESFire Sabado Card - Quick Start Guide

## Prerequisites

1. **Hardware**:
   - ACR122U USB NFC Reader (~$40 from Amazon)
   - MIFARE DESFire EV2/EV3 4K card (you have samples)
   - MacBook with USB port

2. **Software**:
   - Node.js 18+ LTS
   - PostgreSQL 14+ (optional for production, can use SQLite for dev)
   - Git

---

## Step 1: Hardware Setup

### Install ACR122U Driver (macOS)

```bash
# Check if PC/SC daemon is running
ps aux | grep pcscd

# If not running, install
brew install pcsc-lite

# Start the service
brew services start pcsc-lite
```

### Test Reader Connection

```bash
# List connected readers
pcsctest

# Expected output:
# PC/SC device scanner
# V 1.x.x (c) 2001-2017, Ludovic Rousseau <ludovic.rousseau@free.fr>
# Using reader plug'n play mechanism
# Scanning present readers...
# 0: ACS ACR122U PICC Interface 00 00
```

---

## Step 2: Project Setup

### Create Project Directory

```bash
mkdir sabado-desfire
cd sabado-desfire
npm init -y
```

### Install Dependencies

```bash
# Core dependencies
npm install nfc-pcsc node-forge express dotenv winston

# Development dependencies
npm install -D typescript @types/node @types/express ts-node nodemon

# Initialize TypeScript
npx tsc --init
```

### Update `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules"]
}
```

### Update `package.json` Scripts

```json
{
  "scripts": {
    "dev": "nodemon --exec ts-node src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "jest"
  }
}
```

---

## Step 3: Create Basic Card Reader

### File: `src/utils/logger.ts`

```typescript
import winston from 'winston';

export const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => {
      return `${timestamp} [${level.toUpperCase()}]: ${message}`;
    })
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'card-operations.log' })
  ]
});
```

### File: `src/card/apdu.ts`

```typescript
/**
 * APDU (Application Protocol Data Unit) utilities
 */

export interface APDU {
  cla: number;  // Class byte
  ins: number;  // Instruction byte
  p1: number;   // Parameter 1
  p2: number;   // Parameter 2
  data?: Buffer; // Command data
  le?: number;  // Expected response length
}

/**
 * Build APDU command buffer
 */
export function buildAPDU(apdu: APDU): Buffer {
  const parts: number[] = [apdu.cla, apdu.ins, apdu.p1, apdu.p2];

  if (apdu.data && apdu.data.length > 0) {
    parts.push(apdu.data.length);
    parts.push(...apdu.data);
  }

  if (apdu.le !== undefined) {
    parts.push(apdu.le);
  }

  return Buffer.from(parts);
}

/**
 * Parse APDU response
 */
export function parseAPDUResponse(response: Buffer): {
  data: Buffer;
  sw1: number;
  sw2: number;
  statusWord: number;
  success: boolean;
} {
  if (response.length < 2) {
    throw new Error('Invalid APDU response: too short');
  }

  const sw1 = response[response.length - 2];
  const sw2 = response[response.length - 1];
  const data = response.slice(0, response.length - 2);
  const statusWord = (sw1 << 8) | sw2;

  return {
    data,
    sw1,
    sw2,
    statusWord,
    success: sw1 === 0x90 || sw1 === 0x91
  };
}

/**
 * Get status word description
 */
export function getStatusDescription(sw1: number, sw2: number): string {
  const statusWord = (sw1 << 8) | sw2;

  const descriptions: Record<number, string> = {
    0x9000: 'Success',
    0x9100: 'Success with additional frame',
    0x6A82: 'File not found',
    0x6982: 'Security status not satisfied',
    0x6985: 'Conditions of use not satisfied',
    0x6A86: 'Incorrect parameters P1-P2',
    0x6A88: 'Referenced data not found',
    0x6D00: 'Instruction not supported',
    0x6E00: 'Class not supported',
    0x9D: 'Permission denied',
    0xAE: 'Authentication error'
  };

  return descriptions[statusWord] || `Unknown status: 0x${statusWord.toString(16)}`;
}
```

### File: `src/card/reader.ts`

```typescript
import { NFC, TAG_ISO_14443_3, TAG_ISO_14443_4 } from 'nfc-pcsc';
import { logger } from '../utils/logger';
import { buildAPDU, parseAPDUResponse, APDU } from './apdu';

export class CardReader {
  private nfc: NFC;
  private reader: any = null;
  private card: any = null;

  constructor() {
    this.nfc = new NFC();
  }

  /**
   * Initialize reader and wait for card
   */
  async initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      logger.info('🔍 Initializing NFC reader...');

      this.nfc.on('reader', (reader) => {
        logger.info(`✅ Reader detected: ${reader.name}`);
        this.reader = reader;

        reader.on('card', (card) => {
          logger.info(`💳 Card detected: UID = ${card.uid}`);
          this.card = card;
          resolve();
        });

        reader.on('card.off', () => {
          logger.info('💳 Card removed');
          this.card = null;
        });

        reader.on('error', (err) => {
          logger.error(`❌ Reader error: ${err.message}`);
          reject(err);
        });
      });

      this.nfc.on('error', (err) => {
        logger.error(`❌ NFC error: ${err.message}`);
        reject(err);
      });

      // Timeout after 30 seconds
      setTimeout(() => {
        if (!this.card) {
          reject(new Error('Timeout: No card detected'));
        }
      }, 30000);
    });
  }

  /**
   * Get card UID
   */
  getUID(): string {
    if (!this.card) {
      throw new Error('No card present');
    }
    return this.card.uid;
  }

  /**
   * Send raw APDU command
   */
  async sendAPDU(apdu: APDU): Promise<Buffer> {
    if (!this.reader) {
      throw new Error('Reader not initialized');
    }

    const command = buildAPDU(apdu);
    logger.info(`📤 Sending APDU: ${command.toString('hex')}`);

    try {
      const response = await this.reader.transmit(command, 255);
      logger.info(`📥 Response: ${response.toString('hex')}`);

      const parsed = parseAPDUResponse(response);
      if (!parsed.success) {
        throw new Error(`APDU error: ${parsed.sw1.toString(16)} ${parsed.sw2.toString(16)}`);
      }

      return parsed.data;
    } catch (error: any) {
      logger.error(`❌ APDU transmission error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Close reader connection
   */
  close(): void {
    if (this.nfc) {
      logger.info('Closing NFC connection');
      this.nfc.close();
    }
  }
}
```

### File: `src/card/desfire.ts`

```typescript
import { CardReader } from './reader';
import { logger } from '../utils/logger';
import crypto from 'crypto';

export class DESFire {
  private reader: CardReader;

  constructor(reader: CardReader) {
    this.reader = reader;
  }

  /**
   * Get DESFire version information
   */
  async getVersion(): Promise<any> {
    logger.info('📋 Getting DESFire version...');

    // Command: GetVersion (0x60)
    const response1 = await this.reader.sendAPDU({
      cla: 0x90,
      ins: 0x60,
      p1: 0x00,
      p2: 0x00,
      le: 0x00
    });

    logger.info(`Hardware info: ${response1.toString('hex')}`);

    // Additional frames (0xAF)
    const response2 = await this.reader.sendAPDU({
      cla: 0x90,
      ins: 0xAF,
      p1: 0x00,
      p2: 0x00,
      le: 0x00
    });

    logger.info(`Software info: ${response2.toString('hex')}`);

    const response3 = await this.reader.sendAPDU({
      cla: 0x90,
      ins: 0xAF,
      p1: 0x00,
      p2: 0x00,
      le: 0x00
    });

    logger.info(`Production info: ${response3.toString('hex')}`);

    return {
      hardware: response1,
      software: response2,
      production: response3
    };
  }

  /**
   * Get list of application AIDs on card
   */
  async getApplicationIDs(): Promise<number[]> {
    logger.info('📋 Getting application IDs...');

    const response = await this.reader.sendAPDU({
      cla: 0x90,
      ins: 0x6A, // GetApplicationIDs
      p1: 0x00,
      p2: 0x00,
      le: 0x00
    });

    // Parse AIDs (3 bytes each)
    const aids: number[] = [];
    for (let i = 0; i < response.length; i += 3) {
      const aid = (response[i] << 16) | (response[i + 1] << 8) | response[i + 2];
      aids.push(aid);
    }

    logger.info(`Found ${aids.length} applications: ${aids.map(a => '0x' + a.toString(16)).join(', ')}`);
    return aids;
  }

  /**
   * Select application by AID
   */
  async selectApplication(aid: number): Promise<void> {
    logger.info(`🎯 Selecting application: 0x${aid.toString(16)}`);

    const aidBuffer = Buffer.alloc(3);
    aidBuffer[0] = (aid >> 16) & 0xFF;
    aidBuffer[1] = (aid >> 8) & 0xFF;
    aidBuffer[2] = aid & 0xFF;

    await this.reader.sendAPDU({
      cla: 0x90,
      ins: 0x5A, // SelectApplication
      p1: 0x00,
      p2: 0x00,
      data: aidBuffer,
      le: 0x00
    });

    logger.info(`✅ Application selected: 0x${aid.toString(16)}`);
  }

  /**
   * Format PICC (WARNING: Erases all data!)
   */
  async formatPICC(): Promise<void> {
    logger.warn('⚠️  Formatting PICC - This will erase ALL data!');

    await this.reader.sendAPDU({
      cla: 0x90,
      ins: 0xFC, // FormatPICC
      p1: 0x00,
      p2: 0x00,
      le: 0x00
    });

    logger.info('✅ PICC formatted successfully');
  }

  /**
   * Create application
   */
  async createApplication(
    aid: number,
    keySett1: number,
    keySett2: number,
    keySett3: number = 0x00,
    isoFileID?: number,
    dfName?: string
  ): Promise<void> {
    logger.info(`🔨 Creating application: 0x${aid.toString(16)}`);

    const data: number[] = [
      (aid >> 16) & 0xFF,
      (aid >> 8) & 0xFF,
      aid & 0xFF,
      keySett1,
      keySett2,
      keySett3
    ];

    if (isoFileID !== undefined) {
      data.push((isoFileID >> 8) & 0xFF);
      data.push(isoFileID & 0xFF);
    }

    if (dfName) {
      const nameBytes = Buffer.from(dfName, 'ascii');
      data.push(...nameBytes);
    }

    await this.reader.sendAPDU({
      cla: 0x90,
      ins: 0xCA, // CreateApplication
      p1: 0x00,
      p2: 0x00,
      data: Buffer.from(data),
      le: 0x00
    });

    logger.info(`✅ Application created: 0x${aid.toString(16)}`);
  }

  /**
   * Generate AES-128 key
   */
  generateAESKey(): Buffer {
    return crypto.randomBytes(16); // 128 bits = 16 bytes
  }

  /**
   * Get default DESFire key (all zeros)
   */
  getDefaultKey(): Buffer {
    return Buffer.alloc(16); // 16 bytes of 0x00
  }
}
```

### File: `src/index.ts`

```typescript
import { CardReader } from './card/reader';
import { DESFire } from './card/desfire';
import { logger } from './utils/logger';

async function main() {
  const reader = new CardReader();

  try {
    // Initialize reader and wait for card
    logger.info('🚀 Starting Sabado DESFire Card Manager...');
    await reader.initialize();

    // Get card UID
    const uid = reader.getUID();
    logger.info(`📇 Card UID: ${uid}`);

    // Create DESFire instance
    const desfire = new DESFire(reader);

    // Get version
    const version = await desfire.getVersion();
    logger.info('✅ Card version retrieved');

    // Get existing applications
    const apps = await desfire.getApplicationIDs();
    logger.info(`📱 Found ${apps.length} existing application(s)`);

    // Keep listening for cards
    logger.info('✅ Ready! Place card on reader to interact...');
    logger.info('Press Ctrl+C to exit');

    // Keep process running
    await new Promise(() => {});

  } catch (error: any) {
    logger.error(`❌ Error: ${error.message}`);
    process.exit(1);
  } finally {
    reader.close();
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  logger.info('👋 Shutting down...');
  process.exit(0);
});

main();
```

### File: `.env.example`

```env
# Node Environment
NODE_ENV=development

# Database (for production)
DB_HOST=localhost
DB_PORT=5432
DB_NAME=sabado_desfire
DB_USER=postgres
DB_PASSWORD=your_password

# Encryption
VAULT_MASTER_KEY=generate_with_openssl_rand_hex_32

# Logging
LOG_LEVEL=info
LOG_FILE=card-operations.log
```

---

## Step 4: Run the Basic Test

```bash
# Install dependencies
npm install

# Place your DESFire card on the reader
npm run dev
```

**Expected Output:**

```
2025-10-14T22:30:00.000Z [INFO]: 🚀 Starting Sabado DESFire Card Manager...
2025-10-14T22:30:00.100Z [INFO]: 🔍 Initializing NFC reader...
2025-10-14T22:30:00.200Z [INFO]: ✅ Reader detected: ACS ACR122U PICC Interface
2025-10-14T22:30:01.000Z [INFO]: 💳 Card detected: UID = 04a1b2c3d4e5f6
2025-10-14T22:30:01.100Z [INFO]: 📇 Card UID: 04a1b2c3d4e5f6
2025-10-14T22:30:01.200Z [INFO]: 📋 Getting DESFire version...
2025-10-14T22:30:01.300Z [INFO]: Hardware info: 04010101001805
2025-10-14T22:30:01.400Z [INFO]: Software info: 04010101000a05
2025-10-14T22:30:01.500Z [INFO]: Production info: 0401010100091e
2025-10-14T22:30:01.600Z [INFO]: ✅ Card version retrieved
2025-10-14T22:30:01.700Z [INFO]: 📋 Getting application IDs...
2025-10-14T22:30:01.800Z [INFO]: Found 0 applications
2025-10-14T22:30:01.900Z [INFO]: 📱 Found 0 existing application(s)
2025-10-14T22:30:02.000Z [INFO]: ✅ Ready! Place card on reader to interact...
```

---

## Step 5: Card Provisioning Script

### File: `src/provision.ts`

```typescript
import { CardReader } from './card/reader';
import { DESFire } from './card/desfire';
import { logger } from './utils/logger';
import fs from 'fs';
import path from 'path';

interface CardKeys {
  uid: string;
  piccMasterKey: string;
  app1Keys: {
    K0: string;
    K1: string;
    K2: string;
    K3: string;
    K4: string;
  };
  app2TempKeys: {
    K0: string;
    K1: string;
    K2: string;
    K3: string;
    K4: string;
  };
}

async function provisionCard() {
  const reader = new CardReader();

  try {
    logger.info('🚀 Starting Sabado Card Provisioning...');
    await reader.initialize();

    const uid = reader.getUID();
    logger.info(`📇 Card UID: ${uid}`);

    const desfire = new DESFire(reader);

    // Check if card is blank
    const existingApps = await desfire.getApplicationIDs();
    if (existingApps.length > 0) {
      logger.warn('⚠️  Card has existing applications!');
      logger.warn('⚠️  Format card first (use npm run format)');
      return;
    }

    // Generate all keys
    logger.info('🔑 Generating keys...');
    const keys: CardKeys = {
      uid,
      piccMasterKey: desfire.generateAESKey().toString('hex'),
      app1Keys: {
        K0: desfire.generateAESKey().toString('hex'),
        K1: desfire.generateAESKey().toString('hex'),
        K2: desfire.generateAESKey().toString('hex'),
        K3: desfire.generateAESKey().toString('hex'),
        K4: desfire.generateAESKey().toString('hex')
      },
      app2TempKeys: {
        K0: desfire.generateAESKey().toString('hex'),
        K1: desfire.generateAESKey().toString('hex'),
        K2: desfire.generateAESKey().toString('hex'),
        K3: desfire.generateAESKey().toString('hex'),
        K4: desfire.generateAESKey().toString('hex')
      }
    };

    // Step 1: Create Application 1 (Sabado Payment)
    logger.info('📱 Creating Application 1 (Sabado Payment)...');
    await desfire.createApplication(
      0xA10001,  // AID
      0x0F,      // keySett1: AMK changeable
      0x05,      // keySett2: 5 keys
      0x40,      // keySett3: Multiple keysets enabled
      0x0001,    // ISO File ID
      'SABADO_PAY'
    );
    logger.info('✅ Application 1 created');

    // Step 2: Create Application 2 (Third-Party)
    logger.info('📱 Creating Application 2 (Third-Party)...');
    await desfire.createApplication(
      0xA20001,  // AID
      0x0F,
      0x05,
      0x40,
      0x0002,
      'THIRD_PARTY'
    );
    logger.info('✅ Application 2 created');

    // Save keys to file (SECURE THIS IN PRODUCTION!)
    const keysPath = path.join(__dirname, '..', 'keys', `${uid}.json`);
    fs.mkdirSync(path.dirname(keysPath), { recursive: true });
    fs.writeFileSync(keysPath, JSON.stringify(keys, null, 2));

    logger.info('✅ Provisioning complete!');
    logger.info(`📁 Keys saved to: ${keysPath}`);
    logger.info('⚠️  IMPORTANT: Secure this file and remove it from disk!');

    logger.info('\n📋 Next Steps:');
    logger.info('1. Change default keys to generated keys (use change-keys script)');
    logger.info('2. Create files in Application 1 (value file + data files)');
    logger.info('3. Create files in Application 2 (data files)');
    logger.info('4. Hand over App 2 temp keys to third-party for takeover');

  } catch (error: any) {
    logger.error(`❌ Provisioning failed: ${error.message}`);
  } finally {
    reader.close();
  }
}

provisionCard();
```

### Update `package.json`:

```json
{
  "scripts": {
    "dev": "ts-node src/index.ts",
    "provision": "ts-node src/provision.ts"
  }
}
```

---

## Step 6: Run Provisioning

```bash
# Place blank DESFire card on reader
npm run provision
```

This will:
1. Detect the card
2. Generate secure AES keys for PICC, App 1, and App 2
3. Create both applications on the card
4. Save keys to `keys/{UID}.json`

---

## Next Steps

1. **Implement Key Change**: Change default keys to generated keys
2. **Create Files**: Implement file creation for value and data files
3. **Implement Authentication**: Add AES authentication logic
4. **Build Payment Operations**: Credit/Debit/GetValue
5. **Create REST API**: Expose operations via HTTP endpoints

---

## Troubleshooting

### Reader Not Detected

```bash
# Check if reader is connected
system_profiler SPUSBDataType | grep ACR122

# Restart PC/SC daemon
brew services restart pcsc-lite
```

### Card Not Detected

- Ensure card is placed flat on reader
- Wait 2-3 seconds for detection
- Try removing and replacing the card

### APDU Errors

- Check if card is DESFire EV2/EV3
- Verify card is not write-protected
- Check if card is already provisioned

---

## Security Warnings

1. **DO NOT** commit keys to Git
2. **DO** encrypt keys at rest in production
3. **DO** use environment variables for sensitive data
4. **DO** implement proper access control
5. **DO** audit all key access operations

---

## Resources

- [NXP DESFire EV2 Datasheet](https://www.nxp.com/docs/en/data-sheet/MF3DX2_MF3DHx2_SDS.pdf)
- [DESFire Application Note](https://www.nxp.com/docs/en/application-note/AN12343.pdf)
- [nfc-pcsc Documentation](https://www.npmjs.com/package/nfc-pcsc)

---

**Ready to start!** 🚀

Once you receive your ACR122U reader, run through these steps and you'll have a working DESFire card provisioning system.
