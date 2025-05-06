import { CreatePlatformEndpointCommand, DeleteEndpointCommand, SNSClient } from '@aws-sdk/client-sns';
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { AES, enc } from 'crypto-ts';
import { typesV2, MttTag } from '@mytaptrack/types';
import { AppStoredObject, TrackedBehaviorEx, TrackedTargetEx } from '../types/app';
import { v4 as uuid } from 'uuid';
import { WebError, WebUtils, moment } from '../..';
import { Dal, DalKey, MttIndexes, UpdateInput } from './dal';
import {
    AppConfigStorage, AppPii, AppPiiGlobal, 
    AppPushEndpoint, AppPushEndpointStorage,
    AppPiiGlobalStorage, 
    AppPiiStorage, AppConfig, StudentPiiStorage, 
} from '../types';
import { getAppGlobalKey, getStudentAppKey, getStudentPrimaryKey } from '../utils';

const ssm = new SSMClient({});
const sns = new SNSClient({});
let cachedTokenKey = '';
let cachedTokenDetails = '';
const TokenPrefix = 'MTESQ';

export interface TokenSegments {
    id: string;
    auth: string;
    noGen?: boolean;
}

async function getTokenKey() {
    if (!cachedTokenKey) {
        const result = await ssm.send(new GetParameterCommand({
            Name: process.env.TokenEncryptKey,
            WithDecryption: true
        }));

        cachedTokenKey = result.Parameter!.Value!;
    }
    return cachedTokenKey;
}

export function getTokenSegments(token: string, tokenKey: string): TokenSegments {
    const decryptedToken = AES.decrypt(token, tokenKey).toString(enc.Utf8);
    console.log('Decrypted', token, decryptedToken);
    if (!decryptedToken.startsWith(TokenPrefix)) {
        console.log('Invalid token retrieved', decryptedToken);
        throw new Error('Invalid Token');
    }

    const peices = decryptedToken.slice(5);
    const index = peices.indexOf('|');
    if (index < 0) {
        console.log('Invalid token prefix check', decryptedToken);
    }
    return {
        id: peices.slice(index + 1),
        auth: peices.slice(0, index)
    } as TokenSegments;
}

function generateToken(identifier: string, auth: string, tokenKey: string) {
    const combined = `${TokenPrefix}${auth}|${identifier}`;
    return AES.encrypt(combined, tokenKey).toString();
}

class AppDalClass {
    private data = new Dal('data');
    private primary = new Dal('primary');
    async getAppPushEndpointExisting(deviceId: string): Promise<AppPushEndpoint> {
        const result = await this.data.get<AppPushEndpoint>(
            { pk: `A#${deviceId}`, sk: 'E' },
            'os,endpointArn,#token',
            { '#token': 'token' });
        return result;
    }

    async getAppPushEndpoint(deviceId: string, token: string, os: string) {
        const result = await this.getAppPushEndpointExisting(deviceId);

        // if (result && result.token === token) {
        //     return result.endpointArn;
        // }

        if (result && result.endpointArn) {
            await sns.send(new DeleteEndpointCommand({
                EndpointArn: result.endpointArn
            }));
        }

        try {
            const snsResult = await sns.send(new CreatePlatformEndpointCommand({
                PlatformApplicationArn: os === 'ios' ? process.env.platformIosArn : process.env.platformAndroidArn,
                Token: token,
                CustomUserData: deviceId
            }));

            await this.updateAppEndpoint(deviceId, snsResult.EndpointArn!, token, os);

            return snsResult.EndpointArn;
        } catch (err) {
            console.error(err);
        }

        return '';
    }
    async updateAppEndpoint(deviceId: string, endpointArn: string, token: string, os: string) {
        await this.data.put({
            pk: `A#${deviceId}`,
            sk: `E`,
            pksk: `A#${deviceId}#E`,
            deviceId,
            token,
            os,
            endpointArn: endpointArn,
            version: 1
        } as AppPushEndpointStorage);
    }

