# RedPen Studio — English Homework & Essay Grading Workbench

A teacher-first grading workbench for English essays, reading responses, and handwritten homework, powered by **Gemini 3.8 Flash** (`gemini-3.8-flash`) via the `@google/genai` Interactions API.

> **Model note:** `gemini-3-pro-preview` was shut down on March 9, 2026, and `gemini-3-flash-preview` has been superseded. This workbench uses `gemini-3.8-flash`, the current fast, multimodal Gemini Flash model.

## Features

- **Multimodal Student Submissions**: Paste typed essays/homework or upload **photos of handwritten work** (PNG, JPG, WEBP, HEIC) and **PDF packets**. Gemini transcribes handwritten work verbatim and evaluates it directly.
- **Mixed MCQ & Essay Grading**: Upload an answer key with numbered multiple-choice answers alongside open-ended essay prompts. Gemini auto-scores MCQs deterministically against the key and grades essays with the rubric, all in one pass.
- **Structured Rubric Grading**: Built-in presets for Middle School Essays, High School Argumentative/Analytical Essays, Grammar Homework Checks, Mixed MCQ + Essay Quizzes, and Narrative Writing—plus a **Custom Assignment & Rubric Builder**.
- **Interactive Red-Pen Annotations**: Highlights grammar, spelling, punctuation, clarity, vocabulary, structure, and praise inline on the paper. Teachers can **confirm**, **dismiss**, or **add notes** to every markup.
- **Full Teacher Override Control**: Edit individual rubric criterion scores, override the overall percentage, customize the final teacher comment, and track status (`AI Graded` → `Reviewed` → `Finalized`).
- **Stateful Teacher Co-Pilot**: Ask follow-up questions using Gemini's `previous_interaction_id` (e.g., draft parent summaries, generate targeted grammar practice exercises, or adapt feedback for struggling readers).
- **Classroom Exports**: Copy Markdown feedback, print/save clean PDF student feedback sheets, or export gradebook CSVs.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy `.env.example` to `.env.local` and set your Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey):
   ```env
   GEMINI_API_KEY=your_gemini_api_key_here
   ```
   *(Alternatively, you can click **Set API Key** in the top navigation bar to supply a session-only key in your browser.)*
3. Start the development server:
   ```bash
   npm run dev
   ```
4. Open [http://localhost:3000](http://localhost:3000).

## Scripts

- `npm run dev` — Start Next.js dev server
- `npm run build` — Production build
- `npm run start` — Start production server
- `npm run typecheck` — TypeScript check (`tsc --noEmit`)
- `npm test` — Run unit tests (`node --test`)
