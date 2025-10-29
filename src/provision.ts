/**
 * Card Provisioning Script
 * Provisions DESFire cards with 2 applications:
 * - App 1 (0x000001): Sabado Payment Application
 * - App 2 (0x000002): Third-Party Application (1KB storage)
 */

import 'dotenv/config';
import NFCReaderManager from './card/reader';
import DESFireCard from './card/desfire';

// Application IDs
const APP1_SABADO_PAYMENT = 0x000001;
const APP2_THIRD_PARTY = 0x000002;

// Key Settings
const KEY_SETTING_MASTER_CHANGEABLE = 0x0F; // Master key is changeable, all keys changeable
const NUM_KEYS = 5; // K0-K4 for each application
// Use DES/3DES key type by default for broad compatibility (EV1/ACR122U).
// EV2/EV3 with AES can be enabled later.
const KEY_TYPE_AES = 0x00;

// File IDs
const FILE_BALANCE = 0x00; // Value file for balance
const FILE_TX_HISTORY = 0x01; // Standard data file for transaction history
const FILE_METADATA = 0x02; // Standard data file for metadata

// Access Rights (2 bytes: nibbles for Read, Write, ReadWrite, ChangeAccessRights)
// Format: RW | CAR | R | W (each 4 bits = key number 0-13, or 0xE=free, 0xF=deny)
function createAccessRights(read: number, write: number, readWrite: number, change: number): Buffer {
  const byte1 = (readWrite << 4) | change;
  const byte2 = (read << 4) | write;
  return Buffer.from([byte2, byte1]);
}

