import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';
import { runAppActivityPingIfEligible } from '@/utils/appActivityPing';
import { fileLogger } from '@/utils/fileLogger';

export const APP_ACTIVITY_BG_FETCH_TASK = 'odyssea-app-activity-ping';

TaskManager.defineTask(APP_ACTIVITY_BG_FETCH_TASK, async () => {
  try {
    const result = await runAppActivityPingIfEligible();
    if (__DEV__ && result.sent) {
      console.log('[AppActivityPingTask] Sent activity ping:', result.reason);
    }
    return result.sent
      ? BackgroundFetch.BackgroundFetchResult.NewData
      : BackgroundFetch.BackgroundFetchResult.NoData;
  } catch (e) {
    fileLogger.error('AppActivityPingTask', 'TASK_ERROR', {
      error: e instanceof Error ? e.message : String(e),
    });
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

export async function registerAppActivityBackgroundFetch(): Promise<void> {
  try {
    const status = await BackgroundFetch.getStatusAsync();
    if (status !== BackgroundFetch.BackgroundFetchStatus.Available) {
      if (__DEV__) {
        console.log('[AppActivityPingTask] Background fetch not available:', status);
      }
      return;
    }
    await BackgroundFetch.registerTaskAsync(APP_ACTIVITY_BG_FETCH_TASK, {
      minimumInterval: 10 * 60,
      stopOnTerminate: false,
      startOnBoot: true,
    });
    if (__DEV__) {
      console.log('[AppActivityPingTask] Registered background fetch');
    }
  } catch (e) {
    fileLogger.error('AppActivityPingTask', 'REGISTER_FAILED', {
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

export async function unregisterAppActivityBackgroundFetch(): Promise<void> {
  try {
    await BackgroundFetch.unregisterTaskAsync(APP_ACTIVITY_BG_FETCH_TASK);
  } catch {
    // ignore
  }
}
