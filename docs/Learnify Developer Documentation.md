# **📚 Learnify — Complete Overall Developer Guide (Full System Documentation)**

This is the **official, consolidated, end‑to‑end Developer Guide** for Learnify, combining all provided documents:

* **Feature 1 — Subject & Topic Management**

* **Feature 2 — Knowledge Graph & Unlocking Engine**

* **Feature 3 — Learning & Review System (SM‑2 Algorithm)**

* **Feature 4 — AI Graph Generation (Dependency DAG)**

* **Feature 5 — Knowledge Graph Visualizer**

* **Feature 6 — Dashboard & Recommendation Widget**

* **Feature 7 — Analytics System**

* **Feature 8 — Community Sharing**

* **Learnify Supabase Database Schema \+ RLS \+ Realtime Plan**

* **Learnify File Structure**

This single document explains **how the entire system works**, how each feature connects, and what to implement.

---

# **1\. Platform Overview**

Learnify is an **AI‑powered smart study orchestrator** that builds a personalized learning roadmap using:

* Knowledge Graphs

* Topic unlocking rules

* Spaced repetition (SM‑2)

* AI‑generated learning structures

* Real-time progress updates

* Community sharing capabilities

The platform ensures that every student always knows **what to study next**, with adaptive recommendations.

---

# **2\. Core Architecture Summary**

* **Frontend:** Next.js 15 (App Router), Server Components, Server Actions

* **Database:** Supabase Postgres, RLS Policies

* **Auth:** Supabase Auth (OAuth)

* **Realtime:** Supabase Realtime for topics & dependencies

* **AI:** OpenRouter models for generating DAGs

* **Visualization:** React Flow

* **Analytics:** Custom engine \+ charts

This foundation supports all 8 features.

---

# **3\. Database Schema \+ RLS (Backend Foundation)**

The backend is built on top of key tables:

### **Profiles**

Stores user profile data.

### **Subjects**

Represents major study areas created by users.

### **Topics**

Each topic belongs to a subject and contains SM‑2 metadata.

### **Topic Dependencies**

Edges forming the knowledge graph.

### **Study Logs**

Records learning & review sessions.

### **Saved Graph Layouts**

(Optional) stores user graph positions.

### **Shared Subject Clones**

(Optional) for community sharing imports.

**Realtime Requirements:**

* `topics` → REQUIRED

* `topic_dependencies` → REQUIRED

* `study_logs` → optional

All RLS policies ensure only owners can modify data.

---

# **4\. Complete Feature Explanations**

Below is a complete breakdown of how every Learnify feature works from a developer perspective.

---

# **Feature 1 — Subject & Topic Management**

### **Purpose:**

Foundation of the entire system.

### **What Users Do:**

* Create subjects

* Add topics manually or via AI

* Edit/delete topics

* Manage metadata

### **What Developers Implement:**

* CRUD UI \+ Server Actions

* Pages under `/subjects`

* Default topic status \= `locked`

Topics become the nodes used by all other features.

---

# **Feature 2 — Knowledge Graph & Unlocking Engine**

### **Purpose:**

Controls topic progression.

### **Knowledge Graph:**

* Stored in `topic_dependencies`

* Forms a DAG of prerequisites

### **Unlocking Engine Workflow:**

1. Fetch locked topics

2. Check if all parents are mastered/reviewing

3. Unlock topics by setting `status = available`

### **Developer Tasks:**

* Implement `updateUnlockedTopics()`

* Call unlocking logic:

  * after reviewing a topic

  * after generating an AI graph

  * on subject dashboard load

This engine ensures "What to Study Next" works correctly.

---

# **Feature 3 — Learning & Review System (SM‑2)**

### **Purpose:**

Ensures long‑term retention via spaced repetition.

### **Learning Session:**

* Topic becomes `learning`

### **Review Session:**

Uses SM‑2 algorithm:

* User rates recall 0–5

* Algorithm computes next review interval, repetition, EF

### **Developer Tasks:**

* Implement `/learn/[topicId]` page

* Implement `/review/[topicId]` page

* Update DB fields:

  * `interval_days`

  * `repetition_count`

  * `difficulty_factor`

  * `next_review_at`

  * `status`

* Insert logs into `study_logs`

Review outcomes feed back into unlocking.

---

# **Feature 4 — AI Graph Generation (Dependency DAG)**

### **Purpose:**

Automatically generate a full structured roadmap using AI.

### **Process:**

1. User clicks "Generate Study Flow"

2. System calls model with curated prompt

3. Model returns JSON:

   * topics

   * dependencies

