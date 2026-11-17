

import {
  S3Client,
  CreateBucketCommand,
  HeadBucketCommand,
  PutObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

function _env(key, fallback) {
  const v = process.env[key];
  return v === undefined || v === '' ? fallback : v;
}

const isProduction = () => process.env.ENVIRONMENT === 'production';

function _requiredSecret(key) {
  const v = process.env[key];
  if (v !== undefined && v !== '') return v;
  if (isProduction()) {
    throw new Error(
      `${key} is required when ENVIRONMENT=production. ` +
        `Set it in the environment; it is never baked into the source.`,
    );
  }
  return undefined;
}

const config = () => ({
  endpoint: `${_env('MINIO_USE_SSL', 'false') === 'true' ? 'https' : 'http'}://${_env('MINIO_ENDPOINT', 'localhost')}:${_env('MINIO_PORT', '9000')}`,
  region: _env('MINIO_REGION', 'us-east-1'),
  forcePathStyle: true,




  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
  credentials: {
    accessKeyId: _requiredSecret('MINIO_ACCESS_KEY'),
    secretAccessKey: _requiredSecret('MINIO_SECRET_KEY'),
  },
});




export const BUCKETS = {
  uploads: _env('MINIO_BUCKET_UPLOADS', 'learnai'),
  avatars: _env('MINIO_BUCKET_AVATARS', 'learnai'),
};

let _client = null;
export function getS3Client() {
  if (!_client) _client = new S3Client(config());
  return _client;
}


let _publicClient = null;
function _getPublicS3Client() {
  if (_publicClient) return _publicClient;
  const publicEndpoint = _env('MINIO_PUBLIC_ENDPOINT', null);
  if (!publicEndpoint) {
    _publicClient = getS3Client();
    return _publicClient;
  }
  _publicClient = new S3Client({
    ...config(),
    endpoint: publicEndpoint,
  });
  return _publicClient;
}


export async function ensureMinioBuckets() {
  const c = getS3Client();
  for (const name of Object.values(BUCKETS)) {
    try {
      await c.send(new HeadBucketCommand({ Bucket: name }));
    } catch (e) {

      const status = e?.$metadata?.httpStatusCode;
      if (status !== 404 && !String(e?.name || '').includes('NotFound')) {

        if (!String(e?.message || '').includes('NotFound')) {
          throw e;
        }
      }
      await c.send(new CreateBucketCommand({ Bucket: name }));
    }
  }
}


export async function putObject({ bucket, key, body, contentType }) {
  return getS3Client().send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: contentType || 'application/octet-stream',
  }));
}


export async function deleteObject({ bucket, key }) {
  return getS3Client().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}


export async function presignGet({ bucket, key, expiresIn = 300 }) {
  return getSignedUrl(_getPublicS3Client(), new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn });
}


export async function presignPut({ bucket, key, contentType, expiresIn = 900 }) {
  const cmd = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType || 'application/octet-stream',
  });
  return getSignedUrl(_getPublicS3Client(), cmd, { expiresIn });
}


export async function headObject({ bucket, key }) {
  return getS3Client().send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
}


export function buildObjectKey({ category, userId, courseId, originalName }) {
  const safe = String(originalName || 'file').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 80);
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 10);
  const pathParts = [];
  if (category === 'avatar' && userId) pathParts.push(`avatars/${userId}`);
  else if (category === 'course_material' && courseId) pathParts.push(`uploads/${courseId}`);
  else if (category === 'course_thumbnail' && courseId) pathParts.push(`thumbnails/${courseId}`);
  else pathParts.push(`other`);
  pathParts.push(`${ts}-${rand}-${safe}`);
  return pathParts.join('/');
}