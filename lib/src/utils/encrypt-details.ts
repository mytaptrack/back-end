import { DecryptCommand, KMSClient } from '@aws-sdk/client-kms';
import { Encryptable, Decryptable } from '@mytaptrack/types';

export const kms = new KMSClient({});

const isDebug = process.env.debug === 'true' && process.env.debugEncrypt === 'true';
function log(message: string) {
    if (isDebug) {
        console.log(message);
    }
}

class EncryptUtilsClass {
    async decryptDetails(object: Decryptable): Promise<Encryptable> {
        if (!object || !object.details || !this.isPropertyEncrypted(object, 'details')) {
            return;
        }

        log(typeof object.details);

        await this.decryptProperty(object, 'details');

        return object;
    }

    isPropertyEncrypted(object: Encryptable, property: string) {
        return (Array.isArray(object[property]) &&
                object[property].length > 0 &&
                (Buffer.isBuffer(object[property][0]))) ||
                Buffer.isBuffer(object[property]);
    }

    async decryptProperty(object: Decryptable, property: string) {
        if (!object || !object[property]) {
            return;
        }
        if (Buffer.isBuffer(object[property])) {
            log('Decrypting data');
            try {
                const data = await kms.send(new DecryptCommand({
                    CiphertextBlob: object[property]
                }));
                object[property] = JSON.parse(data.Plaintext.toString());
            } catch (err) {
                console.log(`Couldnt decrypt due to ${err}`);
                throw new Error('Internal Error');
                return;
            }

            return object;
        }

        log('Decrypting array');
        const promises = [];
        for (const i in object[property]) {
            promises.push(decryptProperty(object[property], i));
        }

        await Promise.all(promises);
        log('Decrypt complete');

        let buffer = '';
        for (const i in object[property]) {
            let line = object[property][i].toString('utf-8');
            if (line.substr(0, 1) === '"') {
                log('line starts with a quote');
                const clean = JSON.parse(`{"body":${line}}`);
                line = clean.body;
            }
            buffer += line;
        }

        log('Constructing object body');
        object[property] = buffer.startsWith('{') ? JSON.parse(buffer) : buffer.toString();
    }
}

export const EncryptUtils = new EncryptUtilsClass();

async function decryptProperty(object, property) {
    log('CiphertextBlob: ' + object[property]);

    try {
        const data = await kms.send(new DecryptCommand({
            CiphertextBlob: object[property]
        }));
        object[property] = data.Plaintext;
    } catch (err) {
        console.log(`Couldnt decrypt ${property} due to error`, err);
        throw new Error('Kms Error');
        return;
    }
}
