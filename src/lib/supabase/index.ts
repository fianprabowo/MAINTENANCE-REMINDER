/**
 * All app data access goes through Supabase (PostgREST + Auth + RLS).
 * There is no custom backend — Postgres triggers + RLS policies are the
 * single source of truth for validation and authorization.
 */
export { supabase, assertSupabaseConfigured } from "./client";
export { requireUser } from "./auth-helpers";
export { enrichReminders } from "./mappers";

export {
  fetchVehiclesForUser,
  fetchVehicleDetail,
  createVehicle,
  updateVehicleFuelLevel,
  updateVehicleFuelConfig,
  recordVehicleFuelFill,
  updateVehicleMotorcycleCategory,
  deleteVehicle,
  refreshVehicleAndHistory,
} from "./services/vehicles";

export { fetchMotorcycleCategories } from "./services/motorcycleCategories";
export { fetchMotorcycleModels, defaultEfficiencyKmL } from "./services/motorcycleModels";
export { fetchOilServiceForVehicle, upsertVehicleOilService } from "./services/oil";

export { fetchMileageHistory, getLatestMileageKm, insertMileage, deleteMileageLog } from "./services/mileage";

export {
  fetchRemindersForVehicle,
  createReminderForVehicle,
  updateReminderForVehicle,
  deleteReminderForVehicle,
} from "./services/reminders";

export {
  fetchServiceRecordsForVehicle,
  fetchKnownServiceLocations,
  insertServiceRecord,
  updateServiceRecord,
  deleteServiceRecord,
} from "./services/serviceRecords";

export {
  resetRemindersAfterServiceRecord,
  restoreReminderFromReset,
  presetSlugsToResetForServiceRecord,
} from "./services/reminderReset";
export type { ResetResult } from "./services/reminderReset";

export {
  fetchNotifications,
  getUnreadNotificationCount,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  evaluateAndEmitForUser,
  isThrottled as isNotificationRunThrottled,
  markRun as markNotificationRunDone,
} from "./services/notifications";
export type { EvaluateAndEmitSummary } from "./services/notifications";

export { fetchSystemFlag, isFeatureEnabled, isFeaturesEnabled } from "./services/systemParams";
