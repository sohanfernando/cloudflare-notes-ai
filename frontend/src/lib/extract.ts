import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

/** File extensions the upload button accepts. */
export const ACCEPTED_FILE_TYPES = '.pdf,.docx,.txt,.md'

/** Largest file read in the browser. The text extracted from it has its own, smaller limit. */
const MAX_FILE_BYTES = 25 * 1024 * 1024

/**
 * Reads the text out of an uploaded document. This runs entirely in the
 * browser: the file itself is never sent to the server, only its text.
 * The PDF and Word parsers are loaded on first use, since they are large.
 */
export async function extractText(file: File): Promise<string> {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(`This file is larger than ${MAX_FILE_BYTES / 1024 / 1024} MB.`)
  }

  const extension = file.name.split('.').pop()?.toLowerCase()
  let text: string
  try {
    if (extension === 'pdf') text = await extractPdf(file)
    else if (extension === 'docx') text = await extractDocx(file)
    else if (extension === 'txt' || extension === 'md') text = await file.text()
    else throw new UnsupportedFileError()
  } catch (cause) {
    if (cause instanceof UnsupportedFileError) throw cause
    throw new Error('Could not read this file. It may be damaged or password-protected.')
  }

  if (!text.trim()) {
    throw new Error('No text was found in this file. Scanned documents (images of pages) are not supported.')
  }
  return text
}

class UnsupportedFileError extends Error {
  constructor() {
    super('Unsupported file type. Upload a PDF, a Word document (.docx), or a .txt or .md file.')
  }
}

async function extractPdf(file: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

  const loading = pdfjs.getDocument({ data: await file.arrayBuffer() })
  try {
    const pdf = await loading.promise
    const pages: string[] = []
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber)
      const { items } = await page.getTextContent()
      pages.push(
        items.map((item) => ('str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : '')).join(''),
      )
    }
    return pages.join('\n\n')
  } finally {
    await loading.destroy()
  }
}

async function extractDocx(file: File): Promise<string> {
  const mammoth = await import('mammoth')
  const { value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })
  return value
}
