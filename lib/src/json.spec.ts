import * as fs from 'fs';

const sortKeys = (obj) => {
    if (Array.isArray(obj)) {
      return obj.map(sortKeys).sort();
    }
  
    if (typeof obj === 'object' && obj !== null) {
      return Object.keys(obj)
        .sort()
        .reduce((sortedObj, key) => {
          sortedObj[key] = sortKeys(obj[key]);
          return sortedObj;
        }, {});
    }
  
    return obj;
  };
  
const jsonString = `{
	"Parameters": {
	 "LoggingBucketNameParameter": {
	  "Type": "AWS::SSM::Parameter::Value<String>",
	  "Default": "/regional/logging/bucket/name"
	 },
	 "LumigoTokenParameter": {
	  "Type": "AWS::SSM::Parameter::Value<String>",
	  "Default": "/Lumigo/Token"
	 },
	 "LumigoDomainScrubbingParameter": {
	  "Type": "AWS::SSM::Parameter::Value<String>",
	  "Default": "/Lumigo/DomainScrubbing"
	 },
	 "LumigoAttributeMaskingParameter": {
	  "Type": "AWS::SSM::Parameter::Value<String>",
	  "Default": "/Lumigo/AttributeMasking"
	 },
	 "DebugParameter": {
	  "Type": "AWS::SSM::Parameter::Value<String>",
	  "Default": "/test/debug"
	 },
	 "VpcIdParameter": {
	  "Type": "AWS::SSM::Parameter::Value<String>",
	  "Default": "/regional/vpc/hipaa/id"
	 },
	 "SubnetAParameter": {
	  "Type": "AWS::SSM::Parameter::Value<String>",
	  "Default": "/regional/vpc/hipaa/subnets/a"
	 },
	 "SubnetBParameter": {
	  "Type": "AWS::SSM::Parameter::Value<String>",
	  "Default": "/regional/vpc/hipaa/subnets/b"
	 },
	 "UseNetworkingParameter": {
	  "Type": "AWS::SSM::Parameter::Value<String>",
	  "Default": "/hipaa/VpcEnabled"
	 },
	 "BootstrapVersion": {
	  "Type": "AWS::SSM::Parameter::Value<String>",
	  "Default": "/cdk-bootstrap/hnb659fds/version",
	  "Description": "Version of the CDK Bootstrap resources in this environment, automatically retrieved from SSM Parameter Store. [cdk:skip]"
	 }
	},
	"Resources": {
	 "stackLayer": {
	  "Type": "AWS::Lambda::LayerVersion",
	  "Properties": {
	   "Content": {
		"S3Bucket": {
		 "Fn::Sub": "cdk-hnb659fds-assets-\${AWS::AccountId}-\${AWS::Region}"
		},
		"S3Key": "e85cbba047351099eb86ea10d985f1f05094dc0e7fe971e3b3fc38e8541ab10c.zip"
	   }
	  },
	  "Metadata": {
	   "aws:cdk:path": "mytaptrack-test/stackLayer/Resource",
	   "aws:asset:path": "asset.e85cbba047351099eb86ea10d985f1f05094dc0e7fe971e3b3fc38e8541ab10c",
	   "aws:asset:is-bundled": false,
	   "aws:asset:property": "Content"
	  }
	 },
	 "EnvironmentTagName921F090F": {
	  "Type": "AWS::SSM::Parameter",
	  "Properties": {
	   "Type": "String",
	   "Value": "test"
	  },
	  "Metadata": {
	   "aws:cdk:path": "mytaptrack-test/EnvironmentTagName/Resource"
	  }
	 },
	 "PiiEncryptionKey": {
	  "Type": "AWS::KMS::Key",
	  "Properties": {
	   "KeyPolicy": {
		"Statement": [
		 {
		  "Action": [
		   "kms:Encrypt",
		   "kms:Decrypt",
		   "kms:GenerateDataKey",
		   "kms:DescribeKey"
		  ],
		  "Effect": "Allow",
		  "Principal": {
		   "Service": [
			"lambda.amazonaws.com",
			"sqs.amazonaws.com",
			"quicksight.amazonaws.com",
			"dynamodb.amazonaws.com"
		   ]
		  },
		  "Resource": "*",
		  "Sid": "Allow use of the key"
		 },
		 {
		  "Action": "kms:*",
		  "Effect": "Allow",
		  "Principal": {
		   "AWS": {
			"Fn::Join": [
			 "",
			 [
			  "arn:",
			  {
			   "Ref": "AWS::Partition"
			  },
			  ":iam::",
			  {
			   "Ref": "AWS::AccountId"
			  },
			  ":root"
			 ]
			]
		   }
		  },
		  "Resource": "*",
		  "Sid": "Allow modification of the key"
		 }
		],
		"Version": "2012-10-17"
	   },
	   "Description": "Key used to restrict access to private data",
	   "EnableKeyRotation": true
	  },
	  "Metadata": {
	   "aws:cdk:path": "mytaptrack-test/PiiEncryptionKey"
	  }
	 },
	 "PiiEncryptionKeyV2": {
	  "Type": "AWS::KMS::Key",
	  "Properties": {
	   "KeyPolicy": {
		"Statement": [
		 {
		  "Action": [
		   "kms:Encrypt",
		   "kms:Decrypt",
		   "kms:GenerateDataKey",
		   "kms:DescribeKey"
		  ],
		  "Effect": "Allow",
		  "Principal": {
		   "Service": [
			"lambda.amazonaws.com",
			"sqs.amazonaws.com",
			"quicksight.amazonaws.com",
			"dynamodb.amazonaws.com"
		   ]
		  },
		  "Resource": "*",
		  "Sid": "Allow use of the key"
		 },
		 {
		  "Action": "kms:*",
		  "Effect": "Allow",
		  "Principal": {
		   "AWS": {
			"Fn::Join": [
			 "",
			 [
			  "arn:",
			  {
			   "Ref": "AWS::Partition"
			  },
			  ":iam::",
			  {
			   "Ref": "AWS::AccountId"
			  },
			  ":root"
			 ]
			]
		   }
		  },
		  "Resource": "*",
		  "Sid": "Allow modification of the key"
		 }
		],
		"Version": "2012-10-17"
	   },
	   "Description": "Key used to restrict access to private data",
	   "EnableKeyRotation": true,
	   "MultiRegion": true
	  },
	  "Metadata": {
	   "aws:cdk:path": "mytaptrack-test/PiiEncryptionKeyV2"
	  }
	 },
	 "PiiEncryptionAlias": {
	  "Type": "AWS::KMS::Alias",
	  "Properties": {
	   "AliasName": "alias/mytaptrack/pii",
	   "TargetKeyId": {
		"Fn::GetAtt": [
		 "PiiEncryptionKeyV2",
		 "Arn"
		]
	   }
	  },
	  "Metadata": {
	   "aws:cdk:path": "mytaptrack-test/PiiEncryptionKeyV2Ref/Alias/Resource"
	  }
	 },
	 "PiiEncryptionArnParam": {
	  "Type": "AWS::SSM::Parameter",
	  "Properties": {
	   "Type": "String",
	   "Value": {
		"Fn::GetAtt": [
		 "PiiEncryptionKeyV2",
		 "Arn"
		]
	   },
	   "Name": {
		"Fn::Sub": "/\${EnvironmentTagName}/regional/encryption/pii"
	   }
	  },
	  "Metadata": {
	   "aws:cdk:path": "mytaptrack-test/PiiEncryptionArnParam"
	  }
	 },
	 "logsEncryptionKey": {
	  "Type": "AWS::KMS::Key",
	  "Properties": {
	   "KeyPolicy": {
		"Statement": [
		 {
		  "Action": [
		   "kms:Decrypt",
		   "kms:Encrypt"
		  ],
		  "Effect": "Allow",
		  "Principal": {
		   "Service": {
			"Fn::Join": [
			 "",
			 [
			  "logs.",
			  {
			   "Ref": "AWS::Region"
			  },
			  ".",
			  {
			   "Ref": "AWS::URLSuffix"
			  }
			 ]
			]
		   }
		  },
		  "Resource": "*",
		  "Sid": "Allow use of the key"
		 },
		 {
		  "Action": [
		   "kms:Decrypt",
		   "kms:Encrypt"
		  ],
		  "Effect": "Allow",
		  "Principal": {
		   "AWS": {
			"Fn::Join": [
			 "",
			 [
			  "arn:",
			  {
			   "Ref": "AWS::Partition"
			  },
			  ":iam::",
			  {
			   "Ref": "AWS::AccountId"
			  },
			  ":root"
			 ]
			]
		   }
		  },
		  "Resource": "*",
		  "Sid": "Allow modification of the key"
		 }
		],
		"Version": "2012-10-17"
	   },
	   "Description": "Key used in cloudwatch logs",
	   "EnableKeyRotation": true
	  },
	  "UpdateReplacePolicy": "Retain",
	  "DeletionPolicy": "Retain",
	  "Metadata": {
	   "aws:cdk:path": "mytaptrack-test/logsEncryptionKey/Resource"
	  }
	 },
	 "apiGatewayCert": {
	  "Type": "AWS::ApiGateway::ClientCertificate",
	  "Properties": {
	   "Description": "mytaptrack-test certificate for api gateway"
	  },
	  "Metadata": {
	   "aws:cdk:path": "mytaptrack-test/apiGatewayCert"
	  }
	 },
	 "SigningProfile2139A0F9": {
	  "Type": "AWS::Signer::SigningProfile",
	  "Properties": {
	   "PlatformId": "AWSLambda-SHA384-ECDSA",
	   "SignatureValidityPeriod": {
		"Type": "MONTHS",
		"Value": 135
	   }
	  },
	  "Metadata": {
	   "aws:cdk:path": "mytaptrack-test/SigningProfile/Resource"
	  }
	 },
	 "CodeSigningConfigD8D41C10": {
	  "Type": "AWS::Lambda::CodeSigningConfig",
	  "Properties": {
	   "AllowedPublishers": {
		"SigningProfileVersionArns": [
		 {
		  "Fn::GetAtt": [
		   "SigningProfile2139A0F9",
		   "ProfileVersionArn"
		  ]
		 }
		]
	   },
	   "CodeSigningPolicies": {
		"UntrustedArtifactOnDeployment": "Warn"
	   }
	  },
	  "Metadata": {
	   "aws:cdk:path": "mytaptrack-test/CodeSigningConfig/Resource"
	  }
	 },
	 "dlqEncryptionKey": {
	  "Type": "AWS::KMS::Key",
	  "Properties": {
	   "KeyPolicy": {
		"Statement": [
		 {
		  "Action": [
		   "kms:Decrypt",
		   "kms:Encrypt"
		  ],
		  "Effect": "Allow",
		  "Principal": {
		   "Service": "sqs.amazonaws.com"
		  },
		  "Resource": "*",
		  "Sid": "Allow use of the key"
		 },
		 {
		  "Action": [
		   "kms:Decrypt",
		   "kms:Encrypt"
		  ],
		  "Effect": "Allow",
		  "Principal": {
		   "AWS": {
			"Fn::Join": [
			 "",
			 [
			  "arn:",
			  {
			   "Ref": "AWS::Partition"
			  },
			  ":iam::",
			  {
			   "Ref": "AWS::AccountId"
			  },
			  ":root"
			 ]
			]
		   }
		  },
		  "Resource": "*",
		  "Sid": "Allow modification of the key"
		 }
		],
		"Version": "2012-10-17"
	   },
	   "Description": "Key used for developer dead-letter queues",
	   "EnableKeyRotation": true
	  },
	  "UpdateReplacePolicy": "Retain",
	  "DeletionPolicy": "Retain",
	  "Metadata": {
	   "aws:cdk:path": "mytaptrack-test/dlqEncryptionKey/Resource"
	  }
	 },
	 "stackDeadLetterQueue": {
	  "Type": "AWS::SQS::Queue",
	  "Properties": {
	   "KmsMasterKeyId": {
		"Fn::GetAtt": [
		 "dlqEncryptionKey",
		 "Arn"
		]
	   },
	   "MessageRetentionPeriod": 172800,
	   "VisibilityTimeout": 30
	  },
	  "UpdateReplacePolicy": "Delete",
	  "DeletionPolicy": "Delete",
	  "Metadata": {
	   "aws:cdk:path": "mytaptrack-test/stackDeadLetterQueue/Resource"
	  }
	 },
	 "stackDeadLetterQueuePolicy501EB8A9": {
	  "Type": "AWS::SQS::QueuePolicy",
	  "Properties": {
	   "PolicyDocument": {
		"Statement": [
		 {
		  "Action": "sqs:*",
		  "Condition": {
		   "Bool": {
			"aws:SecureTransport": "false"
		   }
		  },
		  "Effect": "Deny",
		  "Principal": {
		   "AWS": "*"
		  },
		  "Resource": {
		   "Fn::GetAtt": [
			"stackDeadLetterQueue",
			"Arn"
		   ]
		  }
		 }
		],
		"Version": "2012-10-17"
	   },
	   "Queues": [
		{
		 "Ref": "stackDeadLetterQueue"
		}
	   ]
	  },
	  "Metadata": {
	   "aws:cdk:path": "mytaptrack-test/stackDeadLetterQueue/Policy/Resource"
	  }
	 },
	 "encryptCloudwatchRole934EE822": {
	  "Type": "AWS::IAM::Role",
	  "Properties": {
	   "AssumeRolePolicyDocument": {
		"Statement": [
		 {
		  "Action": "sts:AssumeRole",
		  "Effect": "Allow",
		  "Principal": {
		   "Service": "lambda.amazonaws.com"
		  }
		 }
		],
		"Version": "2012-10-17"
	   },
	   "Policies": [
		{
		 "PolicyDocument": {
		  "Statement": [
		   {
			"Action": [
			 "logs:AssociateKmsKey",
			 "logs:DescribeLogGroups"
			],
			"Effect": "Allow",
			"Resource": "*"
		   }
		  ],
		  "Version": "2012-10-17"
		 },
		 "PolicyName": "SpecifiedResourcePermissions"
		}
	   ]
	  },
	  "Metadata": {
	   "aws:cdk:path": "mytaptrack-test/encryptCloudwatchRole/Resource"
	  }
	 },
	 "encryptCloudwatchServiceRole0F9BE695": {
	  "Type": "AWS::IAM::Role",
	  "Properties": {
	   "AssumeRolePolicyDocument": {
		"Statement": [
		 {
		  "Action": "sts:AssumeRole",
		  "Effect": "Allow",
		  "Principal": {
		   "Service": "lambda.amazonaws.com"
		  }
		 }
		],
		"Version": "2012-10-17"
	   },
	   "ManagedPolicyArns": [
		{
		 "Fn::Join": [
		  "",
		  [
		   "arn:",
		   {
			"Ref": "AWS::Partition"
		   },
		   ":iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
		  ]
		 ]
		}
	   ]
	  },
	  "Metadata": {
	   "aws:cdk:path": "mytaptrack-test/encryptCloudwatch/ServiceRole/Resource"
	  }
	 },
	 "encryptCloudwatchServiceRoleDefaultPolicy61D3BA2E": {
	  "Type": "AWS::IAM::Policy",
	  "Properties": {
	   "PolicyDocument": {
		"Statement": [
		 {
		  "Action": "sqs:SendMessage",
		  "Effect": "Allow",
		  "Resource": {
		   "Fn::GetAtt": [
			"stackDeadLetterQueue",
			"Arn"
		   ]
		  }
		 }
		],
		"Version": "2012-10-17"
	   },
	   "PolicyName": "encryptCloudwatchServiceRoleDefaultPolicy61D3BA2E",
	   "Roles": [
		{
		 "Ref": "encryptCloudwatchServiceRole0F9BE695"
		}
	   ]
	  },
	  "Metadata": {
	   "aws:cdk:path": "mytaptrack-test/encryptCloudwatch/ServiceRole/DefaultPolicy/Resource"
	  }
	 },
	 "encryptCloudwatch": {
	  "Type": "AWS::Lambda::Function",
	  "Properties": {
	   "Code": {
		"S3Bucket": {
		 "Fn::Sub": "cdk-hnb659fds-assets-\${AWS::AccountId}-\${AWS::Region}"
		},
		"S3Key": "80b4b749598c089fa0e283b2f37e5fa589d9085d3eea27666b0b79e89a2ce469.zip"
	   },
	   "Role": {
		"Fn::GetAtt": [
		 "encryptCloudwatchServiceRole0F9BE695",
		 "Arn"
		]
	   },
	   "CodeSigningConfigArn": {
		"Fn::GetAtt": [
		 "CodeSigningConfigD8D41C10",
		 "CodeSigningConfigArn"
		]
	   },
	   "DeadLetterConfig": {
		"TargetArn": {
		 "Fn::GetAtt": [
		  "stackDeadLetterQueue",
		  "Arn"
		 ]
		}
	   },
	   "Environment": {
		"Variables": {
		 "LUMIGO_SECRET_MASKING_REGEX": {
		  "Ref": "LumigoAttributeMaskingParameter"
		 },
		 "LUMIGO_DOMAINS_SCRUBBER": {
		  "Ref": "LumigoDomainScrubbingParameter"
		 },
		 "LUMIGO_TOKEN": {
		  "Ref": "LumigoTokenParameter"
		 },
		 "Debug": {
		  "Ref": "DebugParameter"
		 },
		 "kmsKeyId": {
		  "Fn::GetAtt": [
		   "logsEncryptionKey",
		   "Arn"
		  ]
		 }
		}
	   },
	   "FunctionName": {
		"Fn::Join": [
		 "",
		 [
		  "mytaptrack-test-",
		  {
		   "Ref": "AWS::Region"
		  },
		  "-encryptCloudwatch"
		 ]
		]
	   },
	   "Handler": "cloudwatch-encrypt.handler",
	   "Layers": [
		{
		 "Ref": "stackLayer"
		}
	   ],
	   "Runtime": "nodejs18.x"
	  },
	  "DependsOn": [
	   "encryptCloudwatchServiceRoleDefaultPolicy61D3BA2E",
	   "encryptCloudwatchServiceRole0F9BE695"
	  ],
	  "Metadata": {
	   "aws:cdk:path": "mytaptrack-test/encryptCloudwatch/Resource",
	   "aws:asset:path": "asset.80b4b749598c089fa0e283b2f37e5fa589d9085d3eea27666b0b79e89a2ce469",
	   "aws:asset:is-bundled": false,
	   "aws:asset:property": "Code"
	  }
	 },
	 "encryptCloudwatch17096EB31": {
	  "Type": "AWS::Events::Rule",
	  "Properties": {
	   "EventPattern": {
		"source": [
		 "aws.logs"
		],
		"detail-type": [
		 "AWS API Call via CloudTrail"
		],
		"detail": {
		 "eventSource": [
		  "logs.amazonaws.com"
		 ],
		 "eventName": [
		  "CreateLogGroup"
		 ]
		}
	   },
	   "State": "ENABLED"
	  },
	  "Metadata": {
	   "aws:cdk:path": "mytaptrack-test/encryptCloudwatch1/Resource"
	  }
	 },
	 "apiGatewayUpdatedRoleEEBD8AA9": {
	  "Type": "AWS::IAM::Role",
	  "Properties": {
	   "AssumeRolePolicyDocument": {
		"Statement": [
		 {
		  "Action": "sts:AssumeRole",
		  "Effect": "Allow",
		  "Principal": {
		   "Service": "lambda.amazonaws.com"
		  }
		 }
		],
		"Version": "2012-10-17"
	   },
	   "Policies": [
		{
		 "PolicyDocument": {
		  "Statement": [
		   {
			"Action": "apigateway:*",
			"Effect": "Allow",
			"Resource": "*"
		   }
		  ],
		  "Version": "2012-10-17"
		 },
		 "PolicyName": "SpecifiedResourcePermissions"
		}
	   ]
	  },
	  "Metadata": {
	   "aws:cdk:path": "mytaptrack-test/apiGatewayUpdatedRole/Resource"
	  }
	 },
	 "apiGatewayUpdatedServiceRole86624ED4": {
	  "Type": "AWS::IAM::Role",
	  "Properties": {
	   "AssumeRolePolicyDocument": {
		"Statement": [
		 {
		  "Action": "sts:AssumeRole",
		  "Effect": "Allow",
		  "Principal": {
		   "Service": "lambda.amazonaws.com"
		  }
		 }
		],
		"Version": "2012-10-17"
	   },
	   "ManagedPolicyArns": [
		{
		 "Fn::Join": [
		  "",
		  [
		   "arn:",
		   {
			"Ref": "AWS::Partition"
		   },
		   ":iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
		  ]
		 ]
		}
	   ]
	  },
	  "Metadata": {
	   "aws:cdk:path": "mytaptrack-test/apiGatewayUpdated/ServiceRole/Resource"
	  }
	 },
	 "apiGatewayUpdatedServiceRoleDefaultPolicy4F5CF89F": {
	  "Type": "AWS::IAM::Policy",
	  "Properties": {
	   "PolicyDocument": {
		"Statement": [
		 {
		  "Action": "sqs:SendMessage",
		  "Effect": "Allow",
		  "Resource": {
		   "Fn::GetAtt": [
			"stackDeadLetterQueue",
			"Arn"
		   ]
		  }
		 }
		],
		"Version": "2012-10-17"
	   },
	   "PolicyName": "apiGatewayUpdatedServiceRoleDefaultPolicy4F5CF89F",
	   "Roles": [
		{
		 "Ref": "apiGatewayUpdatedServiceRole86624ED4"
		}
	   ]
	  },
	  "Metadata": {
	   "aws:cdk:path": "mytaptrack-test/apiGatewayUpdated/ServiceRole/DefaultPolicy/Resource"
	  }
	 },
	 "apiGatewayUpdated": {
	  "Type": "AWS::Lambda::Function",
	  "Properties": {
	   "Code": {
		"S3Bucket": {
		 "Fn::Sub": "cdk-hnb659fds-assets-\${AWS::AccountId}-\${AWS::Region}"
		},
		"S3Key": "80b4b749598c089fa0e283b2f37e5fa589d9085d3eea27666b0b79e89a2ce469.zip"
	   },
	   "Role": {
		"Fn::GetAtt": [
		 "apiGatewayUpdatedServiceRole86624ED4",
		 "Arn"
		]
	   },
	   "CodeSigningConfigArn": {
		"Fn::GetAtt": [
		 "CodeSigningConfigD8D41C10",
		 "CodeSigningConfigArn"
		]
	   },
	   "DeadLetterConfig": {
		"TargetArn": {
		 "Fn::GetAtt": [
		  "stackDeadLetterQueue",
		  "Arn"
		 ]
		}
	   },
	   "Environment": {
		"Variables": {
		 "LUMIGO_SECRET_MASKING_REGEX": {
		  "Ref": "LumigoAttributeMaskingParameter"
		 },
		 "LUMIGO_DOMAINS_SCRUBBER": {
		  "Ref": "LumigoDomainScrubbingParameter"
		 },
		 "LUMIGO_TOKEN": {
		  "Ref": "LumigoTokenParameter"
		 },
		 "Debug": {
		  "Ref": "DebugParameter"
		 },
		 "apiGatewayCert": {
		  "Ref": "apiGatewayCert"
		 },
		 "removeStageName": "Stage"
		}
	   },
	   "FunctionName": {
		"Fn::Join": [
		 "",
		 [
		  "mytaptrack-test-",
		  {
		   "Ref": "AWS::Region"
		  },
		  "-apiGatewayUpdated"
		 ]
		]
	   },
	   "Handler": "api-gateway-stage-adj.handler",
	   "Layers": [
		{
		 "Ref": "stackLayer"
		}
	   ],
	   "Runtime": "nodejs18.x"
	  },
	  "DependsOn": [
	   "apiGatewayUpdatedServiceRoleDefaultPolicy4F5CF89F",
	   "apiGatewayUpdatedServiceRole86624ED4"
	  ],
	  "Metadata": {
	   "aws:cdk:path": "mytaptrack-test/apiGatewayUpdated/Resource",
	   "aws:asset:path": "asset.80b4b749598c089fa0e283b2f37e5fa589d9085d3eea27666b0b79e89a2ce469",
	   "aws:asset:is-bundled": false,
	   "aws:asset:property": "Code"
	  }
	 },
	 "apiGatewayUpdated1BB3893CC": {
	  "Type": "AWS::Events::Rule",
	  "Properties": {
	   "EventPattern": {
		"source": [
		 "aws.apigateway"
		],
		"detail": {
		 "eventSource": [
		  "apigateway.amazonaws.com"
		 ],
		 "eventName": [
		  "UpdateStage",
		  "CreateStage"
		 ]
		}
	   },
	   "State": "ENABLED"
	  },
	  "Metadata": {
	   "aws:cdk:path": "mytaptrack-test/apiGatewayUpdated1/Resource"
	  }
	 },
	 "parameterStoreReplicationRole98A35151": {
	  "Type": "AWS::IAM::Role",
	  "Properties": {
	   "AssumeRolePolicyDocument": {
		"Statement": [
		 {
		  "Action": "sts:AssumeRole",
		  "Effect": "Allow",
		  "Principal": {
		   "Service": "lambda.amazonaws.com"
		  }
		 }
		],
		"Version": "2012-10-17"
	   },
	   "Policies": [
		{
		 "PolicyDocument": {
		  "Statement": [
		   {
			"Action": [
			 "kms:Decrypt",
			 "ssm:DeleteParameter",
			 "ssm:DeleteParameters",
			 "ssm:DescribeParameters",
			 "ssm:GetParameter",
			 "ssm:PutParameter"
			],
			"Effect": "Allow",
			"Resource": "*"
		   }
		  ],
		  "Version": "2012-10-17"
		 },
		 "PolicyName": "SpecifiedResourcePermissions"
		}
	   ]
	  },
	  "Metadata": {
	   "aws:cdk:path": "mytaptrack-test/parameterStoreReplicationRole/Resource"
	  }
	 },
	 "parameterStoreReplicationServiceRole2E9D54CA": {
	  "Type": "AWS::IAM::Role",
	  "Properties": {
	   "AssumeRolePolicyDocument": {
		"Statement": [
		 {
		  "Action": "sts:AssumeRole",
		  "Effect": "Allow",
		  "Principal": {
		   "Service": "lambda.amazonaws.com"
		  }
		 }
		],
		"Version": "2012-10-17"
	   },
	   "ManagedPolicyArns": [
		{
		 "Fn::Join": [
		  "",
		  [
		   "arn:",
		   {
			"Ref": "AWS::Partition"
		   },
		   ":iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
		  ]
		 ]
		}
	   ]
	  },
	  "Metadata": {
	   "aws:cdk:path": "mytaptrack-test/parameterStoreReplication/ServiceRole/Resource"
	  }
	 },
	 "parameterStoreReplicationServiceRoleDefaultPolicyBAE9641E": {
	  "Type": "AWS::IAM::Policy",
	  "Properties": {
	   "PolicyDocument": {
		"Statement": [
		 {
		  "Action": "sqs:SendMessage",
		  "Effect": "Allow",
		  "Resource": {
		   "Fn::GetAtt": [
			"stackDeadLetterQueue",
			"Arn"
		   ]
		  }
		 }
		],
		"Version": "2012-10-17"
	   },
	   "PolicyName": "parameterStoreReplicationServiceRoleDefaultPolicyBAE9641E",
	   "Roles": [
		{
		 "Ref": "parameterStoreReplicationServiceRole2E9D54CA"
		}
	   ]
	  },
	  "Metadata": {
	   "aws:cdk:path": "mytaptrack-test/parameterStoreReplication/ServiceRole/DefaultPolicy/Resource"
	  }
	 },
	 "parameterStoreReplication": {
	  "Type": "AWS::Lambda::Function",
	  "Properties": {
	   "Code": {
		"S3Bucket": {
		 "Fn::Sub": "cdk-hnb659fds-assets-\${AWS::AccountId}-\${AWS::Region}"
		},
		"S3Key": "80b4b749598c089fa0e283b2f37e5fa589d9085d3eea27666b0b79e89a2ce469.zip"
	   },
	   "Role": {
		"Fn::GetAtt": [
		 "parameterStoreReplicationServiceRole2E9D54CA",
		 "Arn"
		]
	   },
	   "CodeSigningConfigArn": {
		"Fn::GetAtt": [
		 "CodeSigningConfigD8D41C10",
		 "CodeSigningConfigArn"
		]
	   },
	   "DeadLetterConfig": {
		"TargetArn": {
		 "Fn::GetAtt": [
		  "stackDeadLetterQueue",
		  "Arn"
		 ]
		}
	   },
	   "Environment": {
		"Variables": {
		 "LUMIGO_SECRET_MASKING_REGEX": {
		  "Ref": "LumigoAttributeMaskingParameter"
		 },
		 "LUMIGO_DOMAINS_SCRUBBER": {
		  "Ref": "LumigoDomainScrubbingParameter"
		 },
		 "LUMIGO_TOKEN": {
		  "Ref": "LumigoTokenParameter"
		 },
		 "Debug": {
		  "Ref": "DebugParameter"
		 },
		 "primaryRegion": "us-west-2",
		 "regions": "us-west-2,us-east",
		 "environment": "test"
		}
	   },
	   "FunctionName": {
		"Fn::Join": [
		 "",
		 [
		  "mytaptrack-test-",
		  {
		   "Ref": "AWS::Region"
		  },
		  "-parameterStoreReplication"
		 ]
		]
	   },
	   "Handler": "parameter-store-prop.handler",
	   "Layers": [
		{
		 "Ref": "stackLayer"
		}
	   ],
	   "Runtime": "nodejs18.x"
	  },
	  "DependsOn": [
	   "parameterStoreReplicationServiceRoleDefaultPolicyBAE9641E",
	   "parameterStoreReplicationServiceRole2E9D54CA"
	  ],
	  "Metadata": {
	   "aws:cdk:path": "mytaptrack-test/parameterStoreReplication/Resource",
	   "aws:asset:path": "asset.80b4b749598c089fa0e283b2f37e5fa589d9085d3eea27666b0b79e89a2ce469",
	   "aws:asset:is-bundled": false,
	   "aws:asset:property": "Code"
	  }
	 },
	 "parameterStoreReplication13260031F": {
	  "Type": "AWS::Events::Rule",
	  "Properties": {
	   "EventPattern": {
		"source": [
		 "aws.ssm"
		],
		"detail-type": [
		 "Parameter Store Change",
		 "Parameter Store Policy Action"
		]
	   },
	   "State": "ENABLED"
	  },
	  "Metadata": {
	   "aws:cdk:path": "mytaptrack-test/parameterStoreReplication1/Resource"
	  }
	 },
	 "moveS3DataRoleDB96693D": {
	  "Type": "AWS::IAM::Role",
	  "Properties": {
	   "AssumeRolePolicyDocument": {
		"Statement": [
		 {
		  "Action": "sts:AssumeRole",
		  "Effect": "Allow",
		  "Principal": {
		   "Service": "lambda.amazonaws.com"
		  }
		 }
		],
		"Version": "2012-10-17"
	   },
	   "Policies": [
		{
		 "PolicyDocument": {
		  "Statement": [
		   {
			"Action": "s3:*",
			"Effect": "Allow",
			"Resource": "*"
		   }
		  ],
		  "Version": "2012-10-17"
		 },
		 "PolicyName": "SpecifiedResourcePermissions"
		}
	   ]
	  },
	  "Metadata": {
	   "aws:cdk:path": "mytaptrack-test/moveS3DataRole/Resource"
	  }
	 },
	 "moveS3DataServiceRole10615805": {
	  "Type": "AWS::IAM::Role",
	  "Properties": {
	   "AssumeRolePolicyDocument": {
		"Statement": [
		 {
		  "Action": "sts:AssumeRole",
		  "Effect": "Allow",
		  "Principal": {
		   "Service": "lambda.amazonaws.com"
		  }
		 }
		],
		"Version": "2012-10-17"
	   },
	   "ManagedPolicyArns": [
		{
		 "Fn::Join": [
		  "",
		  [
		   "arn:",
		   {
			"Ref": "AWS::Partition"
		   },
		   ":iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
		  ]
		 ]
		}
	   ]
	  },
	  "Metadata": {
	   "aws:cdk:path": "mytaptrack-test/moveS3Data/ServiceRole/Resource"
	  }
	 },
	 "moveS3DataServiceRoleDefaultPolicyD298AEC4": {
	  "Type": "AWS::IAM::Policy",
	  "Properties": {
	   "PolicyDocument": {
		"Statement": [
		 {
		  "Action": "sqs:SendMessage",
		  "Effect": "Allow",
		  "Resource": {
		   "Fn::GetAtt": [
			"stackDeadLetterQueue",
			"Arn"
		   ]
		  }
		 }
		],
		"Version": "2012-10-17"
	   },
	   "PolicyName": "moveS3DataServiceRoleDefaultPolicyD298AEC4",
	   "Roles": [
		{
		 "Ref": "moveS3DataServiceRole10615805"
		}
	   ]
	  },
	  "Metadata": {
	   "aws:cdk:path": "mytaptrack-test/moveS3Data/ServiceRole/DefaultPolicy/Resource"
	  }
	 },
	 "moveS3Data": {
	  "Type": "AWS::Lambda::Function",
	  "Properties": {
	   "Code": {
		"S3Bucket": {
		 "Fn::Sub": "cdk-hnb659fds-assets-\${AWS::AccountId}-\${AWS::Region}"
		},
		"S3Key": "80b4b749598c089fa0e283b2f37e5fa589d9085d3eea27666b0b79e89a2ce469.zip"
	   },
	   "Role": {
		"Fn::GetAtt": [
		 "moveS3DataServiceRole10615805",
		 "Arn"
		]
	   },
	   "CodeSigningConfigArn": {
		"Fn::GetAtt": [
		 "CodeSigningConfigD8D41C10",
		 "CodeSigningConfigArn"
		]
	   },
	   "DeadLetterConfig": {
		"TargetArn": {
		 "Fn::GetAtt": [
		  "stackDeadLetterQueue",
		  "Arn"
		 ]
		}
	   },
	   "Environment": {
		"Variables": {
		 "LUMIGO_SECRET_MASKING_REGEX": {
		  "Ref": "LumigoAttributeMaskingParameter"
		 },
		 "LUMIGO_DOMAINS_SCRUBBER": {
		  "Ref": "LumigoDomainScrubbingParameter"
		 },
		 "LUMIGO_TOKEN": {
		  "Ref": "LumigoTokenParameter"
		 },
		 "Debug": {
		  "Ref": "DebugParameter"
		 }
		}
	   },
	   "FunctionName": {
		"Fn::Join": [
		 "",
		 [
		  "mytaptrack-test-",
		  {
		   "Ref": "AWS::Region"
		  },
		  "-moveS3Data"
		 ]
		]
	   },
	   "Handler": "s3-move-files.handler",
	   "Layers": [
		{
		 "Ref": "stackLayer"
		}
	   ],
	   "Runtime": "nodejs18.x"
	  },
	  "DependsOn": [
	   "moveS3DataServiceRoleDefaultPolicyD298AEC4",
	   "moveS3DataServiceRole10615805"
	  ],
	  "Metadata": {
	   "aws:cdk:path": "mytaptrack-test/moveS3Data/Resource",
	   "aws:asset:path": "asset.80b4b749598c089fa0e283b2f37e5fa589d9085d3eea27666b0b79e89a2ce469",
	   "aws:asset:is-bundled": false,
	   "aws:asset:property": "Code"
	  }
	 },
	 "S3ReplicationRole": {
	  "Type": "AWS::IAM::Role",
	  "Properties": {
	   "AssumeRolePolicyDocument": {
		"Statement": [
		 {
		  "Action": "sts:AssumeRole",
		  "Effect": "Allow",
		  "Principal": {
		   "Service": "s3.amazonaws.com"
		  }
		 }
		],
		"Version": "2012-10-17"
	   }
	  },
	  "Metadata": {
	   "aws:cdk:path": "mytaptrack-test/S3ReplicationRole/Resource"
	  }
	 },
	 "S3ReplicationRoleDefaultPolicy70F2A590": {
	  "Type": "AWS::IAM::Policy",
	  "Properties": {
	   "PolicyDocument": {
		"Statement": [
		 {
		  "Action": [
		   "s3:GetBucketLocation",
		   "s3:GetBucketVersioning",
		   "s3:GetObject*"
		  ],
		  "Effect": "Allow",
		  "Resource": [
		   {
			"Fn::Join": [
			 "",
			 [
			  "arn:aws:s3:::",
			  {
			   "Fn::Sub": "\${AWS::StackName}-\${AWS::Region}-data"
			  },
			  "/*"
			 ]
			]
		   },
		   {
			"Fn::Join": [
			 "",
			 [
			  "arn:aws:s3:::",
			  {
			   "Fn::Sub": "\${AWS::StackName}-\${AWS::Region}-data"
			  }
			 ]
			]
		   }
		  ]
		 },
		 {
		  "Action": [
		   "s3:ListBucket",
		   "s3:ObjectOwnerOverrideToBucketOwner",
		   "s3:ReplicateDelete",
		   "s3:ReplicateObject"
		  ],
		  "Effect": "Allow",
		  "Resource": [
		   {
			"Fn::Join": [
			 "",
			 [
			  "arn:aws:s3:::",
			  {
			   "Fn::Sub": [
				"\${AWS::StackName}-\${ReplicationRegion}-\${BName}",
				{
				 "ReplicationRegion": "us-east",
				 "BName": "data"
				}
			   ]
			  },
			  "/*"
			 ]
			]
		   },
		   {
			"Fn::Join": [
			 "",
			 [
			  "arn:aws:s3:::",
			  {
			   "Fn::Sub": [
				"\${AWS::StackName}-\${ReplicationRegion}-\${BName}",
				{
				 "ReplicationRegion": "us-east",
				 "BName": "data"
				}
			   ]
			  }
			 ]
			]
		   }
		  ]
		 }
		],
		"Version": "2012-10-17"
	   },
	   "PolicyName": "S3ReplicationRoleDefaultPolicy70F2A590",
	   "Roles": [
		{
		 "Ref": "S3ReplicationRole"
		}
	   ]
	  },
	  "Metadata": {
	   "aws:cdk:path": "mytaptrack-test/S3ReplicationRole/DefaultPolicy/Resource"
	  }
	 },
	 "DataBucketV2": {
	  "Type": "AWS::S3::Bucket",
	  "Properties": {
	   "AccessControl": "Private",
	   "BucketEncryption": {
		"ServerSideEncryptionConfiguration": [
		 {
		  "ServerSideEncryptionByDefault": {
		   "KMSMasterKeyID": {
			"Fn::Select": [
			 1,
			 {
			  "Fn::Split": [
			   "/",
			   {
				"Fn::Select": [
				 5,
				 {
				  "Fn::Split": [
				   ":",
				   {
					"Fn::GetAtt": [
					 "PiiEncryptionKeyV2",
					 "Arn"
					]
				   }
				  ]
				 }
				]
			   }
			  ]
			 }
			]
		   },
		   "SSEAlgorithm": "aws:kms"
		  }
		 }
		]
	   },
	   "BucketName": {
		"Fn::Sub": "\${AWS::StackName}-\${AWS::Region}-data"
	   },
	   "CorsConfiguration": {
		"CorsRules": [
		 {
		  "AllowedHeaders": [
		   "*"
		  ],
		  "AllowedMethods": [
		   "GET",
		   "PUT"
		  ],
		  "AllowedOrigins": [
		   "https://portal.mytaptrack.com",
		   "https://test.mytaptrack-test.com",
		   "https://localhost:8000"
		  ]
		 }
		]
	   },
	   "LoggingConfiguration": {
		"DestinationBucketName": {
		 "Ref": "LoggingBucketNameParameter"
		},
		"LogFilePrefix": {
		 "Fn::Join": [
		  "",
		  [
		   "s3/",
		   {
			"Fn::Sub": "\${AWS::StackName}-\${AWS::Region}-data"
		   },
		   "/"
		  ]
		 ]
		}
	   },
	   "PublicAccessBlockConfiguration": {
		"BlockPublicAcls": true,
		"BlockPublicPolicy": true,
		"IgnorePublicAcls": true,
		"RestrictPublicBuckets": true
	   },
	   "ReplicationConfiguration": {
		"Role": {
		 "Fn::GetAtt": [
		  "S3ReplicationRole",
		  "Arn"
		 ]
		},
		"Rules": [
		 {
		  "DeleteMarkerReplication": {
		   "Status": "Enabled"
		  },
		  "Destination": {
		   "Bucket": {
			"Fn::Join": [
			 "",
			 [
			  "arn:aws:s3:::",
			  {
			   "Fn::Sub": [
				"\${AWS::StackName}-\${ReplicationRegion}-\${BName}",
				{
				 "ReplicationRegion": "us-east",
				 "BName": "data"
				}
			   ]
			  }
			 ]
			]
		   },
		   "EncryptionConfiguration": {
			"ReplicaKmsKeyID": {
			 "Fn::Sub": [
			  "arn:aws:kms:\${SecondRegion}:\${AWS::AccountId}:alias/mytaptrack/pii",
			  {
			   "SecondRegion": "us-east"
			  }
			 ]
			}
		   }
		  },
		  "Filter": {
		   "Prefix": ""
		  },
		  "Priority": 1,
		  "SourceSelectionCriteria": {
		   "ReplicaModifications": {
			"Status": "Enabled"
		   },
		   "SseKmsEncryptedObjects": {
			"Status": "Enabled"
		   }
		  },
		  "Status": "Enabled"
		 }
		]
	   },
	   "Tags": [
		{
		 "Key": "DataType",
		 "Value": "PatientPHI"
		}
	   ],
	   "VersioningConfiguration": {
		"Status": "Enabled"
	   },
	   "WebsiteConfiguration": {
		"ErrorDocument": "error.html",
		"IndexDocument": "index.html"
	   }
	  },
	  "Metadata": {
	   "aws:cdk:path": "mytaptrack-test/DataBucketV2"
	  }
	 },
	 "DataBucketPolicyV2": {
	  "Type": "AWS::S3::BucketPolicy",
	  "Properties": {
	   "Bucket": {
		"Ref": "DataBucketV2"
	   },
	   "PolicyDocument": {
		"Statement": [
		 {
		  "Action": "s3:*",
		  "Condition": {
		   "Bool": {
			"aws:SecureTransport": "false"
		   }
		  },
		  "Effect": "Deny",
		  "Principal": {
		   "AWS": "*"
		  },
		  "Resource": [
		   {
			"Fn::Join": [
			 "",
			 [
			  "arn:aws:s3:::",
			  {
			   "Fn::Sub": "\${AWS::StackName}-\${AWS::Region}-data"
			  },
			  "/*"
			 ]
			]
		   },
		   {
			"Fn::Join": [
			 "",
			 [
			  "arn:aws:s3:::",
			  {
			   "Fn::Sub": "\${AWS::StackName}-\${AWS::Region}-data"
			  }
			 ]
			]
		   }
		  ]
		 }
		],
		"Version": "2012-10-17"
	   }
	  },
	  "Metadata": {
	   "aws:cdk:path": "mytaptrack-test/DataBucketV2/@FromCfnBucket/Policy/Resource"
	  }
	 },
	 "ComplianceBucket": {
	  "Type": "AWS::S3::Bucket",
	  "Properties": {
	   "AccessControl": "Private",
	   "BucketEncryption": {
		"ServerSideEncryptionConfiguration": [
		 {
		  "ServerSideEncryptionByDefault": {
		   "SSEAlgorithm": "AES256"
		  }
		 }
		]
	   },
	   "BucketName": {
		"Fn::Sub": "\${AWS::StackName}-\${AWS::Region}-compliance-v2"
	   },
	   "LoggingConfiguration": {
		"DestinationBucketName": {
		 "Ref": "LoggingBucketNameParameter"
		},
		"LogFilePrefix": {
		 "Fn::Join": [
		  "",
		  [
		   "s3/",
		   {
			"Fn::Sub": "\${AWS::StackName}-\${AWS::Region}-compliance-v2"
		   },
		   "/"
		  ]
		 ]
		}
	   },
	   "PublicAccessBlockConfiguration": {
		"BlockPublicAcls": true,
		"BlockPublicPolicy": true,
		"IgnorePublicAcls": true,
		"RestrictPublicBuckets": true
	   },
	   "ReplicationConfiguration": {
		"Role": {
		 "Fn::GetAtt": [
		  "S3ReplicationRole",
		  "Arn"
		 ]
		},
		"Rules": [
		 {
		  "DeleteMarkerReplication": {
		   "Status": "Enabled"
		  },
		  "Destination": {
		   "Bucket": {
			"Fn::Join": [
			 "",
			 [
			  "arn:aws:s3:::",
			  {
			   "Fn::Sub": [
				"\${AWS::StackName}-\${ReplicationRegion}-\${BName}",
				{
				 "ReplicationRegion": "us-east",
				 "BName": "compliance-v2"
				}
			   ]
			  }
			 ]
			]
		   },
		   "EncryptionConfiguration": {
			"ReplicaKmsKeyID": {
			 "Fn::Sub": [
			  "arn:aws:kms:\${SecondRegion}:\${AWS::AccountId}:alias/mytaptrack/pii",
			  {
			   "SecondRegion": "us-east"
			  }
			 ]
			}
		   }
		  },
		  "Filter": {
		   "Prefix": ""
		  },
		  "Priority": 1,
		  "SourceSelectionCriteria": {
		   "ReplicaModifications": {
			"Status": "Enabled"
		   },
		   "SseKmsEncryptedObjects": {
			"Status": "Enabled"
		   }
		  },
		  "Status": "Enabled"
		 }
		]
	   },
	   "VersioningConfiguration": {
		"Status": "Enabled"
	   }
	  },
	  "Metadata": {
	   "aws:cdk:path": "mytaptrack-test/ComplianceBucket"
	  }
	 },
	 "ComplianceBucketPolicy": {
	  "Type": "AWS::S3::BucketPolicy",
	  "Properties": {
	   "Bucket": {
		"Ref": "ComplianceBucket"
	   },
	   "PolicyDocument": {
		"Statement": [
		 {
		  "Action": "s3:*",
		  "Condition": {
		   "Bool": {
			"aws:SecureTransport": "false"
		   }
		  },
		  "Effect": "Deny",
		  "Principal": {
		   "AWS": "*"
		  },
		  "Resource": [
		   {
			"Fn::Join": [
			 "",
			 [
			  "arn:aws:s3:::",
			  {
			   "Fn::Sub": "\${AWS::StackName}-\${AWS::Region}-compliance-v2"
			  },
			  "/*"
			 ]
			]
		   },
		   {
			"Fn::Join": [
			 "",
			 [
			  "arn:aws:s3:::",
			  {
			   "Fn::Sub": "\${AWS::StackName}-\${AWS::Region}-compliance-v2"
			  }
			 ]
			]
		   }
		  ]
		 }
		],
		"Version": "2012-10-17"
	   }
	  },
	  "Metadata": {
	   "aws:cdk:path": "mytaptrack-test/ComplianceBucket/@FromCfnBucket/Policy/Resource"
	  }
	 },
	 "replicationFunctionServiceRole78D06418": {
	  "Type": "AWS::IAM::Role",
	  "Properties": {
	   "AssumeRolePolicyDocument": {
		"Statement": [
		 {
		  "Action": "sts:AssumeRole",
		  "Effect": "Allow",
		  "Principal": {
		   "Service": "lambda.amazonaws.com"
		  }
		 }
		],
		"Version": "2012-10-17"
	   },
	   "ManagedPolicyArns": [
		{
		 "Fn::Join": [
		  "",
		  [
		   "arn:",
		   {
			"Ref": "AWS::Partition"
		   },
		   ":iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
		  ]
		 ]
		}
	   ]
	  },
	  "Metadata": {
	   "aws:cdk:path": "mytaptrack-test/replicationFunction/ServiceRole/Resource"
	  }
	 },
	 "replicationFunctionServiceRoleDefaultPolicyC7BFA054": {
	  "Type": "AWS::IAM::Policy",
	  "Properties": {
	   "PolicyDocument": {
		"Statement": [
		 {
		  "Action": "sqs:SendMessage",
		  "Effect": "Allow",
		  "Resource": {
		   "Fn::GetAtt": [
			"stackDeadLetterQueue",
			"Arn"
		   ]
		  }
		 }
		],
		"Version": "2012-10-17"
	   },
	   "PolicyName": "replicationFunctionServiceRoleDefaultPolicyC7BFA054",
	   "Roles": [
		{
		 "Ref": "replicationFunctionServiceRole78D06418"
		}
	   ]
	  },
	  "Metadata": {
	   "aws:cdk:path": "mytaptrack-test/replicationFunction/ServiceRole/DefaultPolicy/Resource"
	  }
	 },
	 "replicationFunction": {
	  "Type": "AWS::Lambda::Function",
	  "Properties": {
	   "Code": {
		"S3Bucket": {
		 "Fn::Sub": "cdk-hnb659fds-assets-\${AWS::AccountId}-\${AWS::Region}"
		},
		"S3Key": "80b4b749598c089fa0e283b2f37e5fa589d9085d3eea27666b0b79e89a2ce469.zip"
	   },
	   "Role": {
		"Fn::GetAtt": [
		 "replicationFunctionServiceRole78D06418",
		 "Arn"
		]
	   },
	   "CodeSigningConfigArn": {
		"Fn::GetAtt": [
		 "CodeSigningConfigD8D41C10",
		 "CodeSigningConfigArn"
		]
	   },
	   "DeadLetterConfig": {
		"TargetArn": {
		 "Fn::GetAtt": [
		  "stackDeadLetterQueue",
		  "Arn"
		 ]
		}
	   },
	   "Environment": {
		"Variables": {
		 "LUMIGO_SECRET_MASKING_REGEX": {
		  "Ref": "LumigoAttributeMaskingParameter"
		 },
		 "LUMIGO_DOMAINS_SCRUBBER": {
		  "Ref": "LumigoDomainScrubbingParameter"
		 },
		 "LUMIGO_TOKEN": {
		  "Ref": "LumigoTokenParameter"
		 },
		 "Debug": {
		  "Ref": "DebugParameter"
		 }
		}
	   },
	   "Handler": "dynamo-existing.handler",
	   "Layers": [
		{
		 "Ref": "stackLayer"
		}
	   ],
	   "Runtime": "nodejs18.x"
	  },
	  "DependsOn": [
	   "replicationFunctionServiceRoleDefaultPolicyC7BFA054",
	   "replicationFunctionServiceRole78D06418"
	  ],
	  "Metadata": {
	   "aws:cdk:path": "mytaptrack-test/replicationFunction/Resource",
	   "aws:asset:path": "asset.80b4b749598c089fa0e283b2f37e5fa589d9085d3eea27666b0b79e89a2ce469",
	   "aws:asset:is-bundled": false,
	   "aws:asset:property": "Code"
	  }
	 },
	 "replicationFunctionParam": {
	  "Type": "AWS::SSM::Parameter",
	  "Properties": {
	   "Type": "String",
	   "Value": {
		"Fn::GetAtt": [
		 "replicationFunction",
		 "Arn"
		]
	   },
	   "Name": "/test/dynamo/replication/arn"
	  },
	  "Metadata": {
	   "aws:cdk:path": "mytaptrack-test/replicationFunctionParam"
	  }
	 },
	 "DynamoTablePrimary": {
	  "Type": "AWS::DynamoDB::Table",
	  "Properties": {
	   "KeySchema": [
		{
		 "AttributeName": "pk",
		 "KeyType": "HASH"
		},
		{
		 "AttributeName": "sk",
		 "KeyType": "RANGE"
		}
	   ],
	   "AttributeDefinitions": [
		{
		 "AttributeName": "pk",
		 "AttributeType": "S"
		},
		{
		 "AttributeName": "sk",
		 "AttributeType": "S"
		},
		{
		 "AttributeName": "lpk",
		 "AttributeType": "S"
		},
		{
		 "AttributeName": "spk",
		 "AttributeType": "S"
		}
	   ],
	   "BillingMode": "PAY_PER_REQUEST",
	   "GlobalSecondaryIndexes": [
		{
		 "IndexName": "License",
		 "KeySchema": [
		  {
		   "AttributeName": "lpk",
		   "KeyType": "HASH"
		  },
		  {
		   "AttributeName": "spk",
		   "KeyType": "RANGE"
		  }
		 ],
		 "Projection": {
		  "ProjectionType": "ALL"
		 }
		}
	   ],
	   "PointInTimeRecoverySpecification": {
		"PointInTimeRecoveryEnabled": true
	   },
	   "SSESpecification": {
		"KMSMasterKeyId": {
		 "Fn::GetAtt": [
		  "PiiEncryptionKeyV2",
		  "Arn"
		 ]
		},
		"SSEEnabled": true,
		"SSEType": "KMS"
	   },
	   "StreamSpecification": {
		"StreamViewType": "NEW_AND_OLD_IMAGES"
	   },
	   "TableName": {
		"Fn::Join": [
		 "",
		 [
		  {
		   "Ref": "AWS::StackName"
		  },
		  "-mytaptrack-test-primary"
		 ]
		]
	   },
	   "Tags": [
		{
		 "Key": "phi",
		 "Value": "PatientDNPHI"
		}
	   ]
	  },
	  "UpdateReplacePolicy": "Retain",
	  "DeletionPolicy": "Retain",
	  "Metadata": {
	   "aws:cdk:path": "mytaptrack-test/DynamoTablePrimary/Resource"
	  }
	 },
	 "DynamoTablePrimaryReplication": {
	  "Type": "AWS::CloudFormation::CustomResource",
	  "Properties": {
	   "ServiceToken": {
		"Fn::GetAtt": [
		 "replicationFunction",
		 "Arn"
		]
	   },
	   "TableName": {
		"Fn::Join": [
		 "",
		 [
		  {
		   "Ref": "AWS::StackName"
		  },
		  "-mytaptrack-test-primary"
		 ]
		]
	   },
	   "PrimaryRegion": true,
	   "KMSMasterKeyId": {
		"Fn::Select": [
		 1,
		 {
		  "Fn::Split": [
		   "/",
		   {
			"Fn::Select": [
			 5,
			 {
			  "Fn::Split": [
			   ":",
			   {
				"Fn::GetAtt": [
				 "PiiEncryptionKeyV2",
				 "Arn"
				]
			   }
			  ]
			 }
			]
		   }
		  ]
		 }
		]
	   },
	   "Regions": [
		"us-west-2",
		"us-east"
	   ],
	   "Update": "2020-02-12"
	  },
	  "UpdateReplacePolicy": "Delete",
	  "DeletionPolicy": "Delete",
	  "Metadata": {
	   "aws:cdk:path": "mytaptrack-test/DynamoTablePrimaryReplication/Default"
	  }
	 },
	 "DynamoTableData": {
	  "Type": "AWS::DynamoDB::Table",
	  "Properties": {
	   "KeySchema": [
		{
		 "AttributeName": "pk",
		 "KeyType": "HASH"
		},
		{
		 "AttributeName": "sk",
		 "KeyType": "RANGE"
		}
	   ],
	   "AttributeDefinitions": [
		{
		 "AttributeName": "pk",
		 "AttributeType": "S"
		},
		{
		 "AttributeName": "sk",
		 "AttributeType": "S"
		},
		{
		 "AttributeName": "studentId",
		 "AttributeType": "S"
		},
		{
		 "AttributeName": "tsk",
		 "AttributeType": "S"
		},
		{
		 "AttributeName": "lpk",
		 "AttributeType": "S"
		},
		{
		 "AttributeName": "lsk",
		 "AttributeType": "S"
		},
		{
		 "AttributeName": "deviceId",
		 "AttributeType": "S"
		},
		{
		 "AttributeName": "dsk",
		 "AttributeType": "S"
		},
		{
		 "AttributeName": "appId",
		 "AttributeType": "S"
		}
	   ],
	   "BillingMode": "PAY_PER_REQUEST",
	   "GlobalSecondaryIndexes": [
		{
		 "IndexName": "Student",
		 "KeySchema": [
		  {
		   "AttributeName": "studentId",
		   "KeyType": "HASH"
		  },
		  {
		   "AttributeName": "tsk",
		   "KeyType": "RANGE"
		  }
		 ],
		 "Projection": {
		  "ProjectionType": "ALL"
		 }
		},
		{
		 "IndexName": "License",
		 "KeySchema": [
		  {
		   "AttributeName": "lpk",
		   "KeyType": "HASH"
		  },
		  {
		   "AttributeName": "lsk",
		   "KeyType": "RANGE"
		  }
		 ],
		 "Projection": {
		  "ProjectionType": "ALL"
		 }
		},
		{
		 "IndexName": "Device",
		 "KeySchema": [
		  {
		   "AttributeName": "deviceId",
		   "KeyType": "HASH"
		  },
		  {
		   "AttributeName": "dsk",
		   "KeyType": "RANGE"
		  }
		 ],
		 "Projection": {
		  "ProjectionType": "ALL"
		 }
		},
		{
		 "IndexName": "App",
		 "KeySchema": [
		  {
		   "AttributeName": "appId",
		   "KeyType": "HASH"
		  },
		  {
		   "AttributeName": "deviceId",
		   "KeyType": "RANGE"
		  }
		 ],
		 "Projection": {
		  "ProjectionType": "ALL"
		 }
		}
	   ],
	   "PointInTimeRecoverySpecification": {
		"PointInTimeRecoveryEnabled": true
	   },
	   "SSESpecification": {
		"KMSMasterKeyId": {
		 "Fn::GetAtt": [
		  "PiiEncryptionKeyV2",
		  "Arn"
		 ]
		},
		"SSEEnabled": true,
		"SSEType": "KMS"
	   },
	   "StreamSpecification": {
		"StreamViewType": "NEW_AND_OLD_IMAGES"
	   },
	   "TableName": {
		"Fn::Join": [
		 "",
		 [
		  {
		   "Ref": "AWS::StackName"
		  },
		  "-mytaptrack-test-data"
		 ]
		]
	   },
	   "Tags": [
		{
		 "Key": "phi",
		 "Value": "PatientDNPHI"
		}
	   ]
	  },
	  "UpdateReplacePolicy": "Retain",
	  "DeletionPolicy": "Retain",
	  "Metadata": {
	   "aws:cdk:path": "mytaptrack-test/DynamoTableData/Resource"
	  }
	 },
	 "DynamoTableDataReplication": {
	  "Type": "AWS::CloudFormation::CustomResource",
	  "Properties": {
	   "ServiceToken": {
		"Fn::GetAtt": [
		 "replicationFunction",
		 "Arn"
		]
	   },
	   "TableName": {
		"Fn::Join": [
		 "",
		 [
		  {
		   "Ref": "AWS::StackName"
		  },
		  "-mytaptrack-test-data"
		 ]
		]
	   },
	   "PrimaryRegion": true,
	   "KMSMasterKeyId": {
		"Fn::Select": [
		 1,
		 {
		  "Fn::Split": [
		   "/",
		   {
			"Fn::Select": [
			 5,
			 {
			  "Fn::Split": [
			   ":",
			   {
				"Fn::GetAtt": [
				 "PiiEncryptionKeyV2",
				 "Arn"
				]
			   }
			  ]
			 }
			]
		   }
		  ]
		 }
		]
	   },
	   "Regions": [
		"us-west-2",
		"us-east"
	   ],
	   "Update": "2020-02-12"
	  },
	  "UpdateReplacePolicy": "Delete",
	  "DeletionPolicy": "Delete",
	  "Metadata": {
	   "aws:cdk:path": "mytaptrack-test/DynamoTableDataReplication/Default"
	  }
	 },
	 "DataEventBus": {
	  "Type": "AWS::Events::EventBus",
	  "Properties": {
	   "Name": "data-events"
	  },
	  "Metadata": {
	   "aws:cdk:path": "mytaptrack-test/DataEventBus"
	  }
	 },
	 "TimestreamDB": {
	  "Type": "AWS::Timestream::Database",
	  "Properties": {
	   "DatabaseName": {
		"Fn::Sub": "\${AWS::StackName}"
	   },
	   "KmsKeyId": {
		"Fn::Select": [
		 1,
		 {
		  "Fn::Split": [
		   "/",
		   {
			"Fn::Select": [
			 5,
			 {
			  "Fn::Split": [
			   ":",
			   {
				"Fn::GetAtt": [
				 "PiiEncryptionKeyV2",
				 "Arn"
				]
			   }
			  ]
			 }
			]
		   }
		  ]
		 }
		]
	   }
	  },
	  "Metadata": {
	   "aws:cdk:path": "mytaptrack-test/TimestreamDB"
	  }
	 },
	 "EventTimestreamTable": {
	  "Type": "AWS::Timestream::Table",
	  "Properties": {
	   "DatabaseName": {
		"Fn::Sub": "\${AWS::StackName}"
	   },
	   "RetentionProperties": {
		"magneticStoreRetentionPeriodInDays": 2555,
		"memoryStoreRetentionPeriodInHours": 168
	   },
	   "TableName": "events"
	  },
	  "Metadata": {
	   "aws:cdk:path": "mytaptrack-test/EventTimestreamTable"
	  }
	 },
	 "DataTimestreamTable": {
	  "Type": "AWS::Timestream::Table",
	  "Properties": {
	   "DatabaseName": {
		"Fn::Sub": "\${AWS::StackName}"
	   },
	   "RetentionProperties": {
		"magneticStoreRetentionPeriodInDays": 2555,
		"memoryStoreRetentionPeriodInHours": 168
	   },
	   "TableName": "data"
	  },
	  "Metadata": {
	   "aws:cdk:path": "mytaptrack-test/DataTimestreamTable"
	  }
	 },
	 "CognitoUserPool": {
	  "Type": "AWS::Cognito::UserPool",
	  "Properties": {
	   "AccountRecoverySetting": {
		"RecoveryMechanisms": [
		 {
		  "Name": "verified_email",
		  "Priority": 1
		 }
		]
	   },
	   "AdminCreateUserConfig": {
		"AllowAdminCreateUserOnly": false
	   },
	   "AutoVerifiedAttributes": [
		"email"
	   ],
	   "EmailVerificationMessage": "The verification code to your new account is {####}",
	   "EmailVerificationSubject": "Verify your new account",
	   "Schema": [
		{
		 "AttributeDataType": "String",
		 "Mutable": true,
		 "Name": "name"
		}
	   ],
	   "SmsVerificationMessage": "The verification code to your new account is {####}",
	   "UserPoolName": {
		"Ref": "AWS::StackName"
	   },
	   "VerificationMessageTemplate": {
		"DefaultEmailOption": "CONFIRM_WITH_CODE",
		"EmailMessage": "The verification code to your new account is {####}",
		"EmailSubject": "Verify your new account",
		"SmsMessage": "The verification code to your new account is {####}"
	   }
	  },
	  "UpdateReplacePolicy": "Retain",
	  "DeletionPolicy": "Retain",
	  "Metadata": {
	   "aws:cdk:path": "mytaptrack-test/CognitoUserPool/Resource"
	  }
	 },
	 "CognitoWebsiteClient": {
	  "Type": "AWS::Cognito::UserPoolClient",
	  "Properties": {
	   "UserPoolId": {
		"Ref": "CognitoUserPool"
	   },
	   "AccessTokenValidity": 600,
	   "AllowedOAuthFlows": [
		"code"
	   ],
	   "AllowedOAuthFlowsUserPoolClient": true,
	   "AllowedOAuthScopes": [
		"email",
		"openid",
		"profile",
		"aws.cognito.signin.user.admin"
	   ],
	   "CallbackURLs": [
		"https://localhost:8000",
		"https://localhost:8000/dashboard",
		"https://au.portal.mytaptrack-test.com",
		"https://portal.mytaptrack.com",
		"https://au.portal.mytaptrack-test.com/dashboard",
		"https://portal.mytaptrack.com/dashboard"
	   ],
	   "ClientName": "website",
	   "RefreshTokenValidity": 43200,
	   "SupportedIdentityProviders": [
		"COGNITO"
	   ],
	   "TokenValidityUnits": {
		"AccessToken": "minutes",
		"RefreshToken": "minutes"
	   }
	  },
	  "Metadata": {
	   "aws:cdk:path": "mytaptrack-test/CognitoUserPool/CognitoWebsiteClient/Resource"
	  }
	 },
	 "SESEmailTagged": {
	  "Type": "AWS::SES::ConfigurationSet",
	  "Properties": {
	   "Name": "mytaptrack-test-email-tagged",
	   "SuppressionOptions": {
		"SuppressedReasons": [
		 "COMPLIANT"
		]
	   }
	  },
	  "Metadata": {
	   "aws:cdk:path": "mytaptrack-test/SESEmailTagged"
	  }
	 },
	 "SESEmailContactList": {
	  "Type": "AWS::SES::ContactList",
	  "Properties": {
	   "ContactListName": "mytaptrack-test-contacts",
	   "Description": "This list is to suppress tag notifications for users that don't want to receive them.",
	   "Topics": [
		{
		 "DefaultSubscriptionStatus": "OPT_OUT",
		 "Description": "These emails are sent when your email address is tagged in a note",
		 "DisplayName": "Tagging Notifications",
		 "TopicName": "TaggingNotifications"
		}
	   ]
	  },
	  "Metadata": {
	   "aws:cdk:path": "mytaptrack-test/SESEmailContactList"
	  }
	 },
	 "SecurityStackNestedStackSecurityStackNestedStackResource0F9AF0FF": {
	  "Type": "AWS::CloudFormation::Stack",
	  "Properties": {
	   "TemplateURL": {
		"Fn::Join": [
		 "",
		 [
		  "https://s3.",
		  {
		   "Ref": "AWS::Region"
		  },
		  ".",
		  {
		   "Ref": "AWS::URLSuffix"
		  },
		  "/",
		  {
		   "Fn::Sub": "cdk-hnb659fds-assets-\${AWS::AccountId}-\${AWS::Region}"
		  },
		  "/c2a0e59fb3b088b5598b17de31f55060b6fb97873e95740ed691623ec1ae3290.json"
		 ]
		]
	   },
	   "Parameters": {
		"referencetomytaptracktestPiiEncryptionKeyV2FD81897CArn": {
		 "Fn::GetAtt": [
		  "PiiEncryptionKeyV2",
		  "Arn"
		 ]
		}
	   }
	  },
	  "UpdateReplacePolicy": "Delete",
	  "DeletionPolicy": "Delete",
	  "Metadata": {
	   "aws:cdk:path": "mytaptrack-test/SecurityStack.NestedStack/SecurityStack.NestedStackResource",
	   "aws:asset:path": "mytaptracktestSecurityStackE5B050C9.nested.template.json",
	   "aws:asset:property": "TemplateURL"
	  }
	 },
	 "CDKMetadata": {
	  "Type": "AWS::CDK::Metadata",
	  "Properties": {
	   "Analytics": "v2:deflate64:H4sIAAAAAAAA/2VSTVPjMAz9Ldxd7wIHdo+0u1xghtIue2XURM2IJjZYMkwm4/+OHKdfw8V6enq29XVlb27szwv45FlV72YtbeywFqh2ZrF1SwjQoWAwK2QfQ4VGhS8DX9thHqsdyhwYs7J4ppilb6nqj3Txk2mh29RghwfoMfzHwORdVp37vsY1NY5cs/BuS01WfCfvoqtkur/HyfD1CzCjsL3NxjB3uZyg9461nBaWzK5jOyh1j725bQk4xwtQKhl4owYEP6G3OZGW0MkCg9CWKuUNa1oY9JeS3jL4LbVjT84ZTe5df3qKGMdoAeN57NeJmwyBJr/y5bHRHoV7DX5oOvrsKk6yyf7N/DxyMnXvoPO1jvUfbEpwBMkIdcgSMH+j7B8Q2EzjnBSV1wrE2+GZMSy9b3PsgPeg9OQ0VBitGEtvy8xigDylNUoZqdM1kwdiScmM49K9a7RhOfoY5S2qLrL47rB8ucATfNhTfaumsgFON8W+8o+Py9/2l728eGWiWYguF2tXxX4BDe+VKPQCAAA="
	  },
	  "Metadata": {
	   "aws:cdk:path": "mytaptrack-test/CDKMetadata/Default"
	  },
	  "Condition": "CDKMetadataAvailable"
	 }
	},
	"Outputs": {
	 "moveS3DataOutput": {
	  "Value": {
	   "Fn::GetAtt": [
		"moveS3Data",
		"Arn"
	   ]
	  },
	  "Export": {
	   "Name": "mytaptrack-test-moves3data-arn"
	  }
	 },
	 "TimestreamDatabase": {
	  "Value": {
	   "Ref": "TimestreamDB"
	  },
	  "Export": {
	   "Name": "mytaptrack-test-timestream-name"
	  }
	 },
	 "TimestreamDatabaseArn": {
	  "Value": {
	   "Fn::GetAtt": [
		"TimestreamDB",
		"Arn"
	   ]
	  },
	  "Export": {
	   "Name": "mytaptrack-test-timestream-arn"
	  }
	 },
	 "TimestreamEventTable": {
	  "Value": {
	   "Fn::GetAtt": [
		"EventTimestreamTable",
		"Name"
	   ]
	  },
	  "Export": {
	   "Name": "mytaptrack-test-timestream-event-name"
	  }
	 },
	 "TimestreamEventTkeyPolicyableArn": {
	  "Value": {
	   "Fn::GetAtt": [
		"EventTimestreamTable",
		"Arn"
	   ]
	  },
	  "Export": {
	   "Name": "mytaptrack-test-timestream-event-arn"
	  }
	 },
	 "TimestreamDataTableArn": {
	  "Value": {
	   "Fn::GetAtt": [
		"DataTimestreamTable",
		"Arn"
	   ]
	  },
	  "Export": {
	   "Name": "mytaptrack-test-timestream-data-arn"
	  }
	 },
	 "DynamoTablePrimaryArn": {
	  "Value": {
	   "Fn::GetAtt": [
		"DynamoTablePrimary",
		"Arn"
	   ]
	  },
	  "Export": {
	   "Name": {
		"Fn::Join": [
		 "",
		 [
		  {
		   "Ref": "AWS::StackName"
		  },
		  "-DynamoTablePrimaryArn"
		 ]
		]
	   }
	  }
	 },
	 "DynamoTablePrimaryStreamArn": {
	  "Value": {
	   "Fn::GetAtt": [
		"DynamoTablePrimary",
		"StreamArn"
	   ]
	  },
	  "Export": {
	   "Name": {
		"Fn::Join": [
		 "",
		 [
		  {
		   "Ref": "AWS::StackName"
		  },
		  "-DynamoTablePrimaryStreamArn"
		 ]
		]
	   }
	  }
	 },
	 "DynamoTablePrimaryTable": {
	  "Value": {
	   "Ref": "DynamoTablePrimary"
	  },
	  "Export": {
	   "Name": {
		"Fn::Join": [
		 "",
		 [
		  {
		   "Ref": "AWS::StackName"
		  },
		  "-DynamoTablePrimary"
		 ]
		]
	   }
	  }
	 },
	 "DynamoTableDataArn": {
	  "Value": {
	   "Fn::GetAtt": [
		"DynamoTableData",
		"Arn"
	   ]
	  },
	  "Export": {
	   "Name": {
		"Fn::Join": [
		 "",
		 [
		  {
		   "Ref": "AWS::StackName"
		  },
		  "-DynamoTableDataArn"
		 ]
		]
	   }
	  }
	 },
	 "DynamoTableDataStreamArn": {
	  "Value": {
	   "Fn::GetAtt": [
		"DynamoTableData",
		"StreamArn"
	   ]
	  },
	  "Export": {
	   "Name": {
		"Fn::Join": [
		 "",
		 [
		  {
		   "Ref": "AWS::StackName"
		  },
		  "-DynamoTableDataStreamArn"
		 ]
		]
	   }
	  }
	 },
	 "DynamoTableDataTable": {
	  "Value": {
	   "Ref": "DynamoTableData"
	  },
	  "Export": {
	   "Name": {
		"Fn::Join": [
		 "",
		 [
		  {
		   "Ref": "AWS::StackName"
		  },
		  "-DynamoTableData"
		 ]
		]
	   }
	  }
	 },
	 "PiiEncryptionKeyName": {
	  "Value": {
	   "Fn::Select": [
		1,
		{
		 "Fn::Split": [
		  "/",
		  {
		   "Fn::Select": [
			5,
			{
			 "Fn::Split": [
			  ":",
			  {
			   "Fn::GetAtt": [
				"PiiEncryptionKeyV2",
				"Arn"
			   ]
			  }
			 ]
			}
		   ]
		  }
		 ]
		}
	   ]
	  },
	  "Export": {
	   "Name": "mytaptrack-test-PiiEncryptionKey"
	  }
	 },
	 "PiiEncryptionKeyArn": {
	  "Value": {
	   "Fn::GetAtt": [
		"PiiEncryptionKeyV2",
		"Arn"
	   ]
	  },
	  "Export": {
	   "Name": "mytaptrack-test-PiiEncryptionKeyArn"
	  }
	 },
	 "PiiEncryptionAlias": {
	  "Value": "alias/mytaptrack/pii",
	  "Export": {
	   "Name": "mytaptrack-test-PiiEncryptionAlias"
	  }
	 },
	 "PiiEncryptionAliasArn": {
	  "Value": {
	   "Fn::Join": [
		"",
		[
		 "arn:",
		 {
		  "Ref": "AWS::Partition"
		 },
		 ":kms:",
		 {
		  "Ref": "AWS::Region"
		 },
		 ":",
		 {
		  "Ref": "AWS::AccountId"
		 },
		 ":alias/mytaptrack/pii"
		]
	   ]
	  },
	  "Export": {
	   "Name": "mytaptrack-test-PiiEncryptionAlias"
	  }
	 },
	 "DataBucketV2Name": {
	  "Value": {
	   "Ref": "DataBucketV2"
	  },
	  "Export": {
	   "Name": {
		"Fn::Join": [
		 "",
		 [
		  {
		   "Ref": "AWS::StackName"
		  },
		  "-DataBucketV2Name"
		 ]
		]
	   }
	  }
	 },
	 "DataBucketV2Arn": {
	  "Value": {
	   "Ref": "DataBucketV2"
	  },
	  "Export": {
	   "Name": {
		"Fn::Join": [
		 "",
		 [
		  {
		   "Ref": "AWS::StackName"
		  },
		  "-DataBucketV2Name"
		 ]
		]
	   }
	  }
	 },
	 "EventBus": {
	  "Value": {
	   "Ref": "DataEventBus"
	  },
	  "Export": {
	   "Name": "mytaptrack-test-DataEventBus"
	  }
	 },
	 "EventBusArn": {
	  "Value": {
	   "Fn::GetAtt": [
		"DataEventBus",
		"Arn"
	   ]
	  },
	  "Export": {
	   "Name": "mytaptrack-test-DataEventBusArn"
	  }
	 },
	 "sesUserTagConfigSet": {
	  "Value": {
	   "Ref": "SESEmailTagged"
	  },
	  "Export": {
	   "Name": "mytaptrack-test-ses-conf-user-tag"
	  }
	 },
	 "sesContactList": {
	  "Value": {
	   "Ref": "SESEmailContactList"
	  },
	  "Export": {
	   "Name": "mytaptrack-test-ses-contacts"
	  }
	 }
	},
	"Conditions": {
	 "CDKMetadataAvailable": {
	  "Fn::Or": [
	   {
		"Fn::Or": [
		 {
		  "Fn::Equals": [
		   {
			"Ref": "AWS::Region"
		   },
		   "af-south-1"
		  ]
		 },
		 {
		  "Fn::Equals": [
		   {
			"Ref": "AWS::Region"
		   },
		   "ap-east-1"
		  ]
		 },
		 {
		  "Fn::Equals": [
		   {
			"Ref": "AWS::Region"
		   },
		   "ap-northeast-1"
		  ]
		 },
		 {
		  "Fn::Equals": [
		   {
			"Ref": "AWS::Region"
		   },
		   "ap-northeast-2"
		  ]
		 },
		 {
		  "Fn::Equals": [
		   {
			"Ref": "AWS::Region"
		   },
		   "ap-south-1"
		  ]
		 },
		 {
		  "Fn::Equals": [
		   {
			"Ref": "AWS::Region"
		   },
		   "ap-southeast-1"
		  ]
		 },
		 {
		  "Fn::Equals": [
		   {
			"Ref": "AWS::Region"
		   },
		   "ap-southeast-2"
		  ]
		 },
		 {
		  "Fn::Equals": [
		   {
			"Ref": "AWS::Region"
		   },
		   "ca-central-1"
		  ]
		 },
		 {
		  "Fn::Equals": [
		   {
			"Ref": "AWS::Region"
		   },
		   "cn-north-1"
		  ]
		 },
		 {
		  "Fn::Equals": [
		   {
			"Ref": "AWS::Region"
		   },
		   "cn-northwest-1"
		  ]
		 }
		]
	   },
	   {
		"Fn::Or": [
		 {
		  "Fn::Equals": [
		   {
			"Ref": "AWS::Region"
		   },
		   "eu-central-1"
		  ]
		 },
		 {
		  "Fn::Equals": [
		   {
			"Ref": "AWS::Region"
		   },
		   "eu-north-1"
		  ]
		 },
		 {
		  "Fn::Equals": [
		   {
			"Ref": "AWS::Region"
		   },
		   "eu-south-1"
		  ]
		 },
		 {
		  "Fn::Equals": [
		   {
			"Ref": "AWS::Region"
		   },
		   "eu-west-1"
		  ]
		 },
		 {
		  "Fn::Equals": [
		   {
			"Ref": "AWS::Region"
		   },
		   "eu-west-2"
		  ]
		 },
		 {
		  "Fn::Equals": [
		   {
			"Ref": "AWS::Region"
		   },
		   "eu-west-3"
		  ]
		 },
		 {
		  "Fn::Equals": [
		   {
			"Ref": "AWS::Region"
		   },
		   "me-south-1"
		  ]
		 },
		 {
		  "Fn::Equals": [
		   {
			"Ref": "AWS::Region"
		   },
		   "sa-east-1"
		  ]
		 },
		 {
		  "Fn::Equals": [
		   {
			"Ref": "AWS::Region"
		   },
		   "us-east-1"
		  ]
		 },
		 {
		  "Fn::Equals": [
		   {
			"Ref": "AWS::Region"
		   },
		   "us-east-2"
		  ]
		 }
		]
	   },
	   {
		"Fn::Or": [
		 {
		  "Fn::Equals": [
		   {
			"Ref": "AWS::Region"
		   },
		   "us-west-1"
		  ]
		 },
		 {
		  "Fn::Equals": [
		   {
			"Ref": "AWS::Region"
		   },
		   "us-west-2"
		  ]
		 }
		]
	   }
	  ]
	 }
	},
	"Rules": {
	 "CheckBootstrapVersion": {
	  "Assertions": [
	   {
		"Assert": {
		 "Fn::Not": [
		  {
		   "Fn::Contains": [
			[
			 "1",
			 "2",
			 "3",
			 "4",
			 "5"
			],
			{
			 "Ref": "BootstrapVersion"
			}
		   ]
		  }
		 ]
		},
		"AssertDescription": "CDK bootstrap stack version 6 required. Please run 'cdk bootstrap' with a recent version of the CDK CLI."
	   }
	  ]
	 }
	}
   }`;

describe('json', () => {
    test('existing', () => {
        const jsonObject = JSON.parse(jsonString);
        const sortedJson = sortKeys(jsonObject);
		fs.writeFileSync('./output.json', JSON.stringify(sortedJson, null, '  '));
    });
});