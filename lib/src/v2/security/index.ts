/**
 * Security Module Index
 * Exports all security and access control components
 */

// Access Control
export {
  IAccessControlProvider,
  SecurityContext,
  AccessControlResult,
  ResourceDefinition,
  OperationDefinition,
  DefaultAccessControlProvider,
  createOperationDefinition,
  createResourceDefinition,
  createSecurityContext
} from './access-control';

// Field-Level Encryption
export {
  IFieldEncryption,
  IKeyManager,
  EncryptionConfig,
  FieldEncryptionMetadata,
  EncryptedField,
  DefaultKeyManager,
  FieldEncryption,
  ENCRYPTION_PROFILES,
  createFieldEncryption,
  getFieldsForProfile
} from './field-encryption';

// Audit Logging
export {
  IAuditLogger,
  AuditEvent,
  AuditEventType,
  AuditSeverity,
  AuditStatus,
  AuditConfig,
  AuditDestination,
  DefaultAuditLogger,
  createAuditLogger,
  createSecurityAuditEvent
} from './audit-logger';

// Credential Management
export {
  ICredentialManager,
  ICredentialEncryption,
  StoredCredential,
  DatabaseCredentials,
  CredentialType,
  DefaultCredentialManager,
  DefaultCredentialEncryption,
  EnvironmentCredentialLoader,
  CREDENTIAL_TEMPLATES,
  createCredentialManager,
  createDatabaseCredentials
} from './credential-manager';

// TLS/SSL Enforcement
export {
  ITLSEnforcement,
  TLSConfig,
  TLSCertificateInfo,
  TLSConnectionStatus,
  DefaultTLSEnforcement,
  TLSEnforcedConnection,
  TLS_PROFILES,
  createTLSEnforcement,
  createTLSEnforcedConnection
} from './tls-enforcement';

// Security-aware DAL wrapper
export { SecureDataAccessLayer } from './secure-dal';