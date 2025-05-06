import { MttContext } from "@mytaptrack/cdk";
import { ConfigFile } from "@mytaptrack/cdk/src/config-file";
import { CfnResource, NestedStack, NestedStackProps, Tags } from "aws-cdk-lib";
import { LoggingLevel, SlackChannelConfiguration } from "aws-cdk-lib/aws-chatbot";
import { PolicyDocument, PolicyStatement, Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { Topic } from "aws-cdk-lib/aws-sns";
import { Construct } from "constructs";

export interface SecurityStackProps extends NestedStackProps {
    coreStack: string;
    environment: string;
    enableSlack?: boolean;
}

export class SecurityStack extends NestedStack {
    constructor(scope: Construct, id: string, props: SecurityStackProps) {
        super(scope, id, props);
        const context = new MttContext(this, `${props.coreStack}-security`, 'core-security-stack');

        const config = (new ConfigFile('../config', props.environment)).config;

        const chatbotRole = new Role(this, 'EnvironmentChatbotRole', {
            assumedBy: new ServicePrincipal('chatbot.amazonaws.com'),
            inlinePolicies: {
                securityAlert: new PolicyDocument({
                    statements: [
                        new PolicyStatement({
                            actions: [
                                'cloudwatch:Describe*',
                                'cloudwatch:Get*',
                                'cloudwatch:List*',
                                'sns:*'
                            ],
                            resources: ['*']
                        }),
                        new PolicyStatement({
                            actions: [
                                'kms:Decrypt',
                                'kms:Encrypt',
                                'kms:Generate*'
                            ],
                            resources: [
                                `arn:aws:kms:${this.region}:${this.account}:alias/aws/sns`
                            ]
                        })
                    ]
                })
            }
        });
        (chatbotRole.node.defaultChild as CfnResource).overrideLogicalId('EnvironmentChatbotRole');

        const chatbotSNS = new Topic(this, 'EnvironmentChatbotSNS', {
            topicName: `${props.coreStack}-security-alert`,
        });
        Tags.of(chatbotSNS).add('SNSDataType', 'Support');
        (chatbotSNS.node.defaultChild as CfnResource).overrideLogicalId('EnvironmentChatbotSNS');

        if(props.enableSlack && config.env?.regional?.slack?.security?.channel?.id && config.slack?.workspace?.id) {
            const channel = new SlackChannelConfiguration(this, 'EnvironmentChatbot', {
                slackChannelConfigurationName: `${props.coreStack}-security-alerts-${this.region}`,
                role: chatbotRole,
                loggingLevel: LoggingLevel.ERROR,
                slackChannelId: config.env.regional.slack.security.channel.id,
                slackWorkspaceId: config.slack.workspace.id,
                notificationTopics: [
                    chatbotSNS
                ]
            });
            (channel.node.defaultChild as CfnResource).overrideLogicalId('EnvironmentChatbot');
        }
    }
}