/**
 * DESFire Command Library
 * Implements MIFARE DESFire EV2/EV3 command set
 */

import { APDU } from './apdu';
import crypto from 'crypto';
import * as CryptoUtils from './crypto';
import { KeyManager } from './keyManager';
import { isACR122U, transmitViaAcr122U, ensureIsoDep } from './acr122u';

// DESFire Command Codes
export enum DesfireCommand {
  // PICC Level Commands
  GET_VERSION = 0x60,
  GET_CARD_UID = 0x51,
  FORMAT_PICC = 0xFC,

  // Application Level Commands
  GET_APPLICATION_IDS = 0x6A,
  CREATE_APPLICATION = 0xCA,
  DELETE_APPLICATION = 0xDA,
  SELECT_APPLICATION = 0x5A,

  // File Management Commands
  GET_FILE_IDS = 0x6F,
  GET_FILE_SETTINGS = 0xF5,
  CREATE_STD_DATA_FILE = 0xCD,
  CREATE_BACKUP_DATA_FILE = 0xCB,
  CREATE_VALUE_FILE = 0xCC,
  CREATE_LINEAR_RECORD_FILE = 0xC1,
  CREATE_CYCLIC_RECORD_FILE = 0xC0,
  DELETE_FILE = 0xDF,

  // Data Manipulation Commands
  READ_DATA = 0xBD,
  WRITE_DATA = 0x3D,
  GET_VALUE = 0x6C,
  CREDIT = 0x0C,
  DEBIT = 0xDC,
  LIMITED_CREDIT = 0x1C,
  WRITE_RECORD = 0x3B,
  READ_RECORDS = 0xBB,
  CLEAR_RECORD_FILE = 0xEB,
  COMMIT_TRANSACTION = 0xC7,
  ABORT_TRANSACTION = 0xA7,

  // Security Commands
  AUTHENTICATE = 0x0A,
  AUTHENTICATE_ISO = 0x1A,
  AUTHENTICATE_AES = 0xAA,
  AUTHENTICATE_EV2_FIRST = 0x71,
  AUTHENTICATE_EV2_NON_FIRST = 0x77,
  CHANGE_KEY_SETTINGS = 0x54,
  GET_KEY_SETTINGS = 0x45,
  CHANGE_KEY = 0xC4,
  CHANGE_KEY_EV2 = 0xC6,
  GET_KEY_VERSION = 0x64,
  INITIALIZE_KEY_SET = 0x56,
  ROLL_KEY_SET = 0x55,
  FINALIZE_KEY_SET = 0x57,

  // Additional Commands
  ADDITIONAL_FRAME = 0xAF,
  GET_FREE_MEMORY = 0x6E,
  SET_CONFIGURATION = 0x5C,
  GET_DF_NAMES = 0x6D,
}

export class DESFireCard {
  private reader: any;
  private currentApp: number | null = null;
  private keyManager: KeyManager | null = null;
  private preferNoLe: boolean = true; // default preference favors no-Le for ACR122U

  // Authentication state
  private authenticated: boolean = false;
  private authenticatedKeyNo: number | null = null;
  private sessionKeyEnc: Buffer | null = null;
  private sessionKeyMac: Buffer | null = null;
  private transactionId: Buffer | null = null;
  private commandCounter: number = 0;
  
  constructor(reader: any, keyManager?: KeyManager) {
    this.reader = reader;
    this.keyManager = keyManager || null;
  }

  /**
   * Set key manager for authentication operations
   */
  setKeyManager(keyManager: KeyManager): void {
    this.keyManager = keyManager;
  }

  /**
   * Check if authenticated
   */
  isAuthenticated(): boolean {
    return this.authenticated;
  }

  /**
   * Get authenticated key number
   */
  getAuthenticatedKeyNo(): number | null {
    return this.authenticatedKeyNo;
  }

  /**
   * Reset authentication state
   */
  resetAuth(): void {
    this.authenticated = false;
    this.authenticatedKeyNo = null;
    if (this.sessionKeyEnc) this.sessionKeyEnc.fill(0);
    if (this.sessionKeyMac) this.sessionKeyMac.fill(0);
    this.sessionKeyEnc = null;
    this.sessionKeyMac = null;
    this.transactionId = null;
    this.commandCounter = 0;
  }

  /**
   * Send a DESFire command and receive response
   */
  private async sendCommand(cmd: DesfireCommand, data?: Buffer, expectResponse: boolean = true): Promise<Buffer> {
    let parsed: { sw1: number; sw2: number; data: Buffer; status: string };

    if (data && data.length) {
      // With data: try in preferred order
      const attempts = this.preferNoLe
        ? [
            { apdu: APDU.build(0x90, cmd, 0x00, 0x00, data), usesLe: false },
            { apdu: APDU.build(0x90, cmd, 0x00, 0x00, data, 0), usesLe: true },
          ]
        : [
            { apdu: APDU.build(0x90, cmd, 0x00, 0x00, data, 0), usesLe: true },
            { apdu: APDU.build(0x90, cmd, 0x00, 0x00, data), usesLe: false },
          ];

      parsed = await this.tryTransmitAttempts(attempts);
    } else {
      // No data: some readers/cards prefer Le present (0x00), others prefer no Le.
      // Try with Le first, then without Le if we get a LENGTH_ERROR.
      const attempts = this.preferNoLe
        ? [
            { apdu: Buffer.from([0x90, cmd, 0x00, 0x00]), usesLe: false },
            { apdu: Buffer.from([0x90, cmd, 0x00, 0x00, 0x00]), usesLe: true },
          ]
        : [
            { apdu: Buffer.from([0x90, cmd, 0x00, 0x00, 0x00]), usesLe: true },
            { apdu: Buffer.from([0x90, cmd, 0x00, 0x00]), usesLe: false },
          ];
      parsed = await this.tryTransmitAttempts(attempts);
    }

    if (!APDU.isSuccess(parsed.sw1, parsed.sw2) && !APDU.isAdditionalFrame(parsed.sw1, parsed.sw2)) {
      throw new Error(`DESFire command failed: ${parsed.status} (SW: ${parsed.sw1.toString(16)}${parsed.sw2.toString(16)})`);
    }

    // Handle additional frames
    if (APDU.isAdditionalFrame(parsed.sw1, parsed.sw2)) {
      const additionalData = await this.getAdditionalFrame();
      return Buffer.concat([parsed.data, additionalData]);
    }

    return parsed.data;
  }

