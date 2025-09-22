/**
 * Debug script to check environment variables
 */

// Load environment variables from .env file
require('dotenv').config();

console.log('=== Environment Variables Debug ===');
console.log('');

// Check if .env file was loaded
console.log('Environment variables found:');
console.log('SUPABASE_URL:', process.env.SUPABASE_URL ? '✓ Found' : '✗ Missing');
console.log('SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? '✓ Found' : '✗ Missing');
console.log('NORTHWESTERN_USERNAME:', process.env.NORTHWESTERN_USERNAME ? '✓ Found' : '✗ Missing');
console.log('NORTHWESTERN_PASSWORD:', process.env.NORTHWESTERN_PASSWORD ? '✓ Found' : '✗ Missing');

console.log('');
console.log('All environment variables:');
Object.keys(process.env).forEach(key => {
  if (key.includes('SUPABASE') || key.includes('NORTHWESTERN')) {
    console.log(`${key}: ${process.env[key] ? '***SET***' : 'NOT SET'}`);
  }
});

console.log('');
console.log('=== End Debug ==='); 