import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { readConfig } from '../src/config.js';

let root: string;
let app: ReturnType<typeof buildApp>;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'bang-web-'));
  await mkdir(join(root, 'assets'));
  await writeFile(join(root, 'index.html'), '<!doctype html><title>Bang!</title>');
  await writeFile(join(root, 'assets', 'index-abc123.js'), 'console.log(1);');
  await writeFile(join(tmpdir(), 'bang-outside.txt'), 'secret');
  app = buildApp(readConfig({ LOG_LEVEL: 'silent', WEB_DIST_DIR: root }));
});

afterAll(async () => {
  await app.close();
  await rm(root, { recursive: true, force: true });
  await rm(join(tmpdir(), 'bang-outside.txt'), { force: true });
});

describe('built web client', () => {
  it.each(['/', '/room/ABCDEFGHJK', '/room/ABCDEFGHJK?x=1'])(
    'serves index.html for %s',
    async (url) => {
      const response = await app.inject({ method: 'GET', url });
      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/html');
      expect(response.headers['cache-control']).toBe('no-cache');
      expect(response.body).toContain('<title>Bang!</title>');
    },
  );

  it('serves hashed assets as immutable', async () => {
    const response = await app.inject({ method: 'GET', url: '/assets/index-abc123.js' });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('javascript');
    expect(response.headers['cache-control']).toBe('public, max-age=31536000, immutable');
  });

  it.each(['/assets/missing.js', '/api/unknown', '/socket.io/nope'])(
    'keeps a JSON 404 for %s',
    async (url) => {
      const response = await app.inject({ method: 'GET', url });
      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: 'not_found' });
    },
  );

  it('does not serve files outside the client directory', async () => {
    for (const url of ['/../bang-outside.txt', '/%2e%2e/bang-outside.txt']) {
      const response = await app.inject({ method: 'GET', url });
      expect(response.body).not.toContain('secret');
    }
  });

  it('keeps API routes working', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/health' })).statusCode).toBe(200);
  });
});
