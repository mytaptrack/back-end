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

let environment = prompt("Enter your environment: ", 'dev');
config.env.region.primary = prompt("Enter your primary AWS region (us-west-2):", 'us-west-2');
config.env.stacks.core = `mytaptrack-${environment}`;
if(prompt('Back up to a secondary region? y/n: ') != 'n') {
    const secondary = prompt("Enter your secondary AWS region (us-east-1):", 'us-east-1');
    config.env.region.regions = `${config.region.primary},${secondary}`;
    config.env.regional.replication = 'true';
} else {
    config.env.region.regions = config.env.region.primary;
    config.env.regional.replication = 'false';
}

let route53 = prompt("Are you using route53 (y/n): ", 'n');
if(route53 != 'n') {
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
if(prompt('Do you want to enable push notifications? y/n: ') != 'n') {
    config.env.app.pushSnsArns.android = prompt("Enter your android push sns arn: ");
    config.env.app.pushSnsArns.ios = prompt("Enter your ios push sns arn: ");
} else {
    delete config.env.app.pushSnsArns;
}

// Check if twilio should be used for sending text messages and if so get the origination phone number
if(prompt('Do you want to use twilio for sending text messages? y/n: ') != 'n') {
    config.env.sms.origin = prompt("Enter your twilio origination phone number: ");

    if(!config.env.sms.origin.startsWith("+")) {
        config.env.sms.origin = `+1${config.env.sms.origin}`;
    }
}

// Check if emails should be used and if so get the system email address to use
if(prompt('Do you want to use emails? y/n: ') != 'n') {
    config.env.system.email = prompt("Enter your system email address: ");
} else {
    delete config.env.system
}

// Check if chatbot should be used and if so get the chatbot arn
if(prompt('Do you want to use chatbot? y/n: ') != 'n') {
    config.env.chatbot.arn = prompt("Enter your chatbot arn: ");
} else {
    delete config.env.chatbot;
}

// Get template bucket path
config.env.regional.templates.path = prompt("Enter your template bucket path (templates/): ", 'templates/');

// Check how long a student should be kept if the student has no team members
config.env.student.remove.timeout = parseInt(prompt("Enter the number of days to keep a student if they have no team members: ", '90'));

// Get the token key name and arn
config.env.app.tokenKey = prompt("Enter your app encryption key: ");

// Check if debug should be enabled
if(prompt('Do you want to enable debug? y/n: ') != 'n') {
    config.env.debug = 'true';
}

const content = yml.stringify(config);

fs.writeFileSync(`../config/${environment}.yml`, content, 'utf8');
console.log(`Wrote ${environment}.yml`);
