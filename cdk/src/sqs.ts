import { Queue, QueueEncryption } from "aws-cdk-lib/aws-sqs";
import { IMttContext } from "./mtt-context";
import { IKey } from "aws-cdk-lib/aws-kms";
import { CfnResource, Duration, Tags } from "aws-cdk-lib";
import { EnvironmentEnabled } from ".";

export interface MttSqsProps {
    id: string;
    name?: string;
    fifo?: boolean;
    kmsKey?: IKey;
    retentionPeriod?: Duration;
    visibilityTimeout?: Duration;
    envVariable?: string;
    contentBasedDeduplication?: boolean;
    hasPhi?: boolean;
};

export class MttSqs implements EnvironmentEnabled {
    readonly queue: Queue;
    readonly kmsKey: IKey;
    readonly hasPhi: boolean;
    readonly timeout: Duration;

    public readonly envVariable: string;
    get envVariableValue() { return this.queue.queueUrl; }
    readonly envSetFunction = false;
    setEnvironment() {}

    constructor(context: IMttContext, props: MttSqsProps) {
        this.kmsKey = props.kmsKey ?? context.kmsKey,
        this.hasPhi = props.hasPhi? true : false;
        this.queue = new Queue(context.scope, props.id, {
            queueName: props.name,
            fifo: props.fifo,
            encryption: this.kmsKey? QueueEncryption.KMS : QueueEncryption.SQS_MANAGED,
            encryptionMasterKey: this.kmsKey,
            retentionPeriod: props.retentionPeriod ?? Duration.days(2),
            visibilityTimeout: props.visibilityTimeout ?? Duration.seconds(30),
            enforceSSL: true,
            contentBasedDeduplication: props.contentBasedDeduplication,
        });

        this.timeout = props.visibilityTimeout;

        this.envVariable = props.envVariable;
        (this.queue.node.defaultChild as CfnResource).overrideLogicalId(props.id);
        if(this.hasPhi) {
            Tags.of(this.queue).add('PHI', 'true');
        }
    }
}
