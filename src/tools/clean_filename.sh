#!/bin/sh

rename 's/ /_/g' "$*"
new_filename=`echo "$*" | sed -E 's/ /_/g'`
#rename 's/[()]//g' "$new_filename"
rename 's/_-//g' "$new_filename"