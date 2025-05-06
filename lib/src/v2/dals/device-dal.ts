import { IoTDevice, TrackDeviceTermStatus } from '@mytaptrack/types';
import { DalBaseClass } from './dal';
import { 
    generateDeviceGlobalKey, generateStudentTrackKey,
} from '../utils';
import { 
    DeviceConfigStorage, DevicePiiGlobalStorage, StoredIdentity, 
} from '../types';

class DeviceDalClass extends DalBaseClass {
    async getStudentDevices(studentId: string): Promise<IoTDevice[]> {
        const key = generateStudentTrackKey(studentId, '');
        const configs = await this.data.query<DeviceConfigStorage>({
            keyExpression: 'pk = :pk',
            attributeValues: {
                ':pk': key.pk
            }
        });

        if(configs.length == 0) {
            return [];
        }
        const piis = await this.primary.batchGet<DevicePiiGlobalStorage>(configs.map(x => generateDeviceGlobalKey(x.deviceId)),
            'commands,#name,deviceId,validated', { '#name': 'name' });
        return configs.map(x => {
            const pii = piis.find(y => y.deviceId == x.deviceId);
            if(!pii) {
                return;
            }
            return {
                dsn: x.deviceId,
                deviceId: x.deviceId,
                deviceName: pii.name,
                studentId,
                isApp: false,
                events: x.config.behaviors.map(b => {
                    return {
                        eventId: b.id,
                        presses: b.presses,
                        delayDelivery: undefined,
                        order: b.order
                    };
                }),
                timezone: x.timezone,
                multiStudent: true,
                license: x.license,
                commands: pii.commands.filter(x => x.studentId == studentId),
                validated: pii.validated
            } as IoTDevice;
        }).filter(x => x? true : false);
    }

    async get(dsn: string, studentId?: string): Promise<IoTDevice> {
        const pii = await this.primary.get<DevicePiiGlobalStorage>(generateDeviceGlobalKey(dsn));
        if(!pii) {
            return;
        }
        const key = generateStudentTrackKey(studentId? studentId : pii.currentStudentId, dsn);
        const config = (pii.currentStudentId || studentId)? await this.data.get<DeviceConfigStorage>(key) : undefined;
        
        return {
            dsn,
            deviceId: dsn,
            studentId: pii.currentStudentId,
            deviceName: pii.name,
            timezone: config?.timezone,
            isApp: false,
            multiStudent: true,
            termSetup: pii.termSetup,
            license: pii.license,
            validated: pii.validated,
            deleted: config?.deleted,
            events: config?.config.behaviors.map(x => ({
                eventId: x.id,
                presses: x.presses
            })),
            commands: pii.commands
        } as IoTDevice;
    }

    async getConfig(studentId: string, dsn: string) {
        const key = generateStudentTrackKey(studentId, dsn);
        const config = await this.data.get<DeviceConfigStorage>(key);
        return config;
    }

    async delete(dsn: string) {
        console.log('Deleting device');
        const piiKey = generateDeviceGlobalKey(dsn);
        const pii = await this.primary.get<DevicePiiGlobalStorage>(piiKey);
        
        if(pii && pii.commands) {
            await Promise.all(pii.commands.map(async c => {
                const key = generateStudentTrackKey(c.studentId, dsn);
                await this.data.delete(key);
            }));    
        }
        this.primary.delete(piiKey);
    }

    async deleteConfig(dsn: string, studentId: string) {
        const key = generateStudentTrackKey(studentId, dsn);
        const piiKey = generateDeviceGlobalKey(dsn);

        const pii = await this.primary.get<DevicePiiGlobalStorage>(piiKey, 'commands');
        const commandIndex = pii.commands.findIndex(x => x.studentId == studentId);
        if(commandIndex < 0) {
            return;
        }

        if(pii.commands.length == 1) {
            await Promise.all(pii.commands.map(async c => {
                const key = generateStudentTrackKey(c.studentId, dsn);
                await this.data.delete(key);
            }));
            await this.data.delete(key);
        } else {
            await Promise.all([
                this.primary.update({
                    key: piiKey,
                    updateExpression: `REMOVE #commands[${commandIndex}]`,
                    attributeNames: {
                        '#commands': 'commands'
                    }
                }),
                this.data.delete(key)
            ]);
        }
    }

    async register(dsn: string, license: string) {
        const piiKey = generateDeviceGlobalKey(dsn);

        const pii = await this.primary.get<DevicePiiGlobalStorage>(piiKey, 'license,validated');
        if(pii && pii.license && pii.license != license) {
            throw new Error('License does not match what is registered');
        }
        console.log('Checking validation', pii);
        if(pii && pii.validated && pii.license) {
            return;
        }
        await this.primary.put<DevicePiiGlobalStorage>({
            ...piiKey,
            pksk: `${piiKey.pk}#${piiKey.sk}`,
            license: license,
            name: dsn,
            currentStudentId: '',
            deviceId: dsn,
            dsk: 'P',
            validated: pii?.validated ?? false,
            commands: [],
            lastNotices: {
                power: 0
            },
            identity: {
            },
            version: 1
        });
    }

    async setValidated(dsn: string) {
        const key = generateDeviceGlobalKey(dsn);
        console.log('Validation click sent', dsn);
        await this.primary.update({
            key,
            updateExpression: 'set #validated = :validated',
            attributeNames: {
                '#validated': 'validated'
            },
            attributeValues: {
                ':validated': true
            }
        });
    }

