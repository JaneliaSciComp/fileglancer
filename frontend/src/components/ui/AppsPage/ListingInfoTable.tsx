import FgExternalLink from '@/components/designSystem/atoms/FgExternalLink';
import type { AppListing } from '@/shared.types';
import { formatDateString } from '@/utils';
import { parseGithubUrl } from '@/utils/appUrls';

/**
 * The revision actually cloned, parsed out of the canonical listing URL (which
 * always carries it). Falls back to the requested branch, then null.
 */
function listingRevision(listing: AppListing): string | null {
  try {
    return parseGithubUrl(listing.url).branch;
  } catch {
    return listing.branch || null;
  }
}

export default function ListingInfoTable({
  listing
}: {
  readonly listing: AppListing;
}) {
  const labelClass =
    'text-foreground font-medium pr-4 py-1.5 align-top whitespace-nowrap';
  const valueClass = 'text-foreground py-1.5';

  const publishedAt = formatDateString(listing.published_at);
  const revision = listingRevision(listing);

  return (
    <table className="w-full text-sm mb-6">
      <tbody>
        <tr>
          <td className={labelClass}>URL</td>
          <td className="py-1.5">
            <FgExternalLink className="break-all" href={listing.url}>
              {listing.url}
            </FgExternalLink>
          </td>
        </tr>
        {revision ? (
          <tr>
            <td className={labelClass}>Revision</td>
            <td className={valueClass}>{revision}</td>
          </tr>
        ) : null}
        <tr>
          <td className={labelClass}>Shared by</td>
          <td className={valueClass}>
            {listing.owner_username} on {publishedAt}
          </td>
        </tr>
        {listing.description ? (
          <tr>
            <td className={labelClass}>Description</td>
            <td className={valueClass}>{listing.description}</td>
          </tr>
        ) : null}
      </tbody>
    </table>
  );
}