async function provisionCard() {
  console.log('='.repeat(60));
  console.log('DESFire Card Provisioning');
  console.log('='.repeat(60));
  console.log('');

  const readerManager = new NFCReaderManager();

  // Wait for reader
  await new Promise<void>((resolve) => {
    console.log('Waiting for NFC reader...');
    readerManager.once('reader-connected', () => {
      console.log('Reader connected!');
      resolve();
    });
  });

  // Wait for card
  const { reader, card } = await new Promise<any>((resolve) => {
    console.log('Place DESFire card on reader...');
    readerManager.once('card-detected', resolve);
  });

  try {
    const desfireCard = new DESFireCard(reader);

    console.log('');
    console.log('Step 1: Getting card version...');
    const version = await desfireCard.getVersion();
    console.log(`Hardware: ${version.hardware.toString('hex')}`);
    console.log(`Software: ${version.software.toString('hex')}`);
    console.log(`UID: ${version.uid.toString('hex')}`);

    console.log('');
    console.log('Step 2: Checking existing applications...');
    const existingApps = await desfireCard.getApplicationIDs();
    console.log(`Found ${existingApps.length} existing applications: ${existingApps.map(a => '0x' + a.toString(16).padStart(6, '0')).join(', ')}`);

    // Check if we need to format (optional - remove in production)
    if (existingApps.length > 0) {
      console.log('');
      console.log('WARNING: Card already has applications. Format first? (y/n)');
      // For now, we'll skip formatting. Uncomment below to enable:
      // await desfireCard.formatPICC();
      // console.log('Card formatted.');
    }

    console.log('');
    console.log('Ensuring PICC (0x000000) is selected...');
    try {
      await desfireCard.selectApplication(0x000000);
      console.log('PICC selected.');
    } catch (e) {
      console.log(`PICC select attempt result: ${e}`);
    }

    console.log('');
    console.log('Step 3: Creating Application 1 (Sabado Payment)...');
    try {
      await desfireCard.createApplication(
        APP1_SABADO_PAYMENT,
        KEY_SETTING_MASTER_CHANGEABLE,
        NUM_KEYS,
        KEY_TYPE_AES
      );
      console.log('App 1 created successfully');
    } catch (error) {
      console.log(`App 1 may already exist: ${error}`);
    }

    console.log('');
    console.log('Step 4: Selecting Application 1...');
    await desfireCard.selectApplication(APP1_SABADO_PAYMENT);

    console.log('');
    console.log('Step 5: Creating files in Application 1...');
    let existingApp1Files: number[] = [];
    try {
      existingApp1Files = await desfireCard.getFileIDs();
      console.log(`Existing files in App 1: ${existingApp1Files.join(', ') || '(none)'}`);
    } catch {
      // ignore
    }

    // File 0: Balance (Value File)
    // Access: Read=Key1, Write=Key2, ReadWrite=Key2, Change=Key3
    if (!existingApp1Files.includes(FILE_BALANCE)) {
      console.log('Creating balance file (Value File 0)...');
      try {
        const balanceAccessRights = createAccessRights(1, 2, 2, 3);
        await desfireCard.createValueFile(
          FILE_BALANCE,
          0x00, // Plain communication
          balanceAccessRights,
          0,        // Lower limit: 0
          1000000,  // Upper limit: 1,000,000
          0,        // Initial value: 0
          0x00      // Limited credit disabled
        );
        console.log('Balance file created');
      } catch (error) {
        console.log(`Balance file may already exist: ${error}`);
      }
    } else {
      console.log('Balance file already exists; skipping');
    }

    // File 1: Transaction History (Standard Data File, 1KB)
    if (!existingApp1Files.includes(FILE_TX_HISTORY)) {
      console.log('Creating transaction history file (Std Data File 1)...');
      try {
        const txAccessRights = createAccessRights(1, 2, 2, 3);
        await desfireCard.createStdDataFile(
          FILE_TX_HISTORY,
          0x00,
          txAccessRights,
          1024 // 1KB
        );
        console.log('Transaction history file created');
      } catch (error) {
        console.log(`Transaction history file may already exist: ${error}`);
      }
    } else {
      console.log('Transaction history file already exists; skipping');
    }

    // File 2: Metadata (Standard Data File, 256 bytes)
    if (!existingApp1Files.includes(FILE_METADATA)) {
      console.log('Creating metadata file (Std Data File 2)...');
      try {
        const metadataAccessRights = createAccessRights(1, 2, 2, 3);
        await desfireCard.createStdDataFile(
          FILE_METADATA,
          0x00,
          metadataAccessRights,
          256
        );
        console.log('Metadata file created');
      } catch (error) {
        console.log(`Metadata file may already exist: ${error}`);
      }
    } else {
      console.log('Metadata file already exists; skipping');
    }

    // Ensure we are back at PICC level before creating another application
    console.log('');
    console.log('Returning to PICC to create Application 2...');
    try {
      await desfireCard.selectApplication(0x000000);
      console.log('PICC selected.');
    } catch (e) {
      console.log(`PICC select attempt result: ${e}`);
    }

    console.log('');
    console.log('Step 6: Creating Application 2 (Third-Party)...');
    try {
      await desfireCard.createApplication(
        APP2_THIRD_PARTY,
        KEY_SETTING_MASTER_CHANGEABLE,
        NUM_KEYS,
        KEY_TYPE_AES
      );
      console.log('App 2 created successfully');
    } catch (error) {
      console.log(`App 2 may already exist: ${error}`);
    }

    console.log('');
    console.log('Step 7: Selecting Application 2...');
    await desfireCard.selectApplication(APP2_THIRD_PARTY);

    console.log('');
    console.log('Step 8: Creating 1KB storage file in Application 2...');
    try {
      let app2Existing: number[] = [];
      try {
        app2Existing = await desfireCard.getFileIDs();
      } catch {}
      if (!app2Existing.includes(0x00)) {
        // Third-party can define their own access rights
        const thirdPartyAccessRights = createAccessRights(1, 2, 2, 3);
        await desfireCard.createStdDataFile(
          0x00, // File 0 in App 2
          0x00,
          thirdPartyAccessRights,
          1024 // 1KB as requested
        );
        console.log('Third-party storage file created');
      } else {
        console.log('Third-party storage file already exists; skipping');
      }
    } catch (error) {
      console.log(`Third-party file may already exist: ${error}`);
    }

    console.log('');
    console.log('Step 9: Verifying provisioning...');
    await desfireCard.selectApplication(APP1_SABADO_PAYMENT);
    const app1Files = await desfireCard.getFileIDs();
    console.log(`App 1 files: ${app1Files.join(', ')}`);

    await desfireCard.selectApplication(APP2_THIRD_PARTY);
    const app2Files = await desfireCard.getFileIDs();
    console.log(`App 2 files: ${app2Files.join(', ')}`);

    console.log('');
    console.log('Step 10: Checking free memory...');
    const freeMemory = await desfireCard.getFreeMemory();
    console.log(`Free memory: ${freeMemory} bytes`);

    console.log('');
    console.log('='.repeat(60));
    console.log('PROVISIONING COMPLETE!');
    console.log('='.repeat(60));
    console.log('');
    console.log('Summary:');
    console.log(`- Card UID: ${card.uid}`);
    console.log(`- App 1 (Sabado Payment): 0x${APP1_SABADO_PAYMENT.toString(16).padStart(6, '0')}`);
    console.log(`  - Balance file (Value File 0)`);
    console.log(`  - Transaction history (Std Data File 1, 1KB)`);
    console.log(`  - Metadata (Std Data File 2, 256B)`);
    console.log(`- App 2 (Third-Party): 0x${APP2_THIRD_PARTY.toString(16).padStart(6, '0')}`);
    console.log(`  - Storage file (Std Data File 0, 1KB)`);
    console.log(`- Free memory: ${freeMemory} bytes`);
    console.log('');
    console.log('Next steps:');
    console.log('1. Generate and store AES-128 keys for both applications');
    console.log('2. Change default keys from factory defaults');
    console.log('3. Implement authentication for file operations');
    console.log('4. Test balance credit/debit operations');

  } catch (error) {
    console.error('');
    console.error('ERROR:', error);
    console.error('');
    console.error('Provisioning failed. Please check:');
    console.error('- Card is DESFire EV2/EV3');
    console.error('- Card is properly placed on reader');
    console.error('- No other NFC applications are interfering');
  } finally {
    readerManager.close();
    process.exit(0);
  }
}

// Run provisioning
provisionCard().catch(console.error);
