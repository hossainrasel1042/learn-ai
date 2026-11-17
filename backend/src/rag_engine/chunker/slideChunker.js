

import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';

import { countTokens } from './base.js';


export class SlideContent {
  constructor({
    slideNumber,
    title = null,
    bodyText = '',
    speakerNotes = null,
    hasCode = false,
    hasImages = false,
  }) {
    this.slideNumber = slideNumber;
    this.title = title;
    this.bodyText = bodyText;
    this.speakerNotes = speakerNotes;
    this.hasCode = hasCode;
    this.hasImages = hasImages;
  }
}

let HAS_PPTX = true;


export class SlideChunker {

  constructor(config = null) {
    const defaultConfig = {
      minTokens: 100,
      maxTokens: 800,
      targetTokens: 400,
      overlapTokens: 50,
    };
    this.config = config || defaultConfig;
  }


  async chunk(content, metadata) {
    if (!HAS_PPTX) {
      throw new Error('jszip required: npm install jszip');
    }

    const filePath = content;
    const slides = await this._extractSlides(filePath);
    return this._chunkSlides(slides, metadata);
  }


  chunkFromSlides(slides, metadata) {
    return this._chunkSlides(slides, metadata);
  }


  async _extractSlides(filePath) {
    const buffer = await readFile(filePath);
    const zip = await JSZip.loadAsync(buffer);

    const slides = [];
    const slideFiles = Object.keys(zip.files)
      .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
      .sort((a, b) => {
        const na = parseInt(a.match(/slide(\d+)/i)[1], 10);
        const nb = parseInt(b.match(/slide(\d+)/i)[1], 10);
        return na - nb;
      });

    for (let idx = 0; idx < slideFiles.length; idx++) {
      const slideFile = slideFiles[idx];
      const slideNumber = idx + 1;
      const xml = await zip.files[slideFile].async('string');

      const parsed = this._parseSlideXml(xml);


      const notesFile = `ppt/notesSlides/notesSlide${slideNumber}.xml`;
      let speakerNotes = null;
      if (zip.files[notesFile]) {
        const notesXml = await zip.files[notesFile].async('string');
        speakerNotes = this._extractTextFromXml(notesXml);
      }

      slides.push(
        new SlideContent({
          slideNumber,
          title: parsed.title,
          bodyText: parsed.bodyText,
          speakerNotes,
          hasCode: parsed.hasCode,
          hasImages: parsed.hasImages,
        })
      );
    }

    return slides;
  }


  _parseSlideXml(xml) {



    const textFrames = this._extractTextFrames(xml);

    let title = null;
    const bodyParts = [];
    let hasCode = false;

    if (textFrames.length > 0) {

      title = textFrames[0] || null;
      for (let i = 1; i < textFrames.length; i++) {
        const text = textFrames[i];
        if (text) {
          bodyParts.push(text);
          if (this._looksLikeCode(text)) {
            hasCode = true;
          }
        }
      }
    }

    return {
      title,
      bodyText: bodyParts.join('\n\n'),
      hasCode,
      hasImages: false,
    };
  }


  _extractTextFromXml(xml) {
    const texts = [];
    const regex = /<a:t[^>]*>([^<]*)<\/a:t>/g;
    let m;
    // eslint-disable-next-line no-cond-assign
    while ((m = regex.exec(xml)) !== null) {
      const text = m[1].trim();
      if (text) texts.push(text);
    }
    return texts.join('\n');
  }


  _extractTextFrames(xml) {
    const frames = [];
    const shapeRegex = /<p:sp\b[\s\S]*?<\/p:sp>/g;
    let m;
    // eslint-disable-next-line no-cond-assign
    while ((m = shapeRegex.exec(xml)) !== null) {
      const shapeXml = m[0];
      const texts = [];
      const textRegex = /<a:t[^>]*>([^<]*)<\/a:t>/g;
      let tm;
      // eslint-disable-next-line no-cond-assign
      while ((tm = textRegex.exec(shapeXml)) !== null) {
        const text = tm[1].trim();
        if (text) texts.push(text);
      }
      if (texts.length) {
        frames.push(texts.join('\n'));
      }
    }
    return frames;
  }


  _chunkSlides(slides, baseMetadata) {
    const chunks = [];
    let buffer = [];
    let bufferTokens = 0;
    let currentSection = null;

    for (const slide of slides) {
      const slideText = this._formatSlide(slide);
      const slideTokens = countTokens(slideText);


      if (slide.hasCode) {

        if (buffer.length) {
          chunks.push(this._createChunk(buffer, currentSection, baseMetadata));
          buffer = [];
          bufferTokens = 0;
        }

        chunks.push(this._createChunk([slide], currentSection, baseMetadata));
        continue;
      }


      if (bufferTokens + slideTokens > this.config.maxTokens) {
        if (buffer.length) {
          chunks.push(this._createChunk(buffer, currentSection, baseMetadata));
        }
        buffer = [slide];
        bufferTokens = slideTokens;
      } else {
        buffer.push(slide);
        bufferTokens += slideTokens;
      }


      if (slide.title && this._isSectionHeader(slide)) {
        currentSection = slide.title;
      }
    }


    if (buffer.length) {
      chunks.push(this._createChunk(buffer, currentSection, baseMetadata));
    }

    return chunks;
  }


  _createChunk(slides, section, baseMetadata) {
    const content = slides.map((s) => this._formatSlide(s)).join('\n\n---\n\n');


    let slideRef;
    if (slides.length === 1) {
      slideRef = `Slide ${slides[0].slideNumber}`;
    } else {
      slideRef = `Slides ${slides[0].slideNumber}-${slides[slides.length - 1].slideNumber}`;
    }

    const chunkMetadata = {
      ...baseMetadata,
      chunk_type: 'slides',
      slide_numbers: slides.map((s) => s.slideNumber),
      slide_range: slideRef,
      section: section,
      titles: slides.map((s) => s.title).filter((t) => t),
      has_code: slides.some((s) => s.hasCode),
    };

    return {
      content,
      metadata: chunkMetadata,
      tokenCount: countTokens(content),
    };
  }


  _formatSlide(slide) {
    const parts = [];
    if (slide.title) {
      parts.push(`## Slide ${slide.slideNumber}: ${slide.title}`);
    } else {
      parts.push(`## Slide ${slide.slideNumber}`);
    }
    if (slide.bodyText) {
      parts.push(slide.bodyText);
    }
    if (slide.speakerNotes) {
      parts.push(`\n[Speaker Notes:]\n${slide.speakerNotes}`);
    }
    return parts.join('\n\n');
  }


  _looksLikeCode(text) {
    const indicators = ['def ', 'class ', 'import ', 'function ', 'const ', '= {', '();'];
    return indicators.some((ind) => text.includes(ind));
  }


  _isSectionHeader(slide) {
    if (!slide.title) return false;
    const bodyWords = slide.bodyText ? slide.bodyText.split(/\s+/).length : 0;
    return bodyWords < 20;
  }
}


export function getSlideChunker(config = null) {
  return new SlideChunker(config);
}
