// 请求的定义
export interface Packet {
  id: number;
  isRequest: boolean;
  value: Value;
}

export interface PingRequest {
  command: 'ping';
}

export interface TransformRequest {
  command: 'transform';
  flags: string[];
  input: string;
  inputFS: boolean;
}

export type Value =
  | null
  | boolean
  | number
  | string
  | Uint8Array
  | Value[]
  | { [key: string]: Value };

export interface TransformResponse {
  errors: Message[];
  warnings: Message[];

  code: string;
  codeFS: boolean;

  map: string;
  mapFS: boolean;
}

export interface Location {
  file: string;
  namespace: string;
  /** 1-based */
  line: number;
  /** 0-based, in bytes */
  column: number;
  /** in bytes */
  length: number;
  lineText: string;
  suggestion: string;
}

export interface Note {
  text: string;
  location: Location | null;
}

export interface Message {
  pluginName: string;
  text: string;
  location: Location | null;
  notes: Note[];

  /**
   * Optional user-specified data that is passed through unmodified. You can
   * use this to stash the original error, for example.
   */
  detail: any;
}
