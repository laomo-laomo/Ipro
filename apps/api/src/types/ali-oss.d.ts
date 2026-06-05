declare module 'ali-oss' {
  export interface PutOptions {
    headers?: Record<string, string> | undefined;
  }

  export interface PutResult {
    url: string;
    name?: string;
  }

  export interface OSSOptions {
    accessKeyId: string;
    accessKeySecret: string;
    bucket: string;
    region: string;
  }

  export default class OSS {
    constructor(options: OSSOptions);
    put(name: string, file: Buffer | Uint8Array, options?: PutOptions): Promise<PutResult>;
  }
}
