# Data Recovery Procedures

This guide provides support teams with comprehensive procedures for data recovery, backup restoration, and data integrity verification in MyTapTrack.

## Data Recovery Overview

### Recovery Scenarios
- **Accidental Data Deletion**: User-initiated data removal
- **System Corruption**: Database or file system corruption
- **Hardware Failure**: Server or storage device failures
- **Software Bugs**: Application errors causing data loss
- **Security Incidents**: Malicious data modification or deletion
- **Natural Disasters**: Physical infrastructure damage

### Recovery Time Objectives (RTO)
- **Critical Data**: 4 hours maximum downtime
- **Important Data**: 24 hours maximum downtime
- **Standard Data**: 72 hours maximum downtime
- **Archived Data**: 1 week maximum recovery time

### Recovery Point Objectives (RPO)
- **Real-time Data**: Maximum 15 minutes of data loss
- **Transactional Data**: Maximum 1 hour of data loss
- **Analytical Data**: Maximum 24 hours of data loss
- **Historical Data**: Maximum 1 week of data loss

## Backup Systems and Architecture

### Backup Infrastructure

**Primary Backup Systems:**
- **Database Backups**: Automated daily full backups, hourly incremental
- **File Storage Backups**: Real-time replication to secondary storage
- **Configuration Backups**: Daily snapshots of system configurations
- **Application Data**: Continuous data replication across regions

**Backup Locations:**
- **Primary**: Same region as production (for fast recovery)
- **Secondary**: Different region (for disaster recovery)
- **Tertiary**: Offline/cold storage (for long-term retention)

**Backup Verification:**
```bash
#!/bin/bash
# Daily Backup Verification Script

echo "=== Backup Verification Report ==="
echo "Date: $(date)"

# Check database backup completion
LATEST_DB_BACKUP=$(aws s3 ls s3://mytaptrack-backups/database/ | tail -1)
echo "Latest DB Backup: $LATEST_DB_BACKUP"

# Verify backup integrity
aws s3 cp s3://mytaptrack-backups/database/latest.sql.gz /tmp/
gunzip -t /tmp/latest.sql.gz
if [ $? -eq 0 ]; then
    echo "✓ Database backup integrity verified"
else
    echo "✗ Database backup integrity check failed"
fi

# Check file storage replication
aws s3 sync s3://mytaptrack-primary/ s3://mytaptrack-backup/ --dryrun | wc -l
echo "Files pending replication: $(aws s3 sync s3://mytaptrack-primary/ s3://mytaptrack-backup/ --dryrun | wc -l)"
```

## Data Recovery Procedures

### Database Recovery

**Full Database Recovery:**
```sql
-- Step 1: Stop application services
-- Step 2: Create recovery database
CREATE DATABASE mytaptrack_recovery;

-- Step 3: Restore from backup
pg_restore -h localhost -U postgres -d mytaptrack_recovery /backups/latest_backup.sql

-- Step 4: Verify data integrity
SELECT COUNT(*) FROM users;
SELECT COUNT(*) FROM devices;
SELECT COUNT(*) FROM device_data WHERE created_date >= CURRENT_DATE - INTERVAL '7 days';

-- Step 5: Switch to recovery database (after verification)
-- Update application configuration to point to recovery database
```

**Point-in-Time Recovery:**
```sql
-- Restore database to specific timestamp
pg_restore -h localhost -U postgres -d mytaptrack_recovery \
    --clean --if-exists \
    /backups/base_backup.sql

-- Apply WAL files up to specific time
pg_waldump /backups/wal_archive/ | grep "2023-10-15 14:30:00"

-- Recovery to specific transaction
SELECT pg_create_restore_point('before_data_loss');
```

**Selective Data Recovery:**
```sql
-- Recover specific table from backup
CREATE TABLE users_recovery AS 
SELECT * FROM backup_schema.users 
WHERE deleted_date IS NULL;

-- Merge recovered data with current data
INSERT INTO users (user_id, username, email, created_date)
SELECT user_id, username, email, created_date
FROM users_recovery
WHERE user_id NOT IN (SELECT user_id FROM users);
```

