import {
    IAppAccessors
} from '@rocket.chat/apps-engine/definition/accessors';

import { App } from '@rocket.chat/apps-engine/definition/App';
import { AppMethod, IAppInfo, RocketChatAssociationModel, RocketChatAssociationRecord } from '@rocket.chat/apps-engine/definition/metadata';
import { IConfigurationExtend, IEnvironmentRead, ILogger, IRead, IHttp, IModify, IPersistence } from '@rocket.chat/apps-engine/definition/accessors';
import { ISlashCommand, SlashCommandContext } from '@rocket.chat/apps-engine/definition/slashcommands';
import { IUIKitInteractionHandler } from '@rocket.chat/apps-engine/definition/uikit';
import { UIKitBlockInteractionContext } from '@rocket.chat/apps-engine/definition/uikit/UIKitInteractionContext';
import { IUIKitResponse } from '@rocket.chat/apps-engine/definition/uikit/IUIKitInteractionType';
import { BlockBuilder } from '@rocket.chat/apps-engine/definition/uikit/blocks';
import { ButtonStyle } from '@rocket.chat/apps-engine/definition/uikit/blocks/Elements';

type PollState = {
    question: string;
    options: string[];
    votesByUserId: Record<string, number>;
};

const POLL_ACTION_ID = 'poll_vote';

const LANGUAGETOOL_CHECK_URL = 'https://api.languagetool.org/v2/check';

type LtMatch = { offset: number; length: number; replacements?: Array<{ value?: string }> };

/**
 * LanguageTool offsets are always relative to the original string.
 * Apply matches in ascending offset order and track length delta so positions stay correct.
 */
function applyLanguageToolCorrections(original: string, matches: LtMatch[]): string {
    const valid = matches.filter(
        (m) =>
            typeof m.offset === 'number' &&
            typeof m.length === 'number' &&
            m.length > 0 &&
            Array.isArray(m.replacements) &&
            m.replacements.length > 0 &&
            typeof m.replacements[0].value === 'string',
    );
    const sorted = [...valid].sort((a, b) => a.offset - b.offset);

    let result = original;
    let delta = 0;

    for (const m of sorted) {
        const rep = m.replacements![0].value as string;
        const start = m.offset + delta;
        const end = start + m.length;
        if (start < 0 || end > result.length) continue;

        result = result.slice(0, start) + rep + result.slice(end);
        delta += rep.length - m.length;
    }
    return result;
}

class GrammarCommand implements ISlashCommand {
    public command = 'grammar';
    public i18nDescription = 'grammar_command_description';
    public i18nParamsExample = 'grammar_command_params_example';
    public providesPreview = false;

