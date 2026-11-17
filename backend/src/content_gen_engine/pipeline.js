

import path from 'node:path';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import { logger } from '../utils/logger.js';
import { getImageGenService, ImageGenService } from '../services/imageGenService.js';
import {
  getContentPlanner,
  ContentPlanner,
} from './agents/contentPlanner.js';
import {
  getTheoryWriter,
  TheoryWriter,
} from './agents/theoryWriter.js';
import {
  getCodeWriter,
  CodeWriter,
} from './agents/codeWriter.js';
import {
  getMarkdownGenerator,
  MarkdownGenerator,
} from './generators/markdownGenerator.js';
import {
  getDiagramGenerator,
  DiagramGenerator,
} from './generators/diagramGenerator.js';
import {
  getSyntaxChecker,
  getCodeExecutor,
  getContentValidator,
  SyntaxChecker,
  CodeExecutor,
  ContentValidator,
} from './validators/codeValidator.js';
import { ContentPlan, LabSpec } from './schemas/contentTags.js';


export class PipelineConfig {
  constructor({
    outputDir = './output',
    output_dir,
    generateImages = true,
    generate_images,
    generateDiagrams = true,
    generate_diagrams,
    validateCode = true,
    validate_code,
    validateContent = false,
    validate_content,
    numPages = 5,
    num_pages,
  } = {}) {
    this.output_dir = output_dir ?? outputDir ?? './output';
    this.generate_images = generate_images ?? generateImages ?? true;
    this.generate_diagrams = generate_diagrams ?? generateDiagrams ?? true;
    this.validate_code = validate_code ?? validateCode ?? true;
    this.validate_content = validate_content ?? validateContent ?? false;
    this.num_pages = num_pages ?? numPages ?? 5;
  }
}


export class GenerationResult {
  constructor({
    success,
    output_path = null,
    outputPath,
    output_type = 'markdown',
    outputType,
    plan = null,
    document = null,
    lab = null,
    assets = {},
    validation = {},
    error = null,
  } = {}) {
    this.success = success;
    this.output_path = output_path ?? outputPath ?? null;
    this.output_type = output_type ?? outputType ?? 'markdown';
    this.plan = plan;
    this.document = document;
    this.lab = lab;
    this.assets = assets;
    this.validation = validation;
    this.error = error;
  }
}


export class ContentPipeline {

  constructor(config = null) {
    this.config = config || new PipelineConfig();


    this.planner = getContentPlanner();
    this.theory_writer = getTheoryWriter();
    this.code_writer = getCodeWriter();
    this.markdown_gen = getMarkdownGenerator(this.config.output_dir);
    this.diagram_gen = getDiagramGenerator(`${this.config.output_dir}/diagrams`);

    this.syntax_checker = getSyntaxChecker();
    this.code_executor = getCodeExecutor();




    try {
      this.image_gen = getImageGenService(`${this.config.output_dir}/images`);
    } catch (e) {
      logger.warn(`Image generation unavailable: ${e.message || e}`);
      this.image_gen = null;
    }


    fsSync.mkdirSync(this.config.output_dir, { recursive: true });
  }


  async generateTheory(
    topic,
    outputType = 'markdown',
    context = null,
    numPages = null,
    progressCallback = null,
  ) {
    try {
      const pages = numPages || this.config.num_pages;


      logger.info(`Planning content for: ${topic}`);
      if (progressCallback) {
        await progressCallback(`Planning content structure for '${topic}'...`);
      }

      const plan = await this.planner.plan(topic, outputType, context, pages);


      logger.info(`Generating content: ${plan.sections.length} sections`);
      if (progressCallback) {
        await progressCallback(
          `Drafting content for ${plan.sections.length} sections...`,
        );
      }

      const document = await this.theory_writer.generate(plan, context);


      const assets = {};


      if (this.config.generate_diagrams) {
        const allDiagrams = [];
        for (const page of document.pages) {
          allDiagrams.push(...(page.content.diagrams || []));
        }

        if (allDiagrams.length) {
          logger.info(`Rendering ${allDiagrams.length} diagrams`);
          if (progressCallback) {
            await progressCallback(
              `Generating ${allDiagrams.length} Mermaid diagrams...`,
            );
          }

          const diagramPaths = await this.diagram_gen.renderBatch(allDiagrams);
          for (const [k, v] of Object.entries(diagramPaths)) {
            if (v) assets[k] = v;
          }
        }
      }


      if (this.config.generate_images && this.image_gen) {
        const allImages = [];
        for (const page of document.pages) {
          for (const img of page.content.images || []) {
            allImages.push({ id: img.id, prompt: img.prompt });
          }
        }

        if (allImages.length) {
          logger.info(`Generating ${allImages.length} images`);
          if (progressCallback) {
            await progressCallback(
              `Creating ${allImages.length} AI illustrations...`,
            );
          }

          try {
            const imagePaths = await this.image_gen.generateBatch(allImages);
            for (const [k, v] of Object.entries(imagePaths)) {
              if (v) assets[k] = v;
            }
          } catch (e) {
            logger.warn(`Image generation failed: ${e.message || e}`);
          }
        }
      }


      if (progressCallback) {
        await progressCallback('Finalizing document...');
      }




      const mdPath = await this.markdown_gen.save(document, { image_paths: assets });
      let outputPath = mdPath;

      if (outputType === 'pdf') {
        if (progressCallback) {
          await progressCallback('Converting to PDF format...');
        }

        const pdfPath = mdPath.replace(/\.md$/, '.pdf');
        const markdownContent = await fs.readFile(mdPath, 'utf8');


        const baseUrl = path.resolve(this.config.output_dir);

        const success = await this._convertToPdf(markdownContent, pdfPath, baseUrl);
        if (success) {
          outputPath = pdfPath;
          logger.info(`Generated PDF at ${outputPath}`);
        } else {
          logger.warn('PDF generation failed, falling back to Markdown');
        }
      }

      if (progressCallback) {
        await progressCallback('Generation complete!');
      }

      return new GenerationResult({
        success: true,
        outputPath,
        outputType,
        plan,
        document,
        assets,
      });
    } catch (e) {
      logger.error(`Theory generation failed: ${e.message || e}`);
      if (progressCallback) {
        await progressCallback(`Error: ${e.message || e}`);
      }
      return new GenerationResult({ success: false, error: e.message || String(e) });
    }
  }


