import { AccessLevel } from '@mytaptrack/types';

export const testConfig = {
    // Admin user configuration
    adminUser: {
        userId: '', // Add the admin user ID here
        email: 'demo@mytaptrack.com',
        permissions: {
            info: AccessLevel.admin,
            data: AccessLevel.admin,
            schedules: AccessLevel.admin,
            devices: AccessLevel.admin,
            team: AccessLevel.admin,
            comments: AccessLevel.admin,
            behavior: AccessLevel.admin,
            abc: AccessLevel.admin,
            milestones: AccessLevel.admin,
            reports: AccessLevel.admin,
            notifications: AccessLevel.admin,
            documents: AccessLevel.admin,
            service: AccessLevel.admin,
            serviceData: AccessLevel.admin,
            serviceGoals: AccessLevel.admin,
            serviceSchedule: AccessLevel.admin
        }
    },

    // Test data configuration
    testData: {
        defaultStudentName: 'System Test',
        defaultStudentLastName: 'Last Name',
        documentTestContent: 'This is content from a system test',
        defaultScheduleName: 'System Test Schedule',
        defaultAbcName: 'System Test ABC',
        defaultAntecedents: ['ST1', 'ST2', 'ST3'],
        defaultConsequences: ['C1', 'C2', 'C3']
    },

    // Test execution configuration
    testConfig: {
        waitTime: 2000, // Default wait time in milliseconds
        testTimeout: 2 * 60 * 1000 // Default test timeout (2 minutes)
    },

    // Schedule configuration
    scheduleConfig: {
        defaultSchedule: {
            applyDays: [1, 2, 3, 4, 5],
            activities: [
                { title: 'Period1', startTime: '08:00 am', endTime: '09:00 am' },
                { title: 'Period2', startTime: '09:00 am', endTime: '10:00 am' },
                { title: 'Period3', startTime: '10:00 am', endTime: '11:00 am' },
                { title: 'Period4', startTime: '11:00 am', endTime: '12:00 am' },
                { title: 'Period5', startTime: '12:00 pm', endTime: '1:00 pm' },
                { title: 'Period5', startTime: '1:00 pm', endTime: '2:00 pm' },
                { title: 'Period6', startTime: '2:00 pm', endTime: '3:00 pm' }
            ]
        }
    }
};