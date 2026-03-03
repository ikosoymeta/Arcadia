/**
 * Share utility — encode/decode conversations for URL-based sharing.
 *
 * Uses CompressionStream (deflate) + base64url to pack conversation data
 * into a URL hash fragment. This avoids any backend dependency.
 *
 * Format: #share=<base64url-encoded deflated JSON>
 */

import type { Conversation, Message } from '../types';

// Minimal shareable payload (strip unnecessary fields to save space)
interface SharePayload {
  t: string;           // title
  m: string;           // model
  ts: number;          // createdAt
  msgs: ShareMessage[];
}

interface ShareMessage {
  r: 'u' | 'a';       // role: user | assistant
  c: string;           // content
  ts: number;          // timestamp
}

/**
 * Compress a string using DeflateRaw via CompressionStream API.
 */
async function compress(input: string): Promise<Uint8Array> {
  const blob = new Blob([input]);
  const stream = blob.stream().pipeThrough(new CompressionStream('deflate-raw'));
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

/**
 * Decompress a DeflateRaw-compressed Uint8Array back to a string.
 */
async function decompress(data: Uint8Array): Promise<string> {
  const blob = new Blob([data.buffer as ArrayBuffer]);
  const stream = blob.stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder().decode(result);
}

/**
 * Base64url encode (URL-safe, no padding).
 */
function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Base64url decode.
 */
function fromBase64Url(str: string): Uint8Array {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - base64.length % 4) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Encode a conversation into a shareable URL hash string.
 * Returns the full URL or null if the conversation is too large.
 */
export async function encodeShareUrl(conv: Conversation): Promise<string> {
  // Build minimal payload
  const payload: SharePayload = {
    t: conv.title,
    m: conv.model,
    ts: conv.createdAt,
    msgs: conv.messages.map(m => ({
      r: m.role === 'user' ? 'u' : 'a',
      c: m.content,
      ts: m.timestamp,
    })),
  };

  const json = JSON.stringify(payload);
  const compressed = await compress(json);
  const encoded = toBase64Url(compressed);

  const base = import.meta.env.BASE_URL || '/';
  const url = `${window.location.origin}${base}#share=${encoded}`;

  // Warn if URL is very long (some platforms truncate around 8000 chars)
  if (url.length > 8000) {
    console.warn(`Share URL is ${url.length} chars — may be truncated on some platforms`);
  }

  return url;
}

/**
 * Check if the current URL contains a shared conversation hash.
 */
export function hasShareHash(): boolean {
  return window.location.hash.startsWith('#share=');
}

/**
 * Decode a shared conversation from the current URL hash.
 * Returns a Conversation object or null if decoding fails.
 */
export async function decodeShareHash(): Promise<Conversation | null> {
  const hash = window.location.hash;
  if (!hash.startsWith('#share=')) return null;

  try {
    const encoded = hash.slice('#share='.length);
    const compressed = fromBase64Url(encoded);
    const json = await decompress(compressed);
    const payload: SharePayload = JSON.parse(json);

    const messages: Message[] = payload.msgs.map((m, i) => ({
      id: `shared-msg-${i}`,
      role: m.r === 'u' ? 'user' : 'assistant',
      content: m.c,
      timestamp: m.ts,
    }));

    const conversation: Conversation = {
      id: `shared-${Date.now()}`,
      title: payload.t,
      messages,
      createdAt: payload.ts,
      updatedAt: payload.ts,
      model: payload.m,
      folderId: null,
      isPinned: false,
      visibility: 'public',
      ownerId: 'shared',
      ownerName: 'Shared',
      collaborators: [],
      checkpoints: [],
      tags: ['shared'],
    };

    return conversation;
  } catch (err) {
    console.error('Failed to decode shared conversation:', err);
    return null;
  }
}

/**
 * Get the estimated URL length for a conversation (without actually compressing).
 * Useful for showing warnings before generating the URL.
 */
export function estimateShareSize(conv: Conversation): number {
  const textSize = conv.messages.reduce((sum, m) => sum + m.content.length, 0);
  // Rough estimate: compressed + base64 ≈ 60% of original text
  return Math.round(textSize * 0.6) + 200; // 200 for URL base + metadata
}
