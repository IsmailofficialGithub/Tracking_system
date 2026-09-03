-- Create recordings table for video metadata
CREATE TABLE public.recordings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
    file_path TEXT NOT NULL,
    size_bytes BIGINT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE public.recordings ENABLE ROW LEVEL SECURITY;

-- Enable storage and create the private bucket for recordings
INSERT INTO storage.buckets (id, name, public) 
VALUES ('recordings', 'recordings', false)
ON CONFLICT (id) DO NOTHING;

-- Set up basic storage RLS policies
CREATE POLICY "Allow authenticated uploads" 
ON storage.objects FOR INSERT 
TO authenticated 
WITH CHECK (bucket_id = 'recordings');
