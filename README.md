# Sabado DESFire Card System - Documentation

## 📚 Overview

This repository contains comprehensive documentation and implementation plans for the **Sabado DESFire Multi-Application Card System** using MIFARE DESFire EV2/EV3 4K cards with Node.js.

### System Features

- ✅ **2 Independent Applications** on a single card
- ✅ **App 1 (Sabado Payment)**: Offline payment storage with value files
- ✅ **App 2 (Third-Party)**: 1KB storage with independent keys
- ✅ **AES-128 Encryption** for all operations
- ✅ **Cryptographic Isolation** between applications
- ✅ **Zero-Downtime Key Rotation** capability
- ✅ **Node.js Implementation** with TypeScript

---

## 📂 Documentation Structure

### Core Documentation

#### **API_DOCUMENTATION.md** - Complete API Reference ⭐ NEW
**Purpose**: Complete API documentation for all classes and methods

**Contents**:
- KeyManager API (key generation, storage, encryption)
- DESFireCard API (authentication, key management, file operations)
- Crypto utilities API (CMAC, CRC, encryption)
- NFC Reader API (event handling, card detection)
- APDU API (low-level communication)
- Complete examples for all operations

**Best For**: Developers implementing DESFire operations, API reference

---

#### **API_QUICK_REFERENCE.md** - Quick Lookup ⭐ NEW
**Purpose**: Fast reference for common operations

**Contents**:
- Quick code snippets for common tasks
- Authentication patterns
- Transaction handling
- Access rights configuration
- Error handling examples
- Complete workflow examples

**Best For**: Quick lookups during development, code examples

---

#### **KEY_MANAGEMENT.md** - Security Guide ⭐ NEW
**Purpose**: Complete key management and security guide

**Contents**:
- Key generation and storage
- Authentication protocols explained
- Key change procedures
- Key rollover (advanced)
- Security best practices
- Troubleshooting guide
- Complete working examples

**Best For**: Understanding authentication, implementing key management

---

#### **GITIGNORE_GUIDE.md** - Version Control ⭐ NEW
**Purpose**: Git configuration and security

**Contents**:
- Comprehensive .gitignore explanation
- Security checklist
- What to track vs ignore
- Pre-commit hooks
- Best practices

**Best For**: Setting up version control, preventing security leaks

---

### Implementation Documentation

### 1. **PRD.md** - Product Requirements Document
**Purpose**: Comprehensive product specification for the full DESFire system

**Contents**:
- System architecture overview
- Technical requirements (keys, files, protocols)
- Security requirements and compliance
- Functional and non-functional requirements
- Implementation phases (12 weeks)
- Success metrics and KPIs

**Best For**: Understanding the complete system vision, stakeholder reviews

---

### 2. **TASKS.md** - Implementation Task Breakdown
**Purpose**: Detailed task list for implementation

**Contents**:
- 92 detailed tasks across 5 phases
- Estimates for each task (1,100+ hours total)
- Dependencies and critical path
- Resource allocation recommendations

**Tasks by Phase**:
- **Phase 1**: Foundation (17 tasks, 180 hours)
- **Phase 2**: Application Logic (25 tasks, 280 hours)
- **Phase 3**: Key Management (11 tasks, 132 hours)
- **Phase 4**: Security & Testing (15 tasks, 192 hours)
- **Phase 5**: Deployment (20 tasks, 184 hours)

**Best For**: Project managers, development teams, sprint planning

---

### 3. **SABADO_IMPLEMENTATION.md** - Specific Implementation Plan
**Purpose**: Tailored implementation plan for Sabado's 2-app architecture

**Contents**:
- Ownership model (Sabado vs Third-Party)
- iPhone NFC vs Dedicated Reader analysis
- Detailed key architecture for 2 apps
- Card provisioning workflows with code samples
- Offline payment operations
- Security considerations and trust model
- Hardware requirements and recommendations

**Key Sections**:
- **Section 2**: iPhone NFC analysis → **Recommendation: Use USB reader (ACR122U)**
- **Section 3**: Complete key architecture (PICC + 2 apps)
- **Section 4**: Step-by-step provisioning code
- **Section 5**: Payment operations (balance, credit, debit)
- **Section 11**: FAQ about access control and security

