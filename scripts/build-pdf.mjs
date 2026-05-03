// scripts/build-pdf.mjs
//
// Builds a single LaTeX file from a curated subset of the markdown docs.
// Upload the resulting .tex to Overleaf (set compiler to XeLaTeX) and click compile.
//
// Usage:
//   node scripts/build-pdf.mjs
//
// Customisation:
//   - Edit `scripts/pdf-config.json` to add / remove / reorder docs.
//   - The script reads each doc from content/docs/<slug>.md, extracts the
//     YAML frontmatter and converts the body to LaTeX. Each doc starts on
//     a new page automatically.
//   - All markdown features used in the docs are handled: headings, code
//     blocks (with monospace + frame), tables, lists (incl. nested), bold,
//     italic, inline code, blockquotes, links, horizontal rules.
//
// Compiler notes:
//   - Default compiler is XeLaTeX so we get full Unicode coverage (em-dashes,
//     arrows, mathematical symbols) without any escape gymnastics.
//   - Code blocks are rendered through the `listings` package with a
//     monospace font (DejaVu Sans Mono) that has full box-drawing coverage,
//     so ASCII diagrams render exactly as in the docs.
//
// Output:
//   dist/pdf/interview-prep.tex
//
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DOCS_ROOT = path.join(ROOT, 'content', 'docs');
const CONFIG_PATH = path.join(__dirname, 'pdf-config.json');
const OUT_DIR = path.join(ROOT, 'dist', 'pdf');
const OUT_TEX = path.join(OUT_DIR, 'interview-prep.tex');

// ---------------------------------------------------------------------------
// 1. Frontmatter
// ---------------------------------------------------------------------------

function parseFrontmatter(raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!m) return { meta: {}, body: raw };
  const meta = {};
  for (const line of m[1].split(/\r?\n/)) {
    const mm = line.match(/^(\w+):\s*"?(.*?)"?\s*$/);
    if (mm) meta[mm[1]] = mm[2].replace(/^"|"$/g, '');
  }
  return { meta, body: m[2] };
}

// ---------------------------------------------------------------------------
// 2. Inline transforms (operate on a single line / paragraph)
// ---------------------------------------------------------------------------

const LATEX_SPECIALS = /[\\&%$#_{}~^]/g;
const LATEX_ESCAPE_MAP = {
  '\\': '\\textbackslash{}',
  '&': '\\&',
  '%': '\\%',
  $: '\\$',
  '#': '\\#',
  _: '\\_',
  '{': '\\{',
  '}': '\\}',
  '~': '\\textasciitilde{}',
  '^': '\\textasciicircum{}',
};
function escapeLatex(s) {
  return s.replace(LATEX_SPECIALS, (c) => LATEX_ESCAPE_MAP[c]);
}

// Convert a markdown paragraph / cell / list-item into LaTeX inline markup.
// We stash inline `code` and links before escaping so their content (which
// must be passed RAW to LaTeX commands like \href and \texttt) is not mangled
// by the LaTeX-special-char escaping.
function inline(text) {
  // 1a. Stash links — labels stay as markdown for now, will be processed
  //     after escaping.
  const linkStash = [];
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label, url) => {
    linkStash.push({ label, url });
    return `\u0002${linkStash.length - 1}\u0002`;
  });

  // 1b. Stash inline `code` so its content isn't mangled.
  const codeStash = [];
  text = text.replace(/`([^`]+)`/g, (_m, code) => {
    codeStash.push(code);
    return `\u0001${codeStash.length - 1}\u0001`;
  });

  // 2. Escape LaTeX specials in surrounding text.
  text = escapeLatex(text);

  // 3. Bold then italic (markdown precedence).
  text = text.replace(/\*\*([^*]+)\*\*/g, '\\textbf{$1}');
  text = text.replace(/\*([^*\n]+)\*/g, '\\textit{$1}');
  text = text.replace(/~~([^~]+)~~/g, '\\sout{$1}');

  // 4. Restore links — process the (raw) URL appropriately for LaTeX.
  text = text.replace(/\u0002(\d+)\u0002/g, (_m, idx) => {
    const { label, url } = linkStash[Number(idx)];
    const escapedLabel = escapeLatex(label)
      .replace(/\*\*([^*]+)\*\*/g, '\\textbf{$1}')
      .replace(/\*([^*\n]+)\*/g, '\\textit{$1}');
    if (url.startsWith('/docs/')) {
      // Internal cross-reference -> emphasised text only (no live link in PDF).
      return `\\textit{${escapedLabel}}`;
    }
    if (/^https?:\/\//.test(url)) {
      // External link -> \href. URL needs only `%` and `#` escaped for LaTeX.
      const safeUrl = url.replace(/[\\%#]/g, '\\$&');
      return `\\href{${safeUrl}}{${escapedLabel}}`;
    }
    return escapedLabel;
  });

  // 5. Restore inline code as \texttt{escaped}.
  text = text.replace(/\u0001(\d+)\u0001/g, (_m, idx) => {
    const code = codeStash[Number(idx)];
    return `\\texttt{${escapeLatex(code)}}`;
  });

  return text;
}

