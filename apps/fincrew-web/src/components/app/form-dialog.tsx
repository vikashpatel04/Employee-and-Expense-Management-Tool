'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { cn } from 'cn';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

const CloseContext = createContext<(() => void) | null>(null);

/**
 * A task in a dialog (add, edit, give, pay…): the page shows a button, the form opens over it.
 * It closes by itself when the form reports success (`useDialogDone`) or when the save moves
 * the page to a new address (forms that redirect, e.g. `?saved=`).
 */
export function FormDialog({
  title,
  description,
  trigger,
  variant = 'outline',
  size,
  wide = false,
  triggerClassName,
  children,
}: {
  title: string;
  description?: string;
  /** Button content (icon + label). */
  trigger: ReactNode;
  variant?: ComponentProps<typeof Button>['variant'];
  size?: ComponentProps<typeof Button>['size'];
  /** Wider dialog for long forms. */
  wide?: boolean;
  triggerClassName?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const where = `${pathname}?${search}`;
  const openedAt = useRef(where);

  useEffect(() => {
    if (!open) openedAt.current = where;
    else if (where !== openedAt.current) setOpen(false);
  }, [where, open]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={variant} size={size} className={triggerClassName}>
          {trigger}
        </Button>
      </DialogTrigger>
      <DialogContent
        className={cn('max-h-[90svh] overflow-y-auto', wide ? 'sm:max-w-2xl' : 'sm:max-w-md')}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <CloseContext.Provider value={close}>{children}</CloseContext.Provider>
      </DialogContent>
    </Dialog>
  );
}

/**
 * In a form inside `FormDialog`: when the action's state says `done`, show it as a toast and
 * close the dialog. Outside a dialog it only shows the toast.
 */
export function useDialogDone(state: object | null | undefined) {
  const close = useContext(CloseContext);
  const handled = useRef<object | null | undefined>(null);
  useEffect(() => {
    // Each save returns a new state object, so the same message twice still fires, once.
    if (handled.current === state) return;
    handled.current = state;
    const done = (state as { done?: unknown } | null | undefined)?.done;
    if (typeof done !== 'string' || !done) return;
    toast.success(done);
    close?.();
  }, [state, close]);
}

/** The dialog's close function (null outside a dialog), e.g. for a Cancel button. */
export function useDialogClose() {
  return useContext(CloseContext);
}
