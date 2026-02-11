#!/bin/bash
cd /home/kavia/workspace/code-generation/web-snake-game-217738-217752/snake_game_frontend
npm run build
EXIT_CODE=$?
if [ $EXIT_CODE -ne 0 ]; then
   exit 1
fi

