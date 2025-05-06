import { CfnAuthorizer, CfnPolicy, CfnThingGroup, CfnThingType, CfnTopicRule } from 'aws-cdk-lib/aws-iot';
import { MttContext, MttFunction, MttFunctionProps } from '..';
import { Effect, ServicePrincipal } from 'aws-cdk-lib/aws-iam';

export interface MttIoTThingProps {
    id: string;
    name: string;
    thingTypeProperties: {
        thingTypeDescription: string;
        searchableAttributes: string[];
    };
}

export interface MttIoTRuleFunctionProps extends MttFunctionProps {
    ruleName: string;
    topicRulePayload: {
        ruleDisabled: boolean;
        sql: string;
    }
}

export interface MttIoTPolicy {
    id: string;
    policyName?: string;
    thingAttribute: string;
}

export class MttIoTThing {
    private _context: MttContext;
    thing: CfnThingType;

    get name() { return this.thing.thingTypeName; }
    get arn() { return this.thing.attrArn;  }

    constructor(context: MttContext, props: MttIoTThingProps) {
        this.thing = new CfnThingType(context.scope, props.id, {
            thingTypeName: props.name ?? props.id,
            thingTypeProperties: props.thingTypeProperties
        });
        this._context = context;
    }

    addAuthorizer(props: MttFunctionProps) {
        const func = new MttFunction(this._context, props);

        new CfnAuthorizer(this._context.scope, props.id + 'auth', {
            authorizerName: props.name ?? props.id,
            authorizerFunctionArn: func.arn
        });
    }

    addPolicy(props: MttIoTPolicy) {
        return new CfnPolicy(this._context.scope, props.id, {
            policyName: props.policyName ?? props.id,
            policyDocument: {
                Version: '2012-10-17',
                Statement: [
                    {
                        Effect: 'Allow',
                        Action: [
                            'iot:Connect',
                        ],
                        Resource: '*'
                    },
                    {
                        Effect: 'Allow',
                        Action: [
                            'iot:Publish',
                            'iot:Subscribe'
                        ],
                        Resource: `arn:aws:iot:${this._context.region}:${this._context.accountId}:topic/${this.thing.thingTypeName}/` + '${iot:Connection.Thing.Attributes[' + props.thingAttribute + ']}/*'
                    }
                ]
            }
        });
    }

    addGroup(groupName: string, description: string) {
        new CfnThingGroup(this._context.scope, `${groupName}ThingGroup`, {
            thingGroupName: groupName,
            thingGroupProperties: {
                thingGroupDescription: description
            }
        });
    }

    addLambdaHander(props: MttIoTRuleFunctionProps) {
        const func = new MttFunction(this._context, props);

        new CfnTopicRule(this._context.scope, props.id + 'rule', {
            ruleName: props.ruleName,
            topicRulePayload: {
                ...props.topicRulePayload,
                actions: [
                    {
                        lambda: {
                            functionArn: func.arn
                        }
                    }
                ]
            }
        });
        
        func.lambda.addPermission('IoTPermission', {
            action: 'lambda:InvokeFunction',
            principal: new ServicePrincipal('iot.amazonaws.com')
        });
        return func;
    }
}