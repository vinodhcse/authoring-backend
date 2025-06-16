import mammoth from "mammoth";
import { generateJSON } from "@tiptap/html";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import Bold from "@tiptap/extension-bold";
import Italic from "@tiptap/extension-italic";
import Underline from "@tiptap/extension-underline";
import Blockquote from "@tiptap/extension-blockquote";
import HardBreak from "@tiptap/extension-hard-break";

const extensions = [
  Document,
  Paragraph,
  Text,
  Bold,
  Italic,
  Underline,
  Blockquote,
  HardBreak,
];

export async function convertDocxToTiptapChapters(buffer: Buffer) {
    console.log("Converting DOCX to Tiptap chapters...");
  const result = await mammoth.convertToHtml({ buffer }, {
    convertImage: mammoth.images.none,
    styleMap: [
      "b => strong",
      "i => em",
      "u => underline",
      "p[style-name='Quote'] => blockquote"
    ]
  });

  let html = result.value;

  // Optional: clean scene breaks like *** or --- into <hr>
  html = html.replace(/<p>([*\-~]{3,})<\/p>/g, '<hr data-scene-break="true" />');

  // Split by heading (example: <h1>)
  const chunks = html.split(/<h1>(.*?)<\/h1>/g); // heading capture

  const chapters = [];

  for (let i = 1; i < chunks.length; i += 2) {
    const title = chunks[i]?.trim() || `Chapter ${i / 2 + 1}`;
    const body = chunks[i + 1]?.trim() || '';

    const fullHtml = `<h1>${title}</h1>${body}`;
    const tiptapJson = generateJSON(fullHtml, extensions);

    chapters.push({
      title,
      content: tiptapJson?.content || [],
    });
  }

  return chapters;
}
