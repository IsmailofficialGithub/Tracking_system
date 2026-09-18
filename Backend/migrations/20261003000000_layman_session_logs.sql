-- Add new layman event types and notes column to session_logs
ALTER TYPE session_event ADD VALUE IF NOT EXISTS 'connection_lost';
ALTER TYPE session_event ADD VALUE IF NOT EXISTS 'app_closed';
ALTER TYPE session_event ADD VALUE IF NOT EXISTS 'reconnected';

ALTER TABLE public.session_logs ADD COLUMN IF NOT EXISTS notes TEXT;
