"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RocketappApp = void 0;
const App_1 = require("@rocket.chat/apps-engine/definition/App");
const settings_1 = require("./settings");
const GitHubMentionCommand_1 = require("./slashCommands/GitHubMentionCommand");
const GitHubMentionListener_1 = require("./slashCommands/GitHubMentionListener");
class RocketappApp extends App_1.App {
    constructor(info, logger, accessors) {
        super(info, logger, accessors);
    }
    async extendConfiguration(configuration, environmentRead) {
        await configuration.slashCommands.provideSlashCommand(new GitHubMentionCommand_1.GitHubMentionCommand());
        for (const setting of settings_1.settings) {
            await configuration.settings.provideSetting(setting);
        }
    }
    async executePostMessageSent(message, read, http, persistence, modify) {
        const listener = new GitHubMentionListener_1.GitHubMentionListener();
        await listener.executePostMessageSent(message, read, http, persistence, modify);
    }
}
exports.RocketappApp = RocketappApp;
