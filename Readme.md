# **🚀 Learnify**

**AI-Powered Adaptive Learning & Smart Study Orchestrator**

Learnify is an intelligent study platform that builds personalized learning roadmaps using Knowledge Graphs, Spaced Repetition (SM-2), and AI. It ensures students always know *what* to study next by managing topic dependencies and tracking retention over time

## **📚 Table of Contents**

* [Overview](https://www.google.com/search?q=%23-overview)  
* [Key Features](https://www.google.com/search?q=%23-key-features)  
* [Tech Stack](https://www.google.com/search?q=%23-tech-stack)  
* [Getting Started](https://www.google.com/search?q=%23-getting-started)  
  * [Prerequisites](https://www.google.com/search?q=%23prerequisites)  
  * [Installation](https://www.google.com/search?q=%23installation)  
  * [Environment Variables](https://www.google.com/search?q=%23environment-variables)  
  * [Database Setup](https://www.google.com/search?q=%23database-setup)  
* [Running the App](https://www.google.com/search?q=%23-running-the-app)  
* [Mobile Development](https://www.google.com/search?q=%23-mobile-development)  
* [Project Structure](https://www.google.com/search?q=%23-project-structure)  
* [Contributing](https://www.google.com/search?q=%23-contributing)

## **🎯 Overview**

Learnify replaces static study lists with dynamic **Knowledge Graphs**. Instead of a linear list, topics are organized as a Directed Acyclic Graph (DAG). The system uses an **Unlocking Engine** to automatically make new topics available only when prerequisites are mastered.

Combined with the **SM-2 Spaced Repetition Algorithm**, Learnify optimizes review schedules to maximize long-term retention.

## **✨ Key Features**

The platform is built around 8 core features:

1. **Subject & Topic Management**: Create subjects and manage topics manually or via AI.  
2. **Knowledge Graph & Unlocking Engine**: A dependency system that unlocks topics based on mastery of prerequisites.  
3. **Learning & Review System (SM-2)**: Adaptive study sessions using the SuperMemo-2 algorithm for optimal retention.  
4. **AI Graph Generation**: Automatically generates structured study roadmaps (DAGs) from a simple subject name using OpenRouter.  
5. **Knowledge Graph Visualizer**: Interactive node-based graph visualization using React Flow.  
6. **Dashboard & Recommendation Widget**: Smart widgets that suggest the best "next step" (Review vs. Learn New).  
7. **Analytics System**: Visual insights into study time, weak topics, and subject progress.  
8. **Community Sharing**: Share learning roadmaps publicly and clone subjects from the community.

## **🛠 Tech Stack**

**Frontend & Mobile**

* **Framework**: [Next.js 15](https://nextjs.org/) (App Router)  
* **Styling**: Tailwind CSS, Shadcn UI  
* **Animations**: Framer Motion  
* **Visualization**: React Flow, Mermaid  
* **Mobile**: [Capacitor](https://capacitorjs.com/) (Android)

**Backend & Data**

* **Database**: Supabase (PostgreSQL)  
* **Auth**: Supabase Auth  
* **Realtime**: Supabase Realtime (for live graph updates)  
* **Storage**: Supabase Storage

**AI & Logic**

* **AI Models**: OpenRouter API  
* **Algorithms**: Custom DAG Unlocking Engine, SM-2 Spaced Repetition

## **🚀 Getting Started**

### **Prerequisites**

* Node.js 18+ (v22 recommended)  
* NPM, Yarn, or PNPM  
* A [Supabase](https://supabase.com/) account  
* An [OpenRouter](https://openrouter.ai/) API key

### **Installation**

1. **Clone the repository**  
   git clone \[https://github.com/yourusername/learnify.git\](https://github.com/yourusername/learnify.git)  
   cd learnify

2. **Install dependencies**  
   yarn install  
   \# or  
   npm install

### **Environment Variables**

Create a .env.local file in the root directory and add the following keys:

NEXT\_PUBLIC\_SUPABASE\_URL=your\_supabase\_project\_url  
NEXT\_PUBLIC\_SUPABASE\_ANON\_KEY=your\_supabase\_anon\_key  
SUPABASE\_SERVICE\_ROLE\_KEY=your\_supabase\_service\_role\_key  
OPENROUTER\_API\_KEY=your\_openrouter\_api\_key

### **Database Setup**

1. Create a new project in Supabase.  
2. Run the SQL migration scripts located in migrations/ or copy the full schema from docs/Learnify DB Schema.md.  
3. **Enable Realtime** in your Supabase dashboard for the topics and topic\_dependencies tables to ensure the graph updates live.

## **🏃‍♂️ Running the App**

**Development Server**

yarn dev  
\# or  
npm run dev

Open [http://localhost:3000](https://www.google.com/search?q=http://localhost:3000) to view it in the browser.

**Production Build**

yarn build  
yarn start

## **📱 Mobile Development**

Learnify uses **Capacitor** to run as a native Android app.

**Sync with Android project**

npx cap sync android

**Run on Android Device/Emulator**

yarn android:dev  
\# or  
npx cap open android

## **📂 Project Structure**

├── app/                  \# Next.js App Router pages  
│   ├── api/              \# Serverless endpoints (AI generation, etc.)  
│   ├── dashboard/        \# User dashboard & stats  
│   ├── learn/            \# Learning mode pages  
│   └── subjects/         \# Subject management  
├── components/           \# Reusable UI components  
│   ├── graph/            \# Visualizer components  
│   └── ui/               \# Shadcn UI primitives  
├── lib/                  \# Core Business Logic  
│   ├── graph/            \# Unlocking engine & recommendations  
│   ├── sm2/              \# Spaced repetition algorithm  
│   └── supabase/         \# DB clients & realtime  
├── public/               \# Static assets  
└── docs/                 \# Developer documentation

## **🤝 Contributing**

1. Fork the repository.  
2. Create a feature branch (git checkout \-b feature/amazing-feature).  
3. Commit your changes (git commit \-m 'Add some amazing feature').  
4. Push to the branch (git push origin feature/amazing-feature).  
5. Open a Pull Request.

## **📄 License**

This project is private.