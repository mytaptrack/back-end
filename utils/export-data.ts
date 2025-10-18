#!/usr/bin/env node

// Set environment variables before any imports
process.env.PrimaryTable = 'mytaptrack-prod-primary';
process.env.DataTable = 'mytaptrack-prod-data';
process.env.AWS_REGION = 'us-east-1';

import { v2, moment } from '@mytaptrack/lib';
import { typesV2 } from '@mytaptrack/types';
import * as fs from 'fs';
import * as path from 'path';
import * as yazl from 'yazl';
import { Student } from '../types/dist/v2/student';

interface ExportConfig {
    outputDir: string;
    startDate?: string;
    endDate?: string;
}

class DataExporter {
    private config: ExportConfig;
    private licenseFolders: { path: string; license: string }[] = [];

    constructor(config: ExportConfig) {
        this.config = config;
    }

    async exportAllData(): Promise<void> {
        console.log('Starting data export...');
        
        // Scan primary table for all students
        const licenses = await v2.LicenseDal.getAll();

        console.log(`License count: ${licenses.length}`);
        
        try {
            for(let license of licenses) {
                console.log(`Processing license `, license.license);
                const students = await v2.StudentDal.getStudentsByLicense(license.license);
                console.log(`License: ${license.customer} has ${students?.length} students`);

                if(students?.length > 0) {
                    // Create the license folder with customer name in the output if it doesn't exist
                    const licenseDir = path.join(this.config.outputDir, license.customer || license.license);
                    this.ensureDirectoryExists(licenseDir);
                    this.licenseFolders.push({ path: licenseDir, license: license.license });

                    for(let licenseStudent of students) {
                        const student = await v2.StudentDal.getStudent(licenseStudent.studentId);
                        console.log(`Exporting data for ${JSON.stringify(student.studentId)}`);
                        if(!student.details.firstName || !student.details.lastName) {
                            console.log('Skipping due to missing student details');
                            continue;
                        }
                        // Create the student folder using the student's name
                        const studentName = `${student.details?.firstName || 'Unknown'}_${student.details?.lastName || 'Unknown'}`
                            .replace(/[^a-zA-Z0-9_-]/g, '_')
                            .replace(/_+/g, '_')
                            .replace(/^_|_$/g, '');
                        const studentDir = path.join(licenseDir, studentName);
                        this.ensureDirectoryExists(studentDir);

                        // Extract all report data for the last 8 years
                        const endDate = moment();
                        const startDate = moment().subtract(8, 'years');
                        const reportData = await v2.DataDal.getData(student.studentId, startDate, endDate);

                        // Convert the data to csv files
                        const dataPath = path.join(studentDir, 'data.csv');
                        const csvContent = this.convertDataToCsv(reportData, student, fs.existsSync(dataPath));
                        fs.appendFileSync(dataPath, csvContent);

                        // Write the student object as a json file called config
                        const configPath = path.join(studentDir, 'config.json');
                        fs.writeFileSync(configPath, JSON.stringify(student, null, 2));
                        
                        console.log(`Exported student: ${studentName} (${reportData.data?.length || 0} data points)`);
                    }
                }
            }
        } catch (error) {
            console.log('Error getting student', error.toString());
            // Print error callstack
            console.log(error.stack);
            throw error;
        }

        // Zip all license folders with unique passwords
        await this.zipLicenseFolders();

        console.log('Data export completed');
    }

