/**
 * Validation result interface
 */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationErrorDetail[];
}

/**
 * Validation error detail interface
 */
export interface ValidationErrorDetail {
  field: string;
  message: string;
  code: string;
}

/**
 * User validation functions
 */
export class UserValidation {
  
  /**
   * Validate email format
   */
  static validateEmail(email: string): ValidationResult {
    const errors: ValidationErrorDetail[] = [];
    
    if (!email) {
      errors.push({
        field: 'email',
        message: 'Email is required',
        code: 'REQUIRED'
      });
    } else if (!email.includes('@') || !email.includes('.')) {
      errors.push({
        field: 'email',
        message: 'Invalid email format',
        code: 'INVALID_FORMAT'
      });
    } else if (email.length > 254) {
      errors.push({
        field: 'email',
        message: 'Email is too long',
        code: 'TOO_LONG'
      });
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate user name fields
   */
  static validateName(firstName?: string, lastName?: string, fullName?: string): ValidationResult {
    const errors: ValidationErrorDetail[] = [];
    
    if (!firstName && !lastName && !fullName) {
      errors.push({
        field: 'name',
        message: 'At least one name field is required',
        code: 'REQUIRED'
      });
    }
    
    if (firstName && firstName.length > 50) {
      errors.push({
        field: 'firstName',
        message: 'First name is too long',
        code: 'TOO_LONG'
      });
    }
    
    if (lastName && lastName.length > 50) {
      errors.push({
        field: 'lastName',
        message: 'Last name is too long',
        code: 'TOO_LONG'
      });
    }
    
    if (fullName && fullName.length > 100) {
      errors.push({
        field: 'name',
        message: 'Full name is too long',
        code: 'TOO_LONG'
      });
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate user ID format
   */
  static validateUserId(userId: string): ValidationResult {
    const errors: ValidationErrorDetail[] = [];
    
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
   * Validate complete user data
   */
  static validateUserData(userData: {
    userId?: string;
    email: string;
    firstName?: string;
    lastName?: string;
    name?: string;
    state?: string;
    zip?: string;
  }): ValidationResult {
    const allErrors: ValidationErrorDetail[] = [];
    
    // Validate individual fields
    const emailValidation = UserValidation.validateEmail(userData.email);
    const nameValidation = UserValidation.validateName(userData.firstName, userData.lastName, userData.name);
    
    if (userData.userId) {
      const userIdValidation = UserValidation.validateUserId(userData.userId);
      allErrors.push(...userIdValidation.errors);
    }
    
    allErrors.push(...emailValidation.errors);
    allErrors.push(...nameValidation.errors);
    
    return {
      valid: allErrors.length === 0,
      errors: allErrors
    };
  }
}