**Best For**: Understanding the specific Sabado use case, architecture decisions

---

### 4. **QUICKSTART.md** - Getting Started Guide
**Purpose**: Quick setup guide with working code

**Contents**:
- Hardware setup instructions (ACR122U reader)
- Node.js project scaffolding
- Complete TypeScript code for:
  - Card reader initialization
  - APDU communication
  - DESFire command wrappers
  - Card provisioning script
- Step-by-step running instructions

**Includes Ready-to-Run Code**:
- `src/card/reader.ts` - NFC reader interface
- `src/card/apdu.ts` - APDU builder/parser
- `src/card/desfire.ts` - DESFire command library
- `src/provision.ts` - Card provisioning script
- `src/index.ts` - Main entry point

**Best For**: Developers starting implementation, quick prototyping

---

### 5. **Card.txt** (Existing)
**Purpose**: DESFire card technical reference

**Contents**:
- How DESFire keying works (PICC + Application levels)
- Key capacity and limits
- Suggested layout for multiple applications
- Key rotation procedures (without downtime)

**Best For**: Technical reference, understanding DESFire concepts

---

### 6. **Architecture.png** (Existing)
**Purpose**: Visual system architecture

**Shows**:
- DB Vault (Secure Key Store)
- Three servers (Payment, Access, Transit)
- DESFire Card with Application Isolation Layer
- Key relationships and data flow

**Best For**: Visual learners, presentations, architecture reviews

---

## 🚀 Quick Navigation

### If you want to...

| Goal | Read This | Then This |
|------|-----------|-----------|
| **Look up API methods** ⭐ | API_DOCUMENTATION.md | API_QUICK_REFERENCE.md |
| **Find code examples** ⭐ | API_QUICK_REFERENCE.md | src/auth-test.ts |

## Environment Variables

This project uses dotenv to load environment variables from a `.env` file in the repository root. These variables control debugging and provide default DESFire keys for PICC and applications.

- DESFIRE_DEBUG
  - Set to `1` to print raw APDUs and responses for troubleshooting.

- PICC master key (used by web UI erase/auth if not explicitly provided):
  - `DESFIRE_PICC_KEY_TYPE`: `DES`, `3DES`, `AES`, or `AES_EV2`
  - `DESFIRE_PICC_KEY`: hex-encoded key value
  - `DESFIRE_PICC_KEY_NO`: numeric key number (default `0`)

- Application master keys (per AID). Use uppercase 6-hex AID, zero-padded. Example for AID `0x000001`:
  - `DESFIRE_APP_000001_KEY_TYPE`: `DES`, `3DES`, `AES`, or `AES_EV2`
  - `DESFIRE_APP_000001_KEY`: hex-encoded key value
  - `DESFIRE_APP_000001_KEY_NO`: numeric key number (default `0`)

Example `.env`:

```
DESFIRE_DEBUG=1

DESFIRE_PICC_KEY_TYPE=3DES
DESFIRE_PICC_KEY=00112233445566778899AABBCCDDEEFF
DESFIRE_PICC_KEY_NO=0

DESFIRE_APP_000001_KEY_TYPE=DES
DESFIRE_APP_000001_KEY=00000000000000000000000000000000
DESFIRE_APP_000001_KEY_NO=0

# Encrypted keystore master (for saving/loading app keysets)
KEYSTORE_MASTER_PASSWORD=change-me
# or provide a 32-byte key in hex instead of password derivation
# KEYSTORE_MASTER_KEY_HEX=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
```

