import { IRead, IModify, IHttp, IPersistence } from '@rocket.chat/apps-engine/definition/accessors';
import { ISlashCommand, SlashCommandContext } from '@rocket.chat/apps-engine/definition/slashcommands';

export class PollCommand implements ISlashCommand {
    public command = 'poll';
    public i18nDescription = 'Create a poll with options';
    public i18nParamsExample = 'Best language? | C++ | JS | Python';
    public providesPreview = false;

    public async executor(
        context: SlashCommandContext,
        read: IRead,
        modify: IModify,
        http: IHttp,
        persis: IPersistence,
    ): Promise<void> {
        void read;
        void http;
        void persis;

        const rawText = context.getArguments().join(' ').trim();
        const sender = context.getSender();

        if (!rawText) {
            const usage = 'Usage: /poll Question? | Option 1 | Option 2';
            const msgBuilder = modify.getCreator()
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
            const msgBuilder = modify.getCreator()
                .startMessage()
                .setText(usage)
                .setRoom(context.getRoom())
                .setSender(sender)
                .setGroupable(false);
            const msg = modify.getCreator().finish(msgBuilder);
            await modify.getNotifier().notifyUser(sender, msg as any);
            return;
        }

        const pollText = [
            `📊 ${question}`,
            ...options.map((option, index) => `${index + 1}. ${option}`),
        ].join('\n');

        const msgBuilder = modify.getCreator()
            .startMessage()
            .setText(pollText)
            .setRoom(context.getRoom())
            .setSender(sender);
        await modify.getCreator().finish(msgBuilder);
    }
}
