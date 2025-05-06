import { IUserPool, UserPool, UserPoolClientOptions, UserPoolProps } from "aws-cdk-lib/aws-cognito";
import { IGrantable } from "aws-cdk-lib/aws-iam";
import { EnvironmentEnabled, MttContext } from ".";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";

export enum CognitoAccess {
    listUsers,
    administrateGroups,
    administrateUsers
};

export interface MttUserPoolProps extends UserPoolProps {
    id?: string;
    userPool?: IUserPool;
    envVariable: string;
}

export class MttCognito implements EnvironmentEnabled {
    static fromUserPoolId(context: MttContext, userPool: IUserPool, props: MttUserPoolProps) {
        return new MttCognito(context, { userPool, ...props })
    }

    userPool: IUserPool;
    envVariable: string;
    get envVariableValue() { return this.userPool.userPoolId; }
    get userPoolId() { return this.userPool.userPoolId; }
    readonly envSetFunction = false;
    setEnvironment() {}
    readonly hasPhi = false;

    constructor(private context: MttContext, props: MttUserPoolProps) {
        console.log('MttCognito Props', props);
        this.envVariable = props.envVariable;
        if(props.userPool) {
            this.userPool = props.userPool;
            return;
        }
    }

    grant(grantee: IGrantable, access: CognitoAccess) {
        if(access == CognitoAccess.listUsers) {
            this.userPool.grant(grantee, 'cognito-idp:ListUsers');
        } else if (access == CognitoAccess.administrateGroups) {
            this.userPool.grant(grantee, 
                'cognito-idp:ListUsers',
                'cognito-idp:ListUsersInGroup',
                'cognito-idp:AdminAddUserToGroup',
                'cognito-idp:CreateGroup',
                'cognito-idp:GetGroup'
            );
        } else if (access == CognitoAccess.administrateUsers) {
            this.userPool.grant(grantee, 'cognito-idp:ListUsers', 'cognito-idp:AdminGetUser');
        }
    }

    addClient(id: string, options: UserPoolClientOptions) {
        return this.userPool.addClient(id, options);
    }
}