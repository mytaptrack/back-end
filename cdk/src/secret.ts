import { ISecret, Secret } from "aws-cdk-lib/aws-secretsmanager";
import { IGrantable } from "aws-cdk-lib/aws-iam";
import { EnvironmentEnabled, MttContext } from ".";
import { SecretValue } from "aws-cdk-lib";

export interface MttSecretProps {
    id: string;
    secretName: string;
    description?: string;
    envVariable: string;
    fromExisting?: boolean;
}

export enum MTTSecretAccess {
    read,
    readWrite
}

export class MttSecret implements EnvironmentEnabled {
    static fromName(context: MttContext, secretName: string, envVariable: string) {
        return new MttSecret(context, {
            id: secretName.replace(/\//g, ''),
            secretName: secretName,
            envVariable,
            fromExisting: true
        });
    }

    private _secret: ISecret;

    get arn() { return this._secret.secretArn; }
    get name() { return this._secret.secretName; }
    get envVariable() { return this.props.envVariable; }
    get envVariableValue() { return this.arn; }
    readonly envSetFunction = false;
    setEnvironment() {}
    readonly hasPhi = false;

    constructor(context: MttContext, private props: MttSecretProps) {
        if(props.fromExisting) {
            this._secret = Secret.fromSecretNameV2(context.scope, props.id, props.secretName);
        } else {
            this._secret = new Secret(context.scope, props.id, {
                secretName: `${context.environment}/${props.secretName}`,
                description: props.description,
                secretStringValue: SecretValue.unsafePlainText('REPLACE_ME')
            });    
        }
    }

    grant(grantee: IGrantable, access: MTTSecretAccess) {
        if (access === MTTSecretAccess.read) {
            this._secret.grantRead(grantee);
        } else {
            this._secret.grantRead(grantee);
            this._secret.grantWrite(grantee);
        }
    }
}