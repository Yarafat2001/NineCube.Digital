import ts from 'typescript';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const catalogue = JSON.parse(fs.readFileSync(path.join(root, 'src/i18n/bn.json'), 'utf8'));
// Names and technical identifiers are intentionally identical in both languages.
const identities = new Set(['NineCube Digital', 'NineCube.Digital', 'BDT', 'SKU', 'LinkedIn', 'https://… or /products/…', 'e.g. order. or user.']);
const untranslated = [];
const textAttributes = new Set(['aria-label', 'title', 'placeholder', 'alt', 'label', 'description', 'message', 'heading']);
function inspect(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory() && !['test', 'reference', 'i18n'].includes(entry.name)) inspect(file);
    else if (entry.name.endsWith('.tsx')) {
      const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      function visit(node) {
        // Brand wordmarks and the language menu intentionally use their native names.
        if (!['Brand.tsx', 'ThemeControls.tsx'].includes(entry.name)) {
          const raw = ts.isJsxText(node) ? node.text.trim()
            : ts.isJsxAttribute(node) && textAttributes.has(node.name.getText(source))
              && node.initializer && ts.isStringLiteral(node.initializer) ? node.initializer.text : '';
          if (/[A-Za-z]/.test(raw)) untranslated.push(`${path.relative(root, file)}: wrap display text with t(): ${raw}`);
        }
        if (ts.isCallExpression(node) && node.expression.getText(source) === 't' && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
          const text = node.arguments[0].text.trim();
          if (/[A-Za-z]/.test(text) && !catalogue[text] && !identities.has(text)) {
            const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
            untranslated.push(`${path.relative(root, file)}:${line}: ${text}`);
          }
        }
        ts.forEachChild(node, visit);
      }
      visit(source);
    }
  }
}
inspect(path.join(root, 'src'));
for (const [key, value] of Object.entries(catalogue)) {
  if (!value || value.includes('??') || !/[\u0980-\u09ff]/u.test(value)) untranslated.push(`Invalid Bengali translation: ${key}`);
}
if (untranslated.length) {
  console.error(`Missing/invalid translations:\n${untranslated.join('\n')}`);
  process.exitCode = 1;
} else console.log(`Bengali catalogue verified: ${Object.keys(catalogue).length} entries; all literal t() labels covered.`);
