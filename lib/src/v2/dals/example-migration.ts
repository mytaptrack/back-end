/**
 * Example migration - Simplified after abstraction layer removal
 */

import { DalBaseClass } from './dal';

export class ExampleUserDal extends DalBaseClass {
  /**
   * Simple method using DynamoDB directly
   */
  async getUserProfile(userId: string) {
    const pk = `USER#${userId}`;
    const sk = 'PROFILE';
    return await this.primary.get({ pk, sk });
  }

  /**
   * Method with projection
   */
  async getUserProfileWithProjection(userId: string, fields: string[]) {
    const pk = `USER#${userId}`;
    const sk = 'PROFILE';
    return await this.primary.get({ pk, sk }, fields.join(', '));
  }
}
