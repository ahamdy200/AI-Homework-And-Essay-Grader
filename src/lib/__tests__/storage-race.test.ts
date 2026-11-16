import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import {
  updateWorkbenchData,
  readWorkbenchData,
  _drainWriteQueue,
} from "../storage";

describe("updateWorkbenchData race-safety", () => {
  after(() => _drainWriteQueue());

  it("concurrent updates do not lose writes", async () => {
    // Fire two concurrent updates that each push one submission
    const makeSubmission = (name: string) =>
      updateWorkbenchData((current) => ({
        ...current,
        submissions: [
          ...current.submissions,
          {
            id: `race-test-${name}`,
            assignmentId: "a1",
            studentName: name,
            studentIdCode: "",
            submittedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            inputText: "",
            transcribedText: "",
            detectedTitle: "",
            wordCount: 0,
            attachments: [],
            rubricCriteria: [],
            criterionScores: [],
            aiPercentage: 0,
            aiLetterGrade: "F",
            teacherPercentageOverride: null,
            teacherLetterGradeOverride: null,
            summaryFeedback: "",
            teacherFinalComment: "",
            strengths: [],
            priorityNextSteps: [],
            annotations: [],
            revisedDraft: "",
            status: "ai_graded" as const,
            tone: "balanced" as const,
            thinkingLevel: "medium" as const,
            modelUsed: "test",
            interactionId: null,
            lastInteractionId: null,
            usageTokens: 0,
            followUps: [],
            questionResults: [],
          },
        ],
      }));

    await Promise.all([makeSubmission("Alice"), makeSubmission("Bob")]);

    const final = await readWorkbenchData();
    const names = final.submissions.map((s) => s.studentName);
    assert.ok(names.includes("Alice"), "Alice's submission must survive");
    assert.ok(names.includes("Bob"), "Bob's submission must survive");

    // Cleanup: remove test submissions
    await updateWorkbenchData((d) => ({
      ...d,
      submissions: d.submissions.filter(
        (s) => !s.id.startsWith("race-test-")
      ),
    }));
  });
});