    private convertDataToCsv(reportData: typesV2.ReportDetails, student: typesV2.Student, fileExists: boolean = false): string {
        const headers = [
            'Date',
            'Time', 
            'Behavior',
            'Score',
            'Source',
            'ABC_Antecedent',
            'ABC_Consequence', 
            'Notes',
            'Duration',
            'Manual'
        ];

        let csvContent = fileExists ? '' : headers.join(',') + '\n';

        if (reportData.data && reportData.data.length > 0) {
            reportData.data.forEach(dataPoint => {
                if (dataPoint.deleted) return; // Skip deleted entries

                const date = moment(dataPoint.dateEpoc);
                const source = typeof dataPoint.source === 'string' ? dataPoint.source : 
                    (dataPoint.source?.device || '');
                const reported = typeof dataPoint.reported === 'string' ? dataPoint.reported : 
                    (dataPoint.reported ? 'Yes' : 'No');
                
                // Map behavior ID to behavior name
                const behaviorName = student.behaviors?.find(b => b.id === dataPoint.behavior)?.name || dataPoint.behavior || '';
                
                const row = [
                    date.format('YYYY-MM-DD'),
                    date.format('HH:mm:ss'),
                    this.escapeCsvValue(behaviorName),
                    dataPoint.score || '',
                    this.escapeCsvValue(source),
                    this.escapeCsvValue(dataPoint.abc?.a || ''),
                    this.escapeCsvValue(dataPoint.abc?.c || ''),
                    this.escapeCsvValue(reported),
                    dataPoint.duration || '',
                    dataPoint.isManual ? 'Yes' : 'No'
                ];
                csvContent += row.join(',') + '\n';
            });
        }

        return csvContent;
    }

    private escapeCsvValue(value: string): string {
        if (!value) return '';
        // Escape quotes and wrap in quotes if contains comma, quote, or newline
        if (value.includes(',') || value.includes('"') || value.includes('\n')) {
            return '"' + value.replace(/"/g, '""') + '"';
        }
        return value;
    }



    private ensureDirectoryExists(dirPath: string): void {
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }
    }

    private async zipLicenseFolders(): Promise<void> {
        console.log('Creating password-protected zip files...');
        
        for (const licenseInfo of this.licenseFolders) {
            const folderName = path.basename(licenseInfo.path);
            const zipPath = path.join(this.config.outputDir, `${folderName}.zip`);
            const password = licenseInfo.license;
            
            await this.createPasswordProtectedZip(licenseInfo.path, zipPath, password);
            console.log(`ZIP: ${folderName}.zip | PASSWORD: ${password}`);
        }
    }

    private createPasswordProtectedZip(sourceDir: string, zipPath: string, password: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const zipFile = new yazl.ZipFile();
            const output = fs.createWriteStream(zipPath);

            this.addDirectoryToZip(zipFile, sourceDir, '');
            
            zipFile.outputStream.pipe(output);
            zipFile.end();
            
            output.on('close', () => resolve());
            output.on('error', (err) => reject(err));
        });
    }

    private addDirectoryToZip(zipFile: yazl.ZipFile, dirPath: string, zipPath: string): void {
        const items = fs.readdirSync(dirPath);
        
        for (const item of items) {
            const fullPath = path.join(dirPath, item);
            const zipItemPath = zipPath ? `${zipPath}/${item}` : item;
            
            if (fs.statSync(fullPath).isDirectory()) {
                this.addDirectoryToZip(zipFile, fullPath, zipItemPath);
            } else {
                zipFile.addFile(fullPath, zipItemPath);
            }
        }
    }
}

function loadEnvironmentConfig(): void {
    console.log('Environment configuration:');
    console.log('  PrimaryTable:', process.env.PrimaryTable);
    console.log('  DataTable:', process.env.DataTable);
    console.log('  AWS_REGION:', process.env.AWS_REGION);
}

// Main execution
async function main() {
    const args = process.argv.slice(2);
    
    const config: ExportConfig = {
        outputDir: args[0] || './export',
        startDate: args[1],
        endDate: args[2]
    };

    console.log('Export configuration:', config);

    try {
        // Load environment configuration first
        loadEnvironmentConfig();
        
        const exporter = new DataExporter(config);
        await exporter.exportAllData();
        console.log(`Export completed successfully. Data saved to: ${config.outputDir}`);
    } catch (error) {
        console.error('Export failed:', error);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

export { DataExporter };