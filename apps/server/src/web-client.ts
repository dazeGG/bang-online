import fastifyStatic from '@fastify/static';
import type { FastifyInstance } from 'fastify';
import { relative, sep } from 'node:path';

const IMMUTABLE = 'public, max-age=31536000, immutable';

/**
 * Serves the built web client from the API process, so production needs one origin and one
 * container. Unknown non-API GET paths return index.html for client-side routes such as
 * /room/<CODE>; API and Socket.IO paths keep JSON 404 responses.
 */
export function registerWebClient(app: FastifyInstance, root: string) {
  void app.register(fastifyStatic, {
    root,
    index: false,
    wildcard: true,
    setHeaders(reply, filePath) {
      // Vite emits content-hashed file names under assets/.
      reply.header(
        'cache-control',
        relative(root, filePath).split(sep)[0] === 'assets' ? IMMUTABLE : 'no-cache',
      );
    },
  });

  // The static wildcard treats "/" as a directory listing request; serve the app shell instead.
  app.get('/', (_request, reply) =>
    reply.header('cache-control', 'no-cache').sendFile('index.html'),
  );

  app.setNotFoundHandler((request, reply) => {
    const path = request.url.split('?')[0] ?? '/';
    const isClientRoute =
      (request.method === 'GET' || request.method === 'HEAD') &&
      !path.startsWith('/api/') &&
      !path.startsWith('/socket.io/') &&
      !path.startsWith('/assets/');
    if (!isClientRoute) return reply.code(404).send({ error: 'not_found' });
    return reply.header('cache-control', 'no-cache').sendFile('index.html');
  });
}
