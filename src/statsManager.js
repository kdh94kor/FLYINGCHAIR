const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

let supabase = null;
if (supabaseUrl && supabaseKey) {
  supabase = createClient(supabaseUrl, supabaseKey);
  console.log('Supabase connection initialized.');
} else {
  console.warn("Supabase credentials (SUPABASE_URL, SUPABASE_KEY) not found in env. Stats will be kept in memory only and lost on restart.");
}

// Memory cache for stats to prevent excessive DB reads/writes
let cachedStats = { visitors: 0, gamesPlayed: 0, totalPlayers: 0, optionsStats: {} };
let isLoaded = false;

async function loadStats() {
  if (!supabase) {
    isLoaded = true;
    return cachedStats;
  }
  
  try {
    const { data, error } = await supabase
      .from('global_stats')
      .select('*')
      .eq('id', 1)
      .single();
      
    if (error && error.code !== 'PGRST116') { // PGRST116: No rows found
      console.error('Error loading stats from Supabase:', error);
      return cachedStats;
    }
    
    if (data) {
      cachedStats = {
        visitors: data.visitors || 0,
        gamesPlayed: data.games_played || 0,
        totalPlayers: data.total_players || 0,
        optionsStats: data.options_stats || {}
      };
      isLoaded = true;
    } else {
      // Row doesn't exist, insert initial
      await supabase.from('global_stats').insert({
        id: 1, 
        visitors: 0, 
        games_played: 0, 
        total_players: 0, 
        options_stats: {}
      });
      isLoaded = true;
    }
  } catch (err) {
    console.error('Exception loading stats:', err);
  }
  return cachedStats;
}

async function saveStats() {
  if (!supabase) return;
  try {
    await supabase
      .from('global_stats')
      .update({
        visitors: cachedStats.visitors,
        games_played: cachedStats.gamesPlayed,
        total_players: cachedStats.totalPlayers,
        options_stats: cachedStats.optionsStats
      })
      .eq('id', 1);
  } catch (err) {
    console.error('Error saving stats:', err);
  }
}

// In-memory set for daily unique visitors (lifecycle of the node process for now)
const seenIps = new Set();

async function recordVisitor(ip) {
  if (!ip) return;
  if (!seenIps.has(ip)) {
    seenIps.add(ip);
    if (!isLoaded) await loadStats();
    cachedStats.visitors += 1;
    // Don't await saveStats to prevent blocking the request
    saveStats();
  }
}

async function recordGameStart(options, playerCount) {
  if (!isLoaded) await loadStats();
  
  cachedStats.gamesPlayed += 1;
  cachedStats.totalPlayers += (playerCount || 0);
  
  if (options && typeof options === 'object') {
    if (!cachedStats.optionsStats) cachedStats.optionsStats = {};
    for (const [key, value] of Object.entries(options)) {
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        const optionKey = `${key}:${value}`;
        cachedStats.optionsStats[optionKey] = (cachedStats.optionsStats[optionKey] || 0) + 1;
      }
    }
  }
  // Don't await saveStats to prevent blocking the socket event
  saveStats();
}

async function getStats() {
  if (!isLoaded) await loadStats();
  return cachedStats;
}

// Initial load on server start
loadStats();

module.exports = {
  recordVisitor,
  recordGameStart,
  getStats
};
