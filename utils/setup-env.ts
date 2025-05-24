#!/usr/bin/env node
import { default as create } from 'prompt-sync';
import * as yml from 'yaml';
import * as fs from 'fs';
import { Config } from '@mytaptrack/cdk';

const prompt = create({});

const config: Config = {
    env: {
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
    let yn = prompt(`${text}  y/n: `, emptyValue);
    if(yn == 'y') {
        return true;
    }
    return false;
}

let environment = prompt("Enter your environment: ", 'dev');
config.env.region.primary = prompt("Enter your primary AWS region (us-west-2):", 'us-west-2');
config.env.stacks.core = `mytaptrack-${environment}`;
if(promptYN('Back up to a secondary region?')) {
    const secondary = prompt("Enter your secondary AWS region (us-east-1):", 'us-east-1');
    config.env.region.regions = `${config.env.region.primary},${secondary}`;
    config.env.regional.replication = 'true';
} else {
    config.env.region.regions = config.env.region.primary;
    config.env.regional.replication = 'false';
}

if(promptYN("Are you using route53? ")) {
    config.env.domain.name = prompt("Enter your route53 domain name: ");
    config.env.domain.hostedzone.id = prompt("Enter your route53 hosted zone id: ");
    config.env.domain.sub.api.subdomain = prompt("Enter your api subdomain: ");
    config.env.domain.sub.api.name = `${config.env.domain.sub.api.subdomain}.${config.env.domain.name}`;
    config.env.domain.sub.api.cert = prompt("Enter your api cert arn: ");
    delete config.env.domain.sub.api.path;

    config.env.domain.sub.device.appid = prompt("Enter your device appid (mytaptrack): ", 'mytaptrack');
    config.env.domain.sub.device.subdomain = prompt("Enter your device subdomain: ");
    config.env.domain.sub.device.name = `${config.env.domain.sub.device.subdomain}.${config.env.domain.name}`;
    config.env.domain.sub.device.cert = prompt("Enter your device cert arn: ");
    config.env.domain.sub.device.apikey = prompt("Enter your device api key: ");
    delete config.env.domain.sub.device.path;

    config.env.domain.sub.website.subdomain = prompt("Enter your website subdomain: ");
    config.env.domain.sub.website.name = `${config.env.domain.sub.website.subdomain}.${config.env.domain.name}`;
} else {
    delete config.env.domain.name;
    delete config.env.domain.hostedzone;
    delete config.env.domain.sub.api;

    delete config.env.domain.sub.device.cert;
    delete config.env.domain.sub.device.subdomain;
    delete config.env.domain.sub.device.name;
    config.env.domain.sub.device.appid = prompt("Enter your device appid (mytaptrack): ", 'mytaptrack');
    config.env.domain.sub.device.apikey = prompt("Enter your device api key: ");

    delete config.env.domain.sub.website.subdomain;
    config.env.domain.sub.website.name = prompt("Enter your website domain name: ");
}

// Check if push notifications should be used
if(promptYN('Do you want to enable push notifications?')) {
    config.env.app.pushSnsArns.android = prompt("Enter your android push sns arn: ");
    config.env.app.pushSnsArns.ios = prompt("Enter your ios push sns arn: ");
} else {
    delete config.env.app.pushSnsArns;
}

// Check if twilio should be used for sending text messages and if so get the origination phone number
if(promptYN('Do you want to use twilio for sending text messages?')) {
    config.env.sms.origin = prompt("Enter your twilio origination phone number: ");

    if(!config.env.sms.origin.startsWith("+")) {
        config.env.sms.origin = `+1${config.env.sms.origin}`;
    }
}

// Check if emails should be used and if so get the system email address to use
if(promptYN('Do you want to use emails?')) {
    config.env.system.email = prompt("Enter your system email address: ");
} else {
    delete config.env.system
}

// Check if chatbot should be used and if so get the chatbot arn
if(promptYN('Do you want to use chatbot?')) {
    config.env.chatbot.arn = prompt("Enter your chatbot arn: ");
} else {
    delete config.env.chatbot;
}

// Get template bucket path
config.env.regional.templates.path = prompt("Enter your template bucket path (templates/): ", 'templates/');

// Check how long a student should be kept if the student has no team members
config.env.student.remove.timeout = parseInt(prompt("Enter the number of days to keep a student if they have no team members: ", '90'));

// Get the token key name and arn
console.log(`
This section will configure your app security encryption for identifying information
sent to the mytaptrack app. 

If you don't have an encryption key seed already created
log into your AWS account and go to the Parameter Store (https://console.aws.amazon.com/systems-manager/parameters).
Create a parameter with a unique name as a secure string parameter and copy its key and arn.
    `)
config.env.app.secrets.tokenKey.name = prompt("Enter your app encryption key name: ");
config.env.app.secrets.tokenKey.arn = prompt("Enter your app encryption key arn: ");

if(promptYN('Do you want to configure system tests?')) {
    const admin_username = prompt('Administrator email: ');
    const admin_password = prompt('Administrator password: ', undefined, { echo: '' });
    const admin_name = prompt('Administrator name (Testing Admin): ', 'Testing Admin');

    const nonadmin_username = prompt('Non-admin email: ');
    const nonadmin_password = prompt('Non-admin password: ', undefined, { echo: '' });
    const nonadmin_name = prompt('Non-admin name (Testing user): ', 'Testing User');

    config.env.testing = {
        admin: {
            email: admin_username,
            password: admin_password,
            name: admin_name
        },
        nonadmin: {
            email: nonadmin_username,
            password: nonadmin_password,
            name: nonadmin_name
        }
    };
}

if(promptYN('Do you want to configure encryption?')) {
    console.log("You will need to encryption keys, one for PII and one for Logs. This is designed to allow support log access while not exposing PII information.");
    console.log('To create an encryption key log into the aws console and navigate to KMS. Create two keys and give them the alias "mytaptrack/pii" and "mytaptrack/logs"');
    config.env.encryption = {
        piiAlias: prompt("Enter your encryption key alias (mytaptrack/pii):", "mytaptrack/pii"),
        logAlias: prompt("Enter your logs encryption key alias (mytaptrack/logs):", "mytaptrack/logs")
    };
}

// Check if debug should be enabled
if(promptYN('Do you want to enable debug?')) {
    config.env.debug = 'true';
}

const content = yml.stringify(config);

fs.writeFileSync(`../config/${environment}.yml`, content, 'utf8');
console.log(`Wrote ${environment}.yml`);
