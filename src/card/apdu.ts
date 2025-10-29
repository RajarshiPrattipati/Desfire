/**
 * APDU (Application Protocol Data Unit) Builder and Parser
 * For ISO 7816-4 and DESFire communication
 */

export class APDU {
  /**
   * Build a standard APDU command
   * @param cla Class byte
   * @param ins Instruction byte
   * @param p1 Parameter 1
   * @param p2 Parameter 2
   * @param data Optional data payload
   * @param le Optional expected response length
   */
  static build(
    cla: number,
    ins: number,
    p1: number,
    p2: number,
    data?: Buffer,
    le?: number
  ): Buffer {
    const header = Buffer.from([cla, ins, p1, p2]);

    // Case 1: No data, no response (Le not provided)
    if (!data && le === undefined) {
      // Case 1: No data, no response
      return header;
    }

    // Case 2: No data, with expected response (Le provided; 0 is valid)
    if (!data && le !== undefined) {
      // Case 2: No data, with expected response
      return Buffer.concat([header, Buffer.from([le])]);
    }

    // Case 3: With data, no response (Le not provided)
    if (data && le === undefined) {
      // Case 3: With data, no response (Le not provided)
      const lc = Buffer.from([data.length]);
      return Buffer.concat([header, lc, data]);
    }

    // Case 4: With data and expected response (Le provided; 0 is valid)
    if (!data) {
      throw new Error('Data is required for this case');
    }
    const lc = Buffer.from([data.length]);
    const leBuffer = Buffer.from([le as number]);
    return Buffer.concat([header, lc, data, leBuffer]);
  }

  /**
   * Build DESFire native wrapped command
   * DESFire commands are sent as ISO 7816-4 APDU with CLA=0x90
   */
  static buildDESFire(cmd: number, data?: Buffer, le: number = 0): Buffer {
    const CLA = 0x90; // DESFire class
    const INS = cmd;  // DESFire command
    const P1 = 0x00;
    const P2 = 0x00;

    return this.build(CLA, INS, P1, P2, data, le);
  }

  /**
   * Parse APDU response
   * Returns status word (SW1 SW2) and data
   */
  static parse(response: Buffer): { sw1: number; sw2: number; data: Buffer; status: string } {
    if (response.length < 2) {
      throw new Error('Invalid APDU response: too short');
    }

    const sw1 = response[response.length - 2];
    const sw2 = response[response.length - 1];
    const data = response.slice(0, response.length - 2);

    return {
      sw1,
      sw2,
      data,
      status: this.getStatusMessage(sw1, sw2)
    };
  }

  /**
   * Get human-readable status message
   */
  static getStatusMessage(sw1: number, sw2: number): string {
    const sw = (sw1 << 8) | sw2;

    switch (sw) {
      // Success codes
      case 0x9000:
        return 'SUCCESS';
      case 0x91AF:
        return 'ADDITIONAL_FRAME';
      case 0x9100:
        return 'NO_CHANGES';

      // DESFire specific error codes
      case 0x919C:
        return 'OUT_OF_MEMORY';
      case 0x919E:
        return 'ILLEGAL_COMMAND';
      case 0x919D:
        return 'INTEGRITY_ERROR';
      case 0x91A0:
        return 'NO_SUCH_KEY';
      case 0x91A1:
        return 'LENGTH_ERROR';
      case 0x917E:
        return 'LENGTH_ERROR';
      case 0x91AE:
        return 'AUTHENTICATION_ERROR';
      case 0x91AF:
        return 'ADDITIONAL_FRAME';
      case 0x91BE:
        return 'BOUNDARY_ERROR';
      case 0x91C1:
        return 'PICC_INTEGRITY_ERROR';
      case 0x91CA:
        return 'COMMAND_ABORTED';
      case 0x91CD:
        return 'PICC_DISABLED_ERROR';
      case 0x91CE:
        return 'COUNT_ERROR';
      case 0x91DE:
        return 'DUPLICATE_ERROR';
      case 0x91EE:
        return 'EEPROM_ERROR';
      case 0x91F0:
        return 'FILE_NOT_FOUND';
      case 0x91FE:
        return 'FILE_INTEGRITY_ERROR';

      // ISO 7816 generic errors
      case 0x6281:
        return 'PART_OF_RETURNED_DATA_MAY_BE_CORRUPTED';
      case 0x6700:
        return 'WRONG_LENGTH';
      case 0x6982:
        return 'SECURITY_STATUS_NOT_SATISFIED';
      case 0x6985:
        return 'CONDITIONS_OF_USE_NOT_SATISFIED';
      case 0x6A82:
        return 'FILE_NOT_FOUND';
      case 0x6A86:
        return 'INCORRECT_P1_P2';

      default:
        return `UNKNOWN_ERROR_0x${sw.toString(16).toUpperCase()}`;
    }
  }

  /**
   * Check if response indicates success
   */
  static isSuccess(sw1: number, sw2: number): boolean {
    return (sw1 === 0x90 && sw2 === 0x00) || (sw1 === 0x91 && sw2 === 0x00);
  }

  /**
   * Check if response indicates additional frame
   */
  static isAdditionalFrame(sw1: number, sw2: number): boolean {
    return sw1 === 0x91 && sw2 === 0xAF;
  }
}

export default APDU;
