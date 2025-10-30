// src/app/msats/index.ts
import { findMeterTypeByAddress } from './meterAgent';
import type { AddressLookup } from './types';

const samplePayload: AddressLookup = {
  function: 'mstats',
  lookupType: 'Address',
  streetNumber: 33,
  streetName: 'Blackwattle',
  streetType: 'PL',
  suburb: 'Cherrybrook',
  postcode: '2126',
  state: 'NSW',
  singleResult: true,
};

void (async () => {
  const result = await findMeterTypeByAddress(samplePayload);
  if (result.ok) {
    console.log(`NMI: ${result.data.nmi}`);
    console.log();
    console.log(`Checksum: ${result.data.checksum}`);
    console.log();
    console.log('Meter detail:', result.data.meter);
  } else {
    console.log('Error:', result.error);
  }
})();
