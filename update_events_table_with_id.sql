-- Update events table to add id column as int8
-- Run this in your Supabase SQL editor

-- Add id column as int8 (if not already exists)
ALTER TABLE events 
ADD COLUMN IF NOT EXISTS id int8;

-- Add index for the id column
CREATE INDEX IF NOT EXISTS idx_events_id ON events(id);

-- Create unique constraint on id to ensure uniqueness
CREATE UNIQUE INDEX IF NOT EXISTS idx_events_unique_id ON events(id); 