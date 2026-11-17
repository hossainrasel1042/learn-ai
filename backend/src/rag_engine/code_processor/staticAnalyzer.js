

import { extname } from 'node:path';


export class FunctionInfo {
  constructor({
    name,
    qualifiedName,
    signature,
    code,
    docstring = null,
    startLine,
    endLine,
    parentClass = null,
    calls = [],
  }) {
    this.name = name;
    this.qualifiedName = qualifiedName;
    this.signature = signature;
    this.code = code;
    this.docstring = docstring;
    this.startLine = startLine;
    this.endLine = endLine;
    this.parentClass = parentClass;
    this.calls = calls;
  }
}


export class ClassInfo {
  constructor({
    name,
    code,
    startLine,
    endLine,
    methods = [],
    docstring = null,
  }) {
    this.name = name;
    this.code = code;
    this.startLine = startLine;
    this.endLine = endLine;
    this.methods = methods;
    this.docstring = docstring;
  }
}


export class StaticAnalysisResult {
  constructor({
    language,
    imports = [],
    classes = [],
    functions = [],
    globalVariables = [],
  }) {
    this.language = language;
    this.imports = imports;
    this.classes = classes;
    this.functions = functions;
    this.globalVariables = globalVariables;
  }
}


export class StaticAnalyzer {
  static LANGUAGE_MAP = {
    '.py': 'python',
    '.js': 'javascript',
    '.ts': 'typescript',
    '.java': 'java',
    '.cpp': 'cpp',
    '.c': 'c',
    '.rs': 'rust',
    '.go': 'go',
    '.rb': 'ruby',
  };

  static IMPORT_TYPES = {
    python: ['import_statement', 'import_from_statement'],
    javascript: ['import_statement', 'import_declaration'],
    typescript: ['import_statement', 'import_declaration'],
    java: ['import_declaration'],
  };

  static CLASS_TYPES = {
    python: ['class_definition'],
    javascript: ['class_declaration'],
    typescript: ['class_declaration'],
    java: ['class_declaration'],
  };

  static FUNCTION_TYPES = {
    python: ['function_definition'],
    javascript: ['function_declaration', 'arrow_function', 'method_definition'],
    typescript: ['function_declaration', 'arrow_function', 'method_definition'],
    java: ['method_declaration'],
  };


  detectLanguage(filename) {
    const ext = extname(filename).toLowerCase();
    return StaticAnalyzer.LANGUAGE_MAP[ext] || 'python';
  }


  analyze(code, filename) {
    const language = this.detectLanguage(filename);

    return this._fallbackAnalyze(code, language);
  }


