# 🚀 Learnify Phase 2 Complete!

## ✨ What's New in Phase 2

Phase 2 adds the **core learning features** - AI curriculum generation, spaced repetition, and complete learning/review workflows!

### 🤖 AI Curriculum Generation

**Feature: Generate complete learning paths with one click!**

- **AI Generate Button** on subject page (topbar)
- Modal with inputs:
  - Subject context & goals (free text)
  - Target difficulty (1-5)
  - Total study time (minutes)
- Powered by **OpenRouter** using `google/gemini-flash-1.5-8b` (best free model)
- Generates 5-10 topics with:
  - Unique titles and descriptions
  - Estimated time per topic
  - Difficulty ratings
  - **Dependency graph (DAG)** - topics unlock sequentially
- **DAG validation** - rejects circular dependencies
- **Auto-unlock engine** - unlocks topics when prerequisites are met
- Real-time updates via Supabase subscriptions

**How it works:**
1. Click "AI Generate" button on subject page
2. Describe what you want to learn (e.g., "Python from basics to web apps with Flask")
3. Set difficulty and total time
4. AI creates structured curriculum
5. Topics appear with dependencies
6. First topics auto-unlock and are ready to learn!

---

### 🧠 SM-2 Spaced Repetition Algorithm

**Feature: Scientifically-proven memorization system!**

- **SM-2 Algorithm** implementation (SuperMemo)
- Quality ratings: 0-5
  - 5: Perfect recall
  - 4: Correct after hesitation
  - 3: Correct with difficulty
  - 2: Incorrect but remembered
  - 1: Familiar but wrong
  - 0: Complete blackout
- **Adaptive intervals:**
  - First review: 1 day
  - Second review: 6 days
  - After that: exponential growth based on quality
- **Ease factor adjustment** - difficulty adapts to your performance
- **Status transitions:**
  - Available → Learning (when you start)
  - Learning → Reviewing (when you complete)
  - Reviewing → Mastered (after 3+ successful reviews with quality ≥4)
  - Reset to Reviewing if quality <3

**Algorithm details:**
- Calculates next review interval based on:
  - Quality rating (0-5)
  - Previous interval
  - Repetition count
  - Ease factor (difficulty factor)
- Updates stored in database:
  - `interval_days`
  - `repetition_count`
  - `difficulty_factor`
  - `next_review_at`
  - `status`

---

### 📚 Learning Flow (`/learn/[topicId]`)

**Feature: Full-screen study mode with progress tracking!**

- **Clean, distraction-free UI**
- **Progress bar** - simulates reading progress
- **Content display:**
  - Topic title, description
  - Main content (can be rich text)
  - Difficulty and estimated time
- **Flashcard practice mode:**
  - Quick review cards
  - Swipe through concepts
  - Reinforcement before completion
- **"Mark as Learned" button:**
  - Saves study session to `study_logs`
  - Transitions status: Available → Reviewing
  - Schedules first review in 1 day
  - Triggers unlock engine (may unlock dependent topics)
- **Time tracking:** Records actual study duration

**User Flow:**
1. Click "Learn" button on available topic
2. Read content at your own pace
3. Optionally practice with flashcards
4. Click "Mark as Learned"
5. Topic moves to reviewing status
6. Notification: "Review tomorrow!"

---

### 🔄 Review Flow (`/review/[topicId]`)

**Feature: Spaced repetition review sessions!**

- **Recall-first approach:**
  - Topic title shown first
  - Try to recall content mentally
  - Click "Show Content" to verify
- **Horizontal quality slider (0-5)**
  - Visual labels for each rating
  - Descriptions to guide selection
  - Live preview of selected quality
- **SM-2 calculation on submit:**
  - Computes new interval
  - Updates ease factor
  - Schedules next review date
  - May transition to "mastered" status
- **Immediate feedback:**
  - Success toast with next review date
  - Status updates in real-time
  - Graph reflects new status instantly
- **Study log recording:** Tracks quality, duration, session type

**User Flow:**
1. Click "Review" button on due topic
2. Try to recall the topic mentally
3. Optionally reveal content to check
4. Rate quality (0-5) honestly
5. Submit review
6. See next review date
7. Return to subject page

---

### 🔓 Unlock Engine

**Feature: Progressive topic unlocking based on mastery!**

- **Dependency checking** - evaluates prerequisites
- **Auto-unlock when:**
  - All dependency topics are in "reviewing" or "mastered" status
  - Called after:
    - AI graph generation (unlocks roots)
    - Topic completion (unlocks children)
    - Review submission (if mastered)
- **Status flow:**
  - Locked (gray) → Available (blue) → Learning (yellow) → Reviewing (green) → Mastered (purple)
- **Visual feedback:**
  - Color changes in graph and lists
  - Real-time status badges
  - "Due now" indicators for overdue reviews

**Logic:**
1. When topic reaches "reviewing" or "mastered"...
2. Unlock engine checks all locked topics in subject
3. For each locked topic:
   - Get its dependencies
   - Check if all dependencies are reviewing/mastered
   - If yes → unlock (set status to "available")
