import type { AnnotationItem } from "./types";

export interface AlignedAnnotationSpan {
  start: number;
  end: number;
  annotation: AnnotationItem;
}

export interface TextSegment {
  type: "text" | "annotation";
  text: string;
  annotation?: AnnotationItem;
}

export interface AlignmentResult {
  segments: TextSegment[];
  alignedSpans: AlignedAnnotationSpan[];
  unanchored: AnnotationItem[];
}

function overlapsExisting(
  start: number,
  end: number,
  occupied: Array<{ start: number; end: number }>
): boolean {
  return occupied.some((range) => start < range.end && end > range.start);
}

function findAllIndices(haystack: string, needle: string): number[] {
  const indices: number[] = [];
  if (!needle) return indices;
  let pos = 0;
  while (pos <= haystack.length - needle.length) {
    const found = haystack.indexOf(needle, pos);
    if (found === -1) break;
    indices.push(found);
    pos = found + 1;
  }
  return indices;
}

/**
 * Aligns quote-based AI annotations onto exact non-overlapping character ranges
 * in the student's text without splitting or corrupting prose.
 */
export function alignAnnotationsToText(
  text: string,
  annotations: AnnotationItem[]
): AlignmentResult {
  if (!text) {
    return {
      segments: [],
      alignedSpans: [],
      unanchored: annotations,
    };
  }

  const occupied: Array<{ start: number; end: number }> = [];
  const alignedSpans: AlignedAnnotationSpan[] = [];
  const unanchored: AnnotationItem[] = [];
  const lowerText = text.toLowerCase();

  for (const annotation of annotations) {
    const quote = annotation.quote.trim();
    if (!quote) {
      unanchored.push(annotation);
      continue;
    }

    let candidates = findAllIndices(text, quote);
    let matchLength = quote.length;

    if (candidates.length === 0) {
      candidates = findAllIndices(lowerText, quote.toLowerCase());
    }

    const freeCandidates = candidates.filter(
      (idx) => !overlapsExisting(idx, idx + matchLength, occupied)
    );

    if (freeCandidates.length === 0) {
      unanchored.push(annotation);
      continue;
    }

    let chosenIndex = freeCandidates[0];
    const context = annotation.contextBefore.trim().toLowerCase();
    if (freeCandidates.length > 1 && context) {
      const scored = freeCandidates.find((idx) => {
        const windowStart = Math.max(0, idx - Math.max(context.length + 25, 45));
        const preceding = lowerText.slice(windowStart, idx);
        return preceding.includes(context);
      });
      if (scored !== undefined) {
        chosenIndex = scored;
      }
    }

    const span: AlignedAnnotationSpan = {
      start: chosenIndex,
      end: chosenIndex + matchLength,
      annotation,
    };
    occupied.push({ start: span.start, end: span.end });
    alignedSpans.push(span);
  }

  alignedSpans.sort((a, b) => a.start - b.start);

  const segments: TextSegment[] = [];
  let cursor = 0;
  for (const span of alignedSpans) {
    if (span.start > cursor) {
      segments.push({
        type: "text",
        text: text.slice(cursor, span.start),
      });
    }
    segments.push({
      type: "annotation",
      text: text.slice(span.start, span.end),
      annotation: span.annotation,
    });
    cursor = span.end;
  }

  if (cursor < text.length) {
    segments.push({
      type: "text",
      text: text.slice(cursor),
    });
  }

  return { segments, alignedSpans, unanchored };
}
