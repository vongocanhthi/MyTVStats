import { isTauriRuntime } from "./runtime";
import * as tauriApi from "./tauri-api";
import * as webApi from "./web-api";

const inTauri = isTauriRuntime();

export const getStats: typeof tauriApi.getStats = inTauri ? tauriApi.getStats : webApi.getStats;
export const listReviews: typeof tauriApi.listReviews = inTauri ? tauriApi.listReviews : webApi.listReviews;
export const getSettings: typeof tauriApi.getSettings = inTauri ? tauriApi.getSettings : webApi.getSettings;
export const setServiceAccountPath: typeof tauriApi.setServiceAccountPath | undefined = inTauri
  ? tauriApi.setServiceAccountPath
  : undefined;
export const getScheduleSettings: typeof tauriApi.getScheduleSettings | undefined = inTauri
  ? tauriApi.getScheduleSettings
  : undefined;
export const setScheduleSettings: typeof tauriApi.setScheduleSettings | undefined = inTauri
  ? tauriApi.setScheduleSettings
  : undefined;
export const runDailyReportNow: typeof tauriApi.runDailyReportNow | undefined = inTauri
  ? tauriApi.runDailyReportNow
  : undefined;
export const sendReportNow: typeof tauriApi.sendReportNow | undefined = inTauri
  ? tauriApi.sendReportNow
  : undefined;
export const setAutostartEnabled: typeof tauriApi.setAutostartEnabled | undefined = inTauri
  ? tauriApi.setAutostartEnabled
  : undefined;
export const setServiceAccountFromRawJson = inTauri
  ? tauriApi.setServiceAccountFromRawJson
  : webApi.setServiceAccountFromRawJson;
export const setServiceAccountJson = inTauri
  ? tauriApi.setServiceAccountJson
  : webApi.setServiceAccountJson;
export const refreshLiveData = inTauri ? undefined : webApi.refreshLiveData;
export const invalidateDataCache = inTauri ? undefined : webApi.invalidateDataCache;
