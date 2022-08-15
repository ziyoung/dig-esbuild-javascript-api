import { spawn } from 'child_process';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { Packet } from './protocol';
import { Rpc } from './rpc';

const packageName = `esbuild-${process.platform}-${process.arch.replace(
  'x64',
  '64',
)}`;

const binPath = join(process.cwd(), `node_modules`, packageName, 'bin/esbuild');
const tsCodePath = join(process.cwd(), 'fixture/test.ts');
const jsonPath = join(process.cwd(), 'package.json');

const esbuild = spawn(binPath, ['--service=0.13.15', '--ping'], {
  stdio: ['pipe', 'pipe', 'inherit'],
});

const rpc = new Rpc(esbuild.stdin, esbuild.stdout);

function printCode(packet: Packet) {
  if (
    packet.value &&
    packet.value instanceof Object &&
    'code' in packet.value
  ) {
    console.log(packet.value.code);
  }
}

async function run() {
  let buffer = await readFile(tsCodePath);
  let packet = await rpc.transformTs(buffer.toString());
  console.log('=== transformed ts file ===\n');
  printCode(packet);

  buffer = await readFile(jsonPath);
  packet = await rpc.transformJson(buffer.toString());
  console.log('=== transformed json file === \n');
  printCode(packet);

  esbuild.stdin.end();
}

run();
