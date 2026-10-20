export interface ExtractedItem {
  id: string; // crypto.randomUUID()
  sourceUrl: string;
  title: string;
  author: string; // byline || siteName || hostname
  language: string; // lang do documento || 'en'
  html: string; // conteúdo do Readability
  kind: 'article' | 'selection' | 'merged' | 'comic';
  images?: string[]; // só em 'comic': URLs http(s) das páginas, em ordem
}
export interface Heading {
  level: 1 | 2 | 3 | 4 | 5 | 6;
  text: string;
  anchor: string;
}
export interface Chapter {
  id: string;
  title: string;
  xhtmlBody: string;
  headings: Heading[];
  imageUrls?: string[]; // índice N ↔ marcador `kf-img:N` no xhtmlBody
}
export interface EpubImage {
  href: string;
  mediaType: 'image/jpeg' | 'image/png' | 'image/gif';
  data: Uint8Array;
}
export interface Book {
  title: string;
  author: string;
  language: string;
  identifier: string; // 'urn:uuid:' + uuid
  modified: Date;
  chapters: Chapter[];
  images: EpubImage[]; 
}
export interface EpubFile {
  filename: string;
  data: Uint8Array;
}
