# **Feature 3 – LEARNING/REVIEW SESSION (SM‑2 ALGORITHM)**

This document explains **in clear, developer‑ready detail** how Feature 3 works, what its primary use‑case is, and exactly **how you must implement it** using the context of:

* Feature 1 — Subject & Topic Management

* Feature 2 — Knowledge Graph & Unlocking Engine

* SM‑2 algorithm rules (from Learnify PDF)

---

# **✅ 1\. What Feature 3 Does (High‑Level)**

Feature 3 is responsible for **how a student actually learns and reviews topics** inside Learnify.  
 It handles:

* Delivering topics to study (learning session)

* Asking the student to self‑rate recall (0–5)

* Applying the SM‑2 spaced‑repetition algorithm

* Scheduling next review

* Updating topic status (`learning`, `reviewing`, `mastered`)

* Logging study performance

This system is what guarantees long‑term retention.

---

# **🎯 2\. Primary Use‑Case**

**To ensure students retain knowledge for the long term** using scientifically proven spaced repetition (SM‑2).

### **Without this feature:**

Students forget everything they learn.

### **With SM‑2 inside Learnify:**

* Each topic gets a **custom review schedule**

* Topics reappear just before the student is likely to forget them

* Harder topics repeat more frequently

* Mastered topics get spaced farther apart

Learnify becomes a **memory‑optimized personal tutor**.

---

# **🧠 3\. How Feature 3 Fits with Feature 1 & 2**

### **From Feature 1 (Topic Management):**

Each topic already has:

* status

* next\_review\_at

* difficulty\_factor

* repetition\_count

* interval\_days

### **From Feature 2 (Unlock Engine):**

* When a topic becomes mastered → its child topics may unlock

* When a topic is due for review → it appears in recommendation engine

### **Feature 3 influences both:**

* After a review, the topic may change from *learning → reviewing → mastered*

* Unlock engine needs this updated status

* Recommendation engine uses newly scheduled review timestamps

---

# **⚙️ 4\. How Feature 3 Works in Detail**

Feature 3 consists of **three main flows**:

1. **The Learning Session** (first‑time study)

2. **The Review Session** (SM‑2 spaced repetition)

3. **Status & Review Scheduling** (database updates)

Let’s break each down.

---

# **📌 5\. FLOW 1 — LEARNING SESSION**

Triggered when:

* A user selects an *available* topic (new topic)

* Recommendation engine says "Study this next"

### **UI Flow**

1. Show Topic name \+ description

2. User studies the content

3. User clicks **“Mark as Learned”** or proceeds to first review

### **Backend Flow**

* Update topic.status → `learning`

* Set initial repetition\_count \= 0

* The next time the user studies this topic, it becomes a **review session**.

---

# **📌 6\. FLOW 2 — REVIEW SESSION (SM‑2 Algorithm)**

This is the core of Feature 3\.

### **At review time, show:**

* Flashcard or topic summary

* Rating buttons (0, 1, 2, 3, 4, 5\)

### **Rating Meaning**

| Rating | Meaning |
| ----- | ----- |
| 5 | Perfect recall |
| 4 | Correct, minor hesitation |
| 3 | Correct but struggled |
| 2 | Incorrect but remembered partially |
| 1 | Poor recall |
| 0 | Complete blackout |

### **These ratings directly feed into the SM‑2 formula:**

* 3–5 \= success → interval increases

* 0–2 \= fail → reset interval & repetition

---

# **📐 7\. SM‑2 Algorithm (from Learnify PDF)**

You will import and use this exact function:

calculateSM2(quality, lastInterval, lastRepetition, lastEfactor)

It returns:

* new interval in days

* new repetition count

* new easiness factor

### **Developer Responsibility**

Call `calculateSM2()` every time a user submits a rating.

---

# **🔄 8\. FLOW 3 — STATUS & DB UPDATES**

After calculating SM‑2 results, update the topic row:

| Field | Meaning |
| ----- | ----- |
| interval\_days | When this topic should be reviewed next |
| repetition\_count | Number of successful repetitions so far |
| difficulty\_factor | Topic difficulty (SM‑2 easiness) |
| next\_review\_at | NOW() \+ interval\_days |
| status | `reviewing` or `mastered` |

### **Status Logic**

* If repetition\_count \>= 3 and quality \>= 4 → `mastered`

* Else → `reviewing`

### **After updating the topic:**

Insert into `study_logs`:

* user\_id

* topic\_id

* duration\_seconds

* performance\_rating

* reviewed\_at

This powers analytics.

---

# **🚀 9\. End-to-End Example**

### **Topic: "Binary Search"**

### **User studies for the first time → clicks "Mark Learned"**

* status \= learning

* repetition\_count \= 0

### **Next day → review due**

User rates: **5 (Perfect recall)**

SM‑2 outputs:

* interval \= 1

* repetition \= 1

* efactor \= 2.6

DB updates:

* next\_review\_at \= tomorrow

* status \= reviewing

### **Two more successful reviews → status becomes `mastered`**

Unlock Engine now:

* Checks child topics → may unlock them

---

# **🧩 10\. When Feature 3 Is Triggered**

Feature 3 runs any time:

* User opens a topic to study

* A topic becomes due for review

* Dashboard loads suggestions

The recommendation engine (Feature 2 extension) asks:

1. Are there topics with `next_review_at <= NOW()`?

2. If yes → those are shown first

3. If no → show available (unlearned) topics

---

# **🏗️ 11\. Developer Implementation (Step-by-Step)**

### **Backend (Server Actions)**

You must implement actions:

* `startLearningSession(topicId)`

* `submitReview(topicId, rating)`

* `calculateNextReview(topic)`

* `logStudySession(data)`

### **Frontend**

You must implement pages:

* `/learn/[topicId]` → Learning UI

* `/review/[topicId]` → Review \+ rating UI

### **Database Updates**

Every review must update:

* interval\_days

* repetition\_count

* difficulty\_factor

* next\_review\_at

* status

Plus add a row to `study_logs`.

**🔗 12\. How Feature 3 Connects Back to Feature 2**

After each review:

* The Unlock Engine re-evaluates prerequisites

* Because mastering this topic might unlock new ones

So calling the unlock engine after every review is recommended.

**✔️ 13\. Final Summary (Crystal‑Clear)**

Feature 3 transforms Learnify from a static syllabus into a **smart memory engine**.

### **It does three jobs:**

1. Handle learning sessions

2. Handle review sessions (SM‑2)

3. Schedule future reviews \+ update topic mastery

### **Why it matters:**

* Ensures long‑term retention

* Adjusts difficulty per student

* Feeds recommendation engine

* Unlocks dependent topics

### **Developer Tasks:**

* Build UI for learning & reviewing

* Implement rating interface

* Call SM‑2 algorithm

* Update database accordingly

* Log sessions

* Trigger unlock engine

With this implemented, Learnify becomes a **true adaptive learning system**.

