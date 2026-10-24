import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@fincrew/db';

/** Any signed-in Supabase client (website server client or the Android app's client). */
export type Supabase = SupabaseClient<Database>;
