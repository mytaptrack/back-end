import { 
  ServiceContext, 
  IBusinessOperations, 
  BusinessLogicError, 
  ValidationError, 
  NotFoundError 
} from '@mytaptrack/business-logic-core';

/**
 * User-specific business operations
 */
export class UserOperations implements IBusinessOperations {
  
  /**
   * Create a new user
   */
  static async createUser(
    userData: CreateUserInput,
    context: ServiceContext
  ): Promise<any> {
    // Validate input
    const validation = UserOperations.validateCreateUserInput(userData);
    if (!validation.valid) {
      throw new ValidationError('Invalid user data', context.config.correlationId, { errors: validation.errors });
    }

    const userId = userData.userId || userData.email;
    const userKey = { pk: `U#${userId}`, sk: 'P' };

    // Check if user already exists
    const existingUser = await context.dataAccess.get(userKey);
    if (existingUser) {
      throw new BusinessLogicError('User already exists', context.config.correlationId, { userId });
    }

    const now = new Date().toISOString();
    
    // Create user PII record
    const userPii: any = {
      ...userKey,
      pksk: `${userKey.pk}#${userKey.sk}`,
      userId,
      usk: 'P',
      license: userData.license,
      version: 1,
      details: {
        firstName: userData.firstName || '',
        lastName: userData.lastName || '',
        name: userData.name || `${userData.firstName} ${userData.lastName}`.trim(),
        email: userData.email.toLowerCase(),
        state: userData.state || '',
        zip: userData.zip || ''
      }
    };

    // Create user config record
    const userConfig: any = {
      ...userKey,
      pksk: `${userKey.pk}#${userKey.sk}`,
      userId,
      usk: 'P',
      license: userData.license,
      licenseDetails: userData.licenseDetails,
      terms: userData.acceptTerms ? now : '',
      events: [],
      tags: userData.tags || [],
      version: 1
    };

    // Save user data
    await Promise.all([
      context.dataAccess.put(userPii),
      context.dataAccess.put(userConfig)
    ]);

    // Publish user created event
    await context.messageBroker.publish('user.created', {
      userId,
      email: userData.email,
      license: userData.license,
      timestamp: now
    });

    context.logger.info('User created successfully', { userId, email: userData.email });

    return UserOperations.getUserById(userId, context);
  }

  /**
   * Get user by ID
   */
  static async getUserById(
    userId: string,
    context: ServiceContext
  ): Promise<any | null> {
    const userKey = { pk: `U#${userId}`, sk: 'P' };
    
    const [piiData, configData] = await Promise.all([
      context.dataAccess.get(userKey, 'details'),
      context.dataAccess.get(userKey, 'events,license,tags,terms,licenseDetails')
    ]);

    if (!piiData || !configData) {
      return null;
    }

    const user: any = {
      version: 1,
      userId,
      terms: (configData as any).terms,
      license: (configData as any).license,
      licenseDetails: (configData as any).licenseDetails,
      details: (piiData as any).details,
      teamInvites: [],
      students: []
    };

    return user;
  }

  /**
   * Update user information
   */
  static async updateUser(
    userId: string,
    updateData: UpdateUserInput,
    context: ServiceContext
  ): Promise<any> {
    const userKey = { pk: `U#${userId}`, sk: 'P' };
    
    // Check if user exists
    const existingUser = await context.dataAccess.get(userKey);
    if (!existingUser) {
      throw new NotFoundError('User not found', context.config.correlationId, { userId });
    }

    // Validate update data
    const validation = UserOperations.validateUpdateUserInput(updateData);
    if (!validation.valid) {
      throw new ValidationError('Invalid update data', context.config.correlationId, { errors: validation.errors });
    }

    const updates: Promise<void>[] = [];

    // Update PII if provided
    if (updateData.firstName || updateData.lastName || updateData.name || updateData.state || updateData.zip) {
      const piiUpdate: any = {
        key: userKey,
        updateExpression: 'SET',
        attributeValues: {} as any,
        attributeNames: {} as any
      };

      const updateParts: string[] = [];
      
      if (updateData.firstName !== undefined) {
        updateParts.push('details.firstName = :firstName');
        piiUpdate.attributeValues[':firstName'] = updateData.firstName;
      }
      
      if (updateData.lastName !== undefined) {
        updateParts.push('details.lastName = :lastName');
        piiUpdate.attributeValues[':lastName'] = updateData.lastName;
      }
      
      if (updateData.name !== undefined) {
        updateParts.push('details.#name = :name');
        piiUpdate.attributeNames['#name'] = 'name';
        piiUpdate.attributeValues[':name'] = updateData.name;
      }
      
      if (updateData.state !== undefined) {
        updateParts.push('details.#state = :state');
        piiUpdate.attributeNames['#state'] = 'state';
        piiUpdate.attributeValues[':state'] = updateData.state;
      }
      
      if (updateData.zip !== undefined) {
        updateParts.push('details.zip = :zip');
        piiUpdate.attributeValues[':zip'] = updateData.zip;
      }

      piiUpdate.updateExpression += ' ' + updateParts.join(', ');
      updates.push(context.dataAccess.update(piiUpdate));
    }

    // Execute all updates
    await Promise.all(updates);

    // Publish user updated event
    await context.messageBroker.publish('user.updated', {
      userId,
      updateData,
      timestamp: new Date().toISOString()
    });

    context.logger.info('User updated successfully', { userId });

    return UserOperations.getUserById(userId, context);
  }

