import type { RubricPreset } from "./types";

export const RUBRIC_PRESETS: RubricPreset[] = [
  {
    id: "high-school-argumentative",
    name: "High School Argumentative / Analytical Essay",
    gradeLevel: "Grades 9–12",
    description:
      "Balanced 100-point rubric assessing thesis clarity, textual evidence, essay structure, style, and grammar conventions.",
    criteria: [
      {
        id: "thesis-focus",
        name: "Thesis & Focus",
        description:
          "Clear, arguable claim maintained consistently throughout the essay.",
        maxScore: 25,
      },
      {
        id: "evidence-analysis",
        name: "Evidence & Analysis",
        description:
          "Relevant examples or textual support explained with thoughtful reasoning.",
        maxScore: 25,
      },
      {
        id: "organization-flow",
        name: "Organization & Transitions",
        description:
          "Logical paragraph sequencing, topic sentences, and smooth transitions.",
        maxScore: 20,
      },
      {
        id: "grammar-mechanics",
        name: "Grammar, Spelling & Mechanics",
        description:
          "Sentence boundaries, verb tense consistency, punctuation, and spelling.",
        maxScore: 20,
      },
      {
        id: "vocabulary-voice",
        name: "Vocabulary & Academic Tone",
        description:
          "Precise word choice, varied sentence structure, and appropriate register.",
        maxScore: 10,
      },
    ],
  },
  {
    id: "middle-school-essay",
    name: "Middle School Paragraph & Essay Writing",
    gradeLevel: "Grades 6–8",
    description:
      "Structured 100-point rubric focused on clear topic sentences, supporting details, paragraph flow, and core mechanics.",
    criteria: [
      {
        id: "main-idea",
        name: "Main Idea & Topic Clarity",
        description:
          "Addresses the prompt directly with a clear central idea.",
        maxScore: 25,
      },
      {
        id: "supporting-details",
        name: "Supporting Details & Examples",
        description:
          "Uses specific facts, reasons, or examples to back up ideas.",
        maxScore: 25,
      },
      {
        id: "organization",
        name: "Paragraph Structure & Transitions",
        description:
          "Clear beginning, middle, and conclusion with linking words.",
        maxScore: 20,
      },
      {
        id: "conventions",
        name: "Grammar, Punctuation & Spelling",
        description:
          "Complete sentences (avoiding run-ons/fragments), capitalization, and spelling.",
        maxScore: 20,
      },
      {
        id: "word-choice",
        name: "Word Choice & Sentence Variety",
        description:
          "Descriptive, natural phrasing without unnecessary repetition.",
        maxScore: 10,
      },
    ],
  },
  {
    id: "grammar-homework-check",
    name: "English Grammar & Short-Answer Homework",
    gradeLevel: "Grades 6–12",
    description:
      "Targeted 50-point homework check for short responses, reading comprehension answers, and grammar drills.",
    criteria: [
      {
        id: "accuracy-comprehension",
        name: "Task Completion & Accuracy",
        description:
          "Answers all parts of the homework questions accurately and completely.",
        maxScore: 20,
      },
      {
        id: "sentence-grammar",
        name: "Sentence Structure & Grammar",
        description:
          "Subject-verb agreement, tense consistency, pronouns, and syntax.",
        maxScore: 15,
      },
      {
        id: "mechanics-spelling",
        name: "Spelling & Punctuation",
        description:
          "Proper capitalization, apostrophes, commas, and word spelling.",
        maxScore: 15,
      },
    ],
  },
  {
    id: "narrative-creative",
    name: "Narrative & Creative Writing",
    gradeLevel: "Grades 6–12",
    description:
      "100-point rubric evaluating storytelling arc, sensory detail, voice, pacing, and polished mechanics.",
    criteria: [
      {
        id: "story-arc",
        name: "Plot, Pacing & Narrative Focus",
        description:
          "Engaging opening, clear sequence of events, and satisfying resolution.",
        maxScore: 30,
      },
      {
        id: "imagery-voice",
        name: "Sensory Detail & Voice",
        description:
          "Vivid description, authentic character voice, and 'show, don't tell'.",
        maxScore: 30,
      },
      {
        id: "dialogue-flow",
        name: "Organization & Paragraphing",
        description:
          "Smooth scene transitions and clear paragraph breaks (including dialogue).",
        maxScore: 20,
      },
      {
        id: "mechanics",
        name: "Grammar, Dialogue Punctuation & Spelling",
        description:
          "Accurate quotation marks, verb tenses, and clean proofreading.",
        maxScore: 20,
      },
    ],
  },
  {
    id: "mixed-mcq-essay",
    name: "Mixed Quiz & Essay (MCQs + Writing)",
    gradeLevel: "Grades 6–12",
    description:
      "Auto-grades objective multiple-choice / short questions against an answer key alongside full essay evaluation.",
    criteria: [
      {
        id: "mcq-objective",
        name: "Objective Questions (MCQs)",
        description:
          "Accuracy on numbered multiple-choice or objective questions checked against the answer key.",
        maxScore: 40,
      },
      {
        id: "essay-content",
        name: "Essay Prompt & Evidence",
        description:
          "Clear response to the essay question supported with specific reasoning or textual details.",
        maxScore: 30,
      },
      {
        id: "essay-organization",
        name: "Essay Structure & Flow",
        description:
          "Focused paragraphing, clear topic sentences, and logical transitions.",
        maxScore: 15,
      },
      {
        id: "essay-mechanics",
        name: "Grammar, Usage & Mechanics",
        description:
          "Sentence clarity, verb tense consistency, capitalization, spelling, and punctuation.",
        maxScore: 15,
      },
    ],
  },
];

