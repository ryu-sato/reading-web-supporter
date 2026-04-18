#!/bin/bash

sudo apt -y update

# RTKのインストールと初期化(グローバル設定)
## ~/.claudeが作成されるまで待機
sleep 3
## telemetryを無効化してインストール
export RTK_TELEMETRY_DISABLED=1
curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/refs/heads/master/install.sh | sh
# RTK が TTY を必要とするため、timeout を使用して初期化を試みる
# https://github.com/rtk-ai/rtk/issues/1307
RTK_TELEMETRY_DISABLED=1 timeout 3 rtk init --global --auto-patch || true