  /**
   * Get additional frame when response is split
   */
  private async getAdditionalFrame(): Promise<Buffer> {
    // No-data command; use preferred style
    const attempts = this.preferNoLe
      ? [
          { apdu: Buffer.from([0x90, DesfireCommand.ADDITIONAL_FRAME, 0x00, 0x00]), usesLe: false },
          { apdu: Buffer.from([0x90, DesfireCommand.ADDITIONAL_FRAME, 0x00, 0x00, 0x00]), usesLe: true },
        ]
      : [
          { apdu: Buffer.from([0x90, DesfireCommand.ADDITIONAL_FRAME, 0x00, 0x00, 0x00]), usesLe: true },
          { apdu: Buffer.from([0x90, DesfireCommand.ADDITIONAL_FRAME, 0x00, 0x00]), usesLe: false },
        ];
    const parsed = await this.tryTransmitAttempts(attempts);

    if (APDU.isAdditionalFrame(parsed.sw1, parsed.sw2)) {
      const additionalData = await this.getAdditionalFrame();
      return Buffer.concat([parsed.data, additionalData]);
    }

    return parsed.data;
  }

  /**
   * Low-level transmit helper that returns parsed status without auto fetching.
   */
  private async transmitParsed(apdu: Buffer): Promise<{ sw1: number; sw2: number; data: Buffer; status: string }> {
    if (process.env.DESFIRE_DEBUG) {
      console.log(`>> ${apdu.toString('hex')}`);
    }
    let response: Buffer | null = null;
    // 1) Standard PC/SC transmit with one retry
    try {
      response = await this.reader.transmit(apdu, 256);
    } catch (err) {
      await new Promise((r) => setTimeout(r, 80));
      try { response = await this.reader.transmit(apdu, 256); } catch {}
    }
    if (response && response.length >= 2) {
      if (process.env.DESFIRE_DEBUG) console.log(`<< ${response.toString('hex')}`);
      return APDU.parse(response);
    }

    // 2) Try ACR122U escape pass-through as fallback
    if (isACR122U(this.reader)) {
      try {
        // Attempt ISO-DEP activation first (best-effort)
        try { await ensureIsoDep(this.reader); } catch {}
        const escResp = await transmitViaAcr122U(this.reader, apdu, 512);
        if (escResp && escResp.length >= 2) {
          if (process.env.DESFIRE_DEBUG) console.log(`<<(esc) ${escResp.toString('hex')}`);
          return APDU.parse(escResp);
        }
      } catch {}
    }

    // 3) As a last resort, try toggling Le presence for no-data APDUs
    let toggled: Buffer | null = null;
    if (apdu.length === 4) {
      toggled = Buffer.concat([apdu, Buffer.from([0x00])]);
    } else if (apdu.length === 5 && apdu[4] === 0x00) {
      toggled = apdu.slice(0, 4);
    }
    if (toggled) {
      try {
        const rx = await this.reader.transmit(toggled, 256);
        if (rx && rx.length >= 2) {
          if (process.env.DESFIRE_DEBUG) console.log(`<< ${rx.toString('hex')}`);
          return APDU.parse(rx);
        }
      } catch {}
    }

    return APDU.parse(response || Buffer.alloc(0));
  }

  private async tryTransmitAttempts(
    attempts: Array<{ apdu: Buffer; usesLe: boolean }>
  ): Promise<{ sw1: number; sw2: number; data: Buffer; status: string }> {
    let last: { sw1: number; sw2: number; data: Buffer; status: string } | null = null;
    for (const { apdu, usesLe } of attempts) {
      const parsed = await this.transmitParsed(apdu);
      // If success or additional frame, update preference to the style just used
      if (APDU.isSuccess(parsed.sw1, parsed.sw2) || APDU.isAdditionalFrame(parsed.sw1, parsed.sw2)) {
        this.preferNoLe = !usesLe;
        return parsed;
      }
      last = parsed;
      if (!(parsed.sw1 === 0x91 && (parsed.sw2 === 0x7E || parsed.sw2 === 0xA1))) {
        // Not a length error; return immediately
        return parsed;
      }
    }
    return last!;
  }

