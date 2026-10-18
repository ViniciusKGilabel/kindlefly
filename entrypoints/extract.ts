import { extractFromDocument } from '../src/extract/readability';

// Injetado pelo painel via scripting.executeScript({ files: ['/extract.js'] }); o painel lê `result`.
export default defineUnlistedScript(() =>
  extractFromDocument(document.cloneNode(true) as Document, location.href),
);
