import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { alignAnnotationsToText } from "../annotations";
import {
  calculateLetterGrade,
  computeCriterionTotals,
  countWords,
  getEffectiveSubmissionGrade,
} from "../scoring";
import { exportSubmissionsToCsv, formatStudentFeedbackMarkdown } from "../export";
import { parseUploadedFiles, UploadValidationError } from "../uploads";
import {
  createInteractionWithFallback,
  formatGeminiError,
  isTransientCapacityError,
  MissingApiKeyError,
} from "../gemini";
import {
  applyMcqResultsToCriteria,
  parseAnswerKeyText,
  parseStudentMcqResponses,
  reconcileQuestionResults,
  summarizeQuestionResults,
} from "../mcq";
import type { AnnotationItem, Assignment, Submission } from "../types";

function makeAnnotation(
  id: string,
  quote: string,
  contextBefore = ""
): AnnotationItem {
  return {
    id,
    quote,
    contextBefore,
    category: "grammar",
    severity: "must_fix",
    suggestedRevision: "corrected",
    explanation: "Test explanation",
    status: "pending",
    teacherNote: "",
  };
}

describe("alignAnnotationsToText", () => {
  it("aligns multiple non-overlapping quotes accurately", () => {
    const text = "Every student carry a phone. Their rules is necessary.";
    const annotations = [
      makeAnnotation("a1", "carry", "Every student "),
      makeAnnotation("a2", "is necessary", "Their rules "),
    ];

    const result = alignAnnotationsToText(text, annotations);
    assert.equal(result.alignedSpans.length, 2);
    assert.equal(result.unanchored.length, 0);
    assert.equal(result.alignedSpans[0].start, text.indexOf("carry"));
    assert.equal(result.alignedSpans[1].start, text.indexOf("is necessary"));

    const reconstructed = result.segments.map((s) => s.text).join("");
    assert.equal(reconstructed, text);
  });

  it("uses contextBefore to disambiguate repeated words", () => {
    const text = "They went their to get their books.";
    const annotations = [
      makeAnnotation("a1", "their", "went "),
    ];

    const result = alignAnnotationsToText(text, annotations);
    assert.equal(result.alignedSpans.length, 1);
    assert.equal(result.alignedSpans[0].start, text.indexOf("their"));
  });

  it("places missing quotes into unanchored instead of corrupting text", () => {
    const text = "Simple student paragraph.";
    const annotations = [makeAnnotation("a1", "nonexistent phrase")];

    const result = alignAnnotationsToText(text, annotations);
    assert.equal(result.alignedSpans.length, 0);
    assert.equal(result.unanchored.length, 1);
    assert.equal(result.segments.map((s) => s.text).join(""), text);
  });
});

describe("scoring helpers", () => {
  it("computes letter grades and criterion totals with teacher overrides", () => {
    assert.equal(calculateLetterGrade(95), "A");
    assert.equal(calculateLetterGrade(88), "B+");
    assert.equal(calculateLetterGrade(59), "F");

    const totals = computeCriterionTotals([
      {
        criterionId: "c1",
        criterionName: "Thesis",
        score: 20,
        maxScore: 25,
        teacherScore: 23,
        rationale: "Good",
      },
      {
        criterionId: "c2",
        criterionName: "Grammar",
        score: 20,
        maxScore: 25,
        teacherScore: null,
        rationale: "Solid",
      },
    ]);

    assert.equal(totals.earned, 43);
    assert.equal(totals.max, 50);
    assert.equal(totals.percentage, 86);
    assert.equal(totals.letterGrade, "B");
    assert.equal(countWords("Hello   world from school"), 4);
  });
});

describe("export helpers", () => {
  const assignment: Assignment = {
    id: "a1",
    title: "Persuasive Essay",
    prompt: "Write a persuasive essay.",
    gradeLevel: "Grade 8",
    rubricName: "Middle School",
    criteria: [],
    modelAnswerText: "Sample model answer",
    modelAnswerAttachments: [],
    createdAt: "2026-11-11T00:00:00.000Z",
  };

  const submission: Submission = {
    id: "sub-1",
    assignmentId: "a1",
    studentName: "Maya Lin",
    studentIdCode: "ENG8-01",
    submittedAt: "2026-11-11T00:00:00.000Z",
    updatedAt: "2026-11-11T00:00:00.000Z",
    inputText: "Sample text",
    transcribedText: "Sample text",
    detectedTitle: "Smartphones, Essay",
    wordCount: 2,
    attachments: [],
    rubricCriteria: [],
    criterionScores: [
      {
        criterionId: "c1",
        criterionName: "Thesis",
        score: 22,
        maxScore: 25,
        teacherScore: null,
        rationale: "Clear claim.",
      },
    ],
    aiPercentage: 88,
    aiLetterGrade: "B+",
    teacherPercentageOverride: null,
    teacherLetterGradeOverride: null,
    summaryFeedback: "Great work!",
    teacherFinalComment: "Great work, Maya!",
    strengths: ["Clear claim"],
    priorityNextSteps: ["Proofread apostrophes"],
    annotations: [],
    revisedDraft: "Sample text.",
    status: "reviewed",
    tone: "balanced",
    thinkingLevel: "medium",
    modelUsed: "gemini-3.8-flash",
    interactionId: null,
    lastInteractionId: null,
    usageTokens: 100,
    followUps: [],
  };

  it("formats markdown and escapes CSV commas cleanly", () => {
    const effective = getEffectiveSubmissionGrade(submission);
    assert.equal(effective.percentage, 88);

    const md = formatStudentFeedbackMarkdown(submission, assignment);
    assert.ok(md.includes("Maya Lin"));
    assert.ok(md.includes("Great work, Maya!"));
    assert.ok(md.includes("Mr. Ahmed Hamdy"));
    assert.ok(md.includes("Royal College International School"));

    const csv = exportSubmissionsToCsv([submission], [assignment]);
    assert.ok(csv.includes('"Smartphones, Essay"'));
    assert.ok(csv.includes("88%"));
  });
});

