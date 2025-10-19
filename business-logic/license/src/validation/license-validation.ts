import { ValidationResult, ValidationError } from '@mytaptrack/business-logic-core';

/**
 * License validation functions
 */
export class LicenseValidation {
  
  /**
   * Validate license ID format
   */
  static validateLicenseId(licenseId: string): ValidationResult {
    const errors: ValidationError[] = [];
    
    if (!licenseId) {
      errors.push({
        field: 'license',
        message: 'License ID is required',
        code: 'REQUIRED'
      });
    } else if (licenseId.length < 3) {
      errors.push({
        field: 'license',
        message: 'License ID is too short',
        code: 'TOO_SHORT'
      });
    } else if (licenseId.length > 100) {
      errors.push({
        field: 'license',
        message: 'License ID is too long',
        code: 'TOO_LONG'
      });
    } else if (!/^[a-zA-Z0-9\-_]+$/.test(licenseId)) {
      errors.push({
        field: 'license',
        message: 'License ID contains invalid characters',
        code: 'INVALID_FORMAT'
      });
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate customer name
   */
  static validateCustomerName(customerName: string): ValidationResult {
    const errors: ValidationError[] = [];
    
    if (!customerName) {
      errors.push({
        field: 'customer',
        message: 'Customer name is required',
        code: 'REQUIRED'
      });
    } else if (customerName.length < 2) {
      errors.push({
        field: 'customer',
        message: 'Customer name is too short',
        code: 'TOO_SHORT'
      });
    } else if (customerName.length > 200) {
      errors.push({
        field: 'customer',
        message: 'Customer name is too long',
        code: 'TOO_LONG'
      });
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate expiration date
   */
  static validateExpirationDate(expiration: string): ValidationResult {
    const errors: ValidationError[] = [];
    
    if (!expiration) {
      errors.push({
        field: 'expiration',
        message: 'Expiration date is required',
        code: 'REQUIRED'
      });
    } else {
      const expirationDate = new Date(expiration);
      if (isNaN(expirationDate.getTime())) {
        errors.push({
          field: 'expiration',
          message: 'Invalid expiration date format',
          code: 'INVALID_FORMAT'
        });
      } else if (expirationDate <= new Date()) {
        errors.push({
          field: 'expiration',
          message: 'Expiration date must be in the future',
          code: 'INVALID_VALUE'
        });
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate license counts
   */
  static validateLicenseCounts(singleCount?: number, multiCount?: number, singleUsed?: number): ValidationResult {
    const errors: ValidationError[] = [];
    
    if (singleCount !== undefined && singleCount < 0) {
      errors.push({
        field: 'singleCount',
        message: 'Single count cannot be negative',
        code: 'INVALID_VALUE'
      });
    }
    
    if (multiCount !== undefined && multiCount < 0) {
      errors.push({
        field: 'multiCount',
        message: 'Multi count cannot be negative',
        code: 'INVALID_VALUE'
      });
    }
    
    if (singleUsed !== undefined && singleUsed < 0) {
      errors.push({
        field: 'singleUsed',
        message: 'Single used count cannot be negative',
        code: 'INVALID_VALUE'
      });
    }
    
    if (singleCount !== undefined && singleUsed !== undefined && singleUsed > singleCount) {
      errors.push({
        field: 'singleUsed',
        message: 'Single used count cannot exceed single count',
        code: 'INVALID_VALUE'
      });
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate admin emails
   */
  static validateAdminEmails(admins?: string[]): ValidationResult {
    const errors: ValidationError[] = [];
    
    if (admins) {
      if (admins.length > 50) {
        errors.push({
          field: 'admins',
          message: 'Too many admin emails',
          code: 'TOO_MANY'
        });
      }
      
      admins.forEach((email, index) => {
        if (!email || !email.includes('@') || !email.includes('.')) {
          errors.push({
            field: `admins[${index}]`,
            message: 'Invalid email format',
            code: 'INVALID_FORMAT'
          });
        } else if (email.length > 254) {
          errors.push({
            field: `admins[${index}]`,
            message: 'Email is too long',
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
   * Validate email domain
   */
  static validateEmailDomain(emailDomain?: string): ValidationResult {
    const errors: ValidationError[] = [];
    
    if (emailDomain) {
      if (emailDomain.length > 100) {
        errors.push({
          field: 'emailDomain',
          message: 'Email domain is too long',
          code: 'TOO_LONG'
        });
      } else if (!/^[a-zA-Z0-9\-\.]+$/.test(emailDomain)) {
        errors.push({
          field: 'emailDomain',
          message: 'Invalid email domain format',
          code: 'INVALID_FORMAT'
        });
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate display tags
   */
  static validateDisplayTags(displayTags?: any[]): ValidationResult {
    const errors: ValidationError[] = [];
    
    if (displayTags) {
      if (displayTags.length > 100) {
        errors.push({
          field: 'displayTags',
          message: 'Too many display tags',
          code: 'TOO_MANY'
        });
      }
      
      displayTags.forEach((tag, index) => {
        if (!tag.tagName) {
          errors.push({
            field: `displayTags[${index}].tagName`,
            message: 'Tag name is required',
            code: 'REQUIRED'
          });
        } else if (tag.tagName.length > 50) {
          errors.push({
            field: `displayTags[${index}].tagName`,
            message: 'Tag name is too long',
            code: 'TOO_LONG'
          });
        }
        
        if (tag.order !== undefined && (tag.order < 0 || tag.order > 1000)) {
          errors.push({
            field: `displayTags[${index}].order`,
            message: 'Tag order must be between 0 and 1000',
            code: 'OUT_OF_RANGE'
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
   * Validate complete license data
   */
  static validateLicenseData(licenseData: {
    license: string;
    customer: string;
    expiration: string;
    singleCount?: number;
    multiCount?: number;
    singleUsed?: number;
    admins?: string[];
    emailDomain?: string;
    features?: any;
  }): ValidationResult {
    const allErrors: ValidationError[] = [];
    
    // Validate individual fields
    const licenseIdValidation = LicenseValidation.validateLicenseId(licenseData.license);
    const customerValidation = LicenseValidation.validateCustomerName(licenseData.customer);
    const expirationValidation = LicenseValidation.validateExpirationDate(licenseData.expiration);
    const countsValidation = LicenseValidation.validateLicenseCounts(
      licenseData.singleCount, 
      licenseData.multiCount, 
      licenseData.singleUsed
    );
    const adminsValidation = LicenseValidation.validateAdminEmails(licenseData.admins);
    const domainValidation = LicenseValidation.validateEmailDomain(licenseData.emailDomain);
    
    allErrors.push(...licenseIdValidation.errors);
    allErrors.push(...customerValidation.errors);
    allErrors.push(...expirationValidation.errors);
    allErrors.push(...countsValidation.errors);
    allErrors.push(...adminsValidation.errors);
    allErrors.push(...domainValidation.errors);
    
    // Validate display tags if present in features
    if (licenseData.features?.displayTags) {
      const displayTagsValidation = LicenseValidation.validateDisplayTags(licenseData.features.displayTags);
      allErrors.push(...displayTagsValidation.errors);
    }
    
    return {
      valid: allErrors.length === 0,
      errors: allErrors
    };
  }
}