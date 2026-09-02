-- Run this SQL in your Supabase SQL Editor to create the stats table

CREATE TABLE public.global_stats (
  id integer PRIMARY KEY,
  visitors integer DEFAULT 0 NOT NULL,
  games_played integer DEFAULT 0 NOT NULL,
  total_players integer DEFAULT 0 NOT NULL,
  options_stats jsonb DEFAULT '{}'::jsonb NOT NULL
);

-- Insert the initial row
INSERT INTO public.global_stats (id, visitors, games_played, total_players, options_stats)
VALUES (1, 0, 0, 0, '{}')
ON CONFLICT (id) DO NOTHING;
