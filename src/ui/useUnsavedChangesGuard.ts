import { useEffect, useRef } from 'react';
import { Alert } from 'react-native';
import { useNavigation } from 'expo-router';

/**
 * Blocks leaving the current screen when `isDirty` is true, prompting the user
 * to discard or keep editing. Call `allowNextLeave()` before intentional navigations
 * (e.g. after a successful save).
 */
export function useUnsavedChangesGuard(isDirty: boolean, busy = false): { allowNextLeave: () => void } {
  const navigation = useNavigation();
  const allowLeaveRef = useRef(false);

  const allowNextLeave = (): void => {
    allowLeaveRef.current = true;
  };

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (event) => {
      if (allowLeaveRef.current || busy || !isDirty) return;

      event.preventDefault();
      Alert.alert(
        'Discard changes?',
        'You have unsaved edits. Leave without saving?',
        [
          { text: 'Keep editing', style: 'cancel' },
          {
            text: 'Discard',
            style: 'destructive',
            onPress: () => {
              allowLeaveRef.current = true;
              navigation.dispatch(event.data.action);
            },
          },
        ],
      );
    });
    return unsubscribe;
  }, [busy, isDirty, navigation]);

  return { allowNextLeave };
}