// ---------------------------------------------------------------------------
// 3. Code-block preprocessing (so listings doesn't choke on Unicode)
// ---------------------------------------------------------------------------

// `listings` runs before fontspec font selection inside lstlisting, so even
// with XeLaTeX we replace box-drawing & arrow chars with ASCII so diagrams
// render predictably regardless of font fallbacks.
const ASCII_REPLACEMENTS = {
  '─': '-', '━': '=', '│': '|', '┃': '|',
  '┌': '+', '┐': '+', '└': '+', '┘': '+',
  '├': '+', '┤': '+', '┬': '+', '┴': '+', '┼': '+',
  '╔': '+', '╗': '+', '╚': '+', '╝': '+',
  '╠': '+', '╣': '+', '╦': '+', '╩': '+', '╬': '+',
  '═': '=', '║': '|',
  '►': '>', '◄': '<', '▶': '>', '◀': '<',
  '▲': '^', '▼': 'v', '↑': '^', '↓': 'v',
  '→': '->', '←': '<-', '↔': '<->', '⇒': '=>', '⇐': '<=', '⇔': '<=>',
  '✓': 'OK', '✗': 'X', '✔': 'OK', '✘': 'X',
  '•': '*', '·': '.',
};

function asciifyForCode(code) {
  let out = '';
  for (const ch of code) {
    out += ASCII_REPLACEMENTS[ch] !== undefined ? ASCII_REPLACEMENTS[ch] : ch;
  }
  return out;
}

// ---------------------------------------------------------------------------
// 4. Markdown -> LaTeX (block-level)
// ---------------------------------------------------------------------------

function isHRule(line) {
  return /^\s*(?:-{3,}|_{3,}|\*{3,})\s*$/.test(line);
}

function isTableRow(line) {
  return /\|/.test(line) && !line.trim().startsWith('|') === false || /\|/.test(line);
}

function isTableSeparator(line) {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
}

function parseTableRow(line) {
  // Handle leading/trailing pipes.
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  return s.split('|').map((c) => c.trim());
}

function listIndent(line) {
  const m = line.match(/^(\s*)/);
  return m ? m[1].length : 0;
}

function isUnorderedListLine(line) {
  return /^\s*[-*]\s+/.test(line);
}

function isOrderedListLine(line) {
  return /^\s*\d+\.\s+/.test(line);
}

// Convert a list block (lines that pass isUnorderedListLine / isOrderedListLine,
// possibly nested) to LaTeX. Returns LaTeX string + number of consumed lines.
function consumeList(lines, start, ordered) {
  // Determine the base indent for this list level.
  const baseIndent = listIndent(lines[start]);
  const items = [];
  let i = start;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '') {
      // Blank line — peek ahead. If next is more list at same indent, keep going.
      let j = i + 1;
      while (j < lines.length && lines[j].trim() === '') j++;
      if (j < lines.length && (isUnorderedListLine(lines[j]) || isOrderedListLine(lines[j])) && listIndent(lines[j]) === baseIndent) {
        i = j;
        continue;
      }
      break;
    }
    const indent = listIndent(line);
    if (indent < baseIndent) break;

    if (indent === baseIndent && (ordered ? isOrderedListLine(line) : isUnorderedListLine(line))) {
      // New top-level item.
      const text = line.replace(ordered ? /^\s*\d+\.\s+/ : /^\s*[-*]\s+/, '');
      items.push({ text, sub: null });
      i++;
      continue;
    }

    if (indent > baseIndent && (isUnorderedListLine(line) || isOrderedListLine(line))) {
      // Nested list. Consume it and attach to the most recent item.
      const nestedOrdered = isOrderedListLine(line);
      const [nestedLatex, consumed] = consumeList(lines, i, nestedOrdered);
      if (items.length > 0) {
        items[items.length - 1].sub = (items[items.length - 1].sub || '') + '\n' + nestedLatex;
      }
      i = consumed;
      continue;
    }

    // Continuation line of the previous item (paragraph wrap).
    if (items.length > 0 && indent >= baseIndent && line.trim() !== '') {
      items[items.length - 1].text += ' ' + line.trim();
      i++;
      continue;
    }

    break;
  }

  const env = ordered ? 'enumerate' : 'itemize';
  let out = `\\begin{${env}}[leftmargin=*,nosep,topsep=2pt]`;
  for (const it of items) {
    out += `\n  \\item ${inline(it.text)}`;
    if (it.sub) out += '\n' + it.sub;
  }
  out += `\n\\end{${env}}`;
  return [out, i];
}

