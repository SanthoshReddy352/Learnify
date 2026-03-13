# **📁 Learnify — Complete Next.js 15 Project File Structure (Final Production‑Ready Architecture)**

This structure is designed using **Next.js 15 App Router**, **Supabase**, **Server Actions**, **React Query**, **Tailwind \+ Shadcn**, and based on all 8 features and the full DB schema. This is the *authoritative project structure*.

---

# **📦 `app/` — Main Application (Next.js 15\)**

app/  
  ├── layout.tsx  
  ├── globals.css  
  ├── (auth)/  
  │     ├── login/page.tsx  
  │     ├── callback/page.tsx  
  │     └── signup/page.tsx  
  │  
  ├── dashboard/  
  │     ├── page.tsx                           \# Global Dashboard — Lists Subjects  
  │     ├── components/  
  │     │     ├── SubjectCard.tsx  
  │     │     ├── CreateSubjectModal.tsx  
  │     │     └── DeleteSubjectButton.tsx  
  │  
  │     ├── \[subjectId\]/  
  │           ├── page.tsx                     \# Subject Dashboard  
  │           ├── components/  
  │           │     ├── RecommendationWidget.tsx  
  │           │     ├── DueReviews.tsx  
  │           │     ├── SubjectProgressCard.tsx  
  │           │     ├── MiniGraphPreview.tsx  
  │           │     ├── WeeklyStats.tsx  
  │           │     ├── WeakTopicsCard.tsx  
  │           │     └── QuickActions.tsx       \# Add topic, Generate DAG, View Graph  
  │           └── actions.ts                   \# Unlock engine \+ subject-level actions  
  │  
  ├── subjects/  
  │     ├── page.tsx                           \# List \+ Create Subjects  
  │     ├── new/page.tsx  
  │     └── \[subjectId\]/  
  │           ├── page.tsx                     \# Subject Overview  
  │           ├── topics/  
  │           │     ├── new/page.tsx  
  │           │     └── \[topicId\]/edit/page.tsx  
  │           ├── ai-generate/page.tsx         \# Trigger AI DAG Generation  
  │           ├── graph/page.tsx               \# Full Graph Visualizer  
  │           └── actions.ts                   \# Subject \+ topic CRUD, AI generation  
  │  
  ├── learn/  
  │     └── \[topicId\]/page.tsx                 \# Learning screen  
  │  
  ├── review/  
  │     └── \[topicId\]/page.tsx                 \# Review \+ SM-2 rating UI  
  │  
  ├── u/  
  │     └── \[username\]/subjects/\[subjectId\]/page.tsx   \# Public subject viewer  
  │  
  ├── api/  
  │     ├── generate-graph/route.ts            \# AI DAG generation endpoint  
  │     └── clone-subject/route.ts             \# Community sharing → clone feature  
  │  
  └── not-found.tsx

---

# **⚙️ `lib/` — Core Logic (Feature Engines)**

lib/  
  ├── supabase/  
  │     ├── client.ts                          \# Supabase client for server  
  │     ├── browser-client.ts                  \# For client components  
  │     └── subscriptions.ts                   \# Realtime subscriptions  
  │  
  ├── graph/  
  │     ├── unlock-engine.ts                   \# Feature 2 Unlock Logic  
  │     ├── recommendations.ts                 \# Recommendation Algorithm  
  │     ├── dependency-utils.ts                \# Graph traversal helpers  
  │     └── layout-algorithm.ts                \# Dagre/force layout (optional)  
  │  
  ├── sm2/  
  │     └── sm2.ts                             \# SM-2 Algorithm (Feature 3\)  
  │  
  ├── ai/  
  │     └── prompts.ts                         \# System \+ user prompts for DAG creation  
  │  
  ├── analytics/  
  │     ├── study-time.ts  
  │     ├── weak-topics.ts  
  │     ├── subject-progress.ts  
  │     └── upcoming-reviews.ts  
  │  
  ├── utils/  
  │     ├── random.ts  
  │     ├── auth-helpers.ts  
  │     └── date.ts  
  │  
  └── types/  
        ├── db.ts  
        ├── graph.ts  
        ├── subject.ts  
        ├── topic.ts  
        └── user.ts

---

# **🗂️ `components/` — Reusable UI (Shadcn \+ Tailwind)**

components/  
  ├── ui/                                     \# Shadcn components  
  ├── graph/  
  │     ├── GraphCanvas.tsx                   \# ReactFlow wrapper  
  │     ├── NodeRenderer.tsx  
  │     └── EdgeRenderer.tsx  
  │  
  ├── charts/  
  │     ├── StudyTimeChart.tsx  
  │     ├── StatusDonut.tsx  
  │     └── HeatmapChart.tsx  
  │  
  ├── shared/  
  │     ├── Loader.tsx  
  │     ├── EmptyState.tsx  
  │     ├── PageHeader.tsx  
  │     └── ConfirmDialog.tsx  
  │  
  └── forms/  
        ├── SubjectForm.tsx  
        └── TopicForm.tsx

