import { 
    AppsyncFunction, AppsyncFunctionProps, MappingTemplate,
    FunctionRuntime, Code
} from "aws-cdk-lib/aws-appsync";
import { ITable } from "aws-cdk-lib/aws-dynamodb";
import { Construct } from "constructs";
import { MttDynamoDB, logger } from '..';

export interface MttAppsyncFunctionProps extends AppsyncFunctionProps {
    path: string;
    table?: MttDynamoDB;
    tables?: MttDynamoDB[];
}

export class MttAppsyncFunction extends AppsyncFunction {
    public get tables(): MttDynamoDB[] {
        return this.props.tables;
    }
    constructor(scope: Construct, id: string, private props: MttAppsyncFunctionProps) {
        super(scope, id, props);
    }
}