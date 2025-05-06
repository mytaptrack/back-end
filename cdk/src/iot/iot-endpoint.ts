import { MttContext } from '..';
import { CfnDomainConfiguration, CfnTopicRule } from 'aws-cdk-lib/aws-iot';
import { ARecord, RecordTarget } from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';

export interface IoTEndpointProps {
    id: string;
    subdomain: string;
    domain: string;
    certArn: string;
}

export class MttIoTEndpoint {
    constructor(context: MttContext, props: IoTEndpointProps) {
        new CfnDomainConfiguration(context.scope, 'iot-endpoint', {
            domainConfigurationName: props.domain,
            serverCertificateArns: [props.certArn],
        });
    }
}