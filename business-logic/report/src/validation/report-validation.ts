import moment from 'moment-timezone';

// Define validation types locally since they're not exported from core
interface ValidationError {
  field: string;
  message: string;
  code: string;
}

interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

/**
 * Report validation functions
 */
export class ReportValidation {
  
  /**
   * Validate date range
   */
  static validateDateRange(startDate: string, endDate: string): ValidationResult {
    const errors: ValidationError[] = [];
    
    if (!startDate) {
      errors.push({
        field: 'startDate',
        message: 'Start date is required',
        code: 'REQUIRED'
      });
    }
    
    if (!endDate) {
      errors.push({
        field: 'endDate',
        message: 'End date is required',
        code: 'REQUIRED'
      });
    }
    
    if (startDate && endDate) {
      const start = moment(startDate);
      const end = moment(endDate);
      
      if (!start.isValid()) {
        errors.push({
          field: 'startDate',
          message: 'Invalid start date format',
          code: 'INVALID_FORMAT'
        });
      }
      
      if (!end.isValid()) {
        errors.push({
          field: 'endDate',
          message: 'Invalid end date format',
          code: 'INVALID_FORMAT'
        });
      }
      
      if (start.isValid() && end.isValid()) {
        if (start.isAfter(end)) {
          errors.push({
            field: 'dateRange',
            message: 'Start date must be before end date',
            code: 'INVALID_RANGE'
          });
        }
        
        const daysDiff = end.diff(start, 'days');
        if (daysDiff > 365) {
          errors.push({
            field: 'dateRange',
            message: 'Date range cannot exceed 365 days',
            code: 'RANGE_TOO_LARGE'
          });
        }
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate student ID for reports
   */
  static validateStudentId(studentId: string): ValidationResult {
    const errors: ValidationError[] = [];
    
    if (!studentId) {
      errors.push({
        field: 'studentId',
        message: 'Student ID is required',
        code: 'REQUIRED'
      });
    } else if (studentId.length < 3) {
      errors.push({
        field: 'studentId',
        message: 'Student ID is too short',
        code: 'TOO_SHORT'
      });
    } else if (studentId.length > 128) {
      errors.push({
        field: 'studentId',
        message: 'Student ID is too long',
        code: 'TOO_LONG'
      });
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate behavior IDs list
   */
  static validateBehaviorIds(behaviorIds?: string[]): ValidationResult {
    const errors: ValidationError[] = [];
    
    if (behaviorIds) {
      if (behaviorIds.length > 50) {
        errors.push({
          field: 'behaviorIds',
          message: 'Too many behavior IDs',
          code: 'TOO_MANY'
        });
      }
      
      behaviorIds.forEach((behaviorId, index) => {
        if (!behaviorId || behaviorId.trim().length === 0) {
          errors.push({
            field: `behaviorIds[${index}]`,
            message: 'Behavior ID cannot be empty',
            code: 'EMPTY'
          });
        } else if (behaviorId.length > 100) {
          errors.push({
            field: `behaviorIds[${index}]`,
            message: 'Behavior ID is too long',
            code: 'TOO_LONG'
          });
        }
      });
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate service IDs list
   */
  static validateServiceIds(serviceIds?: string[]): ValidationResult {
    const errors: ValidationError[] = [];
    
    if (serviceIds) {
      if (serviceIds.length > 50) {
        errors.push({
          field: 'serviceIds',
          message: 'Too many service IDs',
          code: 'TOO_MANY'
        });
      }
      
      serviceIds.forEach((serviceId, index) => {
        if (!serviceId || serviceId.trim().length === 0) {
          errors.push({
            field: `serviceIds[${index}]`,
            message: 'Service ID cannot be empty',
            code: 'EMPTY'
          });
        } else if (serviceId.length > 100) {
          errors.push({
            field: `serviceIds[${index}]`,
            message: 'Service ID is too long',
            code: 'TOO_LONG'
          });
        }
      });
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate user ID for report generation
   */
  static validateUserId(userId: string): ValidationResult {
    const errors: ValidationError[] = [];
    
    if (!userId) {
      errors.push({
        field: 'userId',
        message: 'User ID is required',
        code: 'REQUIRED'
      });
    } else if (userId.length < 3) {
      errors.push({
        field: 'userId',
        message: 'User ID is too short',
        code: 'TOO_SHORT'
      });
    } else if (userId.length > 128) {
      errors.push({
        field: 'userId',
        message: 'User ID is too long',
        code: 'TOO_LONG'
      });
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate behavior report request
   */
  static validateBehaviorReportRequest(request: {
    studentId: string;
    startDate: string;
    endDate: string;
    behaviorIds?: string[];
    userId: string;
  }): ValidationResult {
    const allErrors: ValidationError[] = [];
    
    // Validate individual fields
    const studentIdValidation = ReportValidation.validateStudentId(request.studentId);
    const dateRangeValidation = ReportValidation.validateDateRange(request.startDate, request.endDate);
    const behaviorIdsValidation = ReportValidation.validateBehaviorIds(request.behaviorIds);
    const userIdValidation = ReportValidation.validateUserId(request.userId);
    
    allErrors.push(...studentIdValidation.errors);
    allErrors.push(...dateRangeValidation.errors);
    allErrors.push(...behaviorIdsValidation.errors);
    allErrors.push(...userIdValidation.errors);
    
    return {
      valid: allErrors.length === 0,
      errors: allErrors
    };
  }

  /**
   * Validate service report request
   */
  static validateServiceReportRequest(request: {
    studentId: string;
    startDate: string;
    endDate: string;
    serviceIds?: string[];
    userId: string;
  }): ValidationResult {
    const allErrors: ValidationError[] = [];
    
    // Validate individual fields
    const studentIdValidation = ReportValidation.validateStudentId(request.studentId);
    const dateRangeValidation = ReportValidation.validateDateRange(request.startDate, request.endDate);
    const serviceIdsValidation = ReportValidation.validateServiceIds(request.serviceIds);
    const userIdValidation = ReportValidation.validateUserId(request.userId);
    
    allErrors.push(...studentIdValidation.errors);
    allErrors.push(...dateRangeValidation.errors);
    allErrors.push(...serviceIdsValidation.errors);
    allErrors.push(...userIdValidation.errors);
    
    return {
      valid: allErrors.length === 0,
      errors: allErrors
    };
  }

  /**
   * Validate report format options
   */
  static validateReportFormat(format?: string): ValidationResult {
    const errors: ValidationError[] = [];
    const validFormats = ['pdf', 'csv', 'json', 'xlsx'];
    
    if (format && !validFormats.includes(format.toLowerCase())) {
      errors.push({
        field: 'format',
        message: `Invalid report format. Must be one of: ${validFormats.join(', ')}`,
        code: 'INVALID_FORMAT'
      });
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
}