import { webApi } from './src/lib';
import { config } from './src/config';

async function testApiEndpoint() {
    console.log('🔧 Testing API Gateway deployment fix...');
    
    try {
        // Login with test credentials
        console.log('📝 Logging in...');
        await webApi.login(config.env.testing.admin);
        console.log('✅ Login successful');

        // Test the specific endpoint that was failing
        console.log('🎯 Testing PUT /api/v2/student/devices/app endpoint...');
        
        // Create a minimal test request
        const testRequest = {
            studentId: 'test-student-id',
            dsn: 'test-device-serial',
            deviceId: 'test-device-id',
            deviceName: 'Test Device',
            studentName: 'Test Student',
            textAlerts: false,
            events: [],
            groups: []
        };

        try {
            const response = await webApi.putStudentAppV2(testRequest);
            console.log('✅ API call successful! Response:', response);
        } catch (error) {
            if (error.message && error.message.includes('502')) {
                console.log('❌ Still getting 502 error - API Gateway deployment may not have fixed the issue');
                console.log('Error details:', error.message);
            } else if (error.message && error.message.includes('400')) {
                console.log('✅ API Gateway is working! Got 400 error (expected for invalid test data)');
                console.log('This means the API is reachable and processing requests');
            } else {
                console.log('🔍 Got different error (API may be working):', error.message);
            }
        }

        // Test a simple GET endpoint to verify basic connectivity
        console.log('🔍 Testing GET /api/v2/user endpoint...');
        try {
            const user = await webApi.getUser();
            console.log('✅ GET endpoint working! User:', user.details.email);
        } catch (error) {
            console.log('❌ GET endpoint failed:', error.message);
        }

    } catch (error) {
        console.log('❌ Test failed:', error.message);
        
        if (error.message && error.message.includes('Token is expired')) {
            console.log('💡 AWS SSO token expired. Please run: aws sso login');
        }
    }
}

// Run the test
testApiEndpoint().then(() => {
    console.log('🏁 Test completed');
}).catch((error) => {
    console.error('💥 Test script failed:', error);
});