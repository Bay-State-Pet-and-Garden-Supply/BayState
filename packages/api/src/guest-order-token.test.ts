import { describe, expect, it } from 'bun:test'
import { createGuestOrderToken, verifyGuestOrderToken } from './guest-order-token'

describe('guest order token', () => {
  it('creates and validates a token', () => {
    const token = createGuestOrderToken({
      orderId: '11111111-1111-1111-1111-111111111111',
      email: 'Guest@Example.com',
    })

    const decoded = verifyGuestOrderToken(token)
    expect(decoded).not.toBeNull()
    expect(decoded?.orderId).toBe('11111111-1111-1111-1111-111111111111')
    expect(decoded?.email).toBe('guest@example.com')
  })

  it('rejects a tampered token', () => {
    const token = createGuestOrderToken({
      orderId: '11111111-1111-1111-1111-111111111111',
      email: 'guest@example.com',
    })

    const tampered = `${token}x`
    expect(verifyGuestOrderToken(tampered)).toBeNull()
  })
})
