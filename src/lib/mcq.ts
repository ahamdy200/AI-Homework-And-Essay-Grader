import { clampScore } from "./scoring";
import type { CriterionScore, QuestionResult } from "./types";

export interface ParsedMcqKeyItem {
  questionNumber: string;
  expectedAnswer: string;
  maxPoints: number;
}

export interface ParsedOpenQuestionItem {
  questionNumber: string;
  label: string;
  maxPoints?: number;
}

export interface ParsedAnswerKey {
  mcqKeys: ParsedMcqKeyItem[];
  openQuestions: ParsedOpenQuestionItem[];
}

export interface QuestionSummary {
  mcqTotal: number;
  mcqCorrect: number;
  mcqEarned: number;
  mcqMax: number;
  openTotal: number;
  openEarned: number;
  openMax: number;
  totalEarned: number;
  totalMax: number;
}

function normalizeChoiceToken(raw: string): string {
  const cleaned = raw.trim().replace(/^[([]|[)\]]$/g, "").trim();
  const upper = cleaned.toUpperCase();
  if (upper === "TRUE") return "True";
  if (upper === "FALSE") return "False";
  return upper;
}

function extractTrailingPoints(text: string): {
  stripped: string;
  points?: number;
} {
  const match = text.match(
    /\((\d+(?:\.\d+)?)\s*(?:pts?|points?|marks?)\)/i
  );
  if (!match) {
    return { stripped: text.trim() };
  }
  const points = Number(match[1]);
  const stripped = text.replace(match[0], "").trim();
  return {
    stripped,
    points: Number.isFinite(points) && points > 0 ? points : undefined,
  };
}

function cleanSegmentBeforeNextMarker(segment: string): string {
  return segment
    .replace(/(?:\s*[,;]\s*|\s+(?:and|&)\s*)+$/i, "")
    .trim();
}

function tryParseMcqValue(segment: string): {
  choice: string;
  points?: number;
} | null {
  const cleaned = cleanSegmentBeforeNextMarker(segment);
  const { stripped, points } = extractTrailingPoints(cleaned);

  // Allow patterns like "c", "(C)", "[b]", "C.", "True", "False"
  // Reject prose sentences like "A boy went home" or "I believe..."
  const singleLetterMatch = stripped.match(
    /^[([\s]*([A-Fa-f])[)\].:,\s]*$/
  );
  if (singleLetterMatch) {
    return {
      choice: normalizeChoiceToken(singleLetterMatch[1]),
      points,
    };
  }

  const tfMatch = stripped.match(/^[([\s]*(True|False)[)\].:,\s]*$/i);
  if (tfMatch) {
    return {
      choice: normalizeChoiceToken(tfMatch[1]),
      points,
    };
  }

  return null;
}

