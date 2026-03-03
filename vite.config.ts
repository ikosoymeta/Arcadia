import { defineConfig, Plugin } from 'vite'
import react from '@vitejs/plugin-react'

function claudeProxyPlugin(): Plugin {
  return {
    name: 'claude-proxy',
    configureServer(server) {
      server.middlewares.use('/api/claude', async (req, res) => {
        if (req.method !== 'POST') {
          res.writeHead(405);
          res.end('Method not allowed');
          return;
        }

        // Read request body
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          chunks.push(chunk as Buffer);
        }
        const body = Buffer.concat(chunks).toString();

        let data: any;
        try {
          data = JSON.parse(body);
        } catch {
          res.writeHead(400);
          res.end(JSON.stringify({ error: 'Invalid JSON' }));
          return;
        }

        const apiKey = data.apiKey;
        if (!apiKey) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: 'No API key provided' }));
          return;
        }

        // Remove apiKey from payload
        delete data.apiKey;
        const payload = JSON.stringify(data);

        try {
          const upstream = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': apiKey,
              'anthropic-version': '2023-06-01',
            },
            body: payload,
          });

          // Forward status and headers
          res.writeHead(upstream.status, {
            'Content-Type': upstream.headers.get('content-type') || 'application/json',
            'Cache-Control': 'no-cache',
          });

          if (data.stream && upstream.body) {
            // Stream the response
            const reader = upstream.body.getReader();
            const pump = async () => {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                res.write(value);
              }
              res.end();
            };
            pump().catch(() => res.end());
          } else {
            const text = await upstream.text();
            res.end(text);
          }
        } catch (err: any) {
          res.writeHead(502);
          res.end(JSON.stringify({ error: err.message || 'Proxy error' }));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), claudeProxyPlugin()],
  base: '/Arcadia/',
  server: {
    port: 5173,
  },
})