    public async executor(
        context: SlashCommandContext,
        _read: IRead,
        modify: IModify,
        http: IHttp,
        _persis: IPersistence,
    ): Promise<void> {
        const sender = context.getSender();
        const room = context.getRoom();

        const ephemeral = async (t: string) => {
            const nb = modify.getNotifier().getMessageBuilder();
            nb.setText(t).setRoom(room).setSender(sender).setGroupable(false);
            await modify.getNotifier().notifyUser(sender, nb.getMessage());
        };

        try {
            const raw = context.getArguments().join(' ').trim().replace(/\s+/g, ' ');
            const text = raw;

            if (!text) {
                await ephemeral('Usage: `/grammar Your English sentence here` — fixes grammar & spelling (powered by LanguageTool).');
                return;
            }
            if (text.length > 8000) {
                await ephemeral('Text is too long (max ~8000 characters). Split into smaller parts.');
                return;
            }

            // Minimal params — `enabledOnly` can make the public API return HTTP 400.
            const body = [`text=${encodeURIComponent(text)}`, 'language=en-US'].join('&');

            let res;
            try {
                res = await http.post(LANGUAGETOOL_CHECK_URL, {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        Accept: 'application/json',
                    },
                    content: body,
                    timeout: 25000,
                });
            } catch {
                await ephemeral('Grammar service is unreachable (network). Check server can reach `api.languagetool.org`.');
                return;
            }

            const parsePayload = (r: typeof res): { matches?: LtMatch[] } | null => {
                const rawData = r.data as unknown;
                if (rawData && typeof rawData === 'object' && !Array.isArray(rawData)) {
                    return rawData as { matches?: LtMatch[] };
                }
                if (typeof rawData === 'string' && rawData.length > 0) {
                    try {
                        return JSON.parse(rawData) as { matches?: LtMatch[] };
                    } catch {
                        /* ignore */
                    }
                }
                if (r.content) {
                    try {
                        return JSON.parse(r.content) as { matches?: LtMatch[] };
                    } catch {
                        /* ignore */
                    }
                }
                return null;
            };

            let payload = parsePayload(res);

            // GET fallback only when POST succeeded but body was not parsed (not on 4xx).
            const postOk = !res.statusCode || (res.statusCode >= 200 && res.statusCode < 300);
            if (!payload && postOk && text.length < 1500) {
                try {
                    const query = `text=${encodeURIComponent(text)}&language=en-US`;
                    const getRes = await http.get(`${LANGUAGETOOL_CHECK_URL}?${query}`, {
                        timeout: 25000,
                        headers: { Accept: 'application/json' },
                    });
                    res = getRes;
                    payload = parsePayload(res);
                } catch {
                    /* ignore */
                }
            }

            const code = res.statusCode;
            if (code === 429) {
                await ephemeral('LanguageTool rate limit — wait a minute and try again, or use shorter text.');
                return;
            }
            if (code && code >= 400) {
                await ephemeral(`Grammar service error (HTTP ${code}). Try again later.`);
                return;
            }
            if (!payload) {
                await ephemeral('Grammar service returned an empty response. If this persists, your server may block outbound HTTPS to api.languagetool.org.');
                return;
            }

            const matches = Array.isArray(payload.matches) ? payload.matches : [];
            const corrected = applyLanguageToolCorrections(text, matches);

            const maxChunk = 3500;
            const clip = (s: string) => (s.length <= maxChunk ? s : `${s.slice(0, maxChunk)}…`);

            let out: string;
            if (corrected === text) {
                out = '✏️ **Grammar check**\n\n_No issues found — looks good._';
            } else {
                out = clip(corrected);
            }

            const maxMsg = 12000;
            if (out.length > maxMsg) {
                out = `${out.slice(0, maxMsg)}\n\n_…truncated (message too long for chat)._`;
            }

            const msgBuilder = modify.getCreator().startMessage().setText(out).setRoom(room).setSender(sender);
            await modify.getCreator().finish(msgBuilder);
        } catch {
            try {
                await ephemeral('`/grammar` crashed — try shorter plain text (no pasted UI). If it repeats, check Rocket.Chat logs.');
            } catch {
                /* avoid rethrow */
            }
        }
    }
}

const ACTIVITY_MAX_PER_PAGE = 100;
const ACTIVITY_DEFAULT_TOTAL = 500;
const ACTIVITY_MAX_TOTAL = 1000;
const ACTIVITY_TOP = 15;

class ActivityCommand implements ISlashCommand {
    public command = 'activity';
    public i18nDescription = 'activity_command_description';
    public i18nParamsExample = 'activity_command_params_example';
    public providesPreview = false;

