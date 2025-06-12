import { IUserPool, UserPool, UserPoolClient, UserPoolClientOptions, UserPoolProps } from "aws-cdk-lib/aws-cognito";
import { IGrantable } from "aws-cdk-lib/aws-iam";
import { EnvironmentEnabled, MttContext } from ".";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { IdentityPool, UserPoolAuthenticationProvider } from "aws-cdk-lib/aws-cognito-identitypool";

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
    private _hasCognito = false;

    constructor(private context: MttContext, private props: MttUserPoolProps) {
        console.log('MttCognito Props', props);
        this.envVariable = props.envVariable;
        if(props.userPool) {
            this._hasCognito = true;
            this.userPool = props.userPool;
            return;
        }

        this.userPool = new UserPool(context.scope, props.id, props);
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

    setDomain(namePrefix?: string) {
        // Create a cognito domain
        const domain = this.userPool.addDomain(`${this.props.id}-domain`, {
            cognitoDomain: {
                domainPrefix: namePrefix ?? `${this.context.stackName.toLowerCase()}-${this.context.accountId}`
            }
        });

        this.context.setParameter(true, 'cognito/domain', domain.domainName);
    }

    addClient(id: string, options: UserPoolClientOptions) {
        return this.userPool.addClient(id, options);
    }

    addIdPool(client: UserPoolClient) {
        console.log('Adding identity pool', this._hasCognito);
        if(this._hasCognito) {
            console.log('Getting existing identity pool', this.props.id)
            return IdentityPool.fromIdentityPoolArn(this.context.scope, `${this.props.id}-idpool`, this.context.getParameter(`/${this.context.environment}/regional/calc/cognito/idpoolid`).stringValue);
        }
        
        const idPool = new IdentityPool(this.context.scope, `${this.props.id}-idpool`, {
            allowUnauthenticatedIdentities: false,
            identityPoolName: `${this.props.userPoolName ?? this.props.id}-idpool`
        });
        idPool.addUserPoolAuthentication(new UserPoolAuthenticationProvider({
            userPool: this.userPool,
            userPoolClient: client
        }));
        return idPool;
    }
}