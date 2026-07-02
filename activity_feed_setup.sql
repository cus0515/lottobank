-- 실시간 활동 피드 테이블
CREATE TABLE IF NOT EXISTS activity_feed (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  nick TEXT NOT NULL DEFAULT '익명',
  type TEXT NOT NULL,
  data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE activity_feed ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "feed_read_all" ON activity_feed;
DROP POLICY IF EXISTS "feed_insert_own" ON activity_feed;

CREATE POLICY "feed_read_all"   ON activity_feed FOR SELECT USING (true);
CREATE POLICY "feed_insert_own" ON activity_feed FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Realtime 활성화
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE activity_feed;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
