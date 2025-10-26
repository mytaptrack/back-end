import { ServiceContext } from '../interfaces/service-context';
import { DeviceOperations } from '@mytaptrack/business-logic-device';
import moment from 'moment-timezone';

/**
 * Device event handlers for publishing to message broker
 */
export class DeviceEventHandlers {
  constructor(private serviceContext: ServiceContext) {}

  /**
   * Handle Track 2.0 button press event
   */
  async handleTrackButtonPress(eventData: TrackButtonPressEvent): Promise<void> {
    try {
      // Get device registration to validate and get student info
      const registration = await DeviceOperations.getDeviceRegistration(
        eventData.dsn, 
        this.serviceContext
      );

      if (!registration) {
        this.serviceContext.logger.warn('Track button press from unregistered device', { dsn: eventData.dsn });
        return;
      }

      // Update device last seen
      await DeviceOperations.updateDeviceStatus(eventData.dsn, 'active', this.serviceContext);

      // Publish track event for downstream processing
      await this.serviceContext.messageBroker.publish('device.track.button.pressed', {
        deviceId: eventData.dsn,
        studentId: registration.studentId,
        license: registration.license,
        pressType: eventData.pressType,
        clickCount: eventData.clickCount,
        remainingLife: eventData.remainingLife,
        eventDate: eventData.eventDate,
        behaviorId: eventData.behaviorId,
        isDuration: eventData.isDuration,
        notStopped: eventData.notStopped,
        source: {
          device: 'Track 2.0',
          rater: eventData.dsn
        },
        timestamp: moment().toISOString()
      });

      // Check for low battery warning
      if (eventData.remainingLife <= 20) {
        await this.serviceContext.messageBroker.publish('device.battery.low', {
          deviceId: eventData.dsn,
          studentId: registration.studentId,
          batteryLevel: eventData.remainingLife,
          timestamp: moment().toISOString()
        });
      }

      this.serviceContext.logger.info('Track button press event processed', {
        dsn: eventData.dsn,
        studentId: registration.studentId,
        clickCount: eventData.clickCount
      });

    } catch (error) {
      this.serviceContext.logger.error('Error handling track button press', { 
        error, 
        eventData 
      });
      throw error;
    }
  }

  /**
   * Handle Track 2.0 audio event
   */
  async handleTrackAudioEvent(eventData: TrackAudioEvent): Promise<void> {
    try {
      // Get device registration
      const registration = await DeviceOperations.getDeviceRegistration(
        eventData.dsn, 
        this.serviceContext
      );

      if (!registration) {
        this.serviceContext.logger.warn('Track audio from unregistered device', { dsn: eventData.dsn });
        return;
      }

      // Update device last seen
      await DeviceOperations.updateDeviceStatus(eventData.dsn, 'active', this.serviceContext);

      // Publish audio event for downstream processing
      await this.serviceContext.messageBroker.publish('device.audio.received', {
        deviceId: eventData.dsn,
        studentId: registration.studentId,
        license: registration.license,
        audioLength: eventData.audioLength,
        eventDate: eventData.eventDate,
        segment: eventData.segment,
        complete: eventData.complete,
        timestamp: moment().toISOString()
      });

      this.serviceContext.logger.info('Track audio event processed', {
        dsn: eventData.dsn,
        studentId: registration.studentId,
        audioLength: eventData.audioLength
      });

    } catch (error) {
      this.serviceContext.logger.error('Error handling track audio event', { 
        error, 
        eventData 
      });
      throw error;
    }
  }

  /**
   * Handle IoT device click event
   */
  async handleIoTClickEvent(eventData: IoTClickEvent): Promise<void> {
    try {
      // Get device registration
      const registration = await DeviceOperations.getDeviceRegistration(
        eventData.deviceId, 
        this.serviceContext
      );

      if (!registration) {
        this.serviceContext.logger.warn('IoT click from unregistered device', { deviceId: eventData.deviceId });
        return;
      }

      // Update device last seen
      await DeviceOperations.updateDeviceStatus(eventData.deviceId, 'active', this.serviceContext);

      // Publish IoT click event
      await this.serviceContext.messageBroker.publish('iot.device.click', {
        deviceId: eventData.deviceId,
        studentId: registration.studentId,
        license: registration.license,
        clickData: eventData.clickData,
        timestamp: moment().toISOString()
      });

      this.serviceContext.logger.info('IoT click event processed', {
        deviceId: eventData.deviceId,
        studentId: registration.studentId
      });

    } catch (error) {
      this.serviceContext.logger.error('Error handling IoT click event', { 
        error, 
        eventData 
      });
      throw error;
    }
  }

  /**
   * Handle app behavior tracking event
   */
  async handleAppBehaviorEvent(eventData: AppBehaviorEvent): Promise<void> {
    try {
      // Publish app behavior event
      await this.serviceContext.messageBroker.publish('app.behavior.tracked', {
        deviceId: eventData.deviceId,
        token: eventData.token,
        behaviorId: eventData.behaviorId,
        date: eventData.date,
        endDate: eventData.endDate,
        timezone: eventData.timezone,
        antecedent: eventData.antecedent,
        consequence: eventData.consequence,
        intensity: eventData.intensity,
        remove: eventData.remove,
        timestamp: moment().toISOString()
      });

      this.serviceContext.logger.info('App behavior event processed', {
        deviceId: eventData.deviceId,
        behaviorId: eventData.behaviorId
      });

    } catch (error) {
      this.serviceContext.logger.error('Error handling app behavior event', { 
        error, 
        eventData 
      });
      throw error;
    }
  }

