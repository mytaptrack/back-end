import { AppSyncApi } from '@mytaptrack/cdk';
import { StackProps } from 'aws-cdk-lib';

export interface MttStackProps extends StackProps {
    environment: string;
    coreStack: string;
}