  /**
   * Get card version information
   */
  async getVersion(): Promise<{ hardware: Buffer; software: Buffer; uid: Buffer }> {
    // For ACR122U, try to ensure ISO-DEP once per presence
    try {
      const now = Date.now();
      if (isACR122U(this.reader) && !this.reader.__acrIsoDepInitTs) {
        await ensureIsoDep(this.reader);
        this.reader.__acrIsoDepInitTs = now;
        await new Promise((r) => setTimeout(r, 120));
      }
    } catch {}
    const trySequence = async (style: 'noLe' | 'withLe'): Promise<Buffer> => {
      const sendNoData = async (ins: number) => {
        if (style === 'noLe') {
          return this.transmitParsed(Buffer.from([0x90, ins, 0x00, 0x00]));
        }
        return this.transmitParsed(Buffer.from([0x90, ins, 0x00, 0x00, 0x00]));
      };

      const frames: Buffer[] = [];
      let p = await sendNoData(DesfireCommand.GET_VERSION);

      if (!(APDU.isSuccess(p.sw1, p.sw2) || APDU.isAdditionalFrame(p.sw1, p.sw2))) {
        throw new Error(`GET_VERSION(${style}) failed: ${p.status} (SW: ${p.sw1.toString(16)}${p.sw2.toString(16)})`);
      }

      frames.push(p.data);

      // Two additional frames are expected typically
      while (APDU.isAdditionalFrame(p.sw1, p.sw2)) {
        p = await sendNoData(DesfireCommand.ADDITIONAL_FRAME);
        if (!(APDU.isSuccess(p.sw1, p.sw2) || APDU.isAdditionalFrame(p.sw1, p.sw2))) {
          throw new Error(`GET_VERSION AF(${style}) failed: ${p.status} (SW: ${p.sw1.toString(16)}${p.sw2.toString(16)})`);
        }
        frames.push(p.data);
      }

      return Buffer.concat(frames);
    };

    let all: Buffer | null = null;
    let lastErr: any = null;

    // Prefer no-Le style first for ACR122U, then with-Le if needed
    for (const style of ['noLe', 'withLe'] as const) {
      try {
        all = await trySequence(style);
        this.preferNoLe = style === 'noLe';
        break;
      } catch (e: any) {
        lastErr = e;
        // Attempt to reset to PICC level before retrying
        try {
          const zeroAid = Buffer.from([0x00, 0x00, 0x00]);
          await this.sendCommand(DesfireCommand.SELECT_APPLICATION, zeroAid, false);
        } catch {
          // ignore select errors
        }
      }
    }

    if (!all) {
      throw lastErr || new Error('GET_VERSION failed');
    }

    const block = 7;
    const hardware = all.slice(0, Math.min(block, all.length));
    const software = all.slice(block, Math.min(block * 2, all.length));
    const uid = all.slice(block * 2);

    return { hardware, software, uid };
  }

  /**
   * Get list of application IDs on the card
   */
  async getApplicationIDs(): Promise<number[]> {
    const response = await this.sendCommand(DesfireCommand.GET_APPLICATION_IDS);
    const aids: number[] = [];

    // Each AID is 3 bytes
    for (let i = 0; i < response.length; i += 3) {
      const aid = response.readUIntLE(i, 3);
      aids.push(aid);
    }

    return aids;
  }

  /**
   * Create a new application
   * @param aid Application ID (3 bytes, little-endian)
   * @param keySetting Key settings byte
   * @param numKeys Number of keys (1-14)
   * @param keyType Key type (0x80 for AES)
   */
  async createApplication(aid: number, keySetting: number, numKeys: number, keyType: number = 0x80): Promise<void> {
    const aidBuffer = Buffer.allocUnsafe(3);
    aidBuffer.writeUIntLE(aid, 0, 3);

    const data = Buffer.concat([
      aidBuffer,
      Buffer.from([keySetting, numKeys | keyType])
    ]);

    await this.sendCommand(DesfireCommand.CREATE_APPLICATION, data, false);
    console.log(`Application 0x${aid.toString(16).padStart(6, '0')} created successfully`);
  }

  /**
   * Select an application for subsequent operations
   */
  async selectApplication(aid: number): Promise<void> {
    const aidBuffer = Buffer.allocUnsafe(3);
    aidBuffer.writeUIntLE(aid, 0, 3);

    await this.sendCommand(DesfireCommand.SELECT_APPLICATION, aidBuffer, false);
    this.currentApp = aid;
    console.log(`Application 0x${aid.toString(16).padStart(6, '0')} selected`);
  }

  /**
   * Delete an application
   */
  async deleteApplication(aid: number): Promise<void> {
    const aidBuffer = Buffer.allocUnsafe(3);
    aidBuffer.writeUIntLE(aid, 0, 3);

    await this.sendCommand(DesfireCommand.DELETE_APPLICATION, aidBuffer, false);
    console.log(`Application 0x${aid.toString(16).padStart(6, '0')} deleted`);
  }

  /**
   * Get list of file IDs in current application
   */
  async getFileIDs(): Promise<number[]> {
    const response = await this.sendCommand(DesfireCommand.GET_FILE_IDS);
    return Array.from(response);
  }

  /**
   * Create a standard data file
   * @param fileNo File number (0-31)
   * @param commSettings Communication settings
   * @param accessRights Access rights (2 bytes)
   * @param fileSize Size of file in bytes
   */
  async createStdDataFile(
    fileNo: number,
    commSettings: number,
    accessRights: Buffer,
    fileSize: number
  ): Promise<void> {
    const fileSizeBuffer = Buffer.allocUnsafe(3);
    fileSizeBuffer.writeUIntLE(fileSize, 0, 3);

    const data = Buffer.concat([
      Buffer.from([fileNo, commSettings]),
      accessRights,
      fileSizeBuffer
    ]);

    await this.sendCommand(DesfireCommand.CREATE_STD_DATA_FILE, data, false);
    console.log(`Standard data file ${fileNo} created (${fileSize} bytes)`);
  }

  /**
   * Create a backup data file
   */
  async createBackupDataFile(
    fileNo: number,
    commSettings: number,
    accessRights: Buffer,
    fileSize: number
  ): Promise<void> {
    const fileSizeBuffer = Buffer.allocUnsafe(3);
    fileSizeBuffer.writeUIntLE(fileSize, 0, 3);

    const data = Buffer.concat([
      Buffer.from([fileNo, commSettings]),
      accessRights,
      fileSizeBuffer
    ]);

    await this.sendCommand(DesfireCommand.CREATE_BACKUP_DATA_FILE, data, false);
    console.log(`Backup data file ${fileNo} created (${fileSize} bytes)`);
  }

