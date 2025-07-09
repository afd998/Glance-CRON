-- Create events table with processed columns and raw JSONB data
-- Run this in your Supabase SQL editor

-- Create the events table
CREATE TABLE IF NOT EXISTS events (
    id SERIAL PRIMARY KEY,
    
    -- Event identification
    item_id TEXT NOT NULL,
    event_date DATE NOT NULL,
    
    -- Processed event properties
    event_type TEXT,
    instructor_name TEXT,
    lecture_title TEXT,
    room_name TEXT,
    
    -- Resource boolean flags
    has_video_recording BOOLEAN DEFAULT FALSE,
    has_handheld_mic BOOLEAN DEFAULT FALSE,
    has_staff_assistance BOOLEAN DEFAULT FALSE,
    has_web_conference BOOLEAN DEFAULT FALSE,
    has_clickers BOOLEAN DEFAULT FALSE,
    
    -- Resources array (JSONB for flexibility)
    resources JSONB DEFAULT '[]'::jsonb,
    
    -- Raw event data (complete original event object)
    raw_event_data JSONB NOT NULL,
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_events_item_id ON events(item_id);
CREATE INDEX IF NOT EXISTS idx_events_event_date ON events(event_date);
CREATE INDEX IF NOT EXISTS idx_events_event_type ON events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_instructor_name ON events(instructor_name);
CREATE INDEX IF NOT EXISTS idx_events_room_name ON events(room_name);
CREATE INDEX IF NOT EXISTS idx_events_has_video_recording ON events(has_video_recording);
CREATE INDEX IF NOT EXISTS idx_events_has_web_conference ON events(has_web_conference);

-- Create unique constraint to prevent duplicate events
CREATE UNIQUE INDEX IF NOT EXISTS idx_events_unique_item_date ON events(item_id, event_date);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_events_updated_at 
    BEFORE UPDATE ON events 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column(); 