4. Real-time subscription pushes update to UI

---

### 🎨 Enhanced Subject Page

**New features on subject detail page:**

1. **AI Generate Button** (topbar)
   - Sparkles icon
   - Opens modal for curriculum generation
   - Shows loading state during generation

2. **Learn/Review Buttons** (on topic cards)
   - **Learn button** (blue) - for available/learning topics
   - **Review button** (green/red) - for reviewing/mastered topics
   - **"Due now" indicator** (red badge) - for overdue reviews
   - Next review date display

3. **Enhanced Topic Cards:**
   - Status badges with color coding
   - Next review date (if applicable)
   - Due indicator (red if overdue)
   - Action buttons (Learn/Review)
   - Delete button

4. **Overview Tab Stats:**
   - Total Topics
   - Available (ready to learn)
   - Mastered (completed with good retention)

---

## 📊 Database Updates

All SM-2 fields are now actively used:

- `interval_days` - Days until next review
- `repetition_count` - Number of successful reviews
- `difficulty_factor` - Ease factor (adaptive difficulty)
- `next_review_at` - Timestamp of next scheduled review
- `status` - locked/available/learning/reviewing/mastered

Study logs track:
- User, topic, subject IDs
- Session type (learning/review)
- Duration in minutes
- Quality rating (for reviews)
- Timestamp

---

## 🔌 API Endpoints

### POST `/api/generate-graph`

Generate AI curriculum for a subject.

**Request:**
```json
{
  "subjectId": "uuid",
  "seedText": "I want to learn...",
  "difficulty": 3,
  "totalMinutes": 300
}
```

**Response:**
```json
{
  "success": true,
  "topicsCreated": 8,
  "dependenciesCreated": 12,
  "curriculum": { ... }
}
```

**Features:**
- Calls OpenRouter API with structured prompt
- Validates JSON response
- Checks for cycles in dependency graph
- Inserts topics and dependencies
- Runs unlock engine
- Returns summary

---

## 🎯 Server Actions (RSC)

All in `/app/lib/actions.js`:

1. **`updateUnlockedTopics(subjectId)`**
   - Checks all locked topics
   - Unlocks topics when prerequisites met
   - Called after generation, learning, reviews

2. **`startLearningSession(topicId)`**
   - Updates status to "learning"
   - Called when user enters learn page

3. **`completeLearning(topicId, durationMinutes)`**
   - Updates status to "reviewing"
   - Sets initial SM-2 values (interval=1, repetition=0)
   - Schedules first review in 1 day
   - Creates study log
   - Triggers unlock engine
   - Returns next review date

4. **`submitReview(topicId, quality, durationMinutes)`**
   - Fetches current topic data
   - Calculates new SM-2 values
   - Updates interval, repetition, efactor, next_review_at
   - May transition to "mastered" (repetition ≥3, quality ≥4)
   - Creates study log
   - Triggers unlock engine if mastered
   - Returns next review date and new status

---

## 🧮 SM-2 Utilities

In `/app/lib/sm2.js`:

1. **`calculateSM2(quality, lastInterval, lastRepetition, lastEfactor)`**
   - Pure function implementing SM-2
   - Returns: { interval, repetition, efactor }

2. **`calculateNextReviewDate(intervalDays)`**
   - Returns ISO timestamp for next review

3. **`isDueForReview(nextReviewAt)`**
   - Returns boolean if review is due now

---

## 🎮 User Journeys

### Journey 1: AI-Generated Curriculum

1. User creates subject "Learn React"
2. Clicks "AI Generate"
3. Enters: "I want to learn React from basics to building full apps with hooks and state management"
4. Sets difficulty: 3 (Intermediate)
5. Sets time: 400 minutes
6. Clicks "Generate Curriculum"
7. AI creates 8 topics:
   - React Basics (no deps) → AVAILABLE
   - JSX Syntax (depends on Basics) → LOCKED
   - Components (depends on JSX) → LOCKED
   - State & Props (depends on Components) → LOCKED
   - Hooks (depends on State) → LOCKED
   - useEffect (depends on Hooks) → LOCKED
   - Context API (depends on Hooks) → LOCKED
   - Building an App (depends on all) → LOCKED
8. Graph displays with "React Basics" in blue (available)
9. All others are gray (locked)
10. User clicks "Learn" on React Basics

### Journey 2: Learning & First Review

1. User enters learn page for "React Basics"
2. Reads content (30 minutes)
3. Progress bar fills
4. Clicks "Practice with Flashcards"
5. Reviews key concepts
6. Clicks "Mark as Learned"
7. Topic status → Reviewing (green)
8. Next review scheduled: Tomorrow
9. "JSX Syntax" unlocks (blue) because its only dependency is now reviewing
10. Next day, user sees "🔴 Due now" badge on React Basics
11. Clicks "Review"

### Journey 3: Review with SM-2