### File Storage Recovery

**S3 Bucket Recovery:**
```bash
# List available backup versions
aws s3api list-object-versions --bucket mytaptrack-backups --prefix user-uploads/

# Restore specific file version
aws s3api get-object \
    --bucket mytaptrack-backups \
    --key user-uploads/document.pdf \
    --version-id "version_id_here" \
    /tmp/recovered_document.pdf

# Bulk restore from backup
aws s3 sync s3://mytaptrack-backups/user-uploads/ s3://mytaptrack-primary/user-uploads/ \
    --exclude "*" --include "*.pdf" --include "*.jpg"
```

**Local File System Recovery:**
```bash
# Mount backup volume
sudo mount /dev/backup_volume /mnt/backup

# Restore specific directory
rsync -av /mnt/backup/user_data/ /var/mytaptrack/user_data/

# Verify file integrity
find /var/mytaptrack/user_data/ -type f -exec md5sum {} \; > /tmp/restored_checksums.txt
diff /tmp/restored_checksums.txt /mnt/backup/checksums.txt
```

### Application Configuration Recovery

**Configuration Backup and Restore:**
```bash
# Backup current configuration
tar -czf config_backup_$(date +%Y%m%d_%H%M%S).tar.gz /etc/mytaptrack/

# Restore configuration from backup
tar -xzf config_backup_20231015_143000.tar.gz -C /

# Restart services with restored configuration
systemctl restart mytaptrack-api
systemctl restart mytaptrack-worker
```

## Data Integrity Verification

### Automated Integrity Checks

**Database Integrity Verification:**
```sql
-- Check referential integrity
SELECT 'users_devices' as table_name, COUNT(*) as orphaned_records
FROM devices d 
LEFT JOIN users u ON d.user_id = u.user_id 
WHERE u.user_id IS NULL

UNION ALL

SELECT 'device_data_devices' as table_name, COUNT(*) as orphaned_records
FROM device_data dd 
LEFT JOIN devices d ON dd.device_id = d.device_id 
WHERE d.device_id IS NULL;

-- Check data consistency
SELECT 
    'data_consistency' as check_type,
    COUNT(CASE WHEN created_date > updated_date THEN 1 END) as inconsistent_records
FROM users
WHERE created_date > updated_date;

-- Verify critical business rules
SELECT 
    'business_rules' as check_type,
    COUNT(*) as violations
FROM devices 
WHERE status = 'ACTIVE' AND last_seen < NOW() - INTERVAL '30 days';
```

**File Integrity Verification:**
```bash
# Generate and verify checksums
find /var/mytaptrack/uploads -type f -exec sha256sum {} \; > current_checksums.txt
diff current_checksums.txt /backups/reference_checksums.txt

# Check file permissions and ownership
find /var/mytaptrack -type f ! -perm 644 -o ! -user mytaptrack -o ! -group mytaptrack

# Verify file structure
tree /var/mytaptrack > current_structure.txt
diff current_structure.txt /backups/reference_structure.txt
```

### Manual Data Validation

**Business Logic Validation:**
```sql
-- Validate user account consistency
SELECT 
    u.username,
    u.account_status,
    COUNT(d.device_id) as device_count,
    MAX(dd.created_date) as last_data_point
FROM users u
LEFT JOIN devices d ON u.user_id = d.user_id
LEFT JOIN device_data dd ON d.device_id = dd.device_id
GROUP BY u.user_id, u.username, u.account_status
HAVING u.account_status = 'ACTIVE' AND COUNT(d.device_id) = 0;

-- Check data completeness
SELECT 
    DATE_TRUNC('hour', created_date) as hour,
    COUNT(*) as data_points,
    COUNT(DISTINCT device_id) as active_devices
FROM device_data 
WHERE created_date >= NOW() - INTERVAL '24 hours'
GROUP BY DATE_TRUNC('hour', created_date)
ORDER BY hour;
```

