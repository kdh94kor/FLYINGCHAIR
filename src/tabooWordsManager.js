const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', 'data', 'taboo_words.json');
const CACHE_TTL_MS = 5 * 60 * 1000; // 5분 TTL

let wordCounts = {};
let cachedTop100 = null;
let cacheExpiresAt = 0;
let isDirty = false;
let saveTimer = null;

// Initial load
function loadWords() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      const data = JSON.parse(raw);
      if (data && data.words && typeof data.words === 'object') {
        wordCounts = data.words;
      }
    }
  } catch (err) {
    console.error('Failed to load taboo_words.json:', err);
  }
}

loadWords();

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

function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(async () => {
    saveTimer = null;
    if (!isDirty) return;
    try {
      await fs.promises.writeFile(DATA_FILE, JSON.stringify({ words: wordCounts }, null, 2), 'utf8');
      isDirty = false;
    } catch (err) {
      console.error('Failed to save taboo_words.json:', err);
    }
  }, 2000); // 2초 디바운스
}

function recordWords(wordList) {
  if (!Array.isArray(wordList) || wordList.length === 0) return;
  let updated = false;

  for (const item of wordList) {
    if (typeof item !== 'string') continue;
    const clean = item.trim();
    if (clean.length >= 2 && clean.length <= 20) {
      wordCounts[clean] = (wordCounts[clean] || 0) + 1;
      updated = true;
    }
  }

  if (updated) {
    isDirty = true;
    scheduleSave();
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

module.exports = {
  getTop100Words,
  recordWords,
  recordWordsFromPayload
};
