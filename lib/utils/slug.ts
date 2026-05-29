import { customAlphabet } from 'nanoid';

const alphabet = '23456789abcdefghjkmnpqrstuvwxyz';
const generator = customAlphabet(alphabet, 8);

export function generateSlug(): string {
  return generator();
}

const SLUG_RE = /^[a-zA-Z0-9_-]{3,32}$/;

export function isValidSlug(slug: string): boolean {
  return SLUG_RE.test(slug);
}
