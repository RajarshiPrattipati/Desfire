/**
 * Main Entry Point
 * Basic card detection and information reading
 */

import 'dotenv/config';
import NFCReaderManager from './card/reader';
import DESFireCard from './card/desfire';

async function main() {
  console.log('='.repeat(60));
  console.log('DESFire Card Reader - Main Application');
  console.log('='.repeat(60));
  console.log('');

  const readerManager = new NFCReaderManager();

  // Wait for reader
  await new Promise<void>((resolve) => {
    console.log('Waiting for NFC reader...');
    readerManager.once('reader-connected', (reader) => {
      console.log(`Reader connected: ${reader.reader.name}`);
      resolve();
    });
  });

  // Wait for card
  console.log('Place DESFire card on reader...');
  const { reader, card } = await new Promise<any>((resolve) => {
    readerManager.once('card-detected', resolve);
  });

  try {
    // Small delay to ensure the reader/card link is fully ready
    await new Promise((r) => setTimeout(r, 150));
    console.log('');
    console.log('-'.repeat(60));
    console.log('Card Information:');
    console.log('-'.repeat(60));
    console.log(`UID: ${card.uid}`);
    console.log(`ATR: ${card.atr.toString('hex')}`);
    console.log(`Type: ${card.type}`);

    const desfireCard = new DESFireCard(reader);

    console.log('');
    console.log('-'.repeat(60));
    console.log('DESFire Version:');
    console.log('-'.repeat(60));
    const version = await desfireCard.getVersion();

    // Parse hardware info
    const hwVendor = version.hardware[0];
    const hwType = version.hardware[1];
    const hwSubtype = version.hardware[2];
    const hwMajorVersion = version.hardware[3];
    const hwMinorVersion = version.hardware[4];
    const hwStorageSize = version.hardware[5];
    const hwProtocol = version.hardware[6];

    console.log('Hardware:');
    console.log(`  Vendor ID: 0x${hwVendor.toString(16).padStart(2, '0')}`);
    console.log(`  Type: 0x${hwType.toString(16).padStart(2, '0')}`);
    console.log(`  Subtype: 0x${hwSubtype.toString(16).padStart(2, '0')}`);
    console.log(`  Version: ${hwMajorVersion}.${hwMinorVersion}`);
    console.log(`  Storage Size: 0x${hwStorageSize.toString(16).padStart(2, '0')}`);
    console.log(`  Protocol: 0x${hwProtocol.toString(16).padStart(2, '0')}`);

    // Parse software info
    const swVendor = version.software[0];
    const swType = version.software[1];
    const swSubtype = version.software[2];
    const swMajorVersion = version.software[3];
    const swMinorVersion = version.software[4];
    const swStorageSize = version.software[5];
    const swProtocol = version.software[6];

    console.log('');
    console.log('Software:');
    console.log(`  Vendor ID: 0x${swVendor.toString(16).padStart(2, '0')}`);
    console.log(`  Type: 0x${swType.toString(16).padStart(2, '0')}`);
    console.log(`  Subtype: 0x${swSubtype.toString(16).padStart(2, '0')}`);
    console.log(`  Version: ${swMajorVersion}.${swMinorVersion}`);
    console.log(`  Storage Size: 0x${swStorageSize.toString(16).padStart(2, '0')}`);
    console.log(`  Protocol: 0x${swProtocol.toString(16).padStart(2, '0')}`);

    console.log('');
    console.log('Card UID:');
    console.log(`  ${version.uid.toString('hex').toUpperCase()}`);

    console.log('');
    console.log('-'.repeat(60));
    console.log('Applications:');
    console.log('-'.repeat(60));
    const applications = await desfireCard.getApplicationIDs();

    if (applications.length === 0) {
      console.log('No applications found on card.');
      console.log('Run "npm run provision" to provision the card.');
    } else {
      console.log(`Found ${applications.length} application(s):`);
      for (const aid of applications) {
        console.log(`  - AID: 0x${aid.toString(16).padStart(6, '0')}`);

        // Try to select and get file info
        try {
          await desfireCard.selectApplication(aid);
          // Try to read key settings (may be allowed without auth)
          try {
            const ks = await desfireCard.getKeySettings();
            const keyTypeLabel = (ks.keyType === 0x80) ? 'AES' : 'DES/3DES';
            console.log(`    Key Settings: 0x${ks.settings.toString(16)} | Max Keys: ${ks.maxKeys} | Key Type: ${keyTypeLabel}`);
          } catch {}

          // Attempt env-provided app master key auth to list files
          const aidHex = aid.toString(16).padStart(6, '0').toUpperCase();
          const prefix = `DESFIRE_APP_${aidHex}`;
          const keyType = process.env[`${prefix}_KEY_TYPE`];
          const keyHex = process.env[`${prefix}_KEY`];
          const keyNo = process.env[`${prefix}_KEY_NO`] ? Number(process.env[`${prefix}_KEY_NO`]) : 0;
          let listed = false;
          if (keyType && keyHex) {
            try {
              const buf = Buffer.from(keyHex.replace(/\s+/g, ''), 'hex');
              if (keyType === 'DES' || keyType === '3DES') await desfireCard.authenticateDES(keyNo, buf);
              else if (keyType === 'AES') await desfireCard.authenticateAES(keyNo, buf);
              else if (keyType === 'AES_EV2') await desfireCard.authenticateEV2First(keyNo, buf);
              const files = await desfireCard.getFileIDs();
              console.log(`    Files: ${files.length > 0 ? files.join(', ') : 'none'}`);
              listed = true;
            } catch {
              console.log('    (Env auth failed; cannot list files)');
            }
          }
          if (!listed) {
            try {
              const files = await desfireCard.getFileIDs();
              console.log(`    Files: ${files.length > 0 ? files.join(', ') : 'none'}`);
            } catch {
              console.log('    (Unable to read files - authentication required)');
            }
          }
        } catch (error) {
          console.log(`    (Unable to read files - authentication required)`);
        }
      }
    }

    console.log('');
    console.log('-'.repeat(60));
    console.log('Memory:');
    console.log('-'.repeat(60));
    try {
      const freeMemory = await desfireCard.getFreeMemory();
      console.log(`Free Memory: ${freeMemory} bytes`);
    } catch (error) {
      console.log('Unable to read free memory');
    }

    console.log('');
    console.log('='.repeat(60));
    console.log('Card reading complete!');
    console.log('');
    console.log('Next steps:');
    console.log('- To provision a new card: npm run provision');
    console.log('- To test authentication: Implement key management');
    console.log('- To perform transactions: Implement payment operations');
    console.log('='.repeat(60));

  } catch (error) {
    console.error('');
    console.error('ERROR:', error);
  } finally {
    readerManager.close();
    process.exit(0);
  }
}

// Run main
main().catch(console.error);
