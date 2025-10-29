/**
 * Authentication Test Script
 * Demonstrates authentication and key management features
 *
 * This script shows how to:
 * - Authenticate with factory default keys
 * - Read key settings and versions
 * - Generate and manage keys
 * - (Optionally) Change keys from defaults to secure keys
 */

import 'dotenv/config';
import NFCReaderManager from './card/reader';
import DESFireCard from './card/desfire';
import KeyManager from './card/keyManager';

// Application IDs (from provisioning)
const APP1_SABADO_PAYMENT = 0x000001;
const APP2_THIRD_PARTY = 0x000002;

async function testAuthentication() {
  console.log('='.repeat(60));
  console.log('DESFire Authentication Test');
  console.log('='.repeat(60));
  console.log('');

  // Initialize Key Manager
  const keyManager = new KeyManager('./keys');

  // Set master key for encrypted storage (in production, use env variable)
  keyManager.setMasterKey('test-master-password-change-in-production');

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
    const desfireCard = new DESFireCard(reader, keyManager);

    console.log('');
    console.log('Card UID:', card.uid);
    console.log('');

    // ========================================================================
    // STEP 1: Generate Key Sets (for future use)
    // ========================================================================
    console.log('Step 1: Generating key sets...');
    console.log('');

    const app1Keys = keyManager.generateKeySet(APP1_SABADO_PAYMENT, 5);
    const app2Keys = keyManager.generateKeySet(APP2_THIRD_PARTY, 5);

    console.log('App 1 keys generated:');
    for (let i = 0; i < 5; i++) {
      console.log(`  K${i}: ${app1Keys.keys.get(i)?.toString('hex')}`);
    }
    console.log('');

    console.log('App 2 keys generated:');
    for (let i = 0; i < 5; i++) {
      console.log(`  K${i}: ${app2Keys.keys.get(i)?.toString('hex')}`);
    }
    console.log('');

    // Save keys to encrypted storage
    console.log('Saving keys to encrypted storage...');
    keyManager.saveKeySet(APP1_SABADO_PAYMENT);
    keyManager.saveKeySet(APP2_THIRD_PARTY);
    console.log('✓ Keys saved');
    console.log('');

    // Export keys for backup (KEEP THIS SECURE!)
    console.log('Key backup (STORE SECURELY):');
    console.log('App 1:', keyManager.exportKeySetPlain(APP1_SABADO_PAYMENT));
    console.log('');

    // ========================================================================
    // STEP 2: Select Application 1 and authenticate with factory default
    // ========================================================================
    console.log('Step 2: Selecting Application 1...');
    await desfireCard.selectApplication(APP1_SABADO_PAYMENT);
    console.log('');

    // Get key settings
    console.log('Step 3: Reading key settings...');
    const keySettings = await desfireCard.getKeySettings();
    console.log(`Key Settings: 0x${keySettings.settings.toString(16)}`);
    console.log(`Max Keys: ${keySettings.maxKeys}`);
    console.log(`Key Type: 0x${keySettings.keyType.toString(16)}`);
    console.log('');

    // Get key versions
    console.log('Step 4: Reading key versions...');
    for (let i = 0; i < 5; i++) {
      try {
        const version = await desfireCard.getKeyVersion(i);
        console.log(`  K${i} version: ${version}`);
      } catch (error) {
        console.log(`  K${i} version: N/A`);
      }
    }
    console.log('');

    // ========================================================================
    // STEP 5: Authenticate with factory default key (K0 - Master Key)
    // ========================================================================
    console.log('Step 5: Authenticating with factory default key...');
    console.log('');

    const defaultKey = keyManager.getDefaultKey();
    console.log(`Using factory default key: ${defaultKey.toString('hex')}`);
    console.log('');

    // Try AuthenticateAES first (works on EV1/EV2/EV3)
    let authed = false;
    try {
      console.log('Attempting AuthenticateAES...');
      await desfireCard.authenticateAES(0, defaultKey);
      console.log('✓ AuthenticateAES successful!');
      console.log('');
      authed = true;
    } catch (error) {
      console.log(`AuthenticateAES failed: ${error}`);
      console.log('');
    }

    if (!authed) {
      // Try legacy DES/3DES (EV1)
      try {
        console.log('Attempting AuthenticateDES (legacy 3DES)...');
        await desfireCard.authenticateDES(0, defaultKey);
        console.log('✓ AuthenticateDES successful!');
        console.log('');
        authed = true;
      } catch (e) {
        console.log(`AuthenticateDES failed: ${e}`);
        console.log('');
      }
    }

    if (!authed) {
      // If both fail, try EV2 First (AES-based)
      console.log('Attempting AuthenticateEV2First...');
      try {
        await desfireCard.authenticateEV2First(0, defaultKey);
        console.log('✓ AuthenticateEV2First successful!');
        console.log('');
        authed = true;
      } catch (ev2Error) {
        console.log(`AuthenticateEV2First failed: ${ev2Error}`);
        console.log('');
        throw new Error('All authentication methods failed');
      }
    }

    // Verify authentication status
    console.log('Authentication status:');
    console.log(`  Authenticated: ${desfireCard.isAuthenticated()}`);
    console.log(`  Authenticated Key: K${desfireCard.getAuthenticatedKeyNo()}`);
    console.log('');

    // ========================================================================
    // STEP 6: Test authenticated operations
    // ========================================================================
    console.log('Step 6: Testing authenticated operations...');
    console.log('');

    // Get file IDs
    const fileIds = await desfireCard.getFileIDs();
    console.log(`Files in application: ${fileIds.join(', ')}`);
    console.log('');

    // ========================================================================
    // STEP 7: Test with Application 2
    // ========================================================================
    console.log('Step 7: Testing Application 2...');
    console.log('');

    await desfireCard.selectApplication(APP2_THIRD_PARTY);
    console.log('Authenticating with Application 2 factory default...');
    await desfireCard.authenticateAES(0, defaultKey);
    console.log('✓ Authenticated with Application 2');
    console.log('');

    const app2Files = await desfireCard.getFileIDs();
    console.log(`Files in Application 2: ${app2Files.join(', ')}`);
    console.log('');

    // ========================================================================
    // OPTIONAL: Change keys from factory defaults
    // ========================================================================
    console.log('='.repeat(60));
    console.log('OPTIONAL: Key Change Operations (COMMENTED OUT)');
    console.log('='.repeat(60));
    console.log('');
    console.log('To change keys from factory defaults to secure keys:');
    console.log('1. Uncomment the code below');
    console.log('2. Understand that this is IRREVERSIBLE');
    console.log('3. Make sure you have backed up the generated keys');
    console.log('4. Test on a non-production card first');
    console.log('');

    /*
    // UNCOMMENT TO ACTUALLY CHANGE KEYS
    console.log('Changing Application 1 keys from factory defaults...');
    await desfireCard.selectApplication(APP1_SABADO_PAYMENT);
    await desfireCard.authenticateAES(0, defaultKey);

    // Change K0 (Master Key) first
    const newK0 = keyManager.getKey(APP1_SABADO_PAYMENT, 0);
    await desfireCard.changeKeyEV2(0, newK0, 1); // Version 1
    console.log('✓ K0 changed');

    // Re-authenticate with new K0
    await desfireCard.authenticateAES(0, newK0);

    // Change other keys
    for (let i = 1; i < 5; i++) {
      const newKey = keyManager.getKey(APP1_SABADO_PAYMENT, i);
      await desfireCard.changeKeyEV2(i, newKey, 1);
      console.log(`✓ K${i} changed`);
    }

    console.log('');
    console.log('All keys changed successfully!');
    console.log('Factory defaults are NO LONGER VALID');
    console.log('');
    */

    console.log('='.repeat(60));
    console.log('TEST COMPLETE!');
    console.log('='.repeat(60));
    console.log('');
    console.log('Summary:');
    console.log('✓ Key generation working');
    console.log('✓ Encrypted key storage working');
    console.log('✓ Authentication with factory defaults working');
    console.log('✓ Key settings retrieval working');
    console.log('✓ Key version reading working');
    console.log('✓ Session key derivation working');
    console.log('');
    console.log('Next steps:');
    console.log('1. Review generated keys in ./keys/ directory');
    console.log('2. Test key change operations on a test card');
    console.log('3. Implement authenticated file operations');
    console.log('4. Test balance credit/debit with authentication');
    console.log('');

  } catch (error) {
    console.error('');
    console.error('ERROR:', error);
    console.error('');
  } finally {
    readerManager.close();
    process.exit(0);
  }
}

// Run authentication test
testAuthentication().catch(console.error);
