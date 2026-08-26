/**
 * Escritor mínimo de .docx, sin dependencias.
 *
 * Un .docx es un ZIP con tres piezas XML obligatorias. El contenedor lo arma
 * `zip.mjs`, que también empaqueta la carpeta de respaldo. Se prefirió esto
 * antes que sumar una dependencia: el archivo lo va a abrir un abogado en
 * Word, y conviene que la instalación no dependa de nada más.
 *
 * Verificado abriendo el resultado con Word.
 */
import { armarZip } from './zip.mjs';

/* ── WordprocessingML ────────────────────────────────────────────────── */

const esc = (t) =>
  String(t ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // Word rechaza el documento entero si aparece un carácter de control.
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');

/**
 * @param {object} p
 * @param {string} [p.texto]
 * @param {boolean} [p.negrita]
 * @param {boolean} [p.cursiva]
 * @param {number} [p.tamano] en puntos
 * @param {boolean} [p.sangria] para citas textuales en bloque
 * @param {string} [p.enlace] muestra la URL como texto (Word la vuelve
 *   clicable al abrir); se evita así una relación extra en el paquete.
 */
function parrafo(p) {
  const rPr =
    '<w:rPr>' +
    (p.negrita ? '<w:b/>' : '') +
    (p.cursiva ? '<w:i/>' : '') +
    (p.color ? `<w:color w:val="${p.color}"/>` : '') +
    (p.tamano ? `<w:sz w:val="${p.tamano * 2}"/><w:szCs w:val="${p.tamano * 2}"/>` : '') +
    '</w:rPr>';
  const pPr =
    '<w:pPr>' +
    (p.sangria ? '<w:ind w:left="567" w:right="567"/>' : '') +
    '<w:spacing w:after="120"/>' +
    (p.justificado ? '<w:jc w:val="both"/>' : '') +
    rPr +
    '</w:pPr>';
  return `<w:p>${pPr}<w:r>${rPr}<w:t xml:space="preserve">${esc(p.texto)}</w:t></w:r></w:p>`;
}

const TIPOS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

/**
 * Construye un .docx a partir de una lista de párrafos.
 * @param {Array<object>} parrafos ver parrafo()
 * @returns {Buffer}
 */
export function crearDocx(parrafos) {
  const cuerpo = parrafos.map(parrafo).join('');
  const documento = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>${cuerpo}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1418" w:right="1418" w:bottom="1418" w:left="1418"/></w:sectPr></w:body>
</w:document>`;

  return armarZip([
    ['[Content_Types].xml', TIPOS],
    ['_rels/.rels', RELS],
    ['word/document.xml', documento],
  ]);
}
