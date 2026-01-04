🚀 Learnify

AI-Powered Adaptive Learning & Smart Study Orchestrator

Learnify is an intelligent study platform that builds personalized learning roadmaps using Knowledge Graphs, Spaced Repetition (SM-2), and AI. It ensures students always know what to study next by managing topic dependencies and tracking retention over time.

📚 Table of Contents

Overview

Key Features

Tech Stack

Getting Started

Prerequisites

Installation

Environment Variables

Database Setup

Running the App

Mobile Development

Project Structure

Contributing

🎯 Overview

Learnify replaces static study lists with dynamic Knowledge Graphs. Instead of a linear list, topics are organized as a Directed Acyclic Graph (DAG). The system uses an Unlocking Engine to automatically make new topics available only when prerequisites are mastered.

Combined with the SM-2 Spaced Repetition Algorithm, Learnify optimizes review schedules to maximize long-term retention.

✨ Key Features

The platform is built around 8 core features:

Subject & Topic Management: Create subjects and manage topics manually or via AI.

Knowledge Graph & Unlocking Engine: A dependency system that unlocks topics based on mastery of prerequisites.

Learning & Review System (SM-2): Adaptive study sessions using the SuperMemo-2 algorithm for optimal retention.

AI Graph Generation: Automatically generates structured study roadmaps (DAGs) from a simple subject name using OpenRouter.

Knowledge Graph Visualizer: Interactive node-based graph visualization using React Flow.

Dashboard & Recommendation Widget: Smart widgets that suggest the best "next step" (Review vs. Learn New).

Analytics System: Visual insights into study time, weak topics, and subject progress.

Community Sharing: Share learning roadmaps publicly and clone subjects from the community.

🛠 Tech Stack

Frontend & Mobile

Framework: Next.js 15 (App Router)

Styling: Tailwind CSS, Shadcn UI

Animations: Framer Motion

Visualization: React Flow, Mermaid

Mobile: Capacitor (Android)

Backend & Data

Database: Supabase (PostgreSQL)

Auth: Supabase Auth

Realtime: Supabase Realtime (for live graph updates)

Storage: Supabase Storage

AI & Logic

AI Models: OpenRouter API

Algorithms: Custom DAG Unlocking Engine, SM-2 Spaced Repetition

🚀 Getting Started

Prerequisites

Node.js 18+ (v22 recommended)

NPM, Yarn, or PNPM

A Supabase account

An OpenRouter API key

Installation

Clone the repository

git clone [https://github.com/yourusername/learnify.git](https://github.com/yourusername/learnify.git)
cd learnify


Install dependencies

yarn install
# or
npm install


Environment Variables

Create a .env.local file in the root directory and add the following keys:

NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
OPENROUTER_API_KEY=your_openrouter_api_key


Database Setup

Create a new project in Supabase.

Run the SQL migration scripts located in migrations/ or copy the full schema from docs/Learnify DB Schema.md.

Enable Realtime in your Supabase dashboard for the topics and topic_dependencies tables to ensure the graph updates live.

🏃‍♂️ Running the App

Development Server

yarn dev
# or
npm run dev


Open http://localhost:3000 to view it in the browser.

Production Build

yarn build
yarn start


📱 Mobile Development

Learnify uses Capacitor to run as a native Android app.

Sync with Android project

npx cap sync android


Run on Android Device/Emulator

yarn android:dev
# or
npx cap open android


📂 Project Structure

├── app/                  # Next.js App Router pages
│   ├── api/              # Serverless endpoints (AI generation, etc.)
│   ├── dashboard/        # User dashboard & stats
│   ├── learn/            # Learning mode pages
│   └── subjects/         # Subject management
├── components/           # Reusable UI components
│   ├── graph/            # Visualizer components
│   └── ui/               # Shadcn UI primitives
├── lib/                  # Core Business Logic
│   ├── graph/            # Unlocking engine & recommendations
│   ├── sm2/              # Spaced repetition algorithm
│   └── supabase/         # DB clients & realtime
├── public/               # Static assets
└── docs/                 # Developer documentation


🤝 Contributing

Fork the repository.

Create a feature branch (git checkout -b feature/amazing-feature).

Commit your changes (git commit -m 'Add some amazing feature').

Push to the branch (git push origin feature/amazing-feature).

Open a Pull Request.

📄 License

This project is private.