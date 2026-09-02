const { createClient } = require('@supabase/supabase-js');
const WebSocket = require('ws');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

let supabase = null;
if (supabaseUrl && supabaseKey) {
  global.WebSocket = WebSocket; 
  supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false }
  });
  console.log('Supabase connection initialized for Time-Series Logging.');
} else {
  console.warn("Supabase credentials not found. Stats will not be saved.");
}

// In-memory set for daily unique visitors (prevent spamming DB)
const seenIps = new Set();
// Periodically clear seenIps to allow recounting visitors on subsequent days
setInterval(() => seenIps.clear(), 1000 * 60 * 60 * 24); 

// Hash IP lightly for privacy before saving
const crypto = require('crypto');
function hashIp(ip) {
  return crypto.createHash('sha256').update(ip).digest('hex').substring(0, 16);
}

async function recordVisitor(ip) {
  if (!ip) return;
  const hashed = hashIp(ip);
  if (!seenIps.has(hashed)) {
    seenIps.add(hashed);
    if (supabase) {
      // Background insert
      supabase.from('visits_log').insert([{ ip_hash: hashed }]).then(({error}) => {
        if(error) console.error('Error inserting visit:', error);
      });
    }
  }
}

async function recordGameStart(options, playerCount) {
  if (supabase) {
    // Background insert
    supabase.from('games_log').insert([{
      options: options || {},
      player_count: playerCount || 0
    }]).then(({error}) => {
      if(error) console.error('Error inserting game log:', error);
    });
  }
}

async function getStats(fromIso, toIso) {
  if (!supabase) return { error: "Supabase 미연동" };

  try {
    // 날짜 필터 적용
    let visitsQuery = supabase.from('visits_log').select('created_at');
    let gamesQuery = supabase.from('games_log').select('created_at, options, player_count');

    if (fromIso) {
      visitsQuery = visitsQuery.gte('created_at', fromIso);
      gamesQuery = gamesQuery.gte('created_at', fromIso);
    }
    if (toIso) {
      visitsQuery = visitsQuery.lte('created_at', toIso);
      gamesQuery = gamesQuery.lte('created_at', toIso);
    }

    const [visitsRes, gamesRes] = await Promise.all([visitsQuery, gamesQuery]);

    if (visitsRes.error) throw visitsRes.error;
    if (gamesRes.error) throw gamesRes.error;

    const visits = visitsRes.data || [];
    const games = gamesRes.data || [];

    // 통계 집계 로직
    let totalPlayers = 0;
    const optionsCount = {};
    const dayOfWeekCount = { 0:0, 1:0, 2:0, 3:0, 4:0, 5:0, 6:0 }; // 0:일요일 ~ 6:토요일
    const hourOfDayCount = Array(24).fill(0);
    const dailyVisits = {};
    const dailyGames = {};

    // 방문자 처리
    visits.forEach(v => {
      const d = new Date(v.created_at);
      const dateStr = d.toISOString().split('T')[0]; // YYYY-MM-DD
      
      dailyVisits[dateStr] = (dailyVisits[dateStr] || 0) + 1;
      dayOfWeekCount[d.getDay()]++;
      hourOfDayCount[d.getHours()]++;
    });

    // 게임 처리
    games.forEach(g => {
      const d = new Date(g.created_at);
      const dateStr = d.toISOString().split('T')[0];
      
      dailyGames[dateStr] = (dailyGames[dateStr] || 0) + 1;
      totalPlayers += (g.player_count || 0);

      if (g.options) {
        for (const [key, val] of Object.entries(g.options)) {
          const optStr = `${key}:${val}`;
          optionsCount[optStr] = (optionsCount[optStr] || 0) + 1;
        }
      }
    });

    // Sort daily arrays for chart
    const sortedDates = Array.from(new Set([...Object.keys(dailyVisits), ...Object.keys(dailyGames)])).sort();
    const trendData = sortedDates.map(date => ({
      date,
      visits: dailyVisits[date] || 0,
      games: dailyGames[date] || 0
    }));

    return {
      totalVisitors: visits.length,
      totalGames: games.length,
      totalPlayers,
      trendData,
      dayOfWeekCount,
      hourOfDayCount,
      optionsCount
    };

  } catch (err) {
    console.error('Error fetching advanced stats:', err);
    return { error: 'Failed to load stats' };
  }
}

module.exports = {
  recordVisitor,
  recordGameStart,
  getStats
};
