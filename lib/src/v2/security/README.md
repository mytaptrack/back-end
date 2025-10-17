# Security Module

This module provides comprehensive security features for the database abstraction layer, including access control, field-level encryption, audit logging, credential management, and TLS/SSL enforcement.

## Components

### Access Control (`access-control.ts`)
- Role-based and permission-based access control
- Field-level access restrictions
- Resource-specific validation
- Operation-level authorization

### Field Encryption (`field-encryption.ts`)
- Transparent field-level encryption/decryption
- Key management and rotation
- Configurable encryption profiles
- Support for sensitive data types (PII, financial, medical)

### Audit Logging (`audit-logger.ts`)
- Comprehensive audit trail for all database operations
- Configurable logging levels and destinations
- Compliance support (HIPAA, GDPR, SOX, PCI-DSS)
- Query and statistics capabilities

### Credential Management (`credential-manager.ts`)
- Secure storage of database credentials
- Encryption of stored credentials
- Credential rotation and lifecycle management
- Environment variable integration

### TLS/SSL Enforcement (`tls-enforcement.ts`)
- Enforced secure connections
- Certificate validation
- Cipher suite management
- Connection health monitoring

### Secure DAL (`secure-dal.ts`)
- Unified security wrapper for database operations
- Integrates all security components
- Transparent security enforcement
- Configurable security policies

## Usage Examples

See the test file (`security.test.ts`) for comprehensive usage examples.