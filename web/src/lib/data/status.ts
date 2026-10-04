/**
 * How far behind the chain the live record (the indexer) is. Shared by /api/indexer/status, the
 * "live numbers are paused" banner, and the wait after a transaction.
 */

/** Behind by more than this and the live numbers count as paused. */
export const STALL_SECONDS = 120;
/** Used instead when the time of the indexer's last block is unknown (about two minutes of blocks). */
export const STALL_BLOCKS = 300;

export interface BlockStamp {
  number: number;
  /** unix seconds */
  timestamp: number;
}

export interface IndexerStatus {
  /** the last block the indexer has processed */
  processedBlock: number;
  /** the chain's newest block, or null when the chain could not be read */
  chainHead: number | null;
  behindBlocks: number | null;
  behindSeconds: number | null;
  /** minutes behind or more: the indexer is down, or still catching up */
  stalled: boolean;
}

export function indexerLag(processedBlock: number, processedAt: number | null, head: BlockStamp | null): IndexerStatus {
  // without the chain's head there is nothing to compare against, so don't raise an alarm
  if (!head) return { processedBlock, chainHead: null, behindBlocks: null, behindSeconds: null, stalled: false };
  const behindBlocks = Math.max(0, head.number - processedBlock);
  const behindSeconds = processedAt === null ? null : Math.max(0, head.timestamp - processedAt);
  const stalled = behindSeconds === null ? behindBlocks > STALL_BLOCKS : behindSeconds > STALL_SECONDS;
  return { processedBlock, chainHead: head.number, behindBlocks, behindSeconds, stalled };
}

/** 125 -> "2 minutes", 10800 -> "3 hours", 259200 -> "3 days" */
export function behindText(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 90) return minutes === 1 ? "1 minute" : `${minutes} minutes`;
  const hours = Math.round(seconds / 3600);
  if (hours < 36) return `${hours} hours`;
  return `${Math.round(seconds / 86_400)} days`;
}
