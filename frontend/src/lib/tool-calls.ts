


export interface ToolCall {
    name?: unknown;
    input?: unknown;
    args?: unknown;
}


export function describeToolCall(raw: unknown): string {
    if (raw === null || raw === undefined) return 'Used a tool';

    let parsed: unknown = raw;

    if (typeof raw === 'string') {
        const trimmed = raw.trim();
        if (!trimmed) return 'Used a tool';
        try {
            parsed = JSON.parse(trimmed);
        } catch {


            return trimmed;
        }
    }

    if (typeof parsed === 'string') {
        const trimmed = parsed.trim();
        return trimmed || 'Used a tool';
    }

    if (!parsed || typeof parsed !== 'object') {
        return 'Used a tool';
    }

    const obj = parsed as ToolCall;
    const name = typeof obj.name === 'string' && obj.name ? obj.name : null;


    const rawInput = obj.input !== undefined ? obj.input : obj.args;
    let detail = '';
    if (rawInput && typeof rawInput === 'object') {
        const first = Object.values(rawInput as Record<string, unknown>).find(
            (v) => typeof v === 'string' || typeof v === 'number',
        );
        if (first !== undefined) detail = String(first);
    } else if (typeof rawInput === 'string') {
        detail = rawInput;
    }

    if (!name) {

        return detail ? detail : 'Used a tool';
    }

    return detail ? `${name}: ${detail}` : name;
}


export function describeMessageToolCalls(toolCalls: unknown): string[] {
    if (!toolCalls || typeof toolCalls !== 'object') return [];

    const obj = toolCalls as { toolCalls?: unknown; name?: unknown; input?: unknown };
    const list = Array.isArray(obj.toolCalls)
        ? obj.toolCalls
        :
          obj.name !== undefined || obj.input !== undefined
          ? [obj]
          : [];

    return list
        .map((entry) => describeToolCall(entry))
        .filter((label) => label.length > 0);
}
