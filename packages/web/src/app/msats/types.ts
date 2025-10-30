// src/app/msats/types.ts
export type AddressLookup = {
  function: 'mstats';
  lookupType: 'Address';
  streetNumber: number;
  streetName: string;
  streetType: string;
  suburb: string;
  postcode: string;
  state: string;
  singleResult: boolean;
};

export type NmiDiscoveryResult = {
  nmi: string;
  checksum: string;
};

export type MeterDetail = {
  nmi: string;
  checksum: string;
  meterType: 'Basic' | 'Interval' | 'Smart';
  phase?: '1' | '3';
  registerCount?: number;
  lastReadDate?: string;
};
