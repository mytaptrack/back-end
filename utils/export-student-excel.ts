#!/usr/bin/env node

// Set environment variables before any imports
process.env.PrimaryTable = 'mytaptrack-prod-primary';
process.env.DataTable = 'mytaptrack-prod-data';
process.env.AWS_REGION = 'us-east-1';

import { v2, moment } from '@mytaptrack/lib';
import { typesV2 } from '@mytaptrack/types';
import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';

interface ExportConfig {
    outputDir: string;
    startDate?: string;
    endDate?: string;
}

const DATA_HEADERS = [
    'Date', 'Time', 'Behavior', 'Score', 'Source',
    'ABC_Antecedent', 'ABC_Consequence', 'Notes', 'Duration', 'Manual'
];

class StudentExcelExporter {
    constructor(private config: ExportConfig) {}

    async exportAllStudents(): Promise<void> {
        console.log('Starting student excel export...');
        this.ensureDirectoryExists(this.config.outputDir);

        const startDate = this.config.startDate ? moment(this.config.startDate) : moment().subtract(8, 'years');
        const endDate = this.config.endDate ? moment(this.config.endDate) : moment();

        const licenses = await v2.LicenseDal.getAll();
        console.log(`License count: ${licenses.length}`);

        for (const license of licenses) {
            const students = await v2.StudentDal.getStudentsByLicense(license.license);
            console.log(`License: ${license.customer} has ${students?.length} students`);

            for (const licenseStudent of students || []) {
                const student = await v2.StudentDal.getStudent(licenseStudent.studentId);
                if (!student.details?.firstName || !student.details?.lastName) {
                    console.log(`Skipping ${licenseStudent.studentId} due to missing student details`);
                    continue;
                }

                const reportData = await v2.DataDal.getData(student.studentId, startDate, endDate);
                const workbook = this.buildWorkbook(student, reportData);

                const fileName = this.sanitizeFileName(`${student.details.firstName}_${student.details.lastName}`);
                const filePath = this.uniqueFilePath(this.config.outputDir, fileName);
                XLSX.writeFile(workbook, filePath);

                console.log(`Exported: ${filePath} (${reportData.data?.length || 0} data points)`);
            }
        }

        console.log('Student excel export completed');
    }

    private buildWorkbook(student: typesV2.Student, reportData: typesV2.ReportDetails): XLSX.WorkBook {
        const workbook = XLSX.utils.book_new();

        const dataSheet = XLSX.utils.aoa_to_sheet([DATA_HEADERS, ...this.buildDataRows(student, reportData)]);
        XLSX.utils.book_append_sheet(workbook, dataSheet, 'Data');

        const detailsSheet = XLSX.utils.aoa_to_sheet(this.buildDetailsRows(student));
        XLSX.utils.book_append_sheet(workbook, detailsSheet, 'Details');

        return workbook;
    }

    private buildDataRows(student: typesV2.Student, reportData: typesV2.ReportDetails): (string | number)[][] {
        if (!reportData.data?.length) {
            return [];
        }

        return reportData.data
            .filter(dataPoint => !dataPoint.deleted)
            .map(dataPoint => {
                const date = moment(dataPoint.dateEpoc);
                const source = typeof dataPoint.source === 'string' ? dataPoint.source : (dataPoint.source?.device || '');
                const reported = typeof dataPoint.reported === 'string' ? dataPoint.reported : (dataPoint.reported ? 'Yes' : 'No');
                const behaviorName = student.behaviors?.find(b => b.id === dataPoint.behavior)?.name || dataPoint.behavior || '';

                return [
                    date.format('YYYY-MM-DD'),
                    date.format('HH:mm:ss'),
                    behaviorName,
                    dataPoint.score || '',
                    source,
                    dataPoint.abc?.a || '',
                    dataPoint.abc?.c || '',
                    reported,
                    dataPoint.duration || '',
                    dataPoint.isManual ? 'Yes' : 'No'
                ];
            });
    }

    private buildDetailsRows(student: typesV2.Student): (string | number)[][] {
        const rows: (string | number)[][] = [
            ['Student ID', student.studentId],
            ['School Student ID', student.schoolStudentId || ''],
            ['First Name', student.details.firstName],
            ['Last Name', student.details.lastName],
            ['Nickname', student.details.nickname || ''],
            ['License', student.license || ''],
            ['Tags', (student.tags || []).join(', ')],
            ['Last Tracked', student.lastTracked || ''],
            ['Last Update Date', student.lastUpdateDate || ''],
            ['Archived', student.archived ? 'Yes' : 'No'],
            []
        ];

        rows.push(['Behaviors']);
        rows.push(['Name', 'Abbreviation', 'Is Duration', 'Archived']);
        for (const behavior of student.behaviors || []) {
            rows.push([behavior.name, behavior.abbreviation || '', behavior.isDuration ? 'Yes' : 'No', behavior.isArchived ? 'Yes' : 'No']);
        }
        rows.push([]);

        rows.push(['Milestones']);
        rows.push(['Date', 'Title', 'Description']);
        for (const milestone of student.milestones || []) {
            rows.push([milestone.date, milestone.title, milestone.description || '']);
        }

        return rows;
    }

    private sanitizeFileName(name: string): string {
        return name
            .replace(/[^a-zA-Z0-9_-]/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_|_$/g, '');
    }

    private uniqueFilePath(dir: string, baseName: string): string {
        let filePath = path.join(dir, `${baseName}.xlsx`);
        let suffix = 2;
        while (fs.existsSync(filePath)) {
            filePath = path.join(dir, `${baseName}_${suffix}.xlsx`);
            suffix++;
        }
        return filePath;
    }

    private ensureDirectoryExists(dirPath: string): void {
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }
    }
}

async function main() {
    const args = process.argv.slice(2);

    const config: ExportConfig = {
        outputDir: args[0] || path.join(__dirname, 'student-exports'),
        startDate: args[1],
        endDate: args[2]
    };

    console.log('Export configuration:', config);

    try {
        const exporter = new StudentExcelExporter(config);
        await exporter.exportAllStudents();
    } catch (error) {
        console.error('Export failed:', error);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

export { StudentExcelExporter };