  /**
   * Delete user
   */
  static async deleteUser(
    userId: string,
    context: ServiceContext
  ): Promise<void> {
    const userKey = { pk: `U#${userId}`, sk: 'P' };
    
    // Check if user exists
    const existingUser = await context.dataAccess.get(userKey);
    if (!existingUser) {
      throw new NotFoundError('User not found', context.config.correlationId, { userId });
    }

    // Get all user-related records
    const userRecords = await context.dataAccess.query({
      keyExpression: 'pk = :pk',
      attributeValues: { ':pk': `U#${userId}` }
    });

    // Delete all user records
    const deletePromises = userRecords.map((record: any) => 
      context.dataAccess.delete({ pk: record.pk, sk: record.sk })
    );

    await Promise.all(deletePromises);

    // Publish user deleted event
    await context.messageBroker.publish('user.deleted', {
      userId,
      timestamp: new Date().toISOString()
    });

    context.logger.info('User deleted successfully', { userId });
  }

  /**
   * Get user by email
   */
  static async getUserByEmail(
    email: string,
    context: ServiceContext
  ): Promise<any | null> {
    // First try to get user ID by email lookup
    const emailKey = { pk: `U#${email.toLowerCase()}#E`, sk: 'P' };
    const userIdLookup = await context.dataAccess.get(emailKey, 'userId');
    
    if (userIdLookup) {
      return UserOperations.getUserById((userIdLookup as any).userId, context);
    }

    return null;
  }

  /**
   * Add user to license group
   */
  static async addUserToLicense(
    userId: string,
    license: string,
    context: ServiceContext
  ): Promise<void> {
    // Update user's license
    const userKey = { pk: `U#${userId}`, sk: 'P' };
    await context.dataAccess.update({
      key: userKey,
      updateExpression: 'SET license = :license',
      attributeValues: { ':license': license }
    });

    // Publish event
    await context.messageBroker.publish('user.license.added', {
      userId,
      license,
      timestamp: new Date().toISOString()
    });

    context.logger.info('User added to license', { userId, license });
  }

  /**
   * Validate create user input
   */
  private static validateCreateUserInput(input: CreateUserInput): { valid: boolean; errors: any[] } {
    const errors: any[] = [];

    if (!input.email || !input.email.includes('@')) {
      errors.push({ field: 'email', message: 'Valid email is required', code: 'INVALID_EMAIL' });
    }

    if (!input.firstName && !input.lastName && !input.name) {
      errors.push({ field: 'name', message: 'At least one name field is required', code: 'MISSING_NAME' });
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Validate update user input
   */
  private static validateUpdateUserInput(input: UpdateUserInput): { valid: boolean; errors: any[] } {
    const errors: any[] = [];

    // Add validation as needed for update fields

    return { valid: errors.length === 0, errors };
  }
}

// Input/Output types
export interface CreateUserInput {
  userId?: string;
  email: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  state?: string;
  zip?: string;
  license?: string;
  licenseDetails?: any;
  tags?: any[];
  acceptTerms?: boolean;
}

export interface UpdateUserInput {
  firstName?: string;
  lastName?: string;
  name?: string;
  state?: string;
  zip?: string;
  license?: string;
  tags?: any[];
  acceptTerms?: boolean;
}