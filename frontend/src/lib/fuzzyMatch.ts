// Similitud difusa basada en Dice coefficient sobre bigramas normalizados.
// Buen comportamiento con nombres de productos (variaciones en orden, unidades, acentos).

export function normalize(s: string): string {
    return (s || '')
        .toLowerCase()
        .normalize('NFD').replace(/\p{Mn}/gu, '')  // remover acentos (marcas combinantes)
        .replace(/[^a-z0-9\s]/g, ' ')              // remover puntuación
        .replace(/\s+/g, ' ')                      // colapsar espacios
        .trim();
}

function bigrams(s: string): Map<string, number> {
    const map = new Map<string, number>();
    if (s.length < 2) return map;
    for (let i = 0; i < s.length - 1; i++) {
        const bg = s.slice(i, i + 2);
        map.set(bg, (map.get(bg) || 0) + 1);
    }
    return map;
}

export function diceCoefficient(a: string, b: string): number {
    const na = normalize(a);
    const nb = normalize(b);
    if (!na || !nb) return 0;
    if (na === nb) return 1;

    const bgA = bigrams(na);
    const bgB = bigrams(nb);
    if (bgA.size === 0 || bgB.size === 0) return 0;

    let intersection = 0;
    bgA.forEach((countA, bg) => {
        const countB = bgB.get(bg);
        if (countB) intersection += Math.min(countA, countB);
    });

    const totalA = Array.from(bgA.values()).reduce((s, n) => s + n, 0);
    const totalB = Array.from(bgB.values()).reduce((s, n) => s + n, 0);
    return (2 * intersection) / (totalA + totalB);
}

export interface ScoredMatch<T> {
    item: T;
    score: number;
}

export function findMatches<T>(
    query: string,
    candidates: T[],
    getText: (c: T) => string,
    threshold: number,
    maxResults = 5,
): ScoredMatch<T>[] {
    if (!query.trim()) return [];
    return candidates
        .map(item => ({ item, score: diceCoefficient(query, getText(item)) }))
        .filter(m => m.score >= threshold)
        .sort((a, b) => b.score - a.score)
        .slice(0, maxResults);
}

export function bestMatch<T>(
    query: string,
    candidates: T[],
    getText: (c: T) => string,
): ScoredMatch<T> | null {
    if (!query.trim() || candidates.length === 0) return null;
    let best: ScoredMatch<T> | null = null;
    for (const item of candidates) {
        const score = diceCoefficient(query, getText(item));
        if (!best || score > best.score) best = { item, score };
    }
    return best;
}

// Score unilateral: fracción de bigramas del query encontrados en el target.
// A diferencia de Dice (simétrico), no penaliza cuando el query es más corto
// que el nombre del catálogo — ideal para sugerencias en tiempo real mientras
// el usuario escribe palabras parciales.
export function partialScore(query: string, target: string): number {
    const nq = normalize(query);
    const nt = normalize(target);
    if (!nq || !nt || nq.length < 3) return 0;
    if (nt.includes(nq)) return 1;
    const bgQ = bigrams(nq);
    const bgT = bigrams(nt);
    if (bgQ.size === 0) return 0;
    let intersection = 0;
    bgQ.forEach((countQ, bg) => {
        const countT = bgT.get(bg);
        if (countT) intersection += Math.min(countQ, countT);
    });
    const totalQ = Array.from(bgQ.values()).reduce((s, n) => s + n, 0);
    return totalQ > 0 ? intersection / totalQ : 0;
}

export function findMatchesPartial<T>(
    query: string,
    candidates: T[],
    getText: (c: T) => string,
    threshold = 0.6,
    maxResults = 5,
): ScoredMatch<T>[] {
    if (!query.trim() || normalize(query).length < 3) return [];
    return candidates
        .map(item => ({ item, score: partialScore(query, getText(item)) }))
        .filter(m => m.score >= threshold)
        .sort((a, b) => b.score - a.score)
        .slice(0, maxResults);
}

// Returns how many normalized words from `query` (length >= minWordLen) appear
// as substrings in the normalized `target`. Used to require a minimum number of
// shared words before triggering controlled-material enforcement.
export function sharedWordCount(query: string, target: string, minWordLen = 3): number {
    const nq = normalize(query);
    const nt = normalize(target);
    const words = nq.split(/\s+/).filter(w => w.length >= minWordLen);
    return words.filter(w => nt.includes(w)).length;
}
