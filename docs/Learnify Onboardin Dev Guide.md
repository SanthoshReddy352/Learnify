# **🚀 Learnify — Developer Onboarding Guide**

Welcome to the **Learnify Engineering Team**\!  
 This onboarding guide will help you understand **how the system works, how to set up your environment, and how to start contributing immediately**.

This document is tightly aligned with the **Overall Developer Guide** and is designed to be the first thing a new developer reads.

---

# **🎯 1\. Mission & High‑Level Overview**

Learnify is an **AI‑powered adaptive learning platform** that builds personalized study paths using:

* Knowledge graphs (topics \+ dependencies)

* Unlocking engine based on user mastery

* SM‑2 spaced repetition review

* AI‑generated learning graphs

* Realtime updates

* Dashboards \+ analytics

* Public sharing of roadmaps

Your job as a developer is to maintain and extend this system **reliably, efficiently, and without breaking feature interconnections**.

---

# **🧱 2\. Project Setup**

## **✔️ Requirements**

* Node.js 18+

* PNPM or NPM

* Supabase account

* OpenRouter API key

* GitHub SSH access

## **✔️ Clone the project**

git clone \<repo-url\>  
cd learnify

## **✔️ Install dependencies**

pnpm install  
\# or  
npm install

## **✔️ Set up environment variables**

Create a `.env.local` file with:

NEXT\_PUBLIC\_SUPABASE\_URL=...  
NEXT\_PUBLIC\_SUPABASE\_ANON\_KEY=...  
SUPABASE\_SERVICE\_ROLE\_KEY=...  
OPENROUTER\_API\_KEY=...

Use `config/env.ts` to understand required variables.

---

# **🗄️ 3\. Database Setup (Supabase)**

### **✔️ Step 1 — Create a new Supabase project**

Add region closest to your users.

### **✔️ Step 2 — Run the complete schema**

Copy the SQL from the Learnify DB Schema document.

### **✔️ Step 3 — Enable RLS (already included in schema)**

Ensure policies are active.

### **✔️ Step 4 — Configure Realtime**

Enable realtime for:

* `topics`

* `topic_dependencies`

(These power live graph updates & dashboard auto-refresh.)

---

# **🏛️ 4\. File Structure Orientation**

Learnify uses a **feature-based modular architecture**.  
 You MUST memorize these three folders:

### **📂 `app/` — Routes & Pages**

Holds all UI pages:

* `/dashboard` → dashboards

* `/subjects` → subject management

* `/learn` → learning pages

* `/review` → SM‑2 pages

* `/u/` → public sharing

* `/api/` → serverless endpoints

### **📂 `lib/` — Business Logic**

Core engines live here:

* `graph` → unlocking \+ recommendations \+ DAG utilities

* `sm2` → spaced repetition engine

* `ai` → AI prompts for graph generation

* `analytics` → charts \+ metrics backend

* `supabase` → clients \+ realtime

### **📂 `components/` — Reusable UI**

Includes:

* Graph visualizer components

* Charts

* Shadcn UI components

* Forms

Understanding this layout is critical before making any changes.

---

# **⚙️ 5\. Core Systems You Must Understand**

Learnify has **3 brain systems**. Every developer must master them.

## **🧠 1\. Knowledge Graph Engine**

* Topics are nodes

* Dependencies are edges

* Unlocking engine auto-unlocks topics when prerequisites are met

* Lives in: `lib/graph/*`

## **🧠 2\. SM‑2 Learning Engine**

* Every review updates difficulty factor \+ next review date

* Lives in: `lib/sm2/sm2.ts`

## **🧠 3\. AI Graph Generator**

* Converts subject name → topics \+ dependencies

* Lives in: `app/api/generate-graph`

These systems tie all features together.

---

# **🧩 6\. Understanding the 8 Features (Developer Context)**

You do NOT need to memorize everything immediately, but you must understand how features depend on one another.