1. User enters review page
2. Sees topic title "React Basics"
3. Thinks about it mentally
4. Clicks "Show Content" to verify
5. Realizes recall was good but not perfect
6. Drags slider to **4** (Correct after hesitation)
7. Clicks "Submit Review"
8. SM-2 calculates:
   - Previous interval: 1 day
   - Repetition: 0 → 1
   - Efactor: 2.5 (unchanged for quality=4)
   - New interval: 1 day (first review)
   - Next review: Tomorrow
9. User sees toast: "Review complete! Next review: Dec 8, 2024"
10. Returns to subject page
11. Topic still green (reviewing), not mastered yet
12. Continues learning other topics

### Journey 4: Mastering a Topic

1. User has reviewed "React Basics" 3 times
2. Each time rated quality 4 or 5
3. Current stats:
   - Repetition: 2
   - Interval: 6 days
4. On 3rd review, user rates quality **5** (perfect)
5. SM-2 calculates:
   - Repetition: 2 → 3
   - Interval: 6 → ~15 days (exponential)
   - Status: Reviewing → **Mastered**
6. Topic badge turns purple
7. Neon glow effect on node in graph
8. "Components" topic may unlock if React Basics was its last dependency

---

## 🧪 Testing Checklist

### AI Generation
- ✅ Click AI Generate button
- ✅ Enter seed text
- ✅ Set difficulty and time
- ✅ Click Generate
- ✅ See loading state
- ✅ Success toast with topic count
- ✅ Topics appear in subject
- ✅ Graph shows dependencies
- ✅ Root topics are unlocked (blue)
- ✅ Child topics are locked (gray)

### Learning Flow
- ✅ Click "Learn" on available topic
- ✅ Read content
- ✅ Progress bar animates
- ✅ Click flashcards
- ✅ Practice with cards
- ✅ Click "Mark as Learned"
- ✅ Success toast
- ✅ Return to subject
- ✅ Topic now green (reviewing)
- ✅ "Review" button appears
- ✅ Dependent topics unlock

### Review Flow
- ✅ Click "Review" on reviewing topic
- ✅ Try to recall
- ✅ Click "Show Content"
- ✅ See content
- ✅ Drag quality slider
- ✅ See quality label update
- ✅ Click "Submit Review"
- ✅ See next review date toast
- ✅ Return to subject
- ✅ Topic shows next review date
- ✅ After 3+ good reviews → purple (mastered)

### Unlock Engine
- ✅ Create topic A (no dependencies) → available
- ✅ Create topic B (depends on A) → locked
- ✅ Complete A → A becomes reviewing, B unlocks (available)
- ✅ Complete B → B becomes reviewing
- ✅ Review A with quality ≥4 three times → A mastered
- ✅ Verify all works in graph visualization

---

## 🎨 Visual Indicators

**Status Colors (everywhere):**
- 🔒 Locked: Gray (#6b7280)
- 🔵 Available: Blue (#3b82f6) - Ready to learn!
- 🟡 Learning: Yellow (#eab308) - In progress
- 🟢 Reviewing: Green (#22c55e) - Spaced repetition
- 🟣 Mastered: Purple (#a855f7) - Completed!

**Badges:**
- Status badges on all topic cards
- Due indicator (red "🔴 Due now")
- Next review date

**Buttons:**
- **Learn** (blue accent) - available/learning topics
- **Review** (outlined) - reviewing topics
- **Review** (neon glow, red) - overdue topics

**Graph:**
- Color-coded nodes by status
- Neon glow on active/mastered nodes
- Animated edges showing dependencies
- Minimap shows full structure

---

## 📈 What's Working End-to-End

1. ✅ User signs in
2. ✅ Creates subject
3. ✅ Generates AI curriculum OR manually adds topics
4. ✅ AI creates topics with dependencies
5. ✅ Unlock engine makes root topics available
6. ✅ User clicks "Learn" on available topic
7. ✅ Completes learning
8. ✅ Topic enters reviewing status
9. ✅ Dependent topics unlock
10. ✅ User reviews topic after 1 day
11. ✅ SM-2 calculates next interval
12. ✅ After 3+ good reviews → mastered
13. ✅ All updates reflect in graph real-time
14. ✅ Study logs track everything
15. ✅ Next review dates visible everywhere

---

## 🔮 What's Next: Phase 3 (Analytics & Recommendations)

Phase 3 will add:
- Analytics dashboard with charts
- Study time heatmap (daily/weekly)
- Weak topics analysis
- Review schedule calendar
- Recommendations engine
- "Next 3 to study" widget
- Progress donut charts
- Streak tracking

Phase 4 will add:
- Community sharing
- Public subject browsing
- Subject cloning
- Heavy landing page animations
- Social features

---

## 🎉 Phase 2 = COMPLETE!

You now have a **fully functional spaced repetition learning platform** with:
- ✅ AI curriculum generation
- ✅ SM-2 algorithm
- ✅ Learning workflow
- ✅ Review workflow
- ✅ Progressive unlocking
- ✅ Real-time updates
- ✅ Beautiful UI with status indicators

**The core learning loop is complete and working!** 🚀

Users can now:
1. Generate AI curricula
2. Learn topics sequentially
3. Review with spaced repetition
4. Master topics over time
5. Track progress visually

Ready for Phase 3 when you are! 📊