describe("parseUploadedFiles", () => {
  it("extracts text files and keeps image/PDF binary attachments", async () => {
    const txtFile = new File(["1. Answer A\n2. Answer B"], "key.txt", {
      type: "text/plain",
    });
    const imgFile = new File([new Uint8Array([137, 80, 78, 71])], "key.png", {
      type: "image/png",
    });

    const parsed = await parseUploadedFiles([txtFile, imgFile], "Header note");
    assert.ok(parsed.text.includes("Header note"));
    assert.ok(parsed.text.includes("1. Answer A"));
    assert.equal(parsed.mediaFiles.length, 1);
    assert.equal(parsed.mediaFiles[0].mimeType, "image/png");
  });

  it("rejects unsupported file extensions", async () => {
    const badFile = new File(["binary"], "malware.exe", {
      type: "application/x-msdownload",
    });
    await assert.rejects(
      () => parseUploadedFiles([badFile]),
      UploadValidationError
    );
  });
});

describe("formatGeminiError", () => {
  it("parses Interactions SDK 402 prepay credit exhaustion with Free Tier guidance", () => {
    const err = Object.assign(
      new Error('402 API error occurred: {"httpMeta":{"response":{},"request":{}}}'),
      {
        statusCode: 402,
        body: JSON.stringify([
          {
            error: {
              code: 402,
              message: "Your prepayment credits are depleted.",
              status: "RESOURCE_EXHAUSTED",
            },
          },
        ]),
      }
    );

    const formatted = formatGeminiError(err);
    assert.equal(formatted.httpStatus, 402);
    assert.match(formatted.message, /prepayment credits are depleted/i);
    assert.match(formatted.message, /Free Tier/i);
  });

  it("parses 401 invalid API key and 429 Free Tier rate limit errors", () => {
    const err401 = Object.assign(
      new Error('401 API error occurred: {"httpMeta":{}}'),
      {
        statusCode: 401,
        body: JSON.stringify({
          error: {
            code: 401,
            message: "API key not valid. Please pass a valid API key.",
            status: "UNAUTHENTICATED",
          },
        }),
      }
    );
    const res401 = formatGeminiError(err401);
    assert.equal(res401.httpStatus, 401);
    assert.match(res401.message, /API key not valid/i);

    const err429 = Object.assign(new Error("429"), {
      statusCode: 429,
      body: JSON.stringify({
        error: {
          code: 429,
          message: "Quota exceeded for requests per minute.",
          status: "RESOURCE_EXHAUSTED",
        },
      }),
    });
    const res429 = formatGeminiError(err429);
    assert.equal(res429.httpStatus, 429);
    assert.match(res429.message, /Quota exceeded/i);
    assert.match(res429.message, /Free Tier RPM\/RPD limits/i);
  });

  it("returns 400 for MissingApiKeyError", () => {
    const res = formatGeminiError(new MissingApiKeyError());
    assert.equal(res.httpStatus, 400);
    assert.match(res.message, /GEMINI_API_KEY/);
  });
});

