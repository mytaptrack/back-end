import { Choice, ChoiceProps, DefinitionBody, IChainable, StateMachine, StateMachineProps, Succeed, Wait, WaitTime } from "aws-cdk-lib/aws-stepfunctions";
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import { EnvironmentEnabled, MttContext, MttFunction, MttFunctionProps } from ".";
import { CfnResource, Duration } from "aws-cdk-lib";

export interface MttStepFunctionProps extends StateMachineProps {
    id: string;
    name?: string;
    envName: string;
    hasPhi: boolean;
    definition: IChainable
}

export interface MttLambdaStep extends MttFunctionProps {
    stateName: string;
    outputPath?: string;
    inputPath?: string;
}

export interface MttSFWait {
    stateName: string;
    seconds: number;
}

export class MttStepFunction implements EnvironmentEnabled {
    private _sf: StateMachine;
    readonly envVariable: string;
    readonly envSetFunction?: boolean;
    readonly hasPhi: boolean;

    constructor(private context: MttContext, private props: MttStepFunctionProps) {
        this._sf = new StateMachine(this.context.scope, 'MttStateMachine', {
            stateMachineName: this.props.name ?? this.props.id,
            definitionBody: DefinitionBody.fromChainable(props.definition)
        });
        
        this.envVariable = props.envName
        this.envSetFunction = true;
        this.hasPhi = props.hasPhi;
        (this._sf.node.defaultChild as CfnResource).overrideLogicalId(props.id);
    }
    get envVariableValue(): string { return this._sf.stateMachineArn; }
    setEnvironment(env: { [key: string]: string; }): void {
        env[this.envVariable] = this.envVariableValue;
    }

    static lambdaHandler(context: MttContext, props: MttLambdaStep) {
        const lambda = new MttFunction(context, props);
        return new tasks.LambdaInvoke(context.scope, props.id + 'sf', {
            stateName: props.stateName,
            lambdaFunction: lambda.lambda,
            outputPath: props.outputPath,
            inputPath: props.inputPath
        });
    }

    static wait(context: MttContext, props: MttSFWait) {
        return new Wait(context.scope, props.stateName, {
            time: WaitTime.duration(Duration.seconds(props.seconds))
        });
    }

    static succeed(context: MttContext, stateName: string) {
        return new Succeed(context.scope, stateName);
    }

    static choice(context: MttContext, props: ChoiceProps) {
        return new Choice(context.scope, props.stateName!, {
            ...props
        });
    }
}