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
export const setServiceAccountFromRawJson = inTauri ? undefined : webApi.setServiceAccountFromRawJson;
export const setServiceAccountJson = inTauri ? undefined : webApi.setServiceAccountJson;
export const refreshLiveData = inTauri ? undefined : webApi.refreshLiveData;
export const invalidateDataCache = inTauri ? undefined : webApi.invalidateDataCache;
