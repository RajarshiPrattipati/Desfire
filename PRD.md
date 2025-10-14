# Product Requirements Document (PRD)
## DESFire Multi-Application Card Management System

---

## 1. Executive Summary

### 1.1 Project Overview
A Node.js-based multi-application smart card management system utilizing MIFARE DESFire EV2/EV3 technology. The system enables secure management of three distinct applications (Payment, Access Control, Transit) on a single card with isolated security domains and centralized key management.

### 1.2 Project Objectives
- Implement secure key management for DESFire cards with PICC and application-level keys
- Enable multi-application support with complete isolation between apps
- Provide secure server infrastructure for Payment, Access Control, and Transit services
- Support zero-downtime key rotation using DESFire's keyset rolling capabilities
- Ensure AES-128 encryption for all operations on EV2/EV3 cards

### 1.3 Success Criteria
- Successful provisioning of cards with 3 isolated applications
- Secure authentication and data operations across all applications
- Key rotation capability without service interruption
- Audit logging for all card operations
- Support for 28 applications per card (card capacity)
- Support for 32 files per application with granular access control

---

## 2. System Architecture

### 2.1 Component Overview

#### 2.1.1 DB Vault (Secure Key Store)
- **Purpose**: Centralized secure storage for all cryptographic keys
- **Technology**: Node.js with encrypted database (e.g., PostgreSQL with pgcrypto or HashiCorp Vault)
- **Responsibilities**:
  - Store PICC master keys
  - Store application-specific keys (A1, A2, A3)
  - Provide key material to authorized servers
  - Track key versions and keysets
  - Support key rotation workflows

#### 2.1.2 MIFARE DESFire Card (Secure Element)
- **Supported Models**: DESFire EV2/EV3
- **Configuration**:
  - 1 PICC master key (card-level)
  - 3 applications: Payment (A1), Transit (A2), Access Control (A3)
  - 4-6 keys per application (K0-K5)
  - Multiple keyset support for rotation

#### 2.1.3 Server Infrastructure

**Payment Server (Manages A1)**
- Process payment transactions
- Authenticate using Application 1 keys
- Read/Write payment data files
- Value file operations for balance management

**Transit Server (Manages A2)**
- Handle transit entry/exit operations
- Authenticate using Application 2 keys
- Record trip history
- Manage transit credits/passes

**Access Server (Manages A3)**
- Control physical/logical access
- Authenticate using Application 3 keys
- Log access events
- Manage access permissions

### 2.2 Application Isolation Layer
- Each application has independent key material
- File access rights mapped to application-specific key numbers
- Security breach in one app does not compromise others
- PICC master key separate from application keys

---

## 3. Technical Requirements

### 3.1 Key Architecture

#### 3.1.1 PICC Level
- **PICC Master Key**: AES-128
- **Permissions**: Create/Delete applications, PICC settings only
- **Storage**: Highly restricted, escrowed separately

#### 3.1.2 Application Level (per app: A1, A2, A3)
- **K0**: Application Master Key (AMK) - admin operations
- **K1**: Read Key - authenticated reads
- **K2**: Write Key - write/append operations
- **K3**: ChangeConfig Key - modify file access rights
- **K4-K5**: Reserved for operational keys (audit, export, future use)

#### 3.1.3 Key Material Requirements
- **Total Keys**: 1 PICC + (5 keys × 3 apps) = 16 unique keys minimum
- **Key Type**: AES-128 for EV2/EV3
- **Key Uniqueness**: All keys must be cryptographically unique
- **Key Storage**: Encrypted at rest in DB Vault

### 3.2 File Structure per Application

#### Standard Data Files
- **File Access Rights**:
  - Read: K1
  - Write: K2
  - ReadWrite: K2
  - ChangeConfig: K3

#### Backup Data Files
- Same access mapping as Standard Data
- Automatic backup on write operations

#### Value Files (for Payment/Transit)
- Additional operations: Credit, Debit, LimitedCredit
- Transaction MAC for integrity

#### Record Files (for Access logs)
- Append-only logging
- Circular buffer or linear record storage

### 3.3 Node.js Technology Stack

#### Core Dependencies
```json
{
  "nfc-pcsc": "^0.8.0",           // NFC reader communication
  "node-forge": "^1.3.1",         // Cryptographic operations
  "pg": "^8.11.0",                // PostgreSQL client
  "express": "^4.18.2",           // REST API framework
  "dotenv": "^16.3.1",            // Environment configuration
  "winston": "^3.10.0",           // Logging
  "joi": "^17.10.0",              // Input validation
  "helmet": "^7.0.0",             // Security middleware
  "rate-limiter-flexible": "^2.4.2" // Rate limiting
}
```

