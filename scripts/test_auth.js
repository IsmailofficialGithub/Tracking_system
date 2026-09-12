const http = require('http');

const API_URL = 'http://127.0.0.1:3000/api/auth';
const testUser = {
  email: `testuser_${Date.now()}@example.com`,
  password: 'securepassword123',
  name: 'Test Employee'
};

async function request(endpoint, payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const req = http.request(
      `${API_URL}${endpoint}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
        },
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(JSON.parse(body));
          } else {
            reject(`Error ${res.statusCode}: ${body}`);
          }
        });
      }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function runTests() {
  console.log('--- Starting Native Auth Tests ---');
  
  try {
    // 1. Test Registration
    console.log(`\n[1] Registering new user: ${testUser.email}...`);
    const regResult = await request('/register', testUser);
    console.log('✅ Registration Successful!');
    console.log(`Received JWT Token: ${regResult.token.substring(0, 20)}...`);

    // 2. Test Login
    console.log('\n[2] Testing Login with same credentials...');
    const loginResult = await request('/login', {
      email: testUser.email,
      password: testUser.password,
    });
    console.log('✅ Login Successful!');
    console.log(`Received JWT Token: ${loginResult.token.substring(0, 20)}...`);

    // 3. Test Invalid Login
    console.log('\n[3] Testing Login with wrong password...');
    try {
      await request('/login', {
        email: testUser.email,
        password: 'wrongpassword',
      });
      console.log('❌ Failed: Should have rejected the login!');
    } catch (e) {
      console.log('✅ Correctly rejected invalid login: ' + e);
    }

    console.log('\n🎉 All authentication tests passed natively!');
  } catch (error) {
    console.error('\n❌ Test Failed:', error);
  }
}

// Give the backend a couple of seconds to bind to the port before testing if run immediately
setTimeout(runTests, 2000);
