# System Health Monitoring

## Overview

This document outlines the comprehensive health monitoring strategy for the MyTapTrack system, including key metrics, monitoring tools, and response procedures.

## Health Check Architecture

### Health Check Endpoints

#### API Health Checks
```bash
# GraphQL API Health
curl -X POST https://api-{stage}.mytaptrack.com/graphql \
  -H "Content-Type: application/json" \
  -d '{"query": "query { health { status timestamp } }"}'

# REST API Health  
curl https://api-{stage}.mytaptrack.com/health

# Device API Health
curl https://device-api-{stage}.mytaptrack.com/health
```

#### Database Health Checks
```bash
# DynamoDB table health
aws dynamodb describe-table --table-name mytaptrack-users-{stage} \
  --query 'Table.TableStatus'

# Check table metrics
aws cloudwatch get-metric-statistics \
  --namespace AWS/DynamoDB \
  --metric-name ConsumedReadCapacityUnits \
  --dimensions Name=TableName,Value=mytaptrack-users-{stage} \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Sum
```

#### Infrastructure Health Checks
```bash
# Lambda function health
aws lambda invoke --function-name mytaptrack-health-check-{stage} \
  --payload '{}' response.json

# EventBridge health
aws events list-rules --name-prefix mytaptrack-{stage}

# Cognito health
aws cognito-idp describe-user-pool --user-pool-id {user-pool-id}
```

## Key Health Metrics

### System Availability Metrics

#### API Availability
- **Metric**: `AWS/ApiGateway/Count` and `AWS/ApiGateway/4XXError`
- **Target**: 99.9% availability (< 0.1% error rate)
- **Measurement**: 5-minute intervals
- **Alert Threshold**: > 1% error rate for 10 minutes

```json
{
  "MetricName": "APIAvailability",
  "Namespace": "MyTapTrack/Health",
  "Dimensions": [
    {"Name": "Environment", "Value": "{stage}"},
    {"Name": "API", "Value": "GraphQL"}
  ],
  "Statistic": "Average",
  "Period": 300,
  "EvaluationPeriods": 2,
  "Threshold": 99.0,
  "ComparisonOperator": "LessThanThreshold"
}
```

#### Database Availability
- **Metric**: `AWS/DynamoDB/SystemErrors`
- **Target**: Zero system errors
- **Measurement**: 1-minute intervals
- **Alert Threshold**: Any system error

#### Lambda Function Health
- **Metric**: `AWS/Lambda/Errors` and `AWS/Lambda/Duration`
- **Target**: < 0.1% error rate, < 5000ms duration
- **Measurement**: 5-minute intervals
- **Alert Threshold**: > 1% error rate or > 10000ms duration

### Performance Health Metrics

#### Response Time Health
```bash
# API Gateway response times
aws cloudwatch get-metric-statistics \
  --namespace AWS/ApiGateway \
  --metric-name Latency \
  --dimensions Name=ApiName,Value=mytaptrack-api-{stage} \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Average,Maximum
```

#### Database Performance Health
```bash
# DynamoDB read/write latency
aws cloudwatch get-metric-statistics \
  --namespace AWS/DynamoDB \
  --metric-name SuccessfulRequestLatency \
  --dimensions Name=TableName,Value=mytaptrack-users-{stage} Name=Operation,Value=GetItem \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Average,Maximum
```

## Health Monitoring Dashboard

### CloudWatch Dashboard Configuration

```json
{
  "widgets": [
    {
      "type": "metric",
      "properties": {
        "metrics": [
          ["AWS/ApiGateway", "Count", "ApiName", "mytaptrack-api-{stage}"],
          ["AWS/ApiGateway", "4XXError", "ApiName", "mytaptrack-api-{stage}"],
          ["AWS/ApiGateway", "5XXError", "ApiName", "mytaptrack-api-{stage}"]
        ],
        "period": 300,
        "stat": "Sum",
        "region": "us-east-1",
        "title": "API Request Metrics"
      }
    },
    {
      "type": "metric",
      "properties": {
        "metrics": [
          ["AWS/Lambda", "Duration", "FunctionName", "mytaptrack-graphql-{stage}"],
          ["AWS/Lambda", "Errors", "FunctionName", "mytaptrack-graphql-{stage}"],
          ["AWS/Lambda", "Invocations", "FunctionName", "mytaptrack-graphql-{stage}"]
        ],
        "period": 300,
        "stat": "Average",
        "region": "us-east-1",
        "title": "Lambda Function Health"
      }
    },
    {
      "type": "metric",
      "properties": {
        "metrics": [
          ["AWS/DynamoDB", "ConsumedReadCapacityUnits", "TableName", "mytaptrack-users-{stage}"],
          ["AWS/DynamoDB", "ConsumedWriteCapacityUnits", "TableName", "mytaptrack-users-{stage}"],
          ["AWS/DynamoDB", "ThrottledRequests", "TableName", "mytaptrack-users-{stage}"]
        ],
        "period": 300,
        "stat": "Sum",
        "region": "us-east-1",
        "title": "Database Performance"
      }
    }
  ]
}
```

