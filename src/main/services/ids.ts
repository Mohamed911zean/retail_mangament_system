import { randomBytes } from 'node:crypto'

export type IdGenerator = { next(): string }

const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

function encodeTime(value: number): string {
  let result = ''
  let current = value
  for (let index = 0; index < 10; index += 1) {
    result = alphabet[current % 32] + result
    current = Math.floor(current / 32)
  }
  return result
}

export function createUlidGenerator(): IdGenerator {
  return {
    next: () => {
      const bytes = randomBytes(16)
      let randomPart = ''
      for (const byte of bytes) randomPart += alphabet[byte % 32]
      return `${encodeTime(Date.now())}${randomPart}`
    },
  }
}
