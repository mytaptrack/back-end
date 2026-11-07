/**
 * Reads the Express route tables out of the container servers with the
 * TypeScript parser, so each route can be traced to its Lambda handler.
 */
import { readFileSync } from 'fs';
import { join, posix } from 'path';
import * as ts from 'typescript';

export interface ContainerRoute {
  server: 'rest' | 'device';
  method: string;
  path: string;
  codePath?: string;
  handler?: string;
}

const CONTAINER_DIR = join(__dirname, '..');

function parseServer(file: string, server: ContainerRoute['server']): ContainerRoute[] {
  const source = ts.createSourceFile(file, readFileSync(join(CONTAINER_DIR, file), 'utf8'), ts.ScriptTarget.ES2022, true);
  const imports = new Map<string, { codePath: string; handler: string }>();
  const routes: ContainerRoute[] = [];

  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) && node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings)) {
      const from = (node.moduleSpecifier as ts.StringLiteral).text;
      if (from.startsWith('../')) {
        node.importClause.namedBindings.elements.forEach(element => {
          imports.set(element.name.text, {
            codePath: `${posix.join('src/container', from)}.ts`,
            handler: (element.propertyName ?? element.name).text
          });
        });
      }
    }
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
      && node.expression.expression.getText(source) === 'app'
      && ['get', 'put', 'post', 'delete'].includes(node.expression.name.text)) {
      const [path, callback] = node.arguments;
      if (path && ts.isStringLiteral(path)) {
        const alias = callback?.getText(source).match(/handleLambda\((\w+),/)?.[1];
        routes.push({
          server,
          method: node.expression.name.text.toUpperCase(),
          path: path.text,
          ...(alias ? imports.get(alias) : {})
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return routes;
}

export function loadContainerRoutes(): ContainerRoute[] {
  return [...parseServer('rest-api-server.ts', 'rest'), ...parseServer('device-server.ts', 'device')];
}
