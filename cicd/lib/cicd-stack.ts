import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
// import * as sqs from 'aws-cdk-lib/aws-sqs';

export class CicdStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const environmentParam = new cdk.CfnParameter(this, 'Environment', {
      type: 'String',
      description: 'The environment name',
      default: 'dev',
      allowedValues: ['dev', 'test', 'prod']
    });
    const configBucket = new cdk.CfnParameter(this, 'ConfigBucket', {
      type: 'String',
      description: 'The config bucket name'
    });
    const configKey = new cdk.CfnParameter(this, 'ConfigKey', {
      type: 'String',
      description: 'The config key name located in the config bucket'
    });
    const connectionArn = new cdk.CfnParameter(this, 'ConnectionArn', {
      type: 'String',
      description: 'ARN of the AWS CodeConnections (CodeStar) connection to GitHub'
    });
    const branch = new cdk.CfnParameter(this, 'Branch', {
      type: 'String',
      description: 'The GitHub branch to build and deploy',
      default: 'main'
    });

    // Create a code pipeline v2
    const pipeline = new cdk.aws_codepipeline.Pipeline(this, 'Pipeline', {
      pipelineName: 'mytaptrack-back-end',
      crossAccountKeys: false,
      restartExecutionOnUpdate: true,
    });

    const sourceArtifact = new cdk.aws_codepipeline.Artifact('SourceArtifact')
    pipeline.addStage({
      stageName: 'Source',
      actions: [
        /* Add action for open source repo https://github.com/mytaptrack/back-end.git */
        new cdk.aws_codepipeline_actions.CodeStarConnectionsSourceAction({
          actionName: 'GitHub',
          owner: 'mytaptrack',
          repo: 'back-end',
          branch: branch.valueAsString,
          connectionArn: connectionArn.valueAsString,
          output: sourceArtifact,
          runOrder: 1
        })
      ]
    });
    
    const buildProject = new cdk.aws_codebuild.PipelineProject(this, 'BuildProject', {
      projectName: 'mytaptrack-back-end',
      buildSpec: cdk.aws_codebuild.BuildSpec.fromAsset('buildspec.yml'),
      environment: {
        buildImage: cdk.aws_codebuild.LinuxBuildImage.AMAZON_LINUX_2_5,
        privileged: true,
        environmentVariables: {
          'AWS_ACCOUNT_ID': {
            value: this.account
          },
          'AWS_REGION': {
            value: this.region
          },
          'CDK_DEFAULT_ACCOUNT': {
            value: this.account
          },
          'CDK_DEFAULT_REGION': {
            value: this.region
          },
          'ENVIRONMENT': {
            value: environmentParam.valueAsString
          },
          'STAGE': {
            value: environmentParam.valueAsString
          },
          'BUCKET': {
            value: configBucket.valueAsString
          },
          'CONFIG_KEY': {
            value: configKey.valueAsString
          }
        }
      }
    });

    // buildspec.yml copies the environment config from s3://${BUCKET}/${CONFIG_KEY}
    buildProject.addToRolePolicy(new cdk.aws_iam.PolicyStatement({
      actions: ['s3:GetObject'],
      resources: [`arn:${this.partition}:s3:::${configBucket.valueAsString}/${configKey.valueAsString}`]
    }));

    // `cdk deploy` works by assuming the CDK bootstrap roles (deploy, file/image publishing, lookup)
    buildProject.addToRolePolicy(new cdk.aws_iam.PolicyStatement({
      actions: ['sts:AssumeRole'],
      resources: [`arn:${this.partition}:iam::${this.account}:role/cdk-*`]
    }));

    pipeline.addStage({
      stageName: 'Build',
      actions: [
        new cdk.aws_codepipeline_actions.CodeBuildAction({
          actionName: 'Build',
          project: buildProject,
          input: sourceArtifact,
          runOrder: 1
        })
      ]
    });
  }
}