    async getAppsForLicense(license: string): Promise<typesV2.MobileDevice[]> {
        const configs = await this.data.query<AppConfigStorage>({
            keyExpression: 'lpk = :lpk',
            indexName: MttIndexes.license,
            attributeValues: {
                ':lpk': `${license}#DA`
            }
        });
        console.log('Config count', configs.length);

        const deviceKeys: DalKey[] = [];
        let batchKeys: DalKey[] = [];
        const batches: DalKey[][] = [batchKeys];
        let batchPii: DalKey[] = [];
        const batchesPii: DalKey[][] = [batchPii];
        const piiKeys: DalKey[] = [];
        configs.forEach(x => {
            const key = getAppGlobalKey(license, x.deviceId);
            piiKeys.push({ pk: x.pk, sk: x.sk });
            batchPii.push({ pk: x.pk, sk: x.sk });
            if(batchPii.length >= 100) {
                batchPii = [];;
                batchesPii.push(batchPii);
            }
            if(!deviceKeys.find(x => x.pk == key.pk && x.sk == key.sk)) {
                deviceKeys.push(key);
                batchKeys.push(key);
                if(batchKeys.length > 99) {
                    batchKeys = [];
                    batches.push(batchKeys);
                }
            }
        });

        console.log('Getting keys', deviceKeys.length, piiKeys.length);
        if(deviceKeys.length == 0 && piiKeys.length == 0) {
            console.log('No keys found');
            return [];
        }
        const devices: AppPiiGlobalStorage[] = [];
        const piis: AppPiiStorage[] = [];
        
        
        for(const batch of batchesPii) {
            const p = await this.primary.batchGet<AppPiiStorage>(batch, 'studentName,deviceId,deviceName,pk,sk,behaviorNames,#messages,groups', {'#messages': 'messages'});
            if(p && p.length > 0) {
                piis.push(...p);
            }
        }
        for(const batch of batches) {
            const d = await this.primary.batchGet<AppPiiGlobalStorage>(batch, 'deviceId,deviceName,#tags', { '#tags': 'tags' });
            if(d && d.length > 0) {
                devices.push(...d);
            }
        }
        configs.forEach(conf => {
            const device = devices.find(x => x.deviceId == conf.deviceId);
            if(!device) {
                console.log('Adding missing device');
                devices.push({
                    deviceId: conf.deviceId,
                    deviceName: 'Un-named App',
                    tags: [],
                    dsk: '',
                    license: conf.license,
                    pk: '',
                    sk: '',
                    pksk: '',
                    version: 1
                });
            }
        })
        
        console.log('Retrieved', devices.length, piis.length);
        return devices.map(device => {
            const devicePii = piis.find(x => x.deviceId == device.deviceId);
            return {
                device: {
                    id: device.deviceId,
                    name: device.deviceName || devicePii?.deviceName
                },
                assignments: configs
                    .filter(conf => conf.deviceId == device.deviceId && !conf.deleted)
                    .map(conf => {
                        const pii = piis.find(x => x.pk == conf.pk && x.sk == conf.sk);
                        if(!pii) {
                            return;
                        }
                        return {
                            studentId: conf.studentId,
                            id: conf.appId,
                            name: pii?.studentName,
                            behaviors: conf.config.behaviors.map(beh => ({
                                title: pii?.behaviorNames.find(pb => pb.id == beh.id)?.title,
                                id: beh.id,
                                isDuration: beh.isDuration,
                                track: beh.track,
                                abc: beh.abc,
                                order: beh.order
                            })),
                            groups: pii.groups,
                            timezone: conf.config.timezone
                        };
                    }).filter(x => x? true : false),
                tags: device.tags?.map(tag => tag.tag) || []
            } as typesV2.MobileDevice;
        });
    }

    async getGlobalConfig(license: string, deviceId: string) {
        const globalKey = getAppGlobalKey(license, deviceId);
        const result = await this.primary.get<AppPiiGlobalStorage>(globalKey, 'deviceId,deviceName,#tags', { '#tags': 'tags' });
        return result;
    }

