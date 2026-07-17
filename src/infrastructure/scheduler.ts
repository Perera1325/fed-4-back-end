import cron from 'node-cron';
import { syncEnergyGenerationRecords } from '../application/background/sync-energy-generation-records';
import { detectAnomalies } from '../application/background/detect-anomalies';

export const initializeScheduler = () => {
  const syncSchedule = process.env.SYNC_CRON_SCHEDULE || '0 0 * * *';

  cron.schedule(syncSchedule, async () => {
    console.log(`[${new Date().toISOString()}] Starting daily energy generation records sync...`);
    try {
      await syncEnergyGenerationRecords();
      console.log(`[${new Date().toISOString()}] Daily sync completed successfully`);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Daily sync failed:`, error);
    }
  });

  console.log(`[Scheduler] Energy generation records sync scheduled for: ${syncSchedule}`);

  const anomalySchedule = process.env.ANOMALY_CRON_SCHEDULE || '15 0 * * *';

  cron.schedule(anomalySchedule, async () => {
    console.log(`[${new Date().toISOString()}] Starting anomaly detection...`);
    try {
      await detectAnomalies();
      console.log(`[${new Date().toISOString()}] Anomaly detection completed successfully`);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Anomaly detection failed:`, error);
    }
  });

  console.log(`[Scheduler] Anomaly detection scheduled for: ${anomalySchedule}`);
};
