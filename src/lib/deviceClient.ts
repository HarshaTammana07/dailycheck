import type { RegisteredDevice } from '../types';
import { addHours } from './date';
import { getDeviceLease, saveDeviceLease } from './db';
import { supabase } from './supabase';

export type DeviceAuthorizationResult =
  | { status: 'authorized'; offline: boolean; authorizedUntil: string; devices: RegisteredDevice[] }
  | { status: 'denied'; reason: string; devices: RegisteredDevice[] }
  | { status: 'error'; reason: string; offlineFallback: boolean; authorizedUntil?: string };

const leaseHours = Number(import.meta.env.VITE_OFFLINE_AUTH_LEASE_HOURS || 24);

export function isLeaseStillValid(authorizedUntil: string, now = new Date()) {
  return new Date(authorizedUntil).getTime() > now.getTime();
}

async function invokeDeviceFunction<T>(name: string, body?: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke<T>(name, {
    body: body ?? {}
  });
  if (error) throw error;
  return data as T;
}

export async function registerCurrentDevice(userId: string): Promise<DeviceAuthorizationResult> {
  const device = await window.dailycheck?.device.getInfo();
  if (!device) {
    return { status: 'error', reason: 'DailyCheck is not running inside Electron.', offlineFallback: false };
  }

  try {
    const result = await invokeDeviceFunction<{
      authorized: boolean;
      reason?: string;
      authorizedUntil?: string;
      devices: RegisteredDevice[];
    }>('register-device', device);

    if (!result.authorized) {
      return { status: 'denied', reason: result.reason ?? 'Device limit reached.', devices: result.devices ?? [] };
    }

    const authorizedUntil = result.authorizedUntil ?? addHours(new Date(), leaseHours).toISOString();
    await saveDeviceLease({
      userId,
      deviceIdHash: device.deviceIdHash,
      authorizedUntil,
      lastValidatedAt: new Date().toISOString()
    });

    return {
      status: 'authorized',
      offline: false,
      authorizedUntil,
      devices: result.devices ?? []
    };
  } catch (error) {
    const lease = await getDeviceLease(userId);
    if (lease && isLeaseStillValid(lease.authorizedUntil)) {
      return {
        status: 'error',
        reason: `Using offline authorization lease because online validation failed: ${String(error)}`,
        offlineFallback: true,
        authorizedUntil: lease.authorizedUntil
      };
    }
    return {
      status: 'error',
      reason: `Online device authorization failed and no valid offline lease exists: ${String(error)}`,
      offlineFallback: false
    };
  }
}

export async function listRegisteredDevices() {
  const result = await invokeDeviceFunction<{ devices: RegisteredDevice[] }>('list-devices');
  return result.devices;
}

export async function revokeDevice(deviceId: string) {
  await invokeDeviceFunction<{ ok: boolean }>('revoke-device', { id: deviceId });
}

export async function validateCurrentDevice(userId: string) {
  const device = await window.dailycheck?.device.getInfo();
  if (!device) throw new Error('DailyCheck bridge unavailable.');
  const result = await invokeDeviceFunction<{ authorized: boolean; authorizedUntil?: string; reason?: string }>('validate-device', {
    deviceIdHash: device.deviceIdHash
  });
  if (result.authorized) {
    await saveDeviceLease({
      userId,
      deviceIdHash: device.deviceIdHash,
      authorizedUntil: result.authorizedUntil ?? addHours(new Date(), leaseHours).toISOString(),
      lastValidatedAt: new Date().toISOString()
    });
  }
  return result;
}