  async _convertToPdf(markdownContent, outputPath, baseUrl = '') {
    try {


      let MarkdownIt;
      let pdfKit;
      try {
        const mdMod = await import('markdown-it');
        MarkdownIt = mdMod.default || mdMod;
      } catch (_) {
        MarkdownIt = null;
      }
      try {
        pdfKit = (await import('pdfkit')).default || (await import('pdfkit'));
      } catch (_) {
        pdfKit = null;
      }

      const extensions = ['extra', 'codehilite', 'tables', 'fenced_code'];

      let htmlBody;
      if (MarkdownIt) {
        const md = new MarkdownIt({
          html: true,
          linkify: true,
          typographer: true,
        });
        htmlBody = md.render(markdownContent);
      } else {

        htmlBody = `<pre>${markdownContent
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')}</pre>`;
      }

      const htmlContent = `
            <html>
            <head>
            <meta charset="utf-8">
            <style>
                @page {
                    size: A4;
                    margin: 2cm;
                }
                body {
                    font-family: Helvetica, Arial, sans-serif;
                    font-size: 11pt;
                    line-height: 1.5;
                    color: #333;
                }
                h1 { font-size: 24pt; color: #2C3E50; border-bottom: 2px solid #eee; padding-bottom: 10px; }
                h2 { font-size: 18pt; color: #34495E; margin-top: 25px; border-bottom: 1px solid #eee; }
                h3 { font-size: 14pt; color: #7F8C8D; margin-top: 20px; }
                pre {
                    background-color: #f8f9fa;
                    padding: 15px;
                    border: 1px solid #e9ecef;
                    border-radius: 5px;
                    font-family: 'Courier New', Courier, monospace;
                    font-size: 9pt;
                    white-space: pre-wrap;
                }
                code {
                    background-color: #f8f9fa;
                    padding: 2px 4px;
                    border-radius: 3px;
                    font-family: 'Courier New', Courier, monospace;
                }
                blockquote {
                    border-left: 4px solid #3498DB;
                    margin: 0;
                    padding-left: 15px;
                    color: #555;
                    background-color: #ecf0f1;
                    padding: 10px;
                }
                img {
                    max-width: 100%;
                    height: auto;
                    margin: 20px 0;
                    box-shadow: 0 4px 6px rgba(0,0,0,0.1);
                }
                table {
                    width: 100%;
                    border-collapse: collapse;
                    margin: 20px 0;
                }
                th, td {
                    border: 1px solid #ddd;
                    padding: 8px;
                    text-align: left;
                }
                th {
                    background-color: #f2f2f2;
                }
            </style>
            </head>
            <body>
            ${htmlBody}
            </body>
            </html>
            `;

      if (pdfKit) {


        const PDFDocument = pdfKit;
        const doc = new PDFDocument({ size: 'A4', margin: 56 });
        const stream = (await import('node:fs')).default.createWriteStream(outputPath);
        doc.pipe(stream);

        const plain = htmlContent
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        doc.fontSize(11).text(plain);
        doc.end();
        await new Promise((resolve, reject) => {
          stream.on('finish', resolve);
          stream.on('error', reject);
        });
        return true;
      }




      const pdfBytes = this._writeMinimalPdf(markdownContent);
      await fs.writeFile(outputPath, pdfBytes);
      return true;
    } catch (e) {
      logger.error(`PDF conversion failed: ${e.message || e}`);

      console.error(e);
      return false;
    }
  }