### Creating the Dashboard
```bash
# Create CloudWatch dashboard
aws cloudwatch put-dashboard \
  --dashboard-name "MyTapTrack-Health-{stage}" \
  --dashboard-body file://health-dashboard.json
```

## Automated Health Checks

### Health Check Lambda Function

```typescript
// Health check implementation
export const healthCheck = async (event: any): Promise<any> => {
  const checks = {
    timestamp: new Date().toISOString(),
    status: 'healthy',
    checks: {
      database: await checkDatabase(),
      apis: await checkAPIs(),
      external: await checkExternalServices()
    }
  };

  // Publish metrics to CloudWatch
  await publishHealthMetrics(checks);

  return {
    statusCode: 200,
    body: JSON.stringify(checks)
  };
};

async function checkDatabase(): Promise<HealthCheck> {
  try {
    // Test DynamoDB connectivity
    const result = await dynamodb.scan({
      TableName: 'mytaptrack-users-{stage}',
      Limit: 1
    }).promise();
    
    return {
      status: 'healthy',
      responseTime: Date.now() - startTime,
      details: 'Database connection successful'
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error.message,
      details: 'Database connection failed'
    };
  }
}
```

### Scheduled Health Checks
```bash
# Create EventBridge rule for health checks
aws events put-rule \
  --name mytaptrack-health-check-{stage} \
  --schedule-expression "rate(5 minutes)" \
  --description "Automated health check for MyTapTrack system"

# Add Lambda target
aws events put-targets \
  --rule mytaptrack-health-check-{stage} \
  --targets "Id"="1","Arn"="arn:aws:lambda:region:account:function:mytaptrack-health-check-{stage}"
```

## Health Alert Configuration

### Critical Health Alerts

#### System Down Alert
```json
{
  "AlarmName": "MyTapTrack-System-Down-{stage}",
  "AlarmDescription": "System is completely unavailable",
  "MetricName": "HealthCheckFailures",
  "Namespace": "MyTapTrack/Health",
  "Statistic": "Sum",
  "Period": 60,
  "EvaluationPeriods": 3,
  "Threshold": 3,
  "ComparisonOperator": "GreaterThanOrEqualToThreshold",
  "AlarmActions": [
    "arn:aws:sns:region:account:mytaptrack-critical-alerts-{stage}"
  ]
}
```

#### High Error Rate Alert
```json
{
  "AlarmName": "MyTapTrack-High-Error-Rate-{stage}",
  "AlarmDescription": "API error rate exceeds threshold",
  "MetricName": "4XXError",
  "Namespace": "AWS/ApiGateway",
  "Dimensions": [
    {"Name": "ApiName", "Value": "mytaptrack-api-{stage}"}
  ],
  "Statistic": "Sum",
  "Period": 300,
  "EvaluationPeriods": 2,
  "Threshold": 10,
  "ComparisonOperator": "GreaterThanThreshold",
  "AlarmActions": [
    "arn:aws:sns:region:account:mytaptrack-alerts-{stage}"
  ]
}
```

#### Database Performance Alert
```json
{
  "AlarmName": "MyTapTrack-Database-Latency-{stage}",
  "AlarmDescription": "Database response time is too high",
  "MetricName": "SuccessfulRequestLatency",
  "Namespace": "AWS/DynamoDB",
  "Dimensions": [
    {"Name": "TableName", "Value": "mytaptrack-users-{stage}"}
  ],
  "Statistic": "Average",
  "Period": 300,
  "EvaluationPeriods": 3,
  "Threshold": 100,
  "ComparisonOperator": "GreaterThanThreshold",
  "AlarmActions": [
    "arn:aws:sns:region:account:mytaptrack-alerts-{stage}"
  ]
}
```

### Creating Alerts
```bash
# Create all health monitoring alerts
aws cloudwatch put-metric-alarm --cli-input-json file://system-down-alert.json
aws cloudwatch put-metric-alarm --cli-input-json file://high-error-rate-alert.json
aws cloudwatch put-metric-alarm --cli-input-json file://database-latency-alert.json
```

## Health Monitoring Procedures

### Daily Health Check Routine

