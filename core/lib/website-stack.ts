/**
 * This is a nested stack which sets up 1 website bucket with two cloudfront distributions configured for
 * single page applications.
 */

import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import { Construct } from 'constructs';
import { MttContext, MttS3 } from '@mytaptrack/cdk';
import * as path from 'path';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53_targets from 'aws-cdk-lib/aws-route53-targets';
import * as aws_certificatemanager from 'aws-cdk-lib/aws-certificatemanager';

export interface WebsiteStackProps extends cdk.NestedStackProps {
    coreStack: string;
    environment: string;
}

export class WebsiteStack extends cdk.NestedStack {
  managementDNS: string;
  behaviorDNS: string;

  constructor(scope: Construct, id: string, props?: WebsiteStackProps) {
    super(scope, id, props);
    
    const context = new MttContext(this, `${props.coreStack}-websites`, 'core-website-stack');
    
    // Create website bucket
    const websiteBucket = new MttS3(context, {
      id: 'WebsiteBucket',
      name: `website-bucket`,
      phi: false
    });

    // const behaviorCert = aws_certificatemanager.Certificate.fromCertificateArn(this, 'Certificate', context.config.env.domain.sub.website.behavior.cert);
    const behaviorDistribution = new cloudfront.Distribution(this, 'BehaviorWebsite', {
      defaultBehavior: {
        origin: new origins.S3StaticWebsiteOrigin(websiteBucket.bucket, { originPath: '/behavior' })
      },
      defaultRootObject: 'index.html',
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      // certificate: behaviorCert,
      errorResponses: [
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
        },
      ]
    });
    this.behaviorDNS = behaviorDistribution.domainName;

    // const manageCert = aws_certificatemanager.Certificate.fromCertificateArn(this, 'Certificate', context.config.env.domain.sub.website.manage.cert);
    const manageDistribution = new cloudfront.Distribution(this, 'ManagementWebsite', {
      defaultBehavior: {
        origin: new origins.S3StaticWebsiteOrigin(websiteBucket.bucket, { originPath: '/manage' })
      },
      defaultRootObject: 'index.html',
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      // certificate: manageCert,
      errorResponses: [
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
        },
      ]
    });
    this.managementDNS = manageDistribution.domainName;

    if(context.config.env.domain.sub.website?.behavior?.subdomain ||
      context.config.env.domain.sub.website?.manage?.subdomain) {
      const hostedZone = route53.HostedZone.fromHostedZoneAttributes(this, 'HostedZone', {
        hostedZoneId: context.config.env.domain.hostedzone.id,
        zoneName: context.config.env.domain.name
      });

      if(context.config.env.domain.sub.website?.behavior?.subdomain) {
        const dns = new route53.ARecord(this, 'BehaviorDNS', {
          zone: hostedZone,
          recordName: context.config.env.domain.sub.website.behavior.name + ".",
          target: route53.RecordTarget.fromAlias(new route53_targets.CloudFrontTarget(behaviorDistribution))
        });
        this.behaviorDNS = context.config.env.domain.sub.website?.behavior?.name
      }

      if(context.config.env.domain.sub.website?.manage?.subdomain) {
        new route53.ARecord(this, 'ManagementDNS', {
          zone: hostedZone,
          recordName: context.config.env.domain.sub.website.manage.name + ".",
          target: route53.RecordTarget.fromAlias(new route53_targets.CloudFrontTarget(behaviorDistribution))
        });
        this.managementDNS = context.config.env.domain.sub.website?.manage?.name
      }
    }
  }
}
