#!/bin/bash
set -e
cd /home/ec2-user/app
npm ci 2>&1 | tail -3
npm run build 2>&1 | tail -5