## Disaster Recovery Procedures

### Regional Failover

**Primary to Secondary Region Failover:**
```bash
# Step 1: Assess primary region status
aws ec2 describe-instances --region us-east-1 --filters "Name=tag:Environment,Values=production"

# Step 2: Promote secondary database to primary
aws rds promote-read-replica --db-instance-identifier mytaptrack-replica-west

# Step 3: Update DNS to point to secondary region
aws route53 change-resource-record-sets --hosted-zone-id Z123456789 --change-batch file://failover-dns.json

# Step 4: Scale up secondary region infrastructure
aws autoscaling update-auto-scaling-group --auto-scaling-group-name mytaptrack-asg-west --desired-capacity 5

# Step 5: Verify application functionality
curl -f https://api.mytaptrack.com/health || echo "Health check failed"
```

**Failback Procedures:**
```bash
# Step 1: Verify primary region recovery
aws ec2 describe-instances --region us-east-1 --query 'Reservations[].Instances[?State.Name==`running`]'

# Step 2: Sync data from secondary to primary
aws dms create-replication-task --replication-task-identifier failback-sync

# Step 3: Verify data synchronization
psql -h primary-db.us-east-1.rds.amazonaws.com -c "SELECT COUNT(*) FROM users;"
psql -h secondary-db.us-west-2.rds.amazonaws.com -c "SELECT COUNT(*) FROM users;"

# Step 4: Switch traffic back to primary region
aws route53 change-resource-record-sets --hosted-zone-id Z123456789 --change-batch file://failback-dns.json
```

### Complete System Recovery

**Bare Metal Recovery Process:**
1. **Infrastructure Provisioning**
   - Deploy infrastructure using Infrastructure as Code (Terraform/CDK)
   - Configure networking and security groups
   - Set up load balancers and auto-scaling groups

2. **Database Recovery**
   - Restore database from latest backup
   - Apply transaction logs for point-in-time recovery
   - Verify data integrity and consistency

3. **Application Deployment**
   - Deploy application code from version control
   - Restore configuration files and secrets
   - Start application services and verify functionality

4. **Data Restoration**
   - Restore file storage from backups
   - Verify file integrity and permissions
   - Test data access and functionality

## Recovery Testing and Validation

### Regular Recovery Testing

**Monthly Recovery Drills:**
```bash
#!/bin/bash
# Monthly Disaster Recovery Test

echo "=== Disaster Recovery Test - $(date) ==="

# Test 1: Database backup restoration
echo "Testing database backup restoration..."
pg_restore -h test-db.mytaptrack.com -d recovery_test /backups/latest.sql
if [ $? -eq 0 ]; then
    echo "✓ Database restoration successful"
else
    echo "✗ Database restoration failed"
fi

# Test 2: File storage recovery
echo "Testing file storage recovery..."
aws s3 sync s3://mytaptrack-backups/test-data/ s3://mytaptrack-test-recovery/
if [ $? -eq 0 ]; then
    echo "✓ File storage recovery successful"
else
    echo "✗ File storage recovery failed"
fi

# Test 3: Application functionality
echo "Testing application functionality..."
curl -f https://test-recovery.mytaptrack.com/health
if [ $? -eq 0 ]; then
    echo "✓ Application functionality verified"
else
    echo "✗ Application functionality test failed"
fi

# Cleanup test environment
echo "Cleaning up test environment..."
aws rds delete-db-instance --db-instance-identifier recovery-test --skip-final-snapshot
```

**Recovery Performance Metrics:**
- **Recovery Time**: Measure actual recovery time vs. RTO targets
- **Data Loss**: Measure actual data loss vs. RPO targets
- **Success Rate**: Track successful recovery test percentage
- **Process Efficiency**: Identify bottlenecks and improvement opportunities

