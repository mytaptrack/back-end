# Data Architecture

The data architecture perspective describes the structure of logical and physical data assets and data management resources.

## Contents

- [Conceptual Data Model](./conceptual-model.md)
- [Logical Data Model](./logical-model.md)
- [Data Flow Patterns](./data-flows.md)
- [Data Governance](./governance.md)

## Overview

MyTapTrack uses a modern cloud-native data architecture built on AWS services:

## Core Data Entities

### Primary Entities
- **Users**: System users with roles and permissions
- **Devices**: IoT devices and their configurations
- **Students**: Student profiles and associated data
- **Reports**: Generated reports and analytics
- **Licenses**: Software licensing and entitlements

### Supporting Entities
- **Teams**: Organizational groupings
- **Applications**: Software applications and configurations
- **Notes**: User-generated content and annotations
- **Notifications**: System alerts and messages

## Data Storage Patterns

### DynamoDB Tables
- **Primary Table**: Main transactional data with GSI patterns
- **Time-series Data**: Device readings and events
- **Configuration Data**: System and user preferences

### S3 Data Lake
- **Raw Data**: Unprocessed device data and logs
- **Processed Data**: Transformed and aggregated datasets
- **Backup Data**: System backups and archives

## Data Flow Architecture

Real-time data flows through EventBridge for immediate processing, while batch processing handles large-scale analytics and reporting.