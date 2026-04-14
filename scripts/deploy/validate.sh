#!/bin/bash
sleep 5
curl -sf http://localhost:3000/api/v1/health > /dev/null
