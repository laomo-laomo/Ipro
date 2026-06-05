/**
 * Object storage config
 *
 * Priority:
 * 1. Tencent Cloud COS
 * 2. Alibaba Cloud OSS
 * 3. Local file storage (development fallback)
 */

import path from 'path';
import fs from 'fs';
import { existsSync, mkdirSync } from 'fs';
import type OSS from 'ali-oss';
import OSSClient from 'ali-oss';
import COS from 'cos-nodejs-sdk-v5';

const LOCAL_UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads');

if (!existsSync(LOCAL_UPLOAD_DIR)) {
  mkdirSync(LOCAL_UPLOAD_DIR, { recursive: true });
}

const isCOSConfigured = () => {
  return !!(
    process.env.COS_SECRET_ID &&
    process.env.COS_SECRET_KEY &&
    process.env.COS_BUCKET &&
    process.env.COS_REGION
  );
};

const isOSSConfigured = () => {
  return !!(
    process.env.OSS_ACCESS_KEY_ID &&
    process.env.OSS_ACCESS_KEY_SECRET &&
    process.env.OSS_BUCKET
  );
};

const getOssConfig = () => ({
  accessKeyId: process.env.OSS_ACCESS_KEY_ID || '',
  accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET || '',
  bucket: process.env.OSS_BUCKET || 'ipro',
  region: process.env.OSS_REGION || 'cn-shanghai',
});

const getCosConfig = () => ({
  secretId: process.env.COS_SECRET_ID || '',
  secretKey: process.env.COS_SECRET_KEY || '',
  bucket: process.env.COS_BUCKET || '',
  region: process.env.COS_REGION || '',
  publicBaseUrl: process.env.COS_PUBLIC_BASE_URL || '',
});

let ossClient: OSS | null = null;
let cosClient: COS | null = null;

export function getOSSClient(): OSS | null {
  if (!isOSSConfigured()) {
    return null;
  }
  if (!ossClient) {
    const cfg = getOssConfig();
    ossClient = new OSSClient({
      ...cfg,
    });
  }
  return ossClient;
}

export function getCOSClient(): COS | null {
  if (!isCOSConfigured()) {
    return null;
  }
  if (!cosClient) {
    const cfg = getCosConfig();
    cosClient = new COS({
      SecretId: cfg.secretId,
      SecretKey: cfg.secretKey,
    });
  }
  return cosClient;
}

export function getOSSUrl(key: string): string {
  const cfg = getOssConfig();
  return `https://${cfg.bucket}.oss-${cfg.region}.aliyuncs.com/${key}`;
}

export function getCOSUrl(key: string): string {
  const cfg = getCosConfig();
  if (cfg.publicBaseUrl) {
    return `${cfg.publicBaseUrl.replace(/\/$/, '')}/${key}`;
  }
  return `https://${cfg.bucket}.cos.${cfg.region}.myqcloud.com/${key}`;
}

async function uploadToCOS(
  key: string,
  buffer: Buffer,
  options?: { contentType?: string }
): Promise<{ url: string; key: string }> {
  const client = getCOSClient();
  if (!client) {
    throw new Error('COS is not configured');
  }
  const cfg = getCosConfig();

  await client.putObject({
    Bucket: cfg.bucket,
    Region: cfg.region,
    Key: key,
    Body: buffer,
    ContentType: options?.contentType,
  });

  return { url: getCOSUrl(key), key };
}

async function uploadToOSS(
  key: string,
  buffer: Buffer,
  options?: { contentType?: string }
): Promise<{ url: string; key: string }> {
  const client = getOSSClient();
  if (!client) {
    throw new Error('OSS is not configured');
  }

  const result = await client.put(key, buffer, {
    headers: options?.contentType ? { 'Content-Type': options.contentType } : undefined,
  });

  return { url: result.url, key };
}

function uploadToLocal(
  key: string,
  buffer: Buffer
): { url: string; key: string } {
  const localPath = path.join(LOCAL_UPLOAD_DIR, key);
  const dir = path.dirname(localPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(localPath, buffer);
  return { url: `/uploads/${key}`, key };
}

export async function uploadFile(
  key: string,
  buffer: Buffer,
  options?: { contentType?: string }
): Promise<{ url: string; key: string }> {
  if (isCOSConfigured()) {
    return uploadToCOS(key, buffer, options);
  }

  if (isOSSConfigured()) {
    return uploadToOSS(key, buffer, options);
  }

  return uploadToLocal(key, buffer);
}

export const isUsingLocalStorage = () => !isCOSConfigured() && !isOSSConfigured();
export const getStorageProvider = () => {
  if (isCOSConfigured()) return 'cos';
  if (isOSSConfigured()) return 'oss';
  return 'local';
};

export default {
  getOSSClient,
  getCOSClient,
  getOSSUrl,
  getCOSUrl,
  uploadFile,
  getOssConfig,
  getCosConfig,
  isUsingLocalStorage,
  getStorageProvider,
};