---

# **📤 `server-actions/` — Centralized Server Mutations (Optional Grouping)**

server-actions/  
  ├── subjects.ts  
  ├── topics.ts  
  ├── reviews.ts  
  ├── ai.ts  
  └── sharing.ts

---

# **🧪 `tests/` — Feature-Level Testing**

tests/  
  ├── unlocking.test.ts  
  ├── sm2.test.ts  
  ├── recommendation.test.ts  
  ├── api-generate-graph.test.ts  
  ├── analytics.test.ts  
  └── visualizer.test.ts

---

# **🎨 `public/` — Static Assets**

public/  
  ├── icons/  
  ├── illustrations/  
  └── logo.svg

---

# **🛠️ `config/` — Environment & App Config**

config/  
  ├── env.ts                                  \# env variable loader  
  ├── constants.ts                             \# app-wide constants  
  └── ai.config.ts                             \# model names, endpoints

---

# **🧱 Project Roots**

.eslint.cjs  
.gitignore  
package.json  
README.md  
postcss.config.js  
tailwind.config.js  
tsconfig.json

---

# **✅ THIS STRUCTURE FULLY COVERS ALL FEATURES 1–8**

### **✔ Feature 1 — Subject & Topic Management**

Handled by:

* `subjects/`, `topics/`

* CRUD server actions

* Forms \+ UI

### **✔ Feature 2 — Knowledge Graph & Unlocking Engine**

Code located in:

* `lib/graph/unlock-engine.ts`

* `lib/graph/dependency-utils.ts`

* Realtime: `supabase/subscriptions.ts`

### **✔ Feature 3 — SM‑2 Learning/Review**

Files:

* `app/review/[topicId]/`

* `lib/sm2/sm2.ts`

* `server-actions/reviews.ts`

### **✔ Feature 4 — AI DAG Generation**

Files:

* `app/api/generate-graph/route.ts`

* `app/subjects/[id]/ai-generate/`

* `lib/ai/prompts.ts`

### **✔ Feature 5 — Knowledge Graph Visualizer**

Files:

* `app/subjects/[id]/graph/page.tsx`

* `components/graph/*`

### **✔ Feature 6 — Dashboards**

Global Dashboard → `dashboard/page.tsx`  
 Subject Dashboard → `dashboard/[subjectId]/page.tsx`

### **✔ Feature 7 — Analytics Engine**

Located in:

* `lib/analytics/*`

* `components/charts/*`

* Used in subject dashboard

### **✔ Feature 8 — Community Sharing**

Files:

* `app/u/[username]/subjects/[subjectId]/`

* `api/clone-subject/route.ts`

* `server-actions/sharing.ts`

---

**Detailed Folder-by-Folder Explanation** 

---

# **🧱 ROOT LEVEL FILES**

These files configure the entire Learnify environment.

### **package.json**

Defines all dependencies (Next.js, Supabase client, React Flow, Shadcn/UI, Tailwind, etc.) and scripts.

### **tsconfig.json**

TypeScript configuration for module resolution and strict typing.

### **tailwind.config.js**

Tailwind styling configuration for global styles.

### **postcss.config.js**

Required for Tailwind CSS processing.

### **.gitignore**

Ensures environment variables, build files, and logs are not committed.

---

# **🧭 1\. `app/` — The Core Application (Next.js App Router)**

This folder powers **routing, UI pages, server actions, and core user flows**.

## **🔹 `/layout.tsx`**

Defines global layout: navigation, providers (React Query, Supabase Provider), theme.

## **🔹 `/globals.css`**

Tailwind’s global stylesheet.

---

## **📂 (auth)/ — Authentication System**

app/(auth)/

  ├── login/page.tsx

  ├── signup/page.tsx

  └── callback/page.tsx

Handles login, signup, OAuth callback for Supabase Auth.

---

## **📂 dashboard/ — User Dashboards**

### **Global Dashboard (`/dashboard`)**

Shows:

* All subjects

* Progress summary per subject

* Buttons to create/delete subjects

### **Subject Dashboard (`/dashboard/[subjectId]`)**

Displays:

* Recommendations (Feature 6\)

* Due reviews (Feature 3\)

* Mini knowledge graph (Feature 5\)

* Weekly stats & analytics (Feature 7\)

* Quick actions: Add topic, Generate DAG, Open visualizer

Each dashboard page contains sub‑components for modular UI.

---

## **📂 subjects/ — Subject & Topic Management**

Includes all CRUD flows for Feature 1\.

### **`/subjects` (List Subjects)**

Allows user to view, create, delete subjects.

### **`/subjects/[id]`**

Shows:

