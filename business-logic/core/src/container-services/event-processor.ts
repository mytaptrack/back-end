import { ServiceContext, BrokerMessage } from '../interfaces/service-context';

/**
 * Base class for event processors
 */
export abstract class EventProcessor {
  constructor(protected context: ServiceContext) {}

  /**
   * Process an event message
   */
  abstract process(message: BrokerMessage): Promise<void>;

  /**
   * Optional reprocessing method for manual triggers
   */
  reprocess?(): Promise<void>;

  /**
   * Batch process multiple events efficiently
   */
  async batchProcess(messages: BrokerMessage[]): Promise<void> {
    // Default implementation processes sequentially
    // Subclasses can override for true batch processing
    for (const message of messages) {
      await this.process(message);
    }
  }
}