  /**
   * Create a value file for storing signed 32-bit integers
   * @param fileNo File number (0-31)
   * @param commSettings Communication settings
   * @param accessRights Access rights (2 bytes)
   * @param lowerLimit Minimum value
   * @param upperLimit Maximum value
   * @param value Initial value
   * @param limitedCreditEnabled Enable limited credit
   */
  async createValueFile(
    fileNo: number,
    commSettings: number,
    accessRights: Buffer,
    lowerLimit: number,
    upperLimit: number,
    value: number,
    limitedCreditEnabled: number
  ): Promise<void> {
    const lowerLimitBuffer = Buffer.allocUnsafe(4);
    const upperLimitBuffer = Buffer.allocUnsafe(4);
    const valueBuffer = Buffer.allocUnsafe(4);

    lowerLimitBuffer.writeInt32LE(lowerLimit, 0);
    upperLimitBuffer.writeInt32LE(upperLimit, 0);
    valueBuffer.writeInt32LE(value, 0);

    const data = Buffer.concat([
      Buffer.from([fileNo, commSettings]),
      accessRights,
      lowerLimitBuffer,
      upperLimitBuffer,
      valueBuffer,
      Buffer.from([limitedCreditEnabled])
    ]);

    await this.sendCommand(DesfireCommand.CREATE_VALUE_FILE, data, false);
    console.log(`Value file ${fileNo} created (initial value: ${value})`);
  }

  /**
   * Read data from a standard or backup data file
   */
  async readData(fileNo: number, offset: number, length: number): Promise<Buffer> {
    const offsetBuffer = Buffer.allocUnsafe(3);
    const lengthBuffer = Buffer.allocUnsafe(3);

    offsetBuffer.writeUIntLE(offset, 0, 3);
    lengthBuffer.writeUIntLE(length, 0, 3);

    const data = Buffer.concat([
      Buffer.from([fileNo]),
      offsetBuffer,
      lengthBuffer
    ]);

    return await this.sendCommand(DesfireCommand.READ_DATA, data);
  }

  /**
   * Write data to a standard or backup data file
   */
  async writeData(fileNo: number, offset: number, data: Buffer): Promise<void> {
    const offsetBuffer = Buffer.allocUnsafe(3);
    const lengthBuffer = Buffer.allocUnsafe(3);

    offsetBuffer.writeUIntLE(offset, 0, 3);
    lengthBuffer.writeUIntLE(data.length, 0, 3);

    // Conservative max chunk size for ACR122U + DESFire in plain mode.
    // This is the payload portion only (excluding fileNo/offset/length).
    const MAX_CHUNK = 40;

    let sent = 0;

    // First frame must carry the header + first data chunk
    const firstChunk = data.slice(0, Math.min(data.length, MAX_CHUNK));
    const firstPayload = Buffer.concat([
      Buffer.from([fileNo]),
      offsetBuffer,
      lengthBuffer,
      firstChunk
    ]);

    let parsed = await this.transmitParsed(APDU.buildDESFire(DesfireCommand.WRITE_DATA, firstPayload, 0));

    if (!(APDU.isSuccess(parsed.sw1, parsed.sw2) || APDU.isAdditionalFrame(parsed.sw1, parsed.sw2))) {
      throw new Error(`DESFire WriteData failed: ${parsed.status} (SW: ${parsed.sw1.toString(16)}${parsed.sw2.toString(16)})`);
    }

    sent += firstChunk.length;

    // If more data remains, continue with Additional Frame(s)
    while (sent < data.length) {
      const remaining = data.length - sent;
      const chunk = data.slice(sent, sent + Math.min(remaining, MAX_CHUNK));
      // Additional frame with data: try Le=0x00 first, then no-Le
      parsed = await this.transmitParsed(APDU.build(0x90, DesfireCommand.ADDITIONAL_FRAME, 0x00, 0x00, chunk, 0));
      if (parsed.sw1 === 0x91 && (parsed.sw2 === 0x7E || parsed.sw2 === 0xA1)) {
        parsed = await this.transmitParsed(APDU.build(0x90, DesfireCommand.ADDITIONAL_FRAME, 0x00, 0x00, chunk));
      }

      if (!(APDU.isSuccess(parsed.sw1, parsed.sw2) || APDU.isAdditionalFrame(parsed.sw1, parsed.sw2))) {
        throw new Error(`DESFire WriteData (AF) failed at ${sent}: ${parsed.status} (SW: ${parsed.sw1.toString(16)}${parsed.sw2.toString(16)})`);
      }

      sent += chunk.length;
    }

    console.log(`Wrote ${data.length} bytes to file ${fileNo} at offset ${offset}`);
  }

  /**
   * Get value from a value file
   */
  async getValue(fileNo: number): Promise<number> {
    const data = Buffer.from([fileNo]);
    const response = await this.sendCommand(DesfireCommand.GET_VALUE, data);
    return response.readInt32LE(0);
  }

  /**
   * Credit (add) value to a value file
   */
  async credit(fileNo: number, amount: number): Promise<void> {
    const amountBuffer = Buffer.allocUnsafe(4);
    amountBuffer.writeInt32LE(amount, 0);

    const data = Buffer.concat([
      Buffer.from([fileNo]),
      amountBuffer
    ]);

    await this.sendCommand(DesfireCommand.CREDIT, data, false);
    console.log(`Credited ${amount} to value file ${fileNo}`);
  }

