import { aggregateOf, type EventEnvelope, type EventType, type PayloadOf } from "../src/events/index.js";
import { uuidv7 } from "../src/ids.js";

export const TENANT = "11111111-1111-1111-1111-111111111111";

let seqCounters = new Map<string, number>();

export function resetSeqs(): void {
  seqCounters = new Map();
}

/** Build a valid envelope with per-device monotonically increasing clientSeq. */
export function makeEvent<T extends EventType>(
  type: T,
  payload: PayloadOf<T>,
  opts: { deviceId: string; clientTs?: string; aggregateId?: string; eventId?: string } ,
): EventEnvelope<T> {
  const seq = (seqCounters.get(opts.deviceId) ?? 0) + 1;
  seqCounters.set(opts.deviceId, seq);
  return {
    eventId: opts.eventId ?? uuidv7(),
    tenantId: TENANT,
    deviceId: opts.deviceId,
    userId: null,
    type,
    aggregate: aggregateOf(type),
    aggregateId: opts.aggregateId ?? uuidv7(),
    clientTs: opts.clientTs ?? new Date().toISOString(),
    clientSeq: seq,
    payload,
  };
}

/** Deterministic uuid-shaped id from an integer, for readable fixtures. */
export function fixedId(n: number): string {
  const hex = n.toString(16).padStart(12, "0");
  return `00000000-0000-4000-8000-${hex}`;
}

export const DEVICE_A = "aaaaaaaa-0000-4000-8000-000000000001";
export const DEVICE_B = "aaaaaaaa-0000-4000-8000-000000000002";
export const DEVICE_C = "aaaaaaaa-0000-4000-8000-000000000003";
