import { IGrantable, PolicyStatement } from "aws-cdk-lib/aws-iam";
import { MttContext } from ".";
import * as timestream from 'aws-cdk-lib/aws-timestream';
import { CfnOutput } from "aws-cdk-lib";

export enum MttTimestreamAccess {
    read,
    readWrite
}

export interface MttTimestreamDBProps {
    id: string;
    name?: string;
    envDatabase?: string;
}
export interface MttTimestreamTableCreationProps {
    id: string;
    envDatabase?: string;
    envTable?: string;
    tableName: string;
    hasPhi: boolean;
}
export class MttTimestreamDB {
    private _db: timestream.CfnDatabase;
    get db() { return this._db; }
    get name() { return this._db.databaseName; }
    get arn() { return this._db.attrArn; }
    constructor(private context: MttContext, private props: MttTimestreamDBProps) {
        this._db = new timestream.CfnDatabase(context.scope, props.id, {
            databaseName: props.name ?? props.id,
            kmsKeyId: context.kmsKey?.keyId ?? undefined
        });
    }

    addTable(props: MttTimestreamTableCreationProps) {
        return new MttTimestream(this.context, {
            databaseName: this._db.databaseName,
            envDatabase: this.props.envDatabase,
            timestreamDB: this,
            ...props
        });
    }
}

export interface MttTimestreamProps {
    id?: string;
    tableArn?: string;
    envDatabase?: string;
    envTable?: string;
    databaseName?: string;
    tableName?: string;
    hasPhi: boolean;
    timestreamDB?: MttTimestreamDB;
}
export class MttTimestream {
    tableArn: string;
    database: string;
    tableName: string;
    envDatabase: string;
    envTable: string;
    hasPhi: boolean;

    static fromTableArn(context: MttContext, tableArn: string, props: MttTimestreamProps) {
        return new MttTimestream(context, { tableArn, ...props });
    }
    constructor(context: MttContext, props: MttTimestreamProps) {
        this.envDatabase = props.envDatabase;
        this.envTable = props.envTable;
        this.hasPhi = props.hasPhi;

        if(props.tableArn) {
            this.tableArn = props.tableArn;
            const parts = props.tableArn.split('/');
            this.database = props.databaseName ?? parts[1];
            this.tableName = props.tableName ?? parts[3];
            return;
        }

        const table = new timestream.CfnTable(context.scope, props.id, {
            databaseName: props.databaseName,
            tableName: props.tableName,
            retentionProperties: {
                MagneticStoreRetentionPeriodInDays: 2555,
                MemoryStoreRetentionPeriodInHours: 168
            },
            magneticStoreWriteProperties: {
                EnableMagneticStoreWrites: true
            }
        });
        if(props.timestreamDB) {
            table.addDependency(props.timestreamDB.db)
        }
        this.tableArn = table.attrArn;
        this.database = props.databaseName;
        this.tableName = props.tableName;
    }

    grantReadWriteData(grantee: IGrantable) {
        grantee.grantPrincipal.addToPrincipalPolicy(new PolicyStatement({
            actions: ['timestream:DescribeEndpoints'],
            resources: ['*']
        }));
        grantee.grantPrincipal.addToPrincipalPolicy(new PolicyStatement({
            actions: ['timestream:Select', 'timestream:WriteRecords'],
            resources: [this.tableArn]
        }));
    }

    grantReadData(grantee: IGrantable) {
        grantee.grantPrincipal.addToPrincipalPolicy(new PolicyStatement({
            actions: ['timestream:DescribeEndpoints'],
            resources: ['*']
        }));
        grantee.grantPrincipal.addToPrincipalPolicy(new PolicyStatement({
            actions: ['timestream:Select'],
            resources: [this.tableArn]
        }));
    }

    addDependantObject() {

    }
}