import { useEffect, useRef } from 'react';
import { Alert, type AlertButton } from 'react-native';
import Constants from 'expo-constants';
import { router, type Href } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { getSetting, setSetting } from '@/data/artworkRepository';
import { UPGRADE_BACKUP_NOTICE_KEY } from '@/data/database';
import { TRIAL_MONTHS, useEntitlements } from '@/entitlements';
import {
  dueTrialNotice,
  loadShownTrialNotices,
  markTrialNoticesShown,
  type TrialNotice,
  type TrialRecord,
} from '@/entitlements/trial';

type Notice = {
  title: string;
  body: string;
  buttons: Array<AlertButton & { endsSequence?: boolean }>;
};

const openBackup = (): void => {
  router.push({ pathname: '/(tabs)/settings', params: { focus: 'backup', at: String(Date.now()) } } as Href);
};

const openVipRedeem = (): void => {
  router.push('/vip-redeem' as Href);
};

const formatDate = (iso: string): string =>
  new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });

const AFTER_TRIAL =
  'Afterwards your catalog stays free to use, issued certificates can still be shared and printed, and Restore from Drive keeps working.';

export function trialNoticeContent(notice: TrialNotice, trial: TrialRecord, daysLeft: number | null): Notice {
  const ends = formatDate(trial.ends_at);
  switch (notice) {
    case 'welcome':
      return {
        title: `Premium is free for ${TRIAL_MONTHS} months`,
        body:
          `Every Premium feature is unlocked on this phone until ${ends}: Google Drive backup and restore, ` +
          'Certificates of Authenticity, portfolio PDF and more. No payment or sign-up needed.\n\n' +
          'After the trial, full service requires a Premium subscription; your catalog itself stays free. ' +
          'Back up to Google Drive regularly so your catalog is protected.',
        buttons: [{ text: 'Got it' }],
      };
    case 'ending-28':
    case 'ending-14':
    case 'ending-7':
    case 'ending-1':
      return {
        title:
          daysLeft !== null && daysLeft <= 1
            ? 'Free Premium ends tomorrow'
            : `Free Premium ends in ${daysLeft ?? 7} days`,
        body:
          `Your free ${TRIAL_MONTHS}-month Premium trial ends on ${ends}. After that, full service — Google Drive ` +
          'backup, new Certificates of Authenticity, portfolio PDF and other Premium features — requires a Premium ' +
          `subscription.\n\n${AFTER_TRIAL}\n\nBack up to Google Drive before the trial ends.`,
        buttons: [
          { text: 'Later', style: 'cancel' },
          { text: 'Redeem VIP code', onPress: openVipRedeem, endsSequence: true },
          { text: 'Back up now', onPress: openBackup, endsSequence: true },
        ],
      };
    case 'ended':
      return {
        title: 'Your free Premium trial has ended',
        body:
          'Your catalog is still yours and free to use. Issued certificates can still be shared and printed, ' +
          'and Restore from Drive keeps working.\n\n' +
          'Full service — Drive backup, new certificates and other Premium features — now requires a Premium ' +
          'subscription or a VIP code.',
        buttons: [
          { text: 'OK', style: 'cancel' },
          { text: 'Redeem VIP code', onPress: openVipRedeem, endsSequence: true },
        ],
      };
  }
}

function upgradeBackupNotice(): Notice {
  const version = Constants.expoConfig?.version ?? 'this version';
  return {
    title: `ArtCloset ${version} — back up now`,
    body:
      'Your artworks are safe. This update upgraded your catalog for Certificates of Authenticity.\n\n' +
      `Back up to Google Drive now. Backups made from now on can only be restored on ArtCloset ${version} or newer, so update ArtCloset on any other phone you restore to.`,
    buttons: [
      { text: 'Later', style: 'cancel' },
      { text: 'Back up now', onPress: openBackup, endsSequence: true },
    ],
  };
}

/** Shows notices one at a time; a button that navigates away ends the sequence. */
function showInSequence(notices: Notice[], index = 0): void {
  const notice = notices[index];
  if (!notice) return;
  const next = (): void => showInSequence(notices, index + 1);
  Alert.alert(
    notice.title,
    notice.body,
    notice.buttons.map(({ endsSequence, onPress, ...button }) => ({
      ...button,
      onPress: () => {
        onPress?.();
        if (!endsSequence) next();
      },
    })),
    { cancelable: true, onDismiss: next },
  );
}

/**
 * One-time startup messages: the free Premium trial (welcome, ending soon, ended) and the
 * "back up now" prompt after an update upgrades the catalog (newer backups need this version).
 */
export function StartupNotices(): null {
  const database = useSQLiteContext();
  const { ready, can, isPremiumActive, trial, trialDaysLeft, redemption } = useEntitlements();
  const checked = useRef(false);

  useEffect(() => {
    if (!ready || checked.current) return;
    checked.current = true;
    void (async () => {
      const notices: Notice[] = [];
      try {
        const due = dueTrialNotice({
          trial,
          shown: await loadShownTrialNotices(),
          vipExpiry: redemption?.expiry_date ?? null,
        });
        if (due && trial) {
          await markTrialNoticesShown(due.covers);
          notices.push(trialNoticeContent(due.notice, trial, trialDaysLeft));
        }
      } catch {
        // Best-effort; never block opening the catalog.
      }
      try {
        if ((await getSetting(database, UPGRADE_BACKUP_NOTICE_KEY)) === 'pending') {
          await setSetting(database, UPGRADE_BACKUP_NOTICE_KEY, 'shown');
          const row = await database.getFirstAsync<{ c: number }>(
            'SELECT COUNT(*) AS c FROM artworks WHERE deleted_at IS NULL',
          );
          if (isPremiumActive && can('CAN_USE_GOOGLE_DRIVE_BACKUP') && (row?.c ?? 0) > 0) {
            notices.push(upgradeBackupNotice());
          }
        }
      } catch {
        // Best-effort; never block opening the catalog.
      }
      showInSequence(notices);
    })();
  }, [can, database, isPremiumActive, ready, redemption, trial, trialDaysLeft]);

  return null;
}