Notes:
- DES/3DES key length must match card configuration (16B for 2-key 3DES, 24B for 3-key 3DES).
- `AES_EV2` uses the EV2 First (0x71) authentication flow.
| **Implement authentication** ⭐ | KEY_MANAGEMENT.md | API_DOCUMENTATION.md (Auth section) |
| **Generate and store keys** ⭐ | KEY_MANAGEMENT.md (Quick Start) | src/auth-test.ts |
| **Set up git correctly** ⭐ | GITIGNORE_GUIDE.md | — |
| **Understand the business requirements** | PRD.md (Sections 1-2) | SABADO_IMPLEMENTATION.md (Sections 1-3) |
| **Make architecture decisions** | SABADO_IMPLEMENTATION.md (Section 2) | Architecture.png |
| **Start coding immediately** | QUICKSTART.md + API_QUICK_REFERENCE.md | src/ directory |
| **Plan the project timeline** | TASKS.md (Phases 1-5) | PRD.md (Section 7) |
| **Understand security model** | KEY_MANAGEMENT.md + SABADO_IMPLEMENTATION.md (Section 6) | PRD.md (Section 4) |
| **Set up development environment** | QUICKSTART.md (Steps 1-3) | README_APP.md |
| **Provision your first card** | QUICKSTART.md (Steps 4-6) | SABADO_IMPLEMENTATION.md (Section 4) |
| **Implement payments** | SABADO_IMPLEMENTATION.md (Section 5) | API_QUICK_REFERENCE.md (Value Files) |
| **Learn DESFire concepts** | Card.txt | PRD.md (Section 3) |

---

## 📋 Available Scripts

The project now includes working scripts for testing and development:

| Command | Description | Status |
|---------|-------------|--------|
| `npm run dev` | Read card information | ✅ Working |
| `npm run provision` | Provision card with 2 applications | ✅ Working |
| `npm run auth-test` | Test authentication and key management | ⭐ NEW |
| `npm run build` | Compile TypeScript | ✅ Working |
| `npm start` | Run compiled application | ✅ Working |

### Quick Test
```bash
# Install dependencies
npm install

# Build the project
npm run build

# Test authentication (generates keys, authenticates with factory defaults)
npm run auth-test
```

---

## 🛠️ Implementation Roadmap

### Week 1: Setup & Learning
1. Read **QUICKSTART.md** sections 1-3
2. Order ACR122U USB NFC reader (~$40)
3. Set up Node.js development environment
4. Read **Card.txt** to understand DESFire basics

### Week 2: Basic Card Communication
1. Follow **QUICKSTART.md** step 4 (Run basic test)
2. Test card detection and UID reading
3. Implement GetVersion and GetApplicationIDs
4. Study **SABADO_IMPLEMENTATION.md** section 4

### Week 3: Card Provisioning
1. Implement card provisioning (2 applications)
2. Test application creation
3. Generate and store keys securely
4. Follow **QUICKSTART.md** step 5-6

### Week 4-6: Application Development
1. Implement authentication (AES)
2. Create files in Application 1 (value + data)
3. Implement payment operations (credit/debit)
4. Test offline payment flow

### Week 7-8: Key Management
1. Implement DB Vault for key storage
2. Add key rotation workflow
3. Test multi-keyset rotation
4. Secure key distribution

### Week 9-10: Testing & Security
1. Security testing and hardening
2. Load testing with multiple cards
3. Document security procedures
4. Conduct code review

### Week 11-12: Production Readiness
1. Build REST API
2. Add monitoring and logging
3. Create deployment scripts
4. User acceptance testing

---

## 🔑 Key Decisions Summary

Based on analysis in **SABADO_IMPLEMENTATION.md** Section 2:

### Hardware Decision

| Aspect | iPhone NFC | USB Reader (ACR122U) |
|--------|-----------|---------------------|
| **Provisioning** | ❌ Difficult | ✅ **Recommended** |
| **Daily Transactions** | ✅ Possible | ✅ Reliable |
| **Development** | ❌ Limited | ✅ **Essential** |
| **Cost** | $0 (have iPhone) | ~$40 |
| **Complexity** | High (CoreNFC) | Low (nfc-pcsc) |

**Recommendation**: Start with USB reader for development and provisioning. Add iPhone support later for end-user transactions.

### Architecture Decision

```
2 Applications (Not 3):
├── App 1: Sabado Payment
│   ├── Owner: Sabado
│   ├── Storage: 3KB
│   ├── Keys: 5 AES-128 keys (K0-K4)
│   └── Purpose: Offline payment amount storage
│
└── App 2: Third-Party
    ├── Owner: Third-Party
    ├── Storage: 1KB (as requested)
    ├── Keys: 5 independent AES-128 keys
    └── Purpose: Third-party data (Sabado cannot access)
```

---

## ⚠️ Important Security Notes

