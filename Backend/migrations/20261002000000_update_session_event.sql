-- Update session_event enum to include offline and auto_checkout events
ALTER TYPE session_event ADD VALUE 'offline';
ALTER TYPE session_event ADD VALUE 'auto_checkout';
