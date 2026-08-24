/**
 * Lexical JSON → WordPress-style HTML Converter (zero-dependency)
 *
 * Converts Payload CMS Lexical rich-text JSON trees into WordPress Gutenberg
 * block-compatible HTML with proper <!-- wp:* --> comments and CSS classes.
 *
 * Text format bitmask (from Lexical):
 *   1  = bold       2  = italic      4  = strikethrough
 *   8  = underline  16 = code        32 = subscript
 *   64 = superscript
 */

// ─── Helpers ────────────────────────────────────────────────────

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function applyTextFormat(html, format) {
  if (!format) return html;
  if (format & 16) html = `<code>${html}</code>`;
  if (format & 1) html = `<strong>${html}</strong>`;
  if (format & 2) html = `<em>${html}</em>`;
  if (format & 8) html = `<u>${html}</u>`;
  if (format & 4) html = `<s>${html}</s>`;
  if (format & 32) html = `<sub>${html}</sub>`;
  if (format & 64) html = `<sup>${html}</sup>`;
  return html;
}

function alignmentStyle(format) {
  const alignMap = {
    left: 'left', center: 'center', right: 'right', justify: 'justify',
    1: 'left', 2: 'center', 3: 'right', 4: 'justify',
  };
  return alignMap[format] || null;
}

// ─── Node Serializers ───────────────────────────────────────────

function serializeChildren(children) {
  if (!Array.isArray(children)) return '';
  return children.map(serializeNode).join('');
}

