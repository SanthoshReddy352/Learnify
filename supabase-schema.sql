-- Learnify Database Schema for Supabase
-- Run this SQL in your Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Profiles table (extends auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Subjects table
CREATE TABLE IF NOT EXISTS subjects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  is_public BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Topics table with SM-2 fields
CREATE TABLE IF NOT EXISTS topics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  content TEXT,
  estimated_minutes INTEGER DEFAULT 30,
  difficulty INTEGER DEFAULT 3 CHECK (difficulty >= 1 AND difficulty <= 5),
  status TEXT DEFAULT 'locked' CHECK (status IN ('locked', 'available', 'learning', 'reviewing', 'mastered')),
  -- SM-2 algorithm fields
  interval_days INTEGER DEFAULT 0,
  repetition_count INTEGER DEFAULT 0,
  difficulty_factor DECIMAL(3,2) DEFAULT 2.5,
  next_review_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Topic Dependencies (DAG edges)
CREATE TABLE IF NOT EXISTS topic_dependencies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  topic_id UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  depends_on_topic_id UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(topic_id, depends_on_topic_id),
  CHECK (topic_id != depends_on_topic_id)
);

-- Study Logs
CREATE TABLE IF NOT EXISTS study_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  topic_id UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  session_type TEXT NOT NULL CHECK (session_type IN ('learning', 'review')),
  duration_minutes INTEGER,
  quality_rating INTEGER CHECK (quality_rating >= 0 AND quality_rating <= 5),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Saved Graph Layouts
CREATE TABLE IF NOT EXISTS saved_graph_layouts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  layout_data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(subject_id, user_id)
);

-- Shared Subject Clones (for community feature)
CREATE TABLE IF NOT EXISTS shared_subject_clones (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  original_subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  cloned_subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  cloned_by_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_subjects_user_id ON subjects(user_id);
CREATE INDEX IF NOT EXISTS idx_topics_subject_id ON topics(subject_id);
CREATE INDEX IF NOT EXISTS idx_topics_status ON topics(status);
CREATE INDEX IF NOT EXISTS idx_topics_next_review ON topics(next_review_at);
CREATE INDEX IF NOT EXISTS idx_dependencies_topic ON topic_dependencies(topic_id);
CREATE INDEX IF NOT EXISTS idx_dependencies_depends_on ON topic_dependencies(depends_on_topic_id);
CREATE INDEX IF NOT EXISTS idx_study_logs_user ON study_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_study_logs_topic ON study_logs(topic_id);
CREATE INDEX IF NOT EXISTS idx_study_logs_created ON study_logs(created_at);

-- RLS Policies
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE topic_dependencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_graph_layouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE shared_subject_clones ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

-- Subjects policies
CREATE POLICY "Users can view own subjects" ON subjects FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can view public subjects" ON subjects FOR SELECT USING (is_public = true);
CREATE POLICY "Users can insert own subjects" ON subjects FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own subjects" ON subjects FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own subjects" ON subjects FOR DELETE USING (auth.uid() = user_id);

-- Topics policies
CREATE POLICY "Users can view own topics" ON topics FOR SELECT USING (
  EXISTS (SELECT 1 FROM subjects WHERE subjects.id = topics.subject_id AND subjects.user_id = auth.uid())
);
CREATE POLICY "Users can view public topics" ON topics FOR SELECT USING (
  EXISTS (SELECT 1 FROM subjects WHERE subjects.id = topics.subject_id AND subjects.is_public = true)
);
CREATE POLICY "Users can insert own topics" ON topics FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM subjects WHERE subjects.id = topics.subject_id AND subjects.user_id = auth.uid())
);
CREATE POLICY "Users can update own topics" ON topics FOR UPDATE USING (
  EXISTS (SELECT 1 FROM subjects WHERE subjects.id = topics.subject_id AND subjects.user_id = auth.uid())
);
CREATE POLICY "Users can delete own topics" ON topics FOR DELETE USING (
  EXISTS (SELECT 1 FROM subjects WHERE subjects.id = topics.subject_id AND subjects.user_id = auth.uid())
);

-- Topic Dependencies policies
CREATE POLICY "Users can view own dependencies" ON topic_dependencies FOR SELECT USING (
  EXISTS (SELECT 1 FROM subjects WHERE subjects.id = topic_dependencies.subject_id AND subjects.user_id = auth.uid())
);
CREATE POLICY "Users can view public dependencies" ON topic_dependencies FOR SELECT USING (
  EXISTS (SELECT 1 FROM subjects WHERE subjects.id = topic_dependencies.subject_id AND subjects.is_public = true)
);
CREATE POLICY "Users can insert own dependencies" ON topic_dependencies FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM subjects WHERE subjects.id = topic_dependencies.subject_id AND subjects.user_id = auth.uid())
);
CREATE POLICY "Users can delete own dependencies" ON topic_dependencies FOR DELETE USING (
  EXISTS (SELECT 1 FROM subjects WHERE subjects.id = topic_dependencies.subject_id AND subjects.user_id = auth.uid())
);

-- Study Logs policies (private to user)
CREATE POLICY "Users can view own logs" ON study_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own logs" ON study_logs FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Saved Graph Layouts policies
CREATE POLICY "Users can view own layouts" ON saved_graph_layouts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own layouts" ON saved_graph_layouts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own layouts" ON saved_graph_layouts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own layouts" ON saved_graph_layouts FOR DELETE USING (auth.uid() = user_id);

-- Shared Clones policies
CREATE POLICY "Users can view own clones" ON shared_subject_clones FOR SELECT USING (auth.uid() = cloned_by_user_id);
CREATE POLICY "Users can insert own clones" ON shared_subject_clones FOR INSERT WITH CHECK (auth.uid() = cloned_by_user_id);

-- Function to automatically create profile on sign up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username, display_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'username',
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create profile on user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subjects_updated_at BEFORE UPDATE ON subjects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_topics_updated_at BEFORE UPDATE ON topics
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_layouts_updated_at BEFORE UPDATE ON saved_graph_layouts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
