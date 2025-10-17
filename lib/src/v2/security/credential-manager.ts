/**
 * Secure Credential Management Implementation
 * Provides secure storage and retrieval of database connection credentials
 */

import * as crypto from 'crypto';

// Credential types
export type CredentialType = 'database' | 'api_key' | 'certificate' | 'token' | 'secret';

// Credential storage interface
export interface StoredCredential {
  id: string;
  type: CredentialType;
  name: string;
  description?: string;
  encrypted: boolean;
  value: string; // Encrypted or plain based on 'encrypted' flag
  metadata: {
    createdAt: Date;
    updatedAt: Date;
    expiresAt?: Date;
    rotationInterval?: number; // Days
    lastRotated?: Date;
    version: number;
    tags?: string[];
  };
  encryptionMetadata?: {
    algorithm: string;
    keyId: string;
    iv: string;
    salt: string;
  };
}

// Database connection credentials
export interface DatabaseCredentials {
  type: 'mongodb' | 'dynamodb' | 'mysql' | 'postgresql';
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  password?: string;
  connectionString?: string;
  region?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  sessionToken?: string;
  ssl?: boolean;
  sslCert?: string;
  sslKey?: string;
  sslCA?: string;
  additionalOptions?: Record<string, any>;
}

// Credential manager interface
export interface ICredentialManager {
  /**
   * Store a credential securely
   */
  storeCredential(
    name: string,
    type: CredentialType,
    value: any,
    options?: {
      description?: string;
      expiresAt?: Date;
      rotationInterval?: number;
      tags?: string[];
      encrypt?: boolean;
    }
  ): Promise<string>;

  /**
   * Retrieve a credential
   */
  getCredential(nameOrId: string): Promise<any>;

  /**
   * Update a credential
   */
  updateCredential(
    nameOrId: string,
    value: any,
    options?: {
      description?: string;
      expiresAt?: Date;
      rotationInterval?: number;
      tags?: string[];
    }
  ): Promise<void>;

  /**
   * Delete a credential
   */
  deleteCredential(nameOrId: string): Promise<void>;

  /**
   * List all credentials (metadata only)
   */
  listCredentials(type?: CredentialType): Promise<Array<Omit<StoredCredential, 'value'>>>;

  /**
   * Rotate a credential
   */
  rotateCredential(nameOrId: string, newValue: any): Promise<void>;

  /**
   * Check if credential exists
   */
  hasCredential(nameOrId: string): Promise<boolean>;

  /**
   * Get database credentials in a standardized format
   */
  getDatabaseCredentials(nameOrId: string): Promise<DatabaseCredentials>;

  /**
   * Validate credential format
   */
  validateCredential(type: CredentialType, value: any): boolean;
}

// Encryption service for credentials
export interface ICredentialEncryption {
  encrypt(data: any, keyId?: string): Promise<{ encrypted: string; metadata: any }>;
  decrypt(encrypted: string, metadata: any): Promise<any>;
  rotateKey(): Promise<string>;
}

// Default credential encryption implementation
export class DefaultCredentialEncryption implements ICredentialEncryption {
  private keys: Map<string, Buffer> = new Map();
  private currentKeyId: string;

  constructor(masterKey?: Buffer) {
    const key = masterKey || crypto.randomBytes(32);
    this.currentKeyId = 'default';
    this.keys.set(this.currentKeyId, key);
  }