    async getAppConfigsForStudent(studentId: string): Promise<AppConfigStorage[]> {
        const configs = await this.data.query<AppConfigStorage>({
            keyExpression: '#pk = :studentId and begins_with(#sk, :sk)',
            filterExpression: 'attribute_not_exists(#deleted)',
            attributeNames: {
                '#pk': `pk`,
                '#sk': `sk`,
                '#deleted': 'deleted'
            },
            attributeValues: {
                ':studentId': `S#${studentId}`,
                ':sk': `AS#`
            }
        });
        return configs;
    }
    async getAppsForStudent(studentId: string): Promise<AppStoredObject[]> {
        const [appConfigs, appPii] = await Promise.all([
            this.data.query<AppConfigStorage>({
                keyExpression: '#pk = :studentId and begins_with(#sk, :sk)',
                filterExpression: 'attribute_not_exists(#deleted)',
                attributeNames: {
                    '#pk': `pk`,
                    '#sk': `sk`,
                    '#deleted': 'deleted'
                },
                attributeValues: {
                    ':studentId': `S#${studentId}`,
                    ':sk': `AS#`
                }
            }),
            this.primary.query<AppPiiStorage>({
                keyExpression: '#pk = :studentId and begins_with(#sk, :sk)',
                filterExpression: 'attribute_not_exists(#deleted)',
                attributeNames: {
                    '#pk': `pk`,
                    '#sk': `sk`,
                    '#deleted': 'deleted'
                },
                attributeValues: {
                    ':studentId': `S#${studentId}`,
                    ':sk': `AS#`
                }
            }),
        ]);

        const deviceKeys: DalKey[] = [];
        WebUtils.logObjectDetails(appConfigs);
        WebUtils.logObjectDetails(appPii);
        appConfigs.forEach(x => {
            if(!x.deviceId) {
                return;
            }
            const key = getAppGlobalKey(x.license, x.deviceId);
            WebUtils.logObjectDetails(key);
            if(!deviceKeys.find(y => y.pk == key.pk && y.sk == key.sk)) {
                deviceKeys.push(key);
            }
        })
        console.log('Getting global configs', deviceKeys.length);
        const globals = deviceKeys.length > 0? 
            await this.primary.batchGet<AppPiiGlobalStorage>(deviceKeys, 'deviceId,deviceName') :
            [];

        return appConfigs.map(conf => {
            const pii = appPii.find(x => x.sk == conf.sk);
            if(!pii) {
                console.log('Missing pii', conf.appId);
                WebUtils.logObjectDetails(conf);
                return;
            }
            const global = globals.find(x => x.deviceId == conf.deviceId);
            return {
                id: conf.appId,
                studentId: studentId,
                auth: {
                    current: conf.config.auth
                },
                timezone: conf.config.timezone,
                generatingUserId: conf.generatingUserId,
                deviceId: conf.deviceId,
                details: {
                    name: pii.studentName,
                    deviceName: global?.deviceName || pii.deviceName,
                    behaviors: conf.config.behaviors?.map(x => {
                        return {
                            id: x.id,
                            isDuration: x.isDuration,
                            daytimeTracking: x.daytimeTracking,
                            title: pii.behaviorNames.find(x => x.id == x.id)!.title,
                            track: x.track,
                            abc: x.abc,
                            order: x.order
                        };
                    }),
                    services: [],
                    groups: pii.groups,
                    textAlerts: conf.config.textAlerts
                },
                deleteAt: pii.deleteAt,
                license: conf.license,
                licenseExpiration: '',
                version: 1,
                abc: pii.abc
            } as AppStoredObject
        }).filter(x => x? true : false).map(x => x!);
    }

    async getAppConfig(studentId: string, id: string): Promise<AppConfigStorage> {
        return await this.data.get(getStudentAppKey(studentId, id));
    }
    async getAppPii(studentId: string, id: string): Promise<AppPii> {
        return await this.primary.get(getStudentAppKey(studentId, id));
    }
    
