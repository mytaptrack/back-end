import { LicenseDetails, LicenseDisplayTags } from '@mytaptrack/types';
import { getAppTemplateRegistrationKey, getLicenseKey, getStudentTemplateRegistrationKey } from '../utils';
import { LicenseStorage, LicenseTemplateRegistration, LicenseTemplates } from '../types';
import { Dal } from './dal';


class LicenseDalClass {
    public primary = new Dal('primary');
    public data = new Dal('data');

    async get(license: string): Promise<LicenseDetails> {
        const retval = await this.data.get<LicenseStorage>(getLicenseKey(license), 'details');
        if(!retval) {
            return;
        }

        if(retval.details?.features?.displayTags) {
            retval.details.features.displayTags.sort((a, b) => a.order - b.order);
        }

        return retval.details;
    }

    async delete(license: string): Promise<void> {
        await this.data.delete(getLicenseKey(license));
    }

    async getAll(): Promise<LicenseDetails[]> {
        const response = await this.data.query<LicenseStorage>({
            keyExpression: 'pk = :pk and begins_with(sk, :sk)',
            attributeValues: {
                ':pk': 'L',
                ':sk': 'P#'
            },
            projectionExpression: 'details'
        });
        return response.map(r => r.details);
    }

    async save(license: LicenseDetails): Promise<void> {
        const key = getLicenseKey(license.license);
        await this.data.put<LicenseStorage>({
            ...key,
            pksk: `${key.pk}#${key.sk}`,
            license: license.license,
            details: license,
            version: 1
        });
    }

    async findByEmail(email: string): Promise<LicenseDetails> {
        const license = await this.data.query<LicenseStorage>({
            keyExpression: 'pk = :pk and begins_with(sk, :sk)',
            filterExpression: 'contains(#details.#admins, :admin)',
            attributeNames: {
                '#details': 'details',
                '#admins': 'admins'
            },
            attributeValues: {
                ':admin': email,
                ':pk': 'L',
                ':sk': 'P#'
            },
            projectionExpression: 'details'
        });
        if(!license || license.length == 0) {
            return;
        }

        return license[0].details;
    }

    async getTemplates(license: string): Promise<LicenseTemplates> {
        const key = getLicenseKey(license);
        const data = await this.data.get<LicenseStorage>(key, 'details');
        return {
            student: data.details.studentTemplates
        };
    }

    async getStudentIdsForTemplate(license: string, template: string) {
        const key = getStudentTemplateRegistrationKey(license, template, '');
        const data = await this.data.query<LicenseTemplateRegistration>({
            keyExpression: 'pk = :pk and begins_with(sk, :sk)',
            attributeValues: {
                ':pk': key.pk,
                ':sk': key.sk
            },
            projectionExpression: 'studentId'
        });
        return data.map(x => x.studentId);
    }

    async putStudentTemplateRegistration(input: { license: string, template: string, studentId: string }) {
        const key = getStudentTemplateRegistrationKey(input.license, input.template, input.studentId);
        await this.data.put<LicenseTemplateRegistration>({
            ...key,
            pksk: `${key.pk}#${key.sk}`,
            type: 'student',
            license: input.license,
            template: input.template,
            studentId: input.studentId,
            version: 1
        });
    }
    async deleteStudentTemplateRegistration(license: string, template: string, studentId: string) {
        const key = getStudentTemplateRegistrationKey(license, template, studentId);
        await this.data.delete(key);
    }

    async getAppIdsForTemplate(license: string, template: string) {
        const key = getAppTemplateRegistrationKey(license, template, '');
        const data = await this.data.query<LicenseTemplateRegistration>({
            keyExpression: 'pk = :pk and begins_with(sk, :sk)',
            attributeValues: {
                ':pk': key.pk,
                ':sk': key.sk
            },
            projectionExpression: 'studentId, appId, deviceId'
        });
        return data.map(x => ({ studentId: x.studentId, deviceId: x.deviceId, appId: x.appId }));
    }

    async putAppTemplateRegistration(input: { license: string, template: string, studentId: string, deviceId: string, appId: string }) {
        const key = getAppTemplateRegistrationKey(input.license, input.template, input.appId);
        await this.data.put<LicenseTemplateRegistration>({
            ...key,
            pksk: `${key.pk}#${key.sk}`,
            type: 'app',
            license: input.license,
            template: input.template,
            studentId: input.studentId,
            deviceId: input.deviceId,
            appId: input.appId,
            version: 1
        });
    }
    async deleteAppTemplateRegistration(license: string, template: string, appId: string) {
        const key = getAppTemplateRegistrationKey(license, template, appId);
        await this.data.delete(key);
    }

