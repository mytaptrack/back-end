import { ValidationResult, ValidationErrorDetail } from '@mytaptrack/business-logic-core';

/**
 * Student validation functions
 */
export class StudentValidation {
  
  /**
   * Validate student ID format
   */
  static validateStudentId(studentId: string): ValidationResult {
    const errors: ValidationErrorDetail[] = [];
    
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
   * Validate student name fields
   */
  static validateStudentName(firstName?: string, lastName?: string, nickname?: string): ValidationResult {
    const errors: ValidationErrorDetail[] = [];
    
    if (!firstName && !lastName) {
      errors.push({
        field: 'name',
        message: 'At least first or last name is required',
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
    
    if (nickname && nickname.length > 50) {
      errors.push({
        field: 'nickname',
        message: 'Nickname is too long',
        code: 'TOO_LONG'
      });
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate license format
   */
  static validateLicense(license: string): ValidationResult {
    const errors: ValidationErrorDetail[] = [];
    
    if (!license) {
      errors.push({
        field: 'license',
        message: 'License is required',
        code: 'REQUIRED'
      });
    } else if (license.length < 3) {
      errors.push({
        field: 'license',
        message: 'License is too short',
        code: 'TOO_SHORT'
      });
    } else if (license.length > 100) {
      errors.push({
        field: 'license',
        message: 'License is too long',
        code: 'TOO_LONG'
      });
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate complete student data
   */
  static validateStudentData(studentData: {
    studentId: string;
    firstName: string;
    lastName: string;
    nickname?: string;
    license: string;
    tags?: string[];
  }): ValidationResult {
    const allErrors: ValidationErrorDetail[] = [];
    
    // Validate individual fields
    const studentIdValidation = StudentValidation.validateStudentId(studentData.studentId);
    const nameValidation = StudentValidation.validateStudentName(studentData.firstName, studentData.lastName, studentData.nickname);
    const licenseValidation = StudentValidation.validateLicense(studentData.license);
    
    allErrors.push(...studentIdValidation.errors);
    allErrors.push(...nameValidation.errors);
    allErrors.push(...licenseValidation.errors);
    
    return {
      valid: allErrors.length === 0,
      errors: allErrors
    };
  }
}