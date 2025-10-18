/**
 * Field-Level Encryption Implementation
 * Provides transparent encryption/decryption for sensitive data fields
 */

import * as crypto from 'crypto';

// Encryption configuration
export interface EncryptionConfig {
  algorithm: string;
  keyDerivation: {
    algorithm: string;
    iterations: number;
    keyLength: number;
    saltLength: number;
  };
  encoding: 'base64' | 'hex';
}

// Field encryption metadata
export interface FieldEncryptionMetadata {
  algorithm: string;
  iv: string;
  salt: string;
  keyId?: string;
  version: number;
}

// Encrypted field wrapper
export interface EncryptedField {
  encrypted: true;
  value: string;
  metadata: FieldEncryptionMetadata;
}

// Field encryption interface
export interface IFieldEncryption {
  /**
   * Encrypt a field value
   */
  encryptField(value: any, fieldName: string, keyId?: string): Promise<EncryptedField>;

  /**
   * Decrypt a field value
   */
  decryptField(encryptedField: EncryptedField, fieldName: string): Promise<any>;

  /**
   * Encrypt multiple fields in an object
   */
  encryptFields(data: Record<string, any>, fieldsToEncrypt: string[]): Promise<Record<string, any>>;

  /**
   * Decrypt multiple fields in an object
   */
  decryptFields(data: Record<string, any>, fieldsToDecrypt?: string[]): Promise<Record<string, any>>;

  /**
   * Check if a field is encrypted
   */
  isEncryptedField(value: any): boolean;

  /**
   * Get list of encrypted fields in an object
   */
  getEncryptedFields(data: Record<string, any>): string[];
}

// Key management interface
export interface IKeyManager {
  /**
   * Get encryption key by ID
   */
  getKey(keyId: string): Promise<Buffer>;

  /**
   * Get current active key
   */
  getCurrentKey(): Promise<{ keyId: string; key: Buffer }>;

  /**
   * Rotate encryption keys
   */
  rotateKey(): Promise<string>;

  /**
   * Derive key from master key and salt
   */
  deriveKey(masterKey: Buffer, salt: Buffer, iterations: number, keyLength: number): Promise<Buffer>;
}

// Default key manager implementation
export class DefaultKeyManager implements IKeyManager {
  private keys: Map<string, Buffer> = new Map();
  private currentKeyId: string;
  private masterKey: Buffer;

  constructor(masterKey?: Buffer) {
    this.masterKey = masterKey || crypto.randomBytes(32);
    this.currentKeyId = 'default';
    this.keys.set(this.currentKeyId, this.masterKey);
  }

  async getKey(keyId: string): Promise<Buffer> {
    const key = this.keys.get(keyId);
    if (!key) {
      throw new Error(`Encryption key not found: ${keyId}`);
    }
    return key;
  }

  async getCurrentKey(): Promise<{ keyId: string; key: Buffer }> {
    const key = await this.getKey(this.currentKeyId);
    return { keyId: this.currentKeyId, key };
  }

  async rotateKey(): Promise<string> {
    const newKeyId = `key_${Date.now()}`;
    const newKey = crypto.randomBytes(32);
    this.keys.set(newKeyId, newKey);
    this.currentKeyId = newKeyId;
    return newKeyId;
  }

  async deriveKey(
    masterKey: Buffer,
    salt: Buffer,
    iterations: number,
    keyLength: number
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      crypto.pbkdf2(masterKey, salt, iterations, keyLength, 'sha256', (err, derivedKey) => {
        if (err) reject(err);
        else resolve(derivedKey);
      });
    });
  }

  // Administrative methods
  addKey(keyId: string, key: Buffer): void {
    this.keys.set(keyId, key);
  }

  setCurrentKey(keyId: string): void {
    if (!this.keys.has(keyId)) {
      throw new Error(`Key not found: ${keyId}`);
    }
    this.currentKeyId = keyId;
  }
}

// Field encryption implementation
export class FieldEncryption implements IFieldEncryption {
  private config: EncryptionConfig;
  private keyManager: IKeyManager;
  private encryptedFieldsCache: Map<string, Set<string>> = new Map();

  constructor(keyManager: IKeyManager, config?: Partial<EncryptionConfig>) {
    this.keyManager = keyManager;
    this.config = {
      algorithm: 'aes-256-cbc',
      keyDerivation: {
        algorithm: 'pbkdf2',
        iterations: 100000,
        keyLength: 32,
        saltLength: 16
      },
      encoding: 'base64',
      ...config
    };
  }

