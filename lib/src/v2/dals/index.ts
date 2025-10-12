/**
 * DAL exports with backward compatibility support
 */

// Export original DAL classes (now enhanced with abstraction layer support)
export { 
  Dal, 
  DalBaseClass, 
  QueryInput, 
  ScanInput, 
  UpdateInput, 
  DalKey, 
  MttIndexes 
} from './dal';

// Export abstraction layer DAL classes
export { 
  AbstractedDal, 
  AbstractedDalBaseClass 
} from './abstracted-dal';

// Export compatibility layer classes
export { 
  CompatibleDal, 
  CompatibleDalBaseClass, 
  DalMigrationHelper 
} from './dal-compatibility';

// Export specific DAL implementations (instances only, classes are not exported from individual files)
export { UserDal } from './user-dal';
export { StudentDal } from './student-dal';
export { DeviceDal } from './device-dal';
export { TeamDal } from './team-dal';
export { NotificationDal } from './notification-dal';
export { LookupDal } from './lookup-dal';
export { ScheduleDal } from './schedule-dal';
export { DataDal } from './data-dal';
export { NotesDal } from './notes-dal';
export { AppDal } from './app-dal';
export { LicenseDal } from './license-dal';
export { EventDal } from './event-dal';
export { TimestreamDal } from './timestream-dal';

// Re-export database abstraction types for convenience
export type { 
  IDataAccessLayer, 
  DatabaseConfig, 
  DatabaseProviderType 
} from '../types/database-abstraction';