  _fallbackAnalyze(code, language) {
    const imports = [];
    const functions = [];
    const classes = [];

    if (language === 'python') {

      const importRegex = /^(?:from\s+\S+\s+)?import\s+.+$/gm;
      let m;
      // eslint-disable-next-line no-cond-assign
      while ((m = importRegex.exec(code)) !== null) {
        imports.push(m[0]);
      }


      const funcRegex = /^def\s+(\w+)\s*\([^)]*\):/gm;
      // eslint-disable-next-line no-cond-assign
      while ((m = funcRegex.exec(code)) !== null) {
        const startLine = code.slice(0, m.index).split('\n').length;
        functions.push(
          new FunctionInfo({
            name: m[1],
            qualifiedName: m[1],
            signature: m[0],
            code: m[0],
            docstring: null,
            startLine,
            endLine: startLine,
            parentClass: null,
          })
        );
      }


      const classRegex = /^class\s+(\w+)/gm;
      // eslint-disable-next-line no-cond-assign
      while ((m = classRegex.exec(code)) !== null) {
        const startLine = code.slice(0, m.index).split('\n').length;
        classes.push(
          new ClassInfo({
            name: m[1],
            code: m[0],
            startLine,
            endLine: startLine,
          })
        );
      }
    } else if (language === 'javascript' || language === 'typescript') {

      const importRegex = /^import\s+.+$/gm;
      let m;
      // eslint-disable-next-line no-cond-assign
      while ((m = importRegex.exec(code)) !== null) {
        imports.push(m[0]);
      }


      const funcRegex = /^function\s+(\w+)\s*\(/gm;
      // eslint-disable-next-line no-cond-assign
      while ((m = funcRegex.exec(code)) !== null) {
        const startLine = code.slice(0, m.index).split('\n').length;
        functions.push(
          new FunctionInfo({
            name: m[1],
            qualifiedName: m[1],
            signature: m[0],
            code: m[0],
            docstring: null,
            startLine,
            endLine: startLine,
            parentClass: null,
          })
        );
      }


      const classRegex = /^class\s+(\w+)/gm;
      // eslint-disable-next-line no-cond-assign
      while ((m = classRegex.exec(code)) !== null) {
        const startLine = code.slice(0, m.index).split('\n').length;
        classes.push(
          new ClassInfo({
            name: m[1],
            code: m[0],
            startLine,
            endLine: startLine,
          })
        );
      }
    } else if (language === 'c' || language === 'cpp') {

      const includeRegex = /^#include\s*[<"][^>"]+[>"]/gm;
      let m;
      // eslint-disable-next-line no-cond-assign
      while ((m = includeRegex.exec(code)) !== null) {
        imports.push(m[0]);
      }


      const funcRegex =
        /^(?:[A-Za-z_][\w\s\*\&]*?\s+)([A-Za-z_]\w*)\s*\([^)]*\)\s*\{/gm;
      // eslint-disable-next-line no-cond-assign
      while ((m = funcRegex.exec(code)) !== null) {
        const startLine = code.slice(0, m.index).split('\n').length;
        functions.push(
          new FunctionInfo({
            name: m[1],
            qualifiedName: m[1],
            signature: m[0],
            code: m[0],
            docstring: null,
            startLine,
            endLine: startLine,
            parentClass: null,
          })
        );
      }


      const classRegex = /^(?:class|struct)\s+(\w+)/gm;
      // eslint-disable-next-line no-cond-assign
      while ((m = classRegex.exec(code)) !== null) {
        const startLine = code.slice(0, m.index).split('\n').length;
        classes.push(
          new ClassInfo({
            name: m[1],
            code: m[0],
            startLine,
            endLine: startLine,
          })
        );
      }
    } else if (language === 'go') {

      const importBlockRegex = /import\s+(?:\(\s*([\s\S]*?)\s*\)|"([^"]+)")/gm;
      let m;
      // eslint-disable-next-line no-cond-assign
      while ((m = importBlockRegex.exec(code)) !== null) {
        const block = m[1] || `"${m[2]}"`;
        imports.push(`import ${block.trim()}`);
      }


      const funcRegex = /^func\s+(?:\([^)]*\)\s+)?(\w+)\s*\(/gm;
      // eslint-disable-next-line no-cond-assign
      while ((m = funcRegex.exec(code)) !== null) {
        const startLine = code.slice(0, m.index).split('\n').length;
        functions.push(
          new FunctionInfo({
            name: m[1],
            qualifiedName: m[1],
            signature: m[0],
            code: m[0],
            docstring: null,
            startLine,
            endLine: startLine,
            parentClass: null,
          })
        );
      }


      const classRegex = /^(?:type)\s+(?:struct|interface)\s+(\w+)/gm;
      // eslint-disable-next-line no-cond-assign
      while ((m = classRegex.exec(code)) !== null) {
        const startLine = code.slice(0, m.index).split('\n').length;
        classes.push(
          new ClassInfo({
            name: m[1],
            code: m[0],
            startLine,
            endLine: startLine,
          })
        );
      }
    } else {



      const lines = code.split('\n');
      let m;



      const funcRegex =
        /^[ \t]*(?:def|fn|function|func|sub|method|proc|lambda)\s+(\w+)/;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const fm = line.match(funcRegex);
        if (fm) {
          functions.push(
            new FunctionInfo({
              name: fm[1],
              qualifiedName: fm[1],
              signature: line.trim(),
              code: line.trim(),
              docstring: null,
              startLine: i + 1,
              endLine: i + 1,
              parentClass: null,
            })
          );
        }
      }


      const classRegex =
        /^[ \t]*(?:class|struct|interface|type|module)\s+(\w+)/;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const cm = line.match(classRegex);
        if (cm) {
          classes.push(
            new ClassInfo({
              name: cm[1],
              code: line.trim(),
              startLine: i + 1,
              endLine: i + 1,
            })
          );
        }
      }


      const importRegex = /^(?:require|use|import|include)\s+.+$/gm;
      // eslint-disable-next-line no-cond-assign
      while ((m = importRegex.exec(code)) !== null) {
        imports.push(m[0]);
      }
    }

    return new StaticAnalysisResult({
      language,
      imports,
      classes,
      functions,
      globalVariables: [],
    });
  }
}


export const staticAnalyzer = new StaticAnalyzer();