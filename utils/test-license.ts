#!/usr/bin/env node

// Set environment variables before any imports
process.env.PrimaryTable = 'mytaptrack-prod-primary';
process.env.DataTable = 'mytaptrack-prod-data';
process.env.AWS_REGION = 'us-east-1';
process.env.AWS_PROFILE = 'mytaptrack';

import { v2 } from '@mytaptrack/lib';

async function testLicense() {
    try {
        console.log('Testing license access...');
        
        // Get first license
        const licenses = await v2.LicenseDal.getAll();
        console.log(`Found ${licenses.length} licenses`);
        
        if (licenses.length > 0) {
            const testLicense = licenses[0];
            console.log(`Testing license: ${testLicense.license}`);
            
            try {
                console.log('Calling getStudentsByLicense...');
                const students = await v2.StudentDal.getStudentsByLicense(testLicense.license);
                console.log(`Found ${students.length} students for license ${testLicense.license}`);
                
                if (students.length > 0) {
                    const student = students[0];
                    console.log(`First student: ${student.studentId}`);
                    console.log(`Student details:`, student.details);
                }
            } catch (error) {
                console.error('Error getting students:', JSON.stringify(error, null, 2));
                console.error('Error type:', typeof error);
                console.error('Error constructor:', error.constructor.name);
                if (error.message) console.error('Error message:', error.message);
                if (error.stack) console.error('Error stack:', error.stack);
            }
        }
    } catch (error) {
        console.error('Test failed:', error);
    }
}

testLicense();