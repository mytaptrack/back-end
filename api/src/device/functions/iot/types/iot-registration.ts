import { DalKey } from "@mytaptrack/lib/dist/v2/dals/dal";

export interface IoTRegistration extends DalKey {
    thingName: string;
    thingArn: string;
    inGroup: boolean;
    cert?: {
        certificateArn: string;
        certificateId: string;
        keyPair: {
            PrivateKey?: string;
            PublicKey?: string;
        };
        pem: string;
    };
    certDate?: number;
    certAttached?: boolean;
    version?: number;
}
