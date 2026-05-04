-- ============================================================
-- Enums
-- ============================================================

create type household_role as enum ('owner', 'member');

create type recurrence_type as enum (
  'one_time',
  'daily',
  'weekly',
  'monthly',
  'yearly',
  'custom'
);

create type maintenance_status as enum (
  'pending',
  'completed',
  'skipped',
  'overdue'
);


-- ============================================================
-- Households
-- ============================================================

create table households (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz not null default now()
);

create table household_members (
  household_id uuid not null references households (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  role         household_role not null default 'member',
  display_name text not null,
  joined_at    timestamptz not null default now(),
  primary key (household_id, user_id)
);


-- ============================================================
-- Rooms
-- ============================================================

create table rooms (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  name         text not null,
  floor        int,
  icon         text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);


-- ============================================================
-- Categories (hierarchical via self-referencing FK)
-- ============================================================

create table categories (
  id                 uuid primary key default gen_random_uuid(),
  household_id       uuid not null references households (id) on delete cascade,
  parent_category_id uuid references categories (id) on delete set null,
  name               text not null,
  icon               text,
  color              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);


-- ============================================================
-- Tags
-- ============================================================

create table tags (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  name         text not null,
  color        text,
  created_at   timestamptz not null default now(),
  unique (household_id, name)
);


-- ============================================================
-- Items
-- ============================================================

create table items (
  id                  uuid primary key default gen_random_uuid(),
  household_id        uuid not null references households (id) on delete cascade,
  room_id             uuid references rooms (id) on delete set null,
  category_id         uuid references categories (id) on delete set null,
  name                text not null,
  description         text,
  brand               text,
  model               text,
  serial_number       text,
  purchase_date       date,
  purchase_price      numeric(10, 2),
  warranty_expires_at date,
  notes               text,
  created_by          uuid not null references auth.users (id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table item_tags (
  item_id uuid not null references items (id) on delete cascade,
  tag_id  uuid not null references tags (id) on delete cascade,
  primary key (item_id, tag_id)
);

create table item_attachments (
  id               uuid primary key default gen_random_uuid(),
  item_id          uuid not null references items (id) on delete cascade,
  storage_path     text not null,
  file_name        text not null,
  mime_type        text not null,
  size_bytes       bigint not null,
  is_primary_image boolean not null default false,
  uploaded_by      uuid not null references auth.users (id),
  created_at       timestamptz not null default now()
);

-- Only one primary image per item at a time
create unique index item_attachments_primary_image_idx
  on item_attachments (item_id)
  where is_primary_image = true;


-- ============================================================
-- Maintenance Schedules
-- ============================================================

create table maintenance_schedules (
  id                          uuid primary key default gen_random_uuid(),
  item_id                     uuid not null references items (id) on delete cascade,
  name                        text not null,
  description                 text,
  recurrence_type             recurrence_type not null,
  -- For 'custom' and interval-based types: "every N days/weeks/months/years"
  recurrence_interval         int,
  start_date                  date not null,
  end_date                    date,
  estimated_duration_minutes  int,
  estimated_cost              numeric(10, 2),
  assigned_to                 uuid references auth.users (id) on delete set null,
  is_active                   boolean not null default true,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);


-- ============================================================
-- Maintenance Events (pre-generated instances)
-- ============================================================

create table maintenance_events (
  id               uuid primary key default gen_random_uuid(),
  schedule_id      uuid not null references maintenance_schedules (id) on delete cascade,
  -- Denormalized for fast calendar queries without joining through schedules
  item_id          uuid not null references items (id) on delete cascade,
  scheduled_date   date not null,
  status           maintenance_status not null default 'pending',
  completed_at     timestamptz,
  completed_by     uuid references auth.users (id) on delete set null,
  actual_cost      numeric(10, 2),
  notes            text,
  -- Stores the external calendar event ID (Apple EventKit / Google Calendar)
  calendar_event_id text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);


-- ============================================================
-- Indexes
-- ============================================================

create index rooms_household_idx            on rooms (household_id);
create index categories_household_idx       on categories (household_id);
create index categories_parent_idx          on categories (parent_category_id);
create index tags_household_idx             on tags (household_id);
create index items_household_idx            on items (household_id);
create index items_room_idx                 on items (room_id);
create index items_category_idx             on items (category_id);
create index item_attachments_item_idx      on item_attachments (item_id);
create index item_tags_tag_idx              on item_tags (tag_id);
create index maint_schedules_item_idx       on maintenance_schedules (item_id);
create index maint_events_schedule_idx      on maintenance_events (schedule_id);
create index maint_events_item_idx          on maintenance_events (item_id);
create index maint_events_scheduled_date_idx on maintenance_events (scheduled_date);
create index maint_events_status_idx        on maintenance_events (status);


-- ============================================================
-- updated_at triggers
-- ============================================================

create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger rooms_updated_at
  before update on rooms
  for each row execute function set_updated_at();

create trigger categories_updated_at
  before update on categories
  for each row execute function set_updated_at();

create trigger items_updated_at
  before update on items
  for each row execute function set_updated_at();

create trigger maintenance_schedules_updated_at
  before update on maintenance_schedules
  for each row execute function set_updated_at();

create trigger maintenance_events_updated_at
  before update on maintenance_events
  for each row execute function set_updated_at();


-- ============================================================
-- Row Level Security
-- ============================================================

alter table households           enable row level security;
alter table household_members    enable row level security;
alter table rooms                enable row level security;
alter table categories           enable row level security;
alter table tags                 enable row level security;
alter table items                enable row level security;
alter table item_tags            enable row level security;
alter table item_attachments     enable row level security;
alter table maintenance_schedules enable row level security;
alter table maintenance_events   enable row level security;

-- Helper: returns true if the current user belongs to the given household
create or replace function is_household_member(hid uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from household_members
    where household_id = hid
      and user_id = auth.uid()
  );
$$;

-- households: members can read; only owners can update
create policy "members can view their household"
  on households for select
  using (is_household_member(id));

create policy "owners can update household"
  on households for update
  using (
    exists (
      select 1 from household_members
      where household_id = id
        and user_id = auth.uid()
        and role = 'owner'
    )
  );

-- household_members: members can see their own household roster
create policy "members can view household roster"
  on household_members for select
  using (is_household_member(household_id));

-- rooms
create policy "household members can manage rooms"
  on rooms for all
  using (is_household_member(household_id));

-- categories
create policy "household members can manage categories"
  on categories for all
  using (is_household_member(household_id));

-- tags
create policy "household members can manage tags"
  on tags for all
  using (is_household_member(household_id));

-- items
create policy "household members can manage items"
  on items for all
  using (is_household_member(household_id));

-- item_tags (no household_id — gate via items join)
create policy "household members can manage item tags"
  on item_tags for all
  using (
    exists (
      select 1 from items i
      where i.id = item_id
        and is_household_member(i.household_id)
    )
  );

-- item_attachments (gate via items join)
create policy "household members can manage attachments"
  on item_attachments for all
  using (
    exists (
      select 1 from items i
      where i.id = item_id
        and is_household_member(i.household_id)
    )
  );

-- maintenance_schedules (gate via items join)
create policy "household members can manage maintenance schedules"
  on maintenance_schedules for all
  using (
    exists (
      select 1 from items i
      where i.id = item_id
        and is_household_member(i.household_id)
    )
  );

-- maintenance_events (item_id is denormalized — gate directly)
create policy "household members can manage maintenance events"
  on maintenance_events for all
  using (
    exists (
      select 1 from items i
      where i.id = item_id
        and is_household_member(i.household_id)
    )
  );
