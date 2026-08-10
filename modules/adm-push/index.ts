import { requireNativeModule } from 'expo-modules-core';

type AdmPushNativeModule = {
  isSupported(): boolean;
  registerAsync(): Promise<string>;
};

const AdmPushNative = requireNativeModule<AdmPushNativeModule>('AdmPush');

export function isAdmSupported(): boolean {
  return AdmPushNative.isSupported();
}

export function registerAdmAsync(): Promise<string> {
  return AdmPushNative.registerAsync();
}
