CREATE TYPE public.session_event AS ENUM ('check_in', 'pause', 'resume', 'check_out');

CREATE TABLE public.session_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
    event_type public.session_event NOT NULL,
    event_time TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
