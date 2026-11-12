/* SPDX-License-Identifier: LGPL-2.1 */
/** Host-only Zephyr logging stand-in for native control C-Blocks. */
#pragma once
#define LOG_MODULE_DECLARE(...)
#define LOG_MODULE_REGISTER(...)
#define LOG_ERR(...) do {} while (0)
#define LOG_WRN(...) do {} while (0)
#define LOG_INF(...) do {} while (0)
#define LOG_DBG(...) do {} while (0)
