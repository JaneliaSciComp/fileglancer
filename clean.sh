#!/usr/bin/env bash

clean_dir() {
    local dir=$1
    local random_num=$RANDOM
    local temp_dir="${dir}_${random_num}_deleting"
    
    # Rename directory if it exists
    if [ -d "$dir" ]; then
        mv "$dir" "$temp_dir"
        if [ $? -ne 0 ]; then
            echo "Failed to rename $dir to $temp_dir"
            return 1
        fi
        rm -rf "$temp_dir" &
    fi
}

rm -f fileglancer/_version.py || true
clean_dir ".pixi/envs" || true
clean_dir ".pixi/solve-group-envs" || true
clean_dir "fileglancer/labextension" || true
clean_dir "frontend/node_modules" || true
echo "Cleaned up dev environment."