1. **Key Storage**: All keys in documentation are examples. Generate unique keys for production.
2. **Key Files**: Never commit `keys/*.json` to version control. Add to `.gitignore`.
3. **Encryption**: Encrypt all keys at rest using a master encryption key.
4. **Access Control**: Implement strict RBAC for key access.
5. **Audit Logging**: Log all card operations and key access.
6. **Third-Party Trust**: After App 2 key takeover, Sabado has NO ACCESS to App 2 data.

---

## 📦 Required Hardware

### Essential (Order Now)
- **ACR122U USB NFC Reader** (~$40)
  - Available on Amazon
  - PC/SC compatible
  - Works with macOS/Windows/Linux

### Provided
- **MIFARE DESFire EV2/EV3 4K cards** (you have samples)

### Optional (Future)
- **ACR1252U** (~$60) - Better build quality, SAM slots
- **iPhone 7+** - For end-user transaction app

---

## 🔗 External Resources

### NXP Documentation
- [DESFire EV2 Datasheet](https://www.nxp.com/docs/en/data-sheet/MF3DX2_MF3DHx2_SDS.pdf)
- [DESFire Application Note AN12343](https://www.nxp.com/docs/en/application-note/AN12343.pdf)
- [DESFire Command Set](https://www.nxp.com/docs/en/application-note/AN10787.pdf)

### Libraries & Tools
- [nfc-pcsc (Node.js)](https://www.npmjs.com/package/nfc-pcsc)
- [CoreNFC (iOS)](https://developer.apple.com/documentation/corenfc)
- [libnfc (C library)](https://github.com/nfc-tools/libnfc)

### Standards
- ISO/IEC 14443 Type A
- ISO/IEC 7816-4 (Smart Card Standard)
- NFC Forum Type 4 Tag

---

## 🎯 Success Criteria

### Phase 1 Success (Week 3)
- ✅ Card detected and UID read
- ✅ 2 applications created on card
- ✅ Keys generated and securely stored

### Phase 2 Success (Week 6)
- ✅ Value file created in App 1
- ✅ Credit/Debit operations working
- ✅ Transaction history logged
- ✅ App 2 provisioned with 1KB storage

### Phase 3 Success (Week 8)
- ✅ Key rotation implemented
- ✅ Zero-downtime keyset rolling tested
- ✅ Third-party key takeover completed

### Production Ready (Week 12)
- ✅ REST API deployed
- ✅ Security testing passed
- ✅ Monitoring and alerting active
- ✅ Documentation complete

---

## 📞 Next Steps

1. **Review Documents**:
   - Start with **SABADO_IMPLEMENTATION.md** for overview
   - Read **QUICKSTART.md** for hands-on setup

2. **Order Hardware**:
   - Purchase ACR122U USB NFC reader

3. **Set Up Development**:
   - Follow **QUICKSTART.md** steps 1-3

4. **Test Card**:
   - Place DESFire card on reader
   - Run basic detection script

5. **Begin Implementation**:
   - Follow **TASKS.md** Phase 1
   - Track progress against timeline

---

## 📧 Document Metadata

| Document | Version | Last Updated | Status |
|----------|---------|--------------|--------|
| API_DOCUMENTATION.md | 1.0 | 2025-10-18 | ⭐ NEW |
| API_QUICK_REFERENCE.md | 1.0 | 2025-10-18 | ⭐ NEW |
| KEY_MANAGEMENT.md | 1.0 | 2025-10-18 | ⭐ NEW |
| GITIGNORE_GUIDE.md | 1.0 | 2025-10-18 | ⭐ NEW |
| README_APP.md | 1.0 | 2025-10-18 | Updated |
| SETUP_COMPLETE.md | 1.0 | 2025-10-18 | Updated |
| PRD.md | 1.0 | 2025-10-14 | Final |
| TASKS.md | 1.0 | 2025-10-14 | Final |
| SABADO_IMPLEMENTATION.md | 1.0 | 2025-10-14 | Final |
| QUICKSTART.md | 1.0 | 2025-10-14 | Final |
| README.md | 1.1 | 2025-10-18 | Updated |

---

**Ready to build secure offline payment cards!** 🚀

For questions or clarifications, refer to the FAQ section in **SABADO_IMPLEMENTATION.md** (Section 11).
