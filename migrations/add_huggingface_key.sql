-- Add huggingface_api_key to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS huggingface_api_key TEXT;