  /**
   * Handle app service tracking event
   */
  async handleAppServiceEvent(eventData: AppServiceEvent): Promise<void> {
    try {
      // Publish app service event
      await this.serviceContext.messageBroker.publish('app.service.tracked', {
        deviceId: eventData.deviceId,
        token: eventData.token,
        serviceId: eventData.serviceId,
        date: eventData.date,
        endDate: eventData.endDate,
        timezone: eventData.timezone,
        modifications: eventData.modifications,
        progress: eventData.progress,
        remove: eventData.remove,
        timestamp: moment().toISOString()
      });

      this.serviceContext.logger.info('App service event processed', {
        deviceId: eventData.deviceId,
        serviceId: eventData.serviceId
      });

    } catch (error) {
      this.serviceContext.logger.error('Error handling app service event', { 
        error, 
        eventData 
      });
      throw error;
    }
  }

  /**
   * Handle app notes event
   */
  async handleAppNotesEvent(eventData: AppNotesEvent): Promise<void> {
    try {
      // Publish app notes event
      await this.serviceContext.messageBroker.publish('app.notes.created', {
        deviceId: eventData.deviceId,
        token: eventData.token,
        notes: eventData.notes,
        date: eventData.date,
        timezone: eventData.timezone,
        timestamp: moment().toISOString()
      });

      this.serviceContext.logger.info('App notes event processed', {
        deviceId: eventData.deviceId,
        notesLength: eventData.notes?.length || 0
      });

    } catch (error) {
      this.serviceContext.logger.error('Error handling app notes event', { 
        error, 
        eventData 
      });
      throw error;
    }
  }

  /**
   * Handle device registration event
   */
  async handleDeviceRegistration(eventData: DeviceRegistrationEvent): Promise<void> {
    try {
      // Publish device registration event
      await this.serviceContext.messageBroker.publish('device.registered', {
        deviceId: eventData.deviceId,
        studentId: eventData.studentId,
        license: eventData.license,
        deviceType: eventData.deviceType,
        manufacturer: eventData.manufacturer,
        model: eventData.model,
        serialNumber: eventData.serialNumber,
        firmwareVersion: eventData.firmwareVersion,
        timestamp: moment().toISOString()
      });

      this.serviceContext.logger.info('Device registration event processed', {
        deviceId: eventData.deviceId,
        studentId: eventData.studentId,
        deviceType: eventData.deviceType
      });

    } catch (error) {
      this.serviceContext.logger.error('Error handling device registration event', { 
        error, 
        eventData 
      });
      throw error;
    }
  }

  /**
   * Handle device status update event
   */
  async handleDeviceStatusUpdate(eventData: DeviceStatusUpdateEvent): Promise<void> {
    try {
      // Publish device status update event
      await this.serviceContext.messageBroker.publish('device.status.updated', {
        deviceId: eventData.deviceId,
        status: eventData.status,
        previousStatus: eventData.previousStatus,
        timestamp: moment().toISOString()
      });

      // Handle specific status changes
      if (eventData.status === 'offline' && eventData.previousStatus === 'active') {
        await this.serviceContext.messageBroker.publish('device.went.offline', {
          deviceId: eventData.deviceId,
          timestamp: moment().toISOString()
        });
      }

      this.serviceContext.logger.info('Device status update event processed', {
        deviceId: eventData.deviceId,
        status: eventData.status
      });

    } catch (error) {
      this.serviceContext.logger.error('Error handling device status update event', { 
        error, 
        eventData 
      });
      throw error;
    }
  }

  /**
   * Handle firmware update request event
   */
  async handleFirmwareUpdateRequest(eventData: FirmwareUpdateRequestEvent): Promise<void> {
    try {
      // Publish firmware update request event
      await this.serviceContext.messageBroker.publish('device.firmware.update.requested', {
        deviceId: eventData.deviceId,
        currentVersion: eventData.currentVersion,
        requestedVersion: eventData.requestedVersion,
        timestamp: moment().toISOString()
      });

      this.serviceContext.logger.info('Firmware update request event processed', {
        deviceId: eventData.deviceId,
        currentVersion: eventData.currentVersion
      });

    } catch (error) {
      this.serviceContext.logger.error('Error handling firmware update request event', { 
        error, 
        eventData 
      });
      throw error;
    }
  }
}

// Event type interfaces
export interface TrackButtonPressEvent {
  dsn: string;
  pressType: 'click' | 'hold';
  clickCount: number;
  remainingLife: number;
  eventDate: string;
  behaviorId?: string;
  isDuration?: boolean;
  notStopped?: boolean;
}

export interface TrackAudioEvent {
  dsn: string;
  audioLength: number;
  eventDate: string;
  segment?: number;
  complete: boolean;
}

export interface IoTClickEvent {
  deviceId: string;
  clickData: any;
}

export interface AppBehaviorEvent {
  deviceId: string;
  token: string;
  behaviorId: string;
  date?: string;
  endDate: string;
  timezone?: string;
  antecedent?: string;
  consequence?: string;
  intensity?: number;
  remove?: boolean;
}

export interface AppServiceEvent {
  deviceId: string;
  token: string;
  serviceId: string;
  date?: string;
  endDate?: string;
  timezone?: string;
  modifications: string[];
  progress: Array<{ name: string; value: number }>;
  remove?: boolean;
}

export interface AppNotesEvent {
  deviceId: string;
  token: string;
  notes: string;
  date?: string;
  timezone?: string;
}

export interface DeviceRegistrationEvent {
  deviceId: string;
  studentId: string;
  license: string;
  deviceType: string;
  manufacturer?: string;
  model?: string;
  serialNumber?: string;
  firmwareVersion?: string;
}

export interface DeviceStatusUpdateEvent {
  deviceId: string;
  status: string;
  previousStatus?: string;
}

export interface FirmwareUpdateRequestEvent {
  deviceId: string;
  currentVersion: string;
  requestedVersion?: string;
}