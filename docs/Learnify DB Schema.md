# **Learnify — Complete Supabase Database Schema \+ RLS \+ Realtime Subscription Plan (Full Developer Documentation)**

This is the **final combined, complete, production‑ready Supabase documentation** for the Learnify platform.  
 It merges:

* **Learnify — Complete Supabase Database Schema \+ RLS Documentation**

* **Learnify — Supabase Realtime Subscription Table Plan**

This represents the **authoritative backend specification** for all 8 features of the Learnify system.

---

# **📌 CONTENTS**

1. Database ERD Overview

2. Full SQL Schema

3. RLS Policies (All Tables)

4. Feature‑by‑Feature Table Responsibilities

5. Realtime Subscription Plan (Merged into Schema Docs)

6. Developer Implementation Notes

---

# **✅ 1\. DATABASE ERD (Conceptual Overview)**

Auth.users  
   ↓ 1–1  
profiles ───┐  
            │ 1–N  
        subjects ───────────────────────────────┐  
            │ 1–N                               │  
          topics ────────────┐                  │  
            │ 1–N             │ 1–N              │  
     topic\_dependencies       │         shared\_subject\_clones  
            │                 │  
            │                 │  
         study\_logs           │  
            │                 │  
    saved\_graph\_layouts       │

This structure supports:

* AI graph generation (topics \+ dependencies)

* Unlock engine

* SM‑2 review system

* Graph visualizer

* Analytics

* Community sharing

---

# **✅ 2\. FULL SQL SCHEMA**

## **TABLE: profiles**

create table public.profiles (  
  id uuid references auth.users not null primary key,  
  username text unique,  
  full\_name text,  
  gate\_stream text,  
  created\_at timestamp with time zone default now()  
);

### **🔐 RLS**

alter table profiles enable row level security;

create policy "select\_own\_profile" on profiles  
for select using (auth.uid() \= id);

create policy "update\_own\_profile" on profiles  
for update using (auth.uid() \= id);

---

## **TABLE: subjects**

create table public.subjects (  
  id uuid default gen\_random\_uuid() primary key,  
  user\_id uuid references public.profiles(id) not null,  
  title text not null,  
  description text,  
  is\_public boolean default false,  
  created\_at timestamp with time zone default now()  
);

### **🔐 RLS**

alter table subjects enable row level security;

\-- Owner full access  
create policy "owners\_full\_access" on subjects  
for all using (auth.uid() \= user\_id);

\-- Public readers for shared subjects  
create policy "public\_can\_view\_public\_subjects" on subjects  
for select using (is\_public \= true);

### **🔁 REALTIME**

**Recommended:** Yes (optional)  
 Subscribe to:

* `INSERT` → new subject created

* `UPDATE` → is\_public toggles

* `DELETE`

Used by:

* Global Dashboard updates

* Community-sharing UI refresh

---

## **TABLE: topics**

create table public.topics (  
  id uuid default gen\_random\_uuid() primary key,  
  subject\_id uuid references public.subjects(id) on delete cascade not null,  
  title text not null,  
  description text,  
  estimated\_minutes int default 30,

  status text default 'locked'  
    check (status in  
      ('locked','available','learning','reviewing','mastered')  
    ),

  next\_review\_at timestamp with time zone,  
  difficulty\_factor real default 2.5,  
  interval\_days real default 0,  
  repetition\_count int default 0,  
  created\_at timestamp with time zone default now()  
);

### **🔐 RLS**

alter table topics enable row level security;

create policy "owners\_full\_access\_topics" on topics  
for all using (  
  auth.uid() \= (  
    select user\_id from subjects where id \= topics.subject\_id  
  )  
);

create policy "public\_view\_topics\_of\_public\_subjects" on topics  
for select using (  
  exists (  
    select 1 from subjects  
    where subjects.id \= topics.subject\_id  
    and subjects.is\_public \= true  
  )  
);

### **🔁 REALTIME (CRITICAL)**

Subscribe to:  
 ✔ `INSERT` (manual or AI topic creation)  
 ✔ `UPDATE` (status change, SM‑2 updates)  
 ✔ `DELETE`

Used by:

* Unlock engine

* Recommendation widget

* Graph visualizer (node colors)

* Due review updates

This is one of the **two mandatory realtime tables**.

---

## **TABLE: topic\_dependencies**

create table public.topic\_dependencies (  
  parent\_id uuid references public.topics(id) on delete cascade,  
  child\_id uuid references public.topics(id) on delete cascade,  
  primary key (parent\_id, child\_id)  
);

### **🔐 RLS**

alter table topic\_dependencies enable row level security;

create policy "owners\_full\_access\_dependencies" on topic\_dependencies  
for all using (  
  auth.uid() \= (  
    select user\_id from subjects  
    where subjects.id \= (select subject\_id from topics where id \= topic\_dependencies.child\_id)  
  )  
);

