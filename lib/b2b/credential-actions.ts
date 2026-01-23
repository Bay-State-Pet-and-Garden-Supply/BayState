'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { b2bCredentialSchema, getFeedType } from './credential-schema';
import { B2BFactory } from './factory';
import { B2BConfig } from './types';

export type ActionState = {
  success: boolean;
  error?: string;
  data?: unknown;
};

/**
 * Get credentials for a distributor from app_settings table
 */
export async function getCredentials(distributorCode: string): Promise<Record<string, string> | null> {
  const supabase = await createClient();
  
  const prefix = `b2b_${distributorCode.toLowerCase()}`;
  const keys = [
    `${prefix}_api_key`,
    `${prefix}_api_secret`,
    `${prefix}_username`,
    `${prefix}_password`,
    `${prefix}_base_url`,
    `${prefix}_sftp_host`,
    `${prefix}_sftp_port`,
    `${prefix}_remote_path`,
    `${prefix}_van`,
    `${prefix}_format`,
    `${prefix}_environment`,
  ];

  const { data, error } = await supabase
    .from('site_settings')
    .select('key, value')
    .in('key', keys);

  if (error || !data || data.length === 0) {
    return null;
  }

  const settings: Record<string, string> = {};
  for (const row of data) {
    const shortKey = row.key.replace(`${prefix}_`, '');
    settings[shortKey] = row.value;
  }

  return settings;
}

/**
 * Build B2BConfig from credentials object
 */
export async function buildB2BConfig(
  distributorCode: string,
  credentials: Record<string, string>
): Promise<B2BConfig> {
  const feedType = getFeedType(distributorCode);
  
  const config: B2BConfig = {};
  
  if (feedType === 'REST' || feedType === 'EDI') {
    if (credentials.api_key) config.apiKey = credentials.api_key;
    if (credentials.api_secret) config.apiSecret = credentials.api_secret;
    if (credentials.base_url) config.baseUrl = credentials.base_url;
    if (credentials.environment) config.environment = credentials.environment as 'production' | 'sandbox';
  }
  
  if (feedType === 'SFTP') {
    if (credentials.sftp_host) config.sftpHost = credentials.sftp_host;
    if (credentials.sftp_port) config.sftpPort = parseInt(credentials.sftp_port, 10);
    if (credentials.username) config.username = credentials.username;
    if (credentials.password) config.password = credentials.password;
    if (credentials.remote_path) config.remotePath = credentials.remote_path;
  }
  
  if (feedType === 'EDI') {
    if (credentials.van) config.van = credentials.van;
    if (credentials.format) config.format = credentials.format;
  }
  
  return config;
}

/**
 * Save credentials for a distributor to app_settings table
 */
export async function saveCredentials(
  distributorCode: string,
  credentials: Record<string, string>
): Promise<ActionState> {
  try {
    const supabase = await createClient();
    const prefix = `b2b_${distributorCode.toLowerCase()}`;
    
    const operations = Object.entries(credentials).map(([key, value]) => {
      const fullKey = `${prefix}_${key}`;
      return supabase.from('site_settings').upsert(
        { key: fullKey, value },
        { onConflict: 'key' }
      );
    });

    const results = await Promise.all(operations);
    
    for (const result of results) {
      if (result.error) {
        console.error('[B2B Credentials] Save failed:', result.error);
        return { success: false, error: 'Failed to save credentials' };
      }
    }

    revalidatePath('/admin/b2b');
    revalidatePath(`/admin/b2b/${distributorCode.toLowerCase()}`);
    
    return { success: true };
  } catch (error) {
    console.error('[B2B Credentials] Error saving credentials:', error);
    return { success: false, error: 'Internal server error' };
  }
}

/**
 * Test connection for a distributor
 */
export async function testConnection(distributorCode: string): Promise<ActionState> {
  try {
    const credentials = await getCredentials(distributorCode);
    
    if (!credentials) {
      return { success: false, error: 'No credentials configured' };
    }

    const config = await buildB2BConfig(distributorCode, credentials);
    const client = B2BFactory.getClient(distributorCode as any, config);
    const healthy = await client.healthCheck();

    if (healthy) {
      return { success: true, data: { message: 'Connection successful' } };
    } else {
      return { success: false, error: 'Connection health check failed' };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Connection test failed';
    console.error('[B2B Credentials] Test connection error:', error);
    return { success: false, error: message };
  }
}

/**
 * Delete credentials for a distributor
 */
export async function deleteCredentials(distributorCode: string): Promise<ActionState> {
  try {
    const supabase = await createClient();
    const prefix = `b2b_${distributorCode.toLowerCase()}`;
    
    const keys = [
      `${prefix}_api_key`,
      `${prefix}_api_secret`,
      `${prefix}_username`,
      `${prefix}_password`,
      `${prefix}_base_url`,
      `${prefix}_sftp_host`,
      `${prefix}_sftp_port`,
      `${prefix}_remote_path`,
      `${prefix}_van`,
      `${prefix}_format`,
      `${prefix}_environment`,
    ];

    const { error } = await supabase
      .from('site_settings')
      .delete()
      .in('key', keys);

    if (error) {
      console.error('[B2B Credentials] Delete failed:', error);
      return { success: false, error: 'Failed to delete credentials' };
    }

    revalidatePath('/admin/b2b');
    revalidatePath(`/admin/b2b/${distributorCode.toLowerCase()}`);
    
    return { success: true };
  } catch (error) {
    console.error('[B2B Credentials] Error deleting credentials:', error);
    return { success: false, error: 'Internal server error' };
  }
}

/**
 * Validate credentials using Zod schema
 */
export async function validateCredentials(
  distributorCode: string,
  credentials: Record<string, unknown>
): Promise<{ success: boolean; error?: string }> {
  const feedType = getFeedType(distributorCode);
  
  try {
    b2bCredentialSchema.parse({
      distributorCode,
      credentials: {
        feedType,
        ...credentials,
      },
    });
    return { success: true };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.issues;
      const firstError = issues[0];
      return { success: false, error: `${firstError.path.join('.')}: ${firstError.message}` };
    }
    return { success: false, error: 'Validation failed' };
  }
}

/**
 * Check if credentials are configured for a distributor
 */
export async function hasCredentials(distributorCode: string): Promise<boolean> {
  const credentials = await getCredentials(distributorCode);
  return credentials !== null && Object.keys(credentials).length > 0;
}

/**
 * Get credential status for a distributor (configured, missing, etc.)
 */
export async function getCredentialStatus(distributorCode: string): Promise<{
  configured: boolean;
  fields: { name: string; configured: boolean; required: boolean }[];
}> {
  const credentials = await getCredentials(distributorCode);
  const feedType = getFeedType(distributorCode);
  
  const requiredFields = [
    { name: 'apiKey', required: feedType === 'REST' && distributorCode !== 'BCI' },
    { name: 'apiSecret', required: feedType === 'REST' && distributorCode === 'BCI' },
    { name: 'sftpHost', required: feedType === 'SFTP' },
    { name: 'username', required: feedType === 'SFTP' },
    { name: 'password', required: feedType === 'SFTP' },
    { name: 'van', required: feedType === 'EDI' },
  ];

  const fields = requiredFields.map(field => ({
    name: field.name,
    configured: credentials ? !!credentials[field.name.toLowerCase()] : false,
    required: field.required,
  }));

  return {
    configured: credentials !== null && Object.keys(credentials).length > 0,
    fields,
  };
}
