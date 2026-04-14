#!/bin/bash
cd /home/ec2-user/app
npm ci --production 2>&1 | tail -3
npm run build 2>&1 | tail -3
