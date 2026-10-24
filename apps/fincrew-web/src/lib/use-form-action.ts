import { startTransition, useActionState, type FormEvent } from 'react';

/**
 * `useActionState` for a form, submitted through `onSubmit` instead of `<form action>`.
 * React 19 resets a form after its `action` runs, so a refused save (a typo, a rule the server
 * rejects) would wipe everything typed; submitting this way keeps the fields as they were.
 * Use: `const [state, onSubmit, pending] = useFormAction(save, {})` → `<form onSubmit={onSubmit}>`.
 */
export function useFormAction<S>(action: (prev: S, form: FormData) => Promise<S>, initial: S) {
  // States here are plain objects, so Awaited<S> is S.
  const [state, dispatch, pending] = useActionState<S, FormData>(
    action as (prev: Awaited<S>, form: FormData) => Promise<S>,
    initial as Awaited<S>,
  );
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(() => dispatch(data));
  };
  return [state, onSubmit, pending] as const;
}
