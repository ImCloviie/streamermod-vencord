/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType, PluginNative } from "@utils/types";
import { UserStore } from "@webpack/common";

const Native = VencordNative.pluginHelpers.StreamerMod as PluginNative<typeof import("./native")>;

let isHidden = false;
let observer: MutationObserver | null = null;
let styleEl: HTMLStyleElement | null = null;

function setHidden(value: boolean) {
    if (isHidden === value) return;

    Native.setContentProtection(value).then(ok => {
        if (ok) {
            isHidden = value;
            updateButtonState();
            console.log(`[StreamerMod] Content protection ${value ? "ON" : "OFF"}`);
        } else {
            console.error("[StreamerMod] Failed to set content protection — window not found");
        }
    });
}

function updateButtonState() {
    const btn = document.getElementById("streamermod-toggle-btn");
    if (!btn) return;

    const svg = btn.querySelector("svg");
    if (svg) {
        svg.style.color = isHidden ? settings.store.colorOn : settings.store.colorOff;
        svg.style.opacity = "1";
    }
    btn.title = isHidden ? "StreamerMod: ON — Discord скрыт от захвата" : "StreamerMod: OFF";
    btn.setAttribute("aria-label", isHidden ? "StreamerMod: ON" : "StreamerMod: OFF");
}

function findPanelButtonsRow(): Element | null {
    // Strategy 1: Find via aria-label on the settings gear button
    // Discord's settings button has a known aria-label
    const settingsBtn = document.querySelector('[aria-label="User Settings"], [aria-label="Настройки пользователя"], [aria-label*="Settings"]');
    if (settingsBtn?.parentElement) return settingsBtn.parentElement;

    // Strategy 2: Find the panels section at the bottom-left
    const panels = document.querySelector('[class*="panels_"]');
    if (panels) {
        // The buttons row contains multiple <button> elements (mic, deafen, settings)
        const allDivs = panels.querySelectorAll("div");
        for (const div of allDivs) {
            const buttons = div.querySelectorAll(":scope > button");
            if (buttons.length >= 2 && buttons.length <= 4) {
                return div;
            }
        }
    }

    // Strategy 3: Find buttons with known SVG paths (mic/deafen icons)
    const allButtons = document.querySelectorAll("button");
    for (const btn of allButtons) {
        const svg = btn.querySelector('path[d*="M6.7 11H5C5"]'); // Microphone icon path prefix
        if (svg) {
            return btn.parentElement;
        }
    }

    return null;
}

function injectButton() {
    if (document.getElementById("streamermod-toggle-btn")) return;

    const buttonsRow = findPanelButtonsRow();
    if (!buttonsRow) return;

    // Create our toggle button matching Discord's style
    const btn = document.createElement("button");
    btn.id = "streamermod-toggle-btn";
    btn.className = "streamermod-panel-btn";
    btn.setAttribute("aria-label", isHidden ? "StreamerMod: ON" : "StreamerMod: OFF");
    btn.title = isHidden ? "StreamerMod: ON — Discord скрыт от захвата" : "StreamerMod: OFF";

    // Shield icon SVG
    btn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" style="color: ${isHidden ? settings.store.colorOn : settings.store.colorOff}; opacity: 1;">
        <path fill="currentColor" d="M12 2L4 5.5V11.5C4 17.07 7.41 22.18 12 23.5C16.59 22.18 20 17.07 20 11.5V5.5L12 2ZM12 11.99H18C17.47 16.69 15.18 20.84 12 22.43V12H6V6.69L12 4.15V11.99Z"/>
    </svg>`;

    btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        setHidden(!isHidden);
    });

    // Insert before the last button (settings gear) so it's between deafen and settings
    const settingsButton = buttonsRow.lastElementChild;
    if (settingsButton) {
        buttonsRow.insertBefore(btn, settingsButton);
    } else {
        buttonsRow.appendChild(btn);
    }
}

function injectStyles() {
    if (document.getElementById("streamermod-styles")) return;

    styleEl = document.createElement("style");
    styleEl.id = "streamermod-styles";
    styleEl.textContent = `
        .streamermod-panel-btn {
            position: relative;
            display: flex;
            align-items: center;
            justify-content: center;
            width: 32px;
            height: 32px;
            border: none;
            border-radius: 4px;
            background: transparent;
            cursor: pointer;
            color: var(--interactive-normal);
            transition: background-color 0.15s ease, color 0.15s ease;
        }
        .streamermod-panel-btn:hover {
            background: var(--background-modifier-hover);
            color: var(--interactive-hover);
        }
        .streamermod-panel-btn svg {
            transition: color 0.2s ease;
        }
    `;
    document.head.appendChild(styleEl);
}

interface StreamEvent {
    streamKey: string;
}

const settings = definePluginSettings({
    autoHideOnStream: {
        description: "Автоматически скрывать Discord при начале стрима (Go Live)",
        type: OptionType.BOOLEAN,
        default: false,
    },
    colorOn: {
        description: "Цвет кнопки когда защита ВКЛЮЧЕНА (hex)",
        type: OptionType.STRING,
        default: "#3ba55d",
    },
    colorOff: {
        description: "Цвет кнопки когда защита ВЫКЛЮЧЕНА (hex)",
        type: OptionType.STRING,
        default: "#ed4245",
    },
});

export default definePlugin({
    name: "StreamerMod",
    description: "Скрывает Discord от захвата экрана (демка, OBS, запись). Ты видишь Discord, но на записи его нет. Как в AyuGram.",
    tags: ["Privacy", "Utility"],
    authors: [{
        name: "imcloviie",
        id: 0n
    }],

    settings,

    toolboxActions: {
        "StreamerMod: Toggle"() {
            setHidden(!isHidden);
        }
    },

    flux: {
        STREAM_CREATE(event: StreamEvent) {
            if (!settings.store.autoHideOnStream) return;
            if (!event.streamKey.endsWith(UserStore.getCurrentUser().id)) return;
            setHidden(true);
        },
        STREAM_DELETE(event: StreamEvent) {
            if (!settings.store.autoHideOnStream) return;
            if (!event.streamKey.endsWith(UserStore.getCurrentUser().id)) return;
            setHidden(false);
        }
    },

    start() {
        isHidden = false;
        injectStyles();

        // Try to inject button immediately
        injectButton();

        // Watch for DOM changes to re-inject if needed (Discord re-renders panels)
        observer = new MutationObserver(() => {
            if (!document.getElementById("streamermod-toggle-btn")) {
                injectButton();
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        console.log("[StreamerMod] Plugin started");
    },

    stop() {
        if (isHidden) {
            setHidden(false);
        }

        observer?.disconnect();
        observer = null;

        document.getElementById("streamermod-toggle-btn")?.remove();
        document.getElementById("streamermod-styles")?.remove();
        styleEl = null;

        console.log("[StreamerMod] Plugin stopped");
    }
});
