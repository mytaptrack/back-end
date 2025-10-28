/**
 * Secret Management System
 * Provides secure secret management for database credentials, API keys, and encryption keys
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * Secret manager interface
 */
export interface ISecretManager {
  getSecret(key: string): Promise<string>;
  setSecret(key: string, value: string): Promise<void>;
  deleteSecret(key: string): Promise<void>;
  listSecrets(): Promise<string[]>;
}

/**
 * Secret manager factory
 */
export class SecretManagerFactory {
  static create(provider: string, options: any = {}): ISecretManager {
    switch (provider) {
      case 'aws-secrets-manager':
        return new AWSSecretsManager(options);
      case 'docker-secrets':
        return new DockerSecretsManager(options);
      case 'env':
        return new EnvironmentSecretsManager(options);
      case 'vault':
        return new VaultSecretsManager(options);
      default:
        throw new Error(`Unsupported secret manager provider: ${provider}`);
    }
  }
}

/**
 * Main secret manager that delegates to appropriate provider
 */
export class SecretManager implements ISecretManager {
  private provider: ISecretManager;
  
  constructor(providerType?: string, options: any = {}) {
    const provider = providerType || this.detectProvider();
    this.provider = SecretManagerFactory.create(provider, options);
  }
  
  async getSecret(key: string): Promise<string> {
    return this.provider.getSecret(key);
  }
  
  async setSecret(key: string, value: string): Promise<void> {
    return this.provider.setSecret(key, value);
  }
  
  async deleteSecret(key: string): Promise<void> {
    return this.provider.deleteSecret(key);
  }
  
  async listSecrets(): Promise<string[]> {
    return this.provider.listSecrets();
  }
  
  private detectProvider(): string {
    // Check for AWS Lambda environment
    if (process.env.AWS_LAMBDA_FUNCTION_NAME) {
      return 'aws-secrets-manager';
    }
    
    // Check for Docker secrets directory
    if (fs.existsSync('/run/secrets')) {
      return 'docker-secrets';
    }
    
    // Check for Vault environment
    if (process.env.VAULT_ADDR) {
      return 'vault';
    }
    
    // Default to environment variables
    return 'env';
  }
}/**
 *
 AWS Secrets Manager implementation
 */
export class AWSSecretsManager implements ISecretManager {
  private region: string;
  
  constructor(options: { region?: string } = {}) {
    this.region = options.region || process.env.AWS_REGION || 'us-west-2';
  }
  
  async getSecret(key: string): Promise<string> {
    try {
      // Import AWS SDK dynamically to avoid dependency issues in Docker environment
      let SecretsManagerClient: any, GetSecretValueCommand: any;
      try {
        const awsModule = await import('@aws-sdk/client-secrets-manager');
        SecretsManagerClient = awsModule.SecretsManagerClient;
        GetSecretValueCommand = awsModule.GetSecretValueCommand;
      } catch (importError) {
        throw new Error('AWS SDK not available. Install @aws-sdk/client-secrets-manager to use AWS Secrets Manager.');
      }
      
      const client = new SecretsManagerClient({ region: this.region });
      const command = new GetSecretValueCommand({ SecretId: key });
      
      const response = await client.send(command);
      
      if (response.SecretString) {
        return response.SecretString;
      } else if (response.SecretBinary) {
        return Buffer.from(response.SecretBinary as any).toString('utf8');
      } else {
        throw new Error(`Secret ${key} has no value`);
      }
    } catch (error) {
      throw new Error(`Failed to retrieve secret ${key}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  async setSecret(key: string, value: string): Promise<void> {
    try {
      let SecretsManagerClient: any, CreateSecretCommand: any, UpdateSecretCommand: any;
      try {
        const awsModule = await import('@aws-sdk/client-secrets-manager');
        SecretsManagerClient = awsModule.SecretsManagerClient;
        CreateSecretCommand = awsModule.CreateSecretCommand;
        UpdateSecretCommand = awsModule.UpdateSecretCommand;
      } catch (importError) {
        throw new Error('AWS SDK not available. Install @aws-sdk/client-secrets-manager to use AWS Secrets Manager.');
      }
      
      const client = new SecretsManagerClient({ region: this.region });
      
      try {
        // Try to update existing secret
        const updateCommand = new UpdateSecretCommand({
          SecretId: key,
          SecretString: value
        });
        await client.send(updateCommand);
      } catch (updateError) {
        // If update fails, try to create new secret
        const createCommand = new CreateSecretCommand({
          Name: key,
          SecretString: value
        });
        await client.send(createCommand);
      }
    } catch (error) {
      throw new Error(`Failed to set secret ${key}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  async deleteSecret(key: string): Promise<void> {
    try {
      let SecretsManagerClient: any, DeleteSecretCommand: any;
      try {
        const awsModule = await import('@aws-sdk/client-secrets-manager');
        SecretsManagerClient = awsModule.SecretsManagerClient;
        DeleteSecretCommand = awsModule.DeleteSecretCommand;
      } catch (importError) {
        throw new Error('AWS SDK not available. Install @aws-sdk/client-secrets-manager to use AWS Secrets Manager.');
      }
      
      const client = new SecretsManagerClient({ region: this.region });
      const command = new DeleteSecretCommand({
        SecretId: key,
        ForceDeleteWithoutRecovery: true
      });
      
      await client.send(command);
    } catch (error) {
      throw new Error(`Failed to delete secret ${key}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  async listSecrets(): Promise<string[]> {
    try {
      let SecretsManagerClient: any, ListSecretsCommand: any;
      try {
        const awsModule = await import('@aws-sdk/client-secrets-manager');
        SecretsManagerClient = awsModule.SecretsManagerClient;
        ListSecretsCommand = awsModule.ListSecretsCommand;
      } catch (importError) {
        throw new Error('AWS SDK not available. Install @aws-sdk/client-secrets-manager to use AWS Secrets Manager.');
      }
      
      const client = new SecretsManagerClient({ region: this.region });
      const command = new ListSecretsCommand({});
      
      const response = await client.send(command);
      
      return response.SecretList?.map((secret: any) => secret.Name || '') || [];
    } catch (error) {
      throw new Error(`Failed to list secrets: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

/**
 * Docker Secrets implementation
 */
export class DockerSecretsManager implements ISecretManager {
  private secretsPath: string;
  
  constructor(options: { secretsPath?: string } = {}) {
    this.secretsPath = options.secretsPath || '/run/secrets';
  }
  
  async getSecret(key: string): Promise<string> {
    const secretPath = path.join(this.secretsPath, key);
    
    if (!fs.existsSync(secretPath)) {
      throw new Error(`Secret ${key} not found at ${secretPath}`);
    }
    
    try {
      return fs.readFileSync(secretPath, 'utf8').trim();
    } catch (error) {
      throw new Error(`Failed to read secret ${key}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  async setSecret(key: string, value: string): Promise<void> {
    // Docker secrets are typically read-only, so this operation is not supported
    throw new Error('Setting secrets is not supported in Docker secrets manager');
  }
  
  async deleteSecret(key: string): Promise<void> {
    // Docker secrets are typically read-only, so this operation is not supported
    throw new Error('Deleting secrets is not supported in Docker secrets manager');
  }
  
  async listSecrets(): Promise<string[]> {
    if (!fs.existsSync(this.secretsPath)) {
      return [];
    }
    
    try {
      return fs.readdirSync(this.secretsPath);
    } catch (error) {
      throw new Error(`Failed to list secrets: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

/**
 * Environment Variables Secrets Manager
 */
export class EnvironmentSecretsManager implements ISecretManager {
  private prefix: string;
  
  constructor(options: { prefix?: string } = {}) {
    this.prefix = options.prefix || 'SECRET_';
  }
  
  async getSecret(key: string): Promise<string> {
    const envKey = `${this.prefix}${key.toUpperCase()}`;
    const value = process.env[envKey];
    
    if (value === undefined) {
      throw new Error(`Secret ${key} not found in environment variable ${envKey}`);
    }
    
    return value;
  }
  
  async setSecret(key: string, value: string): Promise<void> {
    const envKey = `${this.prefix}${key.toUpperCase()}`;
    process.env[envKey] = value;
  }
  
  async deleteSecret(key: string): Promise<void> {
    const envKey = `${this.prefix}${key.toUpperCase()}`;
    delete process.env[envKey];
  }
  
  async listSecrets(): Promise<string[]> {
    const secrets: string[] = [];
    
    for (const envKey in process.env) {
      if (envKey.startsWith(this.prefix)) {
        const secretKey = envKey.substring(this.prefix.length).toLowerCase();
        secrets.push(secretKey);
      }
    }
    
    return secrets;
  }
}

/**
 * HashiCorp Vault Secrets Manager
 */
export class VaultSecretsManager implements ISecretManager {
  private endpoint: string;
  private token: string;
  private mountPath: string;
  
  constructor(options: { endpoint?: string; token?: string; mountPath?: string } = {}) {
    this.endpoint = options.endpoint || process.env.VAULT_ADDR || 'http://localhost:8200';
    this.token = options.token || process.env.VAULT_TOKEN || '';
    this.mountPath = options.mountPath || 'secret';
    
    if (!this.token) {
      throw new Error('Vault token is required');
    }
  }
  
  async getSecret(key: string): Promise<string> {
    try {
      const response = await fetch(`${this.endpoint}/v1/${this.mountPath}/data/${key}`, {
        method: 'GET',
        headers: {
          'X-Vault-Token': this.token,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`Vault API returned ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (!data.data || !data.data.data) {
        throw new Error(`Secret ${key} not found in Vault`);
      }
      
      // Return the first value if multiple values exist, or the 'value' field
      const secretData = data.data.data;
      return secretData.value || Object.values(secretData)[0] as string;
    } catch (error) {
      throw new Error(`Failed to retrieve secret ${key} from Vault: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  async setSecret(key: string, value: string): Promise<void> {
    try {
      const response = await fetch(`${this.endpoint}/v1/${this.mountPath}/data/${key}`, {
        method: 'POST',
        headers: {
          'X-Vault-Token': this.token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          data: { value }
        })
      });
      
      if (!response.ok) {
        throw new Error(`Vault API returned ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      throw new Error(`Failed to set secret ${key} in Vault: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  async deleteSecret(key: string): Promise<void> {
    try {
      const response = await fetch(`${this.endpoint}/v1/${this.mountPath}/data/${key}`, {
        method: 'DELETE',
        headers: {
          'X-Vault-Token': this.token,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`Vault API returned ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      throw new Error(`Failed to delete secret ${key} from Vault: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  async listSecrets(): Promise<string[]> {
    try {
      const response = await fetch(`${this.endpoint}/v1/${this.mountPath}/metadata?list=true`, {
        method: 'GET',
        headers: {
          'X-Vault-Token': this.token,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`Vault API returned ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      return data.data?.keys || [];
    } catch (error) {
      throw new Error(`Failed to list secrets from Vault: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}