import { EncryptUtils, kms } from './encrypt-details';

const encrypt = jest.fn();
// kms.encrypt = encrypt as any;

describe('EncryptUtils', () => {
    beforeEach(() => {
        encrypt.mockReset();
        encrypt.mockImplementation(() => {
            return {
                promise: async () => {
                    return {
                        CiphertextBlob: 'This is encrypted'
                    };
                }
            };
        });
    });

    test('Decrypt data not encrypted', async () => {
        // const data = {
        //     "generatingUserId": "a8122253-2821-48c3-8506-3f11997cd471",
        //     "license": "2021010345141b46087e4330aad4349f0b121a62",
        //     "auth": {
        //       "current": "9eb28079-04f1-4daa-87dd-315cfab97b63"
        //     },
        //     "deviceId": "87D4BE9A-BD89-42BB-B34D-7284F974BCDC",
        //     "studentId": "24e6425a-831b-4f59-9101-cd4ae6128024",
        //     "licenseExpiration": "01/02/2022",
        //     "details": {
        //       "name": "Auto test2",
        //       "deviceName": "App 1",
        //       "behaviors": [
        //         {
        //           "eventId": "b310ab40-9271-40ab-be95-55be7df681cb",
        //           "alert": false,
        //           "presses": null,
        //           "customMessage": "",
        //           "delayDelivery": "",
        //           "track": true,
        //           "order": 2
        //         }
        //       ]
        //     },
        //     "id": "da0316ac-f404-4e34-a1a9-c6ecdb5ea464"
        //   };

        // await EncryptUtils.decryptDetails(data as any);
    });
});
