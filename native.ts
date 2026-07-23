/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { BrowserWindow, IpcMainInvokeEvent } from "electron";

export function setContentProtection(event: IpcMainInvokeEvent, enable: boolean) {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return false;

    win.setContentProtection(enable);
    return true;
}