#### Security Libraries
- `bcrypt` or `argon2` for password hashing
- `jsonwebtoken` for server authentication
- `crypto` (built-in) for key generation

### 3.4 Communication Protocols

#### Card Commands (ISO 7816-4 / DESFire Native)
- `AuthenticateEV2First` / `AuthenticateAES`
- `CreateApplication`
- `SelectApplication`
- `CreateStdDataFile`, `CreateBackupDataFile`, `CreateValueFile`, `CreateLinearRecordFile`
- `ReadData`, `WriteData`
- `GetValue`, `Credit`, `Debit`
- `ReadRecords`, `WriteRecord`
- `ChangeFileSettings`
- `ChangeKeyEV2`
- `InitializeKeySet`, `RollKeySet`, `FinalizeKeySet`

#### Server APIs (REST)
- `POST /api/card/provision` - Initialize new card
- `POST /api/card/authenticate` - Authenticate to application
- `GET /api/payment/balance` - Get payment balance
- `POST /api/payment/topup` - Add funds
- `POST /api/transit/checkin` - Transit entry
- `POST /api/transit/checkout` - Transit exit
- `POST /api/access/verify` - Verify access rights
- `POST /api/keys/rotate` - Initiate key rotation

---

## 4. Security Requirements

### 4.1 Key Management
- **Generation**: Cryptographically secure random key generation
- **Storage**: Encrypted at rest with master encryption key
- **Distribution**: Secure channels only (TLS 1.3+)
- **Rotation**: Automated rotation every 90 days or on-demand
- **Backup**: Encrypted key backups with split custody

### 4.2 Authentication & Authorization
- Mutual authentication between servers and DB Vault
- API key or JWT-based authentication for server APIs
- Role-based access control (RBAC) for administrative functions
- Audit logging for all key access

### 4.3 Data Protection
- All card communications authenticated and encrypted
- Secure messaging with DESFire EV2 encryption
- MAC validation on all value file operations
- File-level access control enforced by card

### 4.4 Compliance
- PCI DSS considerations for payment application
- GDPR compliance for personal data handling
- SOC 2 Type II audit preparation
- Secure coding practices (OWASP Top 10)

---

## 5. Functional Requirements

### 5.1 Card Provisioning
- **FR-1**: System shall initialize new DESFire cards with PICC master key
- **FR-2**: System shall create three applications (A1, A2, A3) with unique AIDs
- **FR-3**: System shall configure 5 keys per application with defined roles
- **FR-4**: System shall create required file structures per application
- **FR-5**: System shall validate successful provisioning before card activation

### 5.2 Payment Operations (Application 1)
- **FR-6**: System shall support balance inquiries
- **FR-7**: System shall support credit operations (top-up)
- **FR-8**: System shall support debit operations (payment)
- **FR-9**: System shall maintain transaction history
- **FR-10**: System shall enforce minimum balance limits

### 5.3 Transit Operations (Application 2)
- **FR-11**: System shall record check-in events
- **FR-12**: System shall record check-out events with fare calculation
- **FR-13**: System shall support multi-ride passes
- **FR-14**: System shall prevent double check-ins
- **FR-15**: System shall handle incomplete trips

### 5.4 Access Control Operations (Application 3)
- **FR-16**: System shall verify access credentials in <1 second
- **FR-17**: System shall log all access attempts
- **FR-18**: System shall support time-based access rules
- **FR-19**: System shall support zone-based access rules
- **FR-20**: System shall handle offline access scenarios

### 5.5 Key Rotation
- **FR-21**: System shall support zero-downtime key rotation via keysets
- **FR-22**: System shall pre-stage new keysets before activation
- **FR-23**: System shall validate new keys before RollKeySet
- **FR-24**: System shall maintain backward compatibility window (configurable)
- **FR-25**: System shall decommission old keysets after full migration

---

## 6. Non-Functional Requirements

### 6.1 Performance
- **NFR-1**: Card authentication <500ms
- **NFR-2**: Read/Write operations <200ms
- **NFR-3**: API response time <1s (p95)
- **NFR-4**: Support 100 concurrent card operations per server
- **NFR-5**: Key retrieval from vault <100ms

### 6.2 Scalability
- **NFR-6**: Support 100,000+ active cards
- **NFR-7**: Horizontal scaling for all server components
- **NFR-8**: Database read replicas for query scalability

