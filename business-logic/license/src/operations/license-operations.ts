import { 
  ServiceContext, 
  IBusinessOperations, 
  BusinessLogicError, 
  ValidationError, 
  NotFoundError 
} from '@mytaptrack/business-logic-core';
import { 
  LicenseDetails, 
  LicenseDisplayTags 
} from '@mytaptrack/types';
import * as moment from 'moment-timezone';

/**
 * License-specific business operations
 */
export class LicenseOperations implements IBusinessOperations {
  
  /**
   * Create a new license
   */
  static async createLicense(
    licenseData: CreateLicenseInput,
    context: ServiceContext
  ): Promise<LicenseDetails> {
    // Validate input
    const validation = LicenseOperations.validateCreateLicenseInput(licenseData);
    if (!validation.valid) {
      throw new ValidationError('Invalid license data', context.config.correlationId, { errors: validation.errors });
    }

    const licenseKey = { pk: 'L', sk: `P#${licenseData.license}` };

    // Check if license already exists
    const existingLicense = await context.dataAccess.get(licenseKey);
    if (existingLicense) {
      throw new BusinessLogicError('License already exists', context.config.correlationId, { license: licenseData.license });
    }

    const now = moment().toISOString();
    
    // Create license record
    const licenseRecord: any = {
      ...licenseKey,
      pksk: `${licenseKey.pk}#${licenseKey.sk}`,
      license: licenseData.license,
      details: {
        license: licenseData.license,
        customer: licenseData.customer,
        singleCount: licenseData.singleCount || 0,
        singleUsed: licenseData.singleUsed || 0,
        multiCount: licenseData.multiCount || 0,
        admins: licenseData.admins || [],
        emailDomain: licenseData.emailDomain || '',
        expiration: licenseData.expiration,
        start: licenseData.start || now,
        tags: licenseData.tags || { devices: [] },
        features: licenseData.features || {},
        abcCollections: licenseData.abcCollections || [],
        studentTemplates: licenseData.studentTemplates || [],
        appTemplates: licenseData.appTemplates || []
      },
      version: 1
    };

    // Save license data
    await context.dataAccess.put(licenseRecord);

    // Publish license created event
    await context.messageBroker.publish('license.created', {
      license: licenseData.license,
      customer: licenseData.customer,
      timestamp: now
    });

    context.logger.info('License created successfully', { license: licenseData.license, customer: licenseData.customer });

    return licenseRecord.details;
  }

  /**
   * Get license by ID
   */
  static async getLicenseById(
    license: string,
    context: ServiceContext
  ): Promise<LicenseDetails | null> {
    const licenseKey = { pk: 'L', sk: `P#${license}` };
    
    const licenseRecord = await context.dataAccess.get(licenseKey, 'details');
    
    if (!licenseRecord) {
      return null;
    }

    // Sort display tags by order
    if (licenseRecord.details?.features?.displayTags) {
      licenseRecord.details.features.displayTags.sort((a: any, b: any) => a.order - b.order);
    }

    return licenseRecord.details;
  }

