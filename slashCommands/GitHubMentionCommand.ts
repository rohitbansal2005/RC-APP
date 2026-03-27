import { ISlashCommand, SlashCommandContext } from '@rocket.chat/apps-engine/definition/slashcommands';
import { IModify } from '@rocket.chat/apps-engine/definition/accessors';

export class GitHubMentionCommand implements ISlashCommand {
    public command = 'rohitbansal2005';
    public i18nDescription = 'Toggle mention logging';
    public i18nParamsExample = 'on/off';
    public providesPreview = false;

    public async executor(context: SlashCommandContext, read: any, modify: IModify, http: any, persis: any) {
        const args = context.getArguments();
        if (!args.length) return;

        const status = args[0].toLowerCase();
        const userId = context.getSender().id;

        if (status === 'on') {
            await persis.update({ userId }, { on: true }, true);
            const msg = modify.getCreator().finish(modify.getCreator().startMessage().setText('Mention logging is ON'));
            await modify.getNotifier().notifyUser(context.getSender(), msg as any);
        } else if (status === 'off') {
            await persis.update({ userId }, { on: false }, true);
            const msg = modify.getCreator().finish(modify.getCreator().startMessage().setText('Mention logging is OFF'));
            await modify.getNotifier().notifyUser(context.getSender(), msg as any);
        }
    }
}