## Customer Data Recovery Requests

### Customer-Initiated Recovery

**Data Recovery Request Process:**
1. **Request Validation**
   - Verify customer identity and authorization
   - Confirm data ownership and access rights
   - Document business justification for recovery
   - Assess technical feasibility and impact

2. **Recovery Scope Assessment**
   ```sql
   -- Assess recoverable data for customer request
   SELECT 
       table_name,
       COUNT(*) as total_records,
       MIN(deleted_date) as earliest_deletion,
       MAX(deleted_date) as latest_deletion
   FROM information_schema.tables t
   JOIN audit_log a ON t.table_name = a.table_name
   WHERE a.user_id = 'customer_user_id'
       AND a.action = 'DELETE'
       AND a.timestamp >= NOW() - INTERVAL '30 days'
   GROUP BY table_name;
   ```

3. **Recovery Execution**
   - Create isolated recovery environment
   - Restore data from appropriate backup point
   - Validate recovered data integrity
   - Provide secure access for customer verification

**Customer Communication Template:**
```
Subject: Data Recovery Request - [Ticket ID]

Dear [Customer Name],

We have received your data recovery request for [description of data].

Recovery Details:
- Data Type: [Type of data requested]
- Time Period: [Date range for recovery]
- Estimated Recovery Time: [Timeline]
- Recovery Method: [Backup source and process]

We will begin the recovery process and provide updates every [frequency].
The recovered data will be available for verification within [timeframe].

Please note that this recovery is subject to our data retention policies
and may not include all requested data if it falls outside our backup
retention period.

Best regards,
MyTapTrack Support Team
```

### Legal and Compliance Considerations

**Data Recovery Compliance:**
- **Data Retention Policies**: Ensure recovery complies with retention requirements
- **Privacy Regulations**: Verify recovery doesn't violate GDPR, CCPA, or other privacy laws
- **Audit Requirements**: Maintain detailed logs of all recovery activities
- **Customer Consent**: Ensure proper authorization for data recovery

**Recovery Documentation:**
```sql
-- Log recovery activity
INSERT INTO recovery_audit_log (
    recovery_id,
    customer_id,
    data_type,
    recovery_timestamp,
    authorized_by,
    business_justification,
    data_scope,
    recovery_method
) VALUES (
    'REC-' || generate_random_uuid(),
    'customer_id',
    'user_data',
    NOW(),
    'support_agent_id',
    'Accidental deletion by user',
    'User profile and device data for 2023-10-01 to 2023-10-15',
    'Point-in-time backup restoration'
);
```

## Recovery Tools and Resources

### Recovery Software and Tools

**Database Recovery Tools:**
- **PostgreSQL**: pg_restore, pg_dump, WAL-E
- **MySQL**: mysqldump, MySQL Enterprise Backup
- **MongoDB**: mongorestore, MongoDB Ops Manager
- **Redis**: redis-cli, RDB snapshots

**File System Recovery Tools:**
- **Linux**: rsync, tar, dd, TestDisk
- **Cloud Storage**: AWS CLI, gsutil, Azure CLI
- **Backup Software**: Veeam, Commvault, Bacula

**Monitoring and Verification Tools:**
- **Integrity Checking**: md5sum, sha256sum, AIDE
- **Performance Monitoring**: iostat, iotop, sar
- **Network Tools**: rsync, scp, aws s3 sync

### Recovery Automation

