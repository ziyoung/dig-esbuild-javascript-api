import assert from 'assert';
import { pipeline, Readable, Writable } from 'stream';
import { promisify } from 'util';
import { encode, FixedLengthTransform, PacketTransform } from './codec';
import { Packet } from './protocol';

// id 不能超过这个最大数值了
const MAX_ID = Math.pow(2, 31) - 1;

type Resolve = (packet: Packet) => void;
type Reject = (reason: any) => void;

export class Rpc {
  private id = 0;
  private resolvers: Map<number, [Resolve, Reject]> = new Map();
  private send: (packet: Packet) => Promise<void>;

  constructor(
    private readonly writer: Writable,
    private readonly reader: Readable,
  ) {
    this.init();
    this.send = promisify(
      (packet: Packet, callback: (err: Error | null | undefined) => void) => {
        this.writer.write(encode(packet), callback);
      },
    );
  }

  private init() {
    const transform = pipeline(
      this.reader,
      new FixedLengthTransform(),
      new PacketTransform(),
      (err) => {
        if (err) {
          console.error(err);
          throw err;
        }
      },
    );

    transform.on('data', (packet: Packet) => {
      const resolver = this.resolvers.get(packet.id);
      assert.ok(resolver);
      resolver[0](packet);
    });
  }

  private createTransformPacket(code: string, flags: string[]) {
    this.id++;
    const packet: Packet = {
      id: this.id,
      isRequest: true,
      value: {
        command: 'transform',
        inputFS: false,
        input: code,
        flags,
      },
    };
    return packet;
  }

  transformTs(code: string) {
    const packet = this.createTransformPacket(code, [
      '--format=cjs',
      '--loader=ts',
    ]);
    return this.transform(packet);
  }

  transformJson(code: string) {
    const packet = this.createTransformPacket(code, ['--loader=json']);
    return this.transform(packet);
  }

  private async transform(packet: Packet) {
    await this.send(packet);
    const { id } = packet;
    return new Promise<Packet>((resolve, reject) => {
      this.resolvers.set(id, [resolve, reject]);
    });
  }
}
