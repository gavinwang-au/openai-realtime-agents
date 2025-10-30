// src/app/msats/meterAgent.ts
import type { AddressLookup, MeterDetail } from './types';
import {
  AddressNotFoundError,
  NmiChecksumNotFoundError,
  nmiDetail,
  nmiDiscoveryByAddress,
} from './msatsMock';

export type MeterAgentResponse =
  | { ok: true; data: { nmi: string; checksum: string; meter: MeterDetail } }
  | { ok: false; error: string };

/**
 * Resolve an address to meter details via mock MSATS discovery and detail calls.
 */
export async function findMeterTypeByAddress(
  address: AddressLookup,
): Promise<MeterAgentResponse> {
  try {
    const discovery = await nmiDiscoveryByAddress(address);
    const meter = await nmiDetail(discovery.nmi, discovery.checksum);
    return {
      ok: true,
      data: { nmi: discovery.nmi, checksum: discovery.checksum, meter },
    };
  } catch (error: unknown) {
    if (error instanceof AddressNotFoundError || error instanceof NmiChecksumNotFoundError) {
      return { ok: false, error: error.message };
    }
    return { ok: false, error: 'Unexpected error' };
  }
}
