#!/bin/bash
rm -rf .nuxt dist
bun generate
bunx wrangler pages deploy dist --branch main
