import { MttContext, MttS3 } from ".";
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as targets from "aws-cdk-lib/aws-route53-targets";
import { Distribution } from "aws-cdk-lib/aws-cloudfront";
import { Duration } from "aws-cdk-lib/core";

export interface MttCloudFrontInput {
    id: string;
    s3Bucket: MttS3;
    domainNamePrefix: string;
    certificateArn: string;
}

export class MttCloudFront {
    distribution: Distribution;
    
    constructor(context: MttContext, input: MttCloudFrontInput) {
        const certificate = acm.Certificate.fromCertificateArn(
            context.scope,
            `${input.id}-Certificate`,
            input.certificateArn
        );

        const zone = context.getHostedZone();

        const originAccessIdentity = new cloudfront.OriginAccessIdentity(context.scope, `${input.id}-access-id`, {});
        input.s3Bucket.bucket.grantRead(originAccessIdentity);

        const distribution = new cloudfront.Distribution(context.scope, input.id, {
            defaultBehavior: {
                origin: new origins.S3Origin(input.s3Bucket.bucket, {
                    originAccessIdentity,
                }),
            },
            defaultRootObject: 'index.html',
            domainNames: [`${input.domainNamePrefix}${zone.zoneName}`],
            certificate,
            enableLogging: true,
            logBucket: context.loggingBucket,
            logFilePrefix: `cloudfront/${context.stackName}/${input.id}`,
            errorResponses: [
                { httpStatus: 403, ttl: Duration.seconds(360), responsePagePath: '/index.html', responseHttpStatus: 200 },
                { httpStatus: 404, ttl: Duration.seconds(360), responsePagePath: '/index.html', responseHttpStatus: 200 }
            ]
        });
        this.distribution = distribution;


        new route53.ARecord(context.scope, `${input.id}-ARecord`, {
            zone,
            recordName: `${input.domainNamePrefix}${zone.zoneName}`,
            target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution)),
        });
        
        new route53.AaaaRecord(context.scope, `${input.id}-AliasRecord`, {
            zone,
            recordName: `${input.domainNamePrefix}${zone.zoneName}`,
            target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution)),
        });
    }
}
