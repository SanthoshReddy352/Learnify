# **Feature 1 – Subject & Topic Management (Learnify Developer Guide)**

This section explains in detail **how Feature 1 works**, **why it exists**, and **what exactly a developer must implement** for the feature to function as intended.

---

# **✅ 1\. What is “Subject & Topic Management”?**

Subject & Topic Management is the **foundation layer** of the entire Learnify platform. This feature allows users to:

* Create **subjects** (DSA, DBMS, React, Thermodynamics, etc.)

* Add **topics** under each subject

* Define **topic metadata** (description, estimated time)

* (Later) attach **dependencies**, **notes**, **flashcards**, etc.

Without this module, the platform cannot build Knowledge Graphs, unlock topics, or run the recommendation engine.

---

# **🎯 2\. Primary Use Case of This Feature**

This feature exists to solve a simple problem:

Students don’t know what topics exist inside a subject, and they don’t know the order in which to learn them.

Learnify solves this by letting users

1. Create subjects.

2. Auto-generate topics via AI or add manually.

3. Manage them from a central interface.

4. Connect them into a dependency graph.

This is the **input layer** for the entire learning engine.

---

# **🧠 3\. How It Fits Into the Bigger System**

User → Creates Subject → Adds Topics → Dependencies → Unlocking Engine → Recommender → Study Flow

Every other Learnify feature RELIES on subjects & topics:

* **Knowledge Graph** needs topics to create edges.

* **Unlock Engine** needs topics with statuses.

* **SM‑2 review engine** needs topics to update intervals.

* **Analytics** uses topics for logs.

So this is the "root resource" of the whole platform.

---

# **🏗️ 4\. How It Is Implemented (Developer Breakdown)**

Below is a precise, step‑by‑step breakdown of how to implement this feature.

# **\---**

# **⚙️ PART A — Database Layer (Supabase)**

The following tables from the architecture PDF are used:

## **1\. `subjects`**

Stores high-level subjects.

id UUID  
user\_id (FK → profiles)  
title  
description  
created\_at

## **2\. `topics`**

Stores every topic inside a subject.

id UUID  
subject\_id  
title  
description  
estimated\_minutes  
status (locked/available/learning/reviewing/mastered)  
next\_review\_at  
interval\_days  
repetition\_count  
difficulty\_factor  
created\_at

These must already exist from the given SQL schema.

---

# **⚙️ PART B — Frontend/Backend Implementation (Next.js 15 \+ Server Actions)**

## **1\. Subject CRUD**

You must build:

### **UI pages:**

* `/subjects` → list all user subjects

* `/subjects/new` or inline modal → create subject

* `/subjects/[subjectId]` → view subject \+ topics list

### **Server Actions:**

* `createSubject(data)`

* `updateSubject(id, data)`

* `deleteSubject(id)`

* `getSubjects(userId)`

### **Insertion Example:**

await supabase.from("subjects").insert({  
  user\_id,  
  title,  
  description  
});

---

## **2\. Topic CRUD**

Once a subject exists, users can add topics.

### **UI pages/components:**

* `/subjects/[id]/topics/new` → add topic

* Topic edit modal

* Topic list component

### **Server Actions:**

* `createTopic(subjectId, data)`

* `updateTopic(topicId, data)`

* `deleteTopic(topicId)`

### **Insert example:**

await supabase.from("topics").insert({  
  subject\_id,  
  title,  
  description,  
  estimated\_minutes  
});

---

# **⚙️ PART C — Topic Status System**

Each topic starts with:

status \= "locked"

Later, the unlocking engine updates statuses based on dependencies.

Statuses include:

* **locked** → cannot be studied yet

* **available** → all prerequisites satisfied

* **learning** → user is currently studying

* **reviewing** → SM‑2 review scheduled

* **mastered** → completed

### **Developer task:**

Ensure topics have correct default values.

---

# **⚙️ PART D — Optional Enhancements (Still Part of Feature 1\)**

These are not required for MVP but recommended:

* Add topic search within a subject

* Add reordering (drag & drop)

* Add color-coded category labels

* Add notes/attachments for each topic

---

# **🧩 5\. How Feature 1 Integrates With Other Systems**

### **1\. Knowledge Graph**

Topics become nodes.  
 Topic dependencies become edges.

### **2\. Unlocking Engine**

Topic.status is updated based on prerequisites.

### **3\. AI Graph Generator**

Generated topics are inserted into the `topics` table.

### **4\. Spaced Repetition Engine**

Topic.review fields are updated after every learning session.

---

# **📌 6\. Developer Checklist for Feature 1**

Use this to confirm the feature is complete.

### **Database**

* 

### **Subject UI \+ Actions**

* 

### **Topic UI \+ Actions**

* 

### **Integration readiness**

* 

---

# **🎉 Final Summary**

Subject & Topic Management is the **core data-management feature** of Learnify. It allows users to define the content of their learning roadmap. As a developer, your job is to implement:

* Full CRUD for subjects and topics

* Correct database structure

* Clean Next.js UI

* Server Actions for all operations

* Proper topic status initialization

Once this is done, all higher-order features (AI graph generation, unlocking engine, recommender, SM‑2 reviews) will layer perfectly on top.

---

