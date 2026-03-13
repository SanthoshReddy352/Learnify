-- Migration: Add flashcards column to topics table
-- Run this in Supabase SQL Editor

ALTER TABLE public.topics 
ADD COLUMN IF NOT EXISTS flashcards JSONB;

COMMENT ON COLUMN public.topics.flashcards IS 'Stores the AI-generated flashcards for this topic';
