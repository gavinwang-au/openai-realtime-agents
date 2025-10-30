// src/app/msats/msatsMock.ts
import type { AddressLookup, MeterDetail, NmiDiscoveryResult } from './types';

export class AddressNotFoundError extends Error {
  constructor(message = 'Address not found') {
    super(message);
    this.name = 'AddressNotFoundError';
  }
}

export class NmiChecksumNotFoundError extends Error {
  constructor(message = 'NMI and checksum not found') {
    super(message);
    this.name = 'NmiChecksumNotFoundError';
  }
}

const discoveryDb: Array<{ key: string; result: NmiDiscoveryResult }> = [
  {
    key: '33|blackwattle|PL|cherrybrook|2126|NSW',
    result: { nmi: '4101234567', checksum: 'A9' },
  },
];

const detailDb: Record<string, MeterDetail> = {
  '4101234567:A9': {
    nmi: '4101234567',
    checksum: 'A9',
    meterType: 'Smart',
    phase: '1',
    registerCount: 2,
    lastReadDate: '2025-01-16',
  },
};

export function normKey(address: AddressLookup): string {
  const streetNumber = String(address.streetNumber).trim();
  const streetName = address.streetName.trim().toLowerCase();
  const streetType = address.streetType.trim().toUpperCase();
  const suburb = address.suburb.trim().toLowerCase();
  const postcode = address.postcode.trim();
  const state = address.state.trim().toUpperCase();
  return `${streetNumber}|${streetName}|${streetType}|${suburb}|${postcode}|${state}`;
}

function detailKey(nmi: string, checksum: string): string {
  return `${nmi}:${checksum}`;
}

export async function nmiDiscoveryByAddress(input: AddressLookup): Promise<NmiDiscoveryResult> {
  const key = normKey(input);
  const entry = discoveryDb.find((record) => record.key === key);
  if (!entry) {
    throw new AddressNotFoundError();
  }
  return { ...entry.result };
}

export async function nmiDetail(nmi: string, checksum: string): Promise<MeterDetail> {
  const key = detailKey(nmi, checksum);
  const meterDetail = detailDb[key];
  if (!meterDetail) {
    throw new NmiChecksumNotFoundError();
  }
  return { ...meterDetail };
}