function consumeTable(lines, start) {
  const tableLines = [];
  let i = start;
  while (i < lines.length && /\|/.test(lines[i])) {
    tableLines.push(lines[i]);
    i++;
  }

  // The 2nd line should be the separator. If absent, treat as plain text.
  if (tableLines.length < 2) return [inline(tableLines.join(' ')), i];

  const header = parseTableRow(tableLines[0]);
  const rows = tableLines.slice(2).map(parseTableRow);

  const colCount = header.length;
  // Use tabularx with X cols to wrap text inside cells.
  const colSpec = '|' + 'X|'.repeat(colCount);

  let out = '\\begin{table}[H]\n\\centering\n\\small\n\\begin{tabularx}{\\textwidth}{' + colSpec + '}\n\\hline\n';
  out += header.map((h) => `\\textbf{${inline(h)}}`).join(' & ') + ' \\\\\n\\hline\n';
  for (const row of rows) {
    // Pad short rows so column count matches.
    while (row.length < colCount) row.push('');
    out += row.slice(0, colCount).map((c) => inline(c)).join(' & ') + ' \\\\\n\\hline\n';
  }
  out += '\\end{tabularx}\n\\end{table}';
  return [out, i];
}

function consumeCodeBlock(lines, start) {
  // Opening fence consumed by caller: we receive `start` on the line AFTER ```.
  const codeLines = [];
  let i = start;
  while (i < lines.length && !lines[i].startsWith('```')) {
    codeLines.push(lines[i]);
    i++;
  }
  const code = asciifyForCode(codeLines.join('\n'));
  // Close lstlisting block. Consumer skips the closing ``` themselves.
  const out = `\\begin{lstlisting}\n${code}\n\\end{lstlisting}`;
  return [out, i + 1]; // consume closing ```
}

function consumeBlockquote(lines, start) {
  const quoteLines = [];
  let i = start;
  while (i < lines.length && /^\s*>/.test(lines[i])) {
    quoteLines.push(lines[i].replace(/^\s*>\s?/, ''));
    i++;
  }
  const inner = inline(quoteLines.join(' '));
  const out = `\\begin{tcolorbox}[colback=quotebg,colframe=quoteborder,boxrule=0.6pt,arc=2pt,left=8pt,right=8pt,top=4pt,bottom=4pt]\n${inner}\n\\end{tcolorbox}`;
  return [out, i];
}

function mdBodyToLatex(md) {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Code block
    if (line.startsWith('```')) {
      const [latex, next] = consumeCodeBlock(lines, i + 1);
      out.push(latex);
      i = next;
      continue;
    }

    // Blockquote
    if (/^\s*>/.test(line)) {
      const [latex, next] = consumeBlockquote(lines, i);
      out.push(latex);
      i = next;
      continue;
    }

    // Horizontal rule
    if (isHRule(line)) {
      out.push('\\vspace{0.4em}\\noindent\\rule{\\linewidth}{0.4pt}\\vspace{0.4em}');
      i++;
      continue;
    }

    // Heading
    const h = line.match(/^(#{2,6})\s+(.*)$/);
    if (h) {
      const level = h[1].length;
      const text = inline(h[2]);
      // We reserve \section* for the doc title (frontmatter).
      // ## -> \subsection*, ### -> \subsubsection*, #### -> \paragraph*
      if (level === 2) out.push(`\\subsection*{${text}}`);
      else if (level === 3) out.push(`\\subsubsection*{${text}}`);
      else out.push(`\\paragraph*{${text}}`);
      i++;
      continue;
    }

    // Table (header row + separator row)
    if (i + 1 < lines.length && /\|/.test(line) && isTableSeparator(lines[i + 1])) {
      const [latex, next] = consumeTable(lines, i);
      out.push(latex);
      i = next;
      continue;
    }

    // Lists
    if (isUnorderedListLine(line)) {
      const [latex, next] = consumeList(lines, i, false);
      out.push(latex);
      i = next;
      continue;
    }
    if (isOrderedListLine(line)) {
      const [latex, next] = consumeList(lines, i, true);
      out.push(latex);
      i = next;
      continue;
    }

    // Blank line
    if (line.trim() === '') {
      out.push('');
      i++;
      continue;
    }

    // Paragraph: gather lines until blank / block start.
    const para = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].startsWith('```') &&
      !/^\s*>/.test(lines[i]) &&
      !/^#{2,6}\s+/.test(lines[i]) &&
      !isHRule(lines[i]) &&
      !isUnorderedListLine(lines[i]) &&
      !isOrderedListLine(lines[i]) &&
      !(i + 1 < lines.length && /\|/.test(lines[i]) && isTableSeparator(lines[i + 1]))
    ) {
      para.push(lines[i]);
      i++;
    }
    out.push(inline(para.join(' ')));
    out.push('');
  }

  return out.join('\n').replace(/\n{3,}/g, '\n\n');
}