| Feature | What It Does | Core Code Areas |
| ----- | ----- | ----- |
| 1\. Subject & Topic Management | CRUD operations | `/subjects`, `server-actions/subjects.ts` |
| 2\. Knowledge Graph Engine | Unlocks topics | `lib/graph/unlock-engine.ts` |
| 3\. SM‑2 Review System | Handles learning & review | `/learn`, `/review`, `lib/sm2/` |
| 4\. AI Graph Generation | Creates DAGs | `/api/generate-graph` |
| 5\. Graph Visualizer | Displays graph | `components/graph` |
| 6\. Dashboards | Shows recs \+ analytics | `/dashboard`, `lib/graph/recommendations.ts` |
| 7\. Analytics | Study stats | `lib/analytics/*` |
| 8\. Community Sharing | Public roadmaps | `/u/[username]/subjects` |

A new engineer should focus on **Features 1 → 4** first.

---

# **🔥 7\. Local Development Workflow**

A typical development cycle looks like:

### **1\. Pull latest changes**

git pull origin main

### **2\. Start local Supabase (optional)**

If using Supabase CLI:

supabase start

### **3\. Run development server**

pnpm dev

### **4\. Make your changes**

Follow the file structure. Avoid mixing logic with UI.

### **5\. Testing**

Use test files inside `/tests/`.

### **6\. Submit PR**

Follow branch naming:

feature/\<name\>  
fix/\<name\>  
refactor/\<name\>

---

# **☑️ 8\. New Developer First Tasks (Onboarding Exercises)**

To understand Learnify deeply, complete these tasks:

### **Task 1 — Add a new subject**

Implement a UI change in `/subjects/new`.

### **Task 2 — Add a new topic**

Add a topic to a subject manually.

### **Task 3 — Inspect Unlock Engine**

Open `unlock-engine.ts` and understand how locking → unlocking works.

### **Task 4 — Trigger AI Graph Generation**

Generate a DAG for “Operating Systems”.

### **Task 5 — Perform a review**

Learn a topic → rate it → inspect updated SM-2 metadata.

These tasks ensure you understand the entire platform end-to-end.

---

# **🧪 9\. Testing Strategy**

Learnify uses **unit tests \+ integration tests** located in `/tests/`.

Core tests include:

* Unlock engine

* Recommendation algorithm

* SM‑2 calculation

* AI graph generation parser

* Analytics calculations

Always write tests for:

* Anything touching core logic

* Any feature with branching logic

---

# **📤 10\. Deployment Practices**

### **Platform: Vercel**

Next.js \+ Server Actions deploy seamlessly.

### **CI/CD Rules:**

* PR must pass tests

* No failing lints

* No console errors in UI

* Migrations must be run BEFORE merge

### **Supabase:**

* Use service role keys only in server actions

* NEVER expose them in browser

---

# **👥 11\. Collaboration Guidelines**

### **Branch rules:**

* `main` \= production

* `dev` \= staging

### **PR rules:**

* Keep them small

* Provide screenshots

* Provide testing steps

### **Code style:**

* Keep logic in `lib/`

* Keep UI in `components/`

* Keep routes clean

---

# **📚 12\. Knowledge Base for Developers**

### **Essential documents:**

* Overall Developer Guide (in canvas)

* Database Schema Guide

* File Structure Guide

* Feature-by-Feature Breakdown

### **Must-read files in project:**

* `lib/graph/unlock-engine.ts`

* `lib/graph/recommendations.ts`

* `lib/sm2/sm2.ts`

* `app/api/generate-graph/`

---

# **⭐ 13\. Troubleshooting Guide**

### **⚠️ Topics not unlocking?**

* Check dependency mapping

* Check statuses of parent topics

* Check `unlock-engine.ts`

### **⚠️ AI Graph returns invalid JSON?**

* Adjust prompt

* Add try/catch on route

### **⚠️ SM‑2 scheduling looks wrong?**

* Print debug logs for EF \+ interval

### **⚠️ Graph not updating?**

* Ensure realtime is enabled on `topics` \+ `topic_dependencies`

---

# **🎉 14\. Final Notes for New Developers**

You are now ready to contribute to Learnify.

Keep these principles in mind:

* The **Unlock Engine**, **SM-2**, and **AI DAG Generation** are sacred. Do not break them.

* All features are interconnected.

* Realtime updates make the app **feel alive**.

* The file structure is designed for **scalability**.

* Test every core change.

Welcome to the team\! Let’s build the future of adaptive learning 🚀