  async encrypt(data: any, keyId?: string): Promise<{ encrypted: string; metadata: any }> {
    const activeKeyId = keyId || this.currentKeyId;
    const key = this.keys.get(activeKeyId);
    
    if (!key) {
      throw new Error(`Encryption key not found: ${activeKeyId}`);
    }

    // Generate IV and salt
    const iv = crypto.randomBytes(16);
    const salt = crypto.randomBytes(16);

    // Derive encryption key
    const derivedKey = crypto.pbkdf2Sync(key, salt, 100000, 32, 'sha256');

    // Encrypt data
    const cipher = crypto.createCipheriv('aes-256-cbc', derivedKey, iv);
    const plaintext = JSON.stringify(data);
    
    let encrypted = cipher.update(plaintext, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    
    // No auth tag needed for CBC mode
    const authTag = Buffer.alloc(0);

    return {
      encrypted: encrypted + ':' + authTag.toString('base64'),
      metadata: {
        algorithm: 'aes-256-gcm',
        keyId: activeKeyId,
        iv: iv.toString('base64'),
        salt: salt.toString('base64')
      }
    };
  }

  async decrypt(encrypted: string, metadata: any): Promise<any> {
    const key = this.keys.get(metadata.keyId);
    
    if (!key) {
      throw new Error(`Decryption key not found: ${metadata.keyId}`);
    }

    // Parse encrypted data and auth tag
    const [encryptedData, authTagB64] = encrypted.split(':');
    const authTag = Buffer.from(authTagB64, 'base64');
    const iv = Buffer.from(metadata.iv, 'base64');
    const salt = Buffer.from(metadata.salt, 'base64');

    // Derive decryption key
    const derivedKey = crypto.pbkdf2Sync(key, salt, 100000, 32, 'sha256');

    // Decrypt data
    const decipher = crypto.createDecipheriv('aes-256-cbc', derivedKey, iv);
    
    let decrypted = decipher.update(encryptedData, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    return JSON.parse(decrypted);
  }

  async rotateKey(): Promise<string> {
    const newKeyId = `key_${Date.now()}`;
    const newKey = crypto.randomBytes(32);
    this.keys.set(newKeyId, newKey);
    this.currentKeyId = newKeyId;
    return newKeyId;
  }

  addKey(keyId: string, key: Buffer): void {
    this.keys.set(keyId, key);
  }
}

// Default credential manager implementation
export class DefaultCredentialManager implements ICredentialManager {
  private credentials: Map<string, StoredCredential> = new Map();
  private nameToIdMap: Map<string, string> = new Map();
  private encryption: ICredentialEncryption;

  constructor(encryption?: ICredentialEncryption) {
    this.encryption = encryption || new DefaultCredentialEncryption();
  }

  async storeCredential(
    name: string,
    type: CredentialType,
    value: any,
    options: {
      description?: string;
      expiresAt?: Date;
      rotationInterval?: number;
      tags?: string[];
      encrypt?: boolean;
    } = {}
  ): Promise<string> {
    // Validate credential format
    if (!this.validateCredential(type, value)) {
      throw new Error(`Invalid credential format for type: ${type}`);
    }

    const id = this.generateCredentialId();
    const now = new Date();
    const shouldEncrypt = options.encrypt !== false; // Default to true

    let storedValue: string;
    let encryptionMetadata: StoredCredential['encryptionMetadata'];

    if (shouldEncrypt) {
      const { encrypted, metadata } = await this.encryption.encrypt(value);
      storedValue = encrypted;
      encryptionMetadata = metadata;
    } else {
      storedValue = typeof value === 'string' ? value : JSON.stringify(value);
    }

    const credential: StoredCredential = {
      id,
      type,
      name,
      description: options.description,
      encrypted: shouldEncrypt,
      value: storedValue,
      metadata: {
        createdAt: now,
        updatedAt: now,
        expiresAt: options.expiresAt,
        rotationInterval: options.rotationInterval,
        version: 1,
        tags: options.tags
      },
      encryptionMetadata
    };

    this.credentials.set(id, credential);
    this.nameToIdMap.set(name, id);

    return id;
  }

  async getCredential(nameOrId: string): Promise<any> {
    const credential = this.findCredential(nameOrId);
    
    if (!credential) {
      throw new Error(`Credential not found: ${nameOrId}`);
    }

    // Check if credential is expired
    if (credential.metadata.expiresAt && credential.metadata.expiresAt < new Date()) {
      throw new Error(`Credential expired: ${nameOrId}`);
    }

    if (credential.encrypted && credential.encryptionMetadata) {
      return await this.encryption.decrypt(credential.value, credential.encryptionMetadata);
    } else {
      try {
        return JSON.parse(credential.value);
      } catch {
        return credential.value;
      }
    }
  }

  async updateCredential(
    nameOrId: string,
    value: any,
    options: {
      description?: string;
      expiresAt?: Date;
      rotationInterval?: number;
      tags?: string[];
    } = {}
  ): Promise<void> {
    const credential = this.findCredential(nameOrId);
    
    if (!credential) {
      throw new Error(`Credential not found: ${nameOrId}`);
    }

    // Validate new credential format
    if (!this.validateCredential(credential.type, value)) {
      throw new Error(`Invalid credential format for type: ${credential.type}`);
    }

    let storedValue: string;
    let encryptionMetadata: StoredCredential['encryptionMetadata'];

    if (credential.encrypted) {
      const { encrypted, metadata } = await this.encryption.encrypt(value);
      storedValue = encrypted;
      encryptionMetadata = metadata;
    } else {
      storedValue = typeof value === 'string' ? value : JSON.stringify(value);
    }

    // Update credential
    credential.value = storedValue;
    credential.encryptionMetadata = encryptionMetadata;
    credential.metadata.updatedAt = new Date();
    credential.metadata.version += 1;

    if (options.description !== undefined) {
      credential.description = options.description;
    }
    if (options.expiresAt !== undefined) {
      credential.metadata.expiresAt = options.expiresAt;
    }
    if (options.rotationInterval !== undefined) {
      credential.metadata.rotationInterval = options.rotationInterval;
    }
    if (options.tags !== undefined) {
      credential.metadata.tags = options.tags;
    }
  }

  async deleteCredential(nameOrId: string): Promise<void> {
    const credential = this.findCredential(nameOrId);
    
    if (!credential) {
      throw new Error(`Credential not found: ${nameOrId}`);
    }

    this.credentials.delete(credential.id);
    this.nameToIdMap.delete(credential.name);
  }

  async listCredentials(type?: CredentialType): Promise<Array<Omit<StoredCredential, 'value'>>> {
    const credentials = Array.from(this.credentials.values());
    
    const filtered = type 
      ? credentials.filter(cred => cred.type === type)
      : credentials;

    return filtered.map(({ value, encryptionMetadata, ...metadata }) => metadata);
  }

  async rotateCredential(nameOrId: string, newValue: any): Promise<void> {
    const credential = this.findCredential(nameOrId);
    
    if (!credential) {
      throw new Error(`Credential not found: ${nameOrId}`);
    }

    await this.updateCredential(nameOrId, newValue);
    credential.metadata.lastRotated = new Date();
  }

  async hasCredential(nameOrId: string): Promise<boolean> {
    return this.findCredential(nameOrId) !== null;
  }

  async getDatabaseCredentials(nameOrId: string): Promise<DatabaseCredentials> {
    const credential = await this.getCredential(nameOrId);
    
    if (typeof credential !== 'object' || !credential.type) {
      throw new Error(`Invalid database credential format: ${nameOrId}`);
    }

    return credential as DatabaseCredentials;
  }

  validateCredential(type: CredentialType, value: any): boolean {
    switch (type) {
      case 'database':
        return this.validateDatabaseCredential(value);
      case 'api_key':
        return typeof value === 'string' && value.length > 0;
      case 'certificate':
        return typeof value === 'object' && (value.cert || value.key);
      case 'token':
        return typeof value === 'string' && value.length > 0;
      case 'secret':
        return typeof value === 'string' && value.length > 0;
      default:
        return false;
    }
  }

  private validateDatabaseCredential(value: any): boolean {
    if (typeof value !== 'object' || !value.type) {
      return false;
    }

    const dbCred = value as DatabaseCredentials;

    switch (dbCred.type) {
      case 'mongodb':
        return !!(dbCred.connectionString || (dbCred.host && dbCred.database));
      case 'dynamodb':
        return !!(dbCred.region && (dbCred.accessKeyId || process.env.AWS_PROFILE));
      case 'mysql':
      case 'postgresql':
        return !!(dbCred.host && dbCred.database && dbCred.username);
      default:
        return false;
    }
  }

  private findCredential(nameOrId: string): StoredCredential | null {
    // Try to find by ID first
    let credential = this.credentials.get(nameOrId);
    
    if (!credential) {
      // Try to find by name
      const id = this.nameToIdMap.get(nameOrId);
      if (id) {
        credential = this.credentials.get(id);
      }
    }

    return credential || null;
  }

  private generateCredentialId(): string {
    return `cred_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Administrative methods
  async exportCredentials(includeValues = false): Promise<StoredCredential[]> {
    const credentials = Array.from(this.credentials.values());
    
    if (!includeValues) {
      return credentials.map(cred => ({
        ...cred,
        value: '[REDACTED]'
      }));
    }

    return credentials;
  }

  async importCredentials(credentials: StoredCredential[]): Promise<void> {
    for (const credential of credentials) {
      this.credentials.set(credential.id, credential);
      this.nameToIdMap.set(credential.name, credential.id);
    }
  }

  async checkExpiredCredentials(): Promise<StoredCredential[]> {
    const now = new Date();
    return Array.from(this.credentials.values())
      .filter(cred => cred.metadata.expiresAt && cred.metadata.expiresAt < now);
  }

  async getCredentialsNeedingRotation(): Promise<StoredCredential[]> {
    const now = new Date();
    return Array.from(this.credentials.values())
      .filter(cred => {
        if (!cred.metadata.rotationInterval) return false;
        
        const lastRotated = cred.metadata.lastRotated || cred.metadata.createdAt;
        const nextRotation = new Date(lastRotated);
        nextRotation.setDate(nextRotation.getDate() + cred.metadata.rotationInterval);
        
        return nextRotation <= now;
      });
  }

  clearAllCredentials(): void {
    this.credentials.clear();
    this.nameToIdMap.clear();
  }
}

// Helper functions
export function createCredentialManager(
  encryption?: ICredentialEncryption
): DefaultCredentialManager {
  return new DefaultCredentialManager(encryption);
}

export function createDatabaseCredentials(
  type: DatabaseCredentials['type'],
  config: Partial<DatabaseCredentials>
): DatabaseCredentials {
  return {
    type,
    ...config
  };
}

// Predefined credential templates
export const CREDENTIAL_TEMPLATES = {
  MONGODB: {
    type: 'database' as CredentialType,
    template: {
      type: 'mongodb',
      connectionString: 'mongodb://username:password@host:port/database',
      ssl: true
    }
  },
  DYNAMODB: {
    type: 'database' as CredentialType,
    template: {
      type: 'dynamodb',
      region: 'us-east-1',
      accessKeyId: 'your-access-key',
      secretAccessKey: 'your-secret-key'
    }
  },
  API_KEY: {
    type: 'api_key' as CredentialType,
    template: 'your-api-key-here'
  }
};

// Environment variable credential loader
export class EnvironmentCredentialLoader {
  static loadDatabaseCredentials(prefix = 'DB'): DatabaseCredentials | null {
    const type = process.env[`${prefix}_TYPE`] as DatabaseCredentials['type'];
    
    if (!type) return null;

    const credentials: DatabaseCredentials = { type };

    // Common fields
    if (process.env[`${prefix}_HOST`]) credentials.host = process.env[`${prefix}_HOST`];
    if (process.env[`${prefix}_PORT`]) credentials.port = parseInt(process.env[`${prefix}_PORT`]);
    if (process.env[`${prefix}_DATABASE`]) credentials.database = process.env[`${prefix}_DATABASE`];
    if (process.env[`${prefix}_USERNAME`]) credentials.username = process.env[`${prefix}_USERNAME`];
    if (process.env[`${prefix}_PASSWORD`]) credentials.password = process.env[`${prefix}_PASSWORD`];
    if (process.env[`${prefix}_CONNECTION_STRING`]) credentials.connectionString = process.env[`${prefix}_CONNECTION_STRING`];

    // AWS specific
    if (process.env[`${prefix}_REGION`]) credentials.region = process.env[`${prefix}_REGION`];
    if (process.env[`${prefix}_ACCESS_KEY_ID`]) credentials.accessKeyId = process.env[`${prefix}_ACCESS_KEY_ID`];
    if (process.env[`${prefix}_SECRET_ACCESS_KEY`]) credentials.secretAccessKey = process.env[`${prefix}_SECRET_ACCESS_KEY`];
    if (process.env[`${prefix}_SESSION_TOKEN`]) credentials.sessionToken = process.env[`${prefix}_SESSION_TOKEN`];

    // SSL
    if (process.env[`${prefix}_SSL`]) credentials.ssl = process.env[`${prefix}_SSL`] === 'true';

    return credentials;
  }
}