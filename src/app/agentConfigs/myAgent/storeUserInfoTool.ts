import { tool } from '@openai/agents/realtime';

type StoredUserInfo = {
  firstName?: string;
  email?: string;
  phone?: string;
  address?: string;
};

const userInfoLog: StoredUserInfo[] = [];

export const storeUserInfoTool = tool({
  name: 'store_user_info',
  description:
    'Store structured caller information captured during the conversation such as name, email, phone, address, and any relevant notes.',
  parameters: {
    type: 'object',
    properties: {
      firstName: {
        type: 'string',
        description: "The caller's first name.",
      },
      email: {
        type: 'string',
        description: "The caller's email address.",
      },
      phone: {
        type: 'string',
        description: "The caller's phone number.",
      },
      address: {
        type: 'string',
        description: "The caller's street address.",
      },
    },
    required: [],
    additionalProperties: false,
  },
  strict: true,
  execute: async (rawInput: unknown) => {
    if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) {
      throw new Error('Invalid input payload passed to store_user_info.');
    }

    const payload: StoredUserInfo = { ...(rawInput as StoredUserInfo) };
    userInfoLog.push(payload);

    return {
      success: true,
      stored: payload,
      totalStored: userInfoLog.length,
    };
  },
});

export const getStoredUserInfo = () => [...userInfoLog];
