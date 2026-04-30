import { createHmac, timingSafeEqual } from 'node:crypto'

const VERSION = 'v1'

function getSecret(): string {
  return process.env.GUEST_ORDER_TOKEN_SECRET || 'dev-guest-order-token-secret'
}

function toBase64Url(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url')
}

function fromBase64Url(input: string): string {
  return Buffer.from(input, 'base64url').toString('utf8')
}

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url')
}

export function createGuestOrderToken(input: { orderId: string; email: string }): string {
  const payloadObject = {
    orderId: input.orderId,
    email: input.email.toLowerCase(),
    exp: Date.now() + 1000 * 60 * 60 * 24 * 30,
  }

  const payloadEncoded = toBase64Url(JSON.stringify(payloadObject))
  const signedPayload = `${VERSION}.${payloadEncoded}`
  const signature = sign(signedPayload, getSecret())
  return `${signedPayload}.${signature}`
}

export function verifyGuestOrderToken(token: string): { orderId: string; email: string } | null {
  const parts = token.split('.')
  if (parts.length !== 3) {
    return null
  }

  const [version, payloadEncoded, signature] = parts
  if (version !== VERSION) {
    return null
  }

  const signedPayload = `${version}.${payloadEncoded}`
  const expected = sign(signedPayload, getSecret())
  const a = Buffer.from(signature)
  const b = Buffer.from(expected)

  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return null
  }

  try {
    const payload = JSON.parse(fromBase64Url(payloadEncoded)) as {
      orderId: string
      email: string
      exp: number
    }

    if (!payload.orderId || !payload.email || !payload.exp) {
      return null
    }

    if (Date.now() > payload.exp) {
      return null
    }

    return {
      orderId: payload.orderId,
      email: payload.email,
    }
  } catch {
    return null
  }
}
