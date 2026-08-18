
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js?v=17_0';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
