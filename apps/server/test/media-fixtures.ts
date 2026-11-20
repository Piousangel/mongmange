// 시험용 미디어 바이트(진짜 인코더 없이 상자·마커만). commit 검사가 보는 부분만 정확하고 내용은 0 채움.

const be32 = (n: number) => Buffer.from([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
const box = (type: string, ...body: Buffer[]) => {
  const b = Buffer.concat(body);
  return Buffer.concat([be32(8 + b.length), Buffer.from(type, 'latin1'), b]);
};

/** JPEG: SOI + APP0 + SOF0(높이·너비) + 채움. 크기를 맞추려면 pad */
export function jpeg(width: number, height: number, pad = 2000): Buffer {
  const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]);
  const sof = Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 255, width >> 8, width & 255, 0x03, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof, Buffer.alloc(pad), Buffer.from([0xff, 0xd9])]);
}

export interface Mp4Opts {
  /** moov가 mdat 뒤(faststart 아님) */
  moovLast?: boolean;
  seconds?: number;
  timescale?: number;
  width?: number;
  height?: number;
  /** 트랙 handler 목록(기본 ['vide']) */
  tracks?: string[];
  /** mdat 내용 바이트 */
  mdatBytes?: number;
  /** 최상위 상자 하나를 크기 0(파일 끝까지)으로 */
  zeroSizeMdat?: boolean;
  /** mdat을 64비트 largesize로 */
  largeMdat?: boolean;
  /** moov를 64KB보다 크게(udta 채움) */
  bigMoov?: boolean;
  mvhdV1?: boolean;
}

function trak(handler: string, w: number, h: number): Buffer {
  const tkhd = Buffer.alloc(84);
  tkhd.writeUInt32BE(w * 65536, 76);
  tkhd.writeUInt32BE(h * 65536, 80);
  const hdlr = Buffer.concat([Buffer.alloc(8), Buffer.from(handler, 'latin1'), Buffer.alloc(13)]);
  return box('trak', box('tkhd', tkhd), box('mdia', box('mdhd', Buffer.alloc(24)), box('hdlr', hdlr)));
}

export function mp4(o: Mp4Opts = {}): Buffer {
  const ts = o.timescale ?? 1000;
  const dur = Math.round((o.seconds ?? 8) * ts);
  let mvhd: Buffer;
  if (o.mvhdV1) {
    mvhd = Buffer.alloc(112);
    mvhd[0] = 1;
    mvhd.writeUInt32BE(ts, 20);
    mvhd.writeUInt32BE(0, 24);
    mvhd.writeUInt32BE(dur, 28);
  } else {
    mvhd = Buffer.alloc(100);
    mvhd.writeUInt32BE(ts, 12);
    mvhd.writeUInt32BE(dur, 16);
  }
  const traks = (o.tracks ?? ['vide']).map((t) => trak(t, o.width ?? 540, o.height ?? 676));
  const moov = box('moov', box('mvhd', mvhd), ...traks, ...(o.bigMoov ? [box('udta', Buffer.alloc(70_000))] : []));
  const ftyp = box('ftyp', Buffer.from('isom\0\0\x02\0isomiso2avc1mp41', 'latin1'));
  const payload = Buffer.alloc(o.mdatBytes ?? 4000, 7);
  let mdat = box('mdat', payload);
  if (o.zeroSizeMdat) mdat = Buffer.concat([be32(0), Buffer.from('mdat'), payload]);
  if (o.largeMdat) mdat = Buffer.concat([be32(1), Buffer.from('mdat'), be32(0), be32(16 + payload.length), payload]);
  return o.moovLast ? Buffer.concat([ftyp, mdat, moov]) : Buffer.concat([ftyp, moov, mdat]);
}
