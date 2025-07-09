-- Add processed columns to events table
-- Run this in your Supabase SQL editor

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

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_events_event_type ON events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_instructor_name ON events(instructor_name);
CREATE INDEX IF NOT EXISTS idx_events_room_name ON events(room_name);
CREATE INDEX IF NOT EXISTS idx_events_has_video_recording ON events(has_video_recording);
CREATE INDEX IF NOT EXISTS idx_events_has_web_conference ON events(has_web_conference); 