#### Morning Health Assessment (9:00 AM)
```bash
#!/bin/bash
# Daily health check script

echo "=== MyTapTrack Daily Health Check ==="
echo "Date: $(date)"
echo "Environment: {stage}"

# Check system availability
echo "1. Checking API availability..."
curl -s -o /dev/null -w "%{http_code}" https://api-{stage}.mytaptrack.com/health

# Check database health
echo "2. Checking database health..."
aws dynamodb describe-table --table-name mytaptrack-users-{stage} \
  --query 'Table.TableStatus' --output text

# Check recent errors
echo "3. Checking error rates (last 24 hours)..."
aws logs filter-log-events \
  --log-group-name /aws/lambda/mytaptrack-api-{stage} \
  --start-time $(date -d '24 hours ago' +%s)000 \
  --filter-pattern "ERROR"

# Check performance metrics
echo "4. Checking performance metrics..."
aws cloudwatch get-metric-statistics \
  --namespace AWS/ApiGateway \
  --metric-name Latency \
  --dimensions Name=ApiName,Value=mytaptrack-api-{stage} \
  --start-time $(date -u -d '24 hours ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 3600 \
  --statistics Average,Maximum

echo "=== Health Check Complete ==="
```

#### Weekly Health Review (Monday 10:00 AM)
1. Review all alerts from the previous week
2. Analyze performance trends and capacity planning
3. Check for any degradation patterns
4. Update health monitoring thresholds if needed
5. Review and update escalation procedures

#### Monthly Health Assessment
1. Comprehensive system performance review
2. Health monitoring effectiveness analysis
3. Update health check procedures based on incidents
4. Capacity planning and scaling recommendations
5. Health monitoring tool and dashboard updates

### Health Incident Response

#### Immediate Response (0-15 minutes)
1. **Acknowledge Alert**: Confirm receipt and begin investigation
2. **Initial Assessment**: Determine scope and severity
3. **Stakeholder Notification**: Alert relevant teams and management
4. **Immediate Mitigation**: Apply quick fixes if available

#### Investigation Phase (15-60 minutes)
1. **Root Cause Analysis**: Identify underlying cause
2. **Impact Assessment**: Determine user and business impact
3. **Resolution Planning**: Develop comprehensive fix strategy
4. **Communication Updates**: Regular status updates to stakeholders

#### Resolution Phase (1+ hours)
1. **Implement Fix**: Deploy resolution with proper testing
2. **Verification**: Confirm system health restoration
3. **Monitoring**: Enhanced monitoring during recovery period
4. **Documentation**: Document incident and resolution

#### Post-Incident Review
1. **Incident Timeline**: Complete chronology of events
2. **Root Cause Analysis**: Detailed technical analysis
3. **Lessons Learned**: Process and system improvements
4. **Action Items**: Specific tasks to prevent recurrence

## Health Monitoring Tools

### CloudWatch Integration
```bash
# Install CloudWatch agent for enhanced monitoring
wget https://s3.amazonaws.com/amazoncloudwatch-agent/amazon_linux/amd64/latest/amazon-cloudwatch-agent.rpm
sudo rpm -U ./amazon-cloudwatch-agent.rpm

# Configure custom metrics
aws logs create-log-group --log-group-name /mytaptrack/health/{stage}
```

### Third-Party Monitoring Tools

#### Datadog Integration (Optional)
```bash
# Install Datadog agent
DD_API_KEY={datadog-api-key} bash -c "$(curl -L https://raw.githubusercontent.com/DataDog/datadog-agent/master/cmd/agent/install_script.sh)"

# Configure custom metrics
echo "logs_enabled: true" >> /etc/datadog-agent/datadog.yaml
```

#### New Relic Integration (Optional)
```bash
# Install New Relic agent
curl -Ls https://download.newrelic.com/install/newrelic-cli/scripts/install.sh | bash
sudo NEW_RELIC_API_KEY={api-key} NEW_RELIC_ACCOUNT_ID={account-id} /usr/local/bin/newrelic install
```

## Health Metrics Retention

### CloudWatch Logs Retention
```bash
# Set log retention policies
aws logs put-retention-policy \
  --log-group-name /aws/lambda/mytaptrack-health-check-{stage} \
  --retention-in-days 30

aws logs put-retention-policy \
  --log-group-name /mytaptrack/health/{stage} \
  --retention-in-days 90
```

### Metrics Data Retention
- **High-resolution metrics**: 3 hours
- **1-minute metrics**: 15 days  
- **5-minute metrics**: 63 days
- **1-hour metrics**: 455 days

### Health Data Archival
```bash
# Export health metrics for long-term storage
aws logs export-task \
  --log-group-name /mytaptrack/health/{stage} \
  --from $(date -d '30 days ago' +%s)000 \
  --to $(date +%s)000 \
  --destination s3://mytaptrack-logs-{stage}/health-metrics/
```

## Continuous Improvement

### Health Monitoring Optimization
- Regular review of alert thresholds and false positive rates
- Performance baseline updates based on system growth
- New health check development for emerging system components
- Integration with business metrics for comprehensive health assessment

### Automation Enhancements
- Automated remediation for common health issues
- Predictive health monitoring using machine learning
- Integration with deployment pipelines for health validation
- Self-healing system capabilities for minor issues

### Documentation Maintenance
- Regular updates based on operational experience
- New team member onboarding improvements
- Integration with incident management systems
- Knowledge base updates with troubleshooting solutions