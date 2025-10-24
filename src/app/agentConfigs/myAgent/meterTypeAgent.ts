import { tool } from '@openai/agents/realtime';

import { findMeterTypeByAddress } from '../../msats/meterAgent';
import type { AddressLookup } from '../../msats/types';

type MeterLookupInput = {
  streetNumber: number | string;
  streetName: string;
  streetType: string;
  suburb: string;
  postcode: string;
  state: 'NSW' | 'VIC' | 'QLD' | 'SA' | 'WA' | 'TAS' | 'ACT' | 'NT';
  singleResult?: boolean;
};

export const meterTypeTool = tool({
  name: 'meterTypeTool',
  description:
    'Look up an Australian electricity meter by street address. Returns the NMI, checksum, and meter detail when found.',
  parameters: {
    type: 'object',
    properties: {
      streetNumber: {
        type: 'integer',
        description: 'Numeric street number, without unit numbers.',
      },
      streetName: {
        type: 'string',
        description: 'Street name (e.g., Blackwattle).',
      },
      streetType: {
        type: 'string',
        description: 'Street type abbreviation (e.g., ST, AVE, PL).',
      },
      suburb: {
        type: 'string',
        description: 'Suburb or locality name.',
      },
      postcode: {
        type: 'string',
        pattern: '^\\d{4}$',
        description: 'Australian postcode (4 digits).',
      },
      state: {
        type: 'string',
        enum: ['NSW', 'VIC', 'QLD', 'SA', 'WA', 'TAS', 'ACT', 'NT'],
        description: 'Australian state or territory abbreviation.',
      },
      singleResult: {
        type: 'boolean',
        description: 'Whether to limit the lookup to a single result. Defaults to true.',
        default: true,
      },
    },
    required: ['streetNumber', 'streetName', 'streetType', 'suburb', 'postcode', 'state'],
    additionalProperties: false,
  },
  strict: true,
  execute: async (rawInput: unknown) => {
    if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) {
      throw new Error('Invalid input payload passed to find_meter_type_by_address.');
    }

    const {
      streetNumber,
      streetName,
      streetType,
      suburb,
      postcode,
      state,
      singleResult = true,
    } = rawInput as MeterLookupInput;

    const parsedStreetNumber = Number(streetNumber);
    if (!Number.isFinite(parsedStreetNumber)) {
      throw new Error('streetNumber must be a number.');
    }

    const payload: AddressLookup = {
      function: 'mstats',
      lookupType: 'Address',
      streetNumber: parsedStreetNumber,
      streetName,
      streetType: streetType.toUpperCase(),
      suburb,
      postcode,
      state,
      singleResult,
    };

    const result = await findMeterTypeByAddress(payload);
    if (!result.ok) {
      return {
        success: false,
        error: result.error,
        address: payload,
      };
    }

    return {
      success: true,
      nmi: result.data.nmi,
      checksum: result.data.checksum,
      meter: result.data.meter,
    };
  },
});
