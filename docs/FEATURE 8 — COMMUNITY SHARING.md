# **Feature 8 – COMMUNITY SHARING (Crystal‑Clear Developer Explanation)**

This document explains **how Feature 8 works**, **its primary purpose**, and **how to implement it step‑by‑step**, using context from:

* Feature 1 — Subject & Topic Management

* Feature 2 — Knowledge Graph & Unlocking Engine

* Feature 3 — Learning/Review Session (SM‑2 Algorithm)

* Feature 4 — AI Graph Generation (Dependency DAG)

* Feature 5 — Knowledge Graph Visualizer

* Feature 6 — Dashboard & Recommendation Widget

* Feature 7 — Analytics System

---

# **⭐ 1\. What Feature 8 Is**

Feature 8 enables **public sharing** of any subject a user creates. A shared subject becomes a **public, read‑only learning roadmap**, accessible through a unique link.

Example public URL:

/u/{username}/subjects/{subjectId}

This shared page displays:

* full topic list

* knowledge graph

* unlocked structure

* analytics summary

* AI‑generated roadmap (if applicable)

* progress indicators (read‑only)

It is **NOT editable** by anyone except the creator. The purpose is to:

* share study plans

* publish roadmaps

* collaborate with friends

* showcase learning paths online

* allow others to preview AI‑generated DAGs

---

# **🎯 2\. Primary Use Case of This Feature**

Students often want to:

* showcase their learning dependencies

* share AI‑generated roadmaps with peers

* help juniors learn a subject

* post their roadmaps on social media

* share resources with teammates

Feature 8 solves this by generating **public, static, safe-to-share URLs**.

This also supports Learnify's growth strategy (from the PDF):

* public roadmaps attract new users

* shared links act as marketing funnels

* helps with community-built roadmap library

---

# **🧠 3\. How Feature 8 Fits With Features 1–7**

Feature 8 is the **final presentation layer** built on top of all previous features.

| Feature | How It Connects to Community Sharing |
| ----- | ----- |
| Feature 1 – Subjects/Topics | All data shown on public page comes from here |
| Feature 2 – Knowledge Graph | Public viewer needs the DAG to show topic order |
| Feature 3 – SM‑2 Review | Mastery data is not shown (private), but status colors may remain |
| Feature 4 – AI Graph Gen | Public roadmap may be entirely AI-generated |
| Feature 5 – Graph Visualizer | The public page includes a **read‑only** version of this visualizer |
| Feature 6 – Dashboard | Subject dashboard elements appear in simplified public form |
| Feature 7 – Analytics | Only subject-level analytics that do not expose private logs are shown |

Feature 8 exposes the **learning roadmap**, NOT the personal study history.

---

# **⚙️ 4\. How Feature 8 Works Internally**

Feature 8 consists of **three components**:

### **A. Subject Visibility Control**

Add a new column:

is\_public boolean DEFAULT false

Users toggle a subject’s visibility using a switch.  
 Setting `is_public = true` enables a public route.

### **B. Public Subject Route**

Route format:

/u/\[username\]/subjects/\[subjectId\]

This page:

* fetches subject data **without auth restrictions**

* fetches topics

* fetches dependencies

* loads read-only knowledge graph

* loads simplified analytics

* hides SM‑2 private logs

### **C. Access Control**

RLS (Row-Level Security) must allow **read-only public access** to subjects with:

is\_public \= true

but still block:

* study logs

* user-specific performance

* private details

Public viewers see:

* topic titles

* descriptions

* dependency graph

* estimated times

* prerequisites

* high-level completion stats

They do NOT see:

* next review dates

* personal scores

* study durations

* performance ratings

---

# **🏗️ 5\. Implementation Steps (Developer Breakdown)**

## **Step 1 — Update Database**

Add column:

alter table subjects add column is\_public boolean default false;

Update RLS policies to allow **select** when `is_public = true`.

## **Step 2 — Add UI Toggle in Subject Dashboard**

A switch labeled **“Make Public” / “Make Private”**.

On toggle → server action updates `subjects.is_public`.

## **Step 3 — Implement Public Route**

Create a Next.js route:

/app/u/\[username\]/subjects/\[subjectId\]/page.tsx

Data required:

* subject info

* topics

* dependencies

Render:

* subject title & description

* topic list

* dependency DAG visualizer (read-only)

* subject analytics (no private data)

## **Step 4 — Read-Only Knowledge Graph Visualizer**

Feature 5’s DAG visualizer is reused but:

* no drag-and-drop

* no interaction that changes state

Node colors still show statuses:

* available

* locked

* mastered

(Optionally) hide colors and show all as neutral.

## **Step 5 — Public Copy Link Button**

In subject dashboard:

Copy Shareable Link

Copies:

https://learnify.com/u/john/subjects/324e-f23e-...

---

# **📌 6\. What a Public Viewer Can Do**

### **Allowed:**

* View roadmap

* View graph

* Explore dependencies

* Preview syllabus

* Save a copy into their own workspace (“Clone Subject”)

### **Not Allowed:**

* Modify topics

* Change statuses

* Write study logs

* Access locked internal analytics

* Trigger unlock engine

The public experience is always **static and safe**.

---

# **📐 7\. How This Interacts With Other Features**

### **Feature 1 – Subjects & Topics**

All subject/topic data comes directly from the database.

### **Feature 2 – Unlock Engine**

Public viewers only *see* the unlocked structure.  
 No unlocking is executed.

### **Feature 3 – SM‑2 Review**

Review scheduling is hidden.  
 Status colors may still appear.

### **Feature 4 – AI DAG Generation**

If the subject was AI-generated, the public viewer sees the AI’s full DAG.

### **Feature 5 – Graph Visualization**

Exact visual graph is displayed read-only.

### **Feature 6 – Dashboard**

Public page resembles a simplified subject dashboard.

### **Feature 7 – Analytics**

Only aggregate analytics shown:

* number of topics per status

* depth of graph

* overview progress

No personal data included.

---

# **🚀 8\. End-to-End Example**

User creates subject **“Machine Learning”** → generates graph via AI → learns some topics.

Enables **Public Sharing**.

Next, someone opens the link:

/u/rahul/subjects/882c-921e-...

They can now:

* view the ML roadmap

* see graph layout

* explore dependencies

* import the roadmap to their own Learnify workspace

But they **cannot** see Rahul’s reviews, mastery, or personal logs.

---

# **🎉 9\. Final Summary**

Feature 8 turns Learnify into a **community-powered learning ecosystem**.

It allows users to:

* share their curated or AI-generated roadmaps

* help others learn the same subject

* publish structured paths online

And helps Learnify:

* grow through viral sharing

* build an open library of roadmaps

This feature is simple to implement but massively boosts the platform’s usefulness and reach.