    async putTags(license: string, tags: LicenseDisplayTags[]) {
        const key = getLicenseKey(license);
        await this.data.update({
            key,
            updateExpression: 'set #details.#features.#displayTags = :tags',
            attributeNames: {
                '#details': 'details',
                '#features': 'features',
                '#displayTags': 'displayTags'
            },
            attributeValues: {
                ':tags': tags
            }
        });
    }

    // async getStudentTemplateByTag(license: string, tag: string) {
    //     const tagResponse = await dynamodb.get({
    //         TableName: process.env.LicenseAssociationTable,
    //         Key: { licenseType: `StudentTemplate#${license}`, tag }
    //     }).promise();

    //     return tagResponse.Item as LicenseTemplateEx<StudentTemplateBehavior>;
    // }

    // async getAppTemplateByTag(license: string, tag: string) {
    //     const tagResponse = await dynamodb.get({
    //         TableName: process.env.LicenseAssociationTable,
    //         Key: { licenseType: `AppTemplate#${license}`, tag }
    //     }).promise();

    //     return tagResponse.Item as LicenseTemplateEx<TrackTemplateBehavior>;
    // }

    // async queryAppTemplates(license: string, exclusiveStartKey: any):
    //     Promise<{items: LicenseTemplateEx<TrackTemplateBehavior>[], token: any}> {
    //     const results = await dynamodb.query({
    //         TableName: process.env.LicenseAssociationTable,
    //         KeyConditionExpression: '#licenseType = :licenseType',
    //         ExpressionAttributeNames: {
    //             '#licenseType': 'licenseType'
    //         },
    //         ExpressionAttributeValues: {
    //             ':licenseType': `AppTemplate#${license}`
    //         },
    //         ExclusiveStartKey: exclusiveStartKey
    //     }).promise();

    //     return {
    //         items: results.Items as LicenseTemplateEx<TrackTemplateBehavior>[],
    //         token: results.LastEvaluatedKey
    //     };
    // }

    // async addDeviceToAppTemplate(license: string, tag: string, appIds: string[]) {
    //     await dynamodb.update({
    //         TableName: process.env.LicenseAssociationTable,
    //         Key: { licenseType: `AppTemplate#${license}`, tag },
    //         UpdateExpression: 'SET #ids = :appIds',
    //         ExpressionAttributeNames: {
    //             '#ids': 'ids'
    //         },
    //         ExpressionAttributeValues: {
    //             ':appIds': appIds
    //         }
    //     }).promise();
    // }

    // async removeDeviceToAppTemplate(licenseType: string, tag: string, appId: string) {
    //     await dynamodb.update({
    //         TableName: process.env.LicenseAssociationTable,
    //         Key: { licenseType, tag },
    //         UpdateExpression: 'DELETE #ids :id',
    //         ExpressionAttributeNames: {
    //             '#ids': 'ids'
    //         },
    //         ExpressionAttributeValues: {
    //             ':id': appId
    //         }
    //     }).promise();
    // }

    // async addStudentToAppTemplate(licenseType: string, tag: string, studentIds: string[], previousIds: string[]) {
    //     if (!previousIds) {
    //         await dynamodb.update({
    //             TableName: process.env.LicenseAssociationTable,
    //             Key: { licenseType, tag },
    //             UpdateExpression: 'SET #studentIds = :studentId',
    //             ConditionExpression: 'attribute_not_exists(#studentIds)',
    //             ExpressionAttributeNames: {
    //                 '#studentIds': 'studentIds'
    //             },
    //             ExpressionAttributeValues: {
    //                 ':studentId': studentIds
    //             }
    //         }).promise();
    //     } else {
    //         await dynamodb.update({
    //             TableName: process.env.LicenseAssociationTable,
    //             Key: { licenseType, tag },
    //             UpdateExpression: 'SET #studentIds = :studentId',
    //             ConditionExpression: '#studentIds = :previous',
    //             ExpressionAttributeNames: {
    //                 '#studentIds': 'studentIds'
    //             },
    //             ExpressionAttributeValues: {
    //                 ':studentId': studentIds,
    //                 ':previous': previousIds
    //             }
    //         }).promise();
    //     }
    // }

    // async setIdsForStudentTemplate(license: string, tag: string, ids: string[], previousIds: string[]) {
    //     await dynamodb.update({
    //         TableName: process.env.LicenseAssociationTable,
    //         Key: { licenseType: `StudentTemplate#${license}`, tag },
    //         UpdateExpression: 'SET #ids = :appIds',
    //         ConditionExpression: '#ids = :previous',
    //         ExpressionAttributeNames: {
    //             '#ids': 'ids'
    //         },
    //         ExpressionAttributeValues: {
    //             ':appIds': ids,
    //             ':previous': previousIds
    //         }
    //     }).promise();
    // }
}

export const LicenseDal = new LicenseDalClass();
