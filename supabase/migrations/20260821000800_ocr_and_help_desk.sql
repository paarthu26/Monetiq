-- ---------------------------------------------------------------------------
-- 0008  OCR scan log and Help Desk.
--
-- ocr_scan_log exists because failed scans never reach the Expense Ledger and
-- would otherwise leave no trace at all — it is the only data source for both
-- PRD 6.12's "OCR Usage" metric and the prototype's OCR Management dashboard
-- (scan volume, success rate, avg processing time, recent errors).
-- ---------------------------------------------------------------------------

create table if not exists public.ocr_scan_log (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles (id) on delete cascade,
  status         text not null check (status in ('success', 'failed')),
  failure_reason text,
  duration_ms    integer check (duration_ms is null or duration_ms >= 0),
  provider       text,
  created_at     timestamptz not null default now()
);

create index if not exists ocr_scan_log_user_created_idx
  on public.ocr_scan_log (user_id, created_at desc);
create index if not exists ocr_scan_log_created_idx
  on public.ocr_scan_log (created_at desc);
create index if not exists ocr_scan_log_failed_idx
  on public.ocr_scan_log (created_at desc) where status = 'failed';

-- ------------------------------------------------------------ help desk ----
create table if not exists public.help_desk_tickets (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  category   text not null check (length(btrim(category)) > 0),
  priority   text not null default 'medium'
               check (priority in ('low', 'medium', 'high')),
  subject    text not null check (length(btrim(subject)) > 0),
  status     text not null default 'open' check (status in ('open', 'closed')),
  closed_at  timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists help_desk_tickets_user_idx
  on public.help_desk_tickets (user_id, created_at desc);
create index if not exists help_desk_tickets_status_idx
  on public.help_desk_tickets (status, created_at desc);

drop trigger if exists help_desk_tickets_set_updated_at on public.help_desk_tickets;
create trigger help_desk_tickets_set_updated_at
  before update on public.help_desk_tickets
  for each row execute function public.set_updated_at();

-- No attachment column: v1 has no file attachments on tickets.
create table if not exists public.help_desk_messages (
  id         uuid primary key default gen_random_uuid(),
  ticket_id  uuid not null references public.help_desk_tickets (id) on delete cascade,
  sender_id  uuid not null references public.profiles (id) on delete cascade,
  body       text not null check (length(btrim(body)) > 0),
  created_at timestamptz not null default now()
);

create index if not exists help_desk_messages_ticket_idx
  on public.help_desk_messages (ticket_id, created_at);

-- ------------------------------------------------------------------ RLS ----
alter table public.ocr_scan_log       enable row level security;
alter table public.help_desk_tickets  enable row level security;
alter table public.help_desk_messages enable row level security;

-- ocr_scan_log: owner reads their own history; admin reads all (6.12 + OCR
-- Management). Writes are service-role only, from the process-receipt Edge
-- Function — same integrity reasoning as ai_usage_log.
drop policy if exists ocr_scan_log_select_own on public.ocr_scan_log;
create policy ocr_scan_log_select_own on public.ocr_scan_log
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists ocr_scan_log_select_admin on public.ocr_scan_log;
create policy ocr_scan_log_select_admin on public.ocr_scan_log
  for select to authenticated using (public.is_super_admin());

-- Tickets: the owner raises and closes their own; admins see and manage all.
drop policy if exists help_desk_tickets_select_own on public.help_desk_tickets;
create policy help_desk_tickets_select_own on public.help_desk_tickets
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists help_desk_tickets_select_admin on public.help_desk_tickets;
create policy help_desk_tickets_select_admin on public.help_desk_tickets
  for select to authenticated using (public.is_super_admin());

drop policy if exists help_desk_tickets_insert_own on public.help_desk_tickets;
create policy help_desk_tickets_insert_own on public.help_desk_tickets
  for insert to authenticated
  with check (auth.uid() = user_id and public.is_account_active());

drop policy if exists help_desk_tickets_update_own on public.help_desk_tickets;
create policy help_desk_tickets_update_own on public.help_desk_tickets
  for update to authenticated
  using (auth.uid() = user_id and public.is_account_active())
  with check (auth.uid() = user_id);

drop policy if exists help_desk_tickets_update_admin on public.help_desk_tickets;
create policy help_desk_tickets_update_admin on public.help_desk_tickets
  for update to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

-- No DELETE policy: tickets are closed, never deleted, so the thread survives.

-- Messages: visible to the ticket owner, the message sender, and any admin.
-- INSERT is restricted to the ticket owner or an admin, and the sender_id must
-- be the caller — nobody can post a message attributed to somebody else.
drop policy if exists help_desk_messages_select_participant on public.help_desk_messages;
create policy help_desk_messages_select_participant on public.help_desk_messages
  for select to authenticated
  using (
    sender_id = auth.uid()
    or exists (
      select 1 from public.help_desk_tickets t
      where t.id = ticket_id and t.user_id = auth.uid()
    )
    or public.is_super_admin()
  );

drop policy if exists help_desk_messages_insert_participant on public.help_desk_messages;
create policy help_desk_messages_insert_participant on public.help_desk_messages
  for insert to authenticated
  with check (
    sender_id = auth.uid()
    and public.is_account_active()
    and (
      exists (
        select 1 from public.help_desk_tickets t
        where t.id = ticket_id and t.user_id = auth.uid() and t.status = 'open'
      )
      or public.is_super_admin()
    )
  );

comment on table public.ocr_scan_log is
  'Every OCR attempt, success or failure. Sole data source for the OCR Usage metric and the OCR Management dashboard, since failed scans never reach expense_ledger.';
