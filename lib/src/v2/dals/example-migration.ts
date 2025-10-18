/**
 * Example showing how to migrate an existing DAL class to use the abstraction layer
 */

import { DalBaseClass } from './dal';
import { IDataAccessLayer, DatabaseKey } from '../types/database-abstraction';

// Example of a typical existing DAL class
class ExampleUserDal extends DalBaseClass {
  /**
   * Original method using legacy DAL
   */
  async getUserProfileLegacy(userId: string) {
    const pk = `USER#${userId}`;
    const sk = 'PROFILE';
    
    return await this.primary.get({ pk, sk });
  }

  /**
   * Updated method that can use abstraction layer
   */
  async getUserProfile(userId: string) {
    const pk = `USER#${userId}`;
    const sk = 'PROFILE';
    
    // Check if abstraction layer is available and enabled
    if (this.isAbstractionEnabled()) {
      const provider = this.getAbstractionProvider()!;
      const key: DatabaseKey = { primary: pk, sort: sk };
      return await provider.get(key);
    } else {
      // Fall back to legacy DAL
      return await this.primary.get({ pk, sk });
    }
  }

  /**
   * Method using abstraction layer with enhanced features
   */
  async getUserProfileWithProjection(userId: string, fields: string[]) {
    const pk = `USER#${userId}`;
    const sk = 'PROFILE';
    
    if (this.isAbstractionEnabled()) {
      const provider = this.getAbstractionProvider()!;
      const key: DatabaseKey = { primary: pk, sort: sk };
      
      // Use projection to only fetch specific fields
      return await provider.get(key, { projection: fields });
    } else {
      // Legacy DAL with projection
      const projectionExpression = fields.join(', ');
      return await this.primary.get({ pk, sk }, projectionExpression);
    }
  }

  /**
   * Method showing query operations
   */
  async getUsersByStatus(status: string) {
    if (this.isAbstractionEnabled()) {
      const provider = this.getAbstractionProvider()!;
      
      // Use unified query interface
      return await provider.query({
        keyCondition: {
          field: 'pk',
          operator: '=',
          value: 'USER'
        },
        filterCondition: {
          field: 'status',
          operator: '=',
          value: status
        }
      });
    } else {
      // Legacy query
      return await this.primary.query({
        keyExpression: 'pk = :pk',
        filterExpression: '#status = :status',
        attributeNames: { '#status': 'status' },
        attributeValues: { 
          ':pk': 'USER',
          ':status': status 
        }
      });
    }
  }

  /**
   * Method showing update operations
   */
  async updateUserProfile(userId: string, updates: Record<string, any>) {
    const pk = `USER#${userId}`;
    const sk = 'PROFILE';
    
    if (this.isAbstractionEnabled()) {
      const provider = this.getAbstractionProvider()!;
      
      // Use unified update interface
      await provider.update({
        key: { primary: pk, sort: sk },
        updates,
        condition: {
          field: 'pk',
          operator: 'exists'
        }
      });
    } else {
      // Legacy update - would need to build update expression
      const updateExpression = Object.keys(updates)
        .map((key, index) => `#${key} = :val${index}`)
        .join(', ');
      
      const attributeNames = Object.keys(updates)
        .reduce((acc, key) => ({ ...acc, [`#${key}`]: key }), {});
      
      const attributeValues = Object.keys(updates)
        .reduce((acc, key, index) => ({ ...acc, [`:val${index}`]: updates[key] }), {});

      await this.primary.update({
        key: { pk, sk },
        updateExpression: `SET ${updateExpression}`,
        attributeNames,
        attributeValues,
        condition: 'attribute_exists(pk)'
      });
    }
  }

  /**
   * Method showing transaction operations
   */
  async createUserWithProfile(userId: string, userData: any, profileData: any) {
    if (this.isAbstractionEnabled()) {
      const provider = this.getAbstractionProvider()!;
      
      // Use transaction support
      const transaction = await provider.beginTransaction();
      
      try {
        // Put user data
        await transaction.put({
          pk: `USER#${userId}`,
          sk: 'DATA',
          ...userData
        });
        
        // Put profile data
        await transaction.put({
          pk: `USER#${userId}`,
          sk: 'PROFILE',
          ...profileData
        });
        
        await transaction.commit();
      } catch (error) {
        await transaction.rollback();
        throw error;
      }
    } else {
      // Legacy approach - separate operations (no transaction support)
      await this.primary.put({
        pk: `USER#${userId}`,
        sk: 'DATA',
        ...userData
      });
      
      await this.primary.put({
        pk: `USER#${userId}`,
        sk: 'PROFILE',
        ...profileData
      });
    }
  }

  /**
   * Method showing batch operations
   */
  async getUserProfiles(userIds: string[]) {
    const keys = userIds.map(userId => ({
      primary: `USER#${userId}`,
      sort: 'PROFILE'
    }));
    
    if (this.isAbstractionEnabled()) {
      const provider = this.getAbstractionProvider()!;
      return await provider.batchGet(keys);
    } else {
      // Legacy batch get
      const dalKeys = userIds.map(userId => ({
        pk: `USER#${userId}`,
        sk: 'PROFILE'
      }));
      
      return await this.primary.batchGet(dalKeys);
    }
  }

  /**
   * Method showing provider-specific operations
   */
  async executeNativeOperation(operation: any) {
    if (this.isAbstractionEnabled()) {
      const provider = this.getAbstractionProvider()!;
      
      // Execute provider-specific operation
      return await provider.executeNative(operation);
    } else {
      // Legacy native operation
      return await this.primary.send(operation);
    }
  }

  /**
   * Method showing health check
   */
  async checkDatabaseHealth() {
    if (this.isAbstractionEnabled()) {
      const provider = this.getAbstractionProvider()!;
      return await provider.healthCheck();
    } else {
      // Legacy health check - simple operation
      try {
        await this.primary.get({ pk: '__health__', sk: '__check__' });
        return { healthy: true, provider: 'dynamodb' };
      } catch (error) {
        return { healthy: false, provider: 'dynamodb', error: error.message };
      }
    }
  }
}

/**
 * Example of initialization and usage
 */
export async function exampleUsage() {
  // Initialize the abstraction layer
  await DalBaseClass.initializeProvider({
    provider: 'dynamodb',
    dynamodb: {
      region: 'us-east-1',
      primaryTable: 'MyTapTrack-Primary',
      dataTable: 'MyTapTrack-Data',
      consistentRead: true
    }
  });

  // Create DAL instance
  const userDal = new ExampleUserDal();

  // Use the DAL - it will automatically use abstraction layer if enabled
  const profile = await userDal.getUserProfile('user123');
  console.log('User profile:', profile);

  // Update user profile
  await userDal.updateUserProfile('user123', {
    name: 'John Doe',
    email: 'john@example.com',
    updatedAt: new Date().toISOString()
  });

  // Check health
  const health = await userDal.checkDatabaseHealth();
  console.log('Database health:', health);

  // Switch to MongoDB (if needed)
  await DalBaseClass.switchProvider({
    provider: 'mongodb',
    mongodb: {
      connectionString: 'mongodb://localhost:27017',
      database: 'mytaptrack',
      collections: {
        primary: 'primary',
        data: 'data'
      }
    }
  });

  // Continue using the same DAL - now with MongoDB backend
  const profileFromMongo = await userDal.getUserProfile('user123');
  console.log('User profile from MongoDB:', profileFromMongo);
}

export { ExampleUserDal };