    async getAppDetails(studentId: string, id: string, license: string, deviceId: string): Promise<AppStoredObject | undefined> {
        console.log('Retrieving data');
        const studentAppKey = getStudentAppKey(studentId, id);
        const globalKey = getAppGlobalKey(license, deviceId);
        const [config, pii, device] = await Promise.all([
            this.data.get<AppConfigStorage>(studentAppKey),
            this.primary.get<AppPii>(studentAppKey),
            this.primary.get<AppPiiGlobal>(globalKey)
        ]);
        WebUtils.logObjectDetails(config);
        WebUtils.logObjectDetails(pii);
        const retval = {
            deviceId: config.deviceId,
            studentId: studentId,
            id,
            auth: {
                current: config.config.auth
            },
            details: {
                name: pii.studentName,
                deviceName: device? device.deviceName : pii.deviceName,
                behaviors: config.config.behaviors.map(x => {
                    return {
                        id: x.id,
                        order: x.order,
                        track: x.track,
                        abc: x.abc,
                        daytimeTracking: x.daytimeTracking,
                        isDuration: x.isDuration,
                    } as TrackedBehaviorEx;
                }),
                groups: pii.groups,
                textAlerts: config.config.textAlerts
            },
            timezone: config.config.timezone,
            generatingUserId: config.generatingUserId,
            deleteAt: config.deleteAt,
            license: config.license,
            licenseExpiration: '',
            version: 1,
            deleted: config.deleted? true : undefined,
            abc: pii.abc
        } as AppStoredObject;
        if (!retval) {
            return;
        }
        console.log('Decrypting details');
        if (!retval.details) {
            return;
        }
        return retval;
    }

    async updateAppGlobalPii(deviceId: string, license: string, deviceName: string, tags?: MttTag[]) {
        if(!deviceId) {
            return;
        }
        
        const key = getAppGlobalKey(license, deviceId);
        if(!tags) {
            const data = await this.primary.get<AppPiiGlobalStorage>(key, 'tags');
            tags = data?.tags ?? [];
        }
        await this.primary.put({
            ...key,
            pksk: `${key.pk}#${key.sk}`,
            license,
            deviceId,
            deviceName,
            tags,
            dsk: `AG`
        } as AppPiiGlobalStorage);
    }    
    async updateAppPii(studentId: string, appId: string, license: string, deviceId: string, appPii: AppPii) {
        const key = getStudentAppKey(studentId, appId);
        await this.primary.put({
            ...key,
            license,
            appId,
            deviceId,
            studentId,
            ...appPii,
            pksk: `${key.pk}#${key.sk}`,
            tsk: `DA#${appId}#P`,
            dsk: `S#${studentId}`,
            version: 1
        } as AppPiiStorage);
    }
    async updateAppConfig(input: { studentId: string, appId: string, 
                        appConfig: AppConfig, license: string, 
                        deviceId: string, deleted?: boolean, 
                        deleteAt?: number, generatingUserId?: string }) {
        const key = getStudentAppKey(input.studentId, input.appId);
        if(input.generatingUserId) {
            if(!input.appConfig.auth) {
                input.appConfig.auth = uuid();
            }
            await this.data.put({
                ...key,
                pksk: `${key.pk}#${key.sk}`,
                license: input.license,
                appId: input.appId,
                deviceId: input.deviceId,
                config: {
                    auth: input.appConfig.auth,
                    behaviors: input.appConfig.behaviors,
                    services: [],
                    groupCount: input.appConfig.groupCount,
                    textAlerts: input.appConfig.textAlerts ?? false,
                },
                generatingUserId: input.generatingUserId,
                deleted: input.deleted,
                studentId: input.studentId,
                dsk: `S#${input.studentId}`,
                tsk: `DA#${input.appId}#P`,
                lpk: `${input.license}#DA`,
                lsk: `P#${input.appId}`,
                version: 1
            } as AppConfigStorage);
        } else {
            let updateExpressionSET: string[] = ['#config = :config'];
            let updateExpressionREMOVE: string[] = []
            const attributeNames = {
                '#config': 'config'
            };
            const attributeValues: Record<string, any> = {
                ':config': input.appConfig
            };
            if (input.deleted == true) {
                updateExpressionSET.push('#deleted = :deleted');
                attributeNames['#deleted'] = 'deleted';
                attributeValues[':deleted'] = true;
            } else if (input.deleted == false) {
                updateExpressionREMOVE.push('REMOVE #deleted');
                attributeNames['#deleted'] = 'deleted';
            }
            if(input.deleteAt == null) {
                updateExpressionREMOVE.push('#deleteAt');
                attributeNames['#deleteAt'] = 'deleteAt';
            }
            let updateExpression = 'SET ' + updateExpressionSET.join(',');
            if(updateExpressionREMOVE.length > 0) {
                updateExpression += ' REMOVE ' + updateExpressionREMOVE.join(',');
            }
            await this.data.update({
                key,
                updateExpression,
                attributeNames,
                attributeValues
            });
        }
    }

