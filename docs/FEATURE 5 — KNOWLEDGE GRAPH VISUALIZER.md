# **🧩 Feature 5 — KNOWLEDGE GRAPH VISUALIZER (Crystal Clear Developer Explanation)**

This document explains **exactly how Feature 5 works**, what its **primary purpose** is, and **how to implement it step-by-step**, using context from:

* Feature 1 — Subject & Topic Management

* Feature 2 — Knowledge Graph & Unlocking Engine

* Feature 3 — Learning/Review (SM‑2 Algorithm)

* Feature 4 — AI Graph Generation (Dependency DAG)

---

# **⭐ 1\. What Feature 5 Is**

Feature 5 is the **visual interface** that allows users to *see their entire learning graph*. It converts topics \+ dependencies into an interactive **Directed Acyclic Graph (DAG)** visualization.

This is the first time the learner gets a **“map of their brain”** inside Learnify.

---

# **🎯 2\. Primary Use Case**

### **The purpose of Feature 5 is to:**

* Help students understand *where they currently are* in their learning journey

* Show what topics are unlocked, locked, mastered, or due next

* Highlight how topics depend on each other

* Increase motivation using visual progress

The visualizer allows students to:

* Zoom out → See the entire subject

* Zoom in → Focus on the next few topics

* Click nodes to open the learning or review screen

This instantly makes Learnify feel intelligent and structured.

---

# **🌐 3\. How Feature 5 Fits With Other Features**

### **✔ From Feature 1 — Topics exist with metadata**

The visualizer reads all topics for a subject.

### **✔ From Feature 2 — Dependencies define graph structure**

The visualizer uses these edges to draw the DAG.

### **✔ From Feature 3 — Topics have statuses (learning/reviewing/mastered)**

Node colors reflect these statuses.

### **✔ From Feature 4 — AI-generated graphs become visual instantly**

After AI graph generation, users instantly see their roadmap.

Feature 5 is the **presentation layer** that sits on top of all backend logic.

---

# **🏗️ 4\. How Feature 5 Works (Implementation Breakdown)**

The visualizer consists of **three components**:

1. **Data Fetcher** — loads topics \+ dependencies

2. **Graph Transformer** — converts DB rows → graph nodes & edges

3. **Graph Renderer** — displays the DAG using React Flow

Let’s break each part down.

---

# **🔌 5\. Step 1 — Fetch Data from Supabase**

For a given subject, fetch:

### **Topics:**

* id

* title

* status

* coordinates (if using persisted layout)

### **Dependencies: (parent\_id → child\_id)**

These will become edges in the graph.

---

# **🔧 6\. Step 2 — Transform Data Into Graph Format**

React Flow requires:

### **Nodes:**

{  
  id: "uuid",  
  data: { label: topic.title, status: topic.status },  
  position: { x: 0, y: 0 }  
}

### **Edges:**

{  
  id: "parentId-childId",  
  source: parentId,  
  target: childId,  
  animated: true  
}

### **Node Colors Based on Status**

* **locked** → gray

* **available** → blue

* **learning** → yellow

* **reviewing** → green

* **mastered** → purple

This allows students to visually understand their progress.

**🖥️ 7\. Step 3 — Render Using React Flow**

Use the React library:

import ReactFlow from "reactflow";

Render graph:

\<ReactFlow nodes={nodes} edges={edges} fitView /\>

Optional enhancements:

* mini-map

* background grid

* zoom controls

---

# **🔄 8\. Live Updates**

Whenever:

* a topic is mastered

* a review is completed

* a prerequisite is unlocked

The graph should refresh so users see:

* new colors

* new unlocked nodes

* new recommended paths

This can be done using React Query \+ Supabase real-time subscriptions.

---

# **🚀 9\. Integration Flow (End-to-End)**

### **After AI generates the DAG:**

1. Insert topics

2. Insert dependencies

3. Unlock engine runs

4. **Visualizer instantly shows the structured roadmap**

The visualizer is the *final presentation* of all previous features.

---

# **🧩 10\. Developer Checklist (What You Must Build)**

### **Backend**

* Fetch topics by subject

* Fetch dependencies by subject

### **Frontend**

* Transform topics → nodes

* Transform dependencies → edges

* Render React Flow DAG

* Apply color coding by status

* Add click interaction → open topic view

* Save node positions in DB

* Collapse/expand sections

* Focus mode for specific paths

* Highlight next recommended topics

**🎉 Final Summary**

Feature 5 — Knowledge Graph Visualizer — is the **visual brain of Learnify**. It turns raw backend data (topics, dependencies, statuses) into an interactive learning map.

It:

* Reflects everything from Features 1–4

* Helps students understand progress instantly

* Improves motivation and clarity

* Makes Learnify stand out from typical study apps

This visualization completes the learning loop by giving students a **clear, interactive, motivational roadmap** of their learning path.

---

