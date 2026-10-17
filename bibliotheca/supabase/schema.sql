-- Executar no SQL Editor do projeto Supabase.
-- Cada registo pertence ao utilizador autenticado; RLS impede acesso cruzado.
create extension if not exists pgcrypto;

create table if not exists public.library_books (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.library_loans (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

alter table public.library_books enable row level security;
alter table public.library_loans enable row level security;

drop policy if exists "Users manage own books" on public.library_books;
create policy "Users manage own books" on public.library_books
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users manage own loans" on public.library_loans;
create policy "Users manage own loans" on public.library_loans
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists library_books_user_id_idx on public.library_books(user_id);
create index if not exists library_loans_user_id_idx on public.library_loans(user_id);
