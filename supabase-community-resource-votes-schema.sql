-- Create community_resource_votes table
-- Assumes community_resources.id and auth user ids are UUIDs.
CREATE TABLE IF NOT EXISTS community_resource_votes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  resource_id UUID NOT NULL,
  user_id UUID NOT NULL,
  vote_type SMALLINT NOT NULL CHECK (vote_type IN (1, -1)),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, resource_id)
);

-- Enable RLS
ALTER TABLE community_resource_votes ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read vote totals
CREATE POLICY "Users can read all resource votes"
ON community_resource_votes FOR SELECT
USING (true);

-- Allow users to manage only their own votes
CREATE POLICY "Users can insert own resource vote"
ON community_resource_votes FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own resource vote"
ON community_resource_votes FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own resource vote"
ON community_resource_votes FOR DELETE
USING (auth.uid() = user_id);