### 6.3 Availability
- **NFR-9**: 99.9% uptime SLA for all servers
- **NFR-10**: Zero-downtime key rotation capability
- **NFR-11**: Automated failover for critical services
- **NFR-12**: Graceful degradation during partial outages

### 6.4 Reliability
- **NFR-13**: Transaction rollback on communication failure
- **NFR-14**: Retry logic with exponential backoff
- **NFR-15**: Idempotent API operations
- **NFR-16**: Data consistency across all operations

### 6.5 Maintainability
- **NFR-17**: Comprehensive logging for all operations
- **NFR-18**: Monitoring and alerting for key operations
- **NFR-19**: Configuration via environment variables
- **NFR-20**: Automated testing (unit, integration, e2e)

---

## 7. Implementation Phases

### Phase 1: Foundation (Weeks 1-3)
- Set up Node.js project structure
- Implement DB Vault with basic key storage
- Develop DESFire card communication library
- Create basic PICC and application management

### Phase 2: Application Logic (Weeks 4-6)
- Implement Payment server with value file operations
- Implement Transit server with record file operations
- Implement Access server with standard file operations
- Build REST API layer for each server

### Phase 3: Key Management (Weeks 7-8)
- Implement keyset initialization and management
- Build key rotation workflow
- Create key distribution mechanism
- Add key versioning and tracking

### Phase 4: Security & Testing (Weeks 9-10)
- Implement authentication and authorization
- Add encryption and secure messaging
- Comprehensive security testing
- Performance and load testing

### Phase 5: Production Readiness (Weeks 11-12)
- Monitoring and alerting setup
- Documentation and runbooks
- Deployment automation
- UAT and stakeholder sign-off

---

## 8. Dependencies & Constraints

### 8.1 Hardware Dependencies
- DESFire EV2 or EV3 cards
- NFC readers (PC/SC compatible, e.g., ACR122U, ACR1252U)
- Server infrastructure (cloud or on-premises)

### 8.2 Software Dependencies
- Node.js 18+ LTS
- PostgreSQL 14+ or similar secure database
- NFC reader drivers (libnfc or PC/SC lite)

### 8.3 Known Constraints
- DESFire EV1 does not support multiple keysets (key rotation requires maintenance window)
- Card capacity: 28 applications max, 32 files per application
- NFC communication range: ~4cm
- Transaction time constrained by NFC protocol overhead

---

## 9. Risks & Mitigations

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Key compromise | High | Low | Hardware security module (HSM), key rotation, audit logging |
| Card communication errors | Medium | Medium | Retry logic, transaction rollback, error handling |
| Scalability bottlenecks | Medium | Medium | Load testing, horizontal scaling, caching |
| Compliance violations | High | Low | Security audits, penetration testing, compliance reviews |
| Reader compatibility issues | Low | Medium | Multi-reader testing, fallback protocols |

---

## 10. Success Metrics

### 10.1 Technical Metrics
- Card provisioning success rate: >99.5%
- Transaction success rate: >99.9%
- Key rotation completion rate: 100%
- API error rate: <0.1%
- Mean time to recovery (MTTR): <15 minutes

### 10.2 Business Metrics
- Time to provision new card: <2 minutes
- User authentication time: <1 second
- Support ticket reduction: 30% (vs. manual processes)
- System uptime: 99.9%

---

## 11. Future Enhancements

### 11.1 Short-term (6 months)
- Mobile app integration (NFC-enabled phones)
- Biometric authentication (fingerprint + card)
- Real-time fraud detection
- Enhanced analytics dashboard

### 11.2 Long-term (12+ months)
- Blockchain integration for audit trail
- Machine learning for anomaly detection
- Support for additional applications (loyalty, healthcare)
- Offline operation mode with deferred sync
- Multi-card support per user

---

## 12. Appendix

### 12.1 Glossary
- **PICC**: Proximity Integrated Circuit Card (card level)
- **AID**: Application Identifier (unique per app)
- **AMK**: Application Master Key (K0)
- **MAC**: Message Authentication Code
- **SAM**: Secure Access Module (for key management)
- **KS**: KeySet (collection of keys for rotation)

### 12.2 References
- DESFire EV2/EV3 Datasheet (NXP)
- ISO/IEC 7816-4 Standard
- ISO/IEC 14443 Type A Standard
- MIFARE DESFire EV2 Application Note (AN12343)
- PCI DSS v4.0 Requirements

### 12.3 Document History
| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-10-14 | System | Initial PRD creation |

---

**Document Owner**: Engineering Team
**Last Updated**: 2025-10-14
**Status**: Draft for Review
