import { IGrantable, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { MttContext, EnvironmentEnabled } from '.';

export interface MttBedrockModelProps {
    model: 'ai21.j2-mid-v1';
    envVariable: string;
}

export enum MttBedrockModelAccess {
    read
}

export class MttBedrockModel implements EnvironmentEnabled {
    get envVariable() { return this.props.envVariable; }
    get envVariableValue() { return this.props.model; }
    readonly envSetFunction = false;
    readonly hasPhi = false;

    constructor(context: MttContext, private props: MttBedrockModelProps) {
        
    }

    setEnvironment() {}

    grant(grantee: IGrantable, access: MttBedrockModelAccess) {
        grantee.grantPrincipal.addToPrincipalPolicy(new PolicyStatement({
            actions: [
                'bedrock:InvokeModel',
            ],
            resources: ['*']
        }));
    }
}