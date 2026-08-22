/**
 * Escritor mínimo de .docx, sin dependencias.
 *
 * Un .docx es un ZIP con tres piezas XML obligatorias. Node no trae un
 * escritor de ZIP, pero sí `zlib`, así que se arma el contenedor a mano
 * (cabecera local + directorio central + EOCD, método deflate). Se prefirió
 * esto antes que sumar una dependencia: el archivo lo va a abrir un abogado
 * en Word, y conviene que la instalación no dependa de nada más.
 *
 * Verificado abriendo el resultado con Word.
 */
import { deflateRawSync } from 'node:zlib';

/* ── ZIP ─────────────────────────────────────────────────────────────── */

const TABLA_CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = TABLA_CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

/** Fecha y hora en el formato MS-DOS que usa el ZIP. */
function fechaDos(d = new Date()) {
  const hora = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const fecha = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { hora, fecha };
}

function armarZip(entradas) {
  const { hora, fecha } = fechaDos();
  const locales = [];
  const centrales = [];
  let offset = 0;

  for (const [nombre, contenido] of entradas) {
    const crudo = Buffer.from(contenido, 'utf8');
    const comprimido = deflateRawSync(crudo);
    const crc = crc32(crudo);
    const nom = Buffer.from(nombre, 'utf8');

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // versión necesaria
    local.writeUInt16LE(0, 6); // sin banderas
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(hora, 10);
    local.writeUInt16LE(fecha, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comprimido.length, 18);
    local.writeUInt32LE(crudo.length, 22);
    local.writeUInt16LE(nom.length, 26);
    local.writeUInt16LE(0, 28);
    locales.push(local, nom, comprimido);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(hora, 12);
    central.writeUInt16LE(fecha, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(comprimido.length, 20);
    central.writeUInt32LE(crudo.length, 24);
    central.writeUInt16LE(nom.length, 28);
    central.writeUInt32LE(0, 38); // atributos externos
    central.writeUInt32LE(offset, 42);
    centrales.push(central, nom);

    offset += local.length + nom.length + comprimido.length;
  }

  const cuerpo = Buffer.concat(locales);
  const directorio = Buffer.concat(centrales);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  fin.writeUInt16LE(entradas.length, 8);
  fin.writeUInt16LE(entradas.length, 10);
  fin.writeUInt32LE(directorio.length, 12);
  fin.writeUInt32LE(cuerpo.length, 16);

  return Buffer.concat([cuerpo, directorio, fin]);
}

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
