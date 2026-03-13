-- SEED DATA FOR DASHBOARD ANALYTICS & RECOMMENDATIONS
-- Run this script in your Supabase SQL Editor to populate the dashboard with test data.

DO $$
DECLARE
  v_user_id UUID;
  v_subject_id UUID;
  v_topic1_id UUID;
  v_topic2_id UUID;
  v_topic3_id UUID;
BEGIN
  -- 1. Get the current user (using the first one found for simplicity in this script)
  -- In a real scenario, you'd perform this as the logged-in user or specify the ID.
  SELECT id INTO v_user_id FROM auth.users LIMIT 1;
  
  IF v_user_id IS NULL THEN
    RAISE NOTICE 'No users found. Please sign up in the app first.';
    RETURN;
  END IF;

  RAISE NOTICE 'Seeding data for User ID: %', v_user_id;

  -- 2. Ensure a Subject exists
  SELECT id INTO v_subject_id FROM subjects WHERE user_id = v_user_id LIMIT 1;

  IF v_subject_id IS NULL THEN
    INSERT INTO subjects (user_id, title, description)
    VALUES (v_user_id, 'Computer Science 101', 'Introductory CS concepts and programming.')
    RETURNING id INTO v_subject_id;
    RAISE NOTICE 'Created new Subject: %', v_subject_id;
  ELSE
    RAISE NOTICE 'Using existing Subject: %', v_subject_id;
  END IF;

  -- 3. Ensure Topics exist
  -- Create Topic 1 (For Review)
  INSERT INTO topics (subject_id, title, description, status, estimated_minutes, difficulty)
  VALUES (v_subject_id, 'Data Structures', 'Arrays, Linked Lists, Trees', 'reviewing', 45, 3)
  RETURNING id INTO v_topic1_id;

  -- Create Topic 2 (Available to Learn)
  INSERT INTO topics (subject_id, title, description, status, estimated_minutes, difficulty)
  VALUES (v_subject_id, 'Algorithms', 'Sorting and Searching', 'available', 60, 4)
  RETURNING id INTO v_topic2_id;
  
  -- Create Topic 3 (Mastered)
  INSERT INTO topics (subject_id, title, description, status, estimated_minutes, difficulty)
  VALUES (v_subject_id, 'Big O Notation', 'Complexity analysis', 'mastered', 30, 2)
  RETURNING id INTO v_topic3_id;

  -- 4. Set SM-2 State for "Due Review" (Topic 1)
  -- Set next_review_at to Yesterday so it appears as DUE
  UPDATE topics 
  SET next_review_at = NOW() - INTERVAL '1 day',
      interval_days = 1,
      repetition_count = 1,
      difficulty_factor = 2.5
  WHERE id = v_topic1_id;

  -- 5. Insert Study Logs (for Weekly Stats)
  
  -- Today (Learning)
  INSERT INTO study_logs (user_id, topic_id, subject_id, session_type, duration_minutes, created_at)
  VALUES (v_user_id, v_topic2_id, v_subject_id, 'learning', 45, NOW());

  -- Yesterday (Review)
  INSERT INTO study_logs (user_id, topic_id, subject_id, session_type, duration_minutes, created_at)
  VALUES (v_user_id, v_topic1_id, v_subject_id, 'review', 15, NOW() - INTERVAL '1 day');

  -- 2 Days Ago (Learning)
  INSERT INTO study_logs (user_id, topic_id, subject_id, session_type, duration_minutes, created_at)
  VALUES (v_user_id, v_topic3_id, v_subject_id, 'learning', 30, NOW() - INTERVAL '2 days');

  -- 3 Days Ago (Review)
  INSERT INTO study_logs (user_id, topic_id, subject_id, session_type, duration_minutes, created_at)
  VALUES (v_user_id, v_topic1_id, v_subject_id, 'review', 10, NOW() - INTERVAL '3 days');

  -- 4 Days Ago (Heavy Learning)
  INSERT INTO study_logs (user_id, topic_id, subject_id, session_type, duration_minutes, created_at)
  VALUES (v_user_id, v_topic1_id, v_subject_id, 'learning', 90, NOW() - INTERVAL '4 days');

  RAISE NOTICE 'Seeding Complete!';
END $$;
