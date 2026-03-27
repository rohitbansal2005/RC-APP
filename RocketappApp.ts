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
            const msgBuilder = modify
                .getCreator()
                .startMessage()
                .setText(usage)
                .setRoom(context.getRoom())
                .setSender(sender)
                .setGroupable(false);
            const msg = modify.getCreator().finish(msgBuilder);
            await modify.getNotifier().notifyUser(sender, msg as any);
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
            const msgBuilder = modify
                .getCreator()
                .startMessage()
                .setText(usage)
                .setRoom(context.getRoom())
                .setSender(sender)
                .setGroupable(false);
            const msg = modify.getCreator().finish(msgBuilder);
            await modify.getNotifier().notifyUser(sender, msg as any);
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
