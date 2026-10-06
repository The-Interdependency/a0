// ratios: loc_comments=hmmm imports_exports=hmmm calls_definitions=hmmm
/** Syntax-only worker. Usage: node typescript-reader.cjs < input.json
 * Input: {path, text}; output: version, declarations, imports, exports, docs,
 * lexically owned comments and diagnostics. No target code/config is executed.
 */
'use strict';
const fs = require('node:fs');
const ts = require('typescript');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
if (typeof input.path !== 'string' || typeof input.text !== 'string') throw new Error('Invalid reader input');
const sf = ts.createSourceFile(input.path, input.text, ts.ScriptTarget.Latest, true);
const result = {version: ts.version, declarations: [], imports: [], exports: [], docs: [], comments: [], diagnostics: []};
const span = n => ({start_line: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1,
                    end_line: sf.getLineAndCharacterOfPosition(n.getEnd()).line + 1});
const text = n => n ? n.getText(sf) : null;
const counts = new Map();
const commentRanges = new Map();
const declarationRanges = [];
const qualify = (parent, name) => parent ? `${parent}.${name}` : name;
function visit(node, owner = '') {
  if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
    if (node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) {
      result.imports.push({module: node.moduleSpecifier.text, kind: ts.isImportDeclaration(node) ? 'import' : 'reexport',
        declaration: text(node), owner, ...span(node)});
    } else if (ts.isExportDeclaration(node) && node.exportClause && ts.isNamedExports(node.exportClause)) {
      for (const item of node.exportClause.elements) {
        result.exports.push({kind: 'local-export', local_name: (item.propertyName || item.name).text,
          exported_name: item.name.text, type_only: !!node.isTypeOnly || !!item.isTypeOnly,
          declaration: text(node), owner, ...span(item)});
      }
    }
  }
  if (ts.isExportAssignment(node)) {
    let expression = node.expression;
    while (ts.isParenthesizedExpression(expression)) expression = expression.expression;
    result.exports.push({kind: 'export-assignment',
      local_name: ts.isIdentifier(expression) ? expression.text : null,
      exported_name: node.isExportEquals ? 'export=' : 'default', type_only: false,
      expression: text(node.expression), declaration: text(node), owner, ...span(node)});
  }
  if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
      (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) {
    result.diagnostics.push({code: 'dynamic_module_loading', status: 'dynamic-unresolved', ...span(node)});
  }
  let localOwner = owner;
  const defaultModifier = !!node.modifiers?.some(m => m.kind === ts.SyntaxKind.DefaultKeyword);
  let name = node.name && (ts.isIdentifier(node.name) || ts.isStringLiteralLike(node.name)) ? node.name.text : null;
  const anonymousDefault = !name && defaultModifier && (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node));
  if (anonymousDefault) name = '$default'; // Collector identity, explicitly not a source name.
  const kind = ts.SyntaxKind[node.kind];
  const isDecl = name && (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node) ||
    ts.isTypeAliasDeclaration(node) || ts.isMethodDeclaration(node) || ts.isMethodSignature(node) ||
    ts.isPropertyDeclaration(node) || ts.isPropertySignature(node) || ts.isVariableDeclaration(node) ||
    ts.isEnumDeclaration(node) || ts.isModuleDeclaration(node));
  if (isDecl) {
    localOwner = qualify(owner, name);
    const ordinal = counts.get(localOwner) || 0; counts.set(localOwner, ordinal + 1);
    const identity = `${localOwner}#${ordinal}`;
    let carrier = node;
    if (ts.isVariableDeclaration(node)) carrier = node.parent.parent;
    const exported = !!carrier.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword);
    const declaration = {name: anonymousDefault ? null : name, qualified_name: localOwner, identity, kind, exported,
      anonymous: anonymousDefault, ...span(node),
      parameters: node.parameters?.map(p => ({name: text(p.name), type: text(p.type), optional: !!p.questionToken,
        rest: !!p.dotDotDotToken, default: text(p.initializer)})) || [],
      returns: text(node.type), decorators: (ts.canHaveDecorators(node) ? ts.getDecorators(node) : [])?.map(text) || []};
    result.declarations.push(declaration);
    declarationRanges.push({start: node.getStart(sf), end: node.getEnd(), identity, owner: localOwner});
    if (defaultModifier) {
      result.exports.push({kind: 'default-declaration', local_name: anonymousDefault ? null : name,
        exported_name: 'default', type_only: false, declaration: text(node), owner,
        declaration_identities: [identity], ...span(node)});
    }
    for (const doc of carrier.jsDoc || []) {
      result.docs.push({identity, owner: localOwner, ...span(doc), text: text(doc),
        description: typeof doc.comment === 'string' ? doc.comment : (doc.comment || []).map(c => c.text || '').join(''),
        tags: (doc.tags || []).map(t => ({tag: t.tagName.text, text: text(t), name: text(t.name),
          type: text(t.typeExpression), comment: typeof t.comment === 'string' ? t.comment : null}))});
    }
  }
  ts.forEachChild(node, child => visit(child, localOwner));
}
visit(sf);
// Token traversal includes trivia before closing braces (even empty bodies).
// Compiler token boundaries avoid treating strings/templates/regexes as comments.
function collectComments(node) {
  for (const range of [...(ts.getLeadingCommentRanges(input.text, node.getFullStart()) || []),
                       ...(ts.getTrailingCommentRanges(input.text, node.getEnd()) || [])]) {
    commentRanges.set(range.pos, range);
  }
  for (const child of node.getChildren(sf)) collectComments(child);
}
collectComments(sf);
for (const range of [...commentRanges.values()].sort((a, b) => a.pos - b.pos)) {
  const owners = declarationRanges.filter(d => d.start <= range.pos && range.end <= d.end);
  owners.sort((a, b) => (a.end - a.start) - (b.end - b.start));
  const owner = owners[0];
  result.comments.push({text: input.text.slice(range.pos, range.end),
    start_line: sf.getLineAndCharacterOfPosition(range.pos).line + 1,
    end_line: sf.getLineAndCharacterOfPosition(range.end).line + 1,
    identity: owner?.identity || null, owner: owner?.owner || null,
    attachment: owner ? 'lexically-enclosing-symbol' : 'module-trivia'});
}
for (const binding of result.exports) {
  const qualified = binding.local_name === null ? null : qualify(binding.owner, binding.local_name);
  const declarations = binding.declaration_identities
    ? result.declarations.filter(item => binding.declaration_identities.includes(item.identity))
    : result.declarations.filter(item => qualified !== null && item.qualified_name === qualified);
  binding.declaration_identities = declarations.map(item => item.identity);
  for (const declaration of declarations) {
    declaration.exported = true;
    declaration.export_names = [...new Set([...(declaration.export_names || []), binding.exported_name])];
  }
}
for (const d of sf.parseDiagnostics) result.diagnostics.push({code: `typescript_${d.code}`, status: 'invalid',
  message: ts.flattenDiagnosticMessageText(d.messageText, '\n'),
  start_line: sf.getLineAndCharacterOfPosition(d.start || 0).line + 1,
  end_line: sf.getLineAndCharacterOfPosition((d.start || 0) + (d.length || 0)).line + 1});
process.stdout.write(JSON.stringify(result));
// ratios: loc_comments=hmmm imports_exports=hmmm calls_definitions=hmmm
