# **Feature 6 – DASHBOARD & RECOMMENDATION WIDGET (Revised for New Subject-Based Dashboard Architecture)**

This updated explanation integrates the **new UX requirement**:

### **✅ Students first see all subjects.**

### **✅ Clicking a subject opens a subject-specific dashboard with recommendations.**

This modification completely restructures how Feature 6 behaves, while still relying on:

* Feature 1 — Subjects & Topics

* Feature 2 — Unlocking Engine

* Feature 3 — SM-2 Review System

* Feature 4 — AI Graph Generation

* Feature 5 — Knowledge Graph Visualizer

---

# **⭐ 1\. What Feature 6 Is (Updated)**

Feature 6 is now split into **two dashboard layers**:

## **A. Global Dashboard (Dashboard Level 1\)**

This is the page users see immediately after logging in.  
 It shows:

* A list of all subjects

* Buttons to create or delete subjects

* Basic progress indicators per subject

No recommendations or topic-level analytics appear here.

---

## **B. Subject Dashboard (Dashboard Level 2\)**

When a user clicks a subject, they enter its dedicated dashboard.  
 Here the system displays:

* Subject-specific recommendations

* Due reviews for this subject only

* Mini knowledge graph for this subject

* Weekly subject analytics

* Study progress for this subject

This page is the true “smart learning assistant” experience.

---

# **🎯 2\. Primary Use Case (Updated)**

### **The purpose of Feature 6 is now twofold:**

### **1\. Help learners manage all their subjects (Global Dashboard)**

* Quickly browse their study areas

* Jump into any subject

* Create or delete subjects

### **2\. Automatically recommend the next best topic when inside a subject (Subject Dashboard)**

* Run unlocking logic for that subject

* Fetch due reviews for that subject

* Suggest new topics to learn

* Present analytics, progress, and graph

This gives clarity, reduces cognitive load, and preserves Learnify’s promise:  
 **“Always know what to study next.”**

---

# **🧠 3\. How Feature 6 Fits with Features 1–5**

### **Global Dashboard depends on Feature 1**

* It lists all subjects created by the student.

* Pulls subjects \+ counts topics, mastered topics, etc.

### **Subject Dashboard depends on all features:**

| Feature | Contribution to Subject Dashboard |
| ----- | ----- |
| Feature 1 – Topics | Supplies the content of each subject |
| Feature 2 – Unlock Engine | Determines available topics for that subject |
| Feature 3 – SM‑2 | Provides due reviews \+ interval data |
| Feature 4 – AI DAG | Seeds topics & dependencies for the subject |
| Feature 5 – Visualizer | Renders the subject’s knowledge graph preview |

The subject dashboard is where all learning intelligence happens.

---

# **⚙️ 4\. Global Dashboard – How It Works**

### **Route: `/dashboard`**

### **Data Shown:**

* List of all subjects (title, description)

* Stats per subject:

  * total topics

  * mastered topics

  * progress bar

* CTA buttons:

  * **Add Subject**

  * **Delete Subject**

  * **Open Subject Dashboard**

### **Backend requirements:**

* Fetch all subjects for the logged-in user.

* Compute lightweight analytics per subject.

* No unlocking engine or recommendation algorithm runs here.

This page is purely organizational.

---

# **⚙️ 5\. Subject Dashboard – How It Works**

### **Route: `/dashboard/[subjectId]`**

This is where the real intelligence happens.

When this dashboard loads, the following processes run **in sequence**:

---

## **🔸 Step 1 — Run Unlock Engine (Feature 2\)**

Check this subject’s topics:

* Find locked topics

* Check if their parents are mastered/reviewing

* Unlock them if ready

This ensures recommendations are always correct.

---

## **🔸 Step 2 — Compute Recommendations (Subject-Specific)**

Using the algorithm from the Learnify PDF:

### **1\. Fetch due reviews for this subject:**

Topics where:

* `status = 'reviewing'` AND

* `next_review_at <= now()`

If any exist → **these are recommended first**.

### **2\. If no reviews are due → fetch available topics**

Topics where:

* `status = 'available'`

* `subject_id = subjectId`

### **3\. Sort available topics**

By:

* shortest estimated\_minutes, OR

* minimum dependencies depth

### **4\. Return the top 3**

These power the **Recommendation Widget**.

---

## **🔸 Step 3 — Subject Analytics**

Compute:

* mastered count

* learning count

* reviewing count

* upcoming reviews

* total time studied (from study\_logs)

---

## **🔸 Step 4 — Mini Graph Preview**

From Feature 5:

* Load all nodes (topics) in this subject

* Load edges (dependencies)

* Color nodes by status

* Render a small graph inside card

Click → opens full graph view.

---

# **🏗️ 6\. Implementation Breakdown**

## **A. Backend Functions Needed**

### **1\. `getSubjects(userId)`**

* Fetch all subjects

* Count topics/mastered topics

### **2\. `updateUnlockedTopics(userId, subjectId)`**

* Unlock topics only for this subject

### **3\. `getSubjectRecommendations(userId, subjectId)`**

* Apply recommender algorithm with filtering

### **4\. `getSubjectAnalytics(subjectId)`**

* Query study\_logs for this subject’s topics

### **5\. `getSubjectGraphData(subjectId)`**

* Topics \+ dependencies for React Flow

---

## **B. Frontend Pages Needed**

### **Page 1 — `/dashboard` (Global Dashboard)**

Components:

* SubjectCard

* CreateSubjectModal

* DeleteSubjectButton

---

### **Page 2 — `/dashboard/[subjectId]` (Subject Dashboard)**

Components:

* RecommendationWidget

* DueReviewsSection

* SubjectProgressCard

* MiniGraphPreview

* WeeklyStats

* QuickActions (Add Topic, Generate Graph, Open Visualizer)

---

# **🔄 7\. Updated End-to-End Flow**

### **Step 1 — User opens `/dashboard`**

They see all subjects.  
 They click **“Operating Systems”**.

### **Step 2 — `/dashboard/operating-systems` loads**

1. Unlock engine runs **only for OS topics**.

2. Recommendations for OS are computed.

3. Due reviews for OS displayed.

4. OS knowledge graph shown.

5. Progress analytics populated.

### **Step 3 — User studies a topic**

* Topic becomes `learning` or `reviewing`.

* Unlock engine reruns.

* Dashboard updates with new recommendations.

---

# **🧩 8\. Developer Checklist (Updated)**

### **Global Dashboard**

* List subjects

* Create subject

* Delete subject

* Show basic subject stats

* Link to subject dashboard

### **Subject Dashboard**

* Unlock engine for this subject

* Recommendation widget

* Due reviews list

* Mini graph

* Progress overview

* Weekly stats

* Quick actions

### **Backend**

* Subject-filtered queries for topics & logs

* Subject-filtered unlocking

* Subject-filtered recommendations

---

# 

# **🎉 9\. Final Summary**

The revised Feature 6 creates a **clean, scalable, two-level dashboard system**:

## **Level 1: Global Dashboard → Manages subjects**

## **Level 2: Subject Dashboard → Drives personalized learning**

All intelligent learning logic (unlocking, recommendations, SM‑2 reviews, graph preview) now lives at the **subject level**, making learning clear, structured, and deeply personalized.

