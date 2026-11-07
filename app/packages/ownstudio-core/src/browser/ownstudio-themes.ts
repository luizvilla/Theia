// SPDX-License-Identifier: LGPL-2.1-only
// OwnStudio colour themes, built from OwnTech's brand palette (branding/README.md).
// Proportions follow the guidelines' 40/30/20/10 rule: green dominates the
// chrome, neutral surfaces carry the work, azure marks interaction, yellow
// and persimmon are accents only.

const green = '#234D45';
const greenDark = '#17332E';
const greenLight = '#2F6359';
const yellow = '#F9F77F';
const azure = '#6C8AFF';
const lightAzure = '#B6C9F8';
const persimmon = '#FF6112';

const chrome = {
    'titleBar.activeBackground': green,
    'titleBar.activeForeground': '#FFFFFF',
    'titleBar.inactiveBackground': greenDark,
    'titleBar.inactiveForeground': '#C9D6D3',
    'statusBar.background': green,
    'statusBar.foreground': '#FFFFFF',
    'statusBar.noFolderBackground': green,
    'statusBarItem.hoverBackground': greenLight,
    'activityBar.background': green,
    'activityBar.foreground': yellow,
    'activityBar.inactiveForeground': '#C9D6D3',
    'activityBar.activeBorder': yellow,
    'activityBarBadge.background': yellow,
    'activityBarBadge.foreground': '#000000',
    'button.background': green,
    'button.foreground': '#FFFFFF',
    'button.hoverBackground': greenLight,
    'focusBorder': yellow,
    'textLink.foreground': azure,
    'textLink.activeForeground': azure,
    'progressBar.background': azure,
    'editorWarning.foreground': persimmon,
    'list.warningForeground': persimmon,
    'notificationsWarningIcon.foreground': persimmon,
    'inputValidation.warningBorder': persimmon,
};

export const OWNSTUDIO_LIGHT = {
    id: 'ownstudio-light',
    label: 'OwnStudio Light',
    uiTheme: 'vs' as const,
    json: {
        name: 'OwnStudio Light',
        type: 'light',
        colors: {
            ...chrome,
            'foreground': '#000000',
            'editor.background': '#FFFFFF',
            'editor.foreground': '#000000',
            'sideBar.background': '#F4F6F5',
            'panel.background': '#F4F6F5',
            'editor.selectionBackground': lightAzure,
            'list.activeSelectionBackground': lightAzure,
            'list.activeSelectionForeground': '#000000',
            'list.inactiveSelectionBackground': '#E2E9F9',
            'tab.activeBorderTop': green,
        },
        tokenColors: [],
    },
};

export const OWNSTUDIO_DARK = {
    id: 'ownstudio-dark',
    label: 'OwnStudio Dark',
    uiTheme: 'vs-dark' as const,
    json: {
        name: 'OwnStudio Dark',
        type: 'dark',
        colors: {
            ...chrome,
            'titleBar.activeBackground': greenDark,
            'statusBar.background': greenDark,
            'activityBar.background': greenDark,
            'foreground': '#E8ECEB',
            'editor.background': '#141A19',
            'editor.foreground': '#E8ECEB',
            'sideBar.background': '#1A2321',
            'panel.background': '#1A2321',
            'editor.selectionBackground': '#3A4A7A',
            'list.activeSelectionBackground': '#3A4A7A',
            'list.inactiveSelectionBackground': '#2A3550',
            'tab.activeBorderTop': yellow,
        },
        tokenColors: [],
    },
};
