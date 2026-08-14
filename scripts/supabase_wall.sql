-- ============================================================
-- DEAD PEOPLE ACTIVITY — "THE WALL"
-- Schema Supabase per bacheca post-it + commenti con MODERAZIONE
-- (niente pubblicazione automatica: tutto nasce approved = false)
-- Esegui questo script in: Supabase -> SQL Editor -> New query -> Run
-- ============================================================

-- 1) TABELLA POST-IT ------------------------------------------
create table if not exists public.wall_posts (
    id          uuid primary key default gen_random_uuid(),
    created_at  timestamptz not null default now(),
    author      text,                              -- nickname (facoltativo)
    body        text not null,                     -- testo del post-it
    genre       text not null default 'neutral',   -- rock | rap | techno | neutral
    approved    boolean not null default false     -- moderazione
);

-- Vincoli anti-spam di base
alter table public.wall_posts
    add constraint wall_posts_body_len   check (char_length(body)   between 1 and 500),
    add constraint wall_posts_author_len check (author is null or char_length(author) <= 40),
    add constraint wall_posts_genre_ok   check (genre in ('rock','rap','techno','neutral'));

-- 2) TABELLA COMMENTI -----------------------------------------
create table if not exists public.wall_comments (
    id          uuid primary key default gen_random_uuid(),
    post_id     uuid not null references public.wall_posts(id) on delete cascade,
    created_at  timestamptz not null default now(),
    author      text,
    body        text not null,
    approved    boolean not null default false
);

alter table public.wall_comments
    add constraint wall_comments_body_len   check (char_length(body)   between 1 and 300),
    add constraint wall_comments_author_len check (author is null or char_length(author) <= 40);

create index if not exists wall_comments_post_idx on public.wall_comments(post_id);

-- 3) ROW LEVEL SECURITY ---------------------------------------
alter table public.wall_posts    enable row level security;
alter table public.wall_comments enable row level security;

-- Chiunque (anon) puo LEGGERE solo cio che e stato APPROVATO
create policy "read approved posts"
    on public.wall_posts for select
    to anon using (approved = true);

create policy "read approved comments"
    on public.wall_comments for select
    to anon using (approved = true);

-- Chiunque (anon) puo INSERIRE, ma NON puo auto-approvarsi
-- (il check impedisce di inviare approved = true dal browser)
create policy "insert pending posts"
    on public.wall_posts for insert
    to anon with check (approved = false);

create policy "insert pending comments"
    on public.wall_comments for insert
    to anon with check (approved = false);

-- NESSUNA policy di UPDATE/DELETE per anon:
-- l'approvazione si fa dalla dashboard Supabase (ruolo service_role),
-- Table Editor -> wall_posts -> spunta "approved".

-- ============================================================
-- MODERAZIONE RAPIDA (da SQL Editor, quando vuoi approvare):
--   update public.wall_posts    set approved = true where id = '...';
--   update public.wall_comments set approved = true where id = '...';
-- Vedere la coda in attesa:
--   select id, created_at, author, genre, body from public.wall_posts    where approved = false order by created_at;
--   select id, created_at, author, body        from public.wall_comments where approved = false order by created_at;
-- ============================================================
