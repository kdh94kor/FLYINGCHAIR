-- Run this SQL in your Supabase SQL Editor to create the NEW time-series tables

-- 1. 방문자 로그 테이블
CREATE TABLE IF NOT EXISTS public.visits_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  ip_hash text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. 게임 실행 로그 테이블
CREATE TABLE IF NOT EXISTS public.games_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  options jsonb DEFAULT '{}'::jsonb,
  player_count integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. 금기어 누적 빈도수 테이블 (Top 100 랭킹 및 추천용)
CREATE TABLE IF NOT EXISTS public.taboo_words (
  word text PRIMARY KEY,
  count integer DEFAULT 1,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Top 100 조회 초고속 색인 인덱스
CREATE INDEX IF NOT EXISTS idx_taboo_words_count ON public.taboo_words (count DESC);

-- 원자적(Atomic) 배치 카운트 증가 프로시저 (RPC)
CREATE OR REPLACE FUNCTION increment_taboo_words(words_json jsonb)
RETURNS void AS $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT * FROM jsonb_each_text(words_json)
  LOOP
    INSERT INTO public.taboo_words (word, count, updated_at)
    VALUES (r.key, (r.value)::integer, now())
    ON CONFLICT (word)
    DO UPDATE SET 
      count = public.taboo_words.count + EXCLUDED.count,
      updated_at = now();
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- (Optional) 기존 global_stats 테이블은 더 이상 사용하지 않으므로 삭제하셔도 됩니다.
-- DROP TABLE IF EXISTS public.global_stats;
