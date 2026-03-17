-- Create feedback_votes table
CREATE TABLE IF NOT EXISTS feedback_votes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  course_id UUID NOT NULL,
  user_id UUID NOT NULL,
  vote_type SMALLINT NOT NULL CHECK (vote_type IN (1, -1)),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, course_id)
);

-- Enable RLS
ALTER TABLE feedback_votes ENABLE ROW LEVEL SECURITY;

-- Allow users to read all votes (or just their own depending on needs)
CREATE POLICY "Users can read all votes" 
ON feedback_votes FOR SELECT 
USING (true);

-- Allow users to insert/update their own votes
CREATE POLICY "Users can insert own vote" 
ON feedback_votes FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own vote" 
ON feedback_votes FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own vote" 
ON feedback_votes FOR DELETE 
USING (auth.uid() = user_id);
