"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.settings = void 0;
const settings_1 = require("@rocket.chat/apps-engine/definition/settings");
exports.settings = [
    {
        id: 'externalLogger',
        type: settings_1.SettingType.STRING,
        packageValue: '',
        required: false,
        public: false,
        i18nLabel: 'External Logger',
        i18nDescription: 'URL for external logging endpoint. If set, messages will be sent to this endpoint.'
    }
];
