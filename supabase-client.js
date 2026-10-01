import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.58.0/+esm";

export const SUPABASE_URL = "https://olvetzzzkwryluedlhpv.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_uPvvkq4crljdH3GyZ4CK0Q_UV-kzMOQ";
export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
