#!/usr/bin/env node
import { default as create } from 'prompt-sync';
import * as yml from 'yaml';
import * as fs from 'fs';
import { Config } from '@mytaptrack/cdk';
import { CreateBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { GetParameterCommand, PutParameterCommand, SSMClient } from '@aws-sdk/client-ssm';

import { randomBytes } from 'crypto';
import { ListHostedZonesCommand, Route53Client } from '@aws-sdk/client-route-53';

function generateRandomSeed(length: number): string {
    // Generate random bytes using crypto.randomBytes
    const seed = randomBytes(length);
    let result = '';
    for (const byte of seed) {
        // Filter for printable ASCII characters (32-126)
        if (byte >= 32 && byte <= 126) {
            result += String.fromCharCode(byte);
        } else {
            // If not printable, map to a printable character
            result += String.fromCharCode((byte % 95) + 32) // Map to the printable range
        }
    }
    return result;
}

const prompt = create({});

const config: Config = {
    env: {
        vpc: false,
        app: {
            pushSnsArns: {
                android: '',
                ios: ''
            },
            secrets: {
                tokenKey: {
                    name: '',
                    arn: ''
                }
            },
        },
        chatbot: {
            arn: ''
        },
        debug: 'false',
        domain: {
            hostedzone: {
                id: '',
            },
            name: '',
            sub: {
                device: {
                    appid: 'mytaptrack',
                    cert: '',
                    name: '',
                    subdomain: '',
                    apikey: '',
                    path: '/prod'
                },
                api: {
                    cert: '',
                    name: '',
                    subdomain: '',
                    path: '/prod'
                },
                website: {
                    name: '',
                    subdomain: ''
                }
            }
        },
        region: {
            primary: '',
            regions: 'us-west-2,us-east-1'
        },
        sms: {
            origin: ""
        },
        stacks: {
            core: ''
        },
        student: {
            remove: {
                timeout: 90
            }
        },
        system: {
            email: ''
        },
        regional: {
            replication: "true",
            templates: {
                path: 'templates/'
            }
        }
    }
};

function promptYN(text: string, emptyValue: string = 'n') {
    let yn = prompt(`${text}  y/n (default: ${emptyValue}): `, emptyValue);
    if (yn == 'y') {
        return true;
    }
    return false;
}
function requirePrompt(text: string): string {
    let response;
    do {
        response = prompt(text)
    } while(!response);

    // Check if response is control + c
    if(response == '^C') {
        throw new Error('Cancel command sent');
    }
    return response;
}
async function getParamValue(name: string, ssm: SSMClient) {
    try {
        const param = await ssm.send(new GetParameterCommand({ Name: name }));
        return param.Parameter?.Value;
    } catch (err) {
        // Check for a resource not found error
        if (err.name == 'ParameterNotFound') {
            return undefined;
        }

        throw err;
    }
}
async function setParamValue(name: string, value: string, ssm: SSMClient) {
    await ssm.send(new PutParameterCommand({
        Name: name,
        Value: value,
        Type: 'String',
        Overwrite: true
    }));
}
async function createConfiguration() {
    let environment = prompt("Enter your environment: ", 'dev');
    config.env.region.primary = prompt("Enter your primary AWS region (default: us-west-2):", 'us-west-2');

    const s3Client = new S3Client({ region: config.env.region.primary });
    const ssmClient = new SSMClient({ region: config.env.region.primary });

    if (promptYN('For request logs, do you want to use a single S3 bucket?', 'y')) {
        if (promptYN('Do you want to use the account default bucket?', 'y')) {
            const existing = await getParamValue('/mytaptrack/regional/logging/bucket', ssmClient);
            if (existing) {
                config.env.regional.logging = {
                    bucket: existing
                }
            } else {
                const bucketName = `mtt-${process.env.AWS_ACCOUNT_ID}-${config.env.region.primary}-logs`;
                await s3Client.send(new CreateBucketCommand({
                    Bucket: bucketName
                }))
                await setParamValue('/mytaptrack/regional/logging/bucket', bucketName, ssmClient);
                config.env.regional.logging = {
                    bucket: bucketName
                }
            }
        }
    }
    if (!config.env.regional.logging) {
        console.log('In the AWS Console, create a bucket using S3 and copy the bucket name.');
        config.env.regional.logging = {
            bucket: prompt('Enter your bucket name: ')
        }
    }

    config.env.stacks.core = `mytaptrack-${environment}`;
    if (promptYN('Back up to a secondary region?')) {
        const secondary = prompt("Enter your secondary AWS region (default: us-east-1):", 'us-east-1');
        config.env.region.regions = `${config.env.region.primary},${secondary}`;
        config.env.regional.replication = 'true';
    } else {
        config.env.region.regions = config.env.region.primary;
        config.env.regional.replication = 'false';
    }

    if (promptYN("Are you using route53? ")) {
        config.env.domain.name = prompt("Enter your route53 domain name: ");
        console.log('Looking up hosted zone information');
        const route53 = new Route53Client({ region: config.env.region.primary });
        const hostedZones = await route53.send(new ListHostedZonesCommand());
        const zone = hostedZones.HostedZones.find(x => x.Name == config.env.domain.name + '.' && x.Config?.PrivateZone == false);
        if(!zone) {
            console.log('Hosted zone information:');
            console.log(hostedZones.HostedZones);
            // hostedZones.HostedZones.forEach(x => console.log(x.Name));
            console.log('Could not find the hosted zone for the domain provided.')
            return;
        }
        config.env.domain.hostedzone.id = zone.Id;
        config.env.domain.sub.api.subdomain = prompt("Enter your api subdomain (default: api): ", 'api');
        config.env.domain.sub.api.name = `${config.env.domain.sub.api.subdomain}.${config.env.domain.name}`;
        if(!promptYN('Do you already have a certificate manager certificate?')) {
            console.log('1. Log into the AWS console and navigate to Certificate Manager (https://us-west-2.console.aws.amazon.com/acm/home)');
            console.log('2. Click the button named "Request"');
            console.log('3. Type "*." then the domain name from route 53 to create a  wildcard certificate.');
            console.log('4. Leave "Request a public certificate" selected.');
            console.log('5. Use DNS validation.');
            console.log('6. Click the button named "Request".');
            console.log('7. Click the "Create records in Route53" button. Then click "Create records" on the next screen');
            console.log('8. Click the copy button next to the arn.');
        }
        config.env.domain.sub.api.cert = prompt("Enter your api cert arn (default: device): ", 'device');
        delete config.env.domain.sub.api.path;

        config.env.domain.sub.device.appid = prompt("Enter your device appid (default: mytaptrack): ", 'mytaptrack');
        config.env.domain.sub.device.subdomain = requirePrompt("Enter your device subdomain: ");
        config.env.domain.sub.device.name = `${config.env.domain.sub.device.subdomain}.${config.env.domain.name}`;
        config.env.domain.sub.device.cert = config.env.domain.sub.api.cert;
        delete config.env.domain.sub.device.path;

        config.env.domain.sub.website.subdomain = requirePrompt("Enter your website subdomain: ");
        config.env.domain.sub.website.name = `${config.env.domain.sub.website.subdomain}.${config.env.domain.name}`;
    } else {
        delete config.env.domain.name;
        delete config.env.domain.hostedzone;
        delete config.env.domain.sub.api;

        delete config.env.domain.sub.device.cert;
        delete config.env.domain.sub.device.subdomain;
        delete config.env.domain.sub.device.name;
        config.env.domain.sub.device.appid = prompt("Enter your device appid (mytaptrack): ", 'mytaptrack');

        delete config.env.domain.sub.website.subdomain;
        config.env.domain.sub.website.name = requirePrompt("Enter your website domain name: ");
    }

    if (promptYN('Did you want to use a custom app api key?', 'n')) {
        config.env.domain.sub.device.apikey = requirePrompt("Enter your device api key: ");
    } else {
        config.env.domain.sub.device.apikey = generateRandomSeed(40).toString();
    }

    // Check if push notifications should be used
    if (promptYN('Do you want to enable push notifications?')) {
        config.env.app.pushSnsArns.android = requirePrompt("Enter your android push sns arn: ");
        config.env.app.pushSnsArns.ios = requirePrompt("Enter your ios push sns arn: ");
    } else {
        delete config.env.app.pushSnsArns;
    }

    // Check if twilio should be used for sending text messages and if so get the origination phone number
    if (promptYN('Do you want to use twilio for sending text messages?')) {
        config.env.sms.origin = requirePrompt("Enter your twilio origination phone number: ");

        if (!config.env.sms.origin.startsWith("+")) {
            config.env.sms.origin = `+1${config.env.sms.origin}`;
        }
    }

    // Check if emails should be used and if so get the system email address to use
    if (promptYN('Do you want to use emails?')) {
        config.env.system.email = requirePrompt("Enter your system email address: ");
    } else {
        delete config.env.system
    }

    // Check if chatbot should be used and if so get the chatbot arn
    if (promptYN('Do you want to use chatbot?')) {
        config.env.chatbot.arn = requirePrompt("Enter your chatbot arn: ");
    } else {
        delete config.env.chatbot;
    }

    // Get template bucket path
    config.env.regional.templates.path = prompt("Enter your template bucket path (templates/): ", 'templates/');

    // Check how long a student should be kept if the student has no team members
    config.env.student.remove.timeout = parseInt(prompt("Enter the number of days to keep a student if they have no team members (default: 90): ", '90'));

    if (promptYN('Do you have an encryption key configured already?')) {
        // Get the token key name and arn
        console.log(`
        This section will configure your app security encryption for identifying information
        sent to the mytaptrack app. 

        If you don't have an encryption key seed already created
        log into your AWS account and go to the Parameter Store (https://console.aws.amazon.com/systems-manager/parameters).
        Create a parameter with a unique name as a secure string parameter and copy its key and arn.
            `)
        config.env.app.secrets.tokenKey.name = prompt("Enter your app parameter store encryption key name (/regional/token/key): ", '/regional/token/key');
    } else {
        console.log('Creating encryption seed at /regional/token/key to be used to encrypt student information');
        config.env.app.secrets.tokenKey.name = '/regional/token/key';
        const value = await getParamValue(config.env.app.secrets.tokenKey.name, ssmClient);
        if (!value) {
            const key = await ssmClient.send(new PutParameterCommand({
                Name: config.env.app.secrets.tokenKey.name,
                Type: 'SecureString',
                Value: generateRandomSeed(20).toString(),
                Overwrite: false
            }));
        }
    }

    const tokenParam = await ssmClient.send(new GetParameterCommand({ Name: config.env.app.secrets.tokenKey.name }));
    config.env.app.secrets.tokenKey.arn = tokenParam.Parameter!.ARN!;

    if (promptYN('Do you want to configure system tests?')) {
        const admin_username = requirePrompt('Administrator email: ');
        const admin_password = prompt('Administrator password: ', undefined, { echo: '' });
        const admin_name = prompt('Administrator name (Testing Admin): ', 'Testing Admin');

        const nonadmin_username = requirePrompt('Non-admin email: ');
        const nonadmin_password = prompt('Non-admin password: ', undefined, { echo: '' });
        const nonadmin_name = prompt('Non-admin name (Testing user): ', 'Testing User');

        config.env.testing = {
            admin: {
                email: admin_username,
                password: admin_password ?? generateRandomSeed(10),
                name: admin_name
            },
            nonadmin: {
                email: nonadmin_username,
                password: nonadmin_password ?? generateRandomSeed(10),
                name: nonadmin_name
            }
        };
    }

    if (promptYN('Do you want to configure encryption?')) {
        console.log("You will need to encryption keys, one for PII and one for Logs. This is designed to allow support log access while not exposing PII information.");
        console.log('To create an encryption key log into the aws console and navigate to KMS. Create two keys and give them the alias "mytaptrack/pii" and "mytaptrack/logs"');
        config.env.encryption = {
            piiAlias: prompt("Enter your encryption key alias (default: mytaptrack/pii):", "mytaptrack/pii"),
            logAlias: prompt("Enter your logs encryption key alias (default: mytaptrack/logs):", "mytaptrack/logs")
        };
    }

    // Check if debug should be enabled
    if (promptYN('Do you want to enable debug?')) {
        config.env.debug = 'true';
    }

    const content = yml.stringify(config);

    fs.writeFileSync(`../config/${environment}.yml`, content, 'utf8');
    console.log(`Wrote ${environment}.yml`);
}

createConfiguration()
