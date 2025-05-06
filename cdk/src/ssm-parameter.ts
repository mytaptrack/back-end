import { IGrantable, PolicyStatement } from "aws-cdk-lib/aws-iam";
import { EnvironmentEnabled, MttContext } from ".";
import { Fn } from "aws-cdk-lib";

export interface MttParameterParams {
    name: string;
    envVariable: string;
}

export enum MttParameterAccess {
    read
}

export class MttParameter implements EnvironmentEnabled {
    private _name: string;
    private _envVariable: string;
    get name() { return this._name; }
    get envVariable() { return this._envVariable; }
    get envVariableValue() { return this.name; }
    readonly envSetFunction = false;
    setEnvironment() {}
    readonly hasPhi = false;
    
    constructor(private context: MttContext, params: MttParameterParams) {
        this._name = params.name;
        this._envVariable = params.envVariable;
    }

    grantRead(grantee: IGrantable) {
        grantee.grantPrincipal.addToPrincipalPolicy(new PolicyStatement({
            actions: ['ssm:GetParameter'],
            resources: [
                `arn:aws:ssm:${this.context.region}:${this.context.accountId}:parameter${this.name}`
            ]
        }));
    }
}