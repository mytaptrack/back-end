/**
 * TLS/SSL Enforcement Implementation
 * Ensures all database connections use secure TLS/SSL encryption
 */

import * as tls from 'tls';
import * as fs from 'fs';
import * as path from 'path';

// TLS configuration interface
export interface TLSConfig {
  enabled: boolean;
  minVersion: string;
  maxVersion?: string;
  ciphers?: string[];
  certificatePath?: string;
  keyPath?: string;
  caPath?: string;
  rejectUnauthorized: boolean;
  checkServerIdentity?: boolean;
  allowSelfSigned?: boolean;
  verifyMode: 'none' | 'optional' | 'required';
}

// TLS certificate information
export interface TLSCertificateInfo {
  subject: string;
  issuer: string;
  validFrom: Date;
  validTo: Date;
  fingerprint: string;
  serialNumber: string;
  version: number;
  signatureAlgorithm: string;
  keyUsage?: string[];
  extendedKeyUsage?: string[];
  subjectAltNames?: string[];
}

// TLS connection status
export interface TLSConnectionStatus {
  secure: boolean;
  protocol: string;
  cipher: {
    name: string;
    version: string;
  };
  certificate?: TLSCertificateInfo;
  peerCertificate?: TLSCertificateInfo;
  authorized: boolean;
  authorizationError?: string;
}

// TLS enforcement interface
export interface ITLSEnforcement {
  /**
   * Validate TLS configuration
   */
  validateTLSConfig(config: TLSConfig): Promise<{ valid: boolean; errors: string[] }>;

  /**
   * Create secure TLS options for database connections
   */
  createTLSOptions(config: TLSConfig): Promise<tls.ConnectionOptions>;

  /**
   * Verify TLS connection security
   */
  verifyConnection(socket: any): Promise<TLSConnectionStatus>;

  /**
   * Check certificate validity
   */
  validateCertificate(certificate: any): Promise<{ valid: boolean; errors: string[] }>;

  /**
   * Get recommended TLS configuration
   */
  getRecommendedConfig(databaseType: 'mongodb' | 'mysql' | 'postgresql'): TLSConfig;

  /**
   * Monitor TLS connection health
   */
  monitorTLSHealth(): Promise<{
    connectionsSecure: number;
    connectionsInsecure: number;
    certificateExpirations: Array<{ name: string; expiresAt: Date; daysUntilExpiry: number }>;
    weakCiphers: string[];
  }>;
}

// Default TLS enforcement implementation
export class DefaultTLSEnforcement implements ITLSEnforcement {
  private connections: Map<string, TLSConnectionStatus> = new Map();
  private certificates: Map<string, TLSCertificateInfo> = new Map();

  // Secure cipher suites (ordered by preference)
  private readonly SECURE_CIPHERS = [
    'ECDHE-RSA-AES256-GCM-SHA384',
    'ECDHE-RSA-AES128-GCM-SHA256',
    'ECDHE-RSA-AES256-SHA384',
    'ECDHE-RSA-AES128-SHA256',
    'AES256-GCM-SHA384',
    'AES128-GCM-SHA256',
    'AES256-SHA256',
    'AES128-SHA256'
  ];

  // Weak/deprecated ciphers to avoid
  private readonly WEAK_CIPHERS = [
    'RC4',
    'DES',
    'MD5',
    'SHA1',
    'NULL',
    'EXPORT',
    'LOW',
    'MEDIUM'
  ];

  async validateTLSConfig(config: TLSConfig): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    // Check if TLS is enabled
    if (!config.enabled) {
      errors.push('TLS is disabled - this is not recommended for production');
    }

    // Validate TLS version
    if (config.minVersion) {
      const minVersion = parseFloat(config.minVersion.replace('TLSv', ''));
      if (minVersion < 1.2) {
        errors.push(`Minimum TLS version ${config.minVersion} is not secure. Use TLSv1.2 or higher`);
      }
    }

