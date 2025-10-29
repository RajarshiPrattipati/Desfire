declare module 'nfc-pcsc' {
  import { EventEmitter } from 'events';

  export class NFC extends EventEmitter {
    constructor();
    on(event: 'reader', listener: (reader: Reader) => void): this;
    on(event: 'error', listener: (err: Error) => void): this;
    once(event: 'reader', listener: (reader: Reader) => void): this;
  }

  export interface Card {
    uid: string;
    atr: Buffer;
    type: string;
  }

  export interface Reader extends EventEmitter {
    reader: {
      name: string;
    };
    // When true, library auto-processes ISO14443 tags (e.g., requires AID for -4).
    // We set this to false for DESFire to manage APDUs ourselves.
    autoProcessing?: boolean;
    // Optional AID to select for ISO 14443-4 tags when autoProcessing is enabled.
    aid?: Buffer | ((card: Card) => Buffer);
    transmit(data: Buffer, responseLength: number): Promise<Buffer>;
    on(event: 'card', listener: (card: Card) => void): this;
    on(event: 'card.off', listener: (card: Card) => void): this;
    on(event: 'error', listener: (err: Error) => void): this;
    on(event: 'end', listener: () => void): this;
  }
}