  /**
   * Debit (subtract) value from a value file
   */
  async debit(fileNo: number, amount: number): Promise<void> {
    const amountBuffer = Buffer.allocUnsafe(4);
    amountBuffer.writeInt32LE(amount, 0);

    const data = Buffer.concat([
      Buffer.from([fileNo]),
      amountBuffer
    ]);

    await this.sendCommand(DesfireCommand.DEBIT, data, false);
    console.log(`Debited ${amount} from value file ${fileNo}`);
  }

  /**
   * Commit transaction (finalize backup/value file operations)
   */
  async commitTransaction(): Promise<void> {
    await this.sendCommand(DesfireCommand.COMMIT_TRANSACTION, undefined, false);
    console.log('Transaction committed');
  }

  /**
   * Abort transaction (rollback backup/value file operations)
   */
  async abortTransaction(): Promise<void> {
    await this.sendCommand(DesfireCommand.ABORT_TRANSACTION, undefined, false);
    console.log('Transaction aborted');
  }

  /**
   * Format PICC (WARNING: Erases all applications and data)
   */
  async formatPICC(): Promise<void> {
    await this.sendCommand(DesfireCommand.FORMAT_PICC, undefined, false);
    console.log('PICC formatted');
  }

  /**
   * Get free memory on card
   */
  async getFreeMemory(): Promise<number> {
    const response = await this.sendCommand(DesfireCommand.GET_FREE_MEMORY);
    return response.readUIntLE(0, 3);
  }

  // ============================================================================
  // AUTHENTICATION METHODS
  // ============================================================================

  /**
   * Authenticate with AES key (legacy method for DESFire EV1/EV2)
   * @param keyNo Key number to authenticate with (0-13)
   * @param key AES-128 key (16 bytes), or null to use key from KeyManager
   */
  async authenticateAES(keyNo: number, key?: Buffer): Promise<void> {
    // Get key from manager if not provided
    let authKey: Buffer;
    if (key) {
      authKey = key;
    } else if (this.keyManager && this.currentApp !== null) {
      authKey = this.keyManager.getKey(this.currentApp, keyNo);
    } else {
      throw new Error('No key provided and no KeyManager set');
    }

    if (authKey.length !== 16) {
      throw new Error('AES key must be 16 bytes');
    }

    console.log(`Authenticating with key ${keyNo} using AuthenticateAES...`);

    // Reset authentication state
    this.resetAuth();

    // Step 1: Send Authenticate command with key number
    const authCmd = Buffer.from([keyNo]);
    const response1 = await this.sendCommand(DesfireCommand.AUTHENTICATE_AES, authCmd);

    // Response is encrypted RndB (16 bytes)
    if (response1.length !== 16) {
      throw new Error(`Expected 16 bytes RndB, got ${response1.length}`);
    }

    const encRndB = response1;

    // Step 2: Decrypt RndB
    const rndB = CryptoUtils.aesDecrypt(authKey, encRndB, Buffer.alloc(16, 0x00));
    console.log(`Decrypted RndB: ${rndB.toString('hex')}`);

    // Step 3: Generate RndA
    const rndA = CryptoUtils.generateRandom(16);
    console.log(`Generated RndA: ${rndA.toString('hex')}`);

    // Step 4: Create RndA + RndB' (rotated left by 1 byte)
    const rndBPrime = CryptoUtils.rotateLeft(rndB, 1);
    const challenge = Buffer.concat([rndA, rndBPrime]);

    // Step 5: Encrypt challenge and send
    const encChallenge = CryptoUtils.aesEncrypt(authKey, challenge, Buffer.alloc(16, 0x00));
    const response2 = await this.sendCommand(DesfireCommand.ADDITIONAL_FRAME, encChallenge);

    // Response is encrypted RndA' (16 bytes)
    if (response2.length !== 16) {
      throw new Error(`Expected 16 bytes encrypted RndA', got ${response2.length}`);
    }

    // Step 6: Decrypt and verify RndA'
    const decryptedRndAPrime = CryptoUtils.aesDecrypt(authKey, response2, Buffer.alloc(16, 0x00));
    const expectedRndAPrime = CryptoUtils.rotateLeft(rndA, 1);

    if (!decryptedRndAPrime.equals(expectedRndAPrime)) {
      throw new Error('Authentication failed: RndA verification failed');
    }

    console.log('RndA verified successfully');

    // Step 7: Derive session keys
    this.sessionKeyEnc = CryptoUtils.deriveSessionKeyAESEnc(authKey, rndA, rndB);
    this.sessionKeyMac = CryptoUtils.deriveSessionKeyAESMac(authKey, rndA, rndB);

    this.authenticated = true;
    this.authenticatedKeyNo = keyNo;
    this.commandCounter = 0;

    console.log(`✓ Authenticated with key ${keyNo}`);
    console.log(`  Session Enc Key: ${this.sessionKeyEnc.toString('hex')}`);
    console.log(`  Session MAC Key: ${this.sessionKeyMac.toString('hex')}`);
  }

