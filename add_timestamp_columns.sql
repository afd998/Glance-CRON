-- Add timestamp columns to events table
-- Run this in your Supabase SQL editor

-- Add start_time and end_time columns as timestamptz
ALTER TABLE events 
ADD COLUMN IF NOT EXISTS start_time timestamptz;

ALTER TABLE events 
ADD COLUMN IF NOT EXISTS end_time timestamptz;

-- Add indexes for better query performance on time-based queries
CREATE INDEX IF NOT EXISTS idx_events_start_time ON events(start_time);
CREATE INDEX IF NOT EXISTS idx_events_end_time ON events(end_time);
CREATE INDEX IF NOT EXISTS idx_events_time_range ON events(start_time, end_time); 