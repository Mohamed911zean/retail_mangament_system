import { safeInteger } from './integer'
import { err, ok, type DomainError, type Result } from './result'

type AllocationPart = {
  index: number
  remainder: bigint
}

function invalidInteger(message: string, field: string): Result<never, DomainError> {
  return err({ code: 'invalid_input', message, field })
}

export function allocateProportionally(
  total: number,
  weights: number[],
): Result<number[], DomainError> {
  const totalResult = safeInteger(total, 'total')
  if (!totalResult.ok || totalResult.value < 0) {
    return err({
      code: 'invalid_money',
      message: 'total must be a non-negative safe integer',
      field: 'total',
    })
  }

  const weightValues: number[] = []
  for (let index = 0; index < weights.length; index += 1) {
    const weightResult = safeInteger(weights[index], `weights[${index}]`)
    if (!weightResult.ok || weightResult.value < 0) {
      return invalidInteger(
        `weights[${index}] must be a non-negative safe integer`,
        `weights[${index}]`,
      )
    }
    weightValues.push(weightResult.value)
  }

  const totalBigInt = BigInt(totalResult.value)
  let sumWeights = 0n
  for (const weight of weightValues) {
    sumWeights += BigInt(weight)
  }

  if (sumWeights === 0n) {
    if (totalBigInt === 0n) {
      return ok(weightValues.map(() => 0))
    }
    return err({
      code: 'invalid_input',
      message: 'positive total requires at least one positive weight',
      field: 'weights',
    })
  }

  const allocations = weightValues.map(() => 0)
  const parts: AllocationPart[] = []
  let allocated = 0n

  for (let index = 0; index < weightValues.length; index += 1) {
    const numerator = totalBigInt * BigInt(weightValues[index])
    const base = numerator / sumWeights
    const remainder = numerator % sumWeights
    allocations[index] = Number(base)
    allocated += base
    parts.push({ index, remainder })
  }

  let leftover = totalBigInt - allocated
  parts.sort((left, right) => {
    if (left.remainder > right.remainder) return -1
    if (left.remainder < right.remainder) return 1
    return left.index - right.index
  })

  for (let index = 0; index < parts.length && leftover > 0n; index += 1) {
    allocations[parts[index].index] += 1
    leftover -= 1n
  }

  return ok(allocations)
}
