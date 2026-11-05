'use client';

import { ChevronDown, FileText } from 'lucide-react';
import { PendingLink as Link } from '@/components/app/pending-link';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/**
 * One split button (design "Web · staff page, what we owe"): View statement goes straight to what
 * is owed now, the arrow beside it offers Historical, everything since joining.
 */
export function StatementButton({
  staffId,
  label,
  moreLabel,
  historical,
  historicalHint,
}: {
  staffId: string;
  label: string;
  moreLabel: string;
  historical: string;
  historicalHint: string;
}) {
  return (
    <div className="inline-flex">
      <Button asChild variant="outline" className="rounded-r-none">
        <Link href={`/statements/${staffId}`}>
          <FileText aria-hidden="true" />
          {label}
        </Link>
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            aria-label={moreLabel}
            className="rounded-l-none border-l-0"
          >
            <ChevronDown aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem asChild className="flex-col items-start gap-0">
            <Link href={`/statements/${staffId}?view=historical`}>
              <span className="font-semibold">{historical}</span>
              <span className="text-xs text-[var(--ink-muted)]">{historicalHint}</span>
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
