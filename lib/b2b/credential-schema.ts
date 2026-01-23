import { z } from 'zod';

/**
 * Credential schema for REST-based distributors (PHILLIPS, BCI)
 */
export const restCredentialSchema = z.object({
  // PHILLIPS: API Key for Endless Aisles
  apiKey: z.string().min(1, 'API Key is required').optional().or(z.literal('')),
  apiSecret: z.string().min(1, 'API Secret is required').optional().or(z.literal('')),
  baseUrl: z.string().url('Must be a valid URL').optional().or(z.literal('')),
  environment: z.enum(['production', 'sandbox']).optional(),
});

export type RestCredentialValues = z.infer<typeof restCredentialSchema>;

/**
 * Credential schema for SFTP-based distributors (ORGILL, PFX)
 */
export const sftpCredentialSchema = z.object({
  sftpHost: z.string().min(1, 'SFTP Host is required'),
  sftpPort: z.number().int().positive().min(1).max(65535).default(22).optional(),
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
  remotePath: z.string().optional(),
});

export type SftpCredentialValues = z.infer<typeof sftpCredentialSchema>;

/**
 * Credential schema for EDI-based distributors (CENTRAL)
 */
export const ediCredentialSchema = z.object({
  van: z.string().min(1, 'VAN ID is required'),
  format: z.string().optional(),
});

export type EdiCredentialValues = z.infer<typeof ediCredentialSchema>;

/**
 * Unified credential schema - discriminator handles different types
 */
export const b2bCredentialSchema = z.object({
  distributorCode: z.enum(['PHILLIPS', 'ORGILL', 'BCI', 'CENTRAL', 'PFX']),
  credentials: z.discriminatedUnion('feedType', [
    z.object({
      feedType: z.literal('REST'),
      ...restCredentialSchema.shape,
    }),
    z.object({
      feedType: z.literal('SFTP'),
      ...sftpCredentialSchema.shape,
    }),
    z.object({
      feedType: z.literal('EDI'),
      ...ediCredentialSchema.shape,
    }),
  ]),
});

export type B2BCredentialFormValues = z.infer<typeof b2bCredentialSchema>;

/**
 * Schema for schedule configuration
 */
export const b2bScheduleSchema = z.object({
  distributorCode: z.enum(['PHILLIPS', 'ORGILL', 'BCI', 'CENTRAL', 'PFX']),
  frequency: z.enum(['hourly', 'daily', 'weekly', 'manual']),
  enabled: z.boolean().default(false),
  scheduledAt: z.string().optional(), // Cron expression or time
  lastSyncAt: z.string().nullable().optional(),
  nextSyncAt: z.string().nullable().optional(),
});

export type B2BScheduleFormValues = z.infer<typeof b2bScheduleSchema>;

/**
 * Default values for credential forms
 */
export const defaultRestCredentials: RestCredentialValues = {
  apiKey: '',
  apiSecret: '',
  baseUrl: '',
  environment: 'production',
};

export const defaultSftpCredentials: SftpCredentialValues = {
  sftpHost: '',
  sftpPort: 22,
  username: '',
  password: '',
  remotePath: '',
};

export const defaultEdiCredentials: EdiCredentialValues = {
  van: '',
  format: 'X12',
};

export const defaultScheduleValues: B2BScheduleFormValues = {
  distributorCode: 'PHILLIPS',
  frequency: 'manual',
  enabled: false,
  scheduledAt: undefined,
  lastSyncAt: null,
  nextSyncAt: null,
};

/**
 * Helper to get feed type by distributor
 */
export function getFeedType(distributorCode: string): 'REST' | 'SFTP' | 'EDI' {
  switch (distributorCode) {
    case 'PHILLIPS':
    case 'BCI':
      return 'REST';
    case 'ORGILL':
    case 'PFX':
      return 'SFTP';
    case 'CENTRAL':
      return 'EDI';
    default:
      return 'REST';
  }
}

/**
 * Helper to get credential fields by distributor
 */
export function getCredentialFields(distributorCode: string) {
  const feedType = getFeedType(distributorCode);
  
  switch (feedType) {
    case 'REST':
      return [
        { key: 'apiKey', label: 'API Key', type: 'password', required: true },
        { key: 'apiSecret', label: 'API Secret', type: 'password', required: true },
        { key: 'baseUrl', label: 'Base URL', type: 'text', required: false },
        { key: 'environment', label: 'Environment', type: 'select', required: false, options: ['production', 'sandbox'] },
      ];
    case 'SFTP':
      return [
        { key: 'sftpHost', label: 'SFTP Host', type: 'text', required: true },
        { key: 'sftpPort', label: 'Port', type: 'number', required: false },
        { key: 'username', label: 'Username', type: 'text', required: true },
        { key: 'password', label: 'Password', type: 'password', required: true },
        { key: 'remotePath', label: 'Remote Path', type: 'text', required: false },
      ];
    case 'EDI':
      return [
        { key: 'van', label: 'VAN ID', type: 'text', required: true },
        { key: 'format', label: 'Format', type: 'text', required: false },
      ];
    default:
      return [];
  }
}
