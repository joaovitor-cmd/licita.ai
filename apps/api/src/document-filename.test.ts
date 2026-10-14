import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeDocumentFilename} from './document-filename.js';
test('repairs UTF-8 multipart filenames and existing mojibake without changing valid names', () => {
  for (const name of ['Não emprego de menor.pdf', 'Declaração — João.pdf', 'Ação e condições.docx']) {
    const garbled = Buffer.from(name, 'utf8').toString('latin1');
    assert.equal(normalizeDocumentFilename(garbled), name);
    assert.equal(normalizeDocumentFilename(Buffer.from(garbled, 'utf8').toString('latin1')), name);
    assert.equal(normalizeDocumentFilename(name), name);
  }
  for (const name of ['Ângelo.pdf', 'Ã.pdf', '中文.pdf', 'arquivo 📄.pdf', 'normal.pdf']) assert.equal(normalizeDocumentFilename(name), name);
  assert.equal(normalizeDocumentFilename('../a\r\n.pdf'), '.._a__.pdf');
});