  /**
   * Update license information
   */
  static async updateLicense(
    license: string,
    updateData: UpdateLicenseInput,
    context: ServiceContext
  ): Promise<LicenseDetails> {
    const licenseKey = { pk: 'L', sk: `P#${license}` };
    
    // Check if license exists
    const existingLicense = await context.dataAccess.get(licenseKey);
    if (!existingLicense) {
      throw new NotFoundError('License not found', context.config.correlationId, { license });
    }

    // Validate update data
    const validation = LicenseOperations.validateUpdateLicenseInput(updateData);
    if (!validation.valid) {
      throw new ValidationError('Invalid update data', context.config.correlationId, { errors: validation.errors });
    }

    // Build update expression
    const updateParts: string[] = [];
    const attributeValues: any = {};
    const attributeNames: any = {};

    if (updateData.customer !== undefined) {
      updateParts.push('details.customer = :customer');
      attributeValues[':customer'] = updateData.customer;
    }

    if (updateData.singleCount !== undefined) {
      updateParts.push('details.singleCount = :singleCount');
      attributeValues[':singleCount'] = updateData.singleCount;
    }

    if (updateData.singleUsed !== undefined) {
      updateParts.push('details.singleUsed = :singleUsed');
      attributeValues[':singleUsed'] = updateData.singleUsed;
    }

    if (updateData.multiCount !== undefined) {
      updateParts.push('details.multiCount = :multiCount');
      attributeValues[':multiCount'] = updateData.multiCount;
    }

    if (updateData.admins !== undefined) {
      updateParts.push('details.admins = :admins');
      attributeValues[':admins'] = updateData.admins;
    }

    if (updateData.emailDomain !== undefined) {
      updateParts.push('details.emailDomain = :emailDomain');
      attributeValues[':emailDomain'] = updateData.emailDomain;
    }

    if (updateData.expiration !== undefined) {
      updateParts.push('details.expiration = :expiration');
      attributeValues[':expiration'] = updateData.expiration;
    }

    if (updateData.features !== undefined) {
      updateParts.push('details.features = :features');
      attributeValues[':features'] = updateData.features;
    }

    if (updateParts.length > 0) {
      await context.dataAccess.update({
        key: licenseKey,
        updateExpression: 'SET ' + updateParts.join(', '),
        attributeValues,
        attributeNames: Object.keys(attributeNames).length > 0 ? attributeNames : undefined
      });
    }

    // Publish license updated event
    await context.messageBroker.publish('license.updated', {
      license,
      updateData,
      timestamp: moment().toISOString()
    });

    context.logger.info('License updated successfully', { license });

    return LicenseOperations.getLicenseById(license, context);
  }

  /**
   * Delete license
   */
  static async deleteLicense(
    license: string,
    context: ServiceContext
  ): Promise<void> {
    const licenseKey = { pk: 'L', sk: `P#${license}` };
    
    // Check if license exists
    const existingLicense = await context.dataAccess.get(licenseKey);
    if (!existingLicense) {
      throw new NotFoundError('License not found', context.config.correlationId, { license });
    }

    // Delete license
    await context.dataAccess.delete(licenseKey);

    // Publish license deleted event
    await context.messageBroker.publish('license.deleted', {
      license,
      timestamp: moment().toISOString()
    });

    context.logger.info('License deleted successfully', { license });
  }

  /**
   * Get all licenses
   */
  static async getAllLicenses(
    context: ServiceContext
  ): Promise<LicenseDetails[]> {
    const licenses = await context.dataAccess.query({
      keyExpression: 'pk = :pk and begins_with(sk, :sk)',
      attributeValues: {
        ':pk': 'L',
        ':sk': 'P#'
      },
      projectionExpression: 'details'
    });

    return licenses.map((l: any) => l.details);
  }

  /**
   * Find license by admin email
   */
  static async findLicenseByEmail(
    email: string,
    context: ServiceContext
  ): Promise<LicenseDetails | null> {
    const licenses = await context.dataAccess.query({
      keyExpression: 'pk = :pk and begins_with(sk, :sk)',
      filterExpression: 'contains(#details.#admins, :admin)',
      attributeNames: {
        '#details': 'details',
        '#admins': 'admins'
      },
      attributeValues: {
        ':admin': email,
        ':pk': 'L',
        ':sk': 'P#'
      },
      projectionExpression: 'details'
    });

    if (!licenses || licenses.length === 0) {
      return null;
    }

    return licenses[0].details;
  }

  /**
   * Update license display tags
   */
  static async updateDisplayTags(
    license: string,
    tags: LicenseDisplayTags[],
    context: ServiceContext
  ): Promise<void> {
    const licenseKey = { pk: 'L', sk: `P#${license}` };
    
    await context.dataAccess.update({
      key: licenseKey,
      updateExpression: 'SET #details.#features.#displayTags = :tags',
      attributeNames: {
        '#details': 'details',
        '#features': 'features',
        '#displayTags': 'displayTags'
      },
      attributeValues: {
        ':tags': tags
      }
    });

    // Publish event
    await context.messageBroker.publish('license.tags.updated', {
      license,
      tagCount: tags.length,
      timestamp: moment().toISOString()
    });

    context.logger.info('License display tags updated', { license, tagCount: tags.length });
  }

