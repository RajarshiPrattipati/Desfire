/**
 * ACR122U helpers for DESFire
 * - Escape-command pass-through for native DESFire APDUs
 * - PN532 RATS (ISO-DEP activation) handshake
 */

export function isACR122U(reader: any): boolean {
  try {
    const name = String(reader?.reader?.name || reader?.name || '').toUpperCase();
    return name.includes('ACR122U');
  } catch {
    return false;
  }
}

async function getEscapeControlCode(reader: any): Promise<number | null> {
  try {
    const r: any = reader as any;
    if (r.__acrEscCode) return r.__acrEscCode as number;
    if (typeof r.control !== 'function' || typeof r.SCARD_CTL_CODE !== 'function') return null;
    const cmCode = r.SCARD_CTL_CODE(3400); // CM_IOCTL_GET_FEATURE_REQUEST
    const resp: Buffer = await new Promise((resolve, reject) => {
      try {
        r.control(Buffer.alloc(0), cmCode, 512, (err: any, data: Buffer) => {
          if (err) return reject(err);
          resolve(data);
        });
      } catch (e) { reject(e); }
    });
    // TLV parse: 0x12 => FEATURE_CCID_ESC_COMMAND (DWORD LE)
    let i = 0;
    while (i + 2 <= resp.length) {
      const tag = resp[i];
      const len = resp[i + 1];
      i += 2;
      if (i + len > resp.length) break;
      const val = resp.slice(i, i + len);
      i += len;
      if (tag === 0x12 && len >= 4) {
        const ctl = val.readUInt32LE(0);
        r.__acrEscCode = ctl;
        return ctl;
      }
    }
    return null;
  } catch {
    return null;
  }
}

function parsePn532Response(resp: Buffer): Buffer | null {
  if (!resp || resp.length < 4) return null;
  for (let i = 0; i <= resp.length - 3; i++) {
    if (resp[i] !== 0xD5) continue;
    const cmd = resp[i + 1];
    const status = resp[i + 2];
    if ((cmd === 0x41 || cmd === 0x43) && status === 0x00) {
      const data = resp.slice(i + 3);
      return data.length >= 2 ? data : null;
    }
  }
  return null;
}

/**
 * Transmit a DESFire APDU via ACR122U escape.
 * Returns raw RAPDU (data+SW1SW2) or empty Buffer on failure.
 */
export async function transmitViaAcr122U(reader: any, apdu: Buffer, rxLen: number = 512): Promise<Buffer> {
  const ctl = await getEscapeControlCode(reader);
  const hasReaderControlWrapper = typeof (reader as any).control === 'function' && (reader as any).control.length <= 2;
  const hasUnderlyingControl = typeof (reader as any).reader?.control === 'function' && (reader as any).reader?.IOCTL_CCID_ESCAPE;
  const debug = !!process.env.DESFIRE_DEBUG;

  const sendEsc = async (p: Buffer): Promise<Buffer | null> => {
    const esc = Buffer.concat([Buffer.from([0xFF, 0x00, 0x00, 0x00, p.length]), p]);
    if (hasReaderControlWrapper) {
      try { return await (reader as any).control(esc, rxLen); } catch {}
    }
    if (hasUnderlyingControl) {
      try {
        return await new Promise((resolve, reject) => {
          try {
            (reader as any).reader.control(esc, (reader as any).reader.IOCTL_CCID_ESCAPE, rxLen, (err: any, data: Buffer) => {
              if (err) return reject(err);
              resolve(data);
            });
          } catch (e) { reject(e); }
        });
      } catch {}
    }
    if (ctl && typeof (reader as any).control === 'function' && (reader as any).control.length > 2) {
      try {
        return await new Promise((resolve, reject) => {
          try {
            (reader as any).control(esc, ctl, rxLen, (err: any, data: Buffer) => {
              if (err) return reject(err);
              resolve(data);
            });
          } catch (e) { reject(e); }
        });
      } catch {}
    }
    return null;
  };

  const payloads: Buffer[] = [
    apdu,
    Buffer.concat([Buffer.from([0xD4, 0x40, 0x01]), apdu]),
    Buffer.concat([Buffer.from([0xD4, 0x42]), apdu])
  ];

  for (const payload of payloads) {
    let resp = await sendEsc(payload);
    const parsed = parsePn532Response(resp || Buffer.alloc(0));
    if (parsed && parsed.length >= 2) return parsed;
    if (debug) await new Promise((r) => setTimeout(r, 60));
    resp = await sendEsc(payload);
    const parsed2 = parsePn532Response(resp || Buffer.alloc(0));
    if (parsed2 && parsed2.length >= 2) return parsed2;
  }
  return Buffer.alloc(0);
}

/**
 * Try to activate ISO-DEP (Type 4) via PN532 RATS over escape.
 */
export async function ensureIsoDep(reader: any): Promise<boolean> {
  const debug = !!process.env.DESFIRE_DEBUG;
  // PN532 InListPassiveTarget
  try {
    if (debug) console.log('>> (esc) pn532 InListPassiveTarget');
    const esc = Buffer.concat([Buffer.from([0xFF, 0x00, 0x00, 0x00, 4]), Buffer.from([0xD4, 0x4A, 0x01, 0x00])]);
    if (typeof (reader as any).control === 'function') {
      await (reader as any).control(esc, 64);
    }
  } catch {}
  // PN532 RATS via InCommunicateThru
  try {
    if (debug) console.log('>> (esc) RATS (E0 50)');
    const esc = Buffer.concat([Buffer.from([0xFF, 0x00, 0x00, 0x00, 4]), Buffer.from([0xD4, 0x42, 0xE0, 0x50])]);
    let resp: Buffer | null = null;
    try { resp = await (reader as any).control(esc, 128); } catch {}
    const parsed = resp ? parsePn532Response(resp) : null;
    return !!(parsed && parsed.length);
  } catch {
    return false;
  }
}