describe("mixed MCQ & essay answer key parsing and reconciliation", () => {
  it("parses inline MCQ formats like '1.c 2.B and 3. D' alongside Q5 essay", () => {
    const parsed = parseAnswerKeyText(
      "1.c 2.B and 3. D\n4. a (2 pts)\n5. Essay: Explain the narrator's apology with one detail."
    );
    assert.deepEqual(parsed.mcqKeys, [
      { questionNumber: "1", expectedAnswer: "C", maxPoints: 1 },
      { questionNumber: "2", expectedAnswer: "B", maxPoints: 1 },
      { questionNumber: "3", expectedAnswer: "D", maxPoints: 1 },
      { questionNumber: "4", expectedAnswer: "A", maxPoints: 2 },
    ]);
    assert.equal(parsed.openQuestions.length, 1);
    assert.equal(parsed.openQuestions[0].questionNumber, "5");
    assert.match(parsed.openQuestions[0].label, /Essay: Explain/);
  });

  it("does not misclassify ordinary prose answers starting with A or I as MCQs", () => {
    const parsed = parseAnswerKeyText(
      "1. A student returned the wallet because he remembered losing his bike.\n2. I think honesty requires courage."
    );
    assert.equal(parsed.mcqKeys.length, 0);
    assert.equal(parsed.openQuestions.length, 2);
  });

  it("reconciles student MCQ responses case-insensitively and syncs mcq-objective rubric points", () => {
    const modelKey = "1.c 2.B and 3. D\n5. Essay: Discuss honesty.";
    const studentText = "1. C\n2. b\n3. A\n\n5. Honesty builds trust in friendships.";

    const studentMap = parseStudentMcqResponses(studentText);
    assert.equal(studentMap.get("1"), "C");
    assert.equal(studentMap.get("2"), "B");
    assert.equal(studentMap.get("3"), "A");

    const results = reconcileQuestionResults({
      modelAnswerText: modelKey,
      studentText,
      rawResults: [
        {
          questionNumber: "1",
          questionType: "mcq",
          promptOrTopic: "Multiple Choice Q1",
          expectedAnswer: "c",
          studentAnswer: "C",
          status: "incorrect", // verify deterministic reconciliation overrides erroneous model status
          pointsEarned: 0,
          maxPoints: 1,
          explanation: "",
        },
        {
          questionNumber: "5",
          questionType: "essay",
          promptOrTopic: "Q5 Essay",
          expectedAnswer: "Explain honesty with evidence.",
          studentAnswer: "Honesty builds trust in friendships.",
          status: "partial",
          pointsEarned: 7,
          maxPoints: 10,
          explanation: "Good main idea; add a concrete detail.",
        },
      ],
    });

    // Q1=C (match), Q2=B (backfilled match), Q3=A vs D (backfilled mismatch), Q5=essay
    assert.equal(results.length, 4);
    assert.equal(results[0].status, "correct");
    assert.equal(results[1].questionNumber, "2");
    assert.equal(results[1].status, "correct");
    assert.equal(results[2].questionNumber, "3");
    assert.equal(results[2].status, "incorrect");
    assert.equal(results[3].questionNumber, "5");
    assert.equal(results[3].questionType, "essay");

    const summary = summarizeQuestionResults(results);
    assert.equal(summary.mcqCorrect, 2);
    assert.equal(summary.mcqTotal, 3);

    const synced = applyMcqResultsToCriteria(
      [
        {
          criterionId: "mcq-objective",
          criterionName: "Objective Questions (MCQs)",
          score: 0,
          maxScore: 30,
          teacherScore: null,
          rationale: "pending",
        },
        {
          criterionId: "essay-content",
          criterionName: "Essay Prompt & Evidence",
          score: 25,
          maxScore: 30,
          teacherScore: null,
          rationale: "Strong writing.",
        },
      ],
      results,
      "ai"
    );

    assert.equal(synced[0].score, 20); // 2/3 * 30 = 20
    assert.match(synced[0].rationale, /2\/3 correct/);
    assert.equal(synced[1].score, 25);
  });
});

describe("Gemini high-demand retry & fallback", () => {
  it("recognizes 503 high demand as transient while keeping 401/402 non-transient", () => {
    const busyErr = Object.assign(new Error("503"), {
      statusCode: 503,
      body: JSON.stringify({
        error: {
          code: 503,
          message:
            "gemini-3.8-flash is currently experiencing high demand, spikes in demand are usually temporary. Please try again later.",
          status: "UNAVAILABLE",
        },
      }),
    });
    assert.equal(isTransientCapacityError(busyErr), true);

    const authErr = Object.assign(new Error("401"), {
      statusCode: 401,
      body: JSON.stringify({ error: { code: 401, status: "UNAVAILABLE" } }),
    });
    assert.equal(isTransientCapacityError(authErr), false);
    assert.equal(isTransientCapacityError(new MissingApiKeyError()), false);
  });

  it("retries primary model once and falls back when 503 persists", async () => {
    const calledModels: string[] = [];
    const fakeAi = {
      interactions: {
        create: async (params: { model: string }) => {
          calledModels.push(params.model);
          if (params.model === "gemini-3.8-flash") {
            throw Object.assign(new Error("503"), {
              statusCode: 503,
              body: JSON.stringify({
                error: {
                  code: 503,
                  message: "gemini-3.8-flash is currently experiencing high demand",
                  status: "UNAVAILABLE",
                },
              }),
            });
          }
          return {
            id: "int-fallback-1",
            status: "completed",
            output_text: '{"ok":true}',
          };
        },
      },
    };

    const { interaction, modelUsed } = await createInteractionWithFallback(
      fakeAi as unknown as Parameters<typeof createInteractionWithFallback>[0],
      (model) => ({ model, input: "test" }),
      {
        models: ["gemini-3.8-flash", "gemini-3.6-flash", "gemini-3.5-flash-lite"],
        retryDelayMs: 0,
      }
    );

    assert.deepEqual(calledModels, [
      "gemini-3.8-flash",
      "gemini-3.8-flash",
      "gemini-3.6-flash",
    ]);
    assert.equal(modelUsed, "gemini-3.6-flash");
    assert.equal(interaction.output_text, '{"ok":true}');
  });
});
