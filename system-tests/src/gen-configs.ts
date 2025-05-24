#!/usr/bin/env node
import * as yml from 'yaml';
import * as fs from 'fs';
import { Config } from '@mytaptrack/cdk';
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import crypto from 'crypto';

function generateApiKey(length = 32) {
  return crypto.randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length);
}

const ssm = new SSMClient({ });

async function getParameter(name: string) {
    const result = await ssm.send(new GetParameterCommand({ Name: name }));
    return result.Parameter?.Value;
}

async function configureEnvironment(path: string) {
    const config: Config = yml.parse(fs.readFileSync(path, 'utf8'));
    config.env.app.secrets.tokenKey.arn = `arn:aws:ssm:${process.env.AWS_REGION}:${process.env.AWS_ACCOUNT_ID}:parameter${config.env.app.secrets.tokenKey.name}`;
    
    if(config.env.domain.hostedzone) {
        config.env.domain.hostedzone.id = await getParameter('/dns/hosted-zone/id');
        config.env.domain.name = await getParameter('/dns/hosted-zone/name');
        config.env.domain.sub.api.cert = await getParameter('/dns/hosted-zone/cert');
        config.env.domain.sub.api.name = `${config.env.domain.sub.api.subdomain}.${config.env.domain.name}`;
        config.env.domain.sub.device.cert = config.env.domain.sub.api.cert;
        config.env.domain.sub.device.name = `${config.env.domain.sub.device.subdomain}.${config.env.domain.name}`;
    }
    config.env.domain.sub.device.apikey = generateApiKey();
    config.env.testing.admin.password = generateApiKey();
    config.env.testing.nonadmin.password = generateApiKey();

    fs.writeFileSync('../' + path, yml.stringify(config));
}

configureEnvironment('config/dev-min.yml');
configureEnvironment('config/dev-dns.yml');