export interface SampleStudentEssay {
  id: string;
  label: string;
  studentName: string;
  studentIdCode: string;
  assignmentId: string;
  gradeLevel: string;
  suggestedTitle?: string;
  suggestedPrompt?: string;
  suggestedPresetId?: string;
  suggestedModelAnswer?: string;
  text: string;
}

export const SAMPLE_ESSAYS: SampleStudentEssay[] = [
  {
    id: "sample-smartphone-essay",
    label: "8th Grade: Smartphones in School (Mixed errors)",
    studentName: "Maya Lin",
    studentIdCode: "ENG8-014",
    assignmentId: "assign-persuasive-tech",
    gradeLevel: "Grade 8",
    text: `Should Students Have Smartphones in Middle School?

In todays world almost every middle school student carry a smartphone in their backpack. Some teachers think phones should be banned completely from school buildings, however I believe students should be allowed to keep phones in their lockers for emergencies and specific learning activities.

First of all, smartphones are very important for safety and communication after school. Many kids walk home or take the bus, and if a practice gets canceled or someone misses there bus they need a quick way to call their parents. Last winter my little brother waited outside for forty minutes because the school office phone line was busy. If he would have had his phone turned off in his locker he could of texted our mom right away after dismissal.

Second, teachers can use phones as helpful educational tools during class time. For example, in science class we used our phones to time experiments and take photos of leaf samples for our lab report. Of course, students shouldn't be texting friends or watching videos during a math lecture, thats why strict classroom rules is necessary.

In conclusion, banning phones totally ignores how families communicate today. When schools create clear boundaries like keeping devices silent in lockers until the final bell, students learn responsibility while staying safe. Therefore, schools should regulate smartphones instead of banning them.`,
  },
  {
    id: "sample-gatsby-analysis",
    label: "10th Grade: The Great Gatsby Symbolism",
    studentName: "Jordan Alvarez",
    studentIdCode: "ENG10-027",
    assignmentId: "assign-literary-analysis",
    gradeLevel: "Grade 10",
    text: `The Green Light as an Illusion of the American Dream

In F. Scott Fitzgerald's novel The Great Gatsby, the green light at the end of Daisy Buchanan's dock serves as one of the most powerful symbols in the book. At first glance, the light simply represents Gatsby's romantic longing for Daisy. However, Fitzgerald uses it to critique the wider American Dream, showing how chasing idealized wealth and status often leaves people trapped in the past.

Early in the story, Nick Carraway sees Gatsby stretching out his arms toward the "minute and far away" green light across the water. The color green evokes both money and hope, connecting Gatsby's love for Daisy directly to his obsession with social climbing. Because Gatsby believes wealth can erase his humble origins, he treats Daisy like a prize to be won rather than a real person. This makes his goal fragile from the start.

Later in the novel, when Gatsby finally reunites with Daisy, the narrator notes that the colossal significance of that light had vanished forever. Once the dream becomes real, it loses its magic because Daisy cannot live up to the fantasy Gatsby built over five years. In the closing pages, Nick compares the green light to the "green breast of the new world," suggesting that America itself promises endless renewal yet continually pulls dreamers backward. Through this evolving symbol, Fitzgerald warns that blind pursuit of status leads to disillusionment.`,
  },
  {
    id: "sample-homework-short",
    label: "7th Grade: Reading Response Homework",
    studentName: "Ethan Brooks",
    studentIdCode: "ENG7-009",
    assignmentId: "assign-persuasive-tech",
    gradeLevel: "Grade 7",
    text: `1. Why did the main character decide to return the lost wallet?
He returned the wallet because he remembered how bad he felt when he lost his bike key last summer, and he knew the owner probably needed their ID and money for groceries. Even though his friend told him to keep the twenty dollars, he choose to do the right thing.

2. Explain one lesson the story teaches about honesty.
The story teaches that honesty takes courage when nobody is watching. When the character gave back the wallet at the store counter the cashier thanked him and his dad was really proud of him too which made him feel way better than keeping the cash.`,
  },
  {
    id: "sample-mixed-mcq-essay",
    label: "Mixed Quiz + Essay: MCQs (1–4) & Essay (Q5)",
    studentName: "Maya Lin",
    studentIdCode: "ENG9-018",
    assignmentId: "assign-mixed-quiz",
    gradeLevel: "Grades 6–12",
    suggestedTitle: "Reading Quiz & Short Essay (Mixed Format)",
    suggestedPrompt:
      "Answer multiple-choice questions 1–4 by letter, then write a paragraph essay for Question 5 explaining how the narrator's apology changes the conflict.",
    suggestedPresetId: "mixed-mcq-essay",
    suggestedModelAnswer: `1. c
2. B
3. D
4. A
5. Essay: Explain how the narrator's apology changes the conflict in Chapter 4. Include at least one concrete detail and explain the theme of accountability.`,
    text: `1. c
2. B
3. A
4. a

5. Essay: In Chapter 4, the narrator finally admits to Marcus that he hid the science fair notebook out of jealousy. Before the apology, both boys refused to speak and the whole lab group was falling apart. When the narrator apologizes face-to-face and offers to stay after school to help rebuild the poster, Marcus realizes he is sincere. This shows that taking responsibility without making excuses can repair trust even when pride gets in the way.`,
  },
];
