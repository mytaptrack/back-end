/**
 * Common types used across business logic packages
 */

/**
 * Standard operation result wrapper
 */
export interface OperationResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  correlationId?: string;
}

/**
 * Pagination parameters
 */
export interface PaginationParams {
  limit?: number;
  offset?: number;
  cursor?: string;
}

/**
 * Pagination result
 */
export interface PaginatedResult<T> {
  items: T[];
  totalCount?: number;
  nextCursor?: string;
  hasMore: boolean;
}

/**
 * Audit information
 */
export interface AuditInfo {
  createdBy: string;
  createdAt: string;
  updatedBy?: string;
  updatedAt?: string;
}

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationErrorDetail[];
}

/**
 * Individual validation error
 */
export interface ValidationErrorDetail {
  field: string;
  message: string;
  code: string;
}

/**
 * Filter criteria for queries
 */
export interface FilterCriteria {
  field: string;
  operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'startsWith' | 'in';
  value: any;
}

/**
 * Sort criteria for queries
 */
export interface SortCriteria {
  field: string;
  direction: 'asc' | 'desc';
}