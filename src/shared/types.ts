export type VocabularyEntry = {
  term: string;
  explanation: string;
};

export type SourceRecord = {
  id: string;
  url: string;
  title: string;
  siteName: string;
  capturedText: string;
  firstReadAt: string;
  lastReadAt: string;
  tags: string[];
};

export type HighlightRecord = {
  id: string;
  sourceId: string;
  text: string;
  prefix: string;
  suffix: string;
  note: string;
  translation: string;
  vocabulary: VocabularyEntry[];
  createdAt: string;
  updatedAt: string;
};

export type AnnotationStyle = "yellow" | "green" | "blue" | "pink" | "underline" | "wavy";

export type AnnotationRecord = {
  id: string;
  sourceId: string;
  text: string;
  prefix: string;
  suffix: string;
  styles: AnnotationStyle[];
  style?: AnnotationStyle;
  note: string;
  translation: string;
  savedAsExcerpt: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ExcerptRecord = {
  id: string;
  sourceId: string;
  sourceTitle: string;
  sourceUrl: string;
  text: string;
  note: string;
  translation: string;
  createdAt: string;
};

export type TranslationRecord = {
  id: string;
  sourceId: string;
  textHash: string;
  text: string;
  translation: string;
  createdAt: string;
  updatedAt: string;
};
