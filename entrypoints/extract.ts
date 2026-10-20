import { resolveLazyImages } from '../src/extract/lazy-images';
import { extractFromDocument } from '../src/extract/readability';

// Injetado pelo painel via scripting.executeScript({ files: ['/extract.js'] }); o painel lê `result`.
export default defineUnlistedScript(() => {
  const clone = document.cloneNode(true) as Document;
  resolveLazyImages(clone, document.baseURI);
  return extractFromDocument(clone, location.href);
});
