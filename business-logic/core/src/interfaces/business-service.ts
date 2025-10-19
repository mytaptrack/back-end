import { ServiceContext } from './service-context';

/**
 * Base interface for all business services
 */
export interface IBusinessService {
  initialize(context: ServiceContext): Promise<void>;
  shutdown(): Promise<void>;
}

/**
 * Base interface for business operations that can be used statically
 */
export interface IBusinessOperations {
  // Marker interface for business operation classes
}