import { useRouter } from 'expo-router';
import { Screen, PushedHeader } from '@/ui/Screen';
import { EmptyState } from '@/ui/States';

/**
 * Reached when a deep link points at a route MOVA does not have — usually an
 * old share link, or a token address that has since been removed.
 */
export default function NotFoundScreen() {
  const router = useRouter();

  return (
    <Screen>
      <PushedHeader title="Not found" />
      <EmptyState
        emoji="🧭"
        title="That page does not exist"
        message="The link may be out of date, or the token it pointed at is no longer being tracked."
        actionLabel="Go to Home"
        onAction={() => router.replace('/')}
      />
    </Screen>
  );
}