  /**
   * Authenticate with AES key using EV2 First authentication (DESFire EV2/EV3)
   * This is the recommended method for EV2/EV3 cards
   * @param keyNo Key number to authenticate with (0-13)
   * @param key AES-128 key (16 bytes), or null to use key from KeyManager
   */
  async authenticateEV2First(keyNo: number, key?: Buffer): Promise<void> {
    // Get key from manager if not provided
    let authKey: Buffer;
    if (key) {
      authKey = key;
    } else if (this.keyManager && this.currentApp !== null) {
      authKey = this.keyManager.getKey(this.currentApp, keyNo);
    } else {
      throw new Error('No key provided and no KeyManager set');
    }

    if (authKey.length !== 16) {
      throw new Error('AES key must be 16 bytes');
    }

    console.log(`Authenticating with key ${keyNo} using AuthenticateEV2First...`);

    // Reset authentication state
    this.resetAuth();

    // Step 1: Send AuthenticateEV2First command with key number and PCDcap2
    // PCDcap2 = 0x0000 (no extended capabilities)
    const authCmd = Buffer.from([keyNo, 0x00, 0x00]);
    const response1 = await this.sendCommand(DesfireCommand.AUTHENTICATE_EV2_FIRST, authCmd);

    // Response is encrypted RndB + PDcap2 (16 + 6 = 22 bytes encrypted = 32 bytes)
    if (response1.length < 16) {
      throw new Error(`Expected at least 16 bytes, got ${response1.length}`);
    }

    // Decrypt response (should be RndB)
    const encRndB = response1.slice(0, 16);
    const rndB = CryptoUtils.aesDecrypt(authKey, encRndB, Buffer.alloc(16, 0x00));
    console.log(`Decrypted RndB: ${rndB.toString('hex')}`);

    // Step 2: Generate RndA
    const rndA = CryptoUtils.generateRandom(16);
    console.log(`Generated RndA: ${rndA.toString('hex')}`);

    // Step 3: Create RndA + RndB' (rotated left by 1 byte)
    const rndBPrime = CryptoUtils.rotateLeft(rndB, 1);
    const challenge = Buffer.concat([rndA, rndBPrime]);

    // Step 4: Encrypt challenge and send
    const encChallenge = CryptoUtils.aesEncrypt(authKey, challenge, Buffer.alloc(16, 0x00));
    const response2 = await this.sendCommand(DesfireCommand.ADDITIONAL_FRAME, encChallenge);

    // Response is TI (4 bytes) + encrypted RndA' (16 bytes) + PDcap2 (6 bytes) - but might be just TI + RndA'
    if (response2.length < 4) {
      throw new Error(`Expected at least 4 bytes TI + encrypted data, got ${response2.length}`);
    }

    // Extract Transaction Identifier (TI)
    this.transactionId = response2.slice(0, 4);
    console.log(`Transaction ID: ${this.transactionId.toString('hex')}`);

    // Extract encrypted RndA'
    const encRndAPrime = response2.slice(4, 20);
    const decryptedRndAPrime = CryptoUtils.aesDecrypt(authKey, encRndAPrime, Buffer.alloc(16, 0x00));
    const expectedRndAPrime = CryptoUtils.rotateLeft(rndA, 1);

    if (!decryptedRndAPrime.equals(expectedRndAPrime)) {
      throw new Error('Authentication failed: RndA verification failed');
    }

    console.log('RndA verified successfully');

    // Step 5: Derive EV2 session keys using CMAC
    this.sessionKeyEnc = CryptoUtils.deriveSessionKeyEV2Enc(authKey, rndA, rndB);
    this.sessionKeyMac = CryptoUtils.deriveSessionKeyEV2Mac(authKey, rndA, rndB);

    this.authenticated = true;
    this.authenticatedKeyNo = keyNo;
    this.commandCounter = 0;

    console.log(`✓ Authenticated with key ${keyNo} (EV2 First)`);
    console.log(`  Session Enc Key: ${this.sessionKeyEnc.toString('hex')}`);
    console.log(`  Session MAC Key: ${this.sessionKeyMac.toString('hex')}`);
    console.log(`  Transaction ID: ${this.transactionId?.toString('hex')}`);
  }

  /**
   * Authenticate with AES key using EV2 Non-First authentication
   * Used for authenticating with additional keys after first authentication
   * @param keyNo Key number to authenticate with (0-13)
   * @param key AES-128 key (16 bytes), or null to use key from KeyManager
   */
  async authenticateEV2NonFirst(keyNo: number, key?: Buffer): Promise<void> {
    if (!this.transactionId) {
      throw new Error('EV2 Non-First requires a previous EV2 First authentication');
    }

    // Get key from manager if not provided
    let authKey: Buffer;
    if (key) {
      authKey = key;
    } else if (this.keyManager && this.currentApp !== null) {
      authKey = this.keyManager.getKey(this.currentApp, keyNo);
    } else {
      throw new Error('No key provided and no KeyManager set');
    }

    if (authKey.length !== 16) {
      throw new Error('AES key must be 16 bytes');
    }

    console.log(`Authenticating with key ${keyNo} using AuthenticateEV2NonFirst...`);

    // Similar to EV2First but uses existing transaction ID
    const authCmd = Buffer.from([keyNo, 0x00, 0x00]);
    const response1 = await this.sendCommand(DesfireCommand.AUTHENTICATE_EV2_NON_FIRST, authCmd);

    // Rest of the protocol is similar to EV2First
    const encRndB = response1.slice(0, 16);
    const rndB = CryptoUtils.aesDecrypt(authKey, encRndB, Buffer.alloc(16, 0x00));

    const rndA = CryptoUtils.generateRandom(16);
    const rndBPrime = CryptoUtils.rotateLeft(rndB, 1);
    const challenge = Buffer.concat([rndA, rndBPrime]);

    const encChallenge = CryptoUtils.aesEncrypt(authKey, challenge, Buffer.alloc(16, 0x00));
    const response2 = await this.sendCommand(DesfireCommand.ADDITIONAL_FRAME, encChallenge);

    const encRndAPrime = response2.slice(0, 16);
    const decryptedRndAPrime = CryptoUtils.aesDecrypt(authKey, encRndAPrime, Buffer.alloc(16, 0x00));
    const expectedRndAPrime = CryptoUtils.rotateLeft(rndA, 1);

    if (!decryptedRndAPrime.equals(expectedRndAPrime)) {
      throw new Error('Authentication failed: RndA verification failed');
    }

    // Derive new session keys
    this.sessionKeyEnc = CryptoUtils.deriveSessionKeyEV2Enc(authKey, rndA, rndB);
    this.sessionKeyMac = CryptoUtils.deriveSessionKeyEV2Mac(authKey, rndA, rndB);

    this.authenticated = true;
    this.authenticatedKeyNo = keyNo;

    console.log(`✓ Authenticated with key ${keyNo} (EV2 Non-First)`);
  }

