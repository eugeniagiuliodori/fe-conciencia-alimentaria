import { createHmac, timingSafeEqual } from "node:crypto";

const OWNER_PAYLOAD = "owner";

function getCookieSecret(): string {
  const secret = process.env.OWNER_COOKIE_SECRET;

  if (!secret) {
    throw new Error("OWNER_COOKIE_SECRET is not configured");
  }

  return secret;
}

function createSignature(): string {
  return createHmac("sha256", getCookieSecret())
    .update(OWNER_PAYLOAD)
    .digest("hex");
}

export function createOwnerToken(): string {
  const signature = createSignature();

  return `${OWNER_PAYLOAD}.${signature}`;
}

export function verifyOwnerToken(token: string): boolean {
  const expectedToken = createOwnerToken();

  const receivedBuffer = Buffer.from(token);
  const expectedBuffer = Buffer.from(expectedToken);

  if (receivedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(receivedBuffer, expectedBuffer);
}