  _writeMinimalPdf(text) {
    const escaped = String(text)
      .replace(/\\/g, '\\\\')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)');
    const stream = `BT /F1 11 Tf 50 780 Td (${escaped.slice(0, 3500)}) Tj ET`;
    const objects = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
      `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    ];

    let out = '%PDF-1.4\n';
    const offsets = [];
    objects.forEach((body, idx) => {
      offsets.push(out.length);
      out += `${idx + 1} 0 obj\n${body}\nendobj\n`;
    });
    const xrefStart = out.length;
    out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (const off of offsets) {
      out += `${String(off).padStart(10, '0')} 00000 n \n`;
    }
    out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
    return Buffer.from(out, 'binary');
  }


  async generateLab(
    topic,
    language = 'python',
    context = null,
    progressCallback = null,
  ) {
    try {

      logger.info(`Generating lab: ${topic} (${language})`);
      if (progressCallback) {
        await progressCallback(`Designing coding lab for '${topic}'...`);
      }

      const lab = await this.code_writer.generateLab(topic, language, null, context);

      const validation = {};


      if (this.config.validate_code && lab.solution_code) {
        logger.info('Validating solution code');
        if (progressCallback) {
          await progressCallback('Validating solution code...');
        }


        const syntaxResult = this.syntax_checker.check(lab.solution_code.code, language);
        validation.syntax = {
          is_valid: syntaxResult.is_valid,
          error: syntaxResult.error_message,
        };


        if (syntaxResult.is_valid && lab.test_cases && lab.test_cases.length) {
          logger.info(`Running ${lab.test_cases.length} test cases`);
          if (progressCallback) {
            await progressCallback(`Running ${lab.test_cases.length} test cases...`);
          }

          const testResult = this.code_executor.runTests(
            lab.solution_code.code,
            lab.test_cases,
            language,
          );
          validation.tests = {
            passed: testResult.passed_tests,
            failed: testResult.failed_tests,
            results: testResult.test_results,
          };
        }
      }


      if (progressCallback) {
        await progressCallback('Saving lab files...');
      }

      const outputPath = await this._generate_lab_markdown(lab);

      if (progressCallback) {
        await progressCallback('Lab generation complete!');
      }

      return new GenerationResult({
        success: true,
        outputPath,
        outputType: 'lab',
        lab,
        validation,
      });
    } catch (e) {
      logger.error(`Lab generation failed: ${e.message || e}`);
      if (progressCallback) {
        await progressCallback(`Error: ${e.message || e}`);
      }
      return new GenerationResult({ success: false, error: e.message || String(e) });
    }
  }


  async _generate_lab_markdown(lab) {
    const lines = [];
    lines.push(`# ${lab.title}`);
    lines.push('');
    lines.push(lab.description || '');
    lines.push('');

    if (lab.objectives && lab.objectives.length) {
      lines.push('## Objectives');
      for (const obj of lab.objectives) {
        lines.push(`- ${obj}`);
      }
      lines.push('');
    }

    if (lab.starter_code) {
      lines.push('## Starter Code');
      lines.push(`File: \`${lab.starter_code.filename}\``);
      lines.push('');
      lines.push(lab.starter_code.description || '');
      lines.push('');
      lines.push(`\`\`\`${lab.starter_code.language || 'python'}`);
      lines.push(lab.starter_code.code);
      lines.push('```');
      lines.push('');
    }

    if (lab.solution_code) {
      lines.push('## Solution');
      lines.push(`File: \`${lab.solution_code.filename}\``);
      lines.push('');
      lines.push(lab.solution_code.description || '');
      lines.push('');
      lines.push(`\`\`\`${lab.solution_code.language || 'python'}`);
      lines.push(lab.solution_code.code);
      lines.push('```');
      lines.push('');
    }

    if (lab.test_cases && lab.test_cases.length) {
      lines.push('## Test Cases');
      for (const tc of lab.test_cases) {
        lines.push(`- ${tc.description || 'test'}`);
        if (tc.input) lines.push(`  - input: ${tc.input}`);
        if (tc.expected_output) lines.push(`  - expected: ${tc.expected_output}`);
      }
      lines.push('');
    }

    if (lab.hints && lab.hints.length) {
      lines.push('## Hints');
      for (const h of lab.hints) {
        lines.push(`- ${h}`);
      }
      lines.push('');
    }

    const filename = `${lab.title.replace(/[^\w\s-]/g, '').toLowerCase().replace(/\s+/g, '-')}.md`;
    const outputPath = path.join(this.config.output_dir, filename);
    await fs.mkdir(this.config.output_dir, { recursive: true });
    await fs.writeFile(outputPath, lines.join('\n'), 'utf8');
    return outputPath;
  }


  async generate(topic, contentType = 'theory', kwargs = {}) {
    if (contentType === 'lab') {
      const { language, context, progressCallback } = kwargs || {};
      return await this.generateLab(topic, language, context, progressCallback);
    } else {
      const { outputType, output_type, context, numPages, num_pages, progressCallback } = kwargs || {};
      return await this.generateTheory(
        topic,
        outputType ?? output_type,
        context,
        numPages ?? num_pages,
        progressCallback,
      );
    }
  }
}


export const getContentPipeline = (config = null) => new ContentPipeline(config);


export const contentPipeline = new ContentPipeline();

export default contentPipeline;