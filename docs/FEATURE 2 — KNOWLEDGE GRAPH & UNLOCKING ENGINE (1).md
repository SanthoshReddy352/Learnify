# **Feature 2 – Knowledge Graph & Unlocking Engine (Detailed Explanation)**

This document explains, in detail, how **Feature 2 – Knowledge Graph & Unlocking Engine** works inside Learnify, using information from the Learnify Developer Guide and context from Feature 1 (Subject & Topic Management).

---

## **🔍 What Feature 2 Does**

Feature 2 is the **brain** of Learnify.  
 It turns the topics created in Feature 1 into a **dynamic, intelligent learning system**.

It has two major parts:

1. **Knowledge Graph (Dependency Graph)** → Defines how topics depend on each other.

2. **Unlocking Engine** → Dynamically unlocks topics based on student progress.

Together, they ensure students always know **the right topic to study next**.

---

# **1\. Primary Purpose of This Feature**

### **⭐ The main purpose:**

To automatically decide **which topics are unlocked, locked, available, or ready for review** based on student progress.

Students often don’t know:

* Which topic comes next?

* What prerequisites they must finish first?

* Whether they skipped something important?

The Knowledge Graph \+ Unlocking Engine solves this by:

* Structuring topics into a **Directed Acyclic Graph (DAG)**.

* Enforcing correct learning order.

* Dynamically updating topic statuses.

* Powering the recommendation system (Feature 4 in the PDF).

**Result:** A personalized, automatically generated study path.

---

# **2\. How the Knowledge Graph Works**

The Knowledge Graph is a DAG created from **topic dependencies**.  
 Each topic is a node.  
 Each prerequisite is an edge.

Example:

Arrays → Linked Lists → Stacks → Trees → Graphs

Stored in Supabase using the table:

topic\_dependencies (parent\_id, child\_id)

### **⭐ From Feature 1:**

Topics created by the user or AI become the **nodes** in this graph.

### **📌 Developer Responsibility**

You must ensure:

* Dependencies are inserted correctly.

* Data forms a valid DAG.

* The graph is quickly queriable for unlocking logic.

---

# **3\. How the Unlocking Engine Works**

The Unlocking Engine checks the Knowledge Graph to determine:

* Which topics are **available** to learn.

* Which are still **locked**.

* Which are **ready for spaced repetition**.

Every topic has a **status field** from Feature 1:

locked  
available  
learning  
reviewing  
mastered

### **🔁 The unlock cycle runs whenever:**

* A user studies a topic.

* A topic changes status (e.g., becomes mastered).

* The dashboard loads.

---

## **🔧 Unlocking Algorithm (From PDF)**

The server action must:

### **Step 1 — Fetch all locked topics**

select \* from topics where status \= 'locked'

### **Step 2 — For each topic, check if prerequisites are satisfied**

Prerequisites \= rows in `topic_dependencies` where child\_id \= current topic.

A topic is unlocked when **all parent topics** are either:

* mastered

* reviewing

### **Step 3 — If all prerequisites complete → mark topic available**

await supabase.from("topics").update({ status: "available" }).eq("id", topicId)

### **Step 4 — Return the updated available topics**

These feed into the recommendation engine.

---

# **4\. Example Unlocking Flow**

Let’s assume:

A → B → C

### **Initially:**

A: available  
 B: locked  
 C: locked

### **After mastering A:**

Unlock engine checks B:

* Are all parents of B mastered? Yes → B becomes **available**.

C stays locked until B is mastered.

This makes Learnify behave like:

* A playlist

* A skill tree

* A quest chain (like in games)

---

# **5\. How This Feature Integrates with Other Parts**

### **From Feature 1:**

You already have subjects, topics, and topic statuses.

### **How Feature 2 uses them:**

* It reads **topic statuses**.

* It updates statuses based on progress.

* It determines the learning path.

### **How it feeds Feature 3 (Spaced Repetition):**

* When user reviews a topic → SM‑2 updates `next_review_at`.

* Topic status becomes `reviewing` or `mastered`.

* Unlock engine re-evaluates dependencies.

### **How it powers recommendations (Feature 4 in PDF):**

Recommendation engine:

1. Fetches due reviews.

2. If none, fetches available topics.

3. Sorts them intelligently.

4. Gives the user "Next 3 topics".

Without the Unlocking Engine, this feature does not work.

---

# **6\. Developer Implementation Checklist**

### **✔ Database**

* Ensure `topics` and `topic_dependencies` are created.

* Ensure `status` column defaults to "locked".

### **✔ API/Server Actions to build**

1. `updateUnlockedTopics()`

2. `getTopicDependencies(topicId)`

3. `getMasteredOrReviewingTopics()`

4. `unlockTopic(topicId)`

### **✔ When to call unlock logic**

* After AI graph import

* After manual dependency creation

* After user marks a topic mastered

* On dashboard load

### **✔ UI Indicators**

Each topic in the UI should show:

* Locked (gray)

* Available (blue)

* Learning (yellow)

* Reviewing (green)

* Mastered (purple)

---

# **7\. Final Summary**

Feature 2 transforms Learnify from a note‑storage app into an **intelligent learning engine**.

### **💡 Knowledge Graph:**

Creates structure and order.

### **🔓 Unlocking Engine:**

Controls when each topic becomes accessible.

### **🎯 Main benefit:**

Learners never feel lost — the system always knows what they should study next.

---

