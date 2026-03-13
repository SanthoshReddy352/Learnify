-- Migration: Add profile fields for personalized curriculum
-- Run this in Supabase SQL Editor

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS full_name TEXT,
ADD COLUMN IF NOT EXISTS education_level TEXT,
ADD COLUMN IF NOT EXISTS learning_goals TEXT,
ADD COLUMN IF NOT EXISTS preferred_learning_style TEXT,
ADD COLUMN IF NOT EXISTS learning_schedule TEXT, -- e.g., '30 mins/day', 'Weekends only'
ADD COLUMN IF NOT EXISTS occupation TEXT;

COMMENT ON COLUMN public.profiles.education_level IS 'High School, Undergraduate, Graduate, PhD, Self-Taught, etc.';
COMMENT ON COLUMN public.profiles.preferred_learning_style IS 'Visual, Auditory, Reading/Writing, Kinesthetic, Project-based';