  async encryptField(value: any, fieldName: string, keyId?: string): Promise<EncryptedField> {
    if (value === null || value === undefined) {
      throw new Error('Cannot encrypt null or undefined value');
    }

    // Get encryption key
    const { keyId: currentKeyId, key: masterKey } = keyId 
      ? { keyId, key: await this.keyManager.getKey(keyId) }
      : await this.keyManager.getCurrentKey();

    // Generate salt and IV
    const salt = crypto.randomBytes(this.config.keyDerivation.saltLength);
    const iv = crypto.randomBytes(16); // CBC mode uses 16-byte IV

    // Derive encryption key
    const encryptionKey = await this.keyManager.deriveKey(
      masterKey,
      salt,
      this.config.keyDerivation.iterations,
      this.config.keyDerivation.keyLength
    );

    // Serialize value
    const plaintext = JSON.stringify(value);

    // Encrypt
    const cipher = crypto.createCipheriv(this.config.algorithm, encryptionKey, iv);
    let encrypted = cipher.update(plaintext, 'utf8', this.config.encoding);
    encrypted += cipher.final(this.config.encoding);

    return {
      encrypted: true,
      value: encrypted,
      metadata: {
        algorithm: this.config.algorithm,
        iv: iv.toString(this.config.encoding),
        salt: salt.toString(this.config.encoding),
        keyId: currentKeyId,
        version: 1
      }
    };
  }

  async decryptField(encryptedField: EncryptedField, fieldName: string): Promise<any> {
    if (!this.isEncryptedField(encryptedField)) {
      throw new Error('Invalid encrypted field format');
    }

    const { value, metadata } = encryptedField;

    // Get decryption key
    const masterKey = await this.keyManager.getKey(metadata.keyId || 'default');

    // Parse metadata
    const salt = Buffer.from(metadata.salt, this.config.encoding);
    const iv = Buffer.from(metadata.iv, this.config.encoding);

    // Derive decryption key
    const decryptionKey = await this.keyManager.deriveKey(
      masterKey,
      salt,
      this.config.keyDerivation.iterations,
      this.config.keyDerivation.keyLength
    );

    // Decrypt
    const decipher = crypto.createDecipheriv(metadata.algorithm, decryptionKey, iv);
    let decrypted = decipher.update(value, this.config.encoding, 'utf8');
    decrypted += decipher.final('utf8');

    // Deserialize value
    return JSON.parse(decrypted);
  }

  async encryptFields(
    data: Record<string, any>,
    fieldsToEncrypt: string[]
  ): Promise<Record<string, any>> {
    const result = { ...data };

    for (const fieldName of fieldsToEncrypt) {
      if (fieldName in result && result[fieldName] !== null && result[fieldName] !== undefined) {
        // Skip if already encrypted
        if (!this.isEncryptedField(result[fieldName])) {
          result[fieldName] = await this.encryptField(result[fieldName], fieldName);
        }
      }
    }

    return result;
  }

  async decryptFields(
    data: Record<string, any>,
    fieldsToDecrypt?: string[]
  ): Promise<Record<string, any>> {
    const result = { ...data };
    const fieldsToProcess = fieldsToDecrypt || this.getEncryptedFields(data);

    for (const fieldName of fieldsToProcess) {
      if (fieldName in result && this.isEncryptedField(result[fieldName])) {
        try {
          result[fieldName] = await this.decryptField(result[fieldName], fieldName);
        } catch (error) {
          // Log error but don't fail the entire operation
          console.error(`Failed to decrypt field ${fieldName}:`, error.message);
          // Keep encrypted value or set to null based on policy
          result[fieldName] = null;
        }
      }
    }

    return result;
  }

  isEncryptedField(value: any): boolean {
    return (
      typeof value === 'object' &&
      value !== null &&
      value.encrypted === true &&
      typeof value.value === 'string' &&
      typeof value.metadata === 'object' &&
      !!value.metadata.algorithm &&
      !!value.metadata.iv &&
      !!value.metadata.salt
    );
  }

  getEncryptedFields(data: Record<string, any>): string[] {
    const encryptedFields: string[] = [];

    for (const [key, value] of Object.entries(data)) {
      if (this.isEncryptedField(value)) {
        encryptedFields.push(key);
      }
    }

    return encryptedFields;
  }

  // Configuration methods
  updateConfig(config: Partial<EncryptionConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): EncryptionConfig {
    return { ...this.config };
  }
}

// Predefined field encryption profiles
export const ENCRYPTION_PROFILES = {
  PII: ['ssn', 'socialSecurityNumber', 'taxId', 'passport'],
  FINANCIAL: ['creditCard', 'bankAccount', 'routingNumber', 'accountNumber'],
  MEDICAL: ['medicalRecord', 'diagnosis', 'medication', 'healthInfo'],
  CONTACT: ['email', 'phone', 'address', 'emergencyContact'],
  SENSITIVE: ['password', 'token', 'secret', 'apiKey']
};

// Helper function to create field encryption instance
export function createFieldEncryption(
  masterKey?: Buffer,
  config?: Partial<EncryptionConfig>
): FieldEncryption {
  const keyManager = new DefaultKeyManager(masterKey);
  return new FieldEncryption(keyManager, config);
}

// Helper function to get fields to encrypt based on profile
export function getFieldsForProfile(profile: keyof typeof ENCRYPTION_PROFILES): string[] {
  return ENCRYPTION_PROFILES[profile] || [];
}