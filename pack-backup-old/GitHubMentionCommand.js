"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GitHubMentionCommand = void 0;
class GitHubMentionCommand {
    constructor() {
        this.command = 'rohitbansal2005';
        this.i18nDescription = 'Toggle mention logging';
        this.i18nParamsExample = 'on/off';
        this.providesPreview = false;
    }
    async executor(context, read, modify, http, persis) {
        const args = context.getArguments();
        if (!args.length)
            return;
        const status = args[0].toLowerCase();
        const userId = context.getSender().id;
        if (status === 'on') {
            await persis.update({ userId }, { on: true }, true);
            const msg = modify.getCreator().finish(modify.getCreator().startMessage().setText('Mention logging is ON'));
            await modify.getNotifier().notifyUser(context.getSender(), msg);
        }
        else if (status === 'off') {
            await persis.update({ userId }, { on: false }, true);
            const msg = modify.getCreator().finish(modify.getCreator().startMessage().setText('Mention logging is OFF'));
            await modify.getNotifier().notifyUser(context.getSender(), msg);
        }
    }
}
exports.GitHubMentionCommand = GitHubMentionCommand;