4. Insert topics into DB

5. Insert dependencies

6. Trigger unlocking engine

### **Developer Tasks:**

* `/api/generate-graph` route

* JSON parser \+ insert logic

* Slug → UUID mapping

* Call unlocking immediately

This feature provides instant learning structures.

---

# **Feature 5 — Knowledge Graph Visualizer**

### **Purpose:**

Interactive DAG showing the entire subject structure.

### **How it Works:**

1. Fetch topics \+ dependencies

2. Convert to React Flow nodes/edges

3. Color-code nodes by status

4. Allow click navigation

### **Developer Tasks:**

* Build `GraphCanvas` using React Flow

* Create `NodeRenderer` \+ `EdgeRenderer`

* (Optional) Save positions to DB

Visualization makes learning intuitive.

---

# **Feature 6 — Dashboard & Recommendation Widget**

### **Global Dashboard:**

Shows all subjects with basic progress.

### **Subject Dashboard:**

Shows learning intelligence:

* Unlock engine run

* Recommendations (due reviews → available topics)

* Mini graph preview

* Analytics cards

### **Developer Tasks:**

* `/dashboard` page

* `/dashboard/[subjectId]` page

* Recommendation algorithm implementation

Dashboard is where all engine outputs appear.

---

# **Feature 7 — Analytics System**

### **Purpose:**

Visual insights into learning performance.

### **Analytics Types:**

* Study time (weekly)

* Weak topics (low avg performance)

* Subject progress

* Upcoming reviews

* Dependency depth analysis

### **Developer Tasks:**

* Build backend analytics queries

* Build charts:

  * Study time

  * Donut chart for statuses

  * Heatmap for review schedule

Analytics elevate the user experience significantly.

---

# **Feature 8 — Community Sharing**

### **Purpose:**

Allow users to publish roadmaps publicly.

### **How it Works:**

* Add `is_public` column

* Toggle visibility in subject dashboard

* Public route:  
   `/u/[username]/subjects/[subjectId]`

* Viewer sees:

  * readonly graph

  * readonly topics

  * readonly analytics summary

### **Developer Tasks:**

* Add public RLS rule

* Build public viewer UI

* Allow roadmaps to be cloned

This feature enables viral sharing and community growth.

---

# **5\. System-Level Interaction Flow (End-to-End)**

### **1\. User creates subject**

→ Feature 1

### **2\. User generates AI graph**

→ Feature 4 → Feature 2 auto‑unlock

### **3\. Dashboard recommends next topic**

→ Feature 6 \+ Feature 2

### **4\. User learns & reviews topics**

→ Feature 3 (SM‑2)  
 → Study logs written

### **5\. Analytics update**

→ Feature 7 refreshes dashboards

### **6\. Graph visualizer updates**

→ Feature 5 (Realtime)

### **7\. User shares roadmap**

→ Feature 8

Everything is interconnected.

---

# **6\. Learnify File Structure (Implementation Blueprint)**

Full Next.js 15 structure with feature‑aligned directories:

* `/dashboard` — dashboards

* `/subjects` — subject/topic management

* `/learn`, `/review` — study flows

* `/api/generate-graph` — AI integration

* `/u/[username]/subjects` — community sharing

* `lib/graph` — unlock engine, recommendation system

* `lib/sm2` — spaced repetition

* `lib/analytics` — reporting

* `components/graph` — visualizer

This file structure ensures clean separation of concerns.

---

# **7\. Developer Checklist (Master List)**

### **Core CRUD:**

* Create subjects

* Create/edit/delete topics

### **AI:**

* Accept subject name

* Call AI

* Insert topics \+ dependencies

### **Unlock Engine:**

* Implement dependency check logic

* Update topic statuses

### **Recommendations:**

* Due reviews first

* Available topics next

* Sorted by estimated time

### **SM‑2 Review:**

* Learning page

* Review page

* Rating handler

* SM‑2 implementation

* Log to study\_logs

### **Visualizer:**

* React Flow graph page

* Node color states

### **Analytics:**

* Study time

* Weak topics

* Subject progress

* Upcoming reviews

### **Community Sharing:**

* Public toggle

* Public viewer

* Clone subject API

---

# **8\. Final Notes for Developers**

* The entire system is interconnected; changes cascade.

* Unlock engine \+ SM‑2 \+ recommendations are the core intelligence.

* Realtime updates make the platform feel "alive".

* File structure is designed to keep features modular.

* AI generation dramatically speeds up onboarding.

This document should be used as the **source of truth** when building or extending Learnify.