/**
 * Access Control Interface and Implementation
 * Provides operation and resource validation for database operations
 */

import { DatabaseKey, TransactionOperation } from '../types/database-abstraction';

// Security context for access control decisions
export interface SecurityContext {
  userId?: string;
  userRole?: string;
  permissions?: string[];
  sessionId?: string;
  ipAddress?: string;
  userAgent?: string;
  timestamp: Date;
  requestId?: string;
}

// Access control decision result
export interface AccessControlResult {
  allowed: boolean;
  reason?: string;
  requiredPermissions?: string[];
  additionalContext?: Record<string, any>;
}

// Resource definition for access control
export interface ResourceDefinition {
  type: 'table' | 'record' | 'field';
  identifier: string;
  metadata?: Record<string, any>;
}

// Operation definition for access control
export interface OperationDefinition {
  type: 'read' | 'write' | 'delete' | 'query' | 'scan' | 'transaction';
  action: string;
  resource: ResourceDefinition;
  data?: any;
}

// Access control interface
export interface IAccessControlProvider {
  /**
   * Validate access for a database operation
   */
  validateAccess(
    operation: OperationDefinition,
    context: SecurityContext
  ): Promise<AccessControlResult>;

  /**
   * Validate access for multiple operations (transactions)
   */
  validateBatchAccess(
    operations: OperationDefinition[],
    context: SecurityContext
  ): Promise<AccessControlResult>;

  /**
   * Check if user has specific permission
   */
  hasPermission(
    permission: string,
    context: SecurityContext
  ): Promise<boolean>;

  /**
   * Get user permissions
   */
  getUserPermissions(context: SecurityContext): Promise<string[]>;

  /**
   * Validate field-level access
   */
  validateFieldAccess(
    fields: string[],
    operation: 'read' | 'write',
    context: SecurityContext
  ): Promise<{ [field: string]: boolean }>;
}

// Default access control implementation
export class DefaultAccessControlProvider implements IAccessControlProvider {
  private permissions: Map<string, string[]> = new Map();
  private rolePermissions: Map<string, string[]> = new Map();
  private fieldRestrictions: Map<string, { roles: string[], operations: string[] }> = new Map();

  constructor() {
    this.initializeDefaultPermissions();
  }

  private initializeDefaultPermissions(): void {
    // Default role-based permissions
    this.rolePermissions.set('admin', [
      'read:*',
      'write:*',
      'delete:*',
      'query:*',
      'scan:*',
      'transaction:*'
    ]);

    this.rolePermissions.set('user', [
      'read:own',
      'write:own',
      'query:own'
    ]);

    this.rolePermissions.set('readonly', [
      'read:*',
      'query:*'
    ]);

    // Field-level restrictions for sensitive data
    this.fieldRestrictions.set('ssn', {
      roles: ['admin'],
      operations: ['read', 'write']
    });

    this.fieldRestrictions.set('creditCard', {
      roles: ['admin', 'billing'],
      operations: ['read', 'write']
    });

    this.fieldRestrictions.set('password', {
      roles: [],
      operations: []
    });
  }

  async validateAccess(
    operation: OperationDefinition,
    context: SecurityContext
  ): Promise<AccessControlResult> {
    try {
      // Check if user has required permissions
      const userPermissions = await this.getUserPermissions(context);
      const requiredPermission = this.getRequiredPermission(operation);

      // Check general permission
      const hasGeneralPermission = this.checkPermission(requiredPermission, userPermissions);
      if (!hasGeneralPermission) {
        return {
          allowed: false,
          reason: `Missing required permission: ${requiredPermission}`,
          requiredPermissions: [requiredPermission]
        };
      }

      // Check resource-specific access
      const resourceAccess = await this.validateResourceAccess(operation, context);
      if (!resourceAccess.allowed) {
        return resourceAccess;
      }

      // Check field-level access if data is involved
      if (operation.data && (operation.type === 'write' || operation.type === 'read')) {
        const fieldAccess = await this.validateFieldAccess(
          Object.keys(operation.data),
          operation.type === 'read' ? 'read' : 'write',
          context
        );

        const deniedFields = Object.entries(fieldAccess)
          .filter(([_, allowed]) => !allowed)
          .map(([field, _]) => field);

        if (deniedFields.length > 0) {
          return {
            allowed: false,
            reason: `Access denied to fields: ${deniedFields.join(', ')}`,
            additionalContext: { deniedFields }
          };
        }
      }

      return { allowed: true };
    } catch (error) {
      return {
        allowed: false,
        reason: `Access control validation failed: ${error.message}`
      };
    }
  }

