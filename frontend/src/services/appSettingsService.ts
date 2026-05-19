import { supabase } from './supabase';

export const SETTING_KEYS = {
    CONTROLLED_SIMILARITY_THRESHOLD: 'controlled_materials_similarity_threshold',
} as const;

const cache = new Map<string, unknown>();

export const appSettingsService = {
    async get<T = unknown>(key: string, fallback: T): Promise<T> {
        if (cache.has(key)) return cache.get(key) as T;
        const { data, error } = await supabase
            .from('app_settings')
            .select('value')
            .eq('key', key)
            .maybeSingle();
        if (error || !data) {
            cache.set(key, fallback);
            return fallback;
        }
        cache.set(key, data.value);
        return data.value as T;
    },

    async set<T = unknown>(key: string, value: T, description?: string): Promise<void> {
        const payload: { key: string; value: T; description?: string } = { key, value };
        if (description !== undefined) payload.description = description;
        const { error } = await supabase
            .from('app_settings')
            .upsert(payload, { onConflict: 'key' });
        if (error) throw error;
        cache.set(key, value);
    },

    invalidate(key?: string) {
        if (key) cache.delete(key);
        else cache.clear();
    },
};
