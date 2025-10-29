# DESFire Card System - Node.js Application

Node.js/TypeScript application for managing MIFARE DESFire EV2/EV3 cards with 2-application architecture.

## Project Structure

```
desfire/
├── src/
│   ├── card/
│   │   ├── reader.ts       # NFC reader interface
│   │   ├── apdu.ts         # APDU builder/parser
│   │   └── desfire.ts      # DESFire command library
│   ├── index.ts            # Main entry point (card info)
│   └── provision.ts        # Card provisioning script
├── package.json
├── tsconfig.json
└── README_APP.md
```

## Installation

1. Install dependencies:
```bash
npm install
```

2. Build the TypeScript code:
```bash
npm run build
```

## Hardware Requirements

- **NFC Reader**: ACR122U USB NFC reader (or compatible PC/SC reader)
- **Cards**: MIFARE DESFire EV2 or EV3 4K cards

## Usage

### 1. Read Card Information

Run the main application to detect and read basic card information:

```bash
npm run dev
```

This will:
- Detect the NFC reader
- Wait for a card to be placed
- Read card UID, version, applications, and memory

### 2. Provision a Card

Run the provisioning script to set up a new card:

```bash
npm run provision
```

This will create:
- **Application 1 (0x000001)** - Sabado Payment
  - Value File 0: Balance (0 to 1,000,000)
  - Standard Data File 1: Transaction history (1KB)
  - Standard Data File 2: Metadata (256 bytes)

- **Application 2 (0x000002)** - Third-Party
  - Standard Data File 0: General storage (1KB)

### 3. Build for Production

Compile TypeScript to JavaScript:

```bash
npm run build
npm start
```

## Application Architecture

### Two Independent Applications

```
DESFire Card (4KB)
├── PICC Master Key (Card Level)
│
├── App 1: Sabado Payment (0x000001)
│   ├── 5 AES-128 Keys (K0-K4)
│   ├── File 0: Balance (Value File)
│   ├── File 1: Transaction History (1KB)
│   └── File 2: Metadata (256B)
│
└── App 2: Third-Party (0x000002)
    ├── 5 AES-128 Keys (K0-K4, independent)
    └── File 0: Storage (1KB)
```

### Key Architecture (per application)

- **K0**: Application Master Key - admin operations
- **K1**: Read Key - authenticated reads
- **K2**: Write Key - write operations
- **K3**: ChangeConfig Key - modify access rights
- **K4**: Reserved for future use

## Key Files

### src/card/reader.ts
- NFC reader management
- Event-driven card detection
- APDU transmission

### src/card/apdu.ts
- ISO 7816-4 APDU builder
- Response parser
- Status code interpreter

### src/card/desfire.ts
- Complete DESFire command set
- Application management
- File operations (create, read, write)
- Value file operations (credit, debit)

### src/provision.ts
- Card provisioning workflow
- Creates 2 applications
- Sets up file structures
- Configurable access rights

## Next Steps

1. **Authentication Implementation**
   - Implement AES-128 authentication
   - Key generation and storage
   - Secure key management

2. **Payment Operations**
   - Balance checking
   - Credit/debit operations
   - Transaction logging

3. **Third-Party Integration**
   - Key takeover mechanism
   - Independent data management
   - Access control

4. **Security Enhancements**
   - Key rotation
   - Encrypted communication
   - Audit logging

## Troubleshooting

### Reader not detected
- Ensure ACR122U driver is installed
- Check USB connection
- Verify PC/SC daemon is running (Linux: `pcscd`)

### Card not responding
- Place card flat on reader
- Keep card stationary during operations
- Verify card is DESFire EV2/EV3

### Application already exists
- Cards may come pre-provisioned
- Use `formatPICC()` to erase (WARNING: destructive)
- Or work with existing applications

## Security Notes

- Default factory keys are used initially (all zeros)
- MUST change keys before production use
- Store keys securely (encrypted at rest)
- Never commit keys to version control
- Implement proper key rotation

## References

- [QUICKSTART.md](./QUICKSTART.md) - Detailed setup guide
- [PRD.md](./PRD.md) - Complete system requirements
- [SABADO_IMPLEMENTATION.md](./SABADO_IMPLEMENTATION.md) - Architecture details
- [DESFire EV2 Datasheet](https://www.nxp.com/docs/en/data-sheet/MF3DX2_MF3DHx2_SDS.pdf)