    async updateNotificationDetails(dsn: string, noticeData: { power: number }) {
        const key = generateDeviceGlobalKey(dsn);
        await this.primary.update({
            key,
            updateExpression: 'SET lastNotices = :lastNotices',
            attributeValues: {
                ':lastNotices': noticeData
            }
        });
    }

    async setTermSetup(dsn: string, studentId: string) {
        const key = generateDeviceGlobalKey(dsn);

        const pii = await this.primary.get<DevicePiiGlobalStorage>(key);

        if(!pii || !pii.commands.find(x => x.studentId == studentId)) {
            console.log('Student command not found', dsn, studentId);
            return;
        }

        await this.primary.update({
            key,
            updateExpression: 'SET termSetup = :termSetup, studentId = :studentId',
            attributeValues: {
                ':termSetup': true,
                ':studentId': studentId
            }
        });
    }

    async getTermStatus(dsn: string, studentId: string): Promise<TrackDeviceTermStatus> {
        const key = generateDeviceGlobalKey(dsn);

        const pii = await this.primary.get<DevicePiiGlobalStorage>(key);

        if(!pii) {
            return;
        }

        return { termSet: pii.termSetup, term: pii.commands.find(x => x.studentId == studentId)?.term };
    }

    async updateExistingCommands(device: IoTDevice) {
        const piiKey = generateDeviceGlobalKey(device.dsn);
        await this.primary.update({
            key: piiKey,
            updateExpression: 'SET #commands = :commands',
            attributeNames: {
                '#commands': 'commands'
            },
            attributeValues: {
                ':commands': device.commands
            }
        });
    }

    async setCurrentStudent(dsn: string, studentId: string) {
        const piiKey = generateDeviceGlobalKey(dsn);
        
        await this.primary.update({
            key: piiKey,
            updateExpression: 'SET #currentStudentId = :currentStudentId',
            attributeNames: { '#currentStudentId': 'currentStudentId'},
            attributeValues: { ':currentStudentId': studentId }
        });
    }

    async update(device: IoTDevice) {
        const piiKey = generateDeviceGlobalKey(device.dsn);
        const key = generateStudentTrackKey(device.studentId, device.dsn);
        const [pii, config] = await Promise.all([
            this.primary.get<DevicePiiGlobalStorage>(piiKey, '#name,#commands,#currentStudentId', {
                '#name': 'name',
                '#commands': 'commands',
                '#currentStudentId': 'currentStudentId'
            }),
            this.data.get<DeviceConfigStorage>(key, 'pk')
        ]);
        if(!pii) {
            throw Error('Device not registered');
        }
        let commandUpdated = false;
        const studentCommand = pii.commands.find(x => x.studentId == device.studentId);
        if(!studentCommand) {
            commandUpdated = true;
            pii.commands.push({ studentId: device.studentId, term: '' });
        }

        const globalSame = pii.name == device.deviceName && !commandUpdated;
        const globalUpdatePromise = globalSame? undefined : this.primary.update({
            key: piiKey,
            updateExpression: 'SET ' + [
                '#name = :name',
                '#commands = :commands',
                '#timezone = :timezone',
                device.studentId? 'currentStudentId = :currentStudentId' : ''
            ].filter(x => x? true : false).join(' ,'),
            attributeNames: {
                '#name': 'name',
                '#commands': 'commands',
                '#timezone': 'timezone'
            },
            attributeValues: {
                ':name': device.deviceName,
                ':commands': pii.commands,
                ':timezone': device.timezone,
                ':currentStudentId': device.studentId? device.studentId : undefined
            }
        });
        if(config) {
            await Promise.all([
                globalUpdatePromise,
                this.data.update({
                    key,
                    updateExpression: 'SET #config.#behaviors = :events, #timezone = :timezone',
                    attributeNames: {
                        '#config': 'config',
                        '#behaviors': 'behaviors',
                        '#timezone': 'timezone'
                    },
                    attributeValues: {
                        ':events': device.events?.map(x => ({ id: x.eventId, presses: x.presses })) ?? [],
                        ':timezone': device.timezone
                    }
                })
            ]);
        } else {
            await Promise.all([
                globalUpdatePromise,
                this.data.put<DeviceConfigStorage>({
                    ...key,
                    pksk: `${key.pk}#${key.sk}`,
                    studentId: device.studentId,
                    tsk: `TRACK#${device.dsn}`,
                    deviceId: device.dsn,
                    dsk: `S#${device.studentId}`,
                    timezone: device.timezone,
                    config: {
                        behaviors: device.events?.map(x => ({ id: x.eventId, presses: x.presses })) ?? []
                    },
                    license: device.license,
                    version: 1
                })
            ]);
        }
    }


    async getIdentity(dsn: string): Promise<StoredIdentity> {
        const piiKey = generateDeviceGlobalKey(dsn);
        const pii = await this.primary.get<DevicePiiGlobalStorage>(piiKey, '#identity', { '#identity': 'identity' });

        if(!pii) {
            return null;
        }
        return {
            dsn,
            identity: pii.identity.next,
            lastIdentity: pii.identity.current,
            lastUpdate: pii.identity.update
        };
    }

    async putIdentity(identity: StoredIdentity) {
        const piiKey = generateDeviceGlobalKey(identity.dsn);
        await this.primary.update({
            key: piiKey,
            updateExpression: 'SET #identity = :identity',
            attributeNames: {
                '#identity': 'identity'
            },
            attributeValues: {
                ':identity': {
                    next: identity.identity,
                    current: identity.lastIdentity,
                    lastUpdate: new Date().getTime()
                }
            }
        });
    }
}

export const DeviceDal = new DeviceDalClass();
