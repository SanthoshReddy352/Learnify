/**
 * SM-2 Spaced Repetition Algorithm
 * Based on SuperMemo SM-2 algorithm
 */

export interface SM2Result {
  /** Days until the next review (always >= 1) */
  interval: number
  /** Consecutive successful repetitions */
  repetition: number
  /** Ease factor, clamped to >= 1.3, rounded to 2 decimals */
  efactor: number
}

/**
 * @param quality - Quality of recall (0-5):
 *   5 perfect, 4 correct after hesitation, 3 correct with difficulty,
 *   2 incorrect but remembered, 1 incorrect but familiar, 0 blackout
 * @param lastInterval - Previous interval in days
 * @param lastRepetition - Number of consecutive correct responses
 * @param lastEfactor - Previous ease factor (difficulty factor)
 */
export function calculateSM2(
  quality: number,
  lastInterval: number = 0,
  lastRepetition: number = 0,
  lastEfactor: number = 2.5
): SM2Result {
  let efactor = lastEfactor
  let repetition = lastRepetition
  let interval = lastInterval

  // Update ease factor based on quality
  efactor = efactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))

  // Ease factor should be at least 1.3
  if (efactor < 1.3) {
    efactor = 1.3
  }

  // If quality < 3, reset repetition count and interval
  if (quality < 3) {
    repetition = 0
    interval = 1
  } else {
    // Increment repetition count
    repetition += 1

    // Calculate new interval
    if (repetition === 1) {
      interval = 1
    } else if (repetition === 2) {
      interval = 6
    } else {
      interval = Math.round(lastInterval * efactor)
    }
  }

  return {
    interval: Math.max(1, interval), // At least 1 day
    repetition,
    efactor: Math.round(efactor * 100) / 100 // Round to 2 decimals
  }
}

/**
 * Calculate next review date from interval
 */
export function calculateNextReviewDate(intervalDays: number): string {
  const now = new Date()
  const nextReview = new Date(now.getTime() + intervalDays * 24 * 60 * 60 * 1000)
  return nextReview.toISOString()
}

/**
 * Check if a topic is due for review
 */
export function isDueForReview(nextReviewAt: string | Date | null | undefined): boolean {
  if (!nextReviewAt) return false
  return new Date(nextReviewAt) <= new Date()
}