**Automated Recovery Scripts:**
```python
#!/usr/bin/env python3
# Automated Data Recovery Script

import boto3
import psycopg2
import logging
from datetime import datetime, timedelta

class DataRecoveryManager:
    def __init__(self):
        self.s3_client = boto3.client('s3')
        self.rds_client = boto3.client('rds')
        self.logger = logging.getLogger(__name__)
    
    def recover_database(self, backup_identifier, target_time=None):
        """Recover database from backup to specific point in time"""
        try:
            if target_time:
                # Point-in-time recovery
                response = self.rds_client.restore_db_instance_to_point_in_time(
                    SourceDBInstanceIdentifier=backup_identifier,
                    TargetDBInstanceIdentifier=f"recovery-{datetime.now().strftime('%Y%m%d-%H%M%S')}",
                    RestoreTime=target_time
                )
            else:
                # Latest backup recovery
                response = self.rds_client.restore_db_instance_from_db_snapshot(
                    DBInstanceIdentifier=f"recovery-{datetime.now().strftime('%Y%m%d-%H%M%S')}",
                    DBSnapshotIdentifier=backup_identifier
                )
            
            self.logger.info(f"Database recovery initiated: {response['DBInstance']['DBInstanceIdentifier']}")
            return response['DBInstance']['DBInstanceIdentifier']
            
        except Exception as e:
            self.logger.error(f"Database recovery failed: {str(e)}")
            raise
    
    def recover_files(self, backup_bucket, target_bucket, prefix=""):
        """Recover files from backup S3 bucket"""
        try:
            # List objects in backup bucket
            paginator = self.s3_client.get_paginator('list_objects_v2')
            pages = paginator.paginate(Bucket=backup_bucket, Prefix=prefix)
            
            recovered_files = 0
            for page in pages:
                if 'Contents' in page:
                    for obj in page['Contents']:
                        # Copy file from backup to target bucket
                        copy_source = {'Bucket': backup_bucket, 'Key': obj['Key']}
                        self.s3_client.copy_object(
                            CopySource=copy_source,
                            Bucket=target_bucket,
                            Key=obj['Key']
                        )
                        recovered_files += 1
            
            self.logger.info(f"Recovered {recovered_files} files from backup")
            return recovered_files
            
        except Exception as e:
            self.logger.error(f"File recovery failed: {str(e)}")
            raise
    
    def verify_recovery(self, db_instance_id, expected_record_count):
        """Verify recovery success by checking data integrity"""
        try:
            # Wait for database to be available
            waiter = self.rds_client.get_waiter('db_instance_available')
            waiter.wait(DBInstanceIdentifier=db_instance_id)
            
            # Connect and verify data
            # (Connection details would be retrieved from RDS instance)
            # This is a simplified example
            
            self.logger.info("Recovery verification completed successfully")
            return True
            
        except Exception as e:
            self.logger.error(f"Recovery verification failed: {str(e)}")
            return False

# Usage example
if __name__ == "__main__":
    recovery_manager = DataRecoveryManager()
    
    # Recover database
    db_instance = recovery_manager.recover_database('mytaptrack-backup-snapshot')
    
    # Recover files
    files_recovered = recovery_manager.recover_files('mytaptrack-backups', 'mytaptrack-recovery')
    
    # Verify recovery
    if recovery_manager.verify_recovery(db_instance, expected_record_count=1000000):
        print("Recovery completed successfully")
    else:
        print("Recovery verification failed")
```

## Emergency Contacts and Escalation

### Recovery Team Contacts
- **Database Administrator**: dba@mytaptrack.com, +1-800-TAPTRACK ext. 901
- **Infrastructure Team**: infrastructure@mytaptrack.com, +1-800-TAPTRACK ext. 902
- **Security Team**: security@mytaptrack.com, +1-800-TAPTRACK ext. 903
- **Engineering Manager**: eng-manager@mytaptrack.com, +1-800-TAPTRACK ext. 904

### Vendor Support Contacts
- **AWS Support**: [Account-specific premium support number]
- **Database Vendor**: [PostgreSQL/MySQL enterprise support]
- **Backup Software**: [Vendor-specific support contacts]
- **Hardware Vendor**: [Server/storage vendor support]

### Recovery Escalation Matrix
- **0-4 hours**: Support team handles routine recovery
- **4-8 hours**: Escalate to senior technical team
- **8-24 hours**: Involve engineering management
- **24+ hours**: Executive escalation and external vendor engagement