import { normalizeAnnotationRecord } from "../shared/annotations";
import type { AnnotationRecord, AnnotationStyle } from "../shared/types";

function styleClass(style: AnnotationStyle): string {
  return `rk-${style}`;
}

export type AnnotationClassOptions = {
  noteMark?: boolean;
};

export function annotationClassName(annotation: AnnotationRecord, options: AnnotationClassOptions = {}): string {
  const normalized = normalizeAnnotationRecord(annotation);
  const hasNoteMark = options.noteMark ?? normalized.note.trim().length > 0;
  return [
    "rk-annotation",
    hasNoteMark ? "rk-note-mark" : "",
    ...normalized.styles.map(styleClass)
  ].filter(Boolean).join(" ");
}

export function orderAnnotationsForRendering(annotations: AnnotationRecord[]): AnnotationRecord[] {
  return [...annotations]
    .map(normalizeAnnotationRecord)
    .sort((first, second) => {
      const lengthDelta = second.text.length - first.text.length;
      if (lengthDelta !== 0) {
        return lengthDelta;
      }

      return first.createdAt.localeCompare(second.createdAt);
    });
}
