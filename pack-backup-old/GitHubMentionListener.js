"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GitHubMentionListener = void 0;
const metadata_1 = require("@rocket.chat/apps-engine/definition/metadata");
class GitHubMentionListener {
    async executePostMessageSent(message, read, http, persistence, modify) {
        const text = message.text;
        const mentions = message.mentions || [];
        const userToTrack = 'rohitbansal2005';
        if (!mentions.find((u) => u.username === userToTrack))
            return;
        const assoc = new metadata_1.RocketChatAssociationRecord(metadata_1.RocketChatAssociationModel.USER, message.sender.id);
        const userStatusArr = await read.getPersistenceReader().readByAssociation(assoc);
        const userStatus = userStatusArr && userStatusArr[0] ? userStatusArr[0] : {};
        const isOn = userStatus && userStatus.on === true;
        const externalLogger = await read.getEnvironmentReader().getSettings().getValueById('externalLogger');
        let ephemeralText = `Thank you for mentioning me, ${message.sender.username}`;
        if (externalLogger && isOn) {
            try {
                const res = await http.post(externalLogger, {
                    data: {
                        userid: message.sender.id,
                        message: text,
                    },
                });
                ephemeralText = `${res.data.result} [${res.data.id}]`;
            }
            catch (e) {
                console.error('External Logger failed', e);
            }
        }
        if (isOn) {
            const msgBuilder = modify.getCreator().startMessage().setText(ephemeralText).setRoom(message.room).setSender(message.sender).setGroupable(false);
            const msg = modify.getCreator().finish(msgBuilder);
            await modify.getNotifier().notifyUser(message.sender, msg);
        }
    }
}
exports.GitHubMentionListener = GitHubMentionListener;
