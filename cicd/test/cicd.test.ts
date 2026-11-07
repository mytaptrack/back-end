import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { readFileSync } from 'fs';
import { join } from 'path';
import { CicdStack } from '../lib/cicd-stack';

function synth() {
  const app = new cdk.App();
  const stack = new CicdStack(app, 'TestCicdStack');
  return Template.fromStack(stack);
}

describe('CicdStack', () => {
  test('builds the main branch from GitHub with CodeBuild', () => {
    const template = synth();
    template.hasResourceProperties('AWS::CodePipeline::Pipeline', {
      Name: 'mytaptrack-back-end',
      Stages: Match.arrayWith([
        Match.objectLike({ Name: 'Source', Actions: [Match.objectLike({ Configuration: Match.objectLike({ Branch: 'main' }) })] }),
        Match.objectLike({ Name: 'Build' })
      ])
    });
    template.hasResourceProperties('AWS::CodeBuild::Project', {
      Name: 'mytaptrack-back-end',
      Environment: Match.objectLike({ Image: 'aws/codebuild/amazonlinux2-x86_64-standard:5.0' })
    });
  });

  test('build role can read the environment config from the config bucket', () => {
    synth().hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({ Action: 's3:GetObject', Effect: 'Allow' })
        ])
      }
    });
  });

  test('build role can assume the CDK bootstrap roles used by cdk deploy', () => {
    synth().hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: 'sts:AssumeRole',
            Effect: 'Allow',
            Resource: { 'Fn::Join': ['', Match.arrayWith([Match.stringLikeRegexp(':role/cdk-\\*$')])] }
          })
        ])
      }
    });
  });
});

describe('buildspec.yml', () => {
  const buildspec = readFileSync(join(__dirname, '..', 'buildspec.yml'), 'utf8');

  test('uses the same Node major version as the Lambda runtime', () => {
    expect(buildspec).toMatch(/nodejs:\s*22\b/);
  });

  test('downloads the config with the AWS CLI using CONFIG_KEY', () => {
    expect(buildspec).toContain('aws s3 cp "s3://${BUCKET}/${CONFIG_KEY}" "config/${STAGE}.yml"');
  });

  test('installs dependencies before deploying', () => {
    expect(buildspec.indexOf('make install-deps')).toBeGreaterThan(-1);
    expect(buildspec.indexOf('make install-deps')).toBeLessThan(buildspec.indexOf('make deploy'));
  });
});