    async deleteDevice(studentId: string, appId: string) {
        const key = getStudentAppKey(studentId, appId);
        const updateInput: UpdateInput = {
            key,
            updateExpression: 'SET #deleted = :deleted, #deleteDate = :date',
            attributeNames: {
                '#deleted': 'deleted',
                '#deleteDate': 'deleteDate'
            },
            attributeValues: {
                ':deleted': true,
                ':date': moment().toISOString()
            }
        };
        await Promise.all([
            this.data.update(updateInput),
            this.primary.update(updateInput)
        ]);
    }

    async generateToken(studentId: string, appId: string) {
        console.log('Retrieving data');
        const app = await this.data.get<AppConfigStorage>(getStudentAppKey(studentId, appId), 'pk,config,deleted');
        if (!app || app.deleted) {
            return null;
        }

        console.log('Getting token key');
        const tokenKey = await getTokenKey();

        console.log('Generating token');
        const token = generateToken(appId, app.config.auth, tokenKey);

        return {
            appId,
            token
        };
    }

    async getTokenSegments(token: string) {
        const tokenKey = await getTokenKey();
        return getTokenSegments(token, tokenKey);
    }

    async deleteTokens(tokens: string[], deviceId: string) {
        const tokenKey = await getTokenKey();
        const tokenParts = tokens.map(x => getTokenSegments(x, tokenKey));
        WebUtils.logObjectDetails(tokenParts);
        const configs = await this.data.query<AppConfigStorage>({
            keyExpression: 'deviceId = :deviceId',
            filterExpression: 'contains(:appIds, sk) AND attribute_not_exists(deleted)',
            attributeValues: {
                ':deviceId': deviceId,
                ':appIds': tokenParts.map(x => `AS#${x.id}#P`)
            },
            indexName: MttIndexes.device,
            projectionExpression: 'studentId,appId,config'
        });
        WebUtils.logObjectDetails(configs);
        await Promise.all(configs.map(async conf => {
            const tkp = tokenParts.find(x => x.id == conf.appId);
            if(conf.config.auth != tkp!.auth) {
                console.log('Auth does not match');
                return;
            }
            console.log('Deleting app', conf.studentId, conf.appId);
            await this.deleteDevice(conf.studentId, conf.appId);
        }));
    }

    private async setDeviceId(conf: AppConfigStorage) {
        await Promise.all([
            this.data.update({
                key: { pk: conf.pk, sk: conf.sk },
                updateExpression: 'SET deviceId = :deviceId REMOVE deleteAt',
                attributeValues: {
                    ':deviceId': conf.deviceId
                }
            }),
            this.primary.update({
                key: { pk: conf.pk, sk: conf.sk },
                updateExpression: 'SET deviceId = :deviceId REMOVE deleteAt',
                attributeValues: {
                    ':deviceId': conf.deviceId
                }
            })
        ]);
    }