// ---------------------------------------------------------------------------
// 5. Doc-level rendering
// ---------------------------------------------------------------------------

function renderDoc(slug) {
  const file = path.join(DOCS_ROOT, `${slug}.md`);
  if (!fs.existsSync(file)) {
    console.warn(`[skip] missing doc: ${slug}`);
    return '';
  }
  const raw = fs.readFileSync(file, 'utf8');
  const { meta, body } = parseFrontmatter(raw);
  const title = meta.title || slug;
  const desc = meta.description || '';

  let out = `\n\n% --- ${slug} ---\n`;
  // Each doc starts on a new page (\section is configured to clearpage in preamble).
  out += `\\section{${escapeLatex(title)}}\n`;
  if (desc) {
    out += `\\noindent\\textit{${inline(desc)}}\n\n\\vspace{0.6em}\n`;
  }
  out += mdBodyToLatex(body);
  return out;
}

function renderChapter(chapter) {
  let out = `\n\n\\chapter{${escapeLatex(chapter.title)}}\n`;
  for (const slug of chapter.docs) {
    out += renderDoc(slug);
  }
  return out;
}

function renderPart(part) {
  let out = `\n\n\\part{${escapeLatex(part.title)}}\n`;
  if (part.intro) {
    out += `\\noindent ${inline(part.intro)}\n\n`;
  }
  for (const ch of part.chapters) {
    out += renderChapter(ch);
  }
  return out;
}

// ---------------------------------------------------------------------------
// 6. Preamble — keep all visual choices in one place so it's easy to tweak.
// ---------------------------------------------------------------------------

