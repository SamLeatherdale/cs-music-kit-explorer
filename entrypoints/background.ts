import { scheduleDriveSync, signOutOfDrive, SYNC_ALARM, syncDriveBackup } from '../lib/drive';
import { slugFromStateKey } from '../lib/storage';

export default defineBackground(() => {
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && Object.keys(changes).some((key) => slugFromStateKey(key))) {
      void scheduleDriveSync();
    }
    if (area === 'local' && changes.mkrDeleted) void scheduleDriveSync();
  });

  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === SYNC_ALARM) void syncDriveBackup();
  });

  browser.runtime.onMessage.addListener((message, sender) => {
    if (sender.id !== browser.runtime.id || !message || typeof message !== 'object' || !('type' in message)) {
      return;
    }
    if (message.type === 'mkr-drive-sync') void syncDriveBackup();
    if (message.type === 'mkr-drive-sign-out') void signOutOfDrive();
  });

  void syncDriveBackup();
});