    // Validate cipher suites
    if (config.ciphers) {
      const weakCiphers = config.ciphers.filter(cipher => 
        this.WEAK_CIPHERS.some(weak => cipher.toUpperCase().includes(weak))
      );
      if (weakCiphers.length > 0) {
        errors.push(`Weak ciphers detected: ${weakCiphers.join(', ')}`);
      }
    }

    // Validate certificate files
    if (config.certificatePath && !await this.fileExists(config.certificatePath)) {
      errors.push(`Certificate file not found: ${config.certificatePath}`);
    }

    if (config.keyPath && !await this.fileExists(config.keyPath)) {
      errors.push(`Private key file not found: ${config.keyPath}`);
    }

    if (config.caPath && !await this.fileExists(config.caPath)) {
      errors.push(`CA certificate file not found: ${config.caPath}`);
    }

    // Validate verification settings
    if (config.allowSelfSigned && config.verifyMode === 'required') {
      errors.push('Cannot require certificate verification while allowing self-signed certificates');
    }

    if (!config.rejectUnauthorized && config.verifyMode === 'required') {
      errors.push('Cannot require certificate verification while accepting unauthorized certificates');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  async createTLSOptions(config: TLSConfig): Promise<tls.ConnectionOptions> {
    // Validate configuration first
    const validation = await this.validateTLSConfig(config);
    if (!validation.valid) {
      throw new Error(`Invalid TLS configuration: ${validation.errors.join(', ')}`);
    }

    const options: tls.ConnectionOptions = {
      // Security settings
      rejectUnauthorized: config.rejectUnauthorized,
      checkServerIdentity: config.checkServerIdentity !== false ? tls.checkServerIdentity : undefined,
      
      // Protocol versions
      minVersion: config.minVersion as any,
      maxVersion: config.maxVersion as any,
      
      // Cipher configuration
      ciphers: config.ciphers?.join(':') || this.SECURE_CIPHERS.join(':'),
      
      // Honor cipher order (server preference)
      honorCipherOrder: true,
      
      // Disable session resumption for better security
      sessionIdContext: crypto.randomBytes(16).toString('hex')
    };

    // Load certificates if provided
    if (config.certificatePath) {
      options.cert = await fs.promises.readFile(config.certificatePath);
    }

    if (config.keyPath) {
      options.key = await fs.promises.readFile(config.keyPath);
    }

    if (config.caPath) {
      options.ca = await fs.promises.readFile(config.caPath);
    }

    // Handle self-signed certificates
    if (config.allowSelfSigned) {
      options.rejectUnauthorized = false;
    }

    return options;
  }

  async verifyConnection(socket: any): Promise<TLSConnectionStatus> {
    if (!socket || typeof socket.getPeerCertificate !== 'function') {
      return {
        secure: false,
        protocol: 'none',
        cipher: { name: 'none', version: 'none' },
        authorized: false,
        authorizationError: 'Not a TLS connection'
      };
    }

    const tlsSocket = socket as tls.TLSSocket;
    
    try {
      const status: TLSConnectionStatus = {
        secure: tlsSocket.encrypted || false,
        protocol: tlsSocket.getProtocol() || 'unknown',
        cipher: {
          name: tlsSocket.getCipher()?.name || 'unknown',
          version: tlsSocket.getCipher()?.version || 'unknown'
        },
        authorized: tlsSocket.authorized || false,
        authorizationError: tlsSocket.authorizationError?.message
      };

      // Get certificate information
      const peerCert = tlsSocket.getPeerCertificate(true);
      if (peerCert && Object.keys(peerCert).length > 0) {
        status.peerCertificate = this.parseCertificate(peerCert);
      }

      // Store connection status for monitoring
      const connectionId = `${socket.remoteAddress}:${socket.remotePort}`;
      this.connections.set(connectionId, status);

      return status;
    } catch (error) {
      return {
        secure: false,
        protocol: 'error',
        cipher: { name: 'error', version: 'error' },
        authorized: false,
        authorizationError: error.message
      };
    }
  }

  async validateCertificate(certificate: any): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    if (!certificate) {
      errors.push('No certificate provided');
      return { valid: false, errors };
    }

    const cert = this.parseCertificate(certificate);

    // Check expiration
    const now = new Date();
    if (cert.validTo < now) {
      errors.push(`Certificate expired on ${cert.validTo.toISOString()}`);
    }

    // Check if certificate is valid yet
    if (cert.validFrom > now) {
      errors.push(`Certificate not valid until ${cert.validFrom.toISOString()}`);
    }

    // Check expiration warning (30 days)
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    if (cert.validTo < thirtyDaysFromNow) {
      errors.push(`Certificate expires soon: ${cert.validTo.toISOString()}`);
    }

    // Check key usage
    if (cert.keyUsage && !cert.keyUsage.includes('Digital Signature')) {
      errors.push('Certificate does not allow digital signatures');
    }

    // Check signature algorithm
    if (cert.signatureAlgorithm.toLowerCase().includes('md5') || 
        cert.signatureAlgorithm.toLowerCase().includes('sha1')) {
      errors.push(`Weak signature algorithm: ${cert.signatureAlgorithm}`);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  getRecommendedConfig(databaseType: 'mongodb' | 'mysql' | 'postgresql'): TLSConfig {
    const baseConfig: TLSConfig = {
      enabled: true,
      minVersion: 'TLSv1.2',
      maxVersion: 'TLSv1.3',
      ciphers: this.SECURE_CIPHERS,
      rejectUnauthorized: true,
      checkServerIdentity: true,
      allowSelfSigned: false,
      verifyMode: 'required'
    };

    switch (databaseType) {
      case 'mongodb':
        return {
          ...baseConfig,
          // MongoDB specific TLS settings
          verifyMode: 'required'
        };

      case 'mysql':
        return {
          ...baseConfig,
          // MySQL specific TLS settings
          ciphers: [
            'ECDHE-RSA-AES256-GCM-SHA384',
            'ECDHE-RSA-AES128-GCM-SHA256',
            'AES256-GCM-SHA384',
            'AES128-GCM-SHA256'
          ]
        };

      case 'postgresql':
        return {
          ...baseConfig,
          // PostgreSQL specific TLS settings
          verifyMode: 'required'
        };

      default:
        return baseConfig;
    }
  }

  async monitorTLSHealth(): Promise<{
    connectionsSecure: number;
    connectionsInsecure: number;
    certificateExpirations: Array<{ name: string; expiresAt: Date; daysUntilExpiry: number }>;
    weakCiphers: string[];
  }> {
    const connections = Array.from(this.connections.values());
    const certificates = Array.from(this.certificates.values());
    const now = new Date();

    // Count secure vs insecure connections
    const secureConnections = connections.filter(conn => conn.secure && conn.authorized);
    const insecureConnections = connections.filter(conn => !conn.secure || !conn.authorized);

    // Check certificate expirations
    const certificateExpirations = certificates
      .map(cert => ({
        name: cert.subject,
        expiresAt: cert.validTo,
        daysUntilExpiry: Math.ceil((cert.validTo.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      }))
      .filter(cert => cert.daysUntilExpiry <= 90) // Warn for certificates expiring within 90 days
      .sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);

    // Identify weak ciphers in use
    const weakCiphers = connections
      .map(conn => conn.cipher.name)
      .filter(cipher => this.WEAK_CIPHERS.some(weak => cipher.toUpperCase().includes(weak)))
      .filter((cipher, index, array) => array.indexOf(cipher) === index); // Remove duplicates

    return {
      connectionsSecure: secureConnections.length,
      connectionsInsecure: insecureConnections.length,
      certificateExpirations,
      weakCiphers
    };
  }

  private parseCertificate(cert: any): TLSCertificateInfo {
    return {
      subject: cert.subject?.CN || cert.subject || 'Unknown',
      issuer: cert.issuer?.CN || cert.issuer || 'Unknown',
      validFrom: new Date(cert.valid_from),
      validTo: new Date(cert.valid_to),
      fingerprint: cert.fingerprint || '',
      serialNumber: cert.serialNumber || '',
      version: cert.version || 0,
      signatureAlgorithm: cert.sigalg || 'Unknown',
      keyUsage: cert.ext_key_usage ? cert.ext_key_usage.split(',').map(s => s.trim()) : undefined,
      extendedKeyUsage: cert.ext_key_usage ? cert.ext_key_usage.split(',').map(s => s.trim()) : undefined,
      subjectAltNames: cert.subjectaltname ? cert.subjectaltname.split(',').map(s => s.trim()) : undefined
    };
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.promises.access(filePath, fs.constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  // Administrative methods
  clearConnectionHistory(): void {
    this.connections.clear();
  }

  getConnectionHistory(): TLSConnectionStatus[] {
    return Array.from(this.connections.values());
  }

  addCertificate(name: string, certificate: TLSCertificateInfo): void {
    this.certificates.set(name, certificate);
  }

  removeCertificate(name: string): void {
    this.certificates.delete(name);
  }

  getCertificates(): Map<string, TLSCertificateInfo> {
    return new Map(this.certificates);
  }
}

// TLS enforcement wrapper for database connections
export class TLSEnforcedConnection {
  private tlsEnforcement: ITLSEnforcement;
  private config: TLSConfig;

  constructor(tlsEnforcement: ITLSEnforcement, config: TLSConfig) {
    this.tlsEnforcement = tlsEnforcement;
    this.config = config;
  }

  async createSecureConnection(connectionFactory: (options: any) => Promise<any>): Promise<any> {
    // Validate TLS configuration
    const validation = await this.tlsEnforcement.validateTLSConfig(this.config);
    if (!validation.valid) {
      throw new Error(`TLS validation failed: ${validation.errors.join(', ')}`);
    }

    // Create TLS options
    const tlsOptions = await this.tlsEnforcement.createTLSOptions(this.config);

    // Create connection with TLS options
    const connection = await connectionFactory(tlsOptions);

    // Verify the connection is secure
    if (connection.socket || connection._socket) {
      const socket = connection.socket || connection._socket;
      const status = await this.tlsEnforcement.verifyConnection(socket);
      
      if (!status.secure) {
        throw new Error('Connection is not secure despite TLS configuration');
      }

      if (this.config.verifyMode === 'required' && !status.authorized) {
        throw new Error(`TLS certificate verification failed: ${status.authorizationError}`);
      }
    }

    return connection;
  }
}

// Helper functions
export function createTLSEnforcement(): DefaultTLSEnforcement {
  return new DefaultTLSEnforcement();
}

export function createTLSEnforcedConnection(
  tlsEnforcement: ITLSEnforcement,
  config: TLSConfig
): TLSEnforcedConnection {
  return new TLSEnforcedConnection(tlsEnforcement, config);
}

// Predefined TLS configurations
export const TLS_PROFILES = {
  STRICT: {
    enabled: true,
    minVersion: 'TLSv1.3',
    rejectUnauthorized: true,
    checkServerIdentity: true,
    allowSelfSigned: false,
    verifyMode: 'required' as const
  },
  SECURE: {
    enabled: true,
    minVersion: 'TLSv1.2',
    maxVersion: 'TLSv1.3',
    rejectUnauthorized: true,
    checkServerIdentity: true,
    allowSelfSigned: false,
    verifyMode: 'required' as const
  },
  DEVELOPMENT: {
    enabled: true,
    minVersion: 'TLSv1.2',
    rejectUnauthorized: false,
    checkServerIdentity: false,
    allowSelfSigned: true,
    verifyMode: 'optional' as const
  }
};

// Import crypto for sessionIdContext
const crypto = require('crypto');