create policy "public\_view\_public\_dependencies" on topic\_dependencies  
for select using (  
  exists (  
    select 1 from subjects  
    join topics on subjects.id \= topics.subject\_id  
    where topics.id \= topic\_dependencies.child\_id  
    and subjects.is\_public \= true  
  )  
);

### **🔁 REALTIME (CRITICAL)**

Subscribe to:  
 ✔ `INSERT` → new dependency edge added  
 ✔ `DELETE` → edge removed

Used by:

* Graph Visualizer (edge redraw)

* Unlock logic recalculation

* AI-generated graph updates

This is the **second mandatory realtime table**.

---

## **TABLE: study\_logs**

create table public.study\_logs (  
  id uuid default gen\_random\_uuid() primary key,  
  user\_id uuid references public.profiles(id) not null,  
  topic\_id uuid references public.topics(id) not null,  
  duration\_seconds int,  
  performance\_rating int  
    check (performance\_rating between 0 and 5),  
  reviewed\_at timestamp with time zone default now()  
);

### **🔐 RLS**

alter table study\_logs enable row level security;

create policy "owner\_full\_access\_study\_logs" on study\_logs  
for all using (auth.uid() \= user\_id);

create policy "deny\_public\_access" on study\_logs  
for select using (false);

### **🔁 REALTIME (Optional, Recommended)**

Subscribe to:  
 ✔ `INSERT`

Used for:

* Live analytics (weekly study time updates)

* Dashboard progress refresh

Not required for MVP.

---

## **TABLE: saved\_graph\_layouts (optional)**

create table public.saved\_graph\_layouts (  
  id uuid default gen\_random\_uuid() primary key,  
  subject\_id uuid references public.subjects(id) on delete cascade,  
  node\_id uuid references public.topics(id),  
  x real,  
  y real,  
  user\_id uuid references public.profiles(id) not null,  
  unique(subject\_id, node\_id)  
);

### **🔐 RLS**

alter table saved\_graph\_layouts enable row level security;

create policy "owner\_layout\_access" on saved\_graph\_layouts  
for all using (auth.uid() \= user\_id);

### **🔁 REALTIME → ❌ Not needed**

Layouts update only from user's own UI.

---

## **TABLE: shared\_subject\_clones (optional)**

create table public.shared\_subject\_clones (  
  id uuid default gen\_random\_uuid() primary key,  
  original\_subject\_id uuid references public.subjects(id),  
  cloned\_subject\_id uuid references public.subjects(id),  
  user\_id uuid references public.profiles(id),  
  created\_at timestamp default now()  
);

### **🔐 RLS**

alter table shared\_subject\_clones enable row level security;

create policy "owner\_clone\_access" on shared\_subject\_clones  
for all using (auth.uid() \= user\_id);

### **🔁 REALTIME → ❌ Not needed**

Cloning is an immediate user action; no live updates required.

---

# **✅ 3\. REALTIME SUBSCRIPTION SUMMARY (Combined Final Version)**

| Table | Realtime? | Why | Importance |
| ----- | ----- | ----- | ----- |
| **topics** | ✅ YES | Unlocking, SM‑2 review updates, graph status | ⭐ Critical |
| **topic\_dependencies** | ✅ YES | Graph edges update instantly | ⭐ Critical |
| **study\_logs** | ⚠️ Optional | Live analytics | Medium |
| **subjects** | ⚠️ Optional | Public toggle, deletion | Low |
| profiles | ❌ No | Rare updates | None |
| saved\_graph\_layouts | ❌ No | Local-only layouts | None |
| shared\_subject\_clones | ❌ No | Purely manual action | None |

### **Minimum required for Learnify to feel “alive”:**

✅ topics  
 ✅ topic\_dependencies

These two subscriptions power:

* Graph visualizer live updates

* Dashboard auto-refresh

* Unlock engine reflections

* Next-topic recommendations

---

# **🎯 4\. FEATURE-TO-TABLE CONNECTIONS**

| Feature | Tables Used |
| ----- | ----- |
| Subject & Topic Management | subjects, topics |
| Knowledge Graph Engine | topics, topic\_dependencies |
| SM‑2 Review System | topics, study\_logs |
| AI Graph Generation | topics, topic\_dependencies |
| Graph Visualizer | topics, topic\_dependencies, saved\_graph\_layouts |
| Dashboard & Recommendations | topics, study\_logs |
| Analytics System | study\_logs, topics |
| Community Sharing | subjects, topics, topic\_dependencies |

---

# **🎉 FINAL NOTES FOR DEVELOPERS**

* This schema *fully supports* Learnify’s adaptive learning model.

* RLS ensures perfect isolation between users.

* Realtime subscriptions make the platform reactive and intelligent.

* All features from 1–8 depend on this unified schema.

This is the **final authoritative Supabase backend documentation** for Learnify.

