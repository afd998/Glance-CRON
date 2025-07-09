-- Update events table to match simplified data structure
-- Run this in your Supabase SQL editor

-- Add item_id columns (if not already exists)
ALTER TABLE events 
ADD COLUMN IF NOT EXISTS item_id int8;

ALTER TABLE events 
ADD COLUMN IF NOT EXISTS item_id2 int8;

ALTER TABLE events 
ADD COLUMN IF NOT EXISTS id TEXT;

-- Add event type column
ALTER TABLE events 
ADD COLUMN IF NOT EXISTS event_type TEXT;

-- Add instructor name column
ALTER TABLE events 
ADD COLUMN IF NOT EXISTS instructor_name TEXT;

-- Add lecture title column
ALTER TABLE events 
ADD COLUMN IF NOT EXISTS lecture_title TEXT;

-- Add room name column
ALTER TABLE events 
ADD COLUMN IF NOT EXISTS room_name TEXT;

-- Add resource boolean flags
ALTER TABLE events 
ADD COLUMN IF NOT EXISTS has_video_recording BOOLEAN DEFAULT FALSE;

ALTER TABLE events 
ADD COLUMN IF NOT EXISTS has_handheld_mic BOOLEAN DEFAULT FALSE;

ALTER TABLE events 
ADD COLUMN IF NOT EXISTS has_staff_assistance BOOLEAN DEFAULT FALSE;

ALTER TABLE events 
ADD COLUMN IF NOT EXISTS has_web_conference BOOLEAN DEFAULT FALSE;

ALTER TABLE events 
ADD COLUMN IF NOT EXISTS has_clickers BOOLEAN DEFAULT FALSE;

-- Add resources array column (JSONB for flexibility)
ALTER TABLE events 
ADD COLUMN IF NOT EXISTS resources JSONB DEFAULT '[]'::jsonb;

-- Add raw event data column (JSONB for complete original event object)
ALTER TABLE events 
ADD COLUMN IF NOT EXISTS raw JSONB;

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_events_item_id ON events(item_id);
CREATE INDEX IF NOT EXISTS idx_events_item_id2 ON events(item_id2);
CREATE INDEX IF NOT EXISTS idx_events_id ON events(id);
CREATE INDEX IF NOT EXISTS idx_events_event_type ON events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_instructor_name ON events(instructor_name);
CREATE INDEX IF NOT EXISTS idx_events_room_name ON events(room_name);
CREATE INDEX IF NOT EXISTS idx_events_has_video_recording ON events(has_video_recording);
CREATE INDEX IF NOT EXISTS idx_events_has_web_conference ON events(has_web_conference);

-- Create unique constraint to prevent duplicate events (if not exists)
CREATE UNIQUE INDEX IF NOT EXISTS idx_events_unique_item_date ON events(item_id, event_date); 