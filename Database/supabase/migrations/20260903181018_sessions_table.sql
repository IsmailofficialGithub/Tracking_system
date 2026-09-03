-- Enum for Session Status
CREATE TYPE session_status AS ENUM ('on_time', 'late', 'interrupted', 'ended_early', 'completed');

-- Sessions Table
CREATE TABLE public.sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    shift_template_id UUID NOT NULL REFERENCES public.shift_templates(id) ON DELETE CASCADE,
    check_in_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    check_out_at TIMESTAMPTZ,
    status session_status NOT NULL,
    recording_id UUID, -- For Phase 5
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