function preamble(cfg) {
  const author = cfg.author || 'HLD Notes';
  const title = cfg.title || 'HLD Cheatsheet';
  const subtitle = cfg.subtitle || '';

  return `\\documentclass[11pt,oneside]{report}

% ---------- Page geometry ----------
\\usepackage[a4paper,margin=2.3cm,top=2.5cm,bottom=2.5cm,headheight=15pt]{geometry}

% ---------- Fonts (XeLaTeX / LuaLaTeX) ----------
\\usepackage{fontspec}
\\setmainfont{Latin Modern Roman}
\\setsansfont{Latin Modern Sans}
\\setmonofont{DejaVu Sans Mono}[Scale=MatchLowercase]

% ---------- Microtype + good defaults ----------
\\usepackage{microtype}
\\usepackage{parskip}
\\setlength{\\parskip}{0.5em}
\\setlength{\\parindent}{0pt}

% ---------- Colour palette ----------
\\usepackage{xcolor}
\\definecolor{primary}{HTML}{1E3A8A}
\\definecolor{accent}{HTML}{2563EB}
\\definecolor{secondary}{HTML}{4F46E5}
\\definecolor{muted}{HTML}{475569}
\\definecolor{codebg}{HTML}{F1F5F9}
\\definecolor{codeborder}{HTML}{CBD5E1}
\\definecolor{quotebg}{HTML}{FEF3C7}
\\definecolor{quoteborder}{HTML}{D97706}
\\definecolor{linkcolor}{HTML}{2563EB}
\\definecolor{tableheader}{HTML}{E0E7FF}

% ---------- Hyperlinks ----------
\\usepackage[unicode,breaklinks=true]{hyperref}
\\hypersetup{
  colorlinks=true,
  linkcolor=primary,
  citecolor=primary,
  urlcolor=accent,
  pdftitle={${escapeLatex(title)}},
  pdfauthor={${escapeLatex(author)}},
  pdfsubject={High Level Design Interview Preparation}
}

% ---------- Code listings ----------
\\usepackage{listings}
\\lstdefinestyle{nicecode}{
  basicstyle=\\ttfamily\\footnotesize,
  backgroundcolor=\\color{codebg},
  commentstyle=\\color{muted}\\itshape,
  keywordstyle=\\color{secondary}\\bfseries,
  stringstyle=\\color{primary},
  numbers=none,
  breaklines=true,
  breakatwhitespace=false,
  keepspaces=true,
  showspaces=false,
  showstringspaces=false,
  showtabs=false,
  tabsize=2,
  frame=single,
  framerule=0.4pt,
  rulecolor=\\color{codeborder},
  framesep=6pt,
  xleftmargin=4pt,
  xrightmargin=4pt,
  upquote=true,
  columns=fullflexible
}
\\lstset{style=nicecode}

% ---------- Boxes (for blockquotes etc.) ----------
\\usepackage{tcolorbox}
\\tcbuselibrary{breakable}
\\tcbset{breakable}

% ---------- Tables ----------
\\usepackage{tabularx}
\\usepackage{array}
\\usepackage{float}
\\renewcommand{\\arraystretch}{1.2}

% ---------- Lists ----------
\\usepackage{enumitem}
\\setlist{itemsep=2pt, parsep=2pt, topsep=4pt}

% ---------- Strike through ----------
\\usepackage[normalem]{ulem}

% ---------- Section formatting ----------
\\usepackage{titlesec}
\\titleformat{\\part}[display]
  {\\Huge\\bfseries\\color{primary}}
  {\\partname~\\thepart}{20pt}{\\Huge}
\\titleformat{\\chapter}[hang]
  {\\huge\\bfseries\\color{accent}}
  {\\thechapter}{1em}{}
\\titleformat{\\section}[hang]
  {\\LARGE\\bfseries\\color{primary}}{}{0em}{}
\\titlespacing*{\\chapter}{0pt}{*1}{*1}
\\titlespacing*{\\section}{0pt}{*0.5}{*0.4}

% Each \\section starts on a new page (one logical doc per page).
\\let\\oldsection\\section
\\renewcommand{\\section}{\\clearpage\\oldsection}

% ---------- Page headers ----------
\\usepackage{fancyhdr}
\\pagestyle{fancy}
\\fancyhf{}
\\fancyhead[L]{\\small\\nouppercase{\\rightmark}}
\\fancyhead[R]{\\small\\thepage}
\\renewcommand{\\headrulewidth}{0.4pt}
\\renewcommand{\\headrule}{\\color{codeborder}\\hrule width\\textwidth height\\headrulewidth}

% ---------- Widow / orphan control ----------
\\widowpenalty=10000
\\clubpenalty=10000
\\raggedbottom

\\title{${escapeLatex(title)}}
\\author{${escapeLatex(author)}}
\\date{}

\\begin{document}

% ---------- Cover page ----------
\\begin{titlepage}
  \\centering
  \\vspace*{4cm}
  {\\Huge\\bfseries\\color{primary} ${escapeLatex(title)}\\par}
  \\vspace{1cm}
  {\\Large\\itshape\\color{muted} ${escapeLatex(subtitle)}\\par}
  \\vfill
  {\\large ${escapeLatex(author)}\\par}
  \\vspace{0.5cm}
  {\\small Generated \\today\\par}
\\end{titlepage}

\\tableofcontents
\\clearpage
`;
}

function postamble() {
  return `\n\n\\end{document}\n`;
}

// ---------------------------------------------------------------------------
// 7. Main
// ---------------------------------------------------------------------------

function main() {
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error(`Config not found: ${CONFIG_PATH}`);
    process.exit(1);
  }
  const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

  let tex = preamble(cfg);
  for (const part of cfg.parts) {
    tex += renderPart(part);
  }
  tex += postamble();

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_TEX, tex, 'utf8');

  // Human-readable size summary.
  const stats = fs.statSync(OUT_TEX);
  const docCount = cfg.parts.reduce(
    (sum, p) => sum + p.chapters.reduce((s, c) => s + c.docs.length, 0),
    0,
  );
  console.log(`Wrote ${path.relative(ROOT, OUT_TEX)}`);
  console.log(`  ${(stats.size / 1024).toFixed(1)} KB · ${docCount} docs across ${cfg.parts.length} parts`);
  console.log(`  Compiler: ${cfg.compiler || 'xelatex'}`);
  console.log('\nNext steps:');
  console.log('  1. Open Overleaf -> New Project -> Upload Project');
  console.log(`  2. Upload ${path.relative(ROOT, OUT_TEX)}`);
  console.log(`  3. Set the compiler to ${cfg.compiler || 'XeLaTeX'} (Menu -> Settings).`);
  console.log('  4. Click Recompile. The first run is slow; subsequent ones are fast.');
}

main();