  // ============================================================================
  // KEY MANAGEMENT METHODS
  // ============================================================================

  /**
   * Authenticate using legacy DES/3DES (EV1) with key Kx.
   * Supports 16-byte (2-key 3DES) and 24-byte (3-key 3DES) keys.
   * If no key provided, uses 16 bytes of 0x00 (factory default).
   */
  async authenticateDES(keyNo: number, key?: Buffer): Promise<void> {
    const authKey = key && (key.length === 16 || key.length === 24) ? key : Buffer.alloc(16, 0x00);

    const cmd1 = Buffer.from([keyNo]);
    // Step 1: Send AUTHENTICATE (0x0A) with key number; expect enc(RndB)
    const resp1 = await this.tryTransmitAttempts(
      this.preferNoLe
        ? [
            { apdu: APDU.build(0x90, DesfireCommand.AUTHENTICATE, 0x00, 0x00, cmd1), usesLe: false },
            { apdu: APDU.build(0x90, DesfireCommand.AUTHENTICATE, 0x00, 0x00, cmd1, 0), usesLe: true },
          ]
        : [
            { apdu: APDU.build(0x90, DesfireCommand.AUTHENTICATE, 0x00, 0x00, cmd1, 0), usesLe: true },
            { apdu: APDU.build(0x90, DesfireCommand.AUTHENTICATE, 0x00, 0x00, cmd1), usesLe: false },
          ]
    );

    if (!APDU.isAdditionalFrame(resp1.sw1, resp1.sw2) && !APDU.isSuccess(resp1.sw1, resp1.sw2)) {
      throw new Error(`DESFire Authenticate (DES) failed: ${resp1.status} (SW: ${resp1.sw1.toString(16)}${resp1.sw2.toString(16)})`);
    }

    const encRndB = resp1.data;
    if (encRndB.length < 8) {
      throw new Error('Invalid Authenticate response: encRndB too short');
    }

    // Decrypt RndB with 3DES-CBC, IV=0
    const rndB = this.des3Decrypt(encRndB.slice(0, 8), authKey, Buffer.alloc(8, 0x00));

    // Prepare challenge: RndA || RndB'
    const rndA = CryptoUtils.generateRandom(8);
    const rndBPrime = CryptoUtils.rotateLeft(rndB, 1);
    const challenge = Buffer.concat([rndA, rndBPrime]);

    // Encrypt challenge with 3DES-CBC, IV = last ciphertext block from previous step (encRndB)
    const encChallenge = this.des3Encrypt(challenge, authKey, encRndB.slice(-8));

    // Step 2: Send ADDITIONAL_FRAME with encrypted challenge; expect enc(RndA')
    const resp2 = await this.tryTransmitAttempts(
      this.preferNoLe
        ? [
            { apdu: APDU.build(0x90, DesfireCommand.ADDITIONAL_FRAME, 0x00, 0x00, encChallenge), usesLe: false },
            { apdu: APDU.build(0x90, DesfireCommand.ADDITIONAL_FRAME, 0x00, 0x00, encChallenge, 0), usesLe: true },
          ]
        : [
            { apdu: APDU.build(0x90, DesfireCommand.ADDITIONAL_FRAME, 0x00, 0x00, encChallenge, 0), usesLe: true },
            { apdu: APDU.build(0x90, DesfireCommand.ADDITIONAL_FRAME, 0x00, 0x00, encChallenge), usesLe: false },
          ]
    );

    if (!APDU.isSuccess(resp2.sw1, resp2.sw2) && !APDU.isAdditionalFrame(resp2.sw1, resp2.sw2)) {
      throw new Error(`DESFire Authenticate (DES) step 2 failed: ${resp2.status} (SW: ${resp2.sw1.toString(16)}${resp2.sw2.toString(16)})`);
    }

    const encRndAPrime = resp2.data;
    if (encRndAPrime.length < 8) {
      throw new Error('Invalid Authenticate response: encRndA\' too short');
    }

    // Decrypt RndA' with IV = last block of our encChallenge
    const rndAPrime = this.des3Decrypt(encRndAPrime.slice(0, 8), authKey, encChallenge.slice(-8));
    const expectedRndAPrime = CryptoUtils.rotateLeft(rndA, 1);
    if (!rndAPrime.equals(expectedRndAPrime)) {
      throw new Error('Authentication (DES) failed: RndA verification failed');
    }

    this.authenticated = true;
    this.authenticatedKeyNo = keyNo;
    // Legacy auth without SM keys
    console.log(`✓ Authenticated (DES/3DES) with key ${keyNo}`);
  }

  private des3Encrypt(data: Buffer, key: Buffer, iv: Buffer): Buffer {
    const algo = key.length === 24 ? 'des-ede3-cbc' : 'des-ede-cbc';
    const cipher = crypto.createCipheriv(algo as any, key, iv);
    cipher.setAutoPadding(false);
    return Buffer.concat([cipher.update(data), cipher.final()]);
  }

  private des3Decrypt(data: Buffer, key: Buffer, iv: Buffer): Buffer {
    const algo = key.length === 24 ? 'des-ede3-cbc' : 'des-ede-cbc';
    const decipher = crypto.createDecipheriv(algo as any, key, iv);
    decipher.setAutoPadding(false);
    return Buffer.concat([decipher.update(data), decipher.final()]);
  }

