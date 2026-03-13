# **Feature 4 – AI Graph Generation (Dependency DAG)**

This document explains in **crystal-clear developer detail** how **Feature 4 – AI Graph Generation** works inside Learnify. It uses context from:

* **Feature 1:** Subject & Topic Management

* **Feature 2:** Knowledge Graph & Unlocking Engine

* **Feature 3:** Learning/Review Session (SM‑2 Algorithm)

* **Learnify Developer Guide** (AI integration section)

---

# **✅ 1\. What Feature 4 Does (High-Level)**

Feature 4 automatically generates a **complete learning roadmap** for any subject using AI.

User enters: **“Graph Theory”** → The system generates:

* A list of **topics**

* A list of **dependencies** (prerequisites)

* A **Directed Acyclic Graph (DAG)** structure

This DAG becomes the backbone for:

* Unlocking engine (Feature 2\)

* Recommendation engine

* SM‑2 learning/review pipeline (Feature 3\)

* Graph visualization

---

# **🎯 2\. Primary Use Case**

Students often **don’t know the correct order** to learn a subject.

This feature solves that by:

* Breaking the subject into meaningful topics

* Structuring them into a prerequisite graph

* Ensuring the graph is **acyclic** and well-ordered

* Automatically inserting everything into the database

This transforms Learnify into a **personalized curriculum generator**.

---

# **🧠 3\. How Feature 4 Fits into the Overall System**

### **From Feature 1: Subject & Topic Management**

* Topics created by AI get inserted into the `topics` table.

* They become standard nodes in the system.

### **From Feature 2: Knowledge Graph & Unlock Engine**

* AI produces edges → inserted into `topic_dependencies` table.

* Unlock engine uses these dependencies to determine which topics become available.

### **From Feature 3: SM‑2 Review Engine**

* Once a topic becomes available and studied → SM‑2 starts scheduling reviews.

* This grows on top of the graph created by Feature 4\.

**Feature 4 → Generates Graph**  
 **Feature 2 → Enforces Graph Order**  
 **Feature 3 → Ensures Retention of Each Node**

---

# **⚙️ 4\. How Feature 4 Works Internally**

This feature has **four major technical steps**:

---

## **Step 1: User Requests a Generated Roadmap**

UI: `/subjects/[id]` → **“Generate Study Flow (AI)” button**

User inputs a subject name like:

"Data Structures and Algorithms"

This triggers a server action → calls `/api/generate-graph`.

---

## **Step 2: AI Generates Topics \+ Dependencies (JSON)**

The server calls OpenRouter with system \+ user prompts defined in the guide.

### **System Prompt Summary:**

* You are an expert curriculum designer.

* Output **ONLY JSON**.

* Include:

  * `topics` → list of topic objects (slug, title, description)

  * `dependencies` → list of edges (source → target)

* Guarantee **Directed Acyclic Graph (DAG)**.

### **Example AI Response:**

{  
  "topics": \[  
    {"slug": "intro\_graphs", "title": "Introduction to Graphs", "description": "Basic terms and definitions"},  
    {"slug": "dfs", "title": "Depth-First Search", "description": "Traversal algorithm"}  
  \],  
  "dependencies": \[  
    {"source": "intro\_graphs", "target": "dfs"}  
  \]  
}

---

## **Step 3: Insert Topics into Supabase**

For each AI-generated topic:

* Insert into `topics` table.

* Map `slug → UUID` so dependencies can be attached later.

Example:

* `intro_graphs` → `03dc-91fa-…`

* `dfs` → `b6e0-228f-…`

This gives you a dictionary:

slugToId \= {  
  intro\_graphs: "03dc-91fa...",  
  dfs: "b6e0-228f..."  
}

---

## **Step 4: Insert Dependency Edges**

Now insert each dependency row into `topic_dependencies`:

parent\_id \= slugToId\[source\]  
child\_id  \= slugToId\[target\]

This completes the DAG.

---

# **🔓 5\. Unlock Engine Triggered After Graph Generation**

After creating the graph, you must call **updateUnlockedTopics()**.

This ensures:

* Topics with **no prerequisites** immediately become `available`.

* Others remain `locked`.

This is required so the user can begin learning instantly.

---

# **🧩 6\. Full Request/Response Lifecycle**

### **1\. User clicks “Generate Study Flow” → calls server action.**

### **2\. Server posts prompt to AI model.**

### **3\. AI returns JSON with topics \+ edges.**

### **4\. Server parses JSON and inserts rows.**

### **5\. Unlock engine runs to update statuses.**

### **6\. UI refreshes with new topics \+ visual graph.**

---

# **📐 7\. Example End-to-End Execution**

User enters: **“Operating Systems”**

### **AI returns topics:**

* Processes

* Threads

* Scheduling

* Deadlocks

### **AI returns dependencies:**

* Processes → Threads

* Threads → Scheduling

* Scheduling → Deadlocks

### **Database now contains:**

* 4 topics

* 3 edges

Unlock logic marks **“Processes”** as `available` → learning begins.

---

# **🏗️ 8\. Developer Tasks (Implementation Checklist)**

## **Backend (Server Actions \+ API Route)**

You must implement:

* `/api/generate-graph`

* `insertGeneratedTopics()`

* `insertGeneratedDependencies()`

* `runUnlockEngine()` after insertion

## **Frontend**

You must implement:

* UI modal for AI generation

* Loading states

* Error handling

* Refresh subject page

## **Graph Visualization (Optional but planned)**

* Convert topics to nodes

* Convert dependencies to edges

* Render via **React Flow**

---

# **🧩 9\. How Feature 4 Integrates with Other Features**

| Feature | Dependency | Explanation |
| ----- | ----- | ----- |
| Feature 1 | Topics table | AI inserts topics exactly like manual topics |
| Feature 2 | Dependencies \+ statuses | Unlock engine uses AI-generated edges |
| Feature 3 | SM‑2 review | Once a topic is studied, SM‑2 takes over |
| Dashboard | Recommendations | Graph seeds the "what to learn next" system |

Feature 4 is the **origin point** of the entire adaptive learning system.

---

# 

# **🎉 10\. Final Summary**

Feature 4 is the **AI-powered curriculum builder** for Learnify.  
 It:

* Converts subjects into structured learning paths

* Generates DAGs with prerequisites

* Inserts them into the database

* Triggers unlocking

* Powers the entire smart recommendation engine

It is the foundation of Learnify’s value: **"Your Brain’s Learning Playlist"**.