    async getTargetsForDevice(deviceId: string): Promise<TrackedTargetEx[]> {
        const tokenKey = await getTokenKey();
        const appData = await this.data.query<AppConfigStorage>({
            keyExpression: 'deviceId = :deviceId',
            filterExpression: 'attribute_not_exists(deleted)',
            attributeValues: {
                ':deviceId': deviceId
            },
            indexName: MttIndexes.device
        });

        if (appData.length === 0) {
            console.log('No data after filter');
            return [];
        }

        console.log('Generating token');
        const retval = await Promise.all(appData.map(async conf => {
            const [pii, studentPii] = await Promise.all([
                this.primary.get<AppPiiStorage>(getStudentAppKey(conf.studentId, conf.appId), 'studentName,behaviorNames,responseNames,groups,abc'),
                this.primary.get<StudentPiiStorage>(getStudentPrimaryKey(conf.studentId), 'studentName,behaviorNames,responseNames,,groups,abc')
            ]);
            studentPii.servicesLookup
            if(!pii) {
                return;
            }
            return {
                token: generateToken(conf.appId, conf.config.auth, tokenKey),
                appId: conf.appId,
                name: pii.studentName,
                studentId: conf.studentId,
                behaviors: (conf.config.behaviors ?? []).map(b => {
                    let bPii = pii.behaviorNames.find(x => x.id == b.id);
                    if(!bPii) {
                        return;
                    }
                    return {
                        ...b,
                        title: bPii.title,
                        alert: false
                    };
                }),
                services: (conf.config.services ?? []).map(s => {
                    let sPii = pii.serviceNames.find(x => x.id == s.id);
                    if(sPii) {
                        return;
                    }
                    return {
                        id: s.id,
                        isDuration: true,
                        durationOn: false,
                        track: true,
                        abc: false,
                        order: s.order,
                        managed: false,
                        title: sPii!.title
                    };
                }),
                abc: pii.abc,
                groups: pii.groups,
                timezone: conf.config.timezone
            } as TrackedTargetEx;
        }));
        console.log('returning results');

        return retval.filter(x => x? true : false).map(x => x!);
    }

    async resolveTokens(tokens: string[], deviceId: string, existingApps: TrackedTargetEx[]): Promise<TrackedTargetEx[]> {
        const tokenKey = await getTokenKey();
        const tokenParts: TokenSegments[] = [];
        tokens.map(x => getTokenSegments(x, tokenKey)).forEach(x => {
            if (!tokenParts.find(y => x.id === y.id)) {
                tokenParts.push(x);
            }
        });
        WebUtils.logObjectDetails(tokenParts);

        console.log('Filtering Tokens');
        const missingIds: TokenSegments[] = tokenParts.filter(x => !existingApps.find(y => y['appId'] === x.id)).map(x => ({ id : x.id } as any));
        if (missingIds.length == 0) {
            return [];
        }
        const appData: AppConfigStorage[] = [];
        console.log('Handling missing ids', missingIds);
        const mlcItems: AppConfigStorage[] = [];
        const newData = await Promise.all(
            missingIds.map(async x => {
                console.log('AppId', x.id);
                const results = await this.data.query<AppConfigStorage>({
                    keyExpression: '#appId = :id',
                    filterExpression: 'attribute_not_exists(deleted)',
                    attributeNames: {
                        '#appId': 'appId'
                    },
                    attributeValues: {
                        ':id': x.id
                    },
                    indexName: MttIndexes.app
                });
                console.log('Processing app', JSON.stringify(results));
                let retval: AppConfigStorage | undefined = results? results[0] : undefined;
                console.log('Device Id', retval?.deviceId);
                if(retval && !retval.deviceId) {
                    console.log('No device id, setting device id');
                    retval.deviceId = deviceId;
                    await this.setDeviceId(retval);
                } else if(retval && (/MCL\-.*/.test(retval.deviceId) || /MLC\-.*/.test(retval.deviceId))) {
                    const foundItem = mlcItems.find(y => y.deviceId == retval!.deviceId);
                    console.log('Checking for existing MCL', foundItem);
                    if(!foundItem) {
                        console.log('Adding item to mcl list');
                        mlcItems.push(retval);
                    }
                } else if(retval && retval.deviceId != deviceId) {
                    console.log('Device id does not match, removing app');
                    retval = undefined;
                }
                return retval;
            }
        ));

        WebUtils.logObjectDetails(newData);
        // validate auth
        await Promise.all(mlcItems.map(async x => {
            console.log('Handing MCL- device', x.deviceId);
            const confs = await this.convertDeviceId(x.license, x.deviceId, deviceId);
            confs.forEach(conf => {
                if(!newData.find(z => z!.appId == conf.appId)) {
                    newData.push(conf);
                }
            })
        }));

        console.log('Pushing device data');
        appData.push(...newData.filter(x => x? true : false).map(x => x!));

        if (appData.length === 0) {
            console.log('No data after filter');
            return [];
        }

        console.log('Generating token');
        const retval = await Promise.all(appData.map(async conf => {
            const pii = await this.primary.get<AppPiiStorage>(getStudentAppKey(conf.studentId, conf.appId), 'studentName,behaviorNames,responseNames,groups,abc');
            if(!pii) {
                return;
            }
            return {
                token: generateToken(conf.appId, conf.config.auth, tokenKey),
                name: pii.studentName,
                studentId: conf.studentId,
                behaviors: conf.config.behaviors.map(b => {
                    let bPii = pii.behaviorNames.find(x => x.id == b.id);
                    if(!bPii) {
                        return;
                    }
                    return {
                        ...b,
                        title: bPii.title,
                        alert: false
                    };
                }),
                services: conf.config.services.map(s => {
                    let sPii = pii.serviceNames.find(x => x.id == s.id);
                    if(!sPii) {
                        return;
                    }
                    return {
                        id: s.id,
                        order: s.order,
                        track: true,
                        abc: false,
                        isDuration: true,
                        title: sPii.title,
                        alert: false
                    };
                }) ?? [],
                abc: pii.abc,
                groups: pii.groups,
                timezone: conf.config.timezone
            } as TrackedTargetEx;
        }));
        console.log('returning results');

        return retval.filter(x => x? true : false).map(x => x!);
    }