    public async executor(context: SlashCommandContext, read: IRead, modify: IModify, _http: IHttp, _persis: IPersistence): Promise<void> {
        const sender = context.getSender();
        const room = context.getRoom();
        const roomReader = read.getRoomReader();

        const ephemeral = async (t: string) => {
            const nb = modify.getNotifier().getMessageBuilder();
            nb.setText(t).setRoom(room).setSender(sender).setGroupable(false);
            await modify.getNotifier().notifyUser(sender, nb.getMessage());
        };

        const arg = context.getArguments()[0];
        let totalWanted = ACTIVITY_DEFAULT_TOTAL;
        if (arg !== undefined && arg.trim() !== '') {
            const n = parseInt(arg.trim(), 10);
            if (Number.isFinite(n)) {
                totalWanted = Math.min(ACTIVITY_MAX_TOTAL, Math.max(ACTIVITY_MAX_PER_PAGE, n));
            }
        }

        const pages = Math.ceil(totalWanted / ACTIVITY_MAX_PER_PAGE);
        const all: Array<{ username: string; name?: string; id: string }> = [];

        try {
            for (let p = 0; p < pages; p++) {
                const batch = await roomReader.getMessages(room.id, {
                    limit: ACTIVITY_MAX_PER_PAGE,
                    skip: p * ACTIVITY_MAX_PER_PAGE,
                    sort: { createdAt: 'desc' },
                    showThreadMessages: true,
                });
                if (!batch || batch.length === 0) break;
                for (const m of batch) {
                    const s = m.sender;
                    if (!s || !s.username) continue;
                    if (s.username === 'rocket.cat') continue;
                    all.push({ username: s.username, name: s.name, id: s._id });
                }
                if (batch.length < ACTIVITY_MAX_PER_PAGE) break;
            }
        } catch {
            await ephemeral('Could not read room messages (permission or room type).');
            return;
        }

        if (all.length === 0) {
            await ephemeral('No messages found in this room for activity stats.');
            return;
        }

        const counts = new Map<string, { count: number; username: string; name?: string }>();
        for (const row of all) {
            const key = row.id;
            const cur = counts.get(key);
            if (cur) cur.count += 1;
            else counts.set(key, { count: 1, username: row.username, name: row.name });
        }

        const ranked = [...counts.entries()]
            .map(([, v]) => v)
            .sort((a, b) => b.count - a.count)
            .slice(0, ACTIVITY_TOP);

        const lines = ranked.map((u, i) => {
            const label = u.name && u.name !== u.username ? `${u.name} (@${u.username})` : `@${u.username}`;
            return `${i + 1}. ${label} — *${u.count}* msg(s)`;
        });

        const header = `**Room activity** (last ~${all.length} messages scanned)\n`;
        const out = `${header}\n${lines.join('\n')}`;

        const msgBuilder = modify.getCreator().startMessage().setText(out).setRoom(room).setSender(sender);
        await modify.getCreator().finish(msgBuilder);
    }
}

function buildPollBlocks(appId: string, pollId: string, state: PollState): Array<any> {
    const totalVotes = Object.keys(state.votesByUserId).length;
    const counts = state.options.map(() => 0);
    for (const userId of Object.keys(state.votesByUserId)) {
        const idx = state.votesByUserId[userId];
        if (typeof idx === 'number' && idx >= 0 && idx < counts.length) counts[idx] += 1;
    }

    const bb = new BlockBuilder(appId);
    bb.addSectionBlock({
        text: bb.newMarkdownTextObject(`*📊 ${state.question}*`),
    });

    bb.addSectionBlock({
        text: bb.newMarkdownTextObject(
            state.options
                .map((opt, i) => {
                    const c = counts[i] || 0;
                    const pct = totalVotes > 0 ? Math.round((c / totalVotes) * 100) : 0;
                    return `${i + 1}. *${opt}* — ${c} vote(s) (\`${pct}%\`)`;
                })
                .join('\n'),
        ),
    });

    bb.addActionsBlock({
        elements: state.options.slice(0, 5).map((opt, i) =>
            bb.newButtonElement({
                actionId: POLL_ACTION_ID,
                text: bb.newPlainTextObject(opt),
                value: `${pollId}|${i}`,
                style: ButtonStyle.PRIMARY,
            }),
        ),
    });

    if (state.options.length > 5) {
        bb.addContextBlock({
            elements: [bb.newMarkdownTextObject('_Only first 5 options are clickable right now._')],
        });
    }

    return bb.getBlocks();
}

class PollCommand implements ISlashCommand {
    public command = 'poll';
    public i18nDescription = 'poll_command_description';
    public i18nParamsExample = 'poll_command_params_example';
    public providesPreview = false;
    private readonly appId: string;

    constructor(appId: string) {
        this.appId = appId;
    }