function findNumberedSegments(text: string): Array<{
  questionNumber: string;
  body: string;
}> {
  if (!text.trim()) return [];

  // Match question markers like "1.c", "1. C", "2) B", "Q3: D", "question 5:"
  const markerRegex =
    /(?:^|[\s,;])(?:question\s+(?:number\s+|#\s*)?|q\.?\s*)?(\d{1,3})\s*(?:[.):\-–]|(?=[A-Fa-f](?:[\s,;.)]|$)))/gi;

  const matches: Array<{
    questionNumber: string;
    contentStart: number;
    markerStart: number;
  }> = [];

  for (const m of text.matchAll(markerRegex)) {
    const full = m[0];
    const qNum = m[1];
    const startIdx = m.index ?? 0;
    const leadingWhitespaceMatch = full.match(/^[\s,;]+/);
    const markerStart =
      startIdx + (leadingWhitespaceMatch ? leadingWhitespaceMatch[0].length : 0);
    const contentStart = startIdx + full.length;

    // Avoid decimal numbers like "3.5" by checking char before marker isn't "."
    if (markerStart > 0 && text[markerStart - 1] === ".") continue;

    matches.push({
      questionNumber: qNum,
      contentStart,
      markerStart,
    });
  }

  const segments: Array<{ questionNumber: string; body: string }> = [];
  for (let i = 0; i < matches.length; i++) {
    const curr = matches[i];
    const nextStart =
      i + 1 < matches.length ? matches[i + 1].markerStart : text.length;
    const rawBody = text.slice(curr.contentStart, nextStart).trim();
    segments.push({
      questionNumber: curr.questionNumber,
      body: rawBody,
    });
  }

  return segments;
}

/**
 * Parses mixed Teacher Answer Keys such as:
 *   "1.c 2.B and 3. D"
 *   "5. Essay: Describe the main conflict (10 pts)"
 */
export function parseAnswerKeyText(text: string): ParsedAnswerKey {
  const segments = findNumberedSegments(text);
  const mcqMap = new Map<string, ParsedMcqKeyItem>();
  const openMap = new Map<string, ParsedOpenQuestionItem>();

  for (const seg of segments) {
    // Handle case where first line is MCQ and second line starts prose for something else
    const firstLine = seg.body.split(/\r?\n/)[0] ?? seg.body;
    const maybeInlineMcq = tryParseMcqValue(seg.body);
    const maybeFirstLineMcq = maybeInlineMcq ? null : tryParseMcqValue(firstLine);
    const mcqParsed = maybeInlineMcq || maybeFirstLineMcq;

    if (mcqParsed && seg.body.split(/\r?\n/).length === 1) {
      mcqMap.set(seg.questionNumber, {
        questionNumber: seg.questionNumber,
        expectedAnswer: mcqParsed.choice,
        maxPoints: mcqParsed.points ?? 1,
      });
      continue;
    }

    if (mcqParsed && maybeFirstLineMcq && seg.body.split(/\r?\n/).length > 1) {
      const restLines = seg.body.split(/\r?\n/).slice(1).join(" ").trim();
      if (!restLines) {
        mcqMap.set(seg.questionNumber, {
          questionNumber: seg.questionNumber,
          expectedAnswer: mcqParsed.choice,
          maxPoints: mcqParsed.points ?? 1,
        });
        continue;
      }
    }

    // Also handle "3. D — explanation note" where only a dash explanation follows a choice letter
    const dashExplainMatch = seg.body.match(
      /^([A-Fa-f])\s*(?:\((\d+(?:\.\d+)?)\s*(?:pts?|points?|marks?)?\))?\s*[-–—]\s+(.+)$/i
    );
    if (dashExplainMatch) {
      const pts = dashExplainMatch[2] ? Number(dashExplainMatch[2]) : 1;
      mcqMap.set(seg.questionNumber, {
        questionNumber: seg.questionNumber,
        expectedAnswer: normalizeChoiceToken(dashExplainMatch[1]),
        maxPoints: Number.isFinite(pts) && pts > 0 ? pts : 1,
      });
      continue;
    }

    const cleanLabel = cleanSegmentBeforeNextMarker(seg.body);
    if (cleanLabel) {
      const { stripped, points } = extractTrailingPoints(cleanLabel);
      const compact = stripped.replace(/\s+/g, " ").trim();
      openMap.set(seg.questionNumber, {
        questionNumber: seg.questionNumber,
        label: compact.length > 72 ? `${compact.slice(0, 69)}...` : compact,
        maxPoints: points,
      });
    }
  }

  return {
    mcqKeys: Array.from(mcqMap.values()),
    openQuestions: Array.from(openMap.values()),
  };
}

/**
 * Extracts explicit typed MCQ student answers (e.g., "1.c", "2. A", "3) d").
 */
export function parseStudentMcqResponses(text: string): Map<string, string> {
  const answers = new Map<string, string>();
  const segments = findNumberedSegments(text);

  for (const seg of segments) {
    const firstLine = (seg.body.split(/\r?\n/)[0] ?? "").trim();
    const parsed =
      tryParseMcqValue(seg.body) ||
      (seg.body.split(/\r?\n/).length > 1 ? tryParseMcqValue(firstLine) : null);
    if (parsed) {
      answers.set(seg.questionNumber, parsed.choice);
    }
  }

  return answers;
}

function normalizeStudentChoiceFromModel(raw: string): string {
  const trimmed = raw.trim();
  if (
    !trimmed ||
    /^(unanswered|blank|none|n\/a|missing|-)$/i.test(trimmed)
  ) {
    return "";
  }
  const direct = tryParseMcqValue(trimmed);
  if (direct) return direct.choice;

  const optionMatch = trimmed.match(
    /(?:option|choice|letter)?\s*[([\s]*([A-Fa-f])[)\].\s]*$/i
  );
  if (optionMatch) return optionMatch[1].toUpperCase();

  return trimmed;
}

/**
 * Reconciles AI-generated per-question results against deterministic MCQ answer keys
 * so uppercase/lowercase variants ("1.c" vs "1. C") and exact point math are guaranteed.
 */
export function reconcileQuestionResults(params: {
  rawResults: Array<Omit<QuestionResult, "id" | "teacherPoints">>;
  modelAnswerText: string;
  studentText: string;
}): QuestionResult[] {
  const parsedKey = parseAnswerKeyText(params.modelAnswerText || "");
  const studentMcqMap = parseStudentMcqResponses(params.studentText || "");

  const keyByNumber = new Map(
    parsedKey.mcqKeys.map((k) => [k.questionNumber, k])
  );
  const seenNumbers = new Set<string>();
  const timestamp = Date.now();

  const reconciled: QuestionResult[] = params.rawResults.map((item, idx) => {
    const qNum = item.questionNumber.replace(/^q\.?/i, "").trim() || `${idx + 1}`;
    seenNumbers.add(qNum);
    const parsedMcqKey = keyByNumber.get(qNum);

    if (parsedMcqKey) {
      const expected = parsedMcqKey.expectedAnswer;
      const typedStudentChoice = studentMcqMap.get(qNum);
      const modelStudentChoice = normalizeStudentChoiceFromModel(
        item.studentAnswer
      );
      const effectiveStudent = typedStudentChoice || modelStudentChoice;
      const maxPoints = parsedMcqKey.maxPoints;

      let status: QuestionResult["status"] = "missing";
      let pointsEarned = 0;
      if (effectiveStudent) {
        if (effectiveStudent.toUpperCase() === expected.toUpperCase()) {
          status = "correct";
          pointsEarned = maxPoints;
        } else {
          status = "incorrect";
          pointsEarned = 0;
        }
      }

      const defaultExplanation =
        status === "correct"
          ? `Selected ${effectiveStudent}, matching the answer key (${expected}).`
          : status === "incorrect"
            ? `Selected ${effectiveStudent}, but the answer key expects ${expected}.`
            : `No answer provided; the answer key expects ${expected}.`;

      return {
        id: `q-${timestamp}-${idx}`,
        questionNumber: qNum,
        questionType: "mcq",
        promptOrTopic: item.promptOrTopic || `Multiple Choice Q${qNum}`,
        expectedAnswer: expected,
        studentAnswer: effectiveStudent || "Unanswered",
        status,
        pointsEarned,
        maxPoints,
        teacherPoints: null,
        explanation: item.explanation || defaultExplanation,
      };
    }

    // Non-parsed MCQ (e.g. from uploaded photo answer key) still enforces case-insensitive check
    if (item.questionType === "mcq") {
      const expectedNorm = normalizeStudentChoiceFromModel(item.expectedAnswer);
      const typedStudentChoice = studentMcqMap.get(qNum);
      const studentNorm =
        typedStudentChoice || normalizeStudentChoiceFromModel(item.studentAnswer);
      const maxPoints = item.maxPoints > 0 ? item.maxPoints : 1;

      if (expectedNorm) {
        let status: QuestionResult["status"] = "missing";
        let pointsEarned = 0;
        if (studentNorm) {
          if (studentNorm.toUpperCase() === expectedNorm.toUpperCase()) {
            status = "correct";
            pointsEarned = maxPoints;
          } else {
            status = "incorrect";
            pointsEarned = 0;
          }
        }
        return {
          id: `q-${timestamp}-${idx}`,
          questionNumber: qNum,
          questionType: "mcq",
          promptOrTopic: item.promptOrTopic || `Multiple Choice Q${qNum}`,
          expectedAnswer: expectedNorm,
          studentAnswer: studentNorm || "Unanswered",
          status,
          pointsEarned,
          maxPoints,
          teacherPoints: null,
          explanation: item.explanation,
        };
      }
    }

    const maxPts = item.maxPoints > 0 ? item.maxPoints : 10;
    return {
      id: `q-${timestamp}-${idx}`,
      questionNumber: qNum,
      questionType: item.questionType,
      promptOrTopic: item.promptOrTopic || `Question ${qNum}`,
      expectedAnswer: item.expectedAnswer,
      studentAnswer: item.studentAnswer,
      status: item.status,
      pointsEarned: clampScore(item.pointsEarned, maxPts),
      maxPoints: maxPts,
      teacherPoints: null,
      explanation: item.explanation,
    };
  });

  // Backfill any typed MCQ keys that the model omitted
  for (const mcqKey of parsedKey.mcqKeys) {
    if (seenNumbers.has(mcqKey.questionNumber)) continue;
    const studentChoice = studentMcqMap.get(mcqKey.questionNumber) || "";
    const isCorrect =
      Boolean(studentChoice) &&
      studentChoice.toUpperCase() === mcqKey.expectedAnswer.toUpperCase();
    const status: QuestionResult["status"] = !studentChoice
      ? "missing"
      : isCorrect
        ? "correct"
        : "incorrect";

    reconciled.push({
      id: `q-${timestamp}-k${mcqKey.questionNumber}`,
      questionNumber: mcqKey.questionNumber,
      questionType: "mcq",
      promptOrTopic: `Multiple Choice Q${mcqKey.questionNumber}`,
      expectedAnswer: mcqKey.expectedAnswer,
      studentAnswer: studentChoice || "Unanswered",
      status,
      pointsEarned: isCorrect ? mcqKey.maxPoints : 0,
      maxPoints: mcqKey.maxPoints,
      teacherPoints: null,
      explanation: isCorrect
        ? `Selected ${studentChoice}, matching the answer key (${mcqKey.expectedAnswer}).`
        : studentChoice
          ? `Selected ${studentChoice}, but the answer key expects ${mcqKey.expectedAnswer}.`
          : `No answer provided; the answer key expects ${mcqKey.expectedAnswer}.`,
    });
  }

  // Sort numerically when question numbers are digits
  reconciled.sort((a, b) => {
    const na = Number(a.questionNumber);
    const nb = Number(b.questionNumber);
    if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
    return a.questionNumber.localeCompare(b.questionNumber);
  });

  return reconciled;
}

export function summarizeQuestionResults(
  results: QuestionResult[]
): QuestionSummary {
  let mcqTotal = 0;
  let mcqCorrect = 0;
  let mcqEarned = 0;
  let mcqMax = 0;
  let openTotal = 0;
  let openEarned = 0;
  let openMax = 0;

  for (const q of results) {
    const effectivePts = clampScore(
      q.teacherPoints !== null ? q.teacherPoints : q.pointsEarned,
      q.maxPoints
    );
    if (q.questionType === "mcq") {
      mcqTotal += 1;
      if (q.status === "correct") mcqCorrect += 1;
      mcqEarned += effectivePts;
      mcqMax += q.maxPoints;
    } else {
      openTotal += 1;
      openEarned += effectivePts;
      openMax += q.maxPoints;
    }
  }

  return {
    mcqTotal,
    mcqCorrect,
    mcqEarned: Math.round(mcqEarned * 10) / 10,
    mcqMax: Math.round(mcqMax * 10) / 10,
    openTotal,
    openEarned: Math.round(openEarned * 10) / 10,
    openMax: Math.round(openMax * 10) / 10,
    totalEarned: Math.round((mcqEarned + openEarned) * 10) / 10,
    totalMax: Math.round((mcqMax + openMax) * 10) / 10,
  };
}

/**
 * Keeps any dedicated MCQ rubric criterion (`mcq-objective`) synchronized with
 * deterministic MCQ results, both during initial grading and when a teacher overrides MCQs.
 */
export function applyMcqResultsToCriteria(
  criterionScores: CriterionScore[],
  questionResults: QuestionResult[],
  mode: "ai" | "teacher"
): CriterionScore[] {
  const summary = summarizeQuestionResults(questionResults);
  if (summary.mcqTotal === 0 || summary.mcqMax <= 0) {
    return criterionScores;
  }

  const ratio = summary.mcqEarned / summary.mcqMax;
  return criterionScores.map((c) => {
    if (c.criterionId !== "mcq-objective") {
      return c;
    }
    const scaledScore = clampScore(ratio * c.maxScore, c.maxScore);
    const updatedRationale = `MCQs: ${summary.mcqCorrect}/${summary.mcqTotal} correct (${summary.mcqEarned}/${summary.mcqMax} raw pts → ${scaledScore}/${c.maxScore}).`;

    if (mode === "teacher") {
      return {
        ...c,
        teacherScore: scaledScore,
        rationale: updatedRationale,
      };
    }

    return {
      ...c,
      score: scaledScore,
      rationale: updatedRationale,
    };
  });
}