  /**
   * Get key settings for current application
   * Returns: [KeySettings, MaxNumKeys, KeyType]
   */
  async getKeySettings(): Promise<{ settings: number; maxKeys: number; keyType: number }> {
    const response = await this.sendCommand(DesfireCommand.GET_KEY_SETTINGS);

    if (response.length < 2) {
      throw new Error('Invalid GetKeySettings response');
    }

    return {
      settings: response[0],
      maxKeys: response[1] & 0x3F, // Lower 6 bits
      keyType: response[1] & 0xC0  // Upper 2 bits
    };
  }

  /**
   * Change key settings for current application
   * Requires authentication with ChangeConfig key or Master key
   */
  async changeKeySettings(newSettings: number): Promise<void> {
    if (!this.authenticated) {
      throw new Error('Authentication required for ChangeKeySettings');
    }

    const data = Buffer.from([newSettings]);
    await this.sendCommand(DesfireCommand.CHANGE_KEY_SETTINGS, data, false);
    console.log(`Key settings changed to: 0x${newSettings.toString(16)}`);
  }

  /**
   * Get key version for a specific key
   */
  async getKeyVersion(keyNo: number): Promise<number> {
    const data = Buffer.from([keyNo]);
    const response = await this.sendCommand(DesfireCommand.GET_KEY_VERSION, data);
    return response[0];
  }

  /**
   * Change a key (legacy method - no encryption)
   * WARNING: This sends the key in plaintext! Only use with default keys or for testing.
   * @param keyNo Key number to change
   * @param newKey New AES-128 key (16 bytes)
   * @param oldKey Old AES-128 key (16 bytes) - optional
   */
  async changeKey(keyNo: number, newKey: Buffer, oldKey?: Buffer): Promise<void> {
    if (!this.authenticated) {
      throw new Error('Authentication required for ChangeKey');
    }

    if (newKey.length !== 16) {
      throw new Error('AES-128 keys must be 16 bytes');
    }

    console.log(`Changing key ${keyNo}...`);

    // For now, simplified version without encryption (only works with default keys)
    // In production, this should XOR with session key
    const keyVersion = 0x00; // New key version

    const data = Buffer.concat([
      Buffer.from([keyNo]),
      newKey,
      Buffer.from([keyVersion])
    ]);

    await this.sendCommand(DesfireCommand.CHANGE_KEY, data, false);
    console.log(`Key ${keyNo} changed successfully`);
  }

  /**
   * Change a key using EV2 method with proper encryption
   * This is the secure method for changing keys on EV2/EV3 cards
   * @param keyNo Key number to change
   * @param newKey New AES-128 key (16 bytes)
   * @param newKeyVersion Version number for new key (0-255)
   */
  async changeKeyEV2(keyNo: number, newKey: Buffer, newKeyVersion: number = 0): Promise<void> {
    if (!this.authenticated || !this.sessionKeyEnc) {
      throw new Error('EV2 authentication required for ChangeKeyEV2');
    }

    if (newKey.length !== 16) {
      throw new Error('AES-128 keys must be 16 bytes');
    }

    console.log(`Changing key ${keyNo} using EV2 method...`);

    // Build change key data
    // Format: KeyNo || CryptoData
    // CryptoData = E(KSesAuthENC, NewKey || NewKeyVersion || CRC32)

    const keyData = Buffer.concat([
      newKey,
      Buffer.from([newKeyVersion])
    ]);

    // Calculate CRC32 over the command data
    const crcData = Buffer.concat([
      Buffer.from([DesfireCommand.CHANGE_KEY_EV2, keyNo]),
      keyData
    ]);
    const crc = CryptoUtils.crc32Buffer(crcData);

    // Encrypt: NewKey || NewKeyVersion || CRC32
    const plainData = Buffer.concat([keyData, crc]);
    const encryptedData = CryptoUtils.aesEncrypt(this.sessionKeyEnc, plainData);

    const commandData = Buffer.concat([
      Buffer.from([keyNo]),
      encryptedData
    ]);

    await this.sendCommand(DesfireCommand.CHANGE_KEY_EV2, commandData, false);
    console.log(`✓ Key ${keyNo} changed successfully (version ${newKeyVersion})`);
  }

  // ============================================================================
  // KEY ROLLOVER METHODS (Advanced Key Management)
  // ============================================================================

  /**
   * Initialize key set for rollover
   * Prepares a new set of keys that can be activated atomically
   */
  async initializeKeySet(keySetNo: number, keyType: number = 0x80): Promise<void> {
    if (!this.authenticated) {
      throw new Error('Authentication required for InitializeKeySet');
    }

    const data = Buffer.from([keySetNo, keyType]);
    await this.sendCommand(DesfireCommand.INITIALIZE_KEY_SET, data, false);
    console.log(`Key set ${keySetNo} initialized`);
  }

  /**
   * Roll key set (switch to new key set)
   * Activates the prepared key set
   */
  async rollKeySet(keySetNo: number): Promise<void> {
    if (!this.authenticated) {
      throw new Error('Authentication required for RollKeySet');
    }

    const data = Buffer.from([keySetNo]);
    await this.sendCommand(DesfireCommand.ROLL_KEY_SET, data, false);
    console.log(`Rolled to key set ${keySetNo}`);
  }

  /**
   * Finalize key set rollover
   * Completes the key set change and removes old keys
   */
  async finalizeKeySet(): Promise<void> {
    if (!this.authenticated) {
      throw new Error('Authentication required for FinalizeKeySet');
    }

    await this.sendCommand(DesfireCommand.FINALIZE_KEY_SET, undefined, false);
    console.log('Key set finalized');
  }
}

export default DESFireCard;