    public async executor(
        context: SlashCommandContext,
        _read: IRead,
        modify: IModify,
        _http: IHttp,
        persis: IPersistence,
    ): Promise<void> {
        const rawText = context.getArguments().join(' ').trim();
        const sender = context.getSender();

        if (!rawText) {
            const usage = 'Usage: /poll Question? | Option 1 | Option 2';
            const nb = modify.getNotifier().getMessageBuilder();
            nb.setText(usage).setRoom(context.getRoom()).setSender(sender).setGroupable(false);
            await modify.getNotifier().notifyUser(sender, nb.getMessage());
            return;
        }

        const parts = rawText
            .split('|')
            .map((part) => part.trim())
            .filter((part) => Boolean(part));

        const question = parts[0];
        const options = parts.slice(1);

        if (!question || options.length < 2) {
            const usage = 'Please provide at least 2 options. Example: /poll Best language? | C++ | JS';
            const nb = modify.getNotifier().getMessageBuilder();
            nb.setText(usage).setRoom(context.getRoom()).setSender(sender).setGroupable(false);
            await modify.getNotifier().notifyUser(sender, nb.getMessage());
            return;
        }

        const initialState: PollState = {
            question,
            options,
            votesByUserId: {},
        };

        const msgBuilder = modify
            .getCreator()
            .startMessage()
            // Only UI Kit blocks will render the poll content (avoid duplicate question line)
            .setText('')
            .setRoom(context.getRoom())
            .setSender(sender);

        const pollMessageId = await modify.getCreator().finish(msgBuilder);
        if (!pollMessageId) return;

        const assoc = new RocketChatAssociationRecord(RocketChatAssociationModel.MESSAGE, pollMessageId);
        await persis.createWithAssociation(initialState, assoc);

        const updater = modify.getUpdater();
        const updateBuilder = await updater.message(pollMessageId, sender);
        updateBuilder.setEditor(sender);
        updateBuilder.setBlocks(buildPollBlocks(this.appId, pollMessageId, initialState));
        await updater.finish(updateBuilder);
    }
}

export class RocketappApp extends App implements IUIKitInteractionHandler {
    constructor(info: IAppInfo, logger: ILogger, accessors: IAppAccessors) {
        super(info, logger, accessors);
    }

    public async extendConfiguration(configuration: IConfigurationExtend, environmentRead: IEnvironmentRead): Promise<void> {
        await configuration.slashCommands.provideSlashCommand(new PollCommand(this.getID()));
        await configuration.slashCommands.provideSlashCommand(new GrammarCommand());
        await configuration.slashCommands.provideSlashCommand(new ActivityCommand());
        void environmentRead;
    }

    public async [AppMethod.UIKIT_BLOCK_ACTION](
        context: UIKitBlockInteractionContext,
        read: IRead,
        http: IHttp,
        persistence: IPersistence,
        modify: IModify,
    ): Promise<IUIKitResponse> {
        void http;

        const data = context.getInteractionData();
        if (!data || data.actionId !== POLL_ACTION_ID) return { success: true };
        if (!data.value || !data.user || !data.message?.id) return { success: true };

        const [pollId, indexRaw] = String(data.value).split('|');
        const optionIndex = Number(indexRaw);
        if (!pollId || !Number.isFinite(optionIndex)) return { success: true };

        const assoc = new RocketChatAssociationRecord(RocketChatAssociationModel.MESSAGE, pollId);
        const existing = await read.getPersistenceReader().readByAssociation(assoc);
        const state = (existing && existing[0]) as PollState | undefined;
        if (!state || !Array.isArray(state.options)) return { success: true };
        if (optionIndex < 0 || optionIndex >= state.options.length) return { success: true };

        const userId = data.user.id;
        const next: PollState = {
            ...state,
            votesByUserId: {
                ...(state.votesByUserId || {}),
                [userId]: optionIndex,
            },
        };

        await persistence.updateByAssociation(assoc, next, true);

        const updater = modify.getUpdater();
        const updateBuilder = await updater.message(pollId, data.user);
        updateBuilder.setEditor(data.user);
        updateBuilder.setBlocks(buildPollBlocks(this.getID(), pollId, next));
        await updater.finish(updateBuilder);

        return { success: true };
    }
}
