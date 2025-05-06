import { 
    AccountPrincipal, Effect, PolicyDocument, PolicyStatement, PolicyStatementProps
} from "aws-cdk-lib/aws-iam";
import { IMttContext } from "./mtt-context";
import { Alias, CfnKey, IKey, Key } from "aws-cdk-lib/aws-kms";
import { CfnResource, Fn, Tags } from "aws-cdk-lib";

export interface MttKmsKeyExistingProps {
    id: string;
    existingArn: string;
}

export interface MttKmsKeyNewProps { 
    id: string; 
    description: string;
    statements: PolicyStatementProps[];
    multiRegion?: boolean;
}

export class MttKmsKey {
    static fromArn(context: IMttContext, props: MttKmsKeyExistingProps) {
        return new MttKmsKey(context, props);
    }

    public readonly key: IKey;
    public get arn() {
        return this.key.keyArn;
    }

    constructor(private context: IMttContext, props: MttKmsKeyNewProps | MttKmsKeyExistingProps) {
        let kmsKey: IKey;
        if((props as MttKmsKeyExistingProps).existingArn) {
            kmsKey = Key.fromKeyArn(context.scope, props.id, (props as MttKmsKeyExistingProps).existingArn);
        } else {
            const nprops = props as MttKmsKeyNewProps;
            if(nprops.multiRegion) {
                const key = new CfnKey(context.scope, props.id, {
                    description: nprops.description,
                    enableKeyRotation: true,
                    multiRegion: true,
                    enabled: true,
                    keyPolicy: {
                        Version: "2012-10-17",
                        Id: 'key-default-1',
                        Statement: [
                            ...nprops.statements.map(s => ({
                                Sid: s.sid,
                                Effect: s.effect ?? Effect.ALLOW,
                                Principal: {
                                    Service: s.principals.map(x => x.policyFragment.principalJson.Service[0])
                                },
                                Action: s.actions,
                                Resource: s.resources
                            })),
                            {
                                Sid: 'Allow modification of the key',
                                Effect: Effect.ALLOW,
                                Principal: {
                                    AWS: `arn:aws:iam::${this.context.accountId}:root`
                                },
                                Action: ['kms:*'],
                                Resource: ['*']
                            }
                        ]
                    },
                    // tags: [
                    //     { key: 'environment', value: context.environment }
                    // ]
                });
                kmsKey = Key.fromKeyArn(context.scope, props.id + 'ikey', key.attrArn);
                this.key = kmsKey;
                return;
            } else {
                kmsKey = new Key(context.scope, props.id, {
                    description: nprops.description,
                    enableKeyRotation: true,
                    policy: new PolicyDocument({
                        statements: [
                            ...nprops.statements.map(s => 
                                new PolicyStatement({
                                    sid: s.sid,
                                    effect: s.effect ?? Effect.ALLOW,
                                    principals: s.principals,
                                    actions: s.actions,
                                    resources: s.resources
                                })),
                            new PolicyStatement({
                                sid: 'Allow modification of the key',
                                effect: Effect.ALLOW,
                                principals: [new AccountPrincipal(Fn.ref('AWS::AccountId'))],
                                actions: ['kms:Encrypt', 'kms:Decrypt'],
                                resources: ['*']
                            }),
                        ]
                    })
                });
                Tags.of(kmsKey).add('environment', context.environment);
            }
        }
        (kmsKey.node.defaultChild as CfnResource).overrideLogicalId(props.id);
        this.key = kmsKey;
    }

    createAlias(id: string, alias: string) {
        const retval = new Alias(this.context.scope, id, {
            aliasName: `alias/${alias}`,
            targetKey: this.key
        });
        (retval.node.defaultChild as CfnResource).overrideLogicalId(id);

        return retval;
    }
}