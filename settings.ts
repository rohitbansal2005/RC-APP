import { ISetting, SettingType } from '@rocket.chat/apps-engine/definition/settings';

export const settings: Array<ISetting> = [
    {
        id: 'externalLogger',
        type: SettingType.STRING,
        packageValue: '',
        required: false,
        public: false,
        i18nLabel: 'External Logger',
        i18nDescription: 'URL for external logging endpoint. If set, messages will be sent to this endpoint.'
    }
];
