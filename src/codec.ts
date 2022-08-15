import { Transform, TransformCallback } from 'stream';
import { Packet, Value } from './protocol';

enum DataType {
  NULL,
  BOOLEAN,
  NUMBER,
  STRING,
  UINT8_ARRAY,
  ARRAY,
  OBJECT,
}

const ESBUILD_VERSION = '0.13.15';

export class FixedLengthTransform extends Transform {
  private retain?: Buffer;
  _transform(
    chunk: Buffer,
    encoding: BufferEncoding,
    callback: TransformCallback,
  ): void {
    let buf = this.retain ? Buffer.concat([this.retain, chunk]) : chunk;
    while (buf.length) {
      const length = buf.readUInt32LE();
      if (buf.length - 4 < length) {
        break;
      }
      this.push(buf.slice(4, length + 4));
      buf = buf.slice(4 + length);
    }

    this.retain = buf;
    callback();
  }

  _flush(callback: TransformCallback): void {
    if (this.retain && this.retain.length) {
      this.push(this.retain);
    }
    callback();
  }
}

export class PacketTransform extends Transform {
  private validateVersion: boolean = false;

  constructor() {
    super({
      objectMode: true,
    });
  }

  _transform(
    chunk: Buffer,
    encoding: BufferEncoding,
    callback: TransformCallback,
  ): void {
    if (!this.validateVersion) {
      this.validateVersion = true;
      if (chunk.toString() !== ESBUILD_VERSION) {
        this.emit(
          'error',
          `Expected version is ${ESBUILD_VERSION} but received ${chunk.toString()}`,
        );
      }
      callback();
      return;
    }

    try {
      const packet = decode(new PacketBuffer(chunk));
      this.push(packet);
    } catch (error) {
      this.emit('error', error);
    } finally {
      callback();
    }
  }

  _flush(callback: TransformCallback): void {
    callback();
  }
}

export class PacketBuffer {
  private buffer: Buffer;
  private offset = 0;

  constructor(buffer?: Buffer) {
    this.buffer = buffer || Buffer.alloc(1024 * 4);
  }

  start() {
    this.writeUint32(0);
  }

  end() {
    // 开头处写入长度
    this.buffer.writeUInt32LE(this.offset - 4, 0);
  }

  slice() {
    return this.buffer.slice(0, this.offset);
  }

  writeUint32(num: number) {
    const offset = this.write(4);
    this.buffer.writeUInt32LE(num, offset);
  }

  writeUint8(num: number) {
    const offset = this.write(1);
    this.buffer.writeUInt8(num, offset);
  }

  writeString(str: string) {
    this.writeUint8Array(Buffer.from(str));
  }

  writeUint8Array(array: Uint8Array) {
    this.writeUint32(array.length);

    const offset = this.write(array.length);
    this.buffer.set(array, offset);
  }

  write(size: number) {
    if (size + this.offset > this.buffer.length - 1) {
      this.buffer = Buffer.concat([
        this.buffer,
        Buffer.alloc(this.buffer.length),
      ]);
    }
    const offset = this.offset;
    this.offset += size;
    return offset;
  }

  readUint8() {
    const offset = this.read(1);
    return this.buffer.readUInt8(offset);
  }

  readUint32() {
    const offset = this.read(4);
    return this.buffer.readUInt32LE(offset);
  }

  readString(length: number) {
    const offset = this.read(length);
    return this.buffer.slice(offset, offset + length).toString();
  }

  readUint8Array(length: number) {
    const offset = this.read(length);
    return this.buffer.slice(offset, offset + length);
  }

  read(size: number) {
    const offset = this.offset;
    this.offset += size;
    return offset;
  }
}

function serialize(buffer: PacketBuffer, value: Value) {
  if (value === null) {
    buffer.writeUint8(DataType.NULL);
  } else if (typeof value === 'boolean') {
    buffer.writeUint8(DataType.BOOLEAN);
    buffer.writeUint8(Number(value));
  } else if (typeof value === 'number') {
    buffer.writeUint8(DataType.NUMBER);
    buffer.writeUint32(value);
  } else if (typeof value === 'string') {
    buffer.writeUint8(DataType.STRING);
    buffer.writeString(value);
  } else if (value instanceof Uint8Array) {
    buffer.writeUint8(DataType.UINT8_ARRAY);
    buffer.writeUint8Array(value);
  } else if (Array.isArray(value)) {
    buffer.writeUint8(DataType.ARRAY);
    buffer.writeUint32(value.length);
    for (const item of value) {
      serialize(buffer, item);
    }
  } else {
    buffer.writeUint8(DataType.OBJECT);
    const entries = Object.entries(value).sort((a, b) => Number(a[0] > b[0]));
    buffer.writeUint32(entries.length);
    for (const [k, v] of entries) {
      buffer.writeString(k);
      serialize(buffer, v);
    }
  }
}

function deserialize(buffer: PacketBuffer): Value {
  const type = buffer.readUint8();
  let length: number;
  switch (type) {
    case 0:
      return null;
    case 1: // boolean
      return Boolean(buffer.readUint8());
    case 2: // number uint32
      return buffer.readUint32();
    case 3: // string
      length = buffer.readUint32();
      return buffer.readString(length);
    case 4: // uint8array
      length = buffer.readUint32();
      return buffer.readUint8Array(length);
    case 5: // array
      length = buffer.readUint32();
      const array = new Array(length);
      for (let i = 0; i < length; i++) {
        array[i] = deserialize(buffer);
      }
      return array;
    case 6: // object
      length = buffer.readUint32();
      const record: Record<string, any> = {};
      for (let i = 0; i < length; i++) {
        const keyLength = buffer.readUint32();
        const key = buffer.readUint8Array(keyLength).toString();
        record[key] = deserialize(buffer);
      }
      return record;
    default:
      throw new Error(`Unknown type ${type}`);
  }
}

export function encode(packet: Packet) {
  const buffer = new PacketBuffer();
  buffer.start();

  const id = packet.isRequest ? packet.id << 1 : (packet.id << 1) | 1;
  buffer.writeUint32(id);

  serialize(buffer, packet.value);
  buffer.end();
  return buffer.slice();
}

export function decode(buffer: PacketBuffer): Packet {
  const i = buffer.readUint32();
  const id = i >> 1;
  const isRequest = (i & 1) === 1;
  const value = deserialize(buffer);
  return {
    id,
    isRequest,
    value,
  };
}