    async getStudentIdFromToken(token: string, deviceId: string): Promise<{ studentId: string, id: string }> {
        const tokenKey = await getTokenKey();
        const tokenParts = getTokenSegments(token, tokenKey);
        const items = await this.data.query<AppConfigStorage>({
            keyExpression: 'appId = :appId',
            attributeValues: {
                ':appId': tokenParts.id
            },
            indexName: MttIndexes.app
        });

        if (!items || items.length == 0 || items[0].config.auth != tokenParts.auth) {
            console.log('Query returned no results', tokenParts.id);
            throw new WebError('No app found');
        }
        const item = items[0];
        if (!item.deviceId || item.deleted) {
            console.log('No stored item found', tokenParts.id);
            throw new WebError('No app found');
        }

        if (item.deviceId !== deviceId) {
            console.log('Device does not match', deviceId, item.deviceId);
            throw new Error('Access Denied');
        }

        return { studentId: item.studentId, id: item.appId };
    }

    async updateLicense(studentId: string, appId: string, license: string) {
        const updateInput = {
            key: getStudentAppKey(studentId, appId),
            updateExpression: 'SET license = :license',
            attributeValues: {
                ':license': license
            }
        } as UpdateInput;
        await Promise.all([
            this.data.update(updateInput),
            this.primary.update(updateInput)
        ]);
    }

    async getManagedApp(license: string, deviceId: string): Promise<typesV2.LicenseAppRef> {
        const [configs, pii] = await Promise.all([
            this.data.query<AppConfigStorage>({
                keyExpression: 'deviceId = :deviceId and begins_with(dsk, :dsk)',
                attributeValues: {
                    ':deviceId': deviceId,
                    ':dsk': 'S#'
                },
                projectionExpression: 'appId,studentId',
                indexName: MttIndexes.device
            }),
            this.primary.get<AppPiiGlobalStorage>(getAppGlobalKey(license, deviceId), 'deviceName,tags')
        ]);

        return {
            id: deviceId,
            name: pii.deviceName,
            deviceId: deviceId,
            license: license,
            studentApps: configs.map(x => ({ appId: x.appId, studentId: x.studentId })),
            tags: pii.tags.map(x => x.tag),
            version: 1
        } as typesV2.LicenseAppRef;
    }