function serializeNode(node) {
  if (!node) return '';

  switch (node.type) {
    // ── Root ──
    case 'root':
      return serializeChildren(node.children);

    // ── Paragraph ──
    case 'paragraph': {
      const inner = serializeChildren(node.children);
      const align = alignmentStyle(node.format);

      // Build wp:paragraph attributes
      let wpAttrs = '';
      if (align && align !== 'left') {
        wpAttrs = ` {"align":"${align}"}`;
      }

      // Build HTML attributes
      let pAttrs = '';
      if (align && align !== 'left') {
        pAttrs = ` style="text-align: ${align};"`;
      }

      return `<!-- wp:paragraph${wpAttrs} -->\n<p${pAttrs}>${inner}</p>\n<!-- /wp:paragraph -->\n\n`;
    }

    // ── Heading ──
    case 'heading': {
      const tag = node.tag || 'h2';
      const level = parseInt(tag.replace('h', '')) || 2;
      const inner = serializeChildren(node.children);

      let wpAttrs = '';
      if (level !== 2) {
        wpAttrs = ` {"level":${level}}`;
      }

      return `<!-- wp:heading${wpAttrs} -->\n<${tag} class="wp-block-heading">${inner}</${tag}>\n<!-- /wp:heading -->\n\n`;
    }

    // ── Text ──
    case 'text': {
      const escaped = escapeHtml(node.text || '');
      return applyTextFormat(escaped, node.format || 0);
    }

    // ── Line break ──
    case 'linebreak':
      return '<br>';

    // ── Link ──
    case 'link': {
      const fields = node.fields || {};
      let href = '';

      if (fields.linkType === 'internal' && fields.doc) {
        const docValue = fields.doc.value;
        if (typeof docValue === 'object' && docValue.slug) {
          href = `/blog/${docValue.slug}`;
        } else {
          href = '#';
        }
      } else {
        href = fields.url || node.url || '#';
      }

      const target = fields.newTab ? ' target="_blank" rel="noopener noreferrer"' : '';
      const inner = serializeChildren(node.children);
      return `<a href="${escapeHtml(href)}"${target}>${inner}</a>`;
    }

    // ── Autolink ──
    case 'autolink': {
      const fields = node.fields || {};
      const href = fields.url || node.url || '#';
      const inner = serializeChildren(node.children);
      return `<a href="${escapeHtml(href)}">${inner}</a>`;
    }

    // ── List ──
    case 'list': {
      const isOrdered = node.listType === 'number';
      const tag = isOrdered ? 'ol' : 'ul';
      const inner = serializeChildren(node.children);

      let wpType = isOrdered ? '<!-- wp:list {"ordered":true} -->' : '<!-- wp:list -->';

      return `${wpType}\n<${tag} class="wp-block-list">${inner}</${tag}>\n<!-- /wp:list -->\n\n`;
    }

    // ── List Item ──
    case 'listitem': {
      const inner = serializeChildren(node.children);
      return `<!-- wp:list-item -->\n<li>${inner}</li>\n<!-- /wp:list-item -->\n\n`;
    }

    // ── Blockquote ──
    case 'quote': {
      const inner = serializeChildren(node.children);
      return `<!-- wp:quote -->\n<blockquote class="wp-block-quote">${inner}</blockquote>\n<!-- /wp:quote -->\n\n`;
    }

    // ── Horizontal Rule ──
    case 'horizontalrule':
      return `<!-- wp:separator -->\n<hr class="wp-block-separator"/>\n<!-- /wp:separator -->\n\n`;

    // ── Upload (images, PDFs, files) ──
    case 'upload': {
      const media = typeof node.value === 'object' ? node.value : null;
      if (!media) return '';

      // PDF or non-image file → WordPress file block
      if (media.mimeType && !media.mimeType.startsWith('image/')) {
        const fileUrl = escapeHtml(media.url);
        const downloadText = node.downloadText || 'Click here to Download Judgment';
        return `<!-- wp:file {"href":"${media.url}","displayPreview":false} -->\n<div class="wp-block-file"><a href="${fileUrl}" class="wp-block-file__button wp-element-button" download>${downloadText}</a></div>\n<!-- /wp:file -->\n\n`;
      }

      // Image → WordPress image block
      const alt = escapeHtml(media.alt || '');
      const imgUrl = escapeHtml(media.url);
      const caption = media.caption ? `<figcaption class="wp-element-caption">${escapeHtml(media.caption)}</figcaption>` : '';
      return `<!-- wp:image -->\n<figure class="wp-block-image"><img src="${imgUrl}" alt="${alt}" />${caption}</figure>\n<!-- /wp:image -->\n\n`;
    }

    // ── Block (mediaBlock, etc.) ──
    case 'block': {
      const blockType = node.fields?.blockType;

      if (blockType === 'mediaBlock') {
        const media = node.fields?.media;
        if (media && typeof media === 'object' && media.url) {
          // PDF / file
          if (media.mimeType && !media.mimeType.startsWith('image/')) {
            const fileUrl = escapeHtml(media.url);
            const blockId = node.fields?.id || '';
            const blockName = node.fields?.blockName || 'Click here to Download Judgment';
            const wpAttrs = blockId ? `{"id":"${blockId}","href":"${media.url}","displayPreview":false}` : `{"href":"${media.url}","displayPreview":false}`;
            return `<!-- wp:file ${wpAttrs} -->\n<div class="wp-block-file"><a href="${fileUrl}" class="wp-block-file__button wp-element-button" download>${blockName}</a></div>\n<!-- /wp:file -->\n\n`;
          }
          // Image
          const alt = escapeHtml(media.alt || '');
          const imgUrl = escapeHtml(media.url);
          const caption = node.fields?.caption
            ? `<figcaption class="wp-element-caption">${escapeHtml(node.fields.caption)}</figcaption>`
            : '';
          return `<!-- wp:image -->\n<figure class="wp-block-image"><img src="${imgUrl}" alt="${alt}" />${caption}</figure>\n<!-- /wp:image -->\n\n`;
        }
      }

      // Generic block fallback
      if (node.children) {
        return serializeChildren(node.children);
      }
      return '';
    }

    // ── Tab ──
    case 'tab':
      return '\t';

    // ── Unknown — try to recurse children ──
    default:
      if (node.children) {
        return serializeChildren(node.children);
      }
      return '';
  }
}

// ─── Public API ─────────────────────────────────────────────────

/**
 * Convert a Lexical JSON tree to WordPress Gutenberg-compatible HTML.
 * Accepts either { root: { children: [...] } } or the root node directly.
 *
 * @param {object} lexicalJson - The Lexical JSON content
 * @returns {string} WordPress-style HTML string with block comments
 */
export function lexicalToHtml(lexicalJson) {
  if (!lexicalJson) return '';

  const root = lexicalJson.root || lexicalJson;
  return serializeChildren(root.children || []).trim();
}