* Topic list

* Actions: Create Topic, AI Generate DAG

* Access to full Knowledge Graph visualizer

### **`/subjects/[id]/ai-generate`**

Triggers AI to generate full dependency DAG.

### **`/subjects/[id]/topics/`**

Topic creation, editing, and deletion.

### **`/subjects/[id]/graph/`**

Full interactive graph visualizer using React Flow.

---

## **📂 learn/\[topicId\]**

The **Learning Screen**.  
 Where the user studies a topic for the first time.  
 Sets topic status to `learning`.

---

## **📂 review/\[topicId\]**

The **Review Screen** for Feature 3 (SM‑2 algorithm).  
 Shows rating buttons → calculates next review.

---

## **📂 u/\[username\]/subjects/\[subjectId\]**

Public shared viewer (Feature 8):

* Read‑only subject roadmap

* Graph visualizer

* Analytics summary

* No private data

---

## **📂 api/ — Serverless API Routes**

### **`/api/generate-graph/`**

Calls OpenRouter → returns AI DAG structure.  
 Inserts topics \+ dependencies.

### **`/api/clone-subject/`**

Allows public users to **clone** a shared roadmap.

---

# **🧩 2\. `lib/` — Core Business Logic**

This folder contains the **engines** behind each Learnify feature.

---

## **📂 supabase/**

### **`client.ts`**

Supabase client for **server components**.

### **`browser-client.ts`**

Supabase client for **client-side features**.

### **`subscriptions.ts`**

Realtime listeners for:

* topics

* topic\_dependencies

* study\_logs (optional)

These power live graph updates & auto-refresh dashboards.

---

## **📂 graph/**

Contains the entire **Knowledge Graph Engine**.

### **`unlock-engine.ts` (Feature 2\)**

Evaluates prerequisites → unlocks new topics.

### **`recommendations.ts` (Feature 6\)**

Implements recommendation priority:

1. Due reviews

2. Available topics sorted by cost

### **`dependency-utils.ts`**

Graph traversal helpers:

* BFS/DFS

* Find roots

* Compute dependency depth

### **`layout-algorithm.ts`**

Optional DAG layout using Dagre for graph visualization.

---

## **📂 sm2/**

### **`sm2.ts`**

Implements the full SM‑2 spaced repetition algorithm.  
 Used during review sessions.

---

## **📂 ai/**

### **`prompts.ts`**

Contains system & user prompts for DAG generation.  
 AI returns JSON → used to build topics and dependencies.

---

## **📂 analytics/**

Implements Feature 7\.

### **`study-time.ts`**

Weekly study time queries.

### **`weak-topics.ts`**

Detects topics with poor performance ratings.

### **`subject-progress.ts`**

Calculates mastered %, locked %, reviewing %, etc.

### **`upcoming-reviews.ts`**

Predicts SM‑2 review schedule.

---

## **📂 utils/**

Shared utilities.

### **`auth-helpers.ts` — user session helpers**

### **`date.ts` — date formatting & SM‑2 helpers**

### **`random.ts` — slug/id/random helpers**

---

## **📂 types/**

Contains TypeScript type definitions for:

* Subjects

* Topics

* Graph edges

* AI-generated JSON

---

# **🎨 3\. `components/` — Reusable UI Components**

Common components used across pages.

## **📂 ui/**

Shadcn/UI base components (buttons, cards, modals, forms).

## **📂 graph/**

### **`GraphCanvas.tsx`**

React Flow wrapper for DAG rendering.

### **`NodeRenderer.tsx`**

Handles color coding by topic status.

### **`EdgeRenderer.tsx`**

Defines appearance of dependency edges.

---

## **📂 charts/**

Used in analytics dashboards.

* Study time line chart

* Status donut chart

* Heatmap visualizer

---

## **📂 shared/**

### **`Loader`, `EmptyState`, `ConfirmDialog`, `PageHeader`**

Reusable components.

---

## **📂 forms/**

### **`SubjectForm`**

### **`TopicForm`**

Reusable form components for CRUD operations.

---

# **📤 4\. `server-actions/`**

Optional organization layer.  
 Contains all Next.js server actions for:

* subjects

* topics

* reviews

* AI generator

* sharing/public cloning

Separating these improves maintainability.

---

# **🧪 5\. `tests/` — Unit and Integration Tests**

Covers Feature Engines:

* Unlock Engine

* Recommendation Engine

* SM‑2 Review Algorithm

* AI DAG Importer

* Analytics Calculations

---

# **🌐 6\. `public/`**

Static assets served directly.

* Logos

* Icons

* Illustrations

---

# **🛠️ 7\. `config/`**

Centralized configuration.

### **`env.ts`**

Loads environment variables.

### **`constants.ts`**

Shared constants (like statuses).

### **`ai.config.ts`**

Model names, settings, temperature defaults.