  async validateBatchAccess(
    operations: OperationDefinition[],
    context: SecurityContext
  ): Promise<AccessControlResult> {
    for (const operation of operations) {
      const result = await this.validateAccess(operation, context);
      if (!result.allowed) {
        return result;
      }
    }
    return { allowed: true };
  }

  async hasPermission(
    permission: string,
    context: SecurityContext
  ): Promise<boolean> {
    const userPermissions = await this.getUserPermissions(context);
    return this.checkPermission(permission, userPermissions);
  }

  async getUserPermissions(context: SecurityContext): Promise<string[]> {
    const permissions: string[] = [];

    // Add role-based permissions
    if (context.userRole) {
      const rolePerms = this.rolePermissions.get(context.userRole) || [];
      permissions.push(...rolePerms);
    }

    // Add user-specific permissions
    if (context.userId) {
      const userPerms = this.permissions.get(context.userId) || [];
      permissions.push(...userPerms);
    }

    // Add context permissions
    if (context.permissions) {
      permissions.push(...context.permissions);
    }

    return [...new Set(permissions)]; // Remove duplicates
  }

  async validateFieldAccess(
    fields: string[],
    operation: 'read' | 'write',
    context: SecurityContext
  ): Promise<{ [field: string]: boolean }> {
    const result: { [field: string]: boolean } = {};

    for (const field of fields) {
      const restriction = this.fieldRestrictions.get(field);
      
      if (!restriction) {
        result[field] = true;
        continue;
      }

      // Check if user role is allowed
      const hasRoleAccess = !context.userRole || 
        restriction.roles.includes(context.userRole) ||
        context.userRole === 'admin';

      // Check if operation is allowed
      const hasOperationAccess = restriction.operations.includes(operation);

      result[field] = hasRoleAccess && hasOperationAccess;
    }

    return result;
  }

  private getRequiredPermission(operation: OperationDefinition): string {
    return `${operation.type}:${operation.resource.type}`;
  }

  private checkPermission(required: string, userPermissions: string[]): boolean {
    // Check exact match
    if (userPermissions.includes(required)) {
      return true;
    }

    // Check wildcard permissions
    const [action, resource] = required.split(':');
    const wildcardPermissions = [
      `${action}:*`,
      `*:${resource}`,
      '*:*'
    ];

    return wildcardPermissions.some(perm => userPermissions.includes(perm));
  }

  private async validateResourceAccess(
    operation: OperationDefinition,
    context: SecurityContext
  ): Promise<AccessControlResult> {
    // For 'own' permissions, validate that user can only access their own data
    const userPermissions = await this.getUserPermissions(context);
    const hasOwnPermission = userPermissions.some(perm => perm.endsWith(':own'));

    if (hasOwnPermission && !userPermissions.some(perm => perm.endsWith(':*'))) {
      // Check if the resource belongs to the user
      if (operation.resource.metadata?.userId !== context.userId) {
        return {
          allowed: false,
          reason: 'Access denied: can only access own resources'
        };
      }
    }

    return { allowed: true };
  }

  // Administrative methods for managing permissions
  setUserPermissions(userId: string, permissions: string[]): void {
    this.permissions.set(userId, permissions);
  }

  addUserPermission(userId: string, permission: string): void {
    const current = this.permissions.get(userId) || [];
    this.permissions.set(userId, [...current, permission]);
  }

  removeUserPermission(userId: string, permission: string): void {
    const current = this.permissions.get(userId) || [];
    this.permissions.set(userId, current.filter(p => p !== permission));
  }

  setRolePermissions(role: string, permissions: string[]): void {
    this.rolePermissions.set(role, permissions);
  }

  addFieldRestriction(
    field: string,
    roles: string[],
    operations: string[]
  ): void {
    this.fieldRestrictions.set(field, { roles, operations });
  }
}

// Helper functions for creating operation definitions
export function createOperationDefinition(
  type: OperationDefinition['type'],
  resource: ResourceDefinition,
  data?: any
): OperationDefinition {
  return {
    type,
    action: type,
    resource,
    data
  };
}

export function createResourceDefinition(
  type: ResourceDefinition['type'],
  identifier: string,
  metadata?: Record<string, any>
): ResourceDefinition {
  return {
    type,
    identifier,
    metadata
  };
}

// Helper for creating security context
export function createSecurityContext(
  userId?: string,
  userRole?: string,
  additionalContext?: Partial<SecurityContext>
): SecurityContext {
  return {
    userId,
    userRole,
    timestamp: new Date(),
    ...additionalContext
  };
}