  /**
   * Get license templates
   */
  static async getLicenseTemplates(
    license: string,
    context: ServiceContext
  ): Promise<{ student: any[] }> {
    const licenseKey = { pk: 'L', sk: `P#${license}` };
    const data = await context.dataAccess.get(licenseKey, 'details');
    
    return {
      student: data?.details?.studentTemplates || []
    };
  }

  /**
   * Register student template
   */
  static async registerStudentTemplate(
    license: string,
    template: string,
    studentId: string,
    context: ServiceContext
  ): Promise<void> {
    const registrationKey = { pk: `LTR#${license}#ST#${template}`, sk: `S#${studentId}` };
    
    await context.dataAccess.put({
      ...registrationKey,
      pksk: `${registrationKey.pk}#${registrationKey.sk}`,
      type: 'student',
      license,
      template,
      studentId,
      version: 1
    });

    // Publish event
    await context.messageBroker.publish('license.template.registered', {
      license,
      template,
      studentId,
      type: 'student',
      timestamp: moment().toISOString()
    });

    context.logger.info('Student template registered', { license, template, studentId });
  }

  /**
   * Unregister student template
   */
  static async unregisterStudentTemplate(
    license: string,
    template: string,
    studentId: string,
    context: ServiceContext
  ): Promise<void> {
    const registrationKey = { pk: `LTR#${license}#ST#${template}`, sk: `S#${studentId}` };
    
    await context.dataAccess.delete(registrationKey);

    // Publish event
    await context.messageBroker.publish('license.template.unregistered', {
      license,
      template,
      studentId,
      type: 'student',
      timestamp: moment().toISOString()
    });

    context.logger.info('Student template unregistered', { license, template, studentId });
  }

  /**
   * Get student IDs for template
   */
  static async getStudentIdsForTemplate(
    license: string,
    template: string,
    context: ServiceContext
  ): Promise<string[]> {
    const registrations = await context.dataAccess.query({
      keyExpression: 'pk = :pk and begins_with(sk, :sk)',
      attributeValues: {
        ':pk': `LTR#${license}#ST#${template}`,
        ':sk': 'S#'
      },
      projectionExpression: 'studentId'
    });

    return registrations.map((r: any) => r.studentId);
  }

  /**
   * Validate create license input
   */
  private static validateCreateLicenseInput(input: CreateLicenseInput): { valid: boolean; errors: any[] } {
    const errors: any[] = [];

    if (!input.license) {
      errors.push({ field: 'license', message: 'License ID is required', code: 'REQUIRED' });
    }

    if (!input.customer) {
      errors.push({ field: 'customer', message: 'Customer name is required', code: 'REQUIRED' });
    }

    if (!input.expiration) {
      errors.push({ field: 'expiration', message: 'Expiration date is required', code: 'REQUIRED' });
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Validate update license input
   */
  private static validateUpdateLicenseInput(input: UpdateLicenseInput): { valid: boolean; errors: any[] } {
    const errors: any[] = [];

    if (input.singleCount !== undefined && input.singleCount < 0) {
      errors.push({ field: 'singleCount', message: 'Single count cannot be negative', code: 'INVALID_VALUE' });
    }

    if (input.multiCount !== undefined && input.multiCount < 0) {
      errors.push({ field: 'multiCount', message: 'Multi count cannot be negative', code: 'INVALID_VALUE' });
    }

    return { valid: errors.length === 0, errors };
  }
}

// Input/Output types
export interface CreateLicenseInput {
  license: string;
  customer: string;
  singleCount?: number;
  singleUsed?: number;
  multiCount?: number;
  admins?: string[];
  emailDomain?: string;
  expiration: string;
  start?: string;
  tags?: any;
  features?: any;
  abcCollections?: any[];
  studentTemplates?: any[];
  appTemplates?: any[];
}

export interface UpdateLicenseInput {
  customer?: string;
  singleCount?: number;
  singleUsed?: number;
  multiCount?: number;
  admins?: string[];
  emailDomain?: string;
  expiration?: string;
  features?: any;
}