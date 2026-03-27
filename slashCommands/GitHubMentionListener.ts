import { IPostMessageSent } from '@rocket.chat/apps-engine/definition/messages';
import { IRead, IHttp, IModify, IPersistence } from '@rocket.chat/apps-engine/definition/accessors';
import { RocketChatAssociationModel, RocketChatAssociationRecord } from '@rocket.chat/apps-engine/definition/metadata';

export class GitHubMentionListener implements IPostMessageSent {
    public async executePostMessageSent(message: any, read: IRead, http: IHttp, persistence: IPersistence, modify: IModify) {
        const text = message.text;
        const mentions = message.mentions || [];
        const userToTrack = 'rohitbansal2005';

        // Check if mentioned
        if (!mentions.find((u: any) => u.username === userToTrack)) return;

        // Use RocketChatAssociationRecord for user association
        const assoc = new RocketChatAssociationRecord(RocketChatAssociationModel.USER, message.sender.id);
        const userStatusArr = await read.getPersistenceReader().readByAssociation(assoc);
        const userStatus: any = userStatusArr && userStatusArr[0] ? userStatusArr[0] : {};
        const isOn = userStatus && userStatus.on === true;

        // Fetch External Logger URL
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
            } catch (e) {
                // Logging not available in listener; fallback to console
                // eslint-disable-next-line no-console
                console.error('External Logger failed', e);
            }
        }

        if (isOn) {
            const msgBuilder = modify.getCreator().startMessage().setText(ephemeralText).setRoom(message.room).setSender(message.sender).setGroupable(false);
            const msg = modify.getCreator().finish(msgBuilder);
            await modify.getNotifier().notifyUser(message.sender, msg as any);
        }
    }
}
