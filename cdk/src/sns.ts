import { Topic } from "aws-cdk-lib/aws-sns";
import { IMttContext } from ".";
import { CfnResource, Tags } from "aws-cdk-lib";

export interface MttSnsProps {
    id: string;
}
export class MttSns {
    public readonly sns: Topic;
    constructor(context: IMttContext, props: MttSnsProps) {
        const sns = new Topic(context.scope, props.id, {
            topicName: `${context.stackName}-security-alert`,
        });
        Tags.of(sns).add('SNSDataType', 'Support');
        (sns.node.defaultChild as CfnResource).overrideLogicalId(props.id);
        this.sns = sns;
    }
}