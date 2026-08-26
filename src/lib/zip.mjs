/**
 * Escritor de ZIP sin dependencias.
 *
 * Node trae `zlib` pero no un empaquetador de ZIP, así que se arma el
 * contenedor a mano: cabecera local por archivo, directorio central y EOCD,
 * con los datos comprimidos por deflate.
 *
 * Lo usan dos cosas distintas: el .docx —que es un ZIP con tres piezas XML— y
 * la carpeta de respaldo cuando se pide en un solo archivo descargable. Por
 * eso acepta tanto texto como Buffer: adentro pueden ir PDF y documentos Word.
 */
import { deflateRawSync } from 'node:zlib';

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

/**
 * @param {Array<[string, string|Buffer]>} entradas pares [ruta dentro del zip, contenido]
 * @returns {Buffer}
 */
export function armarZip(entradas) {
  const { hora, fecha } = fechaDos();
  const locales = [];
  const centrales = [];
  let offset = 0;

  for (const [nombre, contenido] of entradas) {
    const crudo = Buffer.isBuffer(contenido) ? contenido : Buffer.from(contenido, 'utf8');
    const comprimido = deflateRawSync(crudo);
    const crc = crc32(crudo);
    // Los nombres van en UTF-8 y hay que decirlo con el bit 11, o Windows
    // muestra los acentos rotos al abrir el archivo.
    const nom = Buffer.from(nombre, 'utf8');
    const banderas = 0x0800;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // versión necesaria
    local.writeUInt16LE(banderas, 6);
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
    central.writeUInt16LE(banderas, 8);
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
