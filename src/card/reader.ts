/// <reference path="../types/nfc-pcsc.d.ts" />
/**
 * NFC Card Reader Interface
 * Handles communication with NFC readers using PC/SC protocol
 */

import { NFC } from 'nfc-pcsc';
import { EventEmitter } from 'events';

export interface CardReader extends EventEmitter {
  name: string;
  transmit(data: Buffer, responseLength: number): Promise<Buffer>;
}

export class NFCReaderManager extends EventEmitter {
  private nfc: any;
  private readers: Map<string, any> = new Map();

  constructor() {
    super();
    this.nfc = new NFC();
    this.initialize();
  }

  private initialize(): void {
    this.nfc.on('reader', (reader: any) => {
      console.log(`Reader detected: ${reader.reader.name}`);
      this.readers.set(reader.reader.name, reader);
      this.emit('reader-connected', reader);

      // Default: DISABLE autoProcessing to avoid nfc-pcsc ISO-DEP AID errors
      // Enable via READER_AUTOPROCESS=on when you want ISO-DEP AID selection
      if (typeof reader.autoProcessing !== 'undefined') {
        const envOpt = String(process.env.READER_AUTOPROCESS || '').toLowerCase();
        const desired = envOpt === 'on' || envOpt === 'true' || envOpt === '1' ? true
                      : envOpt === 'off' || envOpt === 'false' || envOpt === '0' ? false
                      : false; // default OFF
        reader.autoProcessing = desired;
        console.log(`autoProcessing ${desired ? 'enabled' : 'disabled'} for ${reader.reader.name}`);

        // If enabling autoProcessing, configure AID if provided; else disable to avoid nfc-pcsc error on ISO-DEP
        if (desired) {
          try {
            const listRaw = String(process.env.READER_AIDS || '')
              .split(/[\,\s]+/)
              .map(s => s.trim())
              .filter(Boolean);
            const normalizeHex = (s: string): string => {
              const h = s.replace(/^0x/i, '').replace(/\s+/g, '');
              if (!/^[0-9a-fA-F]*$/.test(h)) return '';
              return h.length % 2 === 1 ? '0' + h : h; // ensure even-length hex
            };
            let setAid = false;
            if (listRaw.length > 0) {
              const aids = listRaw
                .map(normalizeHex)
                .filter(Boolean)
                .map(h => Buffer.from(h, 'hex'));
              if (aids.length > 0) {
                (reader as any).aid = aids[0];
                setAid = true;
                console.log(`ISO-DEP AID configured for autoProcessing: ${listRaw.join(', ')}`);
              }
            }
            if (!setAid) {
              reader.autoProcessing = false;
              console.log(`autoProcessing disabled for ${reader.reader.name} (no READER_AIDS configured)`);
            }
          } catch (e) {
            console.log('Failed to configure AID(s) for autoProcessing:', (e as Error)?.message || e);
          }
        }
      }

      // Optional: ACR122U auto ATS tweak via escape control
      (async () => {
        try {
          const name = (reader.reader?.name || '').toUpperCase();
          const want = String(process.env.ACR122U_AUTO_ATS || 'on').toLowerCase();
          const enable = want === 'on' || want === 'true' || want === '1';
          if (enable && name.includes('ACR122U') && typeof (reader as any).control === 'function') {
            const pkt = Buffer.from([0xFF, 0x00, 0x51, 0x40, 0x00]);
            try { await (reader as any).control(pkt, 1); } catch {}
            console.log('ACR122U: Auto ATS parameter set (0x40)');
          }
        } catch {
          // ignore non-fatal
        }
      })();

      reader.on('card', (card: any) => {
        console.log(`Card detected on ${reader.reader.name}`);
        console.log(`UID: ${card.uid}`);
        try {
          console.log(`ATR: ${card.atr?.toString('hex')}`);
        } catch {
          console.log('ATR: (unavailable)');
        }
        console.log(`Type: ${card.type}`);
        this.emit('card-detected', { reader, card });
      });

      reader.on('card.off', (card: any) => {
        console.log(`Card removed from ${reader.reader.name}`);
        this.emit('card-removed', { reader, card });
      });

      reader.on('error', (err: Error) => {
        console.error(`Reader error on ${reader.reader.name}:`, err);
        this.emit('reader-error', { reader, error: err });
      });

      reader.on('end', () => {
        console.log(`Reader ${reader.reader.name} disconnected`);
        this.readers.delete(reader.reader.name);
        this.emit('reader-disconnected', reader);
      });
    });

    this.nfc.on('error', (err: Error) => {
      console.error('NFC error:', err);
      this.emit('error', err);
    });
  }

  /**
   * Transmit APDU command to card
   */
  async transmit(reader: any, data: Buffer, responseLength: number = 256): Promise<Buffer> {
    try {
      const response = await reader.transmit(data, responseLength);
      return response;
    } catch (error) {
      throw new Error(`Transmission failed: ${error}`);
    }
  }

  /**
   * Get all connected readers
   */
  getReaders(): any[] {
    return Array.from(this.readers.values());
  }

  /**
   * Get reader by name
   */
  getReader(name: string): any {
    return this.readers.get(name);
  }

  /**
   * Close all readers and cleanup
   */
  close(): void {
    this.readers.clear();
    this.removeAllListeners();
  }
}

export default NFCReaderManager;
