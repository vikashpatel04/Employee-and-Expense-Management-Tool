import { PageSkeleton } from '@/components/app/skeletons';

/**
 * Shown in the content area the moment a section link is clicked, while the server loads the
 * page; the sidebar and top bar stay.
 */
export default function Loading() {
  return <PageSkeleton />;
}
