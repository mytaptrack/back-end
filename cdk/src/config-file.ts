import * as yml from 'yaml';
import * as fs from 'fs';
import * as path from 'path';
import * as _ from 'lodash';

export interface TestUserConfig {
    email: string;
    password: string;
    name: string;
}

export interface Config {
    env: {
        app: {
            secrets: {
                tokenKey: {
                    name: string;
                    arn: string;
                }
            }
            pushSnsArns?: {
                android: string;
                ios: string;
            }
        };
        chatbot?: {
            arn: string;
        };
        debug: string;
        domain: {
            name: string;
            hostedzone: {
                id: string;
            },
            sub: {
                api: {
                    subdomain: string;
                    name: string;
                    cert: string;
                    path?: string;
                },
                device: {
                    appid: string;
                    subdomain?: string;
                    name?: string;
                    apikey: string;
                    cert?: string;
                    path?: string;
                },
                website?: {
                    behavior?: {
                        subdomain?: string;
                        name: string;
                        cert?: string;
                    },
                    manage?: {
                        subdomain?: string;
                        name: string;
                        cert?: string;
                    },
                    name: string;
                    public?: boolean;
                };
            }
        },
        region: {
            primary: string;
            regions: string;
        },
        sms: {
            secret: string;
            arn: string;
        },
        stacks: {
            core: string;
        },
        student: {
            remove: {
                timeout: number;
            }
        },
        system: {
            email: string;
        },
        regional: {
            logging?: {
                bucket: string;
            }
            replication: string;
            templates: {
                path: string;
            },
            ses?: boolean;
            slack?: {
                security?: {
                    channel?: {
                        id: string;
                    }
                }
            }
        },
        testing?: {
            admin: TestUserConfig;
            nonadmin: TestUserConfig;
        },
        encryption?: {
            piiAlias?: string;
            logAlias?: string;
        },
        lumigo?: {
            tokenParam: string;
            domainScrubbing?: string;
            attributeMasking?: string;
        },
        vpc: boolean;
    },
    slack?: {
        workspace: {
            id: string;
        }
    },
    twilio?: {
        secret: {
            name: string;
            arn: string;
        }
    }
}

export class ConfigFile {
    config: Config;

    constructor(configDir: string, environment: string) {
        this.config = {} as Config;
        const configPath = path.join(configDir, 'config.yml');
        if(fs.existsSync(configPath)) {
            const envConfig = this.extract(configPath);
            this.config = envConfig;
        }

        const envPath = path.join(configDir, `${environment}.yml`)
        if(fs.existsSync(envPath)) {
            const envConfig = this.extract(envPath);
            this.config = _.merge(this.config, envConfig);
        }

        const regionPath = path.join(configDir, `${environment}.${process.env.AWS_REGION}.yml`);
        if(fs.existsSync(path.join(regionPath))) {
            const regionConfig = this.extract(regionPath);

            this.config = _.merge(this.config, regionConfig)
        }
    }

    private extract(path: string) {
        const confData = fs.readFileSync(path, 'utf-8');
        const envConfig = yml.parse(confData);

        return envConfig;
    }
}