    async getManagedApps(license: string, deviceIds?: string[]): Promise<typesV2.LicenseAppRef[]> {
        let appGlobalPii: AppPiiGlobal[];
        if (!deviceIds) {
            appGlobalPii = await this.primary.query<AppPiiGlobal>({
                keyExpression: 'pk = :pk and begins_with(sk, :sk)',
                attributeValues: { ':pk': `L#${license}`, ':sk': 'AG#' }
            });
        } else {
            appGlobalPii = await this.primary.batchGet<AppPiiGlobal>(deviceIds.map(did => getAppGlobalKey(license, did)));
        }
        return await Promise.all(appGlobalPii.map(async g => {
            const confs = await this.data.query<AppConfigStorage>({
                keyExpression: 'deviceId = :deviceId and begins_with(dsk, :dsk)',
                filterExpression: 'license = :license',
                attributeValues: {
                    ':deviceId': g.deviceId,
                    ':dsk': 'AS#',
                    ':license': license
                },
                projectionExpression: 'appId,studentId'
            });
            return {
                id: g.deviceId,
                name: g.deviceName,
                deviceId: g.deviceId,
                license: license,
                studentApps: confs.map(c => ({ appId: c.appId, studentId: c.studentId })),
                tags: g.tags.map(t => t.tag),
                version: 1
            } as typesV2.LicenseAppRef;
        }));
    }

    async convertDeviceId(license: string, originalDeviceId: string, newDeviceId: string): Promise<AppConfigStorage[]> {
        const [configs, primary]  = await Promise.all([
            this.data.query<AppConfigStorage>({
                keyExpression: 'deviceId = :deviceId and begins_with(dsk, :dsk)',
                attributeValues: { ':deviceId': originalDeviceId, ':dsk': 'S#' },
                indexName: MttIndexes.device
            }),
            this.primary.get<AppPiiGlobalStorage>(getAppGlobalKey(license, originalDeviceId))
        ]);

        const newGlobalKey = getAppGlobalKey(license, newDeviceId);
            
        await Promise.all<any>([
            ...configs.map(x => Promise.all([
                this.data.update({
                    key: { pk: x.pk, sk: x.sk },
                    updateExpression: 'SET deviceId = :deviceId',
                    attributeValues: { ':deviceId': newDeviceId }
                }),
                this.primary.update({
                    key: { pk: x.pk, sk: x.sk },
                    updateExpression: 'SET deviceId = :deviceId',
                    attributeValues: { ':deviceId': newDeviceId }
                })
            ]))
        ]);

        const existingGlobal = await this.primary.get<AppPiiGlobalStorage>(newGlobalKey);
        console.log('Converting ', originalDeviceId, ' with name ', primary.deviceName, ' to ', newDeviceId);
        if(!existingGlobal) {
            console.log('Adding new device');
            await this.primary.put<AppPiiGlobalStorage>({
                    ...newGlobalKey,
                    deviceId: newDeviceId,
                    deviceName: primary.deviceName,
                    tags: primary.tags,
                    dsk: primary.dsk,
                    license: primary.license,
                    version: primary.version,
                    pksk: `${newGlobalKey.pk}#${newGlobalKey.sk}`
                });
        }

        if(originalDeviceId.startsWith("MLC-")) {
            await this.primary.delete(getAppGlobalKey(license, originalDeviceId))
        }
        configs.forEach(x => x.deviceId = newDeviceId);
        return configs;
    }

    async listApps(token: any) {
        const results = await this.data.scan({
            filterExpression: 'begins_with(#sk, :sk)',
            attributeNames: { '#sk': 'sk' },
            attributeValues: { ':sk': 'AS#'},
            token
        });

        return {
            apps: results.items,
            token: results.token
        };
    }
}

export const AppDal = new AppDalClass();
