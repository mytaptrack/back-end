import { 
  ServiceContext, 
  IBusinessOperations, 
  BusinessLogicError, 
  ValidationError, 
  NotFoundError 
} from '@mytaptrack/business-logic-core';
import { AccessDeniedError } from '@mytaptrack/business-logic-core/dist/errors/service-errors';
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
   * Change license (cancel or full cancel)
   */
  static async changeLicense(
    request: ChangeLicenseRequest,
    context: ServiceContext
  ): Promise<LicenseDetails> {
    const { license, userId, fullCancel, cancel } = request;
    
    // Get existing license
    const licenseDetails = await LicenseOperations.getLicenseById(license, context);
    if (!licenseDetails) {
      throw new NotFoundError('License not found', context.config.correlationId, { license });
    }

    if (fullCancel) {
      await LicenseOperations.performFullCancellation(license, userId, licenseDetails, context);
    } else if (cancel) {
      await LicenseOperations.performCancellation(license, licenseDetails, context);
    }

    // Return updated license details
    return await LicenseOperations.getLicenseById(license, context) || licenseDetails;
  }

  /**
   * Perform full license cancellation
   */
  private static async performFullCancellation(
    license: string,
    userId: string,
    licenseDetails: LicenseDetails,
    context: ServiceContext
  ): Promise<void> {
    // Cancel Stripe subscription if exists
    if (licenseDetails.stripe?.id) {
      await LicenseOperations.cancelStripeSubscription(licenseDetails, context);
    }

    // Delete all license-related data
    const deleteOperations = [];

    // Query and delete data table records
    const dataQueries = [
      { lpk: `${license}#R` },
      { lpk: `${license}#S` },
      { lpk: `${license}#DA` },
      { lpk: `${license}#T` },
      { lpk: `L#${license}` }
    ];

    for (const query of dataQueries) {
      const records = await context.dataAccess.query({
        keyExpression: 'lpk = :lpk',
        attributeValues: { ':lpk': query.lpk },
        projectionExpression: 'pk, sk',
        indexName: 'license-index'
      });
      
      for (const record of records) {
        deleteOperations.push(context.dataAccess.delete({ pk: record.pk, sk: record.sk }));
      }
    }

    // Query and delete primary table records
    const primaryQueries = [
      { lpk: `${license}#S` },
      { lpk: `${license}#AG` }
    ];

    for (const query of primaryQueries) {
      const records = await context.dataAccess.query({
        keyExpression: 'lpk = :lpk',
        attributeValues: { ':lpk': query.lpk },
        projectionExpression: 'pk, sk',
        indexName: 'license-index'
      });
      
      for (const record of records) {
        deleteOperations.push(context.dataAccess.delete({ pk: record.pk, sk: record.sk }));
      }
    }

    // Delete license record
    deleteOperations.push(context.dataAccess.delete({ pk: 'L', sk: `P#${license}` }));

    // Remove license from user
    deleteOperations.push(context.dataAccess.update({
      key: { pk: `U#${userId}`, sk: 'P' },
      updateExpression: 'REMOVE license, licenseDetails'
    }));

    // Execute all delete operations
    await Promise.all(deleteOperations);

    // Publish event
    await context.messageBroker.publish('license.fully.cancelled', {
      license,
      userId,
      timestamp: moment().toISOString()
    });

    context.logger.info('License fully cancelled', { license, userId });
  }

  /**
   * Perform license cancellation (downgrade to free)
   */
  private static async performCancellation(
    license: string,
    licenseDetails: LicenseDetails,
    context: ServiceContext
  ): Promise<void> {
    // Check if license can be cancelled
    if (licenseDetails.singleUsed > 2) {
      throw new ValidationError('There are too many active students, please remove all except 2', context.config.correlationId);
    }

    // Cancel Stripe subscription if exists
    if (licenseDetails.stripe?.id) {
      await LicenseOperations.cancelStripeSubscription(licenseDetails, context);
    }

    // Update license to free tier
    const licenseKey = { pk: 'L', sk: `P#${license}` };
    await context.dataAccess.update({
      key: licenseKey,
      updateExpression: 'SET #details.#features.#personal = :false, #details.#features.#free = :true, #details.#singleCount = :singleCount',
      attributeNames: {
        '#details': 'details',
        '#features': 'features',
        '#personal': 'personal',
        '#free': 'free',
        '#singleCount': 'singleCount'
      },
      attributeValues: {
        ':false': false,
        ':true': true,
        ':singleCount': 2
      }
    });

    // Publish event
    await context.messageBroker.publish('license.cancelled', {
      license,
      timestamp: moment().toISOString()
    });

    context.logger.info('License cancelled and downgraded to free', { license });
  }

  /**
   * Create a free license for a user
   */
  static async createFreeLicense(
    request: CreateFreeLicenseRequest,
    context: ServiceContext
  ): Promise<LicenseDetails> {
    const { userId, userEmail, userState } = request;
    
    // Get user to check if they already have a license
    const userKey = { pk: `U#${userId}`, sk: 'P' };
    const user = await context.dataAccess.get(userKey);
    
    if (!user) {
      throw new NotFoundError('User not found', context.config.correlationId, { userId });
    }
    
    // If user already has a license, return it
    if (user.license) {
      const existingLicense = await LicenseOperations.getLicenseById(user.license, context);
      if (existingLicense) {
        context.logger.info('User already has license', { userId, license: user.license });
        return existingLicense;
      }
    }
    
    // Generate new license ID
    const licenseId = moment().format('YYYYMMDD') + LicenseOperations.generateShortId();
    
    // Create free license
    const freeLicenseData: CreateLicenseInput = {
      license: licenseId,
      customer: `PER-${userState?.trim() || 'UNKNOWN'}-${userId?.trim()}`,
      singleCount: 2,
      singleUsed: 0,
      multiCount: 0,
      admins: [userEmail.toLowerCase().trim()],
      emailDomain: '',
      expiration: '2099-01-01',
      start: moment().format('YYYY-MM-DD'),
      tags: { devices: [] },
      features: {
        snapshot: false,
        snapshotConfig: {
          low: '@frown',
          medium: '@meh',
          high: '@smile',
          measurements: [
            { name: '@smile', order: 0 },
            { name: '@meh', order: 1 },
            { name: '@frown', order: 2 }
          ]
        },
        dashboard: true,
        browserTracking: true,
        download: false,
        duration: false,
        manage: false,
        supportChanges: false,
        schedule: false,
        devices: true,
        behaviorTargets: false,
        response: false,
        emailTextNotifications: true,
        manageStudentTemplates: false,
        manageResponses: false,
        abc: false,
        notifications: false,
        appGroups: false,
        documents: false,
        intervalWBaseline: false,
        displayTags: [],
        serviceTracking: false,
        behaviorTracking: true,
        serviceProgress: false,
        personal: 'free' as any
      },
      abcCollections: [],
      studentTemplates: [],
      appTemplates: []
    };
    
    // Create the license
    const license = await LicenseOperations.createLicense(freeLicenseData, context);
    
    // Update user with license
    await context.dataAccess.update({
      key: userKey,
      updateExpression: 'SET license = :license',
      attributeValues: { ':license': licenseId }
    });
    
    // Publish user license assigned event
    await context.messageBroker.publish('user.license.assigned', {
      userId,
      license: licenseId,
      licenseType: 'free',
      timestamp: moment().toISOString()
    });
    
    context.logger.info('Free license created and assigned to user', { userId, license: licenseId });
    return license;
  }

  /**
   * Get license details for a user
   */
  static async getLicenseForUser(
    request: GetLicenseForUserRequest,
    context: ServiceContext
  ): Promise<LicenseDetails> {
    const { userId, requestingUserId } = request;
    
    // Get user configuration
    const userKey = { pk: `U#${userId}`, sk: 'P' };
    const user = await context.dataAccess.get(userKey, 'license');
    
    if (!user) {
      throw new NotFoundError('User not found', context.config.correlationId, { userId });
    }
    
    if (!user.license) {
      throw new NotFoundError('User has no license assigned', context.config.correlationId, { userId });
    }
    
    // Check if requesting user has permission to view this license
    // For now, we'll allow users to view their own license or if they're in the same license
    if (userId !== requestingUserId) {
      const requestingUserKey = { pk: `U#${requestingUserId}`, sk: 'P' };
      const requestingUser = await context.dataAccess.get(requestingUserKey, 'license');
      
      if (!requestingUser || requestingUser.license !== user.license) {
        throw new AccessDeniedError('Insufficient permissions to view this license', context.config.correlationId, { 
          userId, 
          requestingUserId 
        });
      }
    }
    
    // Get license details
    const licenseDetails = await LicenseOperations.getLicenseById(user.license, context);
    
    if (!licenseDetails) {
      throw new NotFoundError('License not found', context.config.correlationId, { license: user.license });
    }
    
    context.logger.info('License details retrieved for user', { userId, license: user.license });
    return licenseDetails;
  }

  /**
   * Cancel Stripe subscription
   */
  private static async cancelStripeSubscription(
    licenseDetails: LicenseDetails,
    context: ServiceContext
  ): Promise<void> {
    try {
      // This would typically use a Stripe service or external API call
      // For now, we'll publish an event that can be handled by a Stripe service
      await context.messageBroker.publish('stripe.subscription.cancel', {
        subscriptionId: licenseDetails.stripe.id,
        timestamp: moment().toISOString()
      });

      context.logger.info('Stripe subscription cancellation requested', { 
        subscriptionId: licenseDetails.stripe.id 
      });
    } catch (error) {
      context.logger.error('Failed to cancel Stripe subscription', { 
        error: error.message,
        subscriptionId: licenseDetails.stripe.id 
      });
      throw new BusinessLogicError('Failed to cancel subscription', context.config.correlationId);
    }
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
   * Generate short ID for license
   */
  private static generateShortId(): string {
    return Math.random().toString(36).substring(2, 15).replace(/\-/g, '');
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

export interface ChangeLicenseRequest {
  license: string;
  userId: string;
  fullCancel?: boolean;
  cancel?: boolean;
}

export interface GetLicenseForUserRequest {
  userId: string;
  requestingUserId: string;
}

export interface CreateFreeLicenseRequest {
  userId: string;
  userEmail: string;
  userState?: string;
}