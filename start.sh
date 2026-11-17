#!/bin/bash
[ -f .env ] && source .env
export PATH="./node_modules/.bin:$PATH"
babel-node src/app.js "$@"
