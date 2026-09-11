const fs = require('fs');
const path = require('path');
const supabase = require('./supabaseClient');

const DATA_FILE = path.join(__dirname, '..', 'data', 'taboo_words.json');
const CACHE_TTL_MS = 5 * 60 * 1000; // 5분 캐시 TTL
const DB_FLUSH_INTERVAL_MS = 60 * 1000; // 60초 주기 Write-Behind 플러시

let wordCounts = {};
let pendingDeltas = {}; // DB에 플러시 대기 중인 증분 카운터
let cachedTop100 = null;
let cacheExpiresAt = 0;
let isDirty = false;
let saveTimer = null;
let flushTimer = null;

// ── 1. 로컬 JSON 파일 1차 로드 (0ms 즉시 기동) ──────────────────────────────────
function loadLocalWords() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      const data = JSON.parse(raw);
      if (data && data.words && typeof data.words === 'object') {
        wordCounts = { ...data.words };
      }
    }
  } catch (err) {
    console.error('[TabooWords] Failed to load local taboo_words.json:', err);
  }
}

loadLocalWords();

// ── 2. Top 100 인메모리 정렬 및 캐싱 ──────────────────────────────────────────
function computeTop100() {
  const sorted = Object.entries(wordCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 100)
    .map(([word]) => word);

  cachedTop100 = sorted;
  cacheExpiresAt = Date.now() + CACHE_TTL_MS;
  return cachedTop100;
}

function getTop100Words() {
  if (cachedTop100 && Date.now() < cacheExpiresAt) {
    return cachedTop100;
  }
  return computeTop100();
}

// ── 3. 로컬 파일 백업 (디바운스 2초) ─────────────────────────────────────────
function scheduleLocalSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(async () => {
    saveTimer = null;
    if (!isDirty) return;
    try {
      await fs.promises.writeFile(DATA_FILE, JSON.stringify({ words: wordCounts }, null, 2), 'utf8');
      isDirty = false;
    } catch (err) {
      console.error('[TabooWords] Failed to save local taboo_words.json backup:', err);
    }
  }, 2000);
}

// ── 4. Supabase DB 비동기 배치 플러시 (Write-Behind Cache) ────────────────────
async function flushToDb() {
  const wordsToFlush = Object.keys(pendingDeltas);
  if (wordsToFlush.length === 0 || !supabase) return;

  const batch = { ...pendingDeltas };
  pendingDeltas = {}; // 버퍼 즉시 리셋

  try {
    // 1차 시도: 원자적(Atomic) RPC 증분 프로시저
    const { error: rpcError } = await supabase.rpc('increment_taboo_words', { words_json: batch });

    if (rpcError) {
      // RPC 미등록 시 폴백: 현재 최신 토탈 카운트로 직접 Upsert
      const upsertRows = Object.keys(batch).map(w => ({
        word: w,
        count: wordCounts[w] || 1,
        updated_at: new Date().toISOString()
      }));

      const { error: upsertError } = await supabase
        .from('taboo_words')
        .upsert(upsertRows, { onConflict: 'word' });

      if (upsertError) {
        throw upsertError;
      }
    }

    console.log(`[TabooWords] Flushed ${wordsToFlush.length} taboo words to Supabase DB.`);
  } catch (err) {
    console.error('[TabooWords] DB flush error (will retry next cycle):', err.message || err);
    // 실패한 증분들을 버퍼로 롤백하여 유실 방지
    for (const [w, cnt] of Object.entries(batch)) {
      pendingDeltas[w] = (pendingDeltas[w] || 0) + cnt;
    }
  }
}

// 60초 주기 자동 플러시 타이머
flushTimer = setInterval(flushToDb, DB_FLUSH_INTERVAL_MS);

// ── 5. Supabase DB 초기 하이드레이션 & 시딩 (Non-blocking) ────────────────────
async function initDbSync() {
  if (!supabase) return;

  try {
    const { data: rows, error } = await supabase
      .from('taboo_words')
      .select('word, count')
      .order('count', { ascending: false })
      .limit(300);

    if (error) {
      // 테이블이 아직 없는 경우 (사용자가 SQL 실행 전)
      console.warn('[TabooWords] Supabase taboo_words table not ready yet. Running in local memory/file mode.');
      return;
    }

    if (rows && rows.length > 0) {
      // DB에 누적된 데이터가 있는 경우 메모리에 병합
      for (const r of rows) {
        wordCounts[r.word] = Math.max(wordCounts[r.word] || 0, r.count);
      }
      computeTop100();
      console.log(`[TabooWords] Hydrated ${rows.length} taboo words from Supabase DB.`);
    } else {
      // DB가 비어있는 경우 로컬 100선 프리셋을 DB로 자동 초기 시딩
      const initialSeed = Object.entries(wordCounts).map(([w, c]) => ({
        word: w,
        count: c,
        updated_at: new Date().toISOString()
      }));

      if (initialSeed.length > 0) {
        const { error: seedErr } = await supabase.from('taboo_words').upsert(initialSeed, { onConflict: 'word' });
        if (!seedErr) {
          console.log(`[TabooWords] Initial seeded ${initialSeed.length} taboo words to Supabase DB.`);
        }
      }
    }
  } catch (err) {
    console.warn('[TabooWords] DB sync notice:', err.message || err);
  }
}

// 백그라운드 DB 동기화 실행
initDbSync();

// ── 6. 단어 등록 및 집계 API ──────────────────────────────────────────────────
function recordWords(wordList) {
  if (!Array.isArray(wordList) || wordList.length === 0) return;
  let updated = false;

  for (const item of wordList) {
    if (typeof item !== 'string') continue;
    const clean = item.trim();
    if (clean.length >= 2 && clean.length <= 20) {
      wordCounts[clean] = (wordCounts[clean] || 0) + 1;
      pendingDeltas[clean] = (pendingDeltas[clean] || 0) + 1;
      updated = true;
    }
  }

  if (updated) {
    isDirty = true;
    scheduleLocalSave();
  }
}

function recordWordsFromPayload(targetWords) {
  if (!targetWords || typeof targetWords !== 'object') return;
  const list = [];
  for (const targetId in targetWords) {
    const arr = targetWords[targetId];
    if (Array.isArray(arr)) {
      list.push(...arr);
    } else if (typeof arr === 'string') {
      list.push(arr);
    }
  }
  recordWords(list);
}

// 프로세스 종료 시 잔여 버퍼 플러시
process.on('SIGTERM', async () => {
  if (flushTimer) clearInterval(flushTimer);
  await flushToDb();
});

module.exports = {
  getTop100Words,
  recordWords,
  recordWordsFromPayload,
  flushToDb, // For manual trigger in tests
  getPendingDeltasCount: () => Object.keys(pendingDeltas).length,
  getWordCount: (w) => wordCounts[w] || 0
};
