const { createClient } = require('@supabase/supabase-js');
const WebSocket = require('ws');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

let supabase = null;

if (supabaseUrl && supabaseKey) {
  try {
    global.WebSocket = WebSocket;
    supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false }
    });
    console.log('✅ Supabase client initialized (SSOT).');
  } catch (err) {
    console.error('Failed to initialize Supabase client:', err);
  }
} else {
  console.warn('⚠️ Supabase credentials not found in env. Running in local fallback mode.');
}

module.exports = supabase;
