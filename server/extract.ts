// Turn uploaded files and URLs into plain text for source extraction.
import { extractText, getDocumentProxy } from 'unpdf';

const MAX_TEXT = 60_000;

export async function textFromFile(buf: Buffer, filename: string, mime: string): Promise<string> {
  const lower = filename.toLowerCase();
  if (mime === 'application/pdf' || lower.endsWith('.pdf')) {
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { text } = await extractText(pdf, { mergePages: true });
    return clean(Array.isArray(text) ? text.join('\n') : text);
  }
  if (/\.(txt|md|csv|tsv|json|tex|bib|log|py|js|ts|r|m|ipynb)$/.test(lower) || mime.startsWith('text/')) {
    return clean(buf.toString('utf8'));
  }
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return htmlToText(buf.toString('utf8'));
  return '';
}

export async function textFromUrl(url: string): Promise<{ text: string; title: string }> {
  const u = new URL(url);
  if (!['http:', 'https:'].includes(u.protocol)) throw new Error('Only http(s) URLs are supported');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20_000);
  try {
    const res = await fetch(u, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (ProjectCompiler research fetcher)', Accept: 'text/html,application/pdf,text/plain' },
    });
    if (!res.ok) throw new Error(`Fetching the URL failed with HTTP ${res.status}`);
    const type = res.headers.get('content-type') ?? '';
    const buf = Buffer.from(await res.arrayBuffer());
    if (type.includes('pdf')) return { text: await textFromFile(buf, 'x.pdf', 'application/pdf'), title: '' };
    const html = buf.toString('utf8');
    const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim() ?? '';
    const meta = (name: string) =>
      new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']+)`, 'i').exec(html)?.[1] ?? '';
    const header = [meta('citation_title') && `Title: ${meta('citation_title')}`, meta('citation_author') && `Author: ${meta('citation_author')}`, meta('citation_publication_date') && `Date: ${meta('citation_publication_date')}`, meta('description') && `Description: ${meta('description')}`]
      .filter(Boolean)
      .join('\n');
    return { text: clean(`${header}\n\n${htmlToText(html)}`), title: decodeEntities(meta('citation_title') || title) };
  } finally {
    clearTimeout(timer);
  }
}

function decodeEntities(s: string) {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

export function htmlToText(html: string): string {
  return clean(
    decodeEntities(
      html
        .replace(/<(script|style|noscript|svg|nav|footer|header)[\s\S]*?<\/\1>/gi, ' ')
        .replace(/<\/(p|div|h[1-6]|li|tr|br|section|article)>/gi, '\n')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, ' '),
    ),
  );
}

function clean(s: string): string {
  return s
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim()
    .slice(0, MAX_TEXT);
}
