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
   * Update user info with complex business logic (handles creation, updates, and student associations)
   */
  static async updateUserInfo(
    updateData: UpdateUserInfoInput,
    context: ServiceContext
  ): Promise<any> {
    const { userId, email, inviteUserId, students, ...userFields } = updateData;

    context.logger.info('Processing user info update with business logic', { 
      userId, 
      email,
      inviteUserId 
    });

    // Try to get existing user
    let existingUser = await UserOperations.getUserById(userId, context);
    
    if (!existingUser) {
      // Try to find user by email
      existingUser = await UserOperations.getUserByEmail(email, context);
      
      if (!existingUser) {
        // Create new user if this is the current user or email-based user
        if (userId === inviteUserId) {
          context.logger.info('Creating current user', { userId: inviteUserId });
          
          const newUser = await UserOperations.createUser({
            userId: inviteUserId,
            email,
            ...userFields
          }, context);
          
          // Handle student associations if provided
          if (students && students.length > 0) {
            await UserOperations.handleStudentAssociations(newUser.userId, students, context);
          }
          
          return {
            ...newUser,
            students: students || []
          };
        } else {
          // Create temporary user with email as ID
          context.logger.info('Creating temporary user with email as ID', { email });
          
          const newUser = await UserOperations.createUser({
            userId: email,
            email,
            ...userFields
          }, context);
          
          existingUser = newUser;
        }
      }
    }

    // Update user information
    const updatedUser = await UserOperations.updateUser(existingUser.userId, userFields, context);

    // Handle student associations if provided
    if (students && students.length > 0) {
      context.logger.info('Processing student associations', { 
        userId: updatedUser.userId, 
        studentCount: students.length 
      });
      
      await UserOperations.handleStudentAssociations(updatedUser.userId, students, context);
    }

    return {
      ...updatedUser,
      students: students || []
    };
  }

  /**
   * Handle student associations for a user
   */
  private static async handleStudentAssociations(
    userId: string,
    students: any[],
    context: ServiceContext
  ): Promise<void> {
    // TODO: This should use StudentOperations when available
    // For now, we'll implement basic student association logic
    
    const associationPromises = students.map(async (student) => {
      const associationKey = { 
        pk: `U#${userId}#S`, 
        sk: `S#${student.studentId}` 
      };
      
      const association = {
        ...associationKey,
        userId,
        studentId: student.studentId,
        restrictions: student.restrictions || {},
        status: student.teamStatus || 'PendingApproval',
        services: student.services || false,
        behaviors: student.behaviors || true,
        timestamp: new Date().toISOString()
      };
      
      await context.dataAccess.put(association);
      
      // Publish event
      await context.messageBroker.publish('user.student.associated', {
        userId,
        studentId: student.studentId,
        timestamp: association.timestamp
      });
    });
    
    await Promise.all(associationPromises);
    
    context.logger.info('Student associations processed', { 
      userId, 
      count: students.length 
    });
  }

  /**
   * Get users and students for a license (for management purposes)
   */
  static async getLicenseUsers(
    request: GetLicenseUsersInput,
    context: ServiceContext
  ): Promise<any> {
    const { license, includeUsers, includeStudents } = request;
    
    context.logger.info('Getting users for license management', { license, includeUsers, includeStudents });

    // Get team associations for the license
    const team = await context.dataAccess.query({
      keyExpression: 'lpk = :license',
      filterExpression: 'attribute_not_exists(deleted) and attribute_not_exists(removed)',
      attributeValues: {
        ':license': `${license}#T`
      },
      attributeNames: {
        '#status': 'status'
      },
      indexName: 'license-index',
      projectionExpression: 'userId, studentId, restrictions, #status, serviceTracking, behaviorTracking'
    }) as any[];

    let users: any[] = [];
    let students: any[] = [];

    if (includeUsers && team.length > 0) {
      // Get unique user IDs
      const userIds = [...new Set(team.map(t => t.userId))];
      
      // Get user details
      const userPromises = userIds.map(userId => 
        UserOperations.getUserById(userId, context).catch(() => null)
      );
      const userResults = await Promise.all(userPromises);
      
      // Process users and their student associations
      users = userResults
        .filter(user => user !== null)
        .map(user => {
          const userTeamAssociations = team.filter(t => 
            t.userId === user.userId || t.userId === user.details.email
          );
          
          const studentAssociations = userTeamAssociations
            .filter(s => s.restrictions)
            .map(s => {
              const studentSummary = {
                studentId: s.studentId,
                restrictions: {
                  ...s.restrictions,
                  info: s.restrictions.info || s.restrictions.behavior,
                  documents: s.restrictions.documents || s.restrictions.behavior,
                  abc: s.restrictions.abc || s.restrictions.behavior,
                  reports: s.restrictions.reports || s.restrictions.data,
                  service: s.restrictions.service || 'none',
                  serviceData: s.restrictions.serviceData || 'none',
                  serviceGoals: s.restrictions.serviceGoals || 'none',
                  serviceSchedule: s.restrictions.serviceSchedule || 'none'
                },
                services: s.serviceTracking,
                behaviors: s.behaviorTracking,
                teamStatus: s.status ?? 'PendingApproval'
              };
              
              // Set default tracking if not specified
              if (!s.behaviorTracking && !s.serviceTracking) {
                studentSummary.behaviors = true;
                studentSummary.services = false;
              }
              
              return studentSummary;
            });

          return {
            id: user.userId,
            firstName: user.details.firstName,
            lastName: user.details.lastName,
            email: user.details.email.toLowerCase(),
            name: user.details.name,
            students: studentAssociations
          };
        });
    }

    if (includeStudents && team.length > 0) {
      // TODO: Implement student retrieval logic when StudentOperations is available
      students = [];
      context.logger.info('Student data requested but not yet implemented in business logic layer');
    }

    const result = {
      users,
      students
    };

    context.logger.info('License users result', { 
      userCount: users.length, 
      studentCount: students.length 
    });

    return result;
  }

  /**
   * Accept terms for a user
   */
  static async acceptTerms(
    userId: string,
    context: ServiceContext
  ): Promise<boolean> {
    const userKey = { pk: `U#${userId}`, sk: 'P' };
    const timestamp = new Date().toISOString();
    
    // Check if user exists
    const existingUser = await context.dataAccess.get(userKey);
    if (!existingUser) {
      throw new NotFoundError('User not found', context.config.correlationId, { userId });
    }

    // Update user's terms acceptance timestamp
    await context.dataAccess.update({
      key: userKey,
      updateExpression: 'SET terms = :terms',
      attributeValues: { ':terms': timestamp }
    });

    // Publish event
    await context.messageBroker.publish('user.terms.accepted', {
      userId,
      timestamp
    });

    context.logger.info('User accepted terms', { userId, timestamp });

    return true;
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
   * Update dashboard settings for a student-user combination
   */
  static async updateDashboardSettings(
    studentId: string,
    userId: string,
    license: string,
    dashboard: any | undefined,
    context: ServiceContext
  ): Promise<any> {
    context.logger.info('Updating student dashboard settings', { 
      studentId, 
      userId, 
      license,
      hasDashboard: !!dashboard 
    });

    const key = { 
      pk: `S#${studentId}`, 
      sk: `D#${userId}#DA` 
    };

    if (dashboard) {
      // Create/update dashboard settings
      const dashboardRecord = {
        pk: key.pk,
        sk: key.sk,
        pksk: `${key.pk}#${key.sk}`,
        studentId: studentId,
        tsk: `U#${userId}#DA`,
        userId: userId,
        usk: `S#${studentId}#DA`,
        license,
        lpk: `${license}#S`,
        lsk: `DA#${studentId}`,
        dashboard: dashboard,
        version: 1
      };

      await context.dataAccess.put(dashboardRecord);

      // Publish event
      await context.messageBroker.publish('user.dashboard.updated', {
        studentId,
        userId,
        license,
        dashboard,
        timestamp: new Date().toISOString()
      });

      context.logger.info('Dashboard settings updated', { studentId, userId });
    } else {
      // Delete dashboard settings
      await context.dataAccess.delete(key);

      // Publish event
      await context.messageBroker.publish('user.dashboard.deleted', {
        studentId,
        userId,
        license,
        timestamp: new Date().toISOString()
      });

      context.logger.info('Dashboard settings deleted', { studentId, userId });
    }

    return dashboard;
  }

  /**
   * Handle user invite acceptance/rejection for student access
   */
  static async handleUserInvite(
    studentId: string,
    status: string,
    userId: string,
    context: ServiceContext
  ): Promise<any> {
    context.logger.info('Processing user invite', { studentId, status, userId });

    // Get user details
    const user = await UserOperations.getUserById(userId, context);
    if (!user) {
      throw new NotFoundError('User not found', context.config.correlationId, { userId });
    }

    // Define invite keys
    const userTeamKey = { pk: `U#${userId}`, sk: `S#${studentId}#I` };
    const emailTeamKey = { pk: `U#${user.details.email}`, sk: `S#${studentId}#I` };

    // Get existing invites
    const [studentInvite, emailInvite] = await Promise.all([
      context.dataAccess.get(userTeamKey),
      context.dataAccess.get(emailTeamKey)
    ]);

    let inviteToProcess = null;

    // Process user-based invite
    if (studentInvite) {
      if ((studentInvite as any).status === 'RemovalPending') {
        throw new BusinessLogicError('Student invite not found', context.config.correlationId, { studentId, userId });
      }

      context.logger.info('Updating user student invite', { userId, studentId });
      await context.dataAccess.update({
        key: userTeamKey,
        updateExpression: 'SET #status = :status',
        attributeNames: { '#status': 'status' },
        attributeValues: { ':status': status }
      });

      inviteToProcess = studentInvite;
    }

    // Process email-based invite
    if (emailInvite) {
      if ((emailInvite as any).status === 'RemovalPending') {
        throw new BusinessLogicError('Student invite not found', context.config.correlationId, { studentId, userId });
      }

      context.logger.info('Handling email invite', { email: user.details.email, studentId });
      
      // Create new user-based invite from email invite
      const newUserInvite = {
        ...emailInvite,
        ...userTeamKey,
        pksk: `${userTeamKey.pk}#${userTeamKey.sk}`,
        userId: userId,
        status: status
      };

      await context.dataAccess.put(newUserInvite);

      context.logger.info('Removing email invite', { email: user.details.email, studentId });
      await context.dataAccess.delete(emailTeamKey);

      inviteToProcess = emailInvite;
    }

    if (!emailInvite && !studentInvite) {
      throw new NotFoundError('Student invite not found', context.config.correlationId, { studentId, userId });
    }

    // Get student PII for response
    const studentPii = await context.dataAccess.get({ pk: `S#${studentId}`, sk: 'P' });
    if (!studentPii) {
      throw new NotFoundError('Student not found', context.config.correlationId, { studentId });
    }

    // Publish invite processed event
    await context.messageBroker.publish('user.invite.processed', {
      userId,
      studentId,
      status,
      timestamp: new Date().toISOString()
    });

    context.logger.info('User invite processed successfully', { userId, studentId, status });

    // Return student summary
    const processedInvite = inviteToProcess as any;
    return {
      studentId: studentId,
      details: {
        firstName: (studentPii as any).firstName,
        lastName: (studentPii as any).lastName,
        nickname: (studentPii as any).nickname,
        schoolId: (studentPii as any).schoolStudentId
      },
      tracking: {
        service: processedInvite.restrictions.service !== 'none',
        behavior: processedInvite.restrictions.behavior !== 'none',
      },
      lastTracked: '',
      awaitingResponse: false,
      alertCount: 0
    };
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

export interface UpdateUserInfoInput extends UpdateUserInput {
  userId: string;
  email: string;
  inviteUserId: string;
  students?: any[];
}

export interface GetLicenseUsersInput {
  license: string;
  includeUsers: boolean;
  includeStudents: boolean;
}

export interface HandleUserInviteInput {
  studentId: string;
  status: string;
}