#!/bin/bash

sudo apt -y update

# Claude Code's sandbox dependencies
#   ripgrep (rg): found                                                                                                                                                                                                                                                                                                  
#   bubblewrap (bwrap): not installed                                                                                                                                                                                                                                                                                    
sudo apt -y install bubblewrap
#   socat: not installed
sudo apt -y install socat
#   seccomp filter: not installed (required to block unix domain sockets)
sudo npm install -g @anthropic-ai/sandbox-runtime
#     · or copy vendor/seccomp/* from sandbox-runtime and set
#       sandbox.seccomp.bpfPath and applyPath in settings.json

# RTKのインストールと初期化(グローバル設定)
## ~/.claudeが作成されるまで待機
while [ ! -d "$HOME/.claude" ]; do
  sleep 1
done
## telemetryを無効化してインストール
export RTK_TELEMETRY_DISABLED=1
curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/refs/heads/master/install.sh | sh
# RTK が TTY を必要とするため、timeout を使用して初期化を試みる
# https://github.com/rtk-ai/rtk/issues/1307
RTK_TELEMETRY_DISABLED=1 timeout 3 rtk init --global --auto-patch || true
