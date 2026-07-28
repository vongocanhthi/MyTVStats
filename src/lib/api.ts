import { isTauriRuntime } from "./runtime";
import * as tauriApi from "./tauri-api";
import * as webApi from "./web-api";

const inTauri = isTauriRuntime();

export const getStats: typeof tauriApi.getStats = inTauri ? tauriApi.getStats : webApi.getStats;
export const listReviews: typeof tauriApi.listReviews = inTauri ? tauriApi.listReviews : webApi.listReviews;
export const getSettings: typeof tauriApi.getSettings = inTauri ? tauriApi.getSettings